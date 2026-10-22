import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getDatabase } from "@/db/database";
import { createContentStatsService } from "@/modules/content-stats";
import { createLearningReportService } from "@/modules/learning-stats/report";
import { resolveStatsRange } from "@/modules/learning-stats/period";
import type { StatsFilter } from "@/modules/learning-stats/types";
import { formatDateTime } from "@/modules/shared/date-format";
import { requirePortalSession } from "../../authorization";
import { PortalShell } from "../../portal-shell";
import { purgeIdentityDetailsAction } from "./actions";
import styles from "./stats.module.css";

const filterKeys = [
  "period",
  "from",
  "to",
  "q",
  "sort",
  "userId",
  "articleId",
  "templateId",
  "page",
] as const;
const sorts = [
  ["activeDays", "活跃天数"],
  ["visits", "访问次数"],
  ["effectiveArticles", "有效阅读篇数"],
  ["effectiveReads", "有效阅读次数"],
  ["activeSeconds", "活跃阅读时长"],
  ["logins", "成功登录次数"],
  ["lastLoginAt", "最近登录"],
  ["downloads", "下载次数"],
  ["distinctTemplates", "不同模板数"],
  ["favorites", "当前收藏数"],
  ["name", "姓名（升序）"],
];
const metric = (value: number | null) =>
  value === null ? "未采集" : value.toLocaleString("zh-CN");
const duration = (value: number | null) =>
  value === null ? "未采集" : `${Math.floor(value / 60)}分${value % 60}秒`;

