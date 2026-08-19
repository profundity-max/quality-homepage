# Slice 5: Search, Favorites, Feedback, and Content Statistics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or implement task-by-task with TDD at pre-agreed seams). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver full-site PostgreSQL search (articles, topics, templates, books, aliases), reader favorites, five-type content feedback with editor processing, and permission-graded content statistics (read counts with 30-minute dedup, reach, search records, download counts, 90-day identity retention).

**Acceptance focus** (per `docs/plans/product-delivery-roadmap.md`): SEARCH-01–08, FAV-01/02, FDBK-01–03, STAT-01–11.

## Global Constraints (inherited)

- Product copy uses `品集｜Q Nexus` and `CONTEXT.md` vocabulary.
- Only module `index.ts` is public; pages and actions never import `internal/` or Drizzle schema directly from a module.
- Migrations are reviewed SQL under `drizzle/`; every migration is idempotent and appends to `schema_migrations`.
- All searches, read records, favorites, feedback, and statistics operate against the same PostgreSQL/PGlite database; no new search service (SEARCH-08).
- Identity-bearing detail rows (search, read, download events) are purged after 90 days; anonymous aggregates persist (STAT-08).
- Statistics are never framed as performance/training evidence (STAT-10); no reach-identity export (STAT-07).
- Chinese matching uses character-level `ILIKE` substring matching; PGlite does not bundle `pg_trgm`, so no similarity extension is introduced.
- Every task leaves format, lint, typecheck, and relevant tests passing; full gate once at the end (T8).

## Data Design Decisions

1. **Read dedup (STAT-01):** `article_read_events(article_id, user_id, read_at)`. A read counts when no event exists for the same user/article within the preceding 30 minutes; the count is atomic in one transaction and also updates `articles.read_count`.
2. **Reach and retention (STAT-03/08):** reach for 7/30/90-day windows is exact distinct-user counting over `article_read_events`. `article_daily_reach(article_id, read_day, reach_count)` is an anonymous daily-distinct aggregate. The 90-day purge snapshots purged days into `article_daily_reach` first, then deletes detail rows. All-time reach is the daily aggregate sum plus distinct users from retained detail; the dashboard labels this semantics.
3. **Search records (STAT-09):** `search_events(user_id, query, has_results, note, created_at)` records every executed search; `search_aggregates(query, has_results, search_count, last_searched_at)` retains anonymous long-term totals for knowledge-gap analysis.
4. **Downloads (FILE-04/STAT-04):** `template_download_events` records per-user downloads; `template_versions.download_count` remains the long-term aggregate.
5. **Favorites (FAV-01):** `article_favorites(article_id, user_id)` unique pair; only the owner queries it.
6. **Feedback (FDBK-01/02/03):** `content_feedback(article_id, reporter_user_id, feedback_type, description, status, handled_by, handled_at, created_at)` with checks on the five types and three statuses.

## File Map (new/modified)

```text
drizzle/0013_search_engagement.sql        # Migration
src/db/schema.ts                          # Drizzle mirrors for new tables
src/modules/search/index.ts               # Deep search module
src/modules/favorites/index.ts            # Favorites module
src/modules/feedback/index.ts             # Feedback module
src/modules/content-stats/index.ts        # Stats/retention module
src/app/search/page.tsx                   # Full results page
src/app/search/search.module.css
src/app/api/search/quick/route.ts         # Quick-search JSON (session-guarded)
src/app/favorites/page.tsx                # Personal favorites list
src/app/articles/[stableId]/actions.ts    # Favorite/feedback server actions
src/app/manage/feedback/page.tsx          # Editor feedback processing
src/app/manage/stats/page.tsx             # Editor/admin stats dashboard
src/app/page.tsx                          # Home hero quick-search launcher
src/app/portal-shell.tsx                  # 收藏 header link
src/app/templates/[stableId]/download/route.ts  # Record download event
src/modules/knowledge-publishing/index.ts # recordRead kept for compat; page switches to stats module
scripts/purge-identity-details.ts         # Ops retention command
scripts/seed-e2e.ts                       # Search/favorite/feedback/stats seed data
tests/module/search-service.test.ts
tests/module/favorites.test.ts
tests/module/feedback.test.ts
tests/module/content-stats.test.ts
tests/integration/search-engagement-migration.test.ts
tests/e2e/search.spec.ts
tests/e2e/favorites.spec.ts
tests/e2e/feedback.spec.ts
tests/e2e/stats.spec.ts
```

---

### Task 1: Search and Engagement Data Model

**Files:** create `drizzle/0013_search_engagement.sql`; modify `src/db/schema.ts`; create `tests/integration/search-engagement-migration.test.ts`.

**Produced interfaces:** Drizzle tables `articleFavorites`, `contentFeedback`, `searchEvents`, `searchAggregates`, `articleReadEvents`, `articleDailyReach`, `templateDownloadEvents` mirroring reviewed SQL.

