import { createReadingRequestQueue, readingIsActive } from "./client-model";

export type ReadingObservation = {
  articleId?: string;
  visible: boolean;
  focused: boolean;
};
export type ReadingRequest = {
  articleId: string;
  active: boolean;
  sequence: number;
  keepalive: boolean;
};

/** Owns reading transitions; browser sampling and request execution are adapters. */
export function createReadingSession({
  now = Date.now,
  dispatch,
}: {
  now?: () => number;
  dispatch: (request: ReadingRequest) => Promise<unknown>;
}) {
  const enqueue = createReadingRequestQueue(dispatch);
  let sequence = 0;
  let lastInteraction = now();
  let activeArticle: string | undefined;
  let latest: ReadingObservation | undefined;
  let running = false;
  let disposed = false;
  let dirty = false;
  let revision = 0;
  let lastSent = 0;
  const send = (articleId: string, active: boolean) =>
    enqueue({ articleId, active, sequence: ++sequence, keepalive: true });

  async function flush(): Promise<void> {
    if (running || disposed || !latest) return;
    dirty = false;
    const observation = latest;
    const active = readingIsActive({
      ...observation,
      selected: !!observation.articleId,
      now: now(),
      lastInteraction,
    });
    const next = active ? observation.articleId : undefined;
    if (!next && !activeArticle) return;
    // Tolerate timer jitter without missing the server's 20-second lease.
    if (next && next === activeArticle && now() - lastSent < 9_000) return;
    running = true;
    const currentRevision = revision;
    try {
      const previous = activeArticle;
      if (previous && previous !== next) {
        activeArticle = undefined;
        await send(previous, false);
      }
      if (disposed || revision !== currentRevision) return;
      if (next) {
        activeArticle = next;
        lastSent = now();
        await send(next, true);
      }
    } finally {
      running = false;
      if (dirty && !disposed) await flush();
    }
  }
  function sample(observation: ReadingObservation) {
    if (disposed) return Promise.resolve();
    revision++;
    latest = observation;
    dirty = true;
    return flush();
  }
  function pause() {
    revision++;
    latest = undefined;
    dirty = false;
    if (activeArticle) {
      void send(activeArticle, false);
      activeArticle = undefined;
    }
  }
  return {
    sample,
    interact(observation: ReadingObservation) {
      lastInteraction = now();
      return sample(observation);
    },
    pause,
    dispose() {
      disposed = true;
      pause();
    },
  };
}
