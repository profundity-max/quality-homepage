import type { Course } from "./course";
import { getRcaReferenceAnchors, rcaCourse } from "./rca";

type ArticleCourse = {
  articleStableId: string;
  course: Course;
  getReferenceAnchors: (
    toc: { id: string; text: string }[],
  ) => Record<number, string>;
};

export const articleCourses: readonly ArticleCourse[] = [
  {
    articleStableId: "article-e93d377c",
    course: rcaCourse,
    getReferenceAnchors: getRcaReferenceAnchors,
  },
];

export function getArticleCourse(stableId: string) {
  return articleCourses.find((entry) => entry.articleStableId === stableId);
}
