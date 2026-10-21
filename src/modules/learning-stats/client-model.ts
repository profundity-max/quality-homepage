export const READING_IDLE_MS = 5 * 60_000;
export function readingIsActive(input: {
  visible: boolean;
  focused: boolean;
  selected: boolean;
  now: number;
  lastInteraction: number;
}) {
  return (
    input.visible &&
    input.focused &&
    input.selected &&
    input.now - input.lastInteraction < READING_IDLE_MS
  );
}
// Pick only one article; long inline bodies can never reach an intersection ratio of .5.
export function selectVisibleReadingArticle(
  elements: { id: string; top: number; bottom: number }[],
  viewportHeight: number,
) {
  return elements
    .map((element) => ({
      ...element,
      visible: Math.max(
        0,
        Math.min(element.bottom, viewportHeight) - Math.max(element.top, 0),
      ),
    }))
    .filter((element) => element.visible > 0)
    .sort(
      (a, b) => b.visible - a.visible || Math.abs(a.top) - Math.abs(b.top),
    )[0]?.id;
}

// Pause can arrive while a heartbeat is in flight. Preserve wire order for both.
export function createReadingRequestQueue<T>(
  dispatch: (input: T) => Promise<unknown>,
) {
  let pending: Promise<void> | undefined;
  return (input: T) => {
    const start = () => {
      try {
        return Promise.resolve(dispatch(input));
      } catch {
        return Promise.resolve();
      }
    };
    // Start immediately when idle: deferring fetch to a later microtask during
    // pagehide can lose the final keepalive request as the document unloads.
    const next = (pending ? pending.then(start) : start()).then(
      () => undefined,
      () => undefined,
    );
    pending = next;
    void next.then(() => {
      if (pending === next) pending = undefined;
    });
    return next;
  };
}
