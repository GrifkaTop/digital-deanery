const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { setTimeout: delay } = require("node:timers/promises");
const { POST } = require("@/app/api/v1/assistant/ask/route");
const { dateInMoscow } = require("@/contracts/calendar");
const { parseDocumentVersionId } = require("@/contracts/assistant-files");
const { searchDocumentFiles } = require("@/server/assistant/files");
const { visibilityNow } = require("@/server/clock");
const { getPool } = require("@/server/db");

const questions = EVAL_QUESTIONS.trim().split("\n").map((line) => JSON.parse(line));
const pool = getPool();
const documents = new Map();

function source(card) {
  const [path, anchor] = card.link.href.split("#section-");
  const version = parseDocumentVersionId(path.split("/").at(-1));
  const doc = version && documents.get(version.key);
  return { ref: doc ? doc.number + ":" + anchor : card.link.label, href: card.link.href };
}
function sources(cards) { return cards.map(source); }
function output(row) { process.stdout.write(JSON.stringify(row) + "\n"); }

const evaluation = globalThis.searchEvaluation = {
  async search(read, query, today) {
    const cards = await read(query, today);
    this.trace.searches.push({ query, sources: sources(cards) });
    return cards;
  },
  async payments(read, scope, today) {
    const cards = await read(scope, today);
    this.trace.payments = { scope, sources: sources(cards) };
    return cards;
  },
  setCandidates(cards) { this.trace.candidates = sources(cards); },
  wrapModel(model) {
    return Object.fromEntries(Object.entries(model).map(([stage, call]) => [stage, async (input) => {
      const record = { stage, question: input.question, status: "pending" };
      this.trace.model.push(record);
      const start = performance.now();
      try {
        const result = await call(input);
        Object.assign(record, { status: "returned", result });
        return result;
      } catch (error) {
        Object.assign(record, { status: "rejected", error: String(error.message) });
        throw error;
      } finally {
        record.ms = Math.round(performance.now() - start);
      }
    }]));
  },
};

async function active(today) {
  const { rows } = await pool.query(
    "SELECT id, number, revision, issued_on::text AS date FROM assistant_publications WHERE issued_on <= $1 ORDER BY number", [today]);
  return rows;
}

async function run() {
  assert.equal((await pool.query("SHOW default_transaction_read_only")).rows[0].default_transaction_read_only, "on");
  const today = dateInMoscow(visibilityNow());
  const publications = await active(today);
  assert.ok(publications.length, "No active publications");
  assert.ok(process.env.ASSISTANT_QWEN_MODEL && (process.env.ASSISTANT_QWEN_SOCKET || process.env.ASSISTANT_QWEN_BASE_URL),
    "Qwen is not configured on this stand");
  for (const doc of publications) documents.set(doc.id, doc);
  const { rows: fragments } = await pool.query(
    "SELECT d.number, f.position FROM assistant_fragments f JOIN assistant_publications d ON d.id = f.document_id WHERE d.issued_on <= $1", [today]);
  const allRefs = new Set(fragments.map(({ number, position }) => number + ":" + position));
  for (const row of questions) for (const ref of [...row.expectedSources ?? [], ...row.absenceSources ?? []])
    assert.ok(allRefs.has(ref), row.id + " expects a reference missing from this catalog: " + ref);
  const { rows: [actor] } = await pool.query(`
    SELECT st.id, st.account_id, st.group_id FROM students st JOIN accounts a ON a.id=st.account_id
    WHERE a.is_active AND a.id='10000000-0000-4000-8000-000000000001'`);
  assert.ok(actor, "Synthetic account A was not found");
  evaluation.actor = { ...actor, session_id: "diagnostic-read-only" };
  output({ run: {
    today, postgres: (await pool.query("SHOW server_version")).rows[0].server_version,
    model: process.env.ASSISTANT_QWEN_MODEL, publications,
    questionsSha256: createHash("sha256").update(EVAL_QUESTIONS).digest("hex"),
  } });
  const contexts = new Map();
  for (const row of questions) {
    const directStart = performance.now();
    const direct = sources(await searchDocumentFiles(row.question, today));
    const directMs = performance.now() - directStart;
    const context = row.previous ? contexts.get(row.previous) : undefined;
    const makeRequest = () => new Request("https://localhost/api/v1/assistant/ask", {
      method: "POST", body: JSON.stringify({ question: row.question, context }),
    });
    let response;
    const routeStart = performance.now();
    do {
      evaluation.trace = { searches: [], model: [] };
      response = await POST(makeRequest());
      if (response.status === 429) await delay(250 + Number(response.headers.get("Retry-After")) * 1000);
    } while (response.status === 429);
    const result = await response.json();
    assert.equal(response.status, 200, row.id + ": " + JSON.stringify(result));
    contexts.set(row.id, result.context);
    const { cards, ...answer } = result;
    output({
      id: row.id, direct, directMs, routeMs: performance.now() - routeStart, context: context ?? null, trace: evaluation.trace,
      answer: { ...answer, cards: cards.map((card) => ({ ...source(card), text: card.text })) },
    });
    process.stderr.write(row.id + " " + (result.processing ?? "unmarked") + "\n");
  }
  assert.deepEqual(await active(today), publications, "Catalog changed during the run");
  output({ completed: questions.length });
}

run().finally(() => pool.end()).catch((error) => { console.error(error.message); process.exitCode = 1; });
