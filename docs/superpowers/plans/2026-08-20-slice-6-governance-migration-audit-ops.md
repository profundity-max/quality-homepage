# Slice 6: Governance, Migration, Audit, and Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (task-by-task with TDD at module seams). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Complete the governance loop: content audit, recycle bin with 30-day retention, Markdown import/export, encrypted daily/weekly backups with retention, case-desensitization confirmation on publish, audit/backup admin pages, and the launch runbook + acceptance checklist. This is the last slice before the formal launch acceptance.

**Acceptance focus** (roadmap Slice 6): PORT-01–10, DEL-01–03, AUDIT-01–03, SEC-07, OPS-10/12, BKP-01–06, AVL-01–03, plus the complete launch checklist in `docs/requirements/acceptance-criteria.md`.

## Global Constraints (inherited)

- Only module `index.ts` is public; pages/actions never import schema directly from a module.
- Migrations are idempotent reviewed SQL under `drizzle/` appended to `schema_migrations`.
- Content audit is append-only and retained ≥ 1 year; no ordinary admin UI can edit it (AUDIT-03).
- Recycle bin keeps archived content 30 days before permanent cleanup is allowed (DEL-02); permanent cleanup never deletes images still referenced by any historical version (DEL-03).
- Import never overwrites existing content (PORT-04); imported drafts must still satisfy publish requirements (PORT-05).
- Backups are encrypted (BKP-04), keep 7 daily + 8 weekly (BKP-02), and never run inside the browser (OPS-11; admin page only reports status).
- All work stays offline-runnable; no new runtime dependencies.

## Data Design Decisions

1. **Content audit** (`content_audit_events`): append-only table mirroring `identity_audit_events`, with `actor_user_id`, `event_type`, `target_type`, `target_id`, `reason`, `metadata jsonb`, `occurred_at`; a trigger rejects update/delete. Audit events recorded for: article publish/restore/archive/review-confirm, template upload/publish/archive, section/topic create/rename/archive/move, template download, feedback processing, backup start/finish/fail, recycle-bin restore/permanent delete.
2. **Recycle bin**: add `archived_at timestamptz` to `articles` and `templates` (set on archive; restores clear it). Recycle bin lists items archived within 30 days; permanent delete allowed only after 30 days, and only after confirming no image reference from any `article_versions` body or current body.
3. **Import/export package**: YAML frontmatter holds `title`, `summary`, `topic` (stable id), `tags`, `aliases`, `owner` (username), `status`, `reviewed_at`, `next_review_at`. Single-article export bundles referenced images into a ZIP (PORT-06); full-site export writes `sections/`, `topics/`, `articles/` plus `manifest.yaml` and keeps templates as a separate folder (PORT-07/08/09).
4. **Backups**: `backups` table records kind (daily/weekly/manual), status, started/finished at, error, target path, encrypted flag, byte size, checksum. Encryption is AES-256-GCM with a passphrase from `BACKUP_PASSPHRASE` (BKP-04; custody is a human acceptance item). Retention deletes beyond 7 daily and 8 weekly. Production backup snapshots PostgreSQL via `pg_dump` (exec through the runtime) and copies the controlled data directory; tests use an in-memory fake.

## File Map (new/modified)

```text
drizzle/0014_governance_audit_recycle.sql   # audit table + archived_at columns
src/db/schema.ts                            # mirrors
src/modules/content-audit/index.ts          # audit module (record/list)
src/modules/recycle-bin/index.ts            # list/restore/permanent-delete
src/modules/markdown-package/index.ts       # frontmatter parse/serialize + ZIP helpers
src/modules/content-migration/index.ts      # import (single/ZIP/batch preflight) + export (single/full)
src/modules/backup/index.ts                 # backup/restore/retention module
src/app/manage/audit/page.tsx               # admin audit viewer
src/app/manage/recycle-bin/page.tsx         # admin recycle bin
src/app/manage/import/page.tsx              # editor single/ZIP import + admin batch preflight
src/app/manage/export/page.tsx              # admin full-site export
src/app/manage/backups/page.tsx             # admin backup status + manual trigger
src/modules/knowledge-editing/index.ts      # archive records archived_at; publish requires desensitization confirmation for case articles
src/modules/template-service/index.ts       # archive template (archived_at)
scripts/backup.mjs                          # daily/weekly backup command (cron-compatible)
scripts/restore.mjs                         # restore command + dry-run
docs/operations/ops-runbook.md              # OPS-10/12, BKP-03/04/06, AVL runbook + log rotation
docs/operations/launch-checklist.md         # complete launch acceptance checklist (human items)
tests/integration/governance-migration.test.ts
tests/module/content-audit.test.ts
tests/module/recycle-bin.test.ts
tests/module/markdown-package.test.ts
tests/module/content-migration.test.ts
tests/module/backup.test.ts
tests/e2e/recycle-bin.spec.ts
tests/e2e/migration-export.spec.ts
tests/e2e/audit-backup.spec.ts
```

---

### Task 1: Content Audit Foundation

