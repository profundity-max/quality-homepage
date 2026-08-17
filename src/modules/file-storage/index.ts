import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

// EDIT-05：图片由网站保存；只允许安全图片扩展名，
// 不允许引用员工电脑本地路径（上传即复制进受控目录）。
const ALLOWED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);

export type SavedFile = {
  id: string;
  url: string;
};

export type FileStorage = {
  save(buffer: Buffer, extension: string): Promise<SavedFile>;
  read(id: string, extension: string): Promise<Buffer | null>;
};

/**
 * 磁盘文件存储（ADR-0004：存储 seam 的生产实现）。
 * 文件写入受控目录（`<root>/<id>.<ext>`），URL 为 `/uploads/<id>.<ext>`，
 * 由图片访问路由按白名单扩展名读取。
 */
export function createDiskFileStorage(rootDirectory: string): FileStorage {
  const normalizedRoot = resolve(rootDirectory);

  function validateExtension(extension: string): void {
    const ext = extension.toLowerCase().replace(/^\./, "");
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new Error(`不允许的扩展名：${extension}`);
    }
  }

  function assertIdSafe(id: string): void {
    if (!/^[0-9a-f-]{36}$/.test(id)) {
      throw new Error("无效的文件标识。");
    }
  }

  return {
    async save(buffer, extension) {
      validateExtension(extension);
      const id = randomUUID();
      const ext = extension.toLowerCase().replace(/^\./, "");
      await mkdir(normalizedRoot, { recursive: true });
      await writeFile(join(normalizedRoot, `${id}.${ext}`), buffer);
      return { id, url: `/uploads/${id}.${ext}` };
    },

    async read(id, extension) {
      assertIdSafe(id);
      validateExtension(extension);
      const ext = extension.toLowerCase().replace(/^\./, "");
      try {
        return await readFile(join(normalizedRoot, `${id}.${ext}`));
      } catch {
        return null;
      }
    },
  };
}
