"use client";

import Link from "next/link";
import { useRef, useState, useSyncExternalStore } from "react";
import type { Card, Course, Question } from "@/modules/learning/course";
import styles from "./learning.module.css";

type Choice = Record<string, number>;
type Practice = { first: number; last: number; attempts: number };
type Progress = {
  step: string;
  visited: string[];
  practice: Record<string, Practice>;
  drafts: { pre: Choice; post: Choice };
  results: { pre?: Choice; post?: Choice };
  completedAt?: string;
};

const initial: Progress = {
  step: "map",
  visited: ["map"],
  practice: {},
  drafts: { pre: {}, post: {} },
  results: {},
};
const changeEvent = "qnexus-course-progress";
const volatile = new Map<string, string>();

function read(key: string) {
  if (volatile.has(key)) return volatile.get(key) ?? "";
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function decode(raw: string): Progress {
  try {
    const value = JSON.parse(raw);
    if (
      typeof value?.step === "string" &&
      Array.isArray(value.visited) &&
      value.practice &&
      value.drafts?.pre &&
      value.drafts?.post &&
      value.results
    )
      return value;
  } catch {
    /* Start with an empty record when storage is unreadable. */
  }
  return initial;
}

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(changeEvent, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(changeEvent, listener);
  };
}

function AnswerFeedback({
  question,
  selected,
  review,
}: {
  question: Question;
  selected: number;
  review?: () => void;
}) {
  return (
    <div className={styles.feedback}>
      <p>
        <strong>
          {selected === question.correct ? "判断正确" : "需要复核"}
        </strong>
      </p>
      <ul>
        {question.options.map((option, index) => (
          <li key={option.label}>
            <strong>
              {index === question.correct ? "正确答案 · " : ""}
              {index === selected ? "你的选择 · " : ""}
              {option.label}
            </strong>
            <p>
              {option.misconception ? `误区：${option.misconception}。` : ""}
              {option.explanation}
            </p>
          </li>
        ))}
      </ul>
      {review && (
        <button type="button" onClick={review}>
          回顾相关卡片
        </button>
      )}
    </div>
  );
}

