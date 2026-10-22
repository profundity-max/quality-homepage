import { expect, test } from "vitest";
import { createOfflineDraftController } from "@/modules/offline-drafts";
import {
  createDraftSession,
  type DraftContent,
  type DraftSaveResult,
} from "@/modules/offline-drafts/session";

function fixture(
  save: (
    input: DraftContent & { expectedUpdatedAt: string },
  ) => Promise<DraftSaveResult>,
) {
  const data = new Map<string, string>();
  const drafts = createOfflineDraftController({
    key: "draft:test",
    now: () => new Date("2026-10-22T00:00:00Z"),
    storage: {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        data.set(key, value);
      },
      removeItem: (key) => {
        data.delete(key);
      },
    },
  });
  let content = {
    title: "Title",
    summary: "Summary",
    bodyMarkdown: "Original",
  };
  const session = createDraftSession({
    initial: content,
    revision: "2026-10-21T00:00:00Z",
    locked: false,
    drafts,
    readContent: () => content,
    save,
  });
  return {
    session,
    drafts,
    change: (body: string) => {
      content = { ...content, bodyMarkdown: body };
    },
  };
}

test("a successful in-flight save preserves subsequent input as a recoverable local draft", async () => {
  let release!: (result: DraftSaveResult) => void;
  const saved: string[] = [];
  const f = fixture((input) => {
    saved.push(input.bodyMarkdown);
    return new Promise((resolve) => {
      release = resolve;
    });
  });
  f.change("Submitted");
  const pending = f.session.autosave();
  f.change("Typed while saving");
  f.session.offline();
  release({ ok: true, updatedAt: "2026-10-22T00:00:00Z" });
  await pending;
  expect(saved).toEqual(["Submitted"]);
  expect(
    f.drafts.loadLocalDraft(new Date("2026-10-22T00:00:00Z")),
  ).toMatchObject({ content: "Typed while saving" });
  expect(f.session.state().revision).toBe("2026-10-22T00:00:00Z");
});

test("conflict preserves current input, advances revision and blocks saving until a choice", async () => {
  const revisions: string[] = [];
  const f = fixture(async (input) => {
    revisions.push(input.expectedUpdatedAt);
    return revisions.length === 1
      ? {
          ok: false,
          error: "conflict",
          conflict: true,
          server: { updatedAt: "2026-10-22T01:00:00Z", locked: false },
        }
      : { ok: true, updatedAt: "2026-10-22T02:00:00Z" };
  });
  f.change("Local conflict");
  await f.session.autosave();
  await f.session.autosave();
  expect(revisions).toHaveLength(1);
  expect(f.session.chooseLocal()).toBe("Local conflict");
  await f.session.autosave();
  expect(revisions).toEqual(["2026-10-21T00:00:00Z", "2026-10-22T01:00:00Z"]);
  expect(f.drafts.loadLocalDraft(new Date())).toEqual({ kind: "none" });
});

test("reconnect offers local content without replacing the editor automatically", () => {
  const f = fixture(async () => ({
    ok: true,
    updatedAt: "2026-10-22T01:00:00Z",
  }));
  f.change("Offline draft");
  f.session.offline();
  f.session.online();
  expect(f.session.state().conflict).toEqual({
    reason: "local",
    content: "Offline draft",
  });
  expect(f.session.chooseLocal()).toBe("Offline draft");
  expect(f.session.state().conflict).toBeNull();
});

