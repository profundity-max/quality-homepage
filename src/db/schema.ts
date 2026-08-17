import {
  boolean,
  char,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export type Role = "reader" | "editor" | "administrator";
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    username: text("username").notNull(),
    normalizedUsername: text("normalized_username").notNull(),
    displayName: text("display_name"),
    passwordHash: text("password_hash").notNull(),
    role: text("role").$type<Role>().notNull(),
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("users_normalized_username_idx").on(table.normalizedUsername),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    tokenDigest: char("token_digest", { length: 64 }).notNull(),
    persistent: boolean("persistent").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("sessions_token_digest_idx").on(table.tokenDigest),
    index("sessions_user_id_idx").on(table.userId),
  ],
);

export const identityAuditEvents = pgTable("identity_audit_events", {
  id: uuid("id").primaryKey(),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  subjectUserId: uuid("subject_user_id").references(() => users.id),
  eventType: text("event_type").notNull(),
  outcome: text("outcome").notNull(),
  metadata: jsonb("metadata").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
});

export type ArticleStatus = "draft" | "published" | "archived";

export const sections = pgTable(
  "sections",
  {
    id: uuid("id").primaryKey(),
    stableId: text("stable_id").notNull(),
    name: text("name").notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => sections.id),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("sections_stable_id_idx").on(table.stableId),
    index("sections_parent_id_idx").on(table.parentId),
  ],
);

