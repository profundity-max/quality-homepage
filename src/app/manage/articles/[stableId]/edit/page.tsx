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
}: {
  params: Promise<{ stableId: string }>;
}) {
  const { stableId } = await params;
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
  const published = await createKnowledgePublishingService(getDatabase())
    .listAllPublishedArticles(100)
    .catch(() => []);

  return (
    <PortalShell currentPath={`/manage/articles/${stableId}/edit`}>
      <main id="main-content" tabIndex={-1}>
        <Editor
          article={article}
          topics={topics}
          publishedArticles={published}
          editingLockedBy={editingLockedBy}
          saveDraftAction={saveDraftAction}
          publishAction={publishAction}
        />
      </main>
    </PortalShell>
  );
}
