import type { CampusEvent } from "./home-content";

const illustrations = {
  campus: {
    src: "/prototype-assets/campus-festival-cover.webp",
    alt: "Иллюстрация кампуса с работами студенческих клубов",
    caption: "Иллюстрация, созданная ИИ",
  },
  tennis: {
    src: "/prototype-assets/table-tennis-cover.webp",
    alt: "Иллюстрация с ракеткой и мячом для настольного тенниса",
    caption: "Иллюстрация, созданная ИИ",
  },
  projects: {
    src: "/prototype-assets/projects-poster.svg",
    alt: "Геометрическая иллюстрация недели студенческих проектов",
    caption: "Иллюстрация события",
  },
  quiz: {
    src: "/prototype-assets/quiz-poster.svg",
    alt: "Иллюстрация с карточками для квиза",
    caption: "Иллюстрация события",
  },
} as const;

type Illustration = (typeof illustrations)[keyof typeof illustrations];

const byCategory = new Map<string, Illustration>([
  ["Квиз", illustrations.quiz],
  ["Фестиваль", illustrations.projects],
  ["Проекты", illustrations.projects],
  ["Практикум", illustrations.projects],
  ["Мастер-класс", illustrations.projects],
  ["Хакатон", illustrations.projects],
]);

// Both identifiers designate the same published synthetic table-tennis tournament.
const tableTennis = new Set(["table-tennis", "09f67388-fa18-4f98-8323-ef3d4136494c"]);

export function eventArtwork(event: Pick<CampusEvent, "id" | "kind" | "cover">) {
  if (event.cover) return { type: "published" as const, ...event.cover };

  const illustration = tableTennis.has(event.id)
    ? illustrations.tennis
    : byCategory.get(event.kind) ?? illustrations.campus;
  return { type: "illustration" as const, ...illustration };
}
