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
  /**
   * 保存文件到受控目录。allowedExtensions 为 null 时不限制扩展名
   * （模板文件 TPL-05 任意扩展名）；默认仅图片（EDIT-05）。
   */
  save(
    buffer: Buffer,
    extension: string,
    allowedExtensions?: Set<string> | null,
  ): Promise<SavedFile>;
  read(
    id: string,
    extension: string,
    allowedExtensions?: Set<string> | null,
  ): Promise<Buffer | null>;
};

/**
 * 磁盘文件存储（ADR-0004：存储 seam 的生产实现）。
 * 文件写入受控目录（`<root>/<id>.<ext>`），URL 为 `/uploads/<id>.<ext>`，
 * 由图片访问路由按白名单扩展名读取。
 */
export function createDiskFileStorage(rootDirectory: string): FileStorage {
  const normalizedRoot = resolve(rootDirectory);

  function validateExtension(
    extension: string,
    allowedExtensions: Set<string> | null,
  ): void {
    if (allowedExtensions === null) return; // 模板文件不限制扩展名
    const ext = extension.toLowerCase().replace(/^\./, "");
    if (!allowedExtensions.has(ext)) {
      throw new Error(`不允许的扩展名：${extension}`);
    }
  }

  function assertIdSafe(id: string): void {
    if (!/^[0-9a-f-]{36}$/.test(id)) {
      throw new Error("无效的文件标识。");
    }
  }

  return {
    async save(buffer, extension, allowedExtensions = ALLOWED_EXTENSIONS) {
      validateExtension(extension, allowedExtensions);
      const id = randomUUID();
      const ext = extension.toLowerCase().replace(/^\./, "");
      await mkdir(normalizedRoot, { recursive: true });
      await writeFile(join(normalizedRoot, `${id}.${ext}`), buffer);
      return { id, url: `/uploads/${id}.${ext}` };
    },

    async read(id, extension, allowedExtensions = ALLOWED_EXTENSIONS) {
      assertIdSafe(id);
      validateExtension(extension, allowedExtensions);
      const ext = extension.toLowerCase().replace(/^\./, "");
      try {
        return await readFile(join(normalizedRoot, `${id}.${ext}`));
      } catch {
        return null;
      }
    },
  };
}
