import type { OfflineDraftController } from "./index";

export type DraftContent = {
  title: string;
  summary: string;
  bodyMarkdown: string;
};
export type DraftSaveResult =
  | { ok: true; updatedAt: string }
  | {
      ok: false;
      error: string;
      conflict?: boolean;
      server?: { updatedAt: string; locked: boolean };
    };
export type DraftSessionState = {
  revision: string;
  locked: boolean;
  online: boolean;
  lastSavedAt: Date | null;
  error: string | null;
  conflict: { content: string; reason: "local" | "server" } | null;
};

/** One editing session owns save/recovery ordering, independently of React. */
export function createDraftSession({
  initial,
  revision,
  locked,
  online = true,
  drafts,
  readContent,
  save,
  onChange = () => {},
  now = () => new Date(),
}: {
  initial: DraftContent;
  revision: string;
  locked: boolean;
  online?: boolean;
  drafts: OfflineDraftController;
  readContent: () => DraftContent;
  save: (
    input: DraftContent & { expectedUpdatedAt: string },
  ) => Promise<DraftSaveResult>;
  onChange?: (state: DraftSessionState) => void;
  now?: () => Date;
}) {
  let persisted = { ...initial };
  let saving = false;
  let disposed = false;
  const current: DraftSessionState = {
    revision,
    locked,
    online,
    lastSavedAt: null,
    error: null,
    conflict: null,
  };
  const state = () => ({
    ...current,
    conflict: current.conflict ? { ...current.conflict } : null,
  });
  function notify() {
    if (!disposed) onChange(state());
  }
  function readLocal() {
    try {
      return drafts.loadLocalDraft(new Date(current.revision));
    } catch {
      current.error = "浏览器无法读取本地草稿，请检查浏览器存储。";
      return undefined;
    }
  }
  function capture() {
    if (disposed || current.conflict) return false;
    try {
      drafts.saveLocalDraft(readContent().bodyMarkdown);
      return true;
    } catch {
      current.error = "浏览器无法保存本地草稿，请先保留正文副本。";
      notify();
      return false;
    }
  }
  function recover() {
    if (disposed || saving) return;
    try {
      const local = drafts.loadLocalDraft(new Date(current.revision));
      if (local.kind === "none") return;
      if (
        local.content.replace(/\r\n?/g, "\n") ===
        persisted.bodyMarkdown.replace(/\r\n?/g, "\n")
      ) {
        drafts.clearLocalDraft();
      } else {
        current.conflict = { content: local.content, reason: "local" };
      }
    } catch {
      current.error = "浏览器无法读取本地草稿，请检查浏览器存储。";
    } finally {
      notify();
    }
  }
  async function autosave() {
    if (disposed || saving || current.locked || current.conflict) return;
    if (!current.online) {
      capture();
      return;
    }
    const submitted = { ...readContent() };
    if (
      submitted.title === persisted.title &&
      submitted.summary === persisted.summary &&
      submitted.bodyMarkdown === persisted.bodyMarkdown
    )
      return;
    saving = true;
    try {
      const localBefore = readLocal();
      const result = await save({
        ...submitted,
        expectedUpdatedAt: current.revision,
      });
      if (disposed) return;
      if (result.ok) {
        persisted = submitted;
        current.revision = result.updatedAt;
        current.lastSavedAt = now();
        current.error = null;
        // A response acknowledges its snapshot, never input typed while it was pending.
        const latest = readContent().bodyMarkdown;
        if (latest !== submitted.bodyMarkdown) drafts.saveLocalDraft(latest);
        else {
          const local = readLocal();
          if (
            local &&
            (local.kind === "none" ||
              local.content === submitted.bodyMarkdown ||
              (localBefore &&
                localBefore.kind !== "none" &&
                local.content === localBefore.content))
          )
            drafts.clearLocalDraft();
        }
      } else {
        if (capture()) current.error = result.error;
        if (result.conflict) {
          current.conflict = {
            content: readContent().bodyMarkdown,
            reason: "server",
          };
          if (result.server) {
            current.revision = result.server.updatedAt;
            current.locked = result.server.locked;
          }
        }
      }
    } catch {
      if (disposed) return;
      if (capture())
        current.error = "自动保存未完成，内容已保存在浏览器，请重试。";
    } finally {
      saving = false;
      notify();
    }
  }
  return {
    state,
    autosave,
    capture,
    recover,
    offline() {
      if (disposed) return;
      current.online = false;
      capture();
      notify();
    },
    online() {
      if (disposed) return;
      current.online = true;
      recover();
      notify();
    },
    chooseLocal() {
      if (disposed || !current.conflict) return;
      const content = current.conflict.content;
      current.conflict = null;
      current.error = null;
      notify();
      return content;
    },
    discardLocal() {
      if (disposed) return false;
      try {
        drafts.clearLocalDraft();
        current.conflict = null;
        notify();
        // Choosing the server ends this session; cleanup must not capture the rejected body.
        disposed = true;
        return true;
      } catch {
        current.error = "浏览器无法清理本地草稿，请重试。";
        notify();
        return false;
      }
    },
    dispose() {
      if (disposed) return;
      if (readContent().bodyMarkdown !== persisted.bodyMarkdown) capture();
      disposed = true;
    },
  };
}
