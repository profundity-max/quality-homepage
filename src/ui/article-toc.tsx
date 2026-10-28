"use client";

import type { TocEntry } from "@/modules/shared/markdown-renderer";
import styles from "./article-toc.module.css";

export function ArticleToc({
  entries,
  variant = "desktop",
}: {
  entries: TocEntry[];
  variant?: "desktop" | "compact";
}) {
  if (!entries.length) return null;
  function links() {
    return (
      <nav aria-label="正文目录导航">
        <ul className={styles.list}>
          {entries.map((entry) => (
            <li
              key={entry.id}
              style={{ paddingLeft: `${Math.max(0, entry.depth - 2) * 12}px` }}
            >
              <a href={`#${entry.id}`}>{entry.text}</a>
            </li>
          ))}
        </ul>
      </nav>
    );
  }
  if (variant === "desktop")
    return (
      <aside className={styles.desktop} aria-label="正文目录">
        <h2>本页目录</h2>
        {links()}
      </aside>
    );
  return (
    <>
      <details
        className={styles.compact}
        onClick={(event) => {
          const link = (event.target as Element).closest<HTMLAnchorElement>(
            'a[href^="#"]',
          );
          if (!link) return;
          const details = event.currentTarget;
          details.open = false;
          requestAnimationFrame(() => {
            const target = document.getElementById(link.hash.slice(1));
            if (target) {
              target.tabIndex = -1;
              target.focus({ preventScroll: true });
              target.scrollIntoView({ block: "start" });
            }
          });
        }}
      >
        <summary>本页目录</summary>
        {links()}
      </details>
    </>
  );
}
