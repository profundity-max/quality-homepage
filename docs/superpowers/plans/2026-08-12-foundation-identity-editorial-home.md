# Foundation, Identity, and Editorial Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-shaped first slice in which an administrator can initialize a local account, sign in securely, complete the required first password change, and reach the responsive Editorial Space home shell.

**Architecture:** A Next.js 16 modular monolith runs against PostgreSQL and exposes identity behavior through one deep module rather than page-owned queries. This slice establishes the UI, database, session, testing, and Docker foundations later knowledge modules reuse, while keeping the throwaway prototype out of production history.

**Tech Stack:** Node.js 24 LTS, Next.js 16.3.0, React 19.2.8, TypeScript 5.9.3, PostgreSQL 17, Drizzle ORM 0.45.2, Argon2id, CSS Modules, Vitest 4.1.10, Testing Library, Playwright 1.62.1, Docker Compose, Caddy.

## Global Constraints

- Product-facing copy uses the full name `品集｜Q Nexus` and the vocabulary in `CONTEXT.md`.
- The visual direction is `docs/design/editorial-space-ui-direction.md`; do not merge or copy the throwaway prototype implementation.
- Runtime assets work with the public internet disconnected: no CDN, Google Fonts, remote icons, remote authentication, or runtime package fetches.
- Passwords use Argon2id with at least 19 MiB memory, 2 iterations, and parallelism 1; plaintext passwords are never logged or persisted.
- Session Cookies use `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` whenever HTTPS is active.
- Five consecutive login failures lock the account for 15 minutes. “保持登录” creates a seven-day session.
- Store timestamps in UTC and render user-facing time in `Asia/Shanghai`.
- Commit reviewed migration SQL under `drizzle/`; production never runs `drizzle-kit push`.
- Every task leaves formatting, lint, type checks, and its relevant tests passing.
- Use `Helvetica, Arial, system-ui, -apple-system, "Segoe UI", sans-serif`; body text is at least 16 px.
- `#0096FF` is the brand accent; small light-mode links use accessible `#006BB8`.

## File Map

```text
package.json                         # Commands and pinned dependencies
src/app/                             # Routes, layouts, actions, and health endpoints
src/db/                              # PostgreSQL connection, schema, and migrations
src/modules/identity/                # Deep identity module; only index.ts is public
src/modules/home/                    # Pure personalized home model
src/ui/                              # Editorial Space shell, theme, and home UI
src/styles/                          # Tokens, reset, typography, and focus rules
drizzle/                             # Reviewed SQL migrations
scripts/                             # First-admin and E2E seed commands
tests/module/                        # Tests through module interfaces
tests/integration/                   # Database and migration tests
tests/e2e/                           # Browser user journeys
ops/                                # Caddy, health, and runbook files
```

Pages, layouts, Route Handlers, and Server Actions may import only from a module's `index.ts`; they may not import its `internal/` files or Drizzle schema.

---

### Task 1: Bootstrap the Tested Next.js Application

**Files:**
- Create: `package.json`, `package-lock.json`, `.nvmrc`, `.env.example`
- Create: `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `.prettierrc.json`
- Create: `vitest.config.ts`, `vitest.setup.ts`
- Create: `src/config/env.ts`, `src/app/layout.tsx`, `src/app/api/health/live/route.ts`
- Create: `tests/module/config/env.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: Node.js 24 and npm.
- Produces: `readEnv(source?: NodeJS.ProcessEnv): AppEnv` and `GET /api/health/live` returning `{ status: "ok" }`.

- [ ] **Step 1: Create the deterministic toolchain**

```bash
printf '24.18.0\n' > .nvmrc
npm init -y
npm install next@16.3.0 react@19.2.8 react-dom@19.2.8 drizzle-orm@0.45.2 pg@8.23.0 argon2@0.45.1 zod@4.4.3 lucide-react@1.31.0 server-only@0.0.1
npm install -D typescript@5.9.3 tsx@4.23.12 drizzle-kit@0.31.10 eslint@9.39.2 eslint-config-next@16.3.0 prettier@3.9.6 vitest@4.1.10 jsdom@30.0.1 vite-tsconfig-paths@6.1.1 @testing-library/react@16.3.2 @testing-library/jest-dom@7.0.1 @playwright/test@1.62.1 @axe-core/playwright@4.13.0 @electric-sql/pglite@0.5.4 @inquirer/prompts@8.5.2 @types/node@24.13.3 @types/react@19.2.18 @types/react-dom@19.2.4 @types/pg@8.21.0
```

Set package scripts to `dev`, `build`, `start`, `format`, `format:check`, `lint`, `typecheck`, `test`, `test:watch`, `test:e2e`, `db:generate`, `db:migrate`, and `admin:init`. Set `engines.node` to `>=24 <25`. Extend `.gitignore` with `.next/`, `node_modules/`, `.env`, `coverage/`, `test-results/`, and `playwright-report/`.

- [ ] **Step 2: Write the failing environment test**

