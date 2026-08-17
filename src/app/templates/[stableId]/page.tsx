import { notFound } from "next/navigation";

import { getDatabase } from "@/db/database";
import { createTemplateService } from "@/modules/template-service";
import { createDiskFileStorage } from "@/modules/file-storage";
import { resolveDataDirectory } from "@/modules/file-storage/configuration";

import { requirePortalSession } from "../../authorization";
import { PortalShell } from "../../portal-shell";
import styles from "../templates.module.css";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ stableId: string }>;
}) {
  const { stableId } = await params;
  await requirePortalSession(`/templates/${stableId}`);

  const service = createTemplateService(getDatabase(), {
    storage: createDiskFileStorage(resolveDataDirectory()),
    scanner: { scan: async () => ({ safe: true }) },
  });
  const template = await service.getPublishedTemplate(stableId);
  if (!template) notFound();

  return (
    <PortalShell currentPath={`/templates/${stableId}`}>
      <main id="main-content" tabIndex={-1} className={styles.detailLayout}>
        <h1 className={styles.title}>{template.name}</h1>

        <dl className={styles.metaList}>
          <div>
            <dt>用途</dt>
            <dd>{template.purpose || "—"}</dd>
          </div>
          <div>
            <dt>适用场景</dt>
            <dd>{template.usageScenario || "—"}</dd>
          </div>
          <div>
            <dt>文件</dt>
            <dd>
              .{template.extension} · {formatSize(template.byteSize)}
            </dd>
          </div>
          <div>
            <dt>适用软件</dt>
            <dd>{template.software || "—"}</dd>
          </div>
          <div>
            <dt>当前版本</dt>
            <dd>
              v{template.versionLabel}
              {template.changeNote ? `（${template.changeNote}）` : ""}
            </dd>
          </div>
          <div>
            <dt>下载次数</dt>
            <dd>{template.downloadCount}</dd>
          </div>
        </dl>

        <p className={styles.qmsNotice}>
          ⚠ 门户中的有效模板不等于 QMS
          正式受控版本，使用前请确认正式系统中的最新受控版本。
        </p>

        <a
          className={styles.downloadButton}
          href={`/templates/${stableId}/download`}
        >
          下载当前有效版本
        </a>
      </main>
    </PortalShell>
  );
}
