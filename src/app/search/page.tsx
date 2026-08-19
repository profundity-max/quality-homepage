import Link from "next/link";

import { getDatabase } from "@/db/database";
import {
  createKnowledgePublishingService,
  type SectionNode,
} from "@/modules/knowledge-publishing";
import {
  createSearchService,
  type SearchContentType,
  type SearchGroups,
} from "@/modules/search";
import { HighlightText } from "@/ui/search/highlight";

import { requirePortalSession } from "../authorization";
import { PortalShell } from "../portal-shell";
import { submitGapNoteAction } from "./actions";
import styles from "./search.module.css";

const typeNames = {
  articles: "文章",
  topics: "主题",
  templates: "模板",
  books: "书籍",
} as const;

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function listValues(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const session = await requirePortalSession("/search");
  const query = firstValue(params.q).trim();

  const typesParam = listValues(params.types);
  const types = (
    typesParam.length > 0
      ? typesParam.filter((value): value is SearchContentType =>
          ["articles", "topics", "templates", "books"].includes(value),
        )
      : ["articles", "topics", "templates", "books"]
  ) as SearchContentType[];
  const sectionId = firstValue(params.section) || undefined;
  const tag = firstValue(params.tag)?.trim() || undefined;
  const updatedDays = Number(firstValue(params.updated) || "0") || undefined;

  const service = createSearchService(getDatabase());
  const [groups, tree, aliasHints] = await Promise.all([
    query
      ? service.fullSearch(query, {
          types,
          sectionId,
          tag,
          updatedWithinDays: updatedDays,
        })
      : Promise.resolve<SearchGroups>({
          articles: [],
          topics: [],
          templates: [],
          books: [],
        }),
    createKnowledgePublishingService(getDatabase()).listTopicTree(),
    query ? service.suggestAliases(query) : Promise.resolve([]),
  ]);

  const hasResults =
    groups.articles.length +
      groups.topics.length +
      groups.templates.length +
      groups.books.length >
    0;

  // STAT-09：每次执行搜索写入 search_events（含无结果搜索）。
  if (query) {
    await service.recordSearch({
      userId: session.member.id,
      query,
      hasResults,
    });
  }

  const sections = flattenSections(tree);

  return (
    <PortalShell currentPath="/search">
      <main id="main-content" tabIndex={-1} className={styles.layout}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>品集｜Q Nexus · 全站搜索</p>
          <h1>搜索</h1>
        </header>

        <form className={styles.searchForm} action="/search" method="get">
          <div className={styles.queryRow}>
            <label htmlFor="search-query">关键词</label>
            <input
              id="search-query"
              name="q"
              type="search"
              defaultValue={query}
              placeholder="文章、主题、模板或书籍"
            />
            <button type="submit">搜索</button>
          </div>

          <fieldset className={styles.filters}>
            <legend>筛选</legend>
            <div className={styles.filterGroup}>
              <span>内容类型</span>
              {(["articles", "topics", "templates", "books"] as const).map(
                (type) => (
                  <label key={type}>
                    <input
                      type="checkbox"
                      name="types"
                      value={type}
                      defaultChecked={types.includes(type)}
                    />
                    {typeNames[type]}
                  </label>
                ),
              )}
            </div>
            <div className={styles.filterGroup}>
              <label htmlFor="search-section">栏目</label>
              <select
                id="search-section"
                name="section"
                defaultValue={sectionId}
              >
                <option value="">全部栏目</option>
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.filterGroup}>
              <label htmlFor="search-tag">标签</label>
              <input
                id="search-tag"
                name="tag"
                type="text"
                defaultValue={tag}
                placeholder="例如：统计"
              />
            </div>
            <div className={styles.filterGroup}>
              <label htmlFor="search-updated">更新时间</label>
              <select
                id="search-updated"
                name="updated"
                defaultValue={updatedDays ? String(updatedDays) : ""}
              >
                <option value="">不限</option>
                <option value="7">近 7 天</option>
                <option value="30">近 30 天</option>
                <option value="90">近 90 天</option>
              </select>
            </div>
          </fieldset>
        </form>

        {query ? (
          hasResults ? (
            <ResultGroups groups={groups} query={query} />
          ) : (
            <section className={styles.noResult} aria-label="无搜索结果">
              <h2>未找到与“{query}”相关的内容</h2>
              {aliasHints.length > 0 ? (
                <p>
                  可以尝试：{" "}
                  {aliasHints.map((alias) => (
                    <Link
                      key={alias}
                      className={styles.alias}
                      href={`/search?q=${encodeURIComponent(alias)}`}
                    >
                      {alias}
                    </Link>
                  ))}
                </p>
              ) : null}
              <p className={styles.gapNote}>
                该搜索已记录为知识缺口，编辑者会据此补充或优化内容。
              </p>
              <form action={submitGapNoteAction} className={styles.gapForm}>
                <input type="hidden" name="query" value={query} />
                <label htmlFor="gap-note">补充说明（可选）</label>
                <textarea
                  id="gap-note"
                  name="note"
                  rows={3}
                  placeholder="例如：希望补充超薄均热板工艺资料"
                />
                <button type="submit">提交知识缺口反馈</button>
              </form>
            </section>
          )
        ) : (
          <section className={styles.empty} aria-label="搜索提示">
            <h2>输入关键词开始搜索</h2>
            <p>
              支持按文章、主题、模板和书籍分组查找，并可筛选栏目、标签与更新时间。
            </p>
          </section>
        )}
      </main>
    </PortalShell>
  );
}

