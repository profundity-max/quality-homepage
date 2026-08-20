"use client";

import { useState } from "react";

import styles from "./import-panel.module.css";

type Preview = {
  added: { fileName: string; title: string }[];
  conflicts: { fileName: string; title: string }[];
  invalid: { fileName: string; title: string }[];
};

export function ImportPanel({ isAdmin }: { isAdmin: boolean }) {
  const [markdown, setMarkdown] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [file, setFile] = useState<File | null>(null);

  async function importMarkdown() {
    if (!markdown.trim()) return;
    const form = new FormData();
    form.set(
      "file",
      new File([markdown], "paste.md", { type: "text/markdown" }),
    );
    const response = await fetch("/api/migration/import", {
      method: "POST",
      body: form,
    });
    const payload = await response.json();
    if (response.ok) {
      setStatus(`已导入 ${payload.imported.length} 篇草稿。`);
      setMarkdown("");
    } else {
      setStatus(payload.error ?? "导入失败。");
    }
  }

  async function importZip() {
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    const response = await fetch("/api/migration/import", {
      method: "POST",
      body: form,
    });
    const payload = await response.json();
    setStatus(
      response.ok
        ? `ZIP 已导入 ${payload.imported.length} 篇草稿。`
        : (payload.error ?? "导入失败。"),
    );
  }

  async function runPreview() {
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    const response = await fetch("/api/migration/preview", {
      method: "POST",
      body: form,
    });
    const payload = await response.json();
    if (response.ok) setPreview(payload.preview);
    else setStatus(payload.error ?? "预检失败。");
  }

  async function runBatch() {
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    const response = await fetch("/api/migration/batch", {
      method: "POST",
      body: form,
    });
    const payload = await response.json();
    if (response.ok) {
      setStatus(
        `批量导入完成：新增 ${payload.result.imported} 篇，跳过 ${payload.result.skipped} 篇。`,
      );
      setPreview(null);
    } else {
      setStatus(payload.error ?? "导入失败。");
    }
  }

  return (
    <div className={styles.panel}>
      {status ? (
        <p className={styles.status} role="status">
          {status}
        </p>
      ) : null}

      <section className={styles.card}>
        <h2>粘贴或导入单个 Markdown（PORT-01）</h2>
        <textarea
          aria-label="Markdown 内容"
          value={markdown}
          onChange={(event) => setMarkdown(event.target.value)}
          rows={10}
          placeholder={
            "---\ntitle: 文章标题\nsummary: 摘要\ntopic: 主题稳定标识\ntags:\n  - 标签\n---\n\n正文"
          }
        />
        <button type="button" onClick={importMarkdown}>
          导入为草稿
        </button>
      </section>

      <section className={styles.card}>
        <h2>导入 ZIP（含图片，PORT-02）</h2>
        <label>
          ZIP 文件
          <input
            type="file"
            accept=".zip"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <button type="button" onClick={importZip}>
          导入 ZIP
        </button>
      </section>

      {isAdmin ? (
        <section className={styles.card}>
          <h2>管理员批量导入预检（PORT-03/04）</h2>
          <label>
            标准 Markdown 包（ZIP）
            <input
              type="file"
              accept=".zip"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <button type="button" onClick={runPreview}>
            预检（不写入）
          </button>
          {preview ? (
            <div className={styles.preview}>
              <p>
                新增 {preview.added.length} · 冲突 {preview.conflicts.length} ·
                无效 {preview.invalid.length}
              </p>
              {preview.added.length > 0 ? (
                <ul aria-label="将新增">
                  {preview.added.map((item) => (
                    <li key={item.fileName}>{item.title}</li>
                  ))}
                </ul>
              ) : null}
              {preview.conflicts.length > 0 ? (
                <details>
                  <summary>冲突（需人工处理）</summary>
                  <ul>
                    {preview.conflicts.map((item) => (
                      <li key={item.fileName}>{item.title}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
              {preview.invalid.length > 0 ? (
                <details>
                  <summary>无效（缺标题或主题）</summary>
                  <ul>
                    {preview.invalid.map((item) => (
                      <li key={item.fileName}>{item.fileName}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
              <button type="button" onClick={runBatch}>
                确认导入新增项
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
