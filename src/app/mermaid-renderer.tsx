"use client";

import { useEffect, useRef, useState } from "react";

import mermaid from "mermaid";

// Mermaid 安全模式（验收 §6「Mermaid 以安全模式运行」）：
// - securityLevel strict：禁 HTML 标签注入、禁外部协议
// - 不启用 click/flowchart 交互（禁止点击事件注入）
let initialized = false;

function ensureMermaidInitialized() {
  if (initialized) return;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "neutral",
    flowchart: { htmlLabels: false },
  });
  initialized = true;
}

/**
 * 渲染 Markdown 结果中的 Mermaid 代码块。
 * html 只在挂载时渲染一次；随后扫描容器内 `pre > code.language-mermaid`，
 * 将每个 pre 元素原地替换为 mermaid.render 生成的 SVG。
 * 注意：父级不要用 dangerouslySetInnerHTML 重建本组件内容。
 */
export function MermaidRenderer({ html }: { html: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [initialHtml] = useState(html);

  useEffect(() => {
    ensureMermaidInitialized();
    const container = containerRef.current;
    if (!container) return;

    const blocks = Array.from(
      container.querySelectorAll<HTMLElement>("pre > code.language-mermaid"),
    );
    if (blocks.length === 0) return;

    let cancelled = false;
    void (async () => {
      for (const block of blocks) {
        const source = block.textContent ?? "";
        const pre = block.closest("pre");
        if (!pre || cancelled) return;
        try {
          const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`;
          const { svg } = await mermaid.render(id, source);
          const wrapper = document.createElement("div");
          wrapper.innerHTML = svg;
          const svgElement = wrapper.querySelector("svg");
          if (svgElement) {
            svgElement.setAttribute("role", "img");
            pre.replaceWith(svgElement);
          }
        } catch {
          // 语法错误保留原代码块
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // 仅在挂载时执行一次（html 变化由父级重建整个组件）
  }, []);

  return (
    <div ref={containerRef} dangerouslySetInnerHTML={{ __html: initialHtml }} />
  );
}