- [x] Step 1: Write the failing migration test (tables exist; unique favorite pair; feedback type/status checks; search event retention columns; daily reach upsert key).
- [x] Step 2: Run and verify FAIL because tables are absent.
- [x] Step 3: Write `0013_search_engagement.sql` with the tables, checks, and indexes above; append to `schema_migrations`.
- [x] Step 4: Mirror in `src/db/schema.ts` and export through the appropriate schema group.
- [x] Step 5: Verify and commit.

```bash
npm run format && npm run lint && npm run typecheck
npm test -- tests/integration/search-engagement-migration.test.ts
git add drizzle src/db/schema.ts tests/integration
git commit -m "feat: add search, favorites, feedback and stats data model"
```

### Task 2: Search Service Module

**Files:** create `src/modules/search/index.ts`, `tests/module/search-service.test.ts`.

**Interfaces:**

```ts
type SearchContentType = "articles" | "topics" | "templates" | "books";
type SearchFilters = { types: SearchContentType[]; sectionId?: string; tag?: string; updatedWithinDays?: number };
type QuickSearchResult = { articles: ArticleHit[]; topics: TopicHit[]; templates: TemplateHit[]; books: BookHit[] };

SearchService {
  quickSearch(query: string, limit?: number): Promise<QuickSearchResult>;
  fullSearch(query: string, filters: SearchFilters): Promise<QuickSearchResult>;
  recordSearch(input: { userId: string; query: string; hasResults: boolean; note?: string; occurredAt?: Date }): Promise<void>;
  suggestAliases(query: string): Promise<string[]>;
  listNoResultTerms(limit: number): Promise<{ query: string; count: number; lastSearchedAt: Date }[]>;
}
```

- [x] Step 1: Failing tests: Chinese/English/alias hits (“标准差”“σ”“Sigma” resolve the same topic), grouped quick search, full-search filters, no-result alias hints, search recording, no-result term listing.
- [x] Step 2: Implement with `ILIKE` over tokenized query; articles match title/summary/body/section/topic/tags/aliases; topics match name/aliases (only topics with published articles, IA-08); templates match name/purpose/scenario/active version note; books match title/author/recommendation/category/tags. Rank by exact > prefix > contains; snippet extraction for body matches; alias hints via substring/prefix/Levenshtein (JS helper, engine-independent).
- [x] Step 3: Verify and commit.

```bash
npm run format && npm run lint && npm run typecheck
npm test -- tests/module/search-service.test.ts
git add src/modules/search tests/module/search-service.test.ts
git commit -m "feat: implement PostgreSQL full-site search service"
```

### Task 3: Quick Search Panel and Full Results Page

**Files:** create `src/app/api/search/quick/route.ts`, `src/app/search/page.tsx`, `search.module.css`, `src/ui/search/quick-search.tsx`; modify `src/app/page.tsx`, `home.module.css`.

**Interfaces:** `GET /api/search/quick?q=` (session-guarded, returns grouped JSON); `/search?q=&types=&section=&tag=&updated=` full page with filters, `<mark>` highlighting, no-result alias hints plus “知识缺口” note submission (SEARCH-07); home hero launcher opens the centered quick panel (SEARCH-05) with arrow-key navigation and “查看全部”.

- [x] Step 1: Failing UI/module tests for the route contract and no-result behavior; update `tests/e2e/editorial-home.spec.ts` placeholder expectation.
- [x] Step 2: Implement route, client panel, and results page; every executed search writes `search_events`.
- [x] Step 3: Verify and commit.

```bash
npm run format && npm run lint && npm run typecheck
npm test -- tests/module/search-service.test.ts
npm run build
git add src/app src/ui
git commit -m "feat: add quick search panel and full search results page"
```

### Task 4: Favorites

**Files:** create `src/modules/favorites/index.ts`, `tests/module/favorites.test.ts`, `src/app/favorites/page.tsx`; modify article page/actions and `portal-shell.tsx` (收藏 link).

**Interfaces:**

```ts
FavoritesService {
  listFavorites(userId): Promise<ArticleSummary[]>;
  isFavorite(userId, articleId): Promise<boolean>;
  toggleFavorite(userId, articleId): Promise<{ favorite: boolean }>;
}
```

- [x] Step 1: Failing module tests (toggle on/off, only published articles, per-user isolation).
- [x] Step 2: Implement module; article page button with server action; `/favorites` list page.
- [x] Step 3: Verify and commit.

```bash
npm run format && npm run lint && npm run typecheck
npm test -- tests/module/favorites.test.ts
git add src/modules/favorites src/app
git commit -m "feat: add personal article favorites"
```

### Task 5: Content Feedback

**Files:** create `src/modules/feedback/index.ts`, `tests/module/feedback.test.ts`, `src/app/manage/feedback/page.tsx`; modify article page/actions.

