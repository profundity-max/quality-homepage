"use client";

import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

// Mermaid has global configuration. Serialize configuration and rendering so
// diagrams in separate readers cannot accidentally use each other's theme.
let renderQueue = Promise.resolve();

export function MermaidRenderer({ html }: { html: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [themeRevision, setThemeRevision] = useState(0);

  useEffect(() => {
    const update = () => setThemeRevision((value) => value + 1);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const media = matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", update);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // html comes exclusively from the sanitized Markdown rendering pipeline.
    container.innerHTML = html;
    const blocks = Array.from(
      container.querySelectorAll<HTMLElement>("pre > code.language-mermaid"),
    );
    if (!blocks.length) return;
    let cancelled = false;
    const theme = document.documentElement.dataset.theme;
    const dark =
      theme === "dark" ||
      (theme === "system" &&
        matchMedia("(prefers-color-scheme: dark)").matches);
    const editorial = !!container.closest('[data-design-system="editorial"]');
    const colors = getComputedStyle(container);
    const foreground = colors.getPropertyValue("--color-text").trim();
    const accent = colors.getPropertyValue("--color-accent").trim();
    const surface = colors.getPropertyValue("--color-surface-muted").trim();
    renderQueue = renderQueue
      .catch(() => {})
      .then(async () => {
        if (cancelled) return;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          suppressErrorRendering: true,
          theme: editorial ? "base" : dark ? "dark" : "neutral",
          flowchart: { htmlLabels: false },
          // These values are application-owned CSS tokens, never diagram input.
          ...(editorial
            ? {
                themeVariables: {
                  darkMode: dark,
                  primaryColor: surface,
                  primaryTextColor: foreground,
                  primaryBorderColor: accent,
                  lineColor: accent,
                  textColor: foreground,
                  secondaryColor: surface,
                  tertiaryColor: surface,
                },
              }
            : {}),
        });
        for (const block of blocks) {
          if (cancelled) return;
          const pre = block.closest("pre");
          if (!pre) continue;
          try {
            const { svg } = await mermaid.render(
              `mermaid-${crypto.randomUUID()}`,
              block.textContent ?? "",
            );
            if (cancelled) return;
            const wrapper = document.createElement("div");
            wrapper.innerHTML = svg;
            const image = wrapper.querySelector("svg");
            if (image) {
              image.setAttribute("role", "img");
              image.setAttribute("aria-label", "知识图解");
              pre.replaceWith(image);
            }
          } catch {
            if (cancelled) return;
            const message = document.createElement("p");
            message.setAttribute("role", "status");
            message.textContent = "图解暂时无法显示，以下保留原始内容。";
            pre.before(message);
          }
        }
      });
    return () => {
      cancelled = true;
    };
  }, [html, themeRevision]);

  // Replacing client-rendered SVG via React would discard Mermaid's output.
  // The effect resets the same sanitized HTML whenever content/theme changes.
  return <div ref={containerRef} dangerouslySetInnerHTML={{ __html: html }} />;
}
