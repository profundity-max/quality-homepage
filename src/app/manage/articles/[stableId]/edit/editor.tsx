"use client";

import { useEffect, useRef, useState } from "react";

import type { EditingArticle } from "@/modules/knowledge-editing";
import { applyFormatting, type FormatCommand } from "@/modules/editor-commands";
import {
  extractTableOfContents,
  renderMarkdown,
} from "@/modules/shared/markdown-renderer";
import type { TocEntry } from "@/modules/shared/markdown-renderer";

import styles from "./editor.module.css";

type EditorMode = "preview" | "source" | "split";

const toolbarCommands: { label: string; command: FormatCommand }[] = [
  { label: "加粗", command: "bold" },
  { label: "斜体", command: "italic" },
  { label: "标题", command: "h2" },
  { label: "列表", command: "unordered-list" },
  { label: "引用", command: "quote" },
  { label: "表格", command: "table" },
  { label: "链接", command: "link" },
  { label: "代码", command: "code" },
];

const menuCommands: { label: string; command: FormatCommand }[] = [
  { label: "三级标题", command: "h3" },
  { label: "有序列表", command: "ordered-list" },
  { label: "图片", command: "image" },
  { label: "信息 Callout", command: "callout-info" },
  { label: "提示 Callout", command: "callout-tip" },
  { label: "重点 Callout", command: "callout-important" },
  { label: "警告 Callout", command: "callout-warning" },
  { label: "示例 Callout", command: "callout-example" },
  { label: "公式 Callout", command: "callout-formula" },
];

export function Editor({
  article,
  topics,
  saveDraftAction,
  publishAction,
}: {
  article: EditingArticle;
  topics: { id: string; stableId: string; name: string; archived: boolean }[];
  saveDraftAction?: (formData: FormData) => Promise<void>;
  publishAction?: (formData: FormData) => Promise<void>;
}) {
  const [mode, setMode] = useState<EditorMode>("preview");
  const [body, setBody] = useState(article.bodyMarkdown);
  const [title, setTitle] = useState(article.title);
  const [summary, setSummary] = useState(article.summary);
  const [showOutline, setShowOutline] = useState(false);
  const [showProperties, setShowProperties] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [toc, setToc] = useState<TocEntry[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  // 预览渲染：正文变化时刷新
  useEffect(() => {
    void refreshPreview(body);
  }, [body]);

  async function refreshPreview(markdown: string) {
    const [html, entries] = await Promise.all([
      renderMarkdown(markdown),
      extractTableOfContents(markdown),
    ]);
    setPreviewHtml(html);
    setToc(entries);
  }

  function runCommand(command: FormatCommand) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const { selectionStart, selectionEnd } = textarea;
    const result = applyFormatting(
      body,
      {
        start: selectionStart,
        end: selectionEnd,
      },
      command,
    );
    setBody(result.text);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  }

  return (
    <div className={styles.editor}>
      <header className={styles.toolbar}>
        <div className={styles.modeSwitch} role="tablist" aria-label="编辑模式">
          {(["preview", "source", "split"] as const).map((item) => (
            <button
              key={item}
              role="tab"
              aria-selected={mode === item}
              className={mode === item ? styles.modeActive : styles.modeButton}
              onClick={() => setMode(item)}
            >
              {item === "preview"
                ? "即时预览"
                : item === "source"
                  ? "源码"
                  : "分栏"}
            </button>
          ))}
        </div>
        <div className={styles.toolbarCommands}>
          {toolbarCommands.map(({ label, command }) => (
            <button
              key={command}
              className={styles.toolButton}
              onClick={() => runCommand(command)}
              type="button"
            >
              {label}
            </button>
          ))}
          <div className={styles.menuWrap}>
            <button
              className={styles.toolButton}
              onClick={() => setShowMenu((v) => !v)}
              type="button"
              aria-expanded={showMenu}
            >
              命令菜单
            </button>
            {showMenu && (
              <div className={styles.menu}>
                {menuCommands.map(({ label, command }) => (
                  <button
                    key={command}
                    className={styles.menuItem}
                    onClick={() => {
                      runCommand(command);
                      setShowMenu(false);
                    }}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className={styles.panels}>
          <button
            className={styles.toolButton}
            onClick={() => setShowOutline((v) => !v)}
            type="button"
          >
            大纲
          </button>
          <button
            className={styles.toolButton}
            onClick={() => setShowProperties((v) => !v)}
            type="button"
          >
            属性
          </button>
        </div>
      </header>

      <div className={styles.statusBar}>
        <span>
          {lastSavedAt
            ? `最后保存：${lastSavedAt}`
            : article.status === "published"
              ? "正在编辑已发布文章（阅读者仍看到最后发布版本）"
              : "未保存"}
        </span>
      </div>

      <div className={styles.workspace}>
        {(mode === "source" || mode === "split") && (
          <textarea
            ref={textareaRef}
            className={styles.sourceArea}
            aria-label="Markdown 源码"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            spellCheck={false}
          />
        )}
        {(mode === "preview" || mode === "split") && (
          <div className={styles.previewArea} aria-label="预览">
            <div
              className={styles.preview}
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
        )}
        {showOutline && toc.length > 0 && (
          <aside className={styles.outline} aria-label="文章大纲">
            <h2>大纲</h2>
            <ul>
              {toc.map((entry) => (
                <li
                  key={entry.id}
                  style={{ paddingLeft: `${(entry.depth - 2) * 12}px` }}
                >
                  {entry.text}
                </li>
              ))}
            </ul>
          </aside>
        )}
        {showProperties && (
          <aside className={styles.properties} aria-label="文章属性">
            <h2>属性</h2>
            <form action={publishAction} className={styles.propertyForm}>
              <input type="hidden" name="stableId" value={article.stableId} />
              <label>
                标题
                <input
                  name="title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <label>
                摘要
                <textarea
                  name="summary"
                  value={summary}
                  onChange={(event) => setSummary(event.target.value)}
                />
              </label>
              <label>
                主题
                <select
                  name="primaryTopicId"
                  defaultValue={article.primaryTopicId}
                >
                  <option value="">选择主题</option>
                  {topics.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.name}
                      {topic.archived ? "（已归档）" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                标签（逗号分隔）
                <input name="tags" defaultValue={article.tags.join(", ")} />
              </label>
              <label>
                内容负责人
                <input
                  name="contentOwnerId"
                  defaultValue={article.contentOwnerId ?? ""}
                />
              </label>
              <label>
                下次复核日期
                <input
                  name="nextReviewAt"
                  type="date"
                  defaultValue={
                    article.nextReviewAt
                      ? article.nextReviewAt.toISOString().slice(0, 10)
                      : ""
                  }
                />
              </label>
              <input type="hidden" name="bodyMarkdown" value={body} />
              <div className={styles.actions}>
                <button
                  className={styles.primaryButton}
                  formAction={saveDraftAction}
                  onClick={() =>
                    setLastSavedAt(new Date().toLocaleTimeString("zh-CN"))
                  }
                  type="submit"
                >
                  保存草稿
                </button>
                <button className={styles.publishButton} type="submit">
                  发布
                </button>
              </div>
            </form>
          </aside>
        )}
      </div>
    </div>
  );
}
