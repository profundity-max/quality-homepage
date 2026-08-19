# ADR 0009: Statistics retention and anonymization

- Status: Accepted
- Date: 2026-08-19
- Related: STAT-01/03/06/08/09/11, SEARCH-07, FILE-04

## Context

Content statistics need exact per-account reach and search records, while
`STAT-08` requires that identity-bearing detail rows are kept for only 90 days,
after which only anonymous aggregates remain. `STAT-03` asks for reach over
7/30/90 days and all time; `STAT-11` requires compliant cleanup that never
rewrites aggregate numbers.

## Decision

1. **Detail rows** (`article_read_events`, `search_events`,
   `template_download_events`) store user identity and are purged after 90
   days by an administrator-triggered cleanup (or the ops script
   `scripts/purge-identity-details.ts`).
2. **Anonymous aggregates** are maintained incrementally at write time and are
   never recomputed during cleanup:
   - `articles.read_count` and `template_versions.download_count` hold total
     counts.
   - `article_daily_reach` holds distinct readers per article per UTC day.
   - `search_aggregates` holds per-term anonymous totals and last-search time.
3. **Reach semantics**: 7/30/90-day reach is exact distinct-user counting over
   retained detail rows. All-time reach is the retained distinct-user count
   plus the daily aggregate sum; once a day's detail rows are purged, that
   day's users cannot be de-duplicated against later users, so the all-time
   figure is a documented approximation. The UI labels the periods and the
   retention note.
4. **No identity export**: the aggregate CSV export never contains usernames
   or user IDs; identity detail is view-only, admin-only, and limited to the
   last 90 days.
5. A read counts toward statistics only for the first open by the same user
   within 30 minutes (`STAT-01`), and editor/admin previews never count
   (`STAT-02`).

## Consequences

- Exact all-time reach is only guaranteed while detail rows exist; after the
  first purge the all-time figure becomes an upper-bound approximation.
- Daily reach and search aggregates require no migration-time backfill; they
  are built from the first day of the feature.
- Cleanup is idempotent and safe to run repeatedly; it cannot inflate or
  deflate aggregate counts.
