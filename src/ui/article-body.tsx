import { MermaidRenderer } from "@/app/mermaid-renderer";

import styles from "./article-body.module.css";

/**
 * 知识文章正文（Markdown → 安全 HTML + Mermaid）。
 * 阅读页与主题页内联阅读共用同一个渲染与排版，避免两处正文样式漂移。
 */
export function ArticleBody({ html }: { html: string }) {
  return (
    <div className={styles.body}>
      <MermaidRenderer html={html} />
    </div>
  );
}
