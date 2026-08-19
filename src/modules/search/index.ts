import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { Sql } from "postgres";

import { createDatabaseClient } from "@/db/client";
import {
  articleAliases,
  articles,
  bookCategories,
  books,
  searchAggregates,
  searchEvents,
  sections,
  templateCategories,
  templateVersions,
  templates,
  topicAliases,
  topics,
} from "@/db/schema";

export type SearchContentType = "articles" | "topics" | "templates" | "books";

export type SearchFilters = {
  types?: SearchContentType[];
  sectionId?: string;
  tag?: string;
  updatedWithinDays?: number;
};

export type ArticleHit = {
  kind: "article";
  stableId: string;
  title: string;
  summary: string;
  topicName: string;
  topicStableId: string;
  sectionName: string;
  tags: string[];
  snippet: string | null;
  updatedAt: Date;
};

export type TopicHit = {
  kind: "topic";
  stableId: string;
  name: string;
  sectionName: string;
  matchedAlias: string | null;
};

export type TemplateHit = {
  kind: "template";
  stableId: string;
  name: string;
  purpose: string;
  categoryName: string;
  versionLabel: string;
  updatedAt: Date;
};

export type BookHit = {
  kind: "book";
  stableId: string;
  title: string;
  author: string;
  categoryName: string;
  tags: string[];
  updatedAt: Date;
};

export type SearchGroups = {
  articles: ArticleHit[];
  topics: TopicHit[];
  templates: TemplateHit[];
  books: BookHit[];
};

export type NoResultTerm = {
  query: string;
  count: number;
  lastSearchedAt: Date;
};

export type SearchService = {
  quickSearch(query: string, limit?: number): Promise<SearchGroups>;
  fullSearch(query: string, filters?: SearchFilters): Promise<SearchGroups>;
  recordSearch(input: {
    userId: string;
    query: string;
    hasResults: boolean;
    note?: string;
    occurredAt?: Date;
  }): Promise<void>;
  suggestAliases(query: string): Promise<string[]>;
  listNoResultTerms(limit?: number): Promise<NoResultTerm[]>;
};

const defaultTypeLimit = 5;
const hardResultLimit = 100;

const visibleArticleCondition = or(
  eq(articles.status, "published"),
  and(eq(articles.status, "draft"), sql`${articles.publishedAt} is not null`),
);

