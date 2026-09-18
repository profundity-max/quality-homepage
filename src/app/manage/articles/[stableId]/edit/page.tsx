import { notFound } from "next/navigation";

import { getDatabase } from "@/db/database";
import { createKnowledgeEditingService } from "@/modules/knowledge-editing";
import { createKnowledgeAdministrationService } from "@/modules/knowledge-administration";
import { createKnowledgePublishingService } from "@/modules/knowledge-publishing";

import { requirePortalSession } from "../../../../authorization";
import { PortalShell } from "../../../../portal-shell";
import { Editor } from "./editor";
import { publishAction, saveDraftAction } from "../../actions";

export default async function EditArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ stableId: string }>;
  searchParams: Promise<{ notice?: string; error?: string; from?: string }>;
}) {
  const { stableId } = await params;
  const query = await searchParams;
  const session = await requirePortalSession(
    `/manage/articles/${stableId}/edit`,
  );
  if (session.member.role === "reader") notFound();

  const editing = createKnowledgeEditingService(getDatabase());
  const article = await editing
    .getArticleForEditing(session.member.id, stableId)
    .catch(() => null);
  if (!article) notFound();

  // EDIT-09：打开编辑器即获取占用；被他人占用时进入只读+接管模式
  let editingLockedBy: string | null = null;
  if (article.editingBy !== null && article.editingBy !== session.member.id) {
    editingLockedBy = article.editingBy;
  } else {
    await editing
      .acquireEditLock(session.member.id, stableId)
      .catch(() => undefined);
  }

  const admin = createKnowledgeAdministrationService(getDatabase());
  const topics = await admin.listAllTopics(session.member.id).catch(() => []);
  const owners = await editing
    .listAssignableOwners({ editorUserId: session.member.id })
    .catch(() => []);
  const published = await createKnowledgePublishingService(getDatabase())
    .listAllPublishedArticles(100)
    .catch(() => []);

  return (
    <PortalShell currentPath={`/manage/articles/${stableId}/edit`}>
      <main id="main-content" tabIndex={-1}>
        {query.notice && (
          <p
            role="status"
            style={{
              margin: "0",
              padding: "12px clamp(20px, 8vw, 128px)",
              borderBottom: "1px solid var(--color-divider)",
              color: "var(--color-link)",
            }}
          >
            {query.notice}
          </p>
        )}
        {query.error && (
          <p
            role="alert"
            style={{
              margin: "0",
              padding: "12px clamp(20px, 8vw, 128px)",
              borderBottom: "1px solid var(--color-divider)",
              color: "var(--color-warning)",
            }}
          >
            {query.error}
          </p>
        )}
        <Editor
          article={article}
          fromOnboarding={query.from === "onboarding"}
          topics={topics}
          owners={owners}
          publishedArticles={published}
          editingLockedBy={editingLockedBy}
          saveDraftAction={saveDraftAction}
          publishAction={publishAction}
        />
      </main>
    </PortalShell>
  );
}
