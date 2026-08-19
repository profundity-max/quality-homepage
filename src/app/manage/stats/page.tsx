import Link from "next/link";
import { redirect } from "next/navigation";

import { getDatabase } from "@/db/database";
import { createContentStatsService } from "@/modules/content-stats";

import { requirePortalSession } from "../../authorization";
import { PortalShell } from "../../portal-shell";
import { purgeIdentityDetailsAction } from "./actions";
import styles from "./stats.module.css";

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(value);
}

export default async function StatsDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const params = await searchParams;
  const session = await requirePortalSession("/manage/stats");
  const isAdmin = session.member.role === "administrator";
  const stats = createContentStatsService(getDatabase());
  const dashboard = await stats
    .editorDashboard(session.member.id)
    .catch(() => null);
  if (!dashboard) redirect("/");

  const [searches, reach] = isAdmin
    ? await Promise.all([
        stats.listIdentitySearchDetail(session.member.id, 20),
        stats.listIdentityReachDetail(session.member.id, 20),
      ])
    : [null, null];

  return (
    <PortalShell currentPath="/manage/stats">
      <main id="main-content" tabIndex={-1} className={styles.layout}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>品集｜Q Nexus · 门户管理</p>
          <h1>内容统计</h1>
          <p className={styles.purpose}>
            内容统计用于知识建设，不表示学习成效，不作为个人绩效或培训完成证明。
          </p>
        </header>

        {params.notice ? (
          <p className={styles.notice} role="status">
            {params.notice}
          </p>
        ) : null}

        <section className={styles.card} aria-label="热门文章">
          <h2>热门文章（累计阅读）</h2>
          <RankList
            rows={dashboard.hotArticles.map((article) => ({
              stableId: article.stableId,
              title: article.title,
              value: `${article.readCount} 次`,
            }))}
          />
        </section>

        <section className={styles.card} aria-label="高触达文章">
          <h2>高触达文章（近 30 天）</h2>
          <RankList
            rows={dashboard.highReachArticles.map((article) => ({
              stableId: article.stableId,
              title: article.title,
              value: `${article.value} 人`,
            }))}
          />
        </section>

        <section className={styles.card} aria-label="近期增长文章">
          <h2>近期增长文章（近 7 天对比上一 7 天）</h2>
          {dashboard.growingArticles.length === 0 ? (
            <p className={styles.empty}>暂无增长数据。</p>
          ) : (
            <ul className={styles.rankList}>
              {dashboard.growingArticles.map((article) => (
                <li key={article.stableId} className={styles.rankItem}>
                  <Link href={`/articles/${article.stableId}`}>
                    {article.title}
                  </Link>
                  <span className={styles.value}>
                    近 7 天 {article.recentReads} · 上一 7 天{" "}
                    {article.previousReads}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.card} aria-label="长期无人阅读">
          <h2>长期无人阅读（发布超 90 天且近 90 天无阅读）</h2>
          {dashboard.longUnreadArticles.length === 0 ? (
            <p className={styles.empty}>暂无。</p>
          ) : (
            <ul className={styles.rankList}>
              {dashboard.longUnreadArticles.map((article) => (
                <li key={article.stableId} className={styles.rankItem}>
                  <Link href={`/articles/${article.stableId}`}>
                    {article.title}
                  </Link>
                  <span className={styles.value}>
                    发布自 {formatDate(article.publishedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.card} aria-label="搜索后常打开文章">
          <h2>搜索后常打开文章（搜索后 30 分钟内）</h2>
          <RankList
            rows={dashboard.searchDrivenOpens.map((article) => ({
              stableId: article.stableId,
              title: article.title,
              value: `${article.value} 次`,
            }))}
          />
        </section>

        <section className={styles.card} aria-label="无结果搜索词">
          <h2>无结果搜索词（知识缺口）</h2>
          {dashboard.noResultTerms.length === 0 ? (
            <p className={styles.empty}>暂无无结果搜索。</p>
          ) : (
            <ul className={styles.rankList}>
              {dashboard.noResultTerms.map((term) => (
                <li key={term.query} className={styles.rankItem}>
                  <span className={styles.term}>{term.query}</span>
                  <span className={styles.value}>
                    {term.count} 次 · 最近 {formatDate(term.lastSearchedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.card} aria-label="模板下载">
          <h2>模板下载次数与人数</h2>
          {dashboard.templateDownloads.length === 0 ? (
            <p className={styles.empty}>暂无下载。</p>
          ) : (
            <ul className={styles.rankList}>
              {dashboard.templateDownloads.map((template) => (
                <li key={template.stableId} className={styles.rankItem}>
                  <Link href={`/templates/${template.stableId}`}>
                    {template.name}
                  </Link>
                  <span className={styles.value}>
                    {template.downloadCount} 次 · {template.downloadUsers} 人
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.tools} aria-label="统计工具">
          <a className={styles.exportLink} href="/api/stats/export" download>
            导出不含身份的聚合统计 CSV
          </a>
          <p className={styles.toolNote}>
            不提供触达人员名单导出；身份化明细仅管理员可见且保留 90 天。
          </p>
        </section>

        {isAdmin ? (
          <>
            <section className={styles.card} aria-label="身份化搜索明细">
              <h2>身份化搜索明细（最近 90 天 · 仅管理员）</h2>
              {searches && searches.length === 0 ? (
                <p className={styles.empty}>暂无搜索记录。</p>
              ) : (
                <ul className={styles.rankList}>
                  {(searches ?? []).map((record, index) => (
                    <li key={`${record.createdAt.getTime()}-${index}`}>
                      <span className={styles.term}>{record.query}</span>
                      <span className={styles.value}>
                        {record.userName} ·{" "}
                        {record.hasResults ? "有结果" : "无结果"} ·{" "}
                        {formatDate(record.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={styles.card} aria-label="身份化触达明细">
              <h2>身份化触达明细（最近 90 天 · 仅管理员）</h2>
              {reach && reach.length === 0 ? (
                <p className={styles.empty}>暂无阅读记录。</p>
              ) : (
                <ul className={styles.rankList}>
                  {(reach ?? []).map((record, index) => (
                    <li key={`${record.readAt.getTime()}-${index}`}>
                      <span className={styles.term}>{record.articleTitle}</span>
                      <span className={styles.value}>
                        {record.userName} · {formatDate(record.readAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={styles.card} aria-label="合规数据清理">
              <h2>合规数据清理</h2>
              <p className={styles.toolNote}>
                删除最近 90
                天之前的身份化搜索、阅读与下载明细；按日去重的匿名聚合与累计数字保留，不会单独篡改统计。
              </p>
              <form action={purgeIdentityDetailsAction}>
                <button type="submit" className={styles.purgeButton}>
                  执行合规数据清理（90 天前明细）
                </button>
              </form>
            </section>
          </>
        ) : null}
      </main>
    </PortalShell>
  );
}

function RankList({
  rows,
}: {
  rows: { stableId: string; title: string; value: string }[];
}) {
  if (rows.length === 0) return <p className={styles.empty}>暂无数据。</p>;
  return (
    <ul className={styles.rankList}>
      {rows.map((row) => (
        <li key={row.stableId} className={styles.rankItem}>
          <Link href={`/articles/${row.stableId}`}>{row.title}</Link>
          <span className={styles.value}>{row.value}</span>
        </li>
      ))}
    </ul>
  );
}