**Files:** `drizzle/0014_governance_audit_recycle.sql` (audit table only), `src/db/schema.ts`, `src/modules/content-audit/index.ts`, `tests/integration/governance-migration.test.ts`, `tests/module/content-audit.test.ts`.

- [ ] Step 1: Failing migration test: audit table exists, update/delete rejected, indexes present.
- [ ] Step 2: Migration + Drizzle mirror; module `record(event)` and `listAuditEvents({ actorUserId?, eventType?, limit? })` (editor/admin gate).
- [ ] Step 3: Wire recording into knowledge-editing publish/restore/archive/confirmStillValid, template upload/publish/archive, knowledge-administration section/topic operations, feedback resolution, recycle-bin operations, backup events (interfaces stubbed by later tasks where needed).
- [ ] Step 4: Verify and commit.

### Task 2: Recycle Bin

**Files:** extend `0014` with `archived_at` columns; `src/modules/recycle-bin/index.ts`; `/manage/recycle-bin` page + actions; modify `knowledge-editing.archiveArticle` and add `template-service.archiveTemplate`.

- [ ] Step 1: Failing module tests: archive sets `archived_at`; list shows only archived; restore returns to previous status; permanent delete refused before 30 days; permanent delete blocked when any version body references an image.
- [ ] Step 2: Implement module + wiring + page (tabs: 文章/模板/栏目主题).
- [ ] Step 3: Verify and commit.

### Task 3: Markdown Import

**Files:** `src/modules/markdown-package/index.ts`, `src/modules/content-migration/index.ts` (import half), `/manage/import` page + actions.

- [ ] Step 1: Failing module tests: single `.md` with frontmatter → draft; missing topic → preflight error; ZIP with images imports images into controlled storage and rewrites refs; batch preflight lists 新增/跳过/冲突 without writing; conflict import refused.
- [ ] Step 2: Implement parse/serialize + import service + page.
- [ ] Step 3: Verify and commit.

### Task 4: Markdown Export

**Files:** `src/modules/content-migration/index.ts` (export half), `/manage/export` page, article-page export entry.

- [ ] Step 1: Failing module tests: single-article ZIP round-trips body + images; full-site export writes manifest + sections/topics/articles with frontmatter; templates folder separate (PORT-09); export readable in plain Markdown tools.
- [ ] Step 2: Implement export service + pages.
- [ ] Step 3: Verify and commit.

### Task 5: Backup and Restore

**Files:** `src/modules/backup/index.ts`, `scripts/backup.mjs`, `scripts/restore.mjs`, `/manage/backups` page + actions, migration `backups` table.

- [ ] Step 1: Failing module tests: backup writes encrypted archive + record; daily/weekly retention (7/8) enforced; failure records error; restore dry-run validates checksum; admin-only page gate.
- [ ] Step 2: Implement module + scripts + page (list, status, manual trigger; no restore button in browser per OPS-11).
- [ ] Step 3: Verify and commit.

### Task 6: Audit/Backup Pages + SEC-07

**Files:** `/manage/audit` page; publish flow desensitization confirmation (`is_case_article` field + checkbox in editor publish); `/manage` links.

- [ ] Step 1: Failing module/e2e tests: case article publish without confirmation refused; audit page shows recent content events to admins, hides from readers.
- [ ] Step 2: Implement SEC-07 confirmation in editing module + editor UI; audit page lists `content_audit_events` + identity audit events.
- [ ] Step 3: Verify and commit.

### Task 7: Ops Runbook and Launch Checklist

**Files:** `docs/operations/ops-runbook.md` (OPS-10 update flow, OPS-12 log rotation, BKP-03/04/06 recovery drill, AVL maintenance notice), `docs/operations/launch-checklist.md` (human acceptance items from acceptance-criteria.md), roadmap update.

- [ ] Step 1: Draft runbook + checklist; verify commands referenced exist.
- [ ] Step 2: Commit.

### Task 8: Seeds, E2E, Full Gate, Code Review, Tickets

**Files:** `scripts/seed-e2e.ts` additions (archived article, importable fixture, audit events), `tests/e2e/recycle-bin.spec.ts`, `tests/e2e/migration-export.spec.ts`, `tests/e2e/audit-backup.spec.ts`, CONTEXT/ADR if needed.

- [ ] Step 1: E2E: archive → recycle bin → restore; import single file → draft appears; export single article → readable package; audit page role gates; backup page status + manual backup.
- [x] Step 2: Full gate (`format:check`, `lint`, `typecheck`, `test:local`, `test:postgres:container`, `build`, e2e); code review (two axes); close tickets with evidence; roadmap marked complete.

## Self-Review Targets

- AUDIT-01/02/03 covered: content lifecycle, restore/archive reasons, append-only, no admin edit.
- DEL-01/02/03 covered: archive-not-delete everywhere, 30-day recycle, image reference protection.
- PORT-01–09 covered; PORT-10 documented as out of scope.
- SEC-07 covered by publish confirmation; other SEC items are runtime/deploy human items.
- BKP-01–06 covered by module + scripts + page + runbook; encryption key custody and quarterly drill are human acceptance items.
- OPS-10/12 covered by runbook + scripts; AVL items documented.
