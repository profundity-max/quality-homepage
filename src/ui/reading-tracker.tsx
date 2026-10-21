"use client";
import { useEffect } from "react";
import {
  readingIsActive,
  createReadingRequestQueue,
  selectVisibleReadingArticle,
} from "@/modules/learning-stats/client-model";

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
    let sequence = 0,
      lastInteraction = Date.now(),
      activeArticle: string | undefined;
    let sending = false,
      stopped = false,
      lastSent = 0,
      pauseRevision = 0;
    const enqueue = createReadingRequestQueue(
      (input: {
        articleId: string;
        active: boolean;
        keepalive: boolean;
        sequence: number;
      }) =>
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
    );
    const send = (articleId: string, active: boolean, keepalive = true) =>
      enqueue({ articleId, active, keepalive, sequence: ++sequence });
    const sample = async () => {
      if (sending || stopped) return;
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
      const active = readingIsActive({
        visible: document.visibilityState === "visible",
        focused: document.hasFocus(),
        selected: !!selected,
        now: Date.now(),
        lastInteraction,
      });
      const next = active ? selected : undefined;
      if (!next && !activeArticle) return;
      // Timer callbacks can arrive just under 10s; leave tolerance so a tiny
      // scheduling difference cannot skip an entire heartbeat and expire the lease.
      if (next && next === activeArticle && Date.now() - lastSent < 9_000)
        return;
      sending = true;
      const revision = pauseRevision;
      try {
        const previous = activeArticle;
        if (previous && previous !== next) {
          activeArticle = undefined;
          await send(previous, false);
        }
        // A blur/pagehide during the stop must not restart the next article.
        if (stopped || revision !== pauseRevision) return;
        if (next) {
          activeArticle = next;
          lastSent = Date.now();
          await send(next, true);
        }
      } finally {
        sending = false;
        if (!stopped && revision !== pauseRevision) void sample();
      }
    };
    const interact = () => {
      lastInteraction = Date.now();
      void sample();
    };
    const pause = () => {
      pauseRevision++;
      if (activeArticle) {
        void send(activeArticle, false, true);
        activeArticle = undefined;
      }
    };
    const visibility = () => {
      if (document.visibilityState !== "visible") pause();
      else void sample();
    };
    const blur = () => pause();
    const events = ["scroll", "pointerdown", "keydown"] as const;
    events.forEach((event) =>
      window.addEventListener(event, interact, { passive: true }),
    );
    window.addEventListener("focus", interact);
    window.addEventListener("blur", blur);
    window.addEventListener("pagehide", pause);
    document.addEventListener("visibilitychange", visibility);
    const timer = window.setInterval(() => void sample(), 10_000);
    void sample();
    return () => {
      stopped = true;
      clearInterval(timer);
      pause();
      events.forEach((event) => window.removeEventListener(event, interact));
      window.removeEventListener("focus", interact);
      window.removeEventListener("blur", blur);
      window.removeEventListener("pagehide", pause);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  return null;
}