export default async function StatsDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filter: StatsFilter = {};
  for (const key of filterKeys) {
    const value = params[key];
    filter[key] = Array.isArray(value) ? value[0] : value;
  }
  filter.period ||= "month";
  if (filter.period !== "custom") {
    delete filter.from;
    delete filter.to;
  }
  const appliedFilter = { ...filter };
  let dateError: string | null = null;
  try {
    resolveStatsRange(appliedFilter);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const reasons: Record<string, string> = {
      "Both dates are required": "请同时填写开始日期与结束日期。",
      "Invalid date": "请输入有效日期（年-月-日），确认该月份存在这一天。",
      "Date range must be ordered and at most two years":
        "开始日期不能晚于结束日期，且包含首尾日期的范围不能超过两年。",
      "Invalid period": "请选择本月、本季度、本年度或自定义日期。",
    };
    if (!reasons[message]) throw error;
    dateError = `日期筛选未应用：${reasons[message]}下方暂显示本月数据及对应导出；修正日期后点击“应用筛选”。`;
    appliedFilter.period = "month";
    delete appliedFilter.from;
    delete appliedFilter.to;
  }
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(appliedFilter))
    if (value) query.set(key, value);
  const session = await requirePortalSession(`/manage/stats?${query}`);
  if (session.member.role !== "administrator") redirect("/");
  const report = await createLearningReportService(getDatabase()).getReport(
    session.member.id,
    appliedFilter,
  );
  const knowledgeGaps = await createContentStatsService(
    getDatabase(),
  ).listKnowledgeGaps(session.member.id);
  const rawView = Array.isArray(params.view) ? params.view[0] : params.view;
  const view =
    rawView === "people" || rawView === "content" ? rawView : "overview";
  query.set("view", view);
  const href = (updates: Record<string, string>) => {
    const next = new URLSearchParams(query);
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    return `/manage/stats?${next}`;
  };
  const detailLink = (updates: Record<string, string>) =>
    `${href({ ...updates, page: "1" })}#activity-details`;
  const page = report.details.page;
  const maxPages = Math.max(
    1,
    Math.ceil(
      Math.max(
        report.details.totalReads,
        report.details.totalDownloads,
        report.details.totalLogins,
      ) / report.details.pageSize,
    ),
  );
  const notice = Array.isArray(params.notice)
    ? params.notice[0]
    : params.notice;

  return (
    <PortalShell currentPath="/manage/stats">
      <main id="main-content" tabIndex={-1} className={styles.layout}>
        <header className={styles.header}>
          <div>
            <h1>学习统计</h1>
            <p className={styles.purpose}>
              学习参与记录仅作培养与评优辅助，不代表学习成效。
            </p>
          </div>
          <a
            className={styles.exportLink}
            href={`/api/stats/people-export?${query}`}
            download
          >
            导出人员汇总 Excel
          </a>
        </header>
        {notice ? (
          <p role="status" className={styles.notice}>
            {notice}
          </p>
        ) : null}
        {dateError ? (
          <p role="alert" className={styles.notice}>
            {dateError}
          </p>
        ) : null}
        <nav aria-label="统计视图" className={styles.tabs}>
          {[
            ["overview", "总览"],
            ["people", "人员"],
            ["content", "内容"],
          ].map(([key, label]) => (
            <Link
              key={key}
              href={href({ view: key })}
              aria-current={view === key ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
        <form action="/manage/stats" method="get" className={styles.filters}>
          <input type="hidden" name="view" value={view} />
          {["userId", "articleId", "templateId"].map((key) =>
            query.get(key) ? (
              <input
                key={key}
                type="hidden"
                name={key}
                value={query.get(key)!}
              />
            ) : null,
          )}
          <label>
            统计周期
            <select name="period" defaultValue={filter.period || "month"}>
              <option value="month">本月</option>
              <option value="quarter">本季度</option>
              <option value="year">本年度</option>
              <option value="custom">自定义日期</option>
            </select>
          </label>
          <label>
            开始日期
            <input
              type="date"
              name="from"
              defaultValue={
                filter.period === "custom"
                  ? filter.from || ""
                  : report.range.from
              }
            />
          </label>
          <label>
            结束日期
            <input
              type="date"
              name="to"
              defaultValue={
                filter.period === "custom" ? filter.to || "" : report.range.to
              }
            />
          </label>
          <label>
            姓名或用户名
            <input
              name="q"
              defaultValue={filter.q}
              placeholder="搜索正式成员"
            />
          </label>
          <label>
            人员排序
            <select name="sort" defaultValue={filter.sort || "activeDays"}>
              {sorts.map(([value, title]) => (
                <option key={value} value={value}>
                  {title}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">应用筛选</button>
          <Link href={`/manage/stats?view=${view}`}>重置筛选</Link>
        </form>
        <div className={styles.contextBar}>
          <span>
            统计范围：{report.range.from} 至 {report.range.to}（上海时区）
          </span>
          <span>
            采集起点：
            {report.collectedSince
              ? formatDateTime(report.collectedSince)
              : "尚未开始采集"}
          </span>
          <details>
            <summary>统计口径</summary>
            <p>
              实名学习记录保留两年；包括编辑者、管理员与停用账号，显式标记的测试账号除外。当前收藏数不受日期范围限制，不提供个人收藏清单。无活动的正式成员仍列出。
            </p>
            <p>
              有效阅读与活跃时长采集前的历史数据不补记为零；跨采集起点的区间仅包含起点后的已采集部分。日期范围包含结束日期，人员排序除姓名外按指标降序。
            </p>
            <Link href="/manage">账户管理与测试账号排除</Link>
          </details>
        </div>
        {view === "overview" ? (
          <>
            <section aria-label="参与总览" className={styles.metrics}>
              {[
                ["活跃人数", metric(report.overview.activeUsers)],
                ["有效阅读次数", metric(report.overview.effectiveReads)],
                ["活跃阅读时长", duration(report.overview.activeSeconds)],
                ["模板下载次数", metric(report.overview.downloads)],
              ].map(([title, value]) => (
                <div key={title} className={styles.metric}>
                  <span>{title}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </section>
            <p className={styles.note}>
              文章访问次数 {metric(report.overview.visits)} · 成功登录次数{" "}
              {metric(report.overview.logins)} · 当前收藏数不受日期范围限制
            </p>
            <section className={styles.card}>
              <div className={styles.sectionHeader}>
                <h2>人员参与记录</h2>
                <Link href={href({ view: "people" })}>查看全部人员</Link>
              </div>
              <DataTable
                label="人员参与记录"
                headers={[
                  "姓名",
                  "活跃天数",
                  "有效阅读篇数",
                  "活跃阅读时长",
                  "成功登录次数",
                  "下载次数",
                  "当前收藏数",
                ]}
                rows={report.people.slice(0, 6).map((person) => [
                  <Link
                    key={person.id}
                    href={detailLink({ userId: person.id })}
                  >
                    {person.name}
                  </Link>,
                  metric(person.activeDays),
                  metric(person.effectiveArticles),
                  duration(person.activeSeconds),
                  metric(person.logins),
                  metric(person.downloads),
                  metric(person.favorites),
                ])}
              />
              <p className={styles.note}>
                当前排序：
                {sorts.find(
                  ([key]) => key === (filter.sort || "activeDays"),
                )?.[1] ?? "活跃天数"}{" "}
                · 各指标独立展示，不合成学习分
              </p>
            </section>
            <details className={styles.card}>
              <summary>每日参与趋势</summary>
              <p className={styles.note}>
                按实际上海日期展示每日数据；无活动日期保留为零。
              </p>
              <DataTable
                label="每日参与趋势"
                headers={[
                  "日期",
                  "活跃人数",
                  "访问次数",
                  "活跃阅读时长",
                  "下载次数",
                ]}
                rows={report.trend.map((row) => [
                  row.day,
                  metric(row.activeUsers),
                  metric(row.visits),
                  duration(row.activeSeconds),
                  metric(row.downloads),
                ])}
              />
            </details>
          </>
        ) : null}
        {view === "people" ? (
          <section className={styles.card}>
            <h2>人员统计</h2>
            <p className={styles.note}>
              点击姓名查看该成员的阅读、下载和登录明细。最近登录与活跃天数按所选日期范围统计。
            </p>
            <DataTable
              label="人员统计"
              headers={[
                "姓名",
                "账号状态",
                "访问次数",
                "有效阅读篇数",
                "有效阅读次数",
                "活跃阅读时长",
                "活跃天数",
                "成功登录次数",
                "最近登录",
                "下载次数",
                "不同模板数",
                "当前收藏数",
              ]}
              rows={report.people.map((person) => [
                <Link key={person.id} href={detailLink({ userId: person.id })}>
                  {person.name}
                  <small className={styles.username}>@{person.username}</small>
                </Link>,
                person.disabled ? "已停用" : "正常",
                metric(person.visits),
                metric(person.effectiveArticles),
                metric(person.effectiveReads),
                duration(person.activeSeconds),
                metric(person.activeDays),
                metric(person.logins),
                person.lastLoginAt
                  ? formatDateTime(person.lastLoginAt)
                  : "无登录记录",
                metric(person.downloads),
                metric(person.distinctTemplates),
                metric(person.favorites),
              ])}
            />
          </section>
        ) : null}
        {view === "content" ? (
          <>
            <section className={styles.card}>
              <h2>文章统计</h2>
              <DataTable
                label="文章统计"
                headers={[
                  "文章",
                  "访问次数",
                  "访问人数",
                  "有效阅读次数",
                  "有效阅读人数",
                  "活跃阅读时长",
                  "当前收藏人数",
                ]}
                rows={report.articles.map((article) => [
                  <Link
                    key={article.id}
                    href={detailLink({ articleId: article.id, templateId: "" })}
                  >
                    {article.title}
                  </Link>,
                  metric(article.visits),
                  metric(article.readers),
                  metric(article.effectiveReads),
                  metric(article.effectiveReaders),
                  duration(article.activeSeconds),
                  metric(article.favorites),
                ])}
              />
            </section>
            <section className={styles.card}>
              <h2>模板统计</h2>
              <p className={styles.note}>
                同一模板的各版本合并统计，点击模板查看下载版本明细。
              </p>
              <DataTable
                label="模板统计"
                headers={["模板", "下载次数", "下载人数"]}
                rows={report.templates.map((template) => [
                  <Link
                    key={template.id}
                    href={detailLink({
                      templateId: template.id,
                      articleId: "",
                    })}
                  >
                    {template.name}
                  </Link>,
                  metric(template.downloads),
                  metric(template.downloaders),
                ])}
              />
            </section>
          </>
        ) : null}
        <section
          className={styles.card}
          id="activity-details"
          aria-label="实名活动明细"
        >
          <h2>实名活动明细</h2>
          <form
            action="/manage/stats#activity-details"
            method="get"
            className={styles.filters}
          >
            {Array.from(query)
              .filter(
                ([key]) =>
                  !["userId", "articleId", "templateId", "page"].includes(key),
              )
              .map(([key, value]) => (
                <input key={key} type="hidden" name={key} value={value} />
              ))}
            <label>
              明细人员
              <select name="userId" defaultValue={filter.userId || ""}>
                <option value="">全部人员</option>
                {report.people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                    {person.disabled ? "（已停用）" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              明细文章
              <select name="articleId" defaultValue={filter.articleId || ""}>
                <option value="">全部文章</option>
                {report.articles.map((article) => (
                  <option key={article.id} value={article.id}>
                    {article.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              明细模板
              <select name="templateId" defaultValue={filter.templateId || ""}>
                <option value="">全部模板</option>
                {report.templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">筛选明细</button>
            <Link
              href={`${href({ userId: "", articleId: "", templateId: "", page: "1" })}#activity-details`}
            >
              清除明细筛选
            </Link>
          </form>
          <p className={styles.note}>
            明细筛选不改变上方汇总。阅读、下载、登录分别显示每页{" "}
            {report.details.pageSize}{" "}
            条，同步翻页；文章仅筛阅读，模板仅筛下载，人员筛选适用于全部明细。
          </p>
          <h3 id="read-details-heading">阅读明细</h3>
          <p className={styles.note}>
            跨日继续阅读时，明细也列出前一天开始、在本期产生时长或达到有效阅读的记录；访问次数仍按首次访问日期统计。
          </p>
          <p className={styles.note}>
            共 {report.details.totalReads} 条。有效阅读需累计活跃 30
            秒；隐藏、失焦、连续 5 分钟无交互暂停，多标签页不重叠累计。
          </p>
          <DataTable
            label="阅读明细"
            headers={["姓名", "文章", "阅读时间", "活跃阅读时长", "有效阅读"]}
            rows={report.details.reads.map((row) => [
              row.name,
              row.articleTitle,
              formatDateTime(row.readAt),
              duration(row.activeSeconds),
              row.qualified === null ? "未采集" : row.qualified ? "是" : "否",
            ])}
          />
          <h3>下载明细</h3>
          <p className={styles.note}>
            共 {report.details.totalDownloads}{" "}
            条。成功交付文件响应计数，不代表用户已保存文件。
          </p>
          <DataTable
            label="下载明细"
            headers={["姓名", "模板", "模板版本", "下载时间"]}
            rows={report.details.downloads.map((row) => [
              row.name,
              row.templateName,
              row.versionLabel,
              formatDateTime(row.downloadedAt),
            ])}
          />
          <h3>登录明细</h3>
          <p className={styles.note}>
            共 {report.details.totalLogins} 条。仅成功认证计数，不含自动续期。
          </p>
          <DataTable
            label="登录明细"
            headers={["姓名", "登录时间"]}
            rows={report.details.logins.map((row) => [
              row.name,
              formatDateTime(row.occurredAt),
            ])}
          />
          <nav className={styles.pagination} aria-label="明细分页">
            {page > 1 ? (
              <Link
                href={`${href({ page: String(page - 1) })}#activity-details`}
              >
                上一页
              </Link>
            ) : (
              <span>上一页</span>
            )}
            <span>
              第 {page} / {maxPages} 页
            </span>
            {page < maxPages ? (
              <Link
                href={`${href({ page: String(page + 1) })}#activity-details`}
              >
                下一页
              </Link>
            ) : (
              <span>下一页</span>
            )}
          </nav>
        </section>
        <section className={styles.card}>
          <h2>无结果搜索词（知识缺口）</h2>
          <p className={styles.note}>
            沿用独立搜索统计口径，不属于个人学习记录。
          </p>
          <DataTable
            label="知识缺口"
            headers={["搜索词", "次数", "最近搜索"]}
            rows={knowledgeGaps.map((term) => [
              term.query,
              metric(term.count),
              formatDateTime(term.lastSearchedAt),
            ])}
          />
        </section>
        <section className={styles.tools} aria-label="统计工具">
          <a href="/api/stats/export" download>
            导出不含身份的聚合统计 CSV
          </a>
          <p className={styles.note}>
            Excel
            仅含当前日期与姓名筛选的人员汇总，实名导出记入审计；逐条行为不导出。
          </p>
          <form action={purgeIdentityDetailsAction}>
            <button type="submit" className={styles.purgeButton}>
              执行数据清理（两年前实名学习记录）
            </button>
          </form>
        </section>
      </main>
    </PortalShell>
  );
}

function DataTable({
  label,
  headers,
  rows,
}: {
  label: string;
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
    <div
      className={styles.tableWrap}
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      <table>
        <caption className={styles.srOnly}>{label}</caption>
        <thead>
          <tr>
            {headers.map((header) => (
              <th scope="col" key={header}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, column) => (
                  <td key={column}>{cell}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={headers.length} className={styles.empty}>
                此范围内暂无数据。
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