export const topics = pgTable(
  "topics",
  {
    id: uuid("id").primaryKey(),
    stableId: text("stable_id").notNull(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("topics_stable_id_idx").on(table.stableId),
    index("topics_section_id_idx").on(table.sectionId),
  ],
);

export const topicAliases = pgTable(
  "topic_aliases",
  {
    id: uuid("id").primaryKey(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id),
    alias: text("alias").notNull(),
  },
  (table) => [
    uniqueIndex("topic_aliases_topic_id_alias_idx").on(
      table.topicId,
      table.alias,
    ),
  ],
);

export const articles = pgTable(
  "articles",
  {
    id: uuid("id").primaryKey(),
    stableId: text("stable_id").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    bodyMarkdown: text("body_markdown").notNull().default(""),
    primaryTopicId: uuid("primary_topic_id")
      .notNull()
      .references(() => topics.id),
    tags: text("tags").array().notNull().default([]),
    contentOwnerId: uuid("content_owner_id").references(() => users.id),
    status: text("status").$type<ArticleStatus>().notNull().default("draft"),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
    nextReviewAt: timestamp("next_review_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    editingBy: uuid("editing_by").references(() => users.id),
    editingAt: timestamp("editing_at", { withTimezone: true }),
    readCount: integer("read_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("articles_stable_id_idx").on(table.stableId),
    index("articles_primary_topic_id_idx").on(table.primaryTopicId),
  ],
);

export const articleAliases = pgTable(
  "article_aliases",
  {
    id: uuid("id").primaryKey(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id),
    alias: text("alias").notNull(),
  },
  (table) => [
    uniqueIndex("article_aliases_article_id_alias_idx").on(
      table.articleId,
      table.alias,
    ),
  ],
);

export const imageAssets = pgTable("image_assets", {
  id: uuid("id").primaryKey(),
  fileName: text("file_name").notNull(),
  extension: text("extension").notNull(),
  byteSize: integer("byte_size").notNull(),
  sha256: text("sha256").notNull(),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const articleVersions = pgTable(
  "article_versions",
  {
    id: uuid("id").primaryKey(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id),
    version: integer("version").notNull(),
    kind: text("kind")
      .$type<"publish" | "restore">()
      .notNull()
      .default("publish"),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    bodyMarkdown: text("body_markdown").notNull(),
    primaryTopicId: uuid("primary_topic_id")
      .notNull()
      .references(() => topics.id),
    tags: text("tags").array().notNull().default([]),
    contentOwnerId: uuid("content_owner_id").references(() => users.id),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
    nextReviewAt: timestamp("next_review_at", { withTimezone: true }),
    restoredReason: text("restored_reason"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("article_versions_article_id_version_idx").on(
      table.articleId,
      table.version,
    ),
  ],
);

export const onboardingStages = pgTable(
  "onboarding_stages",
  {
    id: uuid("id").primaryKey(),
    stableId: text("stable_id").notNull(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    description: text("description").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("onboarding_stages_stable_id_idx").on(table.stableId),
  ],
);

export const onboardingSteps = pgTable(
  "onboarding_steps",
  {
    id: uuid("id").primaryKey(),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => onboardingStages.id),
    sortOrder: integer("sort_order").notNull().default(0),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    articleStableId: text("article_stable_id"),
    templateStableId: text("template_stable_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("onboarding_steps_stage_id_idx").on(table.stageId)],
);

export const identitySchema = { users, sessions, identityAuditEvents };
export type TemplateVersionStatus = "draft" | "active" | "superseded";
export type QuarantineState = "pending" | "passed" | "failed" | "quarantined";

export const templateCategories = pgTable(
  "template_categories",
  {
    id: uuid("id").primaryKey(),
    stableId: text("stable_id").notNull(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("template_categories_stable_id_idx").on(table.stableId),
  ],
);

export const templates = pgTable(
  "templates",
  {
    id: uuid("id").primaryKey(),
    stableId: text("stable_id").notNull(),
    name: text("name").notNull(),
    purpose: text("purpose").notNull().default(""),
    usageScenario: text("usage_scenario").notNull().default(""),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => templateCategories.id),
    contentOwnerId: uuid("content_owner_id").references(() => users.id),
    status: text("status")
      .$type<"draft" | "published" | "archived">()
      .notNull()
      .default("draft"),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
    nextReviewAt: timestamp("next_review_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("templates_stable_id_idx").on(table.stableId),
    index("templates_category_id_idx").on(table.categoryId),
  ],
);

export const templateVersions = pgTable(
  "template_versions",
  {
    id: uuid("id").primaryKey(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => templates.id),
    version: integer("version").notNull(),
    versionLabel: text("version_label").notNull(),
    changeNote: text("change_note").notNull().default(""),
    fileName: text("file_name").notNull(),
    extension: text("extension").notNull(),
    byteSize: integer("byte_size").notNull(),
    sha256: text("sha256").notNull(),
    software: text("software").notNull().default(""),
    status: text("status")
      .$type<TemplateVersionStatus>()
      .notNull()
      .default("draft"),
    quarantineState: text("quarantine_state")
      .$type<QuarantineState>()
      .notNull()
      .default("pending"),
    quarantineReason: text("quarantine_reason"),
    downloadCount: integer("download_count").notNull().default(0),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("template_versions_template_id_version_idx").on(
      table.templateId,
      table.version,
    ),
    index("template_versions_template_id_idx").on(table.templateId),
  ],
);

export const bookCategories = pgTable(
  "book_categories",
  {
    id: uuid("id").primaryKey(),
    stableId: text("stable_id").notNull(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex("book_categories_stable_id_idx").on(table.stableId)],
);

export const books = pgTable(
  "books",
  {
    id: uuid("id").primaryKey(),
    stableId: text("stable_id").notNull(),
    title: text("title").notNull(),
    author: text("author").notNull(),
    coverImageId: uuid("cover_image_id"),
    coverExtension: text("cover_extension"),
    recommendation: text("recommendation").notNull().default(""),
    audience: text("audience").notNull().default(""),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => bookCategories.id),
    tags: text("tags").array().notNull().default([]),
    recommendedBy: uuid("recommended_by").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("books_stable_id_idx").on(table.stableId),
    index("books_category_id_idx").on(table.categoryId),
  ],
);

export const onboardingSchema = { onboardingStages, onboardingSteps };
export const bookSchema = { bookCategories, books };
export const templateSchema = {
  templateCategories,
  templates,
  templateVersions,
};
export const knowledgeSchema = {
  sections,
  topics,
  topicAliases,
  articles,
  articleAliases,
  articleVersions,
  imageAssets,
};
