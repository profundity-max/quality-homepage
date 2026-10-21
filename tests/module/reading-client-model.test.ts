import { expect, test } from "vitest";
import {
  readingIsActive,
  createReadingRequestQueue,
  selectVisibleReadingArticle,
} from "@/modules/learning-stats/client-model";
test("hidden, unfocused, idle and offscreen reading pause", () => {
  const active = {
    visible: true,
    focused: true,
    selected: true,
    now: 1000,
    lastInteraction: 0,
  };
  expect(readingIsActive(active)).toBe(true);
  for (const override of [
    { visible: false },
    { focused: false },
    { selected: false },
    { now: 300_000 },
  ])
    expect(readingIsActive({ ...active, ...override })).toBe(false);
});
test("only the most visible inline body is selected, even when longer than viewport", () => {
  expect(
    selectVisibleReadingArticle(
      [
        { id: "off", top: 1000, bottom: 2000 },
        { id: "long", top: -100, bottom: 900 },
        { id: "short", top: 900, bottom: 950 },
      ],
      1000,
    ),
  ).toBe("long");
  expect(
    selectVisibleReadingArticle([{ id: "off", top: 1000, bottom: 2000 }], 1000),
  ).toBeUndefined();
});
test("reading requests preserve heartbeat, stop and next-article order while a request is pending", async () => {
  const order: string[] = [];
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queue = createReadingRequestQueue(async (value: string) => {
    order.push(value);
    if (value === "heartbeat") await pending;
  });
  const first = queue("heartbeat");
  const stop = queue("stop");
  const next = queue("next");
  // pagehide must start an idle keepalive request before the event returns.
  expect(order).toEqual(["heartbeat"]);
  await Promise.resolve();
  expect(order).toEqual(["heartbeat"]);
  release();
  await Promise.all([first, stop, next]);
  expect(order).toEqual(["heartbeat", "stop", "next"]);
});
