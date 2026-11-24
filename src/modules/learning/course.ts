export type Card = {
  id: string;
  kind: string;
  title: string;
  body: string;
  sections: number[];
  diagram?: string[];
  recall?: { prompt: string; answer: string };
};

export type Question = {
  id: string;
  knowledge: string;
  objective: string;
  card: string;
  difficulty: "基础" | "进阶";
  level: 1 | 2 | 3 | 4;
  prompt: string;
  options: { label: string; explanation: string; misconception?: string }[];
  correct: number;
};

export type Module = {
  id: string;
  title: string;
  objective: string;
  behavior: string;
  cards: Card[];
  checks: Question[];
};

export type Course = {
  id: string;
  version: string;
  title: string;
  intro: string;
  minutes: string;
  scenario: string;
  map: { title: string; steps: string[] }[];
  modules: Module[];
  pre: Question[];
  post: Question[];
  simulation: {
    title: string;
    stages: {
      title: string;
      evidence: string;
      table?: { headers: string[]; rows: string[][] };
      question: Question;
    }[];
    closeout: string;
  };
  sources: { label: string; href: string }[];
  coverage: { section: number; topic: string; cards: string[] }[];
  comparison: [string, string, string][];
  reviewDays: number[];
};
