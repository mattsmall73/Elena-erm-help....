import type { Subject } from "./types";

// The subject list. Order controls how they appear on the Arcade home.
export const SUBJECTS: Subject[] = [
  {
    id: "history",
    name: "History",
    board: "Edexcel",
    accent: "cyan",
    requiresContext: true,
    blurb: "Give me a topic or your notes and I'll make cards.",
  },
  {
    id: "rs",
    name: "Religious Studies",
    board: "AQA",
    accent: "magenta",
    requiresContext: true,
    blurb: "Themes only work if you tell me which ones.",
  },
  {
    id: "dance",
    name: "Dance",
    board: "AQA anthology",
    accent: "amber",
    requiresContext: false,
    blurb: "The set works — choreographers, styles, features.",
  },
  {
    id: "english-lit",
    name: "English Literature",
    board: "AQA",
    accent: "magenta",
    requiresContext: true,
    blurb: "Your set texts. Tell me which and I'll help.",
  },
  {
    id: "combined-science",
    name: "Combined Science",
    board: "Higher",
    accent: "cyan",
    requiresContext: false,
    onDemand: true,
    blurb: "Name a topic — I'll build a deck on the spot.",
  },
  {
    id: "maths",
    name: "Maths",
    board: "Higher",
    accent: "cyan",
    requiresContext: false,
    onDemand: true,
    blurb: "Name a topic — I'll build a deck on the spot.",
  },
  {
    id: "food",
    name: "Food Prep & Nutrition",
    accent: "amber",
    requiresContext: false,
    onDemand: true,
    blurb: "Name a topic — I'll build a deck on the spot.",
  },
  {
    id: "english-language",
    name: "English Language",
    accent: "magenta",
    requiresContext: false,
    onDemand: true,
    blurb: "Name a topic — I'll build a deck on the spot.",
  },
];

export function getSubject(id: string): Subject | undefined {
  return SUBJECTS.find((s) => s.id === id);
}
