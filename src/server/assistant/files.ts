import "server-only";
import { join, resolve } from "node:path";
import { academicCalendarDocumentId, documentVersionId, initialPaymentDocumentId, parseDocumentVersionId, scholarshipPolicyDocumentId } from "@/contracts/assistant-files";
import type { AssistantDocument, AssistantResponse, AssistantTopic } from "@/contracts/assistant";
import { getPool } from "@/server/db";
import { documentForTopic, publishedDocumentSection, scholarshipPaymentCards, sectionMatchesScope, type DocumentScope } from "./documents";

type Fragment = {
  id: string; revision: string; title: string; number: string; issuedOn: string; hasPdf: boolean;
  position: number; page: number; text: string;
};
const fragmentFields = `d.id, d.revision, d.title, d.number, d.issued_on::text AS "issuedOn",
  d.has_pdf AS "hasPdf", f.position, f.page, f.text`;
const fragmentVector = "to_tsvector('russian'::regconfig, f.text || ' ' || f.keywords)";
const genericSearchWords = "скажите подскажите пожалуйста сколько какой вопрос узнать можно нужно день дней срок";

function fragmentLink(row: Fragment) {
  return {
    label: `${row.title} · № ${row.number}, ${row.hasPdf ? `стр. ${row.page}` : `п. ${row.position}`}`,
    href: `/today/assistant/documents/${documentVersionId(row.id, row.revision)}#section-${row.position}`,
  };
}

export async function searchDocumentFiles(question: string, today: string): Promise<AssistantResponse["cards"]> {
  const { rows } = await getPool().query<Fragment>(`
    WITH terms AS (
      SELECT lexeme
      FROM unnest(tsvector_to_array(to_tsvector('russian'::regconfig, $1))) AS lexeme
      WHERE lexeme <> ALL(tsvector_to_array(to_tsvector('russian'::regconfig, $3)))
    ), search AS (
      SELECT string_agg(quote_literal(lexeme), ' | ')::tsquery AS query,
        least(2, count(*)) AS required_matches
      FROM terms
    ), matches AS (
      SELECT f.document_id, f.position FROM assistant_fragments f CROSS JOIN search
      WHERE ${fragmentVector} @@ search.query
      UNION
      SELECT f.document_id, f.position
      FROM assistant_publications d JOIN assistant_fragments f ON f.document_id = d.id
      CROSS JOIN search
      WHERE d.issued_on <= $2
        AND to_tsvector('russian'::regconfig, d.title || ' ' || d.keywords) @@ search.query
    ), candidates AS (
      SELECT ${fragmentFields},
        ${fragmentVector} AS body,
        to_tsvector('russian'::regconfig, d.title || ' ' || d.keywords) AS metadata
      FROM matches m
      JOIN assistant_fragments f ON f.document_id = m.document_id AND f.position = m.position
      JOIN assistant_publications d ON d.id = f.document_id
      WHERE d.issued_on <= $2
    )
    SELECT candidates.*
    FROM candidates
    CROSS JOIN search
    CROSS JOIN LATERAL (
      SELECT count(*) FILTER (WHERE lexeme = ANY(tsvector_to_array(body || metadata))) AS coverage,
        count(*) FILTER (WHERE lexeme = ANY(tsvector_to_array(body))) AS body_coverage
      FROM terms
    ) rank
    WHERE rank.coverage >= search.required_matches
    ORDER BY rank.coverage DESC, rank.body_coverage DESC, ts_rank(body, search.query) DESC,
      "issuedOn" DESC, id, position
    LIMIT 8
  `, [question, today, genericSearchWords]);
  const byDocument = new Map<string, Fragment[]>();
  for (const row of rows) {
    const fragments = byDocument.get(row.id) ?? [];
    fragments.push(row);
    byDocument.set(row.id, fragments);
  }
  const balanced: Fragment[] = [];
  for (let position = 0; balanced.length < rows.length; position += 1) {
    for (const fragments of byDocument.values()) {
      if (fragments[position]) balanced.push(fragments[position]);
    }
  }
  return balanced.map((row) => ({
    title: row.hasPdf ? `${row.title} · стр. ${row.page}` : row.title,
    text: row.text,
    link: fragmentLink(row),
  }));
}

