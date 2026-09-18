import { redirect } from "next/navigation";

import { randomUUID } from "node:crypto";

import { getDatabase } from "@/db/database";
import { createKnowledgeAdministrationService } from "@/modules/knowledge-administration";
import { createKnowledgeEditingService } from "@/modules/knowledge-editing";

import { requirePortalSession } from "../../../authorization";
import { PortalShell } from "../../../portal-shell";
import { Editor } from "../[stableId]/edit/editor";
import { createDraftAction } from "../actions";

export default async function NewArticlePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const fromOnboarding = (await searchParams).from === "onboarding";
  const session = await requirePortalSession("/manage/articles/new");
  if (session.member.role === "reader") redirect("/");

  const admin = createKnowledgeAdministrationService(getDatabase());
  const editing = createKnowledgeEditingService(getDatabase());
  const topics = await admin.listAllTopics(session.member.id).catch(() => []);
  const owners = await editing
    .listAssignableOwners({ editorUserId: session.member.id })
    .catch(() => []);

  const draft = {
    id: "",
    stableId: `new-${randomUUID().slice(0, 8)}`,
    title: "",
    summary: "",
    bodyMarkdown: "",
    primaryTopicId: fromOnboarding
      ? (topics.find(
          (topic) =>
            topic.stableId === "onboarding-route-articles" && !topic.archived,
        )?.id ?? "")
      : "",
    tags: [],
    aliases: [],
    contentOwnerId: session.member.id,
    status: "draft" as const,
    lastReviewedAt: null,
    nextReviewAt: null,
    publishedAt: null,
    editingBy: null,
    editingAt: null,
    readCount: 0,
    isCaseArticle: false,
    updatedAt: new Date(),
  };

  return (
    <PortalShell currentPath="/manage/articles/new">
      <main id="main-content" tabIndex={-1}>
        <Editor
          article={draft}
          fromOnboarding={fromOnboarding}
          topics={topics}
          owners={owners}
          publishedArticles={[]}
          saveDraftAction={createDraftAction}
        />
      </main>
    </PortalShell>
  );
}