```ts
import { describe, expect, it } from "vitest";
import { readEnv } from "@/config/env";

describe("readEnv", () => {
  it("uses safe defaults", () => {
    const env = readEnv({
      NODE_ENV: "test",
      DATABASE_URL: "postgres://q_nexus:test@127.0.0.1:5432/q_nexus",
    });
    expect(env.QNEXUS_BIND_ADDRESS).toBe("127.0.0.1");
    expect(env.SESSION_DAYS).toBe(7);
  });

  it("requires a PostgreSQL URL", () => {
    expect(() => readEnv({ NODE_ENV: "test" })).toThrow("DATABASE_URL");
  });
});
```

- [ ] **Step 3: Run the test and verify it fails because the module is absent**

```bash
npm test -- tests/module/config/env.test.ts
```

Expected: FAIL resolving `@/config/env`.

- [ ] **Step 4: Implement environment parsing, layout, and liveness**

```ts
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url().startsWith("postgres"),
  QNEXUS_BIND_ADDRESS: z.string().default("127.0.0.1"),
  SESSION_DAYS: z.coerce.number().int().positive().default(7),
  AUTH_MAX_FAILURES: z.coerce.number().int().positive().default(5),
  AUTH_LOCK_MINUTES: z.coerce.number().int().positive().default(15),
  APP_TIME_ZONE: z.literal("Asia/Shanghai").default("Asia/Shanghai"),
});

export type AppEnv = z.infer<typeof schema>;
export const readEnv = (source: NodeJS.ProcessEnv = process.env): AppEnv => schema.parse(source);
```

The root layout declares `lang="zh-CN"`, metadata title `品集｜Q Nexus`, and description `品质部局域网知识门户`. The liveness Route Handler is dynamic and returns status 200 with `{ status: "ok" }`. Configure strict TypeScript with `@/* -> ./src/*`, Vitest with jsdom and Testing Library, the Next.js flat ESLint preset, and `output: "standalone"`.

- [ ] **Step 5: Verify and commit**

```bash
npm run format
npm run lint
npm run typecheck
npm test -- tests/module/config/env.test.ts
npm run build
git add package.json package-lock.json .nvmrc .env.example next.config.ts tsconfig.json eslint.config.mjs .prettierrc.json vitest.config.ts vitest.setup.ts src/app src/config tests/module/config .gitignore
git commit -m "chore: bootstrap Q Nexus application"
```

Expected: all commands pass and the build includes `/api/health/live`.

---

### Task 2: Establish the Editorial Space Design System and App Shell

**Files:**
- Create: `src/styles/tokens.css`, `src/styles/globals.css`
- Create: `src/ui/app-shell/app-shell.tsx`, `app-shell.module.css`, `navigation.ts`, `index.ts`
- Create: `src/ui/theme/theme-script.tsx`, `theme-toggle.tsx`, `index.ts`
- Create: `tests/module/ui/app-shell.test.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: React and the approved Editorial Space specification.
- Produces: `AppShell({ active, viewer, children })`, `primaryNavigation`, `ThemeScript`, and `ThemeToggle`.

- [ ] **Step 1: Write the failing shell tests**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShell } from "@/ui/app-shell";

describe("AppShell", () => {
  it("uses the approved navigation order", () => {
    render(<AppShell active="home" viewer={{ displayName: "Lou", role: "reader" }}>正文</AppShell>);
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "跳到主要内容", "品集Q Nexus", "首页", "新人专区", "品质知识", "散热知识", "推荐书单", "模板中心",
    ]);
  });

  it("marks the active route with aria-current", () => {
    render(<AppShell active="quality" viewer={{ displayName: "Lou", role: "reader" }}>正文</AppShell>);
    expect(screen.getByRole("link", { name: "品质知识" })).toHaveAttribute("aria-current", "page");
  });
});
```

- [ ] **Step 2: Run the test and verify the missing module failure**

```bash
npm test -- tests/module/ui/app-shell.test.tsx
```

- [ ] **Step 3: Implement the approved tokens and accessibility globals**

```css
:root {
  color-scheme: light;
  --color-canvas: #f5f5f7;
  --color-surface: #ffffff;
  --color-surface-muted: #fafafa;
  --color-text: #1d1d1f;
  --color-text-secondary: #525256;
  --color-text-muted: #6e6e73;
  --color-divider: #d2d2d7;
  --color-accent: #0096ff;
  --color-link: #006bb8;
  --font-sans: Helvetica, Arial, system-ui, -apple-system, "Segoe UI", sans-serif;
}

:root[data-theme="dark"] {
  color-scheme: dark;
  --color-canvas: #1c1c1e;
  --color-surface: #252527;
  --color-surface-muted: #2c2c2e;
  --color-text: #f3f3f5;
  --color-text-secondary: #d0d0d5;
  --color-text-muted: #a0a0a8;
  --color-divider: #45454a;
  --color-accent: #38aaff;
  --color-link: #70c2ff;
}
```

Global CSS sets 16 px body text, `box-sizing: border-box`, a visible two-ring `:focus-visible`, a skip-link reveal rule, overflow protection, and a `prefers-reduced-motion: reduce` block.

- [ ] **Step 4: Implement the shell and theme interfaces**