test("failed save is recoverable and a disposed session ignores a late response", async () => {
  const f = fixture(async () => {
    throw new Error("offline");
  });
  f.change("Recover me");
  await f.session.autosave();
  expect(f.drafts.loadLocalDraft(new Date())).toMatchObject({
    content: "Recover me",
  });
  let release!: (result: DraftSaveResult) => void;
  const g = fixture(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  g.change("Leaving");
  const pending = g.session.autosave();
  g.session.dispose();
  release({ ok: true, updatedAt: "2026-10-23T00:00:00Z" });
  await pending;
  expect(g.session.state().revision).toBe("2026-10-21T00:00:00Z");
  expect(g.drafts.loadLocalDraft(new Date())).toMatchObject({
    content: "Leaving",
  });
});

test("autosave while offline captures content typed after the disconnect without a network save", async () => {
  let calls = 0;
  const f = fixture(async () => {
    calls++;
    return { ok: true, updatedAt: "2026-10-22T01:00:00Z" };
  });
  f.session.offline();
  f.change("Typed after disconnect");
  await f.session.autosave();
  expect(calls).toBe(0);
  expect(f.drafts.loadLocalDraft(new Date())).toMatchObject({
    content: "Typed after disconnect",
  });
});

test("saving an edited recovered draft clears the earlier recovery copy", async () => {
  const f = fixture(async () => ({
    ok: true,
    updatedAt: "2026-10-22T01:00:00Z",
  }));
  f.drafts.saveLocalDraft("Recovered");
  f.session.recover();
  expect(f.session.chooseLocal()).toBe("Recovered");
  f.change("Recovered and edited");
  await f.session.autosave();
  expect(f.drafts.loadLocalDraft(new Date())).toEqual({ kind: "none" });
});

test("disconnecting while recovery is awaiting a choice preserves the original local draft", () => {
  const f = fixture(async () => ({
    ok: true,
    updatedAt: "2026-10-22T01:00:00Z",
  }));
  f.drafts.saveLocalDraft("Preexisting offline work");
  f.session.recover();
  f.session.offline();
  f.session.dispose();
  expect(f.drafts.loadLocalDraft(new Date())).toMatchObject({
    content: "Preexisting offline work",
  });
});

test("failed storage never reports that unsaved work is safely stored", async () => {
  const session = createDraftSession({
    initial: { title: "T", summary: "S", bodyMarkdown: "Initial" },
    revision: "2026-10-21T00:00:00Z",
    locked: false,
    drafts: {
      loadLocalDraft: () => ({ kind: "none" }),
      saveLocalDraft: () => {
        throw new Error("QuotaExceeded");
      },
      clearLocalDraft: () => {},
    },
    readContent: () => ({ title: "T", summary: "S", bodyMarkdown: "Unsaved" }),
    save: async () => {
      throw new Error("network");
    },
  });
  await session.autosave();
  expect(session.state().error).toContain("无法保存本地草稿");
  expect(session.state().error).not.toContain("已保存在浏览器");
});

test("choosing the server version cannot recreate discarded content during disposal", async () => {
  const f = fixture(async () => ({
    ok: false,
    conflict: true,
    error: "changed",
    server: { updatedAt: "2026-10-22T00:00:00Z", locked: false },
  }));
  f.change("Discard this body");
  await f.session.autosave();
  expect(f.session.discardLocal()).toBe(true);
  f.session.dispose();
  expect(f.drafts.loadLocalDraft(new Date())).toEqual({ kind: "none" });
});

test("unavailable browser storage does not prevent a server autosave", async () => {
  let saves = 0;
  const session = createDraftSession({
    initial: { title: "T", summary: "S", bodyMarkdown: "Initial" },
    revision: "2026-10-21T00:00:00Z",
    locked: false,
    drafts: {
      loadLocalDraft: () => {
        throw new Error("SecurityError");
      },
      saveLocalDraft: () => {
        throw new Error("SecurityError");
      },
      clearLocalDraft: () => {
        throw new Error("SecurityError");
      },
    },
    readContent: () => ({
      title: "T",
      summary: "S",
      bodyMarkdown: "Save remotely",
    }),
    save: async () => {
      saves++;
      return { ok: true, updatedAt: "2026-10-22T00:00:00Z" };
    },
  });
  await session.autosave();
  expect(saves).toBe(1);
  expect(session.state().revision).toBe("2026-10-22T00:00:00Z");
  expect(session.state().error).toContain("浏览器");
});
