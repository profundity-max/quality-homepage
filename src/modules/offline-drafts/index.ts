export type OfflineDraftState =
  | { kind: "none" }
  | { kind: "local-newer" | "local-conflict"; content: string };

export type OfflineDraftController = {
  saveLocalDraft(content: string): void;
  loadLocalDraft(serverUpdatedAt: Date): OfflineDraftState;
  clearLocalDraft(): void;
};

/**
 * 离线临时草稿（EDIT-06/07）：断网时内容存 localStorage（带时间戳），
 * 恢复联网后与服务器版本比较——本地更新则提示恢复，服务器较新时仍保留内容供人工选择。
 */
export function createOfflineDraftController({
  storage,
  key,
  now,
}: {
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  key: string;
  now: () => Date;
}): OfflineDraftController {
  function saveLocalDraft(content: string): void {
    storage.setItem(
      key,
      JSON.stringify({ content, savedAt: now().toISOString() }),
    );
  }

  function loadLocalDraft(serverUpdatedAt: Date): OfflineDraftState {
    const raw = storage.getItem(key);
    if (!raw) return { kind: "none" };
    try {
      const parsed = JSON.parse(raw) as { content: string; savedAt: string };
      const localSavedAt = new Date(parsed.savedAt);
      if (
        typeof parsed.content !== "string" ||
        !Number.isFinite(localSavedAt.getTime())
      )
        return { kind: "none" };
      if (localSavedAt.getTime() > serverUpdatedAt.getTime()) {
        return { kind: "local-newer", content: parsed.content };
      }
      return { kind: "local-conflict", content: parsed.content };
    } catch {
      return { kind: "none" };
    }
  }

  function clearLocalDraft(): void {
    storage.removeItem(key);
  }

  return { saveLocalDraft, loadLocalDraft, clearLocalDraft };
}