```ts
export const primaryNavigation = [
  { id: "home", label: "首页", href: "/" },
  { id: "onboarding", label: "新人专区", href: "/onboarding" },
  { id: "quality", label: "品质知识", href: "/quality" },
  { id: "thermal", label: "散热知识", href: "/thermal" },
  { id: "books", label: "推荐书单", href: "/books" },
  { id: "templates", label: "模板中心", href: "/templates" },
] as const;
```

`AppShell` renders a skip link, product mark, semantic primary navigation, search button, user menu, and `<main id="main-content">`. `ThemeScript` runs before paint, reads the `q-nexus-theme` Cookie or system preference, and sets `data-theme`; `ThemeToggle` updates both the attribute and Cookie. Below 960 px the desktop navigation becomes a labelled drawer trigger.

- [ ] **Step 5: Verify and commit**

```bash
npm run format
npm run lint
npm run typecheck
npm test -- tests/module/ui/app-shell.test.tsx
git add src/app/layout.tsx src/styles src/ui tests/module/ui
git commit -m "feat: establish Editorial Space app shell"
```

Expected: tests pass; selected navigation has visible non-color affordance; 390 px layout has no page-level horizontal overflow.

---

### Task 3: Create the Identity Schema and Migration Harness

**Files:**
- Create: `drizzle.config.ts`, `drizzle/0000_identity.sql`
- Create: `src/db/schema/identity.ts`, `src/db/schema/index.ts`
- Create: `src/db/client.ts`, `src/db/migrate.ts`
- Create: `tests/helpers/database.ts`, `tests/integration/db/identity-schema.test.ts`

**Interfaces:**
- Consumes: `AppEnv.DATABASE_URL`.
- Produces: `getDatabase(): NodePgDatabase<typeof schema>` and the `users`, `sessions`, and `auditEvents` schema.

- [ ] **Step 1: Write a failing migration integration test**

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "../../helpers/database";

