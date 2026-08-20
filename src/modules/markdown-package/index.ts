import { inflateRawSync } from "node:zlib";

// Markdown 导入导出包（PORT-06/07/08）：YAML frontmatter 子集解析/序列化，
// 以及 store-only ZIP 打包/解包（不引入运行时依赖）。

export type FrontmatterFields = {
  title?: string;
  summary?: string;
  topic?: string;
  tags?: string[];
  aliases?: string[];
  owner?: string;
  status?: string;
  reviewed_at?: string;
  next_review_at?: string;
};

export function parseFrontmatter(markdown: string): {
  frontmatter: FrontmatterFields;
  body: string;
} {
  const normalized = markdown.replace(/^\uFEFF/, "");
  if (!normalized.startsWith("---")) {
    return { frontmatter: {}, body: normalized };
  }
  const end = normalized.indexOf("\n---", 3);
  if (end < 0) {
    return { frontmatter: {}, body: normalized };
  }
  const rawBlock = normalized.slice(3, end).trim();
  const body = normalized
    .slice(end + 4)
    .replace(/^\n+/, "")
    .replace(/\n+$/, "");
  const frontmatter: FrontmatterFields = {};
  let currentKey: keyof FrontmatterFields | null = null;

  for (const line of rawBlock.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ")) {
      if (currentKey === "tags" || currentKey === "aliases") {
        (frontmatter[currentKey] as string[]).push(
          stripQuotes(trimmed.slice(2)),
        );
      }
      continue;
    }
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    currentKey = null;
    if (!isKnownKey(key)) continue;
    if (value === "") {
      if (key === "tags" || key === "aliases") {
        frontmatter[key] = [];
        currentKey = key;
      }
      continue;
    }
    if (key === "tags" || key === "aliases") {
      frontmatter[key] = value
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((item) => stripQuotes(item.trim()))
        .filter(Boolean);
    } else {
      (frontmatter as Record<string, string>)[key] = stripQuotes(value);
    }
  }
  return { frontmatter, body };
}

function isKnownKey(key: string): key is keyof FrontmatterFields {
  return [
    "title",
    "summary",
    "topic",
    "tags",
    "aliases",
    "owner",
    "status",
    "reviewed_at",
    "next_review_at",
  ].includes(key);
}

function stripQuotes(value: string): string {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function serializeFrontmatter(
  fields: FrontmatterFields,
  body: string,
): string {
  const lines: string[] = ["---"];
  const scalars: Array<[string, string | undefined]> = [
    ["title", fields.title],
    ["summary", fields.summary],
    ["topic", fields.topic],
    ["owner", fields.owner],
    ["status", fields.status],
    ["reviewed_at", fields.reviewed_at],
    ["next_review_at", fields.next_review_at],
  ];
  for (const [key, value] of scalars) {
    if (value !== undefined && value !== "") {
      lines.push(`${key}: ${quoteIfNeeded(value)}`);
    }
  }
  for (const key of ["tags", "aliases"] as const) {
    const values = fields[key];
    if (values && values.length > 0) {
      lines.push(`${key}:`);
      for (const value of values) lines.push(`  - ${quoteIfNeeded(value)}`);
    }
  }
  lines.push("---", "", body.replace(/^\n+/, ""));
  return lines.join("\n");
}

function quoteIfNeeded(value: string): string {
  return /[:#\n]/.test(value) ? JSON.stringify(value) : value;
}

// ---------- ZIP（store-only 写入；读取支持 stored + deflate） ----------

const localFileHeaderSignature = 0x04034b50;
const centralDirectorySignature = 0x02014b50;
const endOfCentralDirectorySignature = 0x06054b50;

export type ZipEntry = { path: string; content: Buffer };

export function zipFiles(files: ZipEntry[]): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.path, "utf8");
    const crc = crc32(file.content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(localFileHeaderSignature, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 flag
    local.writeUInt16LE(0, 8); // method: store
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(0x21, 12); // date (1980-01-01)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(file.content.length, 18);
    local.writeUInt32LE(file.content.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, name, file.content);

    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(centralDirectorySignature, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x0800, 8);
    directory.writeUInt16LE(0, 10);
    directory.writeUInt16LE(0, 12);
    directory.writeUInt16LE(0x21, 14);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(file.content.length, 20);
    directory.writeUInt32LE(file.content.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt16LE(0, 30);
    directory.writeUInt16LE(0, 32);
    directory.writeUInt16LE(0, 34);
    directory.writeUInt16LE(0, 36);
    directory.writeUInt32LE(0, 38);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, name);

    offset += 30 + name.length + file.content.length;
  }

  const centralStart = offset;
  const centralBuffer = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(endOfCentralDirectorySignature, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(centralStart, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...chunks, centralBuffer, eocd]);
}

export function unzip(buffer: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  let cursor = buffer.length - 22;
  while (cursor >= 0) {
    if (buffer.readUInt32LE(cursor) === endOfCentralDirectorySignature) break;
    cursor -= 1;
  }
  if (cursor < 0) throw new Error("Not a ZIP archive.");
  const centralOffset = buffer.readUInt32LE(cursor + 16);
  const entryCount = buffer.readUInt16LE(cursor + 10);

  let position = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(position) !== centralDirectorySignature) {
      throw new Error("Corrupt ZIP central directory.");
    }
    const method = buffer.readUInt16LE(position + 10);
    const crc = buffer.readUInt32LE(position + 16);
    const compressedSize = buffer.readUInt32LE(position + 20);
    const uncompressedSize = buffer.readUInt32LE(position + 24);
    const nameLength = buffer.readUInt16LE(position + 28);
    const extraLength = buffer.readUInt16LE(position + 30);
    const commentLength = buffer.readUInt16LE(position + 32);
    const localOffset = buffer.readUInt32LE(position + 42);
    const name = buffer
      .subarray(position + 46, position + 46 + nameLength)
      .toString("utf8");

    const localHeaderOffset = localOffset;
    const dataStart =
      localHeaderOffset + 30 + buffer.readUInt16LE(localHeaderOffset + 26);
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);
    const content = method === 0 ? Buffer.from(raw) : inflateRawSync(raw);
    if (crc32(content) !== crc) {
      throw new Error(`ZIP CRC mismatch for ${name}`);
    }
    if (content.length !== uncompressedSize) {
      throw new Error(`ZIP size mismatch for ${name}`);
    }
    if (!name.endsWith("/")) entries.set(name, content);
    position += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
