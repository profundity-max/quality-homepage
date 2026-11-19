"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import styles from "./statistics-field.module.css";

const symbols = [
  "σ",
  "Σ",
  "χ²",
  "x²",
  "x̄",
  "μ",
  "σ²",
  "spc",
  "msa",
  "faca",
  "doe",
  "anova",
  "cp",
  "cpk",
];
const stillRows = Array.from({ length: 56 }, (_, row) =>
  Array.from(
    { length: 72 },
    (_, column) => symbols[(column * 7 + row * 3) % symbols.length],
  ).join(" "),
);

type QuietArea = { left: number; right: number; top: number; bottom: number };

export function StatisticsField() {
  const field = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const elapsed = useRef(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const element = field.current;
    const surface = canvas.current;
    const context = surface?.getContext("2d", { alpha: true });
    if (!element || !surface || !context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let ink = "";
    let muted = "";
    let font = "";
    let quietAreas: QuietArea[] = [];
    let frame = 0;
    let lastTime = 0;
    let lastPaint = 0;

    function readTheme() {
      const theme = getComputedStyle(document.documentElement);
      ink = theme.getPropertyValue("--login-field-ink").trim();
      muted = theme.getPropertyValue("--login-field-muted").trim();
      font = theme.getPropertyValue("--login-font-glyph").trim();
    }

    function readQuietAreas() {
      quietAreas = [
        ...document.querySelectorAll<HTMLElement>("[data-statistics-quiet]"),
      ]
        .flatMap((node) => {
          // Attenuate the actual text lines, not the empty width of their section.
          if (node.dataset.statisticsQuiet === "text") {
            const walker = document.createTreeWalker(
              node,
              NodeFilter.SHOW_TEXT,
            );
            const rects: DOMRect[] = [];
            while (walker.nextNode()) {
              if (!walker.currentNode.textContent?.trim()) continue;
              const range = document.createRange();
              range.selectNodeContents(walker.currentNode);
              rects.push(...range.getClientRects());
            }
            return rects;
          }
          return [node.getBoundingClientRect()];
        })
        .map(({ left, right, top, bottom }) => ({ left, right, top, bottom }));
    }

    function attenuationAt(x: number, y: number) {
      let opacity = 1;
      for (const area of quietAreas) {
        const dx = Math.max(area.left - x, 0, x - area.right);
        const dy = Math.max(area.top - y, 0, y - area.bottom);
        const feather = Math.min(1, Math.hypot(dx, dy) / 24);
        // Keep a visible continuation beneath content; never cut a hole in it.
        opacity = Math.min(opacity, 0.32 + feather * 0.68);
      }
      return opacity;
    }

    // The field is decorative typography. It does not imply measured values.
    function paint() {
      if (!context) return;
      context.clearRect(0, 0, width, height);
      const gapX = 15;
      const gapY = 16;
      const columns = Math.ceil(width / gapX) + 6;
      const rows = Math.ceil(height / gapY) + 1;
      const seconds = elapsed.current;
      context.font = `400 11px ${font}`;

      for (let row = 0; row < rows; row += 1) {
        const lane = Math.floor(row / 7);
        const offset = (row % 7) - 3;
        const y = row * gapY + 12;
        const drift = seconds * (12 + (lane % 3) * 3) + lane * 5;
        const packet = ((seconds * 27 + lane * 233) % (width + 600)) - 300;
        for (let column = 0; column < columns; column += 1) {
          const x = ((column * gapX + drift) % (columns * gapX)) - gapX * 3;
          const seed = (((column + 1024) * 73) ^ ((row + 1024) * 193)) >>> 0;
          const distance = (x - packet) / (180 + (lane % 3) * 45);
          const energy = Math.exp(
            -distance * distance - offset * offset * 0.55,
          );
          const slot = ((column % 24) + 24) % 24;
          let symbol: string;
          if (offset === 0 && slot < 5) {
            if (slot !== 0) continue;
            symbol =
              symbols[7 + ((lane + Math.floor((column + 24) / 24)) % 7)]!;
          } else {
            symbol = energy < 0.12 && seed % 3 !== 0 ? "." : symbols[seed % 7]!;
          }
          context.globalAlpha =
            (0.07 + energy * 0.52) *
            (0.75 + (seed % 4) / 12) *
            attenuationAt(x, y);
          context.fillStyle = symbol === "." ? muted : ink;
          context.fillText(symbol, x, y);
        }
      }
      context.globalAlpha = 1;
    }

    function animate(time: number) {
      frame = 0;
      if (paused || reducedMotion.matches || document.hidden) return;
      if (lastTime) elapsed.current += Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;
      if (time - lastPaint >= 1000 / (width < 600 ? 24 : 30)) {
        paint();
        lastPaint = time;
      }
      frame = requestAnimationFrame(animate);
    }

    function sync() {
      cancelAnimationFrame(frame);
      lastTime = 0;
      paint();
      if (!paused && !reducedMotion.matches && !document.hidden)
        frame = requestAnimationFrame(animate);
      element?.setAttribute("data-ready", "true");
      element?.setAttribute(
        "data-motion",
        reducedMotion.matches ? "reduced" : paused ? "paused" : "running",
      );
    }

    function resize() {
      if (!surface || !context) return;
      width = window.innerWidth;
      height = window.innerHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      surface.width = Math.round(width * ratio);
      surface.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      readQuietAreas();
      sync();
    }

    const themeObserver = new MutationObserver(() => {
      readTheme();
      sync();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-appearance"],
    });
    const layoutObserver = new ResizeObserver(() => {
      readQuietAreas();
      paint();
    });
    document
      .querySelectorAll("[data-statistics-quiet]")
      .forEach((node) => layoutObserver.observe(node));
    const onScroll = () => {
      readQuietAreas();
      if (paused || reducedMotion.matches) paint();
    };
    readTheme();
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", sync);
    reducedMotion.addEventListener("change", sync);

    return () => {
      cancelAnimationFrame(frame);
      themeObserver.disconnect();
      layoutObserver.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", sync);
      reducedMotion.removeEventListener("change", sync);
    };
  }, [paused]);

  return (
    <>
      <div ref={field} className={styles.field} aria-hidden="true">
        <svg
          className={styles.fallback}
          viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid slice"
          focusable="false"
        >
          {stillRows.map((line, index) => (
            <text key={index} x="0" y={index * 16 + 12}>
              {line}
            </text>
          ))}
        </svg>
        <canvas ref={canvas} className={styles.canvas} />
      </div>
      <button
        className={styles.motionControl}
        type="button"
        aria-label={paused ? "播放背景动画" : "暂停背景动画"}
        aria-pressed={paused}
        onClick={() => setPaused((value) => !value)}
      >
        {paused ? (
          <Play size={16} aria-hidden="true" />
        ) : (
          <Pause size={16} aria-hidden="true" />
        )}
        <span>{paused ? "播放背景" : "暂停背景"}</span>
      </button>
    </>
  );
}
