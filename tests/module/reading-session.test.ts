import { expect, test } from "vitest";
import { createReadingSession } from "@/modules/learning-stats/client-session";

const visible = (articleId = "article-a") => ({
  articleId,
  visible: true,
  focused: true,
});

test("blur during an in-flight heartbeat sends stop after heartbeat and never restarts stale reading", async () => {
  const sent: {
    articleId: string;
    active: boolean;
    sequence: number;
    keepalive: boolean;
  }[] = [];
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const session = createReadingSession({
    now: () => 0,
    dispatch: async (request) => {
      sent.push(request);
      if (request.active) await pending;
    },
  });
  const start = session.sample(visible());
  session.pause();
  expect(sent.map((r) => r.active)).toEqual([true]);
  release();
  await start;
  await Promise.resolve();
  expect(sent.map((r) => [r.active, r.sequence])).toEqual([
    [true, 1],
    [false, 2],
  ]);
  expect(sent[1].keepalive).toBe(true);
});

test("a newer visible article replaces a selection waiting for the previous stop", async () => {
  const sent: string[] = [];
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const session = createReadingSession({
    now: () => 0,
    dispatch: async (r) => {
      sent.push(`${r.articleId}:${r.active}`);
      if (!r.active && r.articleId === "article-a") await pending;
    },
  });
  await session.sample(visible());
  const switching = session.sample(visible("article-b"));
  await session.sample(visible("article-c"));
  release();
  await switching;
  expect(sent).toEqual(["article-a:true", "article-a:false", "article-c:true"]);
});

test("timer jitter keeps the lease alive, idle stops, and interaction resumes", async () => {
  let time = 0;
  const sent: boolean[] = [];
  const session = createReadingSession({
    now: () => time,
    dispatch: async (r) => {
      sent.push(r.active);
    },
  });
  await session.sample(visible());
  time = 8_999;
  await session.sample(visible());
  expect(sent).toEqual([true]);
  time = 9_999;
  await session.sample(visible());
  expect(sent).toEqual([true, true]);
  time = 300_000;
  await session.sample(visible());
  expect(sent).toEqual([true, true, false]);
  await session.interact(visible());
  expect(sent).toEqual([true, true, false, true]);
});

test("stop starts immediately on pagehide and disposal prevents future starts", async () => {
  const sent: boolean[] = [];
  const session = createReadingSession({
    dispatch: async (r) => {
      sent.push(r.active);
    },
  });
  await session.sample(visible());
  // Let the request queue become idle, as it would between heartbeats.
  await Promise.resolve();
  session.dispose();
  expect(sent).toEqual([true, false]);
  await session.interact(visible("article-b"));
  expect(sent).toEqual([true, false]);
});

test("a failed heartbeat does not poison later requests or pause", async () => {
  let time = 0;
  const sent: boolean[] = [];
  const session = createReadingSession({
    now: () => time,
    dispatch: async (r) => {
      sent.push(r.active);
      if (sent.length === 1) throw new Error("offline");
    },
  });
  await session.sample(visible());
  time = 10_000;
  await session.sample(visible());
  session.pause();
  await Promise.resolve();
  expect(sent).toEqual([true, true, false]);
});
