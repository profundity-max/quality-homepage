import Link from "next/link";
import type { Course } from "@/modules/learning/course";
import styles from "./learning.module.css";

export function CourseComparison({
  course,
  path,
  reference,
  anchors,
}: {
  course: Course;
  path: string;
  reference: string;
  anchors: Record<number, string>;
}) {
  const questions = [
    ...course.pre,
    ...course.post,
    ...course.modules.flatMap((m) => m.checks),
    ...course.simulation.stages.map((s) => s.question),
  ];

  return (
    <div className={styles.panel}>
      <h1>RCA 学习体验对比</h1>
      <p>以下比较对应原文及试点课程。课程用时为设计估计，学习成效尚待实测。</p>
      <div
        className={styles.tableWrap}
        tabIndex={0}
        role="region"
        aria-label="改版对比表"
      >
        <table>
          <thead>
            <tr>
              <th scope="col">维度</th>
              <th scope="col">
                <Link href={reference}>Before 原文</Link>
              </th>
              <th scope="col">
                <Link href={path}>After 课程</Link>
              </th>
            </tr>
          </thead>
          <tbody>
            {course.comparison.map(([label, before, after]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{before}</td>
                <td>{after}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>原文知识覆盖矩阵</h2>
      <div
        className={styles.tableWrap}
        tabIndex={0}
        role="region"
        aria-label="知识覆盖矩阵"
      >
        <table>
          <thead>
            <tr>
              <th scope="col">原文章节</th>
              <th scope="col">模块</th>
              <th scope="col">知识卡</th>
              <th scope="col">测验及案例题</th>
            </tr>
          </thead>
          <tbody>
            {course.coverage.map((row) => {
              const anchor = anchors[row.section];
              return (
                <tr key={row.section}>
                  <th scope="row">
                    <Link href={anchor ? `${reference}#${anchor}` : reference}>
                      {row.topic}
                    </Link>
                  </th>
                  <td>
                    {course.modules
                      .filter((m) =>
                        m.cards.some((c) => row.cards.includes(c.id)),
                      )
                      .map((m) => m.title)
                      .join("、")}
                  </td>
                  <td>{row.cards.join("、")}</td>
                  <td>
                    {questions
                      .filter((q) => row.cards.includes(q.card))
                      .map((q) => q.id)
                      .join("、")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <h2>教学扩展来源</h2>
      <ul>
        {course.sources.map((s) => (
          <li key={s.href}>
            <a href={s.href}>{s.label}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