function Choices({
  question,
  value,
  onSelect,
}: {
  question: Question;
  value?: number;
  onSelect: (answer: number) => void;
}) {
  return (
    <fieldset className={styles.choices}>
      <legend>{question.prompt}</legend>
      {question.options.map((option, index) => (
        <label key={option.label}>
          <input
            type="radio"
            name={question.id}
            checked={value === index}
            onChange={() => onSelect(index)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

function PracticeQuestion({
  question,
  progress,
  commit,
  review,
}: {
  question: Question;
  progress?: Practice;
  commit: (answer: number) => void;
  review: () => void;
}) {
  const [answer, setAnswer] = useState<number>();
  const [retry, setRetry] = useState(false);
  const showFeedback = Boolean(progress && !retry);
  return (
    <>
      {showFeedback && progress ? (
        <>
          <p>
            <strong>{question.prompt}</strong>
          </p>
          <div role="status" className={styles.srOnly}>
            {progress.last === question.correct ? "判断正确" : "需要复核"}
          </div>
          <AnswerFeedback
            question={question}
            selected={progress.last}
            review={review}
          />
          <button
            type="button"
            onClick={() => {
              setAnswer(undefined);
              setRetry(true);
            }}
          >
            再练一次
          </button>
        </>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (answer === undefined) return;
            commit(answer);
            setRetry(false);
          }}
        >
          <Choices question={question} value={answer} onSelect={setAnswer} />
          <button className={styles.primary} disabled={answer === undefined}>
            检验判断
          </button>
        </form>
      )}
    </>
  );
}

function Assessment({
  name,
  questions,
  draft,
  result,
  select,
  submit,
  review,
}: {
  name: string;
  questions: Question[];
  draft: Choice;
  result?: Choice;
  select: (question: string, answer: number) => void;
  submit: () => void;
  review: (card: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const question = questions[index];
  const count = questions.filter((q) => draft[q.id] !== undefined).length;
  if (result)
    return (
      <>
        <p role="status">
          <strong>
            {score(questions, result)} / {questions.length}
          </strong>{" "}
          道正确。提交记录已保存。
        </p>
        {questions.map((item, i) => (
          <details key={item.id} className={styles.detail}>
            <summary>
              {i + 1}. {item.prompt}{" "}
              {result[item.id] === item.correct ? "（正确）" : "（待回顾）"}
            </summary>
            <AnswerFeedback
              question={item}
              selected={result[item.id]}
              review={() => review(item.card)}
            />
          </details>
        ))}
      </>
    );
  return (
    <>
      <p>
        已答 {count} / {questions.length}。整卷提交后查看答案与解析。
      </p>
      <p className={styles.muted}>
        第 {index + 1} 题 / 共 {questions.length} 题
      </p>
      <Choices
        question={question}
        value={draft[question.id]}
        onSelect={(answer) => select(question.id, answer)}
      />
      <div className={styles.actions}>
        <button
          type="button"
          disabled={!index}
          onClick={() => {
            setIndex(index - 1);
            setConfirm(false);
          }}
        >
          上一题
        </button>
        <button
          type="button"
          disabled={index === questions.length - 1}
          onClick={() => {
            setIndex(index + 1);
            setConfirm(false);
          }}
        >
          下一题
        </button>
        <button
          type="button"
          className={styles.primary}
          disabled={count !== questions.length}
          onClick={() => setConfirm(true)}
        >
          提交{name}
        </button>
      </div>
      {confirm && (
        <div className={styles.feedback}>
          <p>确认提交本次答卷？系统将保留这份首次成绩。</p>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={submit}>
              确认提交
            </button>
            <button type="button" onClick={() => setConfirm(false)}>
              继续检查
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function score(questions: Question[], answers: Choice) {
  return questions.filter((q) => answers[q.id] === q.correct).length;
}

function KnowledgeMap({ course }: { course: Course }) {
  return (
    <div className={styles.map}>
      {course.map.map((phase, index) => (
        <section key={phase.title}>
          <h3>{phase.title}</h3>
          <ol start={index === 0 ? 1 : course.map[0].steps.length + 1}>
            {phase.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function TeachingCard({
  card,
  reference,
  anchors,
}: {
  card: Card;
  reference: string;
  anchors: Record<number, string>;
}) {
  return (
    <>
      <p className={styles.muted}>{card.kind} / 30–90 秒</p>
      <p className={styles.lead}>{card.body}</p>
      {card.diagram && (
        <ol className={styles.diagram} aria-label="逻辑顺序">
          {card.diagram.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      )}
      <div className={styles.actions}>
        {card.sections.map((section) => (
          <Link
            key={section}
            href={
              anchors[section] ? `${reference}#${anchors[section]}` : reference
            }
          >
            {section > 0 && section < 10
              ? `原文第 ${section} 节`
              : ["原文导言", "原文结语", "原文图解"][
                  section === 0 ? 0 : section - 9
                ]}
          </Link>
        ))}
      </div>
    </>
  );
}

function Recall({ card }: { card: Card }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <>
      <p className={styles.lead}>{card.recall?.prompt}</p>
      <button
        type="button"
        aria-expanded={revealed}
        aria-controls="recall-answer"
        onClick={() => setRevealed(!revealed)}
      >
        {revealed ? "隐藏答案" : "翻转卡片"}
      </button>
      <p id="recall-answer" className={styles.feedback} hidden={!revealed}>
        {card.recall?.answer}
      </p>
    </>
  );
}

function CourseSummary({
  course,
  progress,
  review,
}: {
  course: Course;
  progress: Progress;
  review: (id: string) => void;
}) {
  const practice = [
    ...course.modules.flatMap((m) => m.checks),
    ...course.simulation.stages.map((s) => s.question),
  ];
  const first = practice.filter(
    (q) => progress.practice[q.id]?.first === q.correct,
  ).length;
  const post = progress.results.post ?? {};
  const diagnosis = [
    ...course.post.flatMap((q) =>
      post[q.id] !== q.correct ? [[q, post[q.id]] as const] : [],
    ),
    ...practice.flatMap((q) =>
      progress.practice[q.id]?.first !== q.correct
        ? [[q, progress.practice[q.id]?.first] as const]
        : [],
    ),
  ];
  return (
    <>
      <p>
        {progress.completedAt ? "课程已完成。" : "课程进行中。"}{" "}
        当前结果记录课程内的判断表现。独立工作能力需要真实报告与现场证据另行评审。
      </p>
      <dl className={styles.metrics}>
        <div>
          <dt>首次前测</dt>
          <dd>
            {score(course.pre, progress.results.pre ?? {})} /{" "}
            {course.pre.length}
          </dd>
        </div>
        <div>
          <dt>首次后测</dt>
          <dd>
            {score(course.post, post)} / {course.post.length}
          </dd>
        </div>
        <div>
          <dt>练习首次判断</dt>
          <dd>
            {first} / {practice.length}
          </dd>
        </div>
      </dl>
      <h3>各模块后测表现</h3>
      <ul>
        {course.modules.map((m) => {
          const questions = course.post.filter(
            (q) => q.objective === m.objective,
          );
          return (
            <li key={m.id}>
              {m.title}　{score(questions, post)} / {questions.length}
            </li>
          );
        })}
      </ul>
      <h3>建议回顾</h3>
      {diagnosis.length === 0 ? (
        <p>首次判断未发现错误选项。可以用下方知识地图复核自己的证据链。</p>
      ) : (
        <ul className={styles.gaps}>
          {diagnosis.map(([q, choice]) => (
            <li key={q.id}>
              <p>
                <strong>
                  {q.options[choice ?? -1]?.misconception ?? "证据判断"}
                </strong>
                　{q.prompt}（{q.id}）
              </p>
              <button type="button" onClick={() => review(q.card)}>
                回顾 {q.card}
              </button>
            </li>
          ))}
        </ul>
      )}
      <h3>把证据链带回工作</h3>
      <p>{course.simulation.closeout}</p>
      <KnowledgeMap course={course} />
    </>
  );
}

type Step =
  | { kind: "map" | "scenario" | "summary"; id: string; title: string }
  | { kind: "assessment"; id: "pre" | "post"; title: string }
  | {
      kind: "card" | "recall";
      id: string;
      title: string;
      group: string;
      card: Card;
    }
  | {
      kind: "check";
      id: string;
      title: string;
      group: string;
      question: Question;
    }
  | {
      kind: "case";
      id: string;
      title: string;
      stage: Course["simulation"]["stages"][number];
      index: number;
    };

function makeSteps(course: Course): Step[] {
  return [
    { kind: "map", id: "map", title: "知识地图" },
    { kind: "assessment", id: "pre", title: "前测" },
    { kind: "scenario", id: "scenario", title: "工程情景" },
    ...course.modules.flatMap<Step>((m) => [
      ...m.cards.flatMap<Step>((card) => [
        { kind: "card", id: card.id, title: card.title, group: m.title, card },
        ...(card.recall
          ? [
              {
                kind: "recall",
                id: `${card.id}-recall`,
                title: "先回忆，再核对",
                group: m.title,
                card,
              } as const,
            ]
          : []),
      ]),
      ...m.checks.map(
        (question) =>
          ({
            kind: "check",
            id: question.id,
            title: "随堂测验",
            group: m.title,
            question,
          }) as const,
      ),
    ]),
    ...course.simulation.stages.map(
      (stage, index) =>
        ({
          kind: "case",
          id: stage.question.id,
          title: stage.title,
          stage,
          index,
        }) as const,
    ),
    { kind: "assessment", id: "post", title: "后测" },
    { kind: "summary", id: "summary", title: "学习总结" },
  ];
}

export function CoursePlayer({
  course,
  storageKey,
  reference,
  anchors,
}: {
  course: Course;
  storageKey: string;
  reference: string;
  anchors: Record<number, string>;
}) {
  const raw = useSyncExternalStore(
    subscribe,
    () => read(storageKey),
    () => "",
  );
  const progress = decode(raw);
  const [returnTo, setReturnTo] = useState<string>();
  const [resumeFrom, setResumeFrom] = useState<string>();
  const heading = useRef<HTMLHeadingElement>(null);
  const steps = makeSteps(course);
  const index = Math.max(
    0,
    steps.findIndex((item) => item.id === progress.step),
  );
  const step = steps[index];

  function update(change: (state: Progress) => Progress) {
    const next = JSON.stringify(change(decode(read(storageKey))));
    try {
      localStorage.setItem(storageKey, next);
      volatile.delete(storageKey);
    } catch {
      volatile.set(storageKey, next);
    }
    window.dispatchEvent(new Event(changeEvent));
  }

  function go(id: string) {
    update((state) => ({
      ...state,
      step: id,
      visited: state.visited.includes(id)
        ? state.visited
        : [...state.visited, id],
    }));
    requestAnimationFrame(() => heading.current?.focus());
  }

  function review(card: string) {
    setReturnTo(step.id);
    go(card);
  }

  function practice(question: Question, answer: number) {
    update((state) => {
      const previous = state.practice[question.id];
      return {
        ...state,
        practice: {
          ...state.practice,
          [question.id]: {
            first: previous?.first ?? answer,
            last: answer,
            attempts: (previous?.attempts ?? 0) + 1,
          },
        },
      };
    });
  }

  const moduleChecks = course.modules.flatMap((m) => m.checks);
  const caseQuestions = course.simulation.stages.map((s) => s.question);
  const prerequisite = moduleChecks.every((q) => progress.practice[q.id]);
  const done = caseQuestions.every((q) => progress.practice[q.id]);
  const mapLinks = [
    { id: "map", title: "知识地图", enabled: true },
    { id: "pre", title: "前测", enabled: true },
    {
      id: "scenario",
      title: "工程情景",
      enabled: Boolean(progress.results.pre),
    },
    ...course.modules.map((m) => ({
      id: m.cards[0].id,
      title: m.title,
      enabled: Boolean(progress.results.pre),
    })),
    {
      id: caseQuestions[0].id,
      title: "案例模拟",
      enabled: Boolean(progress.results.pre) && prerequisite,
    },
    { id: "post", title: "后测", enabled: done },
    {
      id: "summary",
      title: "学习总结",
      enabled: Boolean(progress.results.post),
    },
  ];
  const next = steps[index + 1];
  const advancing =
    Boolean(next) &&
    (step.kind !== "assessment" || Boolean(progress.results[step.id])) &&
    (step.kind !== "check" || Boolean(progress.practice[step.question.id])) &&
    (step.kind !== "case" ||
      Boolean(progress.practice[step.stage.question.id])) &&
    (next?.kind !== "case" || prerequisite) &&
    (next?.id !== "post" || done);
  const title = step.kind === "map" ? course.title : step.title;

  return (
    <>
      <div className={styles.frame}>
        <aside className={styles.sidebar}>
          <p className={styles.courseName}>{course.title}</p>
          <p className={styles.muted}>{course.minutes}</p>
          <label htmlFor="learning-progress">
            已到达 {progress.visited.length} / {steps.length} 步
          </label>
          <progress
            id="learning-progress"
            value={progress.visited.length}
            max={steps.length}
          />
          <nav aria-label="课程导航">
            {mapLinks.map((item) => (
              <button
                type="button"
                key={item.id}
                disabled={!item.enabled}
                aria-current={step.id === item.id ? "step" : undefined}
                onClick={() => {
                  if (item.id === "map" && step.id !== "map")
                    setResumeFrom(step.id);
                  go(item.id);
                }}
              >
                {item.title}
              </button>
            ))}
          </nav>
        </aside>
        <section className={styles.panel} aria-labelledby="course-step-title">
          <p className={styles.muted}>
            {"group" in step
              ? step.group
              : step.kind === "case"
                ? `${course.simulation.title} / 阶段 ${step.index + 1} / ${caseQuestions.length}`
                : step.kind === "map"
                  ? "知识地图"
                  : `课程第 ${index + 1} 步 / 共 ${steps.length} 步`}
          </p>
          <h1 id="course-step-title" ref={heading} tabIndex={-1}>
            {title}
          </h1>
          <div key={step.id} className={styles.task}>
            {step.kind === "map" && (
              <>
                <p className={styles.lead}>{course.intro}</p>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => go(resumeFrom ?? "pre")}
                >
                  {resumeFrom
                    ? "返回学习位置"
                    : progress.results.pre
                      ? "查看前测"
                      : "开始前测"}
                </button>
                <KnowledgeMap course={course} />
                <h2>学完后你可以</h2>
                <ul>
                  {course.modules.map((m) => (
                    <li key={m.id}>{m.behavior}</li>
                  ))}
                </ul>
                <p className={styles.muted}>
                  {volatile.has(storageKey)
                    ? "浏览器储存受限，进度仅保留在当前页面。"
                    : "学习进度保存于当前账号和浏览器。"}
                </p>
              </>
            )}
            {step.kind === "scenario" && (
              <>
                <p className={styles.muted}>教学模拟</p>
                <p className={styles.lead}>{course.scenario}</p>
                <p>
                  先写下调查起点和关闭前所需证据。完成四个模块后，再用案例逐步检验你的判断。
                </p>
              </>
            )}
            {step.kind === "card" && (
              <TeachingCard
                card={step.card}
                reference={reference}
                anchors={anchors}
              />
            )}
            {step.kind === "recall" && <Recall card={step.card} />}
            {step.kind === "check" && (
              <PracticeQuestion
                question={step.question}
                progress={progress.practice[step.question.id]}
                commit={(answer) => practice(step.question, answer)}
                review={() => review(step.question.card)}
              />
            )}
            {step.kind === "case" && (
              <>
                <p className={styles.muted}>教学模拟数据</p>
                <p>{step.stage.evidence}</p>
                {step.stage.table && (
                  <div
                    className={`${styles.tableWrap} ${styles.evidenceTable}`}
                    role="region"
                    aria-label="受控试验数据"
                    tabIndex={0}
                  >
                    <table>
                      <thead>
                        <tr>
                          {step.stage.table.headers.map((cell) => (
                            <th scope="col" key={cell}>
                              {cell}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {step.stage.table.rows.map(([label, ...cells]) => (
                          <tr key={label}>
                            <th scope="row">{label}</th>
                            {cells.map((cell, i) => (
                              <td key={i}>{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <PracticeQuestion
                  question={step.stage.question}
                  progress={progress.practice[step.stage.question.id]}
                  commit={(answer) => practice(step.stage.question, answer)}
                  review={() => review(step.stage.question.card)}
                />
              </>
            )}
            {step.kind === "assessment" && (
              <Assessment
                name={step.title}
                questions={course[step.id]}
                draft={progress.drafts[step.id]}
                result={progress.results[step.id]}
                review={review}
                select={(question, answer) =>
                  update((state) =>
                    state.results[step.id]
                      ? state
                      : {
                          ...state,
                          drafts: {
                            ...state.drafts,
                            [step.id]: {
                              ...state.drafts[step.id],
                              [question]: answer,
                            },
                          },
                        },
                  )
                }
                submit={() =>
                  update((state) => {
                    if (
                      state.results[step.id] ||
                      !course[step.id].every(
                        (q) => state.drafts[step.id][q.id] !== undefined,
                      )
                    )
                      return state;
                    return {
                      ...state,
                      results: {
                        ...state.results,
                        [step.id]: state.drafts[step.id],
                      },
                      completedAt:
                        step.id === "post"
                          ? new Date().toISOString()
                          : state.completedAt,
                    };
                  })
                }
              />
            )}
            {step.kind === "summary" && (
              <CourseSummary
                course={course}
                progress={progress}
                review={review}
              />
            )}
          </div>
          {step.kind !== "map" && (
            <nav className={styles.stepNav} aria-label="步骤导航">
              <button
                type="button"
                disabled={!index}
                onClick={() => go(steps[index - 1].id)}
              >
                上一步
              </button>
              {returnTo && step.id !== returnTo && (
                <button
                  type="button"
                  onClick={() => {
                    go(returnTo);
                    setReturnTo(undefined);
                  }}
                >
                  返回题目
                </button>
              )}
              {next && (
                <button
                  type="button"
                  className={styles.primary}
                  disabled={!advancing}
                  onClick={() => go(next.id)}
                >
                  {next.kind === "case"
                    ? "进入案例阶段"
                    : next.kind === "summary"
                      ? "查看学习总结"
                      : "下一步"}
                </button>
              )}
            </nav>
          )}
          {next?.kind === "case" && !prerequisite && (
            <p className={styles.muted}>先完成各模块的随堂测验，再进入案例。</p>
          )}
        </section>
      </div>
    </>
  );
}