describe("identity migration", () => {
  let testDb: TestDatabase;
  beforeEach(async () => { testDb = await createTestDatabase(); });
  afterEach(async () => { await testDb.close(); });

  it("creates identity and audit tables", async () => {
    const result = await testDb.client.query<{ table_name: string }>(`
      select table_name from information_schema.tables
      where table_schema = 'public' order by table_name
    `);
    expect(result.rows.map((row) => row.table_name)).toEqual(["audit_events", "sessions", "users"]);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails because the helper is absent**

```bash
npm test -- tests/integration/db/identity-schema.test.ts
```

- [ ] **Step 3: Define the reviewed SQL migration**

```sql
create type user_role as enum ('reader', 'editor', 'admin');
create type user_status as enum ('active', 'disabled');

create table users (
  id uuid primary key,
  username varchar(80) not null,
  username_normalized varchar(80) not null unique,
  display_name varchar(120),
  password_hash text not null,
  role user_role not null default 'reader',
  status user_status not null default 'active',
  must_change_password boolean not null default true,
  failed_login_attempts integer not null default 0 check (failed_login_attempts >= 0),
  locked_until timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table sessions (
  id uuid primary key,
  user_id uuid not null references users(id),
  token_digest char(64) not null unique,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  persistent boolean not null default false
);
create index sessions_user_id_idx on sessions(user_id);
create index sessions_expires_at_idx on sessions(expires_at);

create table audit_events (
  id uuid primary key,
  actor_user_id uuid references users(id),
  event_type varchar(120) not null,
  target_type varchar(80) not null,
  target_id uuid,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null
);
create index audit_events_occurred_at_idx on audit_events(occurred_at desc);

create function reject_audit_mutation() returns trigger as $$
begin raise exception 'audit_events are append-only'; end;
$$ language plpgsql;
create trigger audit_events_no_update_or_delete before update or delete on audit_events
for each row execute function reject_audit_mutation();
```

- [ ] **Step 4: Implement matching Drizzle schema and test database**

Use `pgTable`, `pgEnum`, UUID, text, timestamp-with-time-zone, integer, boolean, and JSONB columns matching the SQL. `tests/helpers/database.ts` creates an in-memory PGlite database, reads `drizzle/0000_identity.sql`, executes it, and exposes PGlite plus its Drizzle adapter. `src/db/client.ts` caches one `pg.Pool` and Drizzle instance per Node process. `src/db/migrate.ts` uses Drizzle's migrator and exits nonzero without logging credentials.

- [ ] **Step 5: Verify parity and commit**

```bash
npm run format
npm run lint
npm run typecheck
npm test -- tests/integration/db/identity-schema.test.ts
git add drizzle.config.ts drizzle src/db tests/helpers/database.ts tests/integration/db
git commit -m "feat: add identity database foundation"
```

Expected: tables exist and attempts to update or delete `audit_events` fail with `audit_events are append-only`.

---

### Task 4: Implement Secure Authentication and Sessions

**Files:**
- Create: `src/modules/identity/types.ts`, `src/modules/identity/identity-module.ts`, `src/modules/identity/index.ts`
- Create: `src/modules/identity/internal/password-hasher.ts`, `session-tokens.ts`, `store.ts`, `postgres-store.ts`
- Create: `tests/helpers/identity.ts`
- Create: `tests/module/identity/authenticate.test.ts`, `tests/module/identity/session.test.ts`

**Interfaces:**
- Consumes: identity database, Argon2id adapter, cryptographic token adapter, clock, and auth configuration.
- Produces: `IdentityModule.authenticate`, `resolveSession`, `changePassword`, `revokeAllSessions`, and discriminated results.

- [ ] **Step 1: Write failing authentication behavior tests**

```ts
import { describe, expect, it } from "vitest";
import { buildIdentityHarness } from "../../helpers/identity";

describe("IdentityModule.authenticate", () => {
  it("authenticates normalized credentials", async () => {
    const h = await buildIdentityHarness();
    const user = await h.createUser({ username: "lou", password: "First-use-passphrase-42", mustChangePassword: true });
    const result = await h.module.authenticate({ username: " Lou ", password: "First-use-passphrase-42", persistent: true });
    expect(result).toMatchObject({ kind: "authenticated", mustChangePassword: true });
    if (result.kind === "authenticated") expect(result.session.userId).toBe(user.id);
  });

  it("locks after five failures", async () => {
    const h = await buildIdentityHarness({ now: "2026-08-12T01:00:00.000Z" });
    await h.createUser({ username: "lou", password: "Correct-passphrase-42" });
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect(await h.module.authenticate({ username: "lou", password: "wrong", persistent: false })).toMatchObject({ kind: "invalid-credentials" });
    }
    expect(await h.module.authenticate({ username: "lou", password: "wrong", persistent: false })).toEqual({
      kind: "locked", unlockAt: new Date("2026-08-12T01:15:00.000Z"),
    });
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

```bash
npm test -- tests/module/identity/authenticate.test.ts tests/module/identity/session.test.ts
```

- [ ] **Step 3: Define the small public identity interface**

```ts
export type SessionUser = { id: string; username: string; displayName: string; role: "reader" | "editor" | "admin" };
export type Session = { id: string; userId: string; token: string; expiresAt: Date; persistent: boolean };
export type ResolvedSession = { id: string; user: SessionUser; mustChangePassword: boolean; persistent: boolean };
export type AuthenticateResult =
  | { kind: "authenticated"; session: Session; mustChangePassword: boolean }
  | { kind: "invalid-credentials"; attemptsRemaining: number }
  | { kind: "locked"; unlockAt: Date }
  | { kind: "disabled" };

export interface IdentityModule {
  authenticate(input: { username: string; password: string; persistent: boolean }): Promise<AuthenticateResult>;
  resolveSession(token: string): Promise<ResolvedSession | null>;
  changePassword(input: { sessionId: string; currentPassword: string; newPassword: string }): Promise<Session>;
  revokeSession(sessionId: string): Promise<void>;
  revokeAllSessions(userId: string): Promise<void>;
}
```

Only `identity/index.ts` exports the production constructor and public types. Store, hashing, token, and clock interfaces remain internal.

- [ ] **Step 4: Implement Argon2id, opaque tokens, locks, and password change**

```ts
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};
```

Generate 32 random bytes as base64url, return the raw token once, and persist only its SHA-256 digest. Normalize username with `trim().toLocaleLowerCase("en-US")`; verify a dummy Argon2 hash for unknown usernames; atomically increment failures, lock on the fifth, reset failures on success, and audit without password data. Reject expired, revoked, and disabled-user sessions; return the password-change flag so the web layer can admit only the change-password route. `changePassword` verifies the current password, requires at least 14 characters, rejects equality with username, revokes old sessions, clears `mustChangePassword`, creates and returns a replacement session with the prior persistence choice, and audits the event.

- [ ] **Step 5: Verify through the module interface and commit**

```bash
npm run format
npm run lint
npm run typecheck
npm test -- tests/module/identity
git add src/modules/identity tests/helpers/identity.ts tests/module/identity
git commit -m "feat: implement secure local authentication"
```

Expected: valid, invalid, locked, disabled, expiration, revocation, and password-change paths pass; no session row contains a raw token.

---

### Task 5: Add Protected Account Administration and First Admin Initialization

**Files:**
- Create: `src/modules/identity/account-administration.ts`
- Modify: `src/modules/identity/types.ts`, `src/modules/identity/index.ts`
- Create: `scripts/create-first-admin.ts`
- Create: `tests/module/identity/account-administration.test.ts`, `first-admin.test.ts`

**Interfaces:**
- Consumes: identity store, hasher, clock, actor, and audit appender.
- Produces: `createUser`, `resetPassword`, `unlockUser`, `disableUser`, `changeRole`, and `createFirstAdmin`.

- [ ] **Step 1: Write failing administrator invariant tests**

```ts
import { describe, expect, it } from "vitest";
import { buildIdentityHarness } from "../../helpers/identity";

describe("account administration", () => {
  it("refuses to disable the acting administrator", async () => {
    const h = await buildIdentityHarness();
    const admin = await h.createUser({ username: "lou", password: "Strong-passphrase-42", role: "admin" });
    await expect(h.accounts.disableUser({ actorId: admin.id, userId: admin.id })).rejects.toThrow("不能停用当前登录账号");
  });

  it("refuses to demote the final active administrator", async () => {
    const h = await buildIdentityHarness();
    const admin = await h.createUser({ username: "lou", password: "Strong-passphrase-42", role: "admin" });
    await expect(h.accounts.changeRole({ actorId: admin.id, userId: admin.id, role: "editor" })).rejects.toThrow("至少保留一名有效管理员");
  });
});
```

- [ ] **Step 2: Run the tests and verify the missing operations**

```bash
npm test -- tests/module/identity/account-administration.test.ts tests/module/identity/first-admin.test.ts
```

- [ ] **Step 3: Implement account lifecycle invariants**

```ts
export interface AccountAdministration {
  createUser(command: CreateUser): Promise<ManagedUser>;
  resetPassword(command: ResetPassword): Promise<void>;
  unlockUser(command: UnlockUser): Promise<void>;
  disableUser(command: DisableUser): Promise<void>;
  changeRole(command: ChangeRole): Promise<void>;
}
```

Each operation checks the acting administrator inside the module. Reset creates a new Argon2id hash, forces password change, revokes sessions, and never returns plaintext. Disable/demotion checks the effective administrator count inside the same transaction and blocks the acting or final administrator. Each mutation appends an audit event.

- [ ] **Step 4: Implement TTY-only first-admin initialization**

Use `@inquirer/prompts` `input` and masked `password`. Refuse non-TTY input, confirm the temporary password twice, and call `createFirstAdmin`. The operation succeeds only when no user exists, takes no password CLI flag or environment variable, and appends `identity.first_admin_created` with a null actor.

- [ ] **Step 5: Verify invariants and commit**

```bash
npm run format
npm run lint
npm run typecheck
npm test -- tests/module/identity/account-administration.test.ts tests/module/identity/first-admin.test.ts
git add src/modules/identity scripts/create-first-admin.ts tests/module/identity
git commit -m "feat: add protected account administration"
```

Expected: administrator safety tests pass and a second first-admin initialization is rejected.

---

### Task 6: Expose Account Administration to Administrators

**Files:**
- Create: `src/app/(manage)/manage/layout.tsx`
- Create: `src/app/(manage)/manage/users/page.tsx`, `user-table.tsx`, `actions.ts`
- Create: `src/app/(manage)/manage/users/users.module.css`
- Create: `src/modules/identity/web-session.ts`
- Create: `src/modules/identity/authorization.ts`
- Create: `tests/module/identity/user-actions.test.ts`
- Create: `tests/e2e/account-administration.spec.ts`

**Interfaces:**
- Consumes: `AccountAdministration`, `requireViewer()`, and the shared Editorial Space controls.
- Produces: `requireViewer()`, `requireAdminViewer()`, and an admin-only `/manage/users` page for create, reset, unlock, disable, and role-change operations.

- [ ] **Step 1: Write failing authorization and action-mapping tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { authorizeUserAdminIntent } from "@/modules/identity/authorization";

describe("authorizeUserAdminIntent", () => {
  it("rejects a non-administrator before calling account administration", async () => {
    const createUser = vi.fn();
    const result = await authorizeUserAdminIntent(
      { viewer: { id: "reader-1", role: "reader" }, accounts: { createUser } },
      { kind: "create", username: "ming", displayName: "Ming", temporaryPassword: "Temporary-pass-2026", role: "reader" },
    );
    expect(result).toEqual({ kind: "forbidden", message: "仅管理员可以管理账号。" });
    expect(createUser).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run and verify the missing action failure**

```bash
npm test -- tests/module/identity/user-actions.test.ts
```

- [ ] **Step 3: Implement the admin-only layout and account table**

Implement the server-only `getResolvedSession()` and `requireViewer()` helpers first. They read the raw HttpOnly Cookie server-side, call `IdentityModule.resolveSession`, redirect absent/invalid sessions to login, and redirect password-change-required sessions to `/change-password`. `requireAdminViewer()` additionally returns `notFound()` for non-admin users. The pure `authorizeUserAdminIntent` helper performs the role precheck used by the unit test, then delegates to `AccountAdministration`, whose internal check remains authoritative. The `/manage` layout calls the session helper and renders a dense but visually consistent secondary navigation. `/manage/users` lists username, display name, role, status, lock state, and password-change state. It provides labelled dialogs for:

```ts
type UserAdminIntent =
  | { kind: "create"; username: string; displayName: string; temporaryPassword: string; role: UserRole }
  | { kind: "reset-password"; userId: string; temporaryPassword: string }
  | { kind: "unlock"; userId: string }
  | { kind: "disable"; userId: string; reason: string }
  | { kind: "change-role"; userId: string; role: UserRole; reason: string };
```

Every Server Action gets the actor from the authenticated session, validates fields with Zod, calls `AccountAdministration`, maps domain errors to Chinese form messages, and calls `revalidatePath("/manage/users")`. Password fields clear after submission and never appear in query strings, returned objects, logs, or audit metadata.

- [ ] **Step 4: Add browser coverage for account lifecycle**

```ts
import { expect, test } from "@playwright/test";

test("administrator creates a reader who must change the temporary password", async ({ page }) => {
  await signIn(page, "e2e-admin", "Admin-e2e-passphrase-42");
  await page.goto("/manage/users");
  await page.getByRole("button", { name: "创建账号" }).click();
  await page.getByLabel("用户名").fill("new-reader");
  await page.getByLabel("显示名称").fill("New Reader");
  await page.getByLabel("临时密码").fill("Temporary-reader-pass-42");
  await page.getByRole("button", { name: "确认创建" }).click();
  await expect(page.getByRole("row", { name: /new-reader/ })).toContainText("首次登录需改密");
});

test("reader cannot open account administration", async ({ page }) => {
  await signIn(page, "e2e-reader", "Reader-e2e-passphrase-42");
  await page.goto("/manage/users");
  await expect(page).toHaveURL(/\/404$/);
});
```

Also cover reset, unlock, disable, acting-admin protection, and final-admin protection. Keep the reusable `signIn` helper in `tests/e2e/helpers/session.ts`.

- [ ] **Step 5: Verify and commit**

```bash
npm run format
npm run lint
npm run typecheck
npm test -- tests/module/identity/user-actions.test.ts
git add 'src/app/(manage)' src/modules/identity/web-session.ts src/modules/identity/authorization.ts tests/module/identity/user-actions.test.ts tests/e2e/account-administration.spec.ts tests/e2e/helpers/session.ts
git commit -m "feat: add administrator account management"
```

Expected: only admins see and invoke account operations; all module invariants remain enforced when Server Actions are called directly.

---

### Task 7: Build Login, Cookie, and Required Password-Change Routes

**Files:**
- Create: `src/app/(public)/login/page.tsx`, `login-form.tsx`, `login.module.css`, `actions.ts`
- Create: `src/app/(auth)/change-password/page.tsx`, `actions.ts`
- Create: `src/app/(portal)/layout.tsx`, `src/app/logout/route.ts`
- Modify: `src/modules/identity/web-session.ts`
- Create: `src/modules/identity/post-login.ts`
- Create: `src/proxy.ts`
- Create: `tests/module/identity/post-login.test.ts`, `tests/e2e/login.spec.ts`

**Interfaces:**
- Consumes: `IdentityModule`, Next.js Cookies, and `AppShell`.
- Produces: `requireViewer()`, `setSessionCookie(session)`, `clearSessionCookie()`, and login/logout/change-password journeys.

- [ ] **Step 1: Write failing safe-redirect tests**

```ts
import { describe, expect, it } from "vitest";
import { postLoginDestination } from "@/modules/identity/post-login";

describe("postLoginDestination", () => {
  it("forces first-time password change", () => {
    expect(postLoginDestination({ mustChangePassword: true, requestedPath: "/quality" })).toBe("/change-password");
  });
  it("keeps a safe internal path", () => {
    expect(postLoginDestination({ mustChangePassword: false, requestedPath: "/quality" })).toBe("/quality");
  });
  it("rejects external redirects", () => {
    expect(postLoginDestination({ mustChangePassword: false, requestedPath: "https://example.com" })).toBe("/");
  });
});
```

- [ ] **Step 2: Run and verify the missing helper failure**

```bash
npm test -- tests/module/identity/post-login.test.ts
```

- [ ] **Step 3: Implement server-only Cookie behavior**

```ts
import "server-only";
import { cookies } from "next/headers";

const COOKIE_NAME = "q_nexus_session";

export async function setSessionCookie(session: { token: string; expiresAt: Date; persistent: boolean }) {
  const jar = await cookies();
  jar.set(COOKIE_NAME, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.QNEXUS_HTTPS === "true",
    path: "/",
    ...(session.persistent ? { expires: session.expiresAt } : {}),
  });
}
```

Add `setSessionCookie` and `clearSessionCookie` alongside Task 6's resolver helpers. `requireViewer` continues to redirect invalid sessions to `/login?next=<encoded path>`. The change-password page uses `getResolvedSession({ allowPasswordChange: true })`, while other protected routes reject password-change-required sessions. Do not store IDs or roles in client-readable Cookies. `src/proxy.ts` may do an early Cookie-presence redirect, but authenticated layouts always perform authoritative module resolution.

- [ ] **Step 4: Implement Editorial Space login and first-change pages**

The login page contains product mark, username, password, “保持登录 7 天”, submit button, and this exact notice:

```text
仅限受信任的公司局域网访问；请勿在公共或访客网络中登录。
```

`loginAction` maps invalid, locked, and disabled results to non-enumerating Chinese messages, sets a Cookie only on success, and redirects safely. The change page requires current password, new password, and confirmation; `changePassword` returns the replacement session, whose token replaces the old Cookie before redirecting home. Logout resolves the current session, calls `revokeSession(session.id)`, and then clears the Cookie.

Create this E2E starting point:

```ts
import { expect, test } from "@playwright/test";

test("first login requires password change", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText("仅限受信任的公司局域网访问")).toBeVisible();
  await page.getByLabel("用户名").fill("e2e-admin");
  await page.getByLabel("密码", { exact: true }).fill("Initial-e2e-passphrase-42");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/change-password$/);
});
```

- [ ] **Step 5: Verify and commit**

```bash
npm run format
npm run lint
npm run typecheck
npm test -- tests/module/identity/post-login.test.ts
git add src/app src/modules/identity src/proxy.ts tests/module/identity/post-login.test.ts tests/e2e/login.spec.ts
git commit -m "feat: add secure login and password change flow"
```

Expected: unit tests pass; Playwright collects the journey and Task 9 makes it green with deterministic seed data.

---

### Task 8: Build the Authenticated Editorial Space Home

**Files:**
- Create: `src/modules/home/home-model.ts`, `src/modules/home/index.ts`
- Create: `src/ui/home/editorial-home.tsx`, `editorial-home.module.css`, `editorial-graphic.tsx`, `index.ts`
- Create: `src/app/(portal)/page.tsx`
- Create: `tests/module/home/home-model.test.ts`, `tests/module/ui/editorial-home.test.tsx`
- Modify: `src/app/(portal)/layout.tsx`

**Interfaces:**
- Consumes: authenticated `SessionUser`, current UTC time, and `AppShell`.
- Produces: `buildHomeModel(viewer, now, timeZone)` and `EditorialHome({ model })`.

- [ ] **Step 1: Write failing greeting and order tests**

```ts
import { describe, expect, it } from "vitest";
import { buildHomeModel } from "@/modules/home";

