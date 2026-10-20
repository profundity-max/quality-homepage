import {
  boolean,
  integer,
  pgView,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/** The reading projection owns version selection. Consumers never query the working copy. */
export const readableArticles = pgView("readable_articles", {
  id: uuid("id").notNull(),
  stableId: text("stable_id").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  bodyMarkdown: text("body_markdown").notNull(),
  primaryTopicId: uuid("primary_topic_id").notNull(),
  tags: text("tags").array().notNull(),
  aliases: text("aliases").array().notNull(),
  contentOwnerId: uuid("content_owner_id"),
  lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
  nextReviewAt: timestamp("next_review_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  readCount: integer("read_count").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  status: text("status").notNull(),
  editingInProgress: boolean("editing_in_progress").notNull(),
}).existing();
