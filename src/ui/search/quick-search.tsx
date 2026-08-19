"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { SearchGroups } from "@/modules/search";

import { HighlightText } from "./highlight";
import styles from "./quick-search.module.css";

type SearchItem = {
  type: "article" | "topic" | "template" | "book";
  label: string;
  detail: string;
  href: string;
};

export function QuickSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<SearchGroups | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const items = useMemo<SearchItem[]>(() => {
    if (!groups) return [];
    return [
      ...groups.articles.map((hit) => ({
        type: "article" as const,
        label: hit.title,
        detail: hit.sectionName,
        href: `/articles/${hit.stableId}`,
      })),
      ...groups.topics.map((hit) => ({
        type: "topic" as const,
        label: hit.name,
        detail: hit.sectionName,
        href: `/quality?topic=${hit.stableId}`,
      })),
      ...groups.templates.map((hit) => ({
        type: "template" as const,
        label: hit.name,
        detail: hit.categoryName,
        href: `/templates/${hit.stableId}`,
      })),
      ...groups.books.map((hit) => ({
        type: "book" as const,
        label: hit.title,
        detail: hit.author,
        href: "/books",
      })),
    ];
  }, [groups]);

  const openAt = useCallback(
    (index: number) => {
      const item = items[index];
      if (item) router.push(item.href);
    },
    [items, router],
  );

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  useEffect(() => {
    window.clearTimeout(debounceRef.current);
    if (!open || query.trim().length === 0) return;
    debounceRef.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search/quick?q=${encodeURIComponent(query)}`,
        );
        if (response.ok) {
          setGroups((await response.json()) as SearchGroups);
          setSelectedIndex(0);
        }
      } catch {
        setGroups(null);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(debounceRef.current);
  }, [open, query]);

  const total = items.length;

  function moveSelection(delta: number) {
    if (total === 0) return;
    setSelectedIndex((current) => (current + delta + total) % total);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSelection(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const trimmed = query.trim();
      if (selectedIndex >= 0 && selectedIndex < total) {
        openAt(selectedIndex);
      } else if (trimmed) {
        router.push(`/search?q=${encodeURIComponent(trimmed)}`);
      }
    }
  }

  function handleQueryChange(event: React.ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setQuery(value);
    if (value.trim().length === 0) {
      setGroups(null);
      setSelectedIndex(-1);
      setLoading(false);
    } else {
      setLoading(true);
    }
  }

  const typeNames = {
    article: "文章",
    topic: "主题",
    template: "模板",
    book: "书籍",
  } as const;

  function groupStart(type: SearchItem["type"]): number {
    if (type === "article") return 0;
    if (type === "topic") return groups?.articles.length ?? 0;
    if (type === "template") {
      return (groups?.articles.length ?? 0) + (groups?.topics.length ?? 0);
    }
    return (
      (groups?.articles.length ?? 0) +
      (groups?.topics.length ?? 0) +
      (groups?.templates.length ?? 0)
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.launcher}
        onClick={() => setOpen(true)}
      >
        搜索知识
      </button>

      {open ? (
        <div className={styles.backdrop} role="presentation">
          <div
            className={styles.panel}
            role="dialog"
            aria-modal="true"
            aria-label="快速搜索"
          >
            <div className={styles.field}>
              <label htmlFor="quick-search-input">搜索知识</label>
              <input
                ref={inputRef}
                id="quick-search-input"
                type="search"
                value={query}
                placeholder="文章、主题、模板或书籍"
                onChange={handleQueryChange}
                onKeyDown={handleKeyDown}
              />
              <button
                type="button"
                className={styles.close}
                onClick={() => {
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
              >
                关闭
              </button>
            </div>

            {loading ? <p className={styles.status}>正在搜索…</p> : null}

            {!loading && query.trim().length === 0 ? (
              <p className={styles.status}>输入关键词开始搜索。</p>
            ) : null}

            {!loading && query.trim().length > 0 && groups ? (
              total === 0 ? (
                <p className={styles.status}>
                  未找到相关内容，回车查看完整结果。
                </p>
              ) : (
                <div className={styles.results}>
                  {(
                    [
                      ["article", groups.articles],
                      ["topic", groups.topics],
                      ["template", groups.templates],
                      ["book", groups.books],
                    ] as const
                  ).map(([type, hits]) => {
                    const start = groupStart(type);
                    return hits.length > 0 ? (
                      <section
                        key={type}
                        className={styles.group}
                        aria-label={typeNames[type]}
                      >
                        <h2>{typeNames[type]}</h2>
                        <ul>
                          {hits.map((hit, offset) => {
                            const index = start + offset;
                            const item = items[index]!;
                            return (
                              <li key={item.href}>
                                <Link
                                  className={
                                    index === selectedIndex
                                      ? styles.selected
                                      : undefined
                                  }
                                  aria-selected={index === selectedIndex}
                                  href={item.href}
                                  onMouseEnter={() => setSelectedIndex(index)}
                                >
                                  <span className={styles.itemLabel}>
                                    <HighlightText
                                      text={item.label}
                                      query={query}
                                    />
                                  </span>
                                  <span className={styles.itemDetail}>
                                    {item.detail}
                                  </span>
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    ) : null;
                  })}
                </div>
              )
            ) : null}

            <div className={styles.footer}>
              <Link
                href={`/search?q=${encodeURIComponent(query.trim())}`}
                onClick={() => setOpen(false)}
              >
                查看全部
              </Link>
              <span>↑↓ 选择 · Enter 打开 · Esc 关闭</span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
