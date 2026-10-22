"use client";
import { useEffect } from "react";
import { selectVisibleReadingArticle } from "@/modules/learning-stats/client-model";
import { createReadingSession } from "@/modules/learning-stats/client-session";

export function ReadingTracker() {
  useEffect(() => {
    // getRandomValues also works on the LAN HTTP origin, where randomUUID is unavailable.
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    const tabId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    const session = createReadingSession({
      dispatch: (input) =>
        fetch("/api/stats/reading", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            articleId: input.articleId,
            tabId,
            sequence: input.sequence,
            active: input.active,
          }),
          keepalive: input.keepalive,
        }),
    });
    const observe = () => {
      const selected = selectVisibleReadingArticle(
        Array.from(
          document.querySelectorAll<HTMLElement>("[data-reading-article]"),
        ).map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            id: element.dataset.readingArticle!,
            top: rect.top,
            bottom: rect.bottom,
          };
        }),
        window.innerHeight,
      );
      return {
        articleId: selected,
        visible: document.visibilityState === "visible",
        focused: document.hasFocus(),
      };
    };
    const sample = () => void session.sample(observe());
    const interact = () => void session.interact(observe());
    const pause = () => session.pause();
    const visibility = () => {
      if (document.visibilityState !== "visible") pause();
      else sample();
    };
    const events = ["scroll", "pointerdown", "keydown"] as const;
    events.forEach((event) =>
      window.addEventListener(event, interact, { passive: true }),
    );
    window.addEventListener("focus", interact);
    window.addEventListener("blur", pause);
    window.addEventListener("pagehide", pause);
    document.addEventListener("visibilitychange", visibility);
    const timer = window.setInterval(sample, 10_000);
    sample();
    return () => {
      clearInterval(timer);
      session.dispose();
      events.forEach((event) => window.removeEventListener(event, interact));
      window.removeEventListener("focus", interact);
      window.removeEventListener("blur", pause);
      window.removeEventListener("pagehide", pause);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  return null;
}