const viewer = { id: "user-1", username: "lou", displayName: "Lou", role: "reader" as const };

describe("buildHomeModel", () => {
  it.each([
    ["2026-08-11T22:00:00.000Z", "早上好，Lou"],
    ["2026-08-12T06:00:00.000Z", "下午好，Lou"],
    ["2026-08-12T12:00:00.000Z", "晚上好，Lou"],
  ])("uses Asia/Shanghai for %s", (instant, expected) => {
    expect(buildHomeModel(viewer, new Date(instant), "Asia/Shanghai").greeting).toBe(expected);
  });

  it("falls back to username", () => {
    expect(buildHomeModel({ ...viewer, displayName: "" }, new Date(), "Asia/Shanghai").greeting).toContain("lou");
  });
});
```

The UI test asserts heading order: `早上好，Lou`, `从第一天，到独立判断。`, `常用模板`, `品质知识`, `散热知识`, `最近更新`, `推荐书籍`.

- [ ] **Step 2: Run and verify missing modules**

```bash
npm test -- tests/module/home/home-model.test.ts tests/module/ui/editorial-home.test.tsx
```

- [ ] **Step 3: Implement time-zone-safe modeling**

Use `Intl.DateTimeFormat("zh-CN", { hour: "numeric", hourCycle: "h23", timeZone })`. Hours 05:00–11:59 use “早上好”, 12:00–17:59 “下午好”, otherwise “晚上好”. Always return `数据驱动 · 结果闭环`. Keep the module pure and inject the instant.

- [ ] **Step 4: Implement the A-direction composition**

The hero uses `min-height: clamp(34rem, 60svh, 48rem)`, centers greeting and the search launcher, and reveals the next section at typical desktop heights. Use semantic sections in the exact approved order. Later slices supply real content, so every non-hero area is a finalized navigation entry with approved explanatory copy—no fake dates, counts, filenames, popularity, or “recent” rows. Inline SVG distribution, control-chart, thermal-contour, and document-stack line art uses `aria-hidden="true"`.

At 390 px, search remains inside the viewport, layouts collapse to one column, primary actions are at least 44 px, and page scroll width equals client width. At 200% zoom all sections and the drawer remain reachable.

- [ ] **Step 5: Verify and commit**

```bash
npm run format
npm run lint
npm run typecheck
npm test -- tests/module/home/home-model.test.ts tests/module/ui/editorial-home.test.tsx
npm run build
git add src/modules/home src/ui/home 'src/app/(portal)' tests/module/home tests/module/ui/editorial-home.test.tsx
git commit -m "feat: add authenticated Editorial Space home"
```

Expected: tests pass, page title is `首页 · 品集｜Q Nexus`, and the build has no remote asset request.

---

### Task 9: Add Docker, Deterministic E2E, and Slice Verification

**Files:**
- Create: `Dockerfile`, `compose.yaml`, `compose.e2e.yaml`, `playwright.config.ts`
- Create: `ops/Caddyfile`, `ops/healthcheck.mjs`
- Create: `scripts/seed-e2e.ts`
- Create: `tests/e2e/editorial-home.spec.ts`
- Create: `docs/operations/local-runbook.md`
- Modify: `tests/e2e/login.spec.ts`, `package.json`, `.env.example`

**Interfaces:**
- Consumes: standalone build, migration, first-admin command, and Tasks 1–8 routes.
- Produces: `docker compose up --build`, deterministic E2E setup, liveness evidence, and the Slice 1 acceptance path.

- [ ] **Step 1: Write the failing authenticated-home browser test**

```ts
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("authenticated reader reaches Editorial Space", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("e2e-reader");
  await page.getByLabel("密码", { exact: true }).fill("Reader-e2e-passphrase-42");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/早上好|下午好|晚上好/);
  await expect(page.getByText("数据驱动 · 结果闭环")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("mobile home has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.getByLabel("用户名").fill("e2e-reader");
  await page.getByLabel("密码", { exact: true }).fill("Reader-e2e-passphrase-42");
  await page.getByRole("button", { name: "登录" }).click();
  const width = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(width[0]).toBe(width[1]);
});
```

- [ ] **Step 2: Add safe Compose and reverse-proxy configuration**

```yaml
services:
  proxy:
    image: caddy:2.10-alpine
    restart: unless-stopped
    ports: ["${QNEXUS_BIND_ADDRESS:-127.0.0.1}:8080:8080"]
    volumes: ["./ops/Caddyfile:/etc/caddy/Caddyfile:ro"]
    depends_on:
      web: { condition: service_healthy }
  web:
    build: .
    restart: unless-stopped
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://q_nexus:${POSTGRES_PASSWORD}@postgres:5432/q_nexus
      APP_TIME_ZONE: Asia/Shanghai
      QNEXUS_HTTPS: "false"
    depends_on:
      postgres: { condition: service_healthy }
    healthcheck:
      test: ["CMD", "node", "/app/ops/healthcheck.mjs"]
      interval: 15s
      timeout: 5s
      retries: 5
  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: q_nexus
      POSTGRES_USER: q_nexus
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes: ["q_nexus_postgres:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U q_nexus -d q_nexus"]
      interval: 10s
      timeout: 5s
      retries: 10
