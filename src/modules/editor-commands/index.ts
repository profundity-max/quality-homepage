export type FormatCommand =
  | "bold"
  | "italic"
  | "h2"
  | "h3"
  | "ordered-list"
  | "unordered-list"
  | "quote"
  | "code"
  | "table"
  | "link"
  | "image"
  | "callout-info"
  | "callout-tip"
  | "callout-important"
  | "callout-warning"
  | "callout-example"
  | "callout-formula";

export type SelectionRange = { start: number; end: number };

export type FormatResult = {
  text: string;
  selectionStart: number;
  selectionEnd: number;
};

const inlineWrap: Record<string, { before: string; after: string }> = {
  bold: { before: "**", after: "**" },
  italic: { before: "*", after: "*" },
  code: { before: "`", after: "`" },
};

const linePrefix: Record<string, string> = {
  h2: "## ",
  h3: "### ",
  "ordered-list": "1. ",
  "unordered-list": "- ",
  quote: "> ",
};

const calloutPrefix: Record<string, string> = {
  "callout-info": "> [!info] ",
  "callout-tip": "> [!tip] ",
  "callout-important": "> [!important] ",
  "callout-warning": "> [!warning] ",
  "callout-example": "> [!example] ",
  "callout-formula": "> [!formula] ",
};

export function applyFormatting(
  source: string,
  selection: SelectionRange,
  command: FormatCommand,
): FormatResult {
  const start = Math.max(0, selection.start);
  const end = Math.min(source.length, selection.end);

  if (command in inlineWrap) {
    const { before, after } = inlineWrap[command]!;
    return wrapInline(source, start, end, before, after);
  }

  if (command in linePrefix) {
    return applyLinePrefix(source, start, end, linePrefix[command]!);
  }

  if (command in calloutPrefix) {
    return applyCallout(source, start, end, calloutPrefix[command]!);
  }

  switch (command) {
    case "table":
      return insertTable(source, start, end);
    case "link":
      return wrapInline(source, start, end, `[`, `](https://)`);
    case "image": {
      const selected = source.slice(start, end) || "图片说明";
      const text =
        source.slice(0, start) +
        `![${selected}](/uploads/)` +
        source.slice(end);
      return {
        text,
        selectionStart: start,
        selectionEnd: start + selected.length + 9,
      };
    }
    default:
      return { text: source, selectionStart: start, selectionEnd: end };
  }
}

function wrapInline(
  source: string,
  start: number,
  end: number,
  before: string,
  after: string,
): FormatResult {
  const selected = source.slice(start, end);
  // 选中内容已被包裹 → 去除包裹（toggle）
  const wrapped =
    selected.startsWith(before) &&
    selected.endsWith(after) &&
    selected.length >= before.length + after.length;
  // 选中内容前后紧邻包裹符（如光标在 **粗体** 内部）→ 也去除
  const neighborsWrapped =
    !wrapped &&
    source.slice(Math.max(0, start - before.length), start) === before &&
    source.slice(end, end + after.length) === after;
  if (process.env.EC_DEBUG) {
    console.log(
      "DEBUG wrapped:",
      wrapped,
      "neighbors:",
      neighborsWrapped,
      "left:",
      JSON.stringify(source.slice(Math.max(0, start - before.length), start)),
      "right:",
      JSON.stringify(source.slice(end, end + after.length)),
    );
  }
  if (wrapped || neighborsWrapped) {
    const inner = wrapped
      ? selected.slice(before.length, selected.length - after.length)
      : selected;
    // neighbors 场景：选中内容前后紧邻包裹符，需连同包裹符一起移除
    const leftTrim = neighborsWrapped ? before.length : 0;
    const rightTrim = neighborsWrapped ? after.length : 0;
    const text =
      source.slice(0, start - leftTrim) + inner + source.slice(end + rightTrim);
    return {
      text,
      selectionStart: start - leftTrim,
      selectionEnd: start - leftTrim + inner.length,
    };
  }
  const text =
    source.slice(0, start) + before + selected + after + source.slice(end);
  // 包裹后选中整个含标记区间
  return {
    text,
    selectionStart: start,
    selectionEnd: start + selected.length + before.length + after.length,
  };
}

function applyLinePrefix(
  source: string,
  start: number,
  end: number,
  prefix: string,
): FormatResult {
  const lineStart = source.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = source.indexOf("\n", end);
  const lineEndIndex = lineEnd === -1 ? source.length : lineEnd;
  const line = source.slice(lineStart, lineEndIndex);

  if (line.startsWith(prefix)) {
    // 已是目标格式 → 去掉前缀
    const text =
      source.slice(0, lineStart) +
      line.slice(prefix.length) +
      source.slice(lineEndIndex);
    return { text, selectionStart: start, selectionEnd: end };
  }
  const text =
    source.slice(0, lineStart) + prefix + line + source.slice(lineEndIndex);
  return {
    text,
    selectionStart: start + prefix.length,
    selectionEnd: end + prefix.length,
  };
}

function applyCallout(
  source: string,
  start: number,
  end: number,
  prefix: string,
): FormatResult {
  const lineStart = source.lastIndexOf("\n", start - 1) + 1;
  const selected = source.slice(start, end) || "说明文字";
  const text =
    source.slice(0, lineStart) + prefix + selected + source.slice(end);
  return {
    text,
    selectionStart: lineStart + prefix.length,
    selectionEnd: lineStart + prefix.length + selected.length,
  };
}

function insertTable(source: string, start: number, end: number): FormatResult {
  const table = "| 列1 | 列2 |\n| --- | --- |\n| 值1 | 值2 |";
  const text = source.slice(0, start) + table + source.slice(end);
  return { text, selectionStart: start, selectionEnd: start + table.length };
}