function tokenize(query: string): string[] {
  return query.trim().split(/\s+/u).filter(Boolean);
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function containsPattern(token: string): string {
  return `%${escapeLike(token)}%`;
}

function buildTokenConditions(token: string, fieldConditions: SQL[]): SQL {
  return or(...fieldConditions)!;
}

function lowerEquals(left: string, right: string): boolean {
  return left.toLocaleLowerCase("en-US") === right.toLocaleLowerCase("en-US");
}

function startsWith(left: string, right: string): boolean {
  return left
    .toLocaleLowerCase("en-US")
    .startsWith(right.toLocaleLowerCase("en-US"));
}

function rankToken(field: string, token: string): number {
  if (lowerEquals(field, token)) return 4;
  if (startsWith(field, token)) return 3;
  if (
    field.toLocaleLowerCase("en-US").includes(token.toLocaleLowerCase("en-US"))
  ) {
    return 2;
  }
  return 0;
}

function makeSnippet(text: string, token: string): string | null {
  const index = text
    .toLocaleLowerCase("en-US")
    .indexOf(token.toLocaleLowerCase("en-US"));
  if (index < 0) return null;
  const start = Math.max(0, index - 40);
  const end = Math.min(text.length, index + token.length + 80);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${
    end < text.length ? "…" : ""
  }`;
}

function levenshteinDistance(left: string, right: string): number {
  const a = left.toLocaleLowerCase("en-US");
  const b = right.toLocaleLowerCase("en-US");
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0]!;
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      previous[j] = Math.min(
        previous[j]! + 1,
        previous[j - 1]! + 1,
        diagonal + cost,
      );
      diagonal = above;
    }
  }
  return previous[b.length]!;
}

export function createSearchService(database: PGlite | Sql): SearchService {
  const client = createDatabaseClient(database);

  function articleWhere(
    tokens: string[],
    filters: Pick<SearchFilters, "sectionId" | "tag" | "updatedWithinDays">,
  ): SQL {
    const tokenConditions = tokens.map((token) =>
      buildTokenConditions(token, [
        sql`${articles.title} ilike ${containsPattern(token)}`,
        sql`${articles.summary} ilike ${containsPattern(token)}`,
        sql`${articles.bodyMarkdown} ilike ${containsPattern(token)}`,
        sql`${sections.name} ilike ${containsPattern(token)}`,
        sql`${topics.name} ilike ${containsPattern(token)}`,
        sql`${articles.tags}::text ilike ${containsPattern(token)}`,
        sql`exists (
          select 1 from article_aliases alias_row
          where alias_row.article_id = ${articles.id}
            and alias_row.alias ilike ${containsPattern(token)}
        )`,
      ]),
    );
    return and(
      visibleArticleCondition!,
      ...tokenConditions,
      filters.sectionId ? eq(topics.sectionId, filters.sectionId) : undefined,
      filters.tag ? sql`${articles.tags} @> ARRAY[${filters.tag}]` : undefined,
      filters.updatedWithinDays
        ? gte(
            articles.updatedAt,
            new Date(
              Date.now() - filters.updatedWithinDays * 24 * 60 * 60 * 1000,
            ),
          )
        : undefined,
    )!;
  }

  function topicWhere(tokens: string[], sectionId: string | undefined): SQL {
    const tokenConditions = tokens.map((token) =>
      buildTokenConditions(token, [
        sql`${topics.name} ilike ${containsPattern(token)}`,
        sql`${sections.name} ilike ${containsPattern(token)}`,
        sql`exists (
          select 1 from topic_aliases alias_row
          where alias_row.topic_id = ${topics.id}
            and alias_row.alias ilike ${containsPattern(token)}
        )`,
      ]),
    );
    return and(
      ...tokenConditions,
      sectionId ? eq(topics.sectionId, sectionId) : undefined,
      sql`exists (
        select 1 from articles visible_article
        where visible_article.primary_topic_id = ${topics.id}
          and (
            visible_article.status = 'published'
            or (
              visible_article.status = 'draft'
              and visible_article.published_at is not null
            )
          )
      )`,
    )!;
  }

  function templateWhere(tokens: string[]): SQL {
    const tokenConditions = tokens.map((token) =>
      buildTokenConditions(token, [
        sql`${templates.name} ilike ${containsPattern(token)}`,
        sql`${templates.purpose} ilike ${containsPattern(token)}`,
        sql`${templates.usageScenario} ilike ${containsPattern(token)}`,
        sql`${templateCategories.name} ilike ${containsPattern(token)}`,
        sql`exists (
          select 1 from template_versions version_row
          where version_row.template_id = ${templates.id}
            and version_row.status = 'active'
            and (
              version_row.version_label ilike ${containsPattern(token)}
              or version_row.change_note ilike ${containsPattern(token)}
            )
        )`,
      ]),
    );
    return and(
      eq(templates.status, "published"),
      ...tokenConditions,
      sql`exists (
        select 1 from template_versions version_row
        where version_row.template_id = ${templates.id}
          and version_row.status = 'active'
      )`,
    )!;
  }

  function bookWhere(tokens: string[], tag: string | undefined): SQL {
    const tokenConditions = tokens.map((token) =>
      buildTokenConditions(token, [
        sql`${books.title} ilike ${containsPattern(token)}`,
        sql`${books.author} ilike ${containsPattern(token)}`,
        sql`${books.recommendation} ilike ${containsPattern(token)}`,
        sql`${bookCategories.name} ilike ${containsPattern(token)}`,
        sql`${books.tags}::text ilike ${containsPattern(token)}`,
      ]),
    );
    return and(
      ...tokenConditions,
      tag ? sql`${books.tags} @> ARRAY[${tag}]` : undefined,
    )!;
  }

  async function searchArticles(
    tokens: string[],
    filters: SearchFilters,
    limit: number,
  ): Promise<ArticleHit[]> {
    const rows = await client
      .select({
        id: articles.id,
        stableId: articles.stableId,
        title: articles.title,
        summary: articles.summary,
        bodyMarkdown: articles.bodyMarkdown,
        topicName: topics.name,
        topicStableId: topics.stableId,
        sectionName: sections.name,
        tags: articles.tags,
        updatedAt: articles.updatedAt,
      })
      .from(articles)
      .innerJoin(topics, eq(articles.primaryTopicId, topics.id))
      .innerJoin(sections, eq(topics.sectionId, sections.id))
      .where(
        articleWhere(tokens, {
          sectionId: filters.sectionId,
          tag: filters.tag,
          updatedWithinDays: filters.updatedWithinDays,
        }),
      )
      .orderBy(desc(articles.updatedAt))
      .limit(hardResultLimit);

    const ids = rows.map((row) => row.id);
    const aliasRows = ids.length
      ? await client
          .select({
            articleId: articleAliases.articleId,
            alias: articleAliases.alias,
          })
          .from(articleAliases)
          .where(inArray(articleAliases.articleId, ids))
      : [];
    const aliasesByArticle = new Map<string, string[]>();
    for (const aliasRow of aliasRows) {
      const list = aliasesByArticle.get(aliasRow.articleId) ?? [];
      list.push(aliasRow.alias);
      aliasesByArticle.set(aliasRow.articleId, list);
    }

    const ranked = rows
      .map((row) => {
        const aliases = aliasesByArticle.get(row.id) ?? [];
        const score = tokens.reduce((total, token) => {
          const fields = [
            row.title,
            row.summary,
            row.bodyMarkdown,
            row.topicName,
            row.sectionName,
            row.tags.join(" "),
          ];
          const fieldScore = Math.max(
            ...fields.map((field) => rankToken(field, token)),
          );
          const aliasScore = aliases.some((alias) => lowerEquals(alias, token))
            ? 4
            : aliases.some((alias) =>
                  alias
                    .toLocaleLowerCase("en-US")
                    .includes(token.toLocaleLowerCase("en-US")),
                )
              ? 1
              : 0;
          return total + Math.max(fieldScore, aliasScore);
        }, 0);
        return { row, score };
      })
      .filter((item) => item.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.row.updatedAt.getTime() - a.row.updatedAt.getTime(),
      )
      .slice(0, limit);

    return ranked.map(({ row }) => {
      const snippetToken =
        tokens.find((token) => makeSnippet(row.summary, token) !== null) ??
        tokens.find((token) => makeSnippet(row.bodyMarkdown, token) !== null);
      return {
        kind: "article" as const,
        stableId: row.stableId,
        title: row.title,
        summary: row.summary,
        topicName: row.topicName,
        topicStableId: row.topicStableId,
        sectionName: row.sectionName,
        tags: row.tags,
        snippet: snippetToken
          ? (makeSnippet(row.summary, snippetToken) ??
            makeSnippet(row.bodyMarkdown, snippetToken))
          : null,
        updatedAt: row.updatedAt,
      };
    });
  }

  async function searchTopics(
    tokens: string[],
    sectionId: string | undefined,
    limit: number,
  ): Promise<TopicHit[]> {
    const rows = await client
      .select({
        id: topics.id,
        stableId: topics.stableId,
        name: topics.name,
        sectionName: sections.name,
      })
      .from(topics)
      .innerJoin(sections, eq(topics.sectionId, sections.id))
      .where(topicWhere(tokens, sectionId))
      .orderBy(asc(topics.name))
      .limit(hardResultLimit);

    const ids = rows.map((row) => row.id);
    const aliasRows = ids.length
      ? await client
          .select({
            topicId: topicAliases.topicId,
            alias: topicAliases.alias,
          })
          .from(topicAliases)
          .where(inArray(topicAliases.topicId, ids))
      : [];
    const aliasesByTopic = new Map<string, string[]>();
    for (const aliasRow of aliasRows) {
      const list = aliasesByTopic.get(aliasRow.topicId) ?? [];
      list.push(aliasRow.alias);
      aliasesByTopic.set(aliasRow.topicId, list);
    }

    const ranked = rows
      .map((row) => {
        const aliases = aliasesByTopic.get(row.id) ?? [];
        let matchedAlias: string | null = null;
        const score = tokens.reduce((total, token) => {
          let best = Math.max(
            rankToken(row.name, token),
            rankToken(row.sectionName, token),
          );
          for (const alias of aliases) {
            if (lowerEquals(alias, token)) {
              matchedAlias = alias;
              best = Math.max(best, 4);
            } else if (
              alias
                .toLocaleLowerCase("en-US")
                .includes(token.toLocaleLowerCase("en-US"))
            ) {
              matchedAlias ??= alias;
              best = Math.max(best, 1);
            }
          }
          return total + best;
        }, 0);
        return { row, score, matchedAlias };
      })
      .filter((item) => item.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score || a.row.name.localeCompare(b.row.name, "zh-CN"),
      )
      .slice(0, limit);

    return ranked.map(({ row, matchedAlias }) => ({
      kind: "topic" as const,
      stableId: row.stableId,
      name: row.name,
      sectionName: row.sectionName,
      matchedAlias,
    }));
  }

  async function searchTemplates(
    tokens: string[],
    limit: number,
  ): Promise<TemplateHit[]> {
    const rows = await client
      .select({
        id: templates.id,
        stableId: templates.stableId,
        name: templates.name,
        purpose: templates.purpose,
        categoryName: templateCategories.name,
        updatedAt: templates.updatedAt,
      })
      .from(templates)
      .innerJoin(
        templateCategories,
        eq(templates.categoryId, templateCategories.id),
      )
      .where(templateWhere(tokens))
      .orderBy(desc(templates.updatedAt))
      .limit(hardResultLimit);

    const ids = rows.map((row) => row.id);
    const versionRows = ids.length
      ? await client
          .select({
            templateId: templateVersions.templateId,
            versionLabel: templateVersions.versionLabel,
            version: templateVersions.version,
            changeNote: templateVersions.changeNote,
          })
          .from(templateVersions)
          .where(
            and(
              inArray(templateVersions.templateId, ids),
              eq(templateVersions.status, "active"),
            ),
          )
      : [];
    const versionByTemplate = new Map<
      string,
      { versionLabel: string; changeNote: string; version: number }
    >();
    for (const versionRow of versionRows) {
      const current = versionByTemplate.get(versionRow.templateId);
      if (!current || versionRow.version > current.version) {
        versionByTemplate.set(versionRow.templateId, {
          versionLabel: versionRow.versionLabel,
          changeNote: versionRow.changeNote,
          version: versionRow.version,
        });
      }
    }

    const ranked = rows
      .map((row) => {
        const version = versionByTemplate.get(row.id);
        const score = tokens.reduce((total, token) => {
          const fields = [
            row.name,
            row.purpose,
            row.categoryName,
            version?.versionLabel ?? "",
            version?.changeNote ?? "",
          ];
          return (
            total + Math.max(...fields.map((field) => rankToken(field, token)))
          );
        }, 0);
        return { row, score, version };
      })
      .filter((item) => item.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.row.updatedAt.getTime() - a.row.updatedAt.getTime(),
      )
      .slice(0, limit);

    return ranked.map(({ row, version }) => ({
      kind: "template" as const,
      stableId: row.stableId,
      name: row.name,
      purpose: row.purpose,
      categoryName: row.categoryName,
      versionLabel: version?.versionLabel ?? "",
      updatedAt: row.updatedAt,
    }));
  }

  async function searchBooks(
    tokens: string[],
    tag: string | undefined,
    limit: number,
  ): Promise<BookHit[]> {
    const rows = await client
      .select({
        id: books.id,
        stableId: books.stableId,
        title: books.title,
        author: books.author,
        categoryName: bookCategories.name,
        tags: books.tags,
        updatedAt: books.updatedAt,
      })
      .from(books)
      .innerJoin(bookCategories, eq(books.categoryId, bookCategories.id))
      .where(bookWhere(tokens, tag))
      .orderBy(desc(books.updatedAt))
      .limit(hardResultLimit);

    const ranked = rows
      .map((row) => {
        const score = tokens.reduce((total, token) => {
          const fields = [
            row.title,
            row.author,
            row.categoryName,
            row.tags.join(" "),
          ];
          return (
            total + Math.max(...fields.map((field) => rankToken(field, token)))
          );
        }, 0);
        return { row, score };
      })
      .filter((item) => item.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.row.updatedAt.getTime() - a.row.updatedAt.getTime(),
      )
      .slice(0, limit);

    return ranked.map(({ row }) => ({
      kind: "book" as const,
      stableId: row.stableId,
      title: row.title,
      author: row.author,
      categoryName: row.categoryName,
      tags: row.tags,
      updatedAt: row.updatedAt,
    }));
  }

  async function runSearch(
    query: string,
    filters: SearchFilters,
    limit: number,
  ): Promise<SearchGroups> {
    const tokens = tokenize(query);
    const empty: SearchGroups = {
      articles: [],
      topics: [],
      templates: [],
      books: [],
    };
    if (tokens.length === 0) return empty;

    const types = filters.types ?? ["articles", "topics", "templates", "books"];
    const [articleRows, topicRows, templateRows, bookRows] = await Promise.all([
      types.includes("articles")
        ? searchArticles(tokens, filters, limit)
        : Promise.resolve<ArticleHit[]>([]),
      types.includes("topics")
        ? searchTopics(tokens, filters.sectionId, limit)
        : Promise.resolve<TopicHit[]>([]),
      types.includes("templates") && !filters.sectionId && !filters.tag
        ? searchTemplates(tokens, limit)
        : Promise.resolve<TemplateHit[]>([]),
      types.includes("books")
        ? searchBooks(tokens, filters.tag, limit)
        : Promise.resolve<BookHit[]>([]),
    ]);

    return {
      articles: articleRows,
      topics: topicRows,
      templates: templateRows,
      books: bookRows,
    };
  }

  return {
    async quickSearch(query, limit = defaultTypeLimit) {
      return runSearch(query, {}, limit);
    },

    async fullSearch(query, filters = {}) {
      return runSearch(query, filters, hardResultLimit);
    },

    async recordSearch({
      userId,
      query,
      hasResults,
      note,
      occurredAt = new Date(),
    }) {
      const trimmed = query.trim();
      if (!trimmed) return;
      await client.transaction(async (transaction) => {
        await transaction.insert(searchEvents).values({
          id: randomUUID(),
          userId,
          query: trimmed,
          hasResults,
          note: note?.trim() || null,
          createdAt: occurredAt,
        });
        await transaction
          .insert(searchAggregates)
          .values({
            query: trimmed,
            hasResults,
            searchCount: 1,
            lastSearchedAt: occurredAt,
          })
          .onConflictDoUpdate({
            target: searchAggregates.query,
            set: {
              hasResults,
              searchCount: sql`${searchAggregates.searchCount} + 1`,
              lastSearchedAt: occurredAt,
            },
          });
      });
    },

    async suggestAliases(query) {
      const tokens = tokenize(query);
      if (tokens.length === 0) return [];
      const topicAliasRows = await client
        .select({ alias: topicAliases.alias })
        .from(topicAliases);
      const articleAliasRows = await client
        .select({ alias: articleAliases.alias })
        .from(articleAliases);
      const aliases = Array.from(
        new Set([
          ...topicAliasRows.map((row) => row.alias),
          ...articleAliasRows.map((row) => row.alias),
        ]),
      );

      return aliases
        .map((alias) => {
          let distance = Number.POSITIVE_INFINITY;
          for (const token of tokens) {
            const lowerAlias = alias.toLocaleLowerCase("en-US");
            const lowerToken = token.toLocaleLowerCase("en-US");
            if (lowerAlias === lowerToken) {
              distance = Math.min(distance, 0);
            } else if (
              lowerAlias.includes(lowerToken) ||
              lowerToken.includes(lowerAlias)
            ) {
              distance = Math.min(distance, 1);
            } else {
              distance = Math.min(distance, levenshteinDistance(alias, token));
            }
          }
          return { alias, distance };
        })
        .filter((item) => item.distance <= 2)
        .sort(
          (a, b) =>
            a.distance - b.distance ||
            a.alias.length - b.alias.length ||
            a.alias.localeCompare(b.alias, "zh-CN"),
        )
        .slice(0, 8)
        .map((item) => item.alias);
    },

    async listNoResultTerms(limit = 20) {
      const rows = await client
        .select({
          query: searchAggregates.query,
          count: searchAggregates.searchCount,
          lastSearchedAt: searchAggregates.lastSearchedAt,
        })
        .from(searchAggregates)
        .where(eq(searchAggregates.hasResults, false))
        .orderBy(
          desc(searchAggregates.searchCount),
          desc(searchAggregates.lastSearchedAt),
        )
        .limit(limit);
      return rows.map((row) => ({
        query: row.query,
        count: row.count,
        lastSearchedAt: row.lastSearchedAt,
      }));
    },
  };
}