volumes:
  q_nexus_postgres:
```

Caddy listens on `:8080`, adds `X-Content-Type-Options nosniff`, `Referrer-Policy same-origin`, and a restrictive CSP, then proxies `web:3000`. The multi-stage Dockerfile uses `node:24.18.0-bookworm-slim`, standalone output, and a non-root runtime user.

- [ ] **Step 3: Implement deterministic E2E preparation**

`compose.e2e.yaml` exposes PostgreSQL only on `127.0.0.1:5432` and changes the database name to `q_nexus_e2e`; it is never part of production startup. `scripts/seed-e2e.ts` refuses `NODE_ENV=production`, clears only the test database, and creates `e2e-admin` with `Initial-e2e-passphrase-42` plus required password change, and `e2e-reader` display name `Lou` with `Reader-e2e-passphrase-42`. Configure Playwright base URL `http://127.0.0.1:3000`, Chromium, trace on first retry, and `npm run dev` as web server. Document this exact sequence:

```bash
POSTGRES_PASSWORD=local-dev-only docker compose -p q-nexus-e2e -f compose.yaml -f compose.e2e.yaml up -d postgres
DATABASE_URL=postgres://q_nexus:local-dev-only@127.0.0.1:5432/q_nexus_e2e npm run test:e2e:prepare
DATABASE_URL=postgres://q_nexus:local-dev-only@127.0.0.1:5432/q_nexus_e2e npm run test:e2e
```

