import rehypeKatex from "rehype-katex";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { Schema } from "hast-util-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import type { Element, Root } from "hast";
import { visit } from "unist-util-visit";

const CALLOUT_TYPES = [
  "info",
  "tip",
  "important",
  "warning",
  "example",
  "formula",
] as const;
type CalloutType = (typeof CALLOUT_TYPES)[number];

export type TocEntry = {
  id: string;
  depth: number;
  text: string;
};

// rehype-sanitize 默认 schema 之外，公式（KaTeX 的 MathML 输出）与
// Callout 结构需要的元素与属性。仅放行白名单内的 class，不放行任何
// 事件属性或 javascript: 协议。
const katexSchema: Schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    span: [...(defaultSchema.attributes?.span ?? []), "className"],
    div: [...(defaultSchema.attributes?.div ?? []), "className"],
  },
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "math",
    "mrow",
    "mi",
    "mo",
    "mn",
    "msup",
    "msub",
    "mfrac",
    "msqrt",
    "mroot",
    "mtext",
    "mspace",
    "mtable",
    "mtr",
    "mtd",
    "mover",
    "munder",
    "munderover",
    "menclose",
    "semantics",
    "annotation",
    "mstyle",
    "mpadded",
    "mphantom",
    "merror",
    "mlabeledtr",
    "none",
  ],
};

function annotateCallouts() {
  return (tree: Root) => {
    visit(tree, "element", (node) => {
      if (node.tagName !== "blockquote") return;
      const firstParagraphIndex = node.children.findIndex(
        (child) => child.type === "element" && child.tagName === "p",
      );
      if (firstParagraphIndex === -1) return;
      const firstParagraph = node.children[firstParagraphIndex];
      if (firstParagraph.type !== "element") return;

      const firstText = firstParagraph.children.find(
        (child) => child.type === "text",
      );
      if (firstText?.type !== "text") return;

      // 块引用第一行形如 `[!info] 标题`；只吃同一行作为标题，
      // 换行之后的任何内容都是正文。
      const match =
        /^\[!(info|tip|important|warning|example|formula)\][ \t]*([^\n]*)(?:\n|$)/i.exec(
          firstText.value,
        );
      if (!match) return;

      const type = match[1].toLowerCase() as CalloutType;
      const title = match[2].trim();
      const remainder = firstText.value.slice(match[0].length);

      node.tagName = "div";
      node.properties = {
        ...node.properties,
        className: [`callout callout-${type}`],
      };

      const iconNode: Element = {
        type: "element",
        tagName: "span",
        properties: { className: ["callout-icon"], ariaHidden: "true" },
        children: [],
      };

      const titleNode: Element | undefined = title
        ? {
            type: "element",
            tagName: "div",
            properties: { className: ["callout-title"] },
            children: [{ type: "text", value: title }],
          }
        : undefined;

      // 第一个段落拆为正文载体；标记行若无剩余内容则整个移除。
      // 所有正文（剩余段落、列表、代码块等）统一放入正文容器，
      // 保持「图标、标题、正文」的一致结构（视觉规范 §9）。
      const bodyChildren: Element[] = [];
      if (remainder.trim() !== "") {
        firstText.value = remainder;
        bodyChildren.push(firstParagraph);
      }
      for (const sibling of node.children.slice(firstParagraphIndex + 1)) {
        if (sibling.type === "element") bodyChildren.push(sibling);
      }

      const bodyNode: Element = {
        type: "element",
        tagName: "div",
        properties: { className: ["callout-body"] },
        children: bodyChildren,
      };

      node.children = [iconNode, ...(titleNode ? [titleNode] : []), bodyNode];
    });
  };
}

function annotateHeadings() {
  return (tree: Root) => {
    let counter = 0;
    visit(tree, "element", (node) => {
      const match = /^h([2-6])$/.exec(node.tagName);
      if (!match) return;
      counter += 1;
      node.properties = { ...node.properties, id: `toc-${counter}` };
    });
  };
}

function collectHeadings() {
  return (tree: Root, file: { data?: Record<string, unknown> }) => {
    const entries: TocEntry[] = [];
    visit(tree, "element", (node) => {
      const match = /^h([2-6])$/.exec(node.tagName);
      if (!match) return;
      const text = node.children
        .filter((child) => child.type === "text" || child.type === "element")
        .map((child) =>
          child.type === "text" ? child.value : collectText(child),
        )
        .join("")
        .trim();
      if (!text) return;
      entries.push({
        id: node.properties?.id as string,
        depth: Number(match[1]),
        text,
      });
    });
    file.data = { ...file.data, tocEntries: entries };
  };
}

function collectText(node: Element): string {
  return node.children
    .map((child) =>
      child.type === "text"
        ? child.value
        : child.type === "element"
          ? collectText(child)
          : "",
    )
    .join("");
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeKatex)
  .use(rehypeSanitize, katexSchema)
  .use(annotateCallouts)
  .use(annotateHeadings)
  .use(collectHeadings)
  .use(rehypeStringify);

export async function renderMarkdown(markdown: string): Promise<string> {
  const result = await processor.process(markdown);
  return String(result);
}

export async function extractTableOfContents(
  markdown: string,
): Promise<TocEntry[]> {
  const file = await processor.process(markdown);
  return (file.data.tocEntries as TocEntry[] | undefined) ?? [];
}
