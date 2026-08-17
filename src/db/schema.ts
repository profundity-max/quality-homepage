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

export const identitySchema = { users, sessions, identityAuditEvents };
export const knowledgeSchema = {
  sections,
  topics,
  topicAliases,
  articles,
  articleAliases,
  articleVersions,
  imageAssets,
};