- [ ] **Step 4: Complete browser authorization coverage**

Extend login E2E to change the initial password, reach home, log out, reject the old password, and accept the new password. Add five-failure lock, direct portal redirect, disabled-account generic failure, reader denial from `/manage/users`, 390×844 layout, dark theme, and 200% zoom. Capture human-review screenshots outside Git and require zero browser console errors or warnings.

- [ ] **Step 5: Execute the complete Slice 1 gate and commit**

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
POSTGRES_PASSWORD=config-check docker compose config
POSTGRES_PASSWORD=local-dev-only docker compose -p q-nexus-e2e -f compose.yaml -f compose.e2e.yaml up -d postgres
DATABASE_URL=postgres://q_nexus:local-dev-only@127.0.0.1:5432/q_nexus_e2e npm run test:e2e:prepare
DATABASE_URL=postgres://q_nexus:local-dev-only@127.0.0.1:5432/q_nexus_e2e npm run test:e2e
POSTGRES_PASSWORD=local-dev-only docker compose -p q-nexus-e2e -f compose.yaml -f compose.e2e.yaml down -v
git add Dockerfile compose.yaml compose.e2e.yaml ops scripts/seed-e2e.ts playwright.config.ts tests/e2e docs/operations/local-runbook.md package.json package-lock.json .env.example
git commit -m "ops: complete foundation and identity slice"
```

Expected: all gates pass; the app binds only to the configured address; login-to-home works without public-internet requests; Axe reports no violations; browser console has zero errors and warnings.

---

## Self-Review Results

- **Spec coverage:** Slice 1 covers foundation, AUTH-01 through AUTH-12, HOME-01/02, Editorial Space shell, responsive behavior, local assets, liveness, and the first Compose shape. Content-owned HOME-03 through HOME-07 and all knowledge, search, editor, templates, statistics, backup, and governance work remain assigned to later slices in `docs/plans/product-delivery-roadmap.md`.
- **Placeholder scan:** No deferred implementation markers remain; every task names exact files, tests, commands, outcomes, and critical values.
- **Type consistency:** `SessionUser`, `ResolvedSession`, `Session`, `IdentityModule`, `AccountAdministration`, `AppShell`, and `buildHomeModel` retain one name and responsibility throughout.
- **Seam check:** Hashing, token generation, clock, and production/test database substitution are real adapter seams. No page-to-database pass-through repository is introduced.
- **Prototype check:** No task imports from or merges `prototype/q-nexus-ui`; it remains evidence only.
