import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { migrate } from "@/db/migrate";
import { createDatabaseClient } from "@/db/client";
import { articles, users } from "@/db/schema";
import { createFavoritesService } from "@/modules/favorites";

const READER_ID = "00000000-0000-4000-8000-0000000000f1";
const OTHER_READER_ID = "00000000-0000-4000-8000-0000000000f2";
const PUBLISHED_ARTICLE_ID = "00000000-0000-4000-8000-0000000000d1";
const DRAFT_ARTICLE_ID = "00000000-0000-4000-8000-0000000000d2";

describe("favorites service", () => {
  let database: PGlite;

  beforeEach(async () => {
    database = new PGlite();
    await migrate(database);
    const client = createDatabaseClient(database);
    await client.insert(users).values([
      {
        id: READER_ID,
        username: "reader",
        normalizedUsername: "reader",
        passwordHash: "hash",
        role: "reader",
        createdAt: new Date(),
      },
      {
        id: OTHER_READER_ID,
        username: "other",
        normalizedUsername: "other",
        passwordHash: "hash",
        role: "reader",
        createdAt: new Date(),
      },
    ]);
    const now = new Date();
    const nextReviewAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    await client.insert(articles).values([
      {
        id: PUBLISHED_ARTICLE_ID,
        stableId: "anova-intro",
        title: "ANOVA 入门",
        summary: "方差分析基础",
        bodyMarkdown: "正文",
        primaryTopicId: "00000000-0000-4000-8000-000000000c04",
        tags: ["统计"],
        contentOwnerId: READER_ID,
        status: "published",
        nextReviewAt,
        updatedAt: now,
        createdAt: now,
      },
      {
        id: DRAFT_ARTICLE_ID,
        stableId: "draft-article",
        title: "草稿",
        summary: "草稿",
        bodyMarkdown: "草稿正文",
        primaryTopicId: "00000000-0000-4000-8000-000000000c04",
        tags: [],
        contentOwnerId: READER_ID,
        status: "draft",
        updatedAt: now,
        createdAt: now,
      },
    ]);
  });

  afterEach(async () => {
    await database.close();
  });

  function service() {
    return createFavoritesService(database);
  }

  test("toggles a favorite on and off for the current user (FAV-01)", async () => {
    const result = await service().toggleFavorite(
      READER_ID,
      PUBLISHED_ARTICLE_ID,
    );
    expect(result.favorite).toBe(true);
    expect(await service().isFavorite(READER_ID, PUBLISHED_ARTICLE_ID)).toBe(
      true,
    );

    const favorites = await service().listFavorites(READER_ID);
    expect(favorites.map((favorite) => favorite.stableId)).toEqual([
      "anova-intro",
    ]);

    const toggled = await service().toggleFavorite(
      READER_ID,
      PUBLISHED_ARTICLE_ID,
    );
    expect(toggled.favorite).toBe(false);
    expect(await service().isFavorite(READER_ID, PUBLISHED_ARTICLE_ID)).toBe(
      false,
    );
    expect(await service().listFavorites(READER_ID)).toEqual([]);
  });

  test("favorites are only visible to the owner (FAV-01)", async () => {
    await service().toggleFavorite(READER_ID, PUBLISHED_ARTICLE_ID);
    expect(await service().listFavorites(OTHER_READER_ID)).toEqual([]);
    expect(
      await service().isFavorite(OTHER_READER_ID, PUBLISHED_ARTICLE_ID),
    ).toBe(false);
  });

  test("refuses to favorite a non-published article (FAV-01)", async () => {
    await expect(
      service().toggleFavorite(READER_ID, DRAFT_ARTICLE_ID),
    ).rejects.toThrow(/not available|已发布/i);
    await expect(
      service().toggleFavorite(
        READER_ID,
        "00000000-0000-4000-8000-0000000000ff",
      ),
    ).rejects.toThrow(/not available|不存在/i);
  });

  test("lists favorites newest first with reading metadata", async () => {
    const client = createDatabaseClient(database);
    const now = new Date();
    await client.insert(articles).values({
      id: "00000000-0000-4000-8000-0000000000d3",
      stableId: "spc-basics",
      title: "SPC 基础",
      summary: "统计过程控制",
      bodyMarkdown: "正文",
      primaryTopicId: "00000000-0000-4000-8000-000000000c12",
      tags: ["统计"],
      contentOwnerId: READER_ID,
      status: "published",
      nextReviewAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      updatedAt: now,
      createdAt: now,
    });
    await service().toggleFavorite(READER_ID, PUBLISHED_ARTICLE_ID);
    await service().toggleFavorite(
      READER_ID,
      "00000000-0000-4000-8000-0000000000d3",
    );

    const favorites = await service().listFavorites(READER_ID);
    expect(favorites.map((favorite) => favorite.stableId)).toEqual([
      "spc-basics",
      "anova-intro",
    ]);
    expect(favorites[0]).toMatchObject({
      title: "SPC 基础",
      topicName: "SPC",
      sectionName: "过程控制",
    });
  });
});