**Interfaces:** `submitFeedback`, `listFeedback({ status?, limit })`, `resolveFeedback({ id, handledBy, status: "resolved" | "ignored", note? })`; five types (`error/outdated/unclear/missing/other` → 内容错误/内容过期/表述不清/缺少相关内容/其他).

- [x] Step 1: Failing module tests (five types, required description, editor-only processing, status transitions).
- [x] Step 2: Article-page dialog + action; `/manage/feedback` list with resolve/ignore (editor+admin via service-level `assertEditor`).
- [x] Step 3: Verify and commit.

```bash
npm run format && npm run lint && npm run typecheck
npm test -- tests/module/feedback.test.ts
git add src/modules/feedback src/app
git commit -m "feat: add content feedback submission and processing"
```

### Task 6: Content Statistics Module

**Files:** create `src/modules/content-stats/index.ts`, `tests/module/content-stats.test.ts`; modify article page read recording and template download route.

**Interfaces:**

```ts
ContentStatsService {
  recordArticleRead(input: { articleId: string; userId: string; instant?: Date }): Promise<boolean>; // false = dedup
  recordTemplateDownload(input: { templateVersionId: string; userId: string; instant?: Date }): Promise<void>;
  editorDashboard(now: Date): Promise<EditorDashboard>; // hot, high-reach, growth, long-unread, search-driven opens, no-result terms, template downloads
  reachStats(articleIds: string[], now: Date): Promise<Record<string, { d7: number; d30: number; d90: number; all: number }>>;
  listIdentitySearchDetail(limit: number): Promise<IdentitySearchRecord[]>;  // admin gate in web layer
  listIdentityReachDetail(limit: number): Promise<IdentityReachRecord[]>;
  purgeIdentityDetails(before: Date): Promise<PurgeSummary>;  // snapshots daily reach, deletes detail rows
  exportAggregateStats(): Promise<string>;                    // CSV without identity
}
```

- [x] Step 1: Failing module tests (30-minute dedup, daily reach, growth window, long-unread, search-driven open, purge preserves aggregates).
- [x] Step 2: Implement; article page records via stats module (editors/admins still excluded, STAT-02); download route records events.
- [x] Step 3: Verify and commit.

```bash
npm run format && npm run lint && npm run typecheck
npm test -- tests/module/content-stats.test.ts
git add src/modules/content-stats src/app
git commit -m "feat: implement content statistics with dedup and retention"
```

### Task 7: Statistics Dashboard

**Files:** create `src/app/manage/stats/page.tsx`, `actions.ts`; modify `src/app/manage/page.tsx` links.

- Editors see aggregate dashboard + CSV export (STAT-05/06/07); admins additionally see 90-day identity search/reach detail and the “执行合规数据清理” action (STAT-06/08/11). STAT-10 declaration rendered on the page. `assertEditor`/`assertAdministrator` at service level; readers redirected.
- [x] Step 1: Failing role/e2e checks; STAT-10 text test.
- [x] Step 2: Implement dashboard (metric cards + tables + export + cleanup button).
- [x] Step 3: Verify and commit.

```bash
npm run format && npm run lint && npm run typecheck
npm test -- tests/module/content-stats.test.ts
git add src/app/manage
git commit -m "feat: add editor and administrator statistics dashboard"
```

### Task 8: Seed Data, End-to-End Acceptance, and Slice Gate

**Files:** modify `scripts/seed-e2e.ts`; create `tests/e2e/search.spec.ts`, `favorites.spec.ts`, `feedback.spec.ts`, `stats.spec.ts`; update `CONTEXT.md` if vocabulary is missing; optionally ADR for retention semantics; update roadmap checkbox state.

- [x] Step 1: Seed published articles with aliases, templates, books; seed read/search/download events in the e2e database.
- [x] Step 2: E2E coverage: search by title/body/alias, quick panel keyboard, filters, no-result gap note; favorite/unfavorite lifecycle; five-type feedback + editor resolve; stats role gates, dedup read, retention declaration.
- [x] Step 3: Full gate and close tickets with acceptance evidence:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
# e2e per docs/operations/local-runbook.md
git add .
git commit -m "feat: complete Slice 5 search, favorites, feedback and statistics"
```

## Self-Review Targets

- SEARCH-01–08 all have module or e2e coverage; alias acceptance example (“标准差”“σ”“Sigma”) covered.
- FAV-01/02, FDBK-01–03 covered; no public comment area or recent-reading list appears.
- STAT-01/02 dedup and preview exclusion covered; STAT-03 reach windows; STAT-04 all dashboard cards; STAT-05 reader sees only count; STAT-06 admin-only detail; STAT-07 no identity export (aggregate CSV only); STAT-08 purge; STAT-09 records; STAT-10 declaration; STAT-11 cleanup without touching aggregates.
- No new runtime dependency, CDN, or external service; offline operation preserved.
