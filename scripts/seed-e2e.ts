import { PGlite } from "@electric-sql/pglite";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { migrate } from "../src/db/migrate";
import { createDatabaseClient } from "../src/db/client";
import {
  bootstrapFirstAdministrator,
  createIdentityModule,
} from "../src/modules/identity/index";
import { eq } from "drizzle-orm";
import { articles, articleAliases, users } from "../src/db/schema";
import { resolveE2EDataDirectory } from "./e2e-seed-guard";

const dataDirectory = resolveE2EDataDirectory(process.env);

await rm(resolve(dataDirectory), { recursive: true, force: true });
await mkdir(resolve(dataDirectory), { recursive: true });
const database = new PGlite(resolve(dataDirectory, "pgdata"));
try {
  await migrate(database);
  await bootstrapFirstAdministrator({
    database,
    username: "admin",
    displayName: "品质管理员",
    password: "correct horse battery staple",
  });
  const identity = createIdentityModule({
    database,
    allowEndToEndTestControl: true,
  });
  await identity.createMemberForEndToEndTest({
    username: "member",
    displayName: "品质成员",
    password: "member secure password",
  });

  const client = createDatabaseClient(database);
  const admin = (
    await client
      .select({ id: users.id })
      .from(users)
      .where(eq(users.normalizedUsername, "admin"))
  )[0];
  const anovaTopicId = "00000000-0000-4000-8000-000000000c04";
  const spcTopicId = "00000000-0000-4000-8000-000000000c12";
  const now = new Date();
  const nextReview = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
  const published = (
    id: string,
    stableId: string,
    title: string,
    summary: string,
    body: string,
    topicId: string,
    daysAgo: number,
  ) =>
    client.insert(articles).values({
      id,
      stableId,
      title,
      summary,
      bodyMarkdown: body,
      primaryTopicId: topicId,
      tags: ["统计"],
      contentOwnerId: admin.id,
      status: "published",
      nextReviewAt: nextReview,
      publishedAt: new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000),
      updatedAt: new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000),
      createdAt: new Date(now.getTime() - (daysAgo + 7) * 24 * 60 * 60 * 1000),
    });

  await published(
    "00000000-0000-4000-8000-0000000000d1",
    "anova-intro",
    "ANOVA 入门",
    "方差分析的基础概念与适用场景。",
    "## 什么是 ANOVA\n\n方差分析用于比较多个组的均值差异。\n\n> [!important] 前提\n> 数据应近似正态且方差齐性。",
    anovaTopicId,
    3,
  );
  await published(
    "00000000-0000-4000-8000-0000000000d2",
    "spc-basics",
    "SPC 基础",
    "统计过程控制的基本思想与工具。",
    "## 控制图\n\n控制图是 SPC 的核心工具。",
    spcTopicId,
    5,
  );
  await client.insert(articleAliases).values({
    id: "00000000-0000-4000-8000-000000000e01",
    articleId: "00000000-0000-4000-8000-0000000000d1",
    alias: "方差分析入门",
  });
} finally {
  await database.close();
}