function flattenSections(tree: SectionNode[]) {
  const result: { id: string; name: string }[] = [];
  for (const section of tree) {
    result.push({ id: section.id, name: section.name });
    for (const child of section.children) {
      result.push({ id: child.id, name: `${section.name} / ${child.name}` });
    }
  }
  return result;
}

function ResultGroups({
  groups,
  query,
}: {
  groups: SearchGroups;
  query: string;
}) {
  const counts = {
    articles: groups.articles.length,
    topics: groups.topics.length,
    templates: groups.templates.length,
    books: groups.books.length,
  };
  return (
    <>
      <p className={styles.summary}>
        找到 {Object.values(counts).reduce((a, b) => a + b, 0)} 条结果
      </p>

      {groups.articles.length > 0 ? (
        <section className={styles.group} aria-label="文章">
          <h2>文章（{groups.articles.length}）</h2>
          <ul>
            {groups.articles.map((hit) => (
              <li key={hit.stableId}>
                <a href={`/articles/${hit.stableId}`} className={styles.result}>
                  <span className={styles.resultTitle}>
                    <HighlightText text={hit.title} query={query} />
                  </span>
                  <span className={styles.resultMeta}>
                    {hit.sectionName} · {hit.topicName} · 更新于{" "}
                    {formatDate(hit.updatedAt)}
                  </span>
                  {hit.snippet ? (
                    <span className={styles.snippet}>
                      <HighlightText text={hit.snippet} query={query} />
                    </span>
                  ) : null}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {groups.topics.length > 0 ? (
        <section className={styles.group} aria-label="主题">
          <h2>主题（{groups.topics.length}）</h2>
          <ul>
            {groups.topics.map((hit) => (
              <li key={hit.stableId}>
                <a
                  href={`/quality?topic=${hit.stableId}`}
                  className={styles.result}
                >
                  <span className={styles.resultTitle}>
                    <HighlightText text={hit.name} query={query} />
                  </span>
                  <span className={styles.resultMeta}>
                    {hit.sectionName}
                    {hit.matchedAlias ? ` · 别名：${hit.matchedAlias}` : ""}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {groups.templates.length > 0 ? (
        <section className={styles.group} aria-label="模板">
          <h2>模板（{groups.templates.length}）</h2>
          <ul>
            {groups.templates.map((hit) => (
              <li key={hit.stableId}>
                <a
                  href={`/templates/${hit.stableId}`}
                  className={styles.result}
                >
                  <span className={styles.resultTitle}>
                    <HighlightText text={hit.name} query={query} />
                  </span>
                  <span className={styles.resultMeta}>
                    {hit.categoryName} · 版本 {hit.versionLabel} · 更新于{" "}
                    {formatDate(hit.updatedAt)}
                  </span>
                  {hit.purpose ? (
                    <span className={styles.snippet}>
                      <HighlightText text={hit.purpose} query={query} />
                    </span>
                  ) : null}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {groups.books.length > 0 ? (
        <section className={styles.group} aria-label="书籍">
          <h2>书籍（{groups.books.length}）</h2>
          <ul>
            {groups.books.map((hit) => (
              <li key={hit.stableId}>
                <Link href="/books" className={styles.result}>
                  <span className={styles.resultTitle}>
                    <HighlightText text={hit.title} query={query} />
                  </span>
                  <span className={styles.resultMeta}>
                    {hit.author} · {hit.categoryName}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(value);
}
