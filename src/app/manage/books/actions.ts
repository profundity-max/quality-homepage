"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDatabase } from "@/db/database";
import { createBookService } from "@/modules/book-service";
import { createDiskFileStorage } from "@/modules/file-storage";
import { resolveDataDirectory } from "@/modules/file-storage/configuration";
import { createImageService } from "@/modules/image-service";

import { requirePortalSession } from "../../authorization";

const booksPath = "/manage/books";

async function runBookAction(
  successMessage: string,
  operation: (requestingUserId: string) => Promise<unknown>,
) {
  const session = await requirePortalSession(booksPath);
  let errorMessage: string | null = null;
  try {
    await operation(session.member.id);
  } catch (error) {
    errorMessage =
      error instanceof Error && error.message ? error.message : "操作失败。";
  }
  revalidatePath(booksPath);
  redirect(
    `${booksPath}?${errorMessage ? "error" : "notice"}=${encodeURIComponent(errorMessage ?? successMessage)}`,
  );
}

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function readFile(formData: FormData, name: string): File | null {
  const value = formData.get(name);
  return value instanceof File && value.size > 0 ? value : null;
}

function readTags(formData: FormData): string[] {
  return readString(formData, "tags")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

async function uploadCoverIfPresent(
  requestingUserId: string,
  file: File | null,
): Promise<{ coverImageId?: string; coverExtension?: string }> {
  if (!file) return {};
  const buffer = Buffer.from(await file.arrayBuffer());
  const uploaded = await createImageService(
    getDatabase(),
    createDiskFileStorage(resolveDataDirectory()),
  ).uploadImage(requestingUserId, buffer, file.name);
  const coverExtension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return { coverImageId: uploaded.id, coverExtension };
}

export async function createCategoryAction(formData: FormData): Promise<void> {
  const name = readString(formData, "name");
  await runBookAction("分类已创建。", (requestingUserId) =>
    createBookService(getDatabase()).createBookCategory(requestingUserId, {
      name,
    }),
  );
}

export async function renameCategoryAction(formData: FormData): Promise<void> {
  const stableId = readString(formData, "stableId");
  const name = readString(formData, "name");
  await runBookAction("分类已改名。", (requestingUserId) =>
    createBookService(getDatabase()).renameBookCategory(
      requestingUserId,
      stableId,
      name,
    ),
  );
}

export async function moveCategoryAction(formData: FormData): Promise<void> {
  const stableId = readString(formData, "stableId");
  const direction = readString(formData, "direction");
  await runBookAction("分类顺序已调整。", (requestingUserId) =>
    createBookService(getDatabase()).moveBookCategory(
      requestingUserId,
      stableId,
      direction === "up" ? "up" : "down",
    ),
  );
}

export async function createBookAction(formData: FormData): Promise<void> {
  const file = readFile(formData, "cover");
  await runBookAction("书目已创建。", async (requestingUserId) => {
    const cover = await uploadCoverIfPresent(requestingUserId, file);
    return createBookService(getDatabase()).createBook(requestingUserId, {
      title: readString(formData, "title"),
      author: readString(formData, "author"),
      recommendation: readString(formData, "recommendation"),
      audience: readString(formData, "audience"),
      categoryId: readString(formData, "categoryId"),
      tags: readTags(formData),
      ...cover,
    });
  });
}

export async function updateBookAction(formData: FormData): Promise<void> {
  const stableId = readString(formData, "stableId");
  const file = readFile(formData, "cover");
  await runBookAction("书目已更新。", async (requestingUserId) => {
    const cover = await uploadCoverIfPresent(requestingUserId, file);
    return createBookService(getDatabase()).updateBook(
      requestingUserId,
      stableId,
      {
        title: readString(formData, "title"),
        author: readString(formData, "author"),
        recommendation: readString(formData, "recommendation"),
        audience: readString(formData, "audience"),
        categoryId: readString(formData, "categoryId"),
        tags: readTags(formData),
        ...cover,
      },
    );
  });
}
