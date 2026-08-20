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
import {
  articleVersions,
  articles,
  articleAliases,
  bookCategories,
  books,
  templateCategories,
  templateVersions,
  templates,
  users,
} from "../src/db/schema";
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

  // 编辑者账号：无需首次改密，供版本历史等编辑者专属入口测试
  const { productionPasswordHasher } = await import(
    "../src/modules/shared/password-hasher"
  );
  await client.insert(users).values({
    id: "00000000-0000-4000-8000-0000000000f2",
    username: "editor",
    normalizedUsername: "editor",
    displayName: "品质编辑",
    passwordHash: await productionPasswordHasher.hash("editor secure password"),
    role: "editor",
    mustChangePassword: false,
    createdAt: new Date(),
  });
  // 栏目管理员账号：无需首次改密，供栏目/主题管理测试（不污染 bootstrap 改密流程）
  await client.insert(users).values({
    id: "00000000-0000-4000-8000-0000000000f3",
    username: "columnadmin",
    normalizedUsername: "columnadmin",
    displayName: "栏目管理员",
    passwordHash: await productionPasswordHasher.hash(
      "column admin secure password",
    ),
    role: "administrator",
    mustChangePassword: false,
    createdAt: new Date(),
  });
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
    "00000000-0000-4000-8000-0000000000d3",
    "anova-example",
    "ANOVA 实例",
    "一个完整的方差分析计算例子。",
    [
      "## 实例数据",
      "",
      "三组样本的均值比较。",
      "",
      "| 组别 | 样本量 | 均值 | 标准差 |",
      "| ---- | ------ | ---- | ------ |",
      "| A    | 10     | 12.4 | 1.8    |",
      "| B    | 10     | 14.1 | 2.0    |",
      "| C    | 10     | 11.9 | 1.6    |",
      "",
      "## 计算步骤",
      "",
      "总平方和分解公式：",
      "",
      "$$SS_{total} = SS_{between} + SS_{within}$$",
      "",
      "组间平方和：",
      "",
      "$$SS_{between} = \\sum n_i (\\bar{x}_i - \\bar{x})^2$$",
      "",
      "## 代码实现",
      "",
      "```ts",
      "function betweenGroupsSsq(groups: number[][]) {",
      "  const all = groups.flat();",
      "  const grandMean = all.reduce((a, b) => a + b, 0) / all.length;",
      "  return groups.reduce((total, group) => {",
      "    const mean = group.reduce((a, b) => a + b, 0) / group.length;",
      "    return total + group.length * (mean - grandMean) ** 2;",
      "  }, 0);",
      "}",
      "```",
      "",
      "> [!tip] 提示",
      "> 与入门篇配合阅读：[ANOVA 入门](/articles/anova-intro)。",
    ].join("\n"),
    anovaTopicId,
    1,
  );
  await published(
    "00000000-0000-4000-8000-0000000000d2",
    "spc-basics",
    "SPC 基础",
    "统计过程控制的基本思想与工具。",
    "## 控制图\n\n控制图是 SPC 的核心工具。\n\n```mermaid\nflowchart LR\n  A[测量] --> B{稳定?}\n  B -- 是 --> C[受控]\n  B -- 否 --> D[分析特殊原因]\n```",
    spcTopicId,
    5,
  );
  // 编辑类 e2e 专用已发布文章：编辑/发布链路测试只改这篇文章，
  // 保持 anova-intro 等阅读/搜索/回收站 fixture 全程纯净（编辑会将其转草稿）。
  await published(
    "00000000-0000-4000-8000-0000000000d5",
    "edit-fixture",
    "编辑测试样例",
    "编辑测试用的已发布文章。",
    "## 编辑测试正文\n\n编辑测试正文段落。\n\n> [!important] 前提\n> 编辑测试的调用块前提。",
    anovaTopicId,
    4,
  );
  // SEARCH-04：别名主题下的一篇已发布文章，让 σ / Sigma / 标准差 可命中主题
  const sigmaTopicId = "00000000-0000-4000-8000-000000000c01";
  await published(
    "00000000-0000-4000-8000-0000000000d4",
    "sigma-basics",
    "标准差与正态分布",
    "σ、Sigma 与分布的关系",
    "## σ 的意义\n\n标准差衡量数据的离散程度。",
    sigmaTopicId,
    2,
  );
  await client.insert(articleAliases).values({
    id: "00000000-0000-4000-8000-000000000e01",
    articleId: "00000000-0000-4000-8000-0000000000d1",
    alias: "方差分析入门",
  });

  // GOV-02：让 anova-intro 复核到期（next_review_at 在过去）
  await client
    .update(articles)
    .set({ nextReviewAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000) })
    .where(eq(articles.stableId, "anova-intro"));

  // 版本历史（VER-03）：anova-intro 有一条发布版本记录
  const anovaArticle = (
    await client
      .select({ id: articles.id })
      .from(articles)
      .where(eq(articles.stableId, "anova-intro"))
  )[0];
  if (anovaArticle) {
    await client.insert(articleVersions).values({
      id: "00000000-0000-4000-8000-000000000e02",
      articleId: anovaArticle.id,
      version: 1,
      kind: "publish",
      title: "ANOVA 入门",
      summary: "方差分析的基础概念与适用场景。",
      bodyMarkdown: "## 什么是 ANOVA\n\n方差分析用于比较多个组的均值差异。",
      primaryTopicId: anovaTopicId,
      tags: ["统计"],
      contentOwnerId: admin.id,
      createdBy: admin.id,
      createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
    });
  }

  // 编辑 fixture 也带一条版本记录，供发布闭环的版本历史/恢复终点使用（VER-03）
  const fixtureArticle = (
    await client
      .select({ id: articles.id })
      .from(articles)
      .where(eq(articles.stableId, "edit-fixture"))
  )[0];
  if (fixtureArticle) {
    await client.insert(articleVersions).values({
      id: "00000000-0000-4000-8000-000000000e03",
      articleId: fixtureArticle.id,
      version: 1,
      kind: "publish",
      title: "编辑测试样例",
      summary: "编辑测试用的已发布文章。",
      bodyMarkdown:
        "## 编辑测试正文\n\n编辑测试正文段落。\n\n> [!important] 前提\n> 编辑测试的调用块前提。",
      primaryTopicId: anovaTopicId,
      tags: ["统计"],
      contentOwnerId: admin.id,
      createdBy: admin.id,
      createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
    });
  }

  // 模板中心（TPL）：一个已发布模板 + 有效版本
  await client.insert(templateCategories).values({
    id: "00000000-0000-4000-8000-0000000000c1",
    stableId: "demo-cat",
    name: "演示分类",
    sortOrder: 0,
    createdAt: new Date(),
  });
  await client.insert(templates).values({
    id: "00000000-0000-4000-8000-0000000000c2",
    stableId: "demo-template",
    name: "演示检验记录表",
    purpose: "来料检验记录",
    usageScenario: "IQC 场景",
    categoryId: "00000000-0000-4000-8000-0000000000c1",
    contentOwnerId: admin.id,
    status: "published",
    nextReviewAt: new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000),
    updatedAt: now,
    createdAt: now,
  });
  await client.insert(templateVersions).values({
    id: "00000000-0000-4000-8000-0000000000d1",
    templateId: "00000000-0000-4000-8000-0000000000c2",
    version: 1,
    versionLabel: "1.0",
    changeNote: "初版",
    fileName: "record.xlsx",
    extension: "xlsx",
    byteSize: 2048,
    sha256: "0".repeat(64),
    software: "Excel",
    status: "active",
    quarantineState: "passed",
    uploadedBy: admin.id,
    createdAt: now,
  });

  // 推荐书单（BOOK）：一本演示书
  await client.insert(bookCategories).values({
    id: "00000000-0000-4000-8000-0000000000e1",
    stableId: "demo-book-cat",
    name: "演示书分类",
    sortOrder: 0,
    createdAt: new Date(),
  });
  await client.insert(books).values({
    id: "00000000-0000-4000-8000-0000000000e2",
    stableId: "demo-book",
    title: "演示：品质管理基础",
    author: "示例作者",
    recommendation: "品质入门推荐阅读。",
    audience: "新入职品质工程师",
    categoryId: "00000000-0000-4000-8000-0000000000e1",
    tags: ["入门"],
    recommendedBy: admin.id,
    updatedAt: now,
    createdAt: now,
  });

  // 已归档演示文章（VER-04 归档说明页）
  await client.insert(articles).values({
    id: "00000000-0000-4000-8000-0000000000d6",
    stableId: "archived-sample",
    title: "旧版入门手册",
    summary: "已被新版替代的入门材料。",
    bodyMarkdown: "不应展示的正文",
    primaryTopicId: anovaTopicId,
    tags: ["旧版"],
    contentOwnerId: admin.id,
    status: "archived",
    publishedAt: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
    createdAt: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
  });
} finally {
  await database.close();
}
