import type { Course } from "./course";
import { getRcaReferenceAnchors, rcaCourse } from "./rca";
import {
  getProblemDefinitionAnchors,
  problemDefinitionCourse,
} from "./problem-definition";

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
  {
    articleStableId: "article-3f3ed646",
    course: problemDefinitionCourse,
    getReferenceAnchors: getProblemDefinitionAnchors,
  },
];

export function getArticleCourse(stableId: string) {
  return articleCourses.find((entry) => entry.articleStableId === stableId);
}
