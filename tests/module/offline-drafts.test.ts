import { describe, expect, test } from "vitest";

import {
  createOfflineDraftController,
  type OfflineDraftState,
} from "@/modules/offline-drafts";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

describe("offline draft controller", () => {
  test("stores a local draft when offline", () => {
    const storage = memoryStorage();
    const controller = createOfflineDraftController({
      storage,
      key: "draft:anova-intro",
      now: () => new Date("2026-08-17T00:00:00.000Z"),
    });

    controller.saveLocalDraft("本地内容");
    expect(storage.getItem("draft:anova-intro")).toContain("本地内容");
  });

  test("recovers a local draft newer than the server save", () => {
    const storage = memoryStorage();
    const controller = createOfflineDraftController({
      storage,
      key: "draft:anova-intro",
      now: () => new Date("2026-08-17T00:00:00.000Z"),
    });
    controller.saveLocalDraft("离线时写的内容");

    const state = controller.loadLocalDraft(
      new Date("2026-08-16T00:00:00.000Z"),
    );
    expect(state).toEqual<OfflineDraftState>({
      kind: "local-newer",
      content: "离线时写的内容",
    });
  });

  test("ignores a local draft older than the server save", () => {
    const storage = memoryStorage();
    const controller = createOfflineDraftController({
      storage,
      key: "draft:anova-intro",
      now: () => new Date("2026-08-17T00:00:00.000Z"),
    });
    controller.saveLocalDraft("旧内容");

    const state = controller.loadLocalDraft(
      new Date("2026-08-18T00:00:00.000Z"),
    );
    expect(state).toEqual<OfflineDraftState>({ kind: "none" });
  });

  test("clears the local draft after a successful sync", () => {
    const storage = memoryStorage();
    const controller = createOfflineDraftController({
      storage,
      key: "draft:anova-intro",
      now: () => new Date("2026-08-17T00:00:00.000Z"),
    });
    controller.saveLocalDraft("内容");
    controller.clearLocalDraft();
    expect(storage.getItem("draft:anova-intro")).toBeNull();
  });
});
