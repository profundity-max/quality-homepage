# AGENTS.md

## Agent skills

### Issue tracker

Issues and specs are tracked in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default mattpocock/skills triage label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository with `CONTEXT.md` at the root and ADRs under `docs/adr/`. See `docs/agents/domain.md`.

## 版本与变更记录

- 所有 @Superpower 需求完成后必须升主版本号（例如 V1.0 → V2.0），并写明该版本的变更摘要。
- 所有由用户直接要求的小型修改按小版本递增（例如 V1.1 → V1.2），同样写明变更摘要。
- 每次项目变更都要在项目目录下的 `Q-Nexus项目变更说明.xlsx` 追加一行（版本号、日期、变更类型、变更摘要、关联提交、验收证据）。
- 所有代码变更都要提交到当前分支并推送 GitHub，并为每个版本打对应标签，保证可完整回溯到任意版本。
- 细则见 `docs/versioning.md`，当前版本见仓库根目录 `VERSION`。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