export async function getScholarshipPayments(scope: DocumentScope, today: string) {
  const { rows } = await getPool().query<Fragment & { month: string; payOn: string }>(`
    SELECT ${fragmentFields}, to_char(p.month, 'YYYY-MM') AS month, p.pay_on::text AS "payOn"
    FROM assistant_scholarship_payments p
    JOIN assistant_publications d ON d.id = p.document_id
    JOIN assistant_fragments f ON f.document_id = p.document_id AND f.position = p.fragment_position
    WHERE d.issued_on <= $1
  `, [today]);
  return scholarshipPaymentCards(rows.map((row) => ({ month: row.month, payOn: row.payOn, link: fragmentLink(row) })), scope, today);
}

export async function getPublishedTopicCards(topics: readonly AssistantTopic[], scope: DocumentScope, today: string) {
  const ids = [...new Set(topics.flatMap((topic) => topic === "scholarship_payment" ? [] : [documentForTopic[topic]]))];
  const [documents, payments] = await Promise.all([
    ids.length ? getPool().query<Fragment>(`
      SELECT ${fragmentFields}
      FROM assistant_publications d JOIN assistant_fragments f ON f.document_id = d.id
      WHERE d.id = ANY($1::text[]) AND d.issued_on <= $2
      ORDER BY d.id, f.position
    `, [ids, today]).then(({ rows }) => rows) : [],
    topics.includes("scholarship_payment") ? getScholarshipPayments(scope, today) : [],
  ]);
  const sections = documents.flatMap((row) => {
    const section = publishedDocumentSection(row.id, row.text);
    return section && sectionMatchesScope(section, scope, row.issuedOn, today) ? [{ row, section }] : [];
  });
  return topics.map((topic) => topic === "scholarship_payment" ? payments : sections
    .filter(({ section }) => section.topic === topic)
    .map(({ row, section }) => ({ title: section.title, text: section.text, link: fragmentLink(row) })));
}

export async function getImportedDocument(id: string, today: string): Promise<AssistantDocument | undefined> {
  const key = id === "scholarship-policy" ? scholarshipPolicyDocumentId : id;
  const version = key === initialPaymentDocumentId || key === scholarshipPolicyDocumentId || key === academicCalendarDocumentId
    ? { key, revision: null } : parseDocumentVersionId(id);
  if (!version) return undefined;
  const { rows } = await getPool().query<Fragment>(`
    SELECT ${fragmentFields}
    FROM assistant_publications d JOIN assistant_fragments f ON d.id = f.document_id
    WHERE d.id = $1 AND ($2::text IS NULL OR d.revision = $2) AND d.issued_on <= $3 ORDER BY f.position
  `, [version.key, version.revision, today]);
  const first = rows[0];
  if (!first) return undefined;
  return {
    id, title: first.title, number: first.number, issuedOn: first.issuedOn,
    pdfHref: first.hasPdf ? `/api/v1/assistant/documents/${documentVersionId(first.id, first.revision)}/pdf` : undefined,
    sections: rows.map((row) => {
      const section = publishedDocumentSection(row.id, row.text);
      return {
        id: String(row.position),
        title: section?.title ?? (row.hasPdf ? `Страница ${row.page}`
          : row.id === initialPaymentDocumentId ? "График выплат" : `Раздел ${row.position}`),
        text: section?.text ?? row.text,
      };
    }),
  };
}

export async function getPublishedPdfPath(id: string, today: string) {
  const version = parseDocumentVersionId(id);
  if (!version) return undefined;
  const { rowCount } = await getPool().query(`
    SELECT 1 FROM assistant_publications WHERE id = $1 AND revision = $2 AND issued_on <= $3 AND has_pdf
  `, [version.key, version.revision, today]);
  if (!rowCount) return undefined;
  const root = resolve(/* turbopackIgnore: true */ process.env.ASSISTANT_DOCUMENT_ROOT ?? "documents");
  return join(root, "versions", version.key, version.revision, "original.pdf");
}

export async function getSourcePdfPage(id: string, section: string, today: string) {
  const version = parseDocumentVersionId(id);
  if (!version || !/^[1-9]\d*$/u.test(section)) return undefined;
  const { rows } = await getPool().query<{ page: number }>(`
    SELECT f.page FROM assistant_publications d
    JOIN assistant_fragments f ON f.document_id = d.id
    WHERE d.id = $1 AND d.revision = $2 AND d.issued_on <= $3 AND d.has_pdf AND f.position = $4
  `, [version.key, version.revision, today, section]);
  return rows[0]?.page;
}
