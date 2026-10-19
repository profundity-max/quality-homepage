import { PGlite } from "@electric-sql/pglite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { migrate } from "@/db/migrate";
import { GET as exportArticle } from "@/app/api/migration/export/article/route";
import { GET as exportFullSite } from "@/app/api/migration/export/full/route";

const context = vi.hoisted(() => ({
  database: null as PGlite | null,
  directory: "",
  session: null as { member: { id: string; role: string } } | null,
}));
vi.mock("@/app/session", () => ({
  getCurrentSession: async () => context.session,
}));
vi.mock("@/db/database", () => ({ getDatabase: () => context.database }));
vi.mock("@/modules/file-storage/configuration", () => ({
  resolveDataDirectory: () => context.directory,
}));

const editorId = "00000000-0000-4000-8000-0000000000f1";
const adminId = "00000000-0000-4000-8000-0000000000f2";
const readerId = "00000000-0000-4000-8000-0000000000f3";

describe("export success audit", () => {
  let database: PGlite;

  beforeEach(async () => {
    database = new PGlite();
    context.database = database;
    await migrate(database);
    context.directory = await mkdtemp(join(tmpdir(), "export-audit-"));
    await database.query(
      `insert into users (id, username, normalized_username, password_hash, role) values
      ($1, 'editor', 'editor', 'hash', 'editor'), ($2, 'admin', 'admin', 'hash', 'administrator'), ($3, 'reader', 'reader', 'hash', 'reader')`,
      [editorId, adminId, readerId],
    );
    await database.query(`insert into articles (id, stable_id, title, body_markdown, primary_topic_id, status)
      values ('00000000-0000-4000-8000-0000000000d1', 'audit-article', 'Audit article', 'Internal content', (select id from topics limit 1), 'draft')`);
    context.session = { member: { id: editorId, role: "editor" } };
  });

  afterEach(async () => {
    context.session = null;
    await database.close();
    await rm(context.directory, { recursive: true, force: true });
  });

  function article(stableId = "audit-article") {
    return exportArticle(
      new Request(
        `http://localhost/api/migration/export/article?stableId=${stableId}`,
      ),
    );
  }

  async function events() {
    return (
      await database.query<{
        actor_user_id: string;
        event_type: string;
        target_type: string;
        target_id: string;
      }>(
        "select actor_user_id, event_type, target_type, target_id from content_audit_events order by occurred_at",
      )
    ).rows;
  }

  test("article ZIP success records actor and stable article identifier before release", async () => {
    const response = await article();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(new Uint8Array(await response.arrayBuffer()).slice(0, 2)).toEqual(
      new Uint8Array([80, 75]),
    );
    expect(await events()).toEqual([
      {
        actor_user_id: editorId,
        event_type: "article.export",
        target_type: "article",
        target_id: "audit-article",
      },
    ]);
  });

  test("administrator full ZIP success records the full-site target", async () => {
    context.session = { member: { id: adminId, role: "administrator" } };
    const response = await exportFullSite();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(await events()).toEqual([
      {
        actor_user_id: adminId,
        event_type: "site.export",
        target_type: "site",
        target_id: "full",
      },
    ]);
  });

  test("anonymous, reader and editor full-export denials never record successful exports", async () => {
    context.session = null;
    expect((await article()).status).toBe(401);
    expect((await exportFullSite()).status).toBe(401);
    context.session = { member: { id: readerId, role: "reader" } };
    expect((await article()).status).toBe(403);
    expect((await exportFullSite()).status).toBe(403);
    context.session = { member: { id: editorId, role: "editor" } };
    expect((await exportFullSite()).status).toBe(403);
    expect(await events()).toEqual([]);
  });

  test("failed generation never records successful export", async () => {
    expect((await article("missing-article")).status).toBe(404);
    context.session = { member: { id: adminId, role: "administrator" } };
    await database.query("drop table articles cascade");
    const response = await exportFullSite();
    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await events()).toEqual([]);
  });

  test("audit persistence failure blocks both ZIP responses", async () => {
    await database.exec(`create function reject_export_audit() returns trigger language plpgsql as $$ begin raise exception 'Audit unavailable'; end $$;
      create trigger unavailable_audit before insert on content_audit_events for each row execute function reject_export_audit();`);
    const single = await article();
    expect(single.status).toBeGreaterThanOrEqual(400);
    expect(single.headers.get("content-type")).toContain("application/json");
    expect(single.headers.has("content-disposition")).toBe(false);
    context.session = { member: { id: adminId, role: "administrator" } };
    const full = await exportFullSite();
    expect(full.status).toBeGreaterThanOrEqual(400);
    expect(full.headers.get("content-type")).toContain("application/json");
    expect(full.headers.has("content-disposition")).toBe(false);
    expect(await events()).toEqual([]);
  });
});
