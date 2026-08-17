import Link from "next/link";

import { getDatabase } from "@/db/database";
import { createTemplateService } from "@/modules/template-service";
import { createDiskFileStorage } from "@/modules/file-storage";
import { resolveDataDirectory } from "@/modules/file-storage/configuration";

import { requirePortalSession } from "../authorization";
import { PortalShell } from "../portal-shell";
import styles from "./templates.module.css";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function TemplatesPage() {
  await requirePortalSession("/templates");

  const service = createTemplateService(getDatabase(), {
    storage: createDiskFileStorage(resolveDataDirectory()),
    scanner: { scan: async () => ({ safe: true }) },
  });
  const categories = await service.listPublishedTemplatesByCategory();

  return (
    <PortalShell currentPath="/templates">
      <main id="main-content" tabIndex={-1} className={styles.layout}>
        <h1 className={styles.title}>模板中心</h1>
        <p className={styles.subtitle}>
          部门日常工作可复用的文件资源；所有模板只存储与下载，不在网页中解析或执行。
        </p>

        {categories.length === 0 && (
          <p className={styles.empty}>暂无可用模板。</p>
        )}

        {categories.map((category) => (
          <section
            key={category.stableId}
            className={styles.category}
            aria-label={category.name}
          >
            <h2>{category.name}</h2>
            {category.templates.length === 0 ? (
              <p className={styles.categoryEmpty}>该分类暂无模板。</p>
            ) : (
              <ul className={styles.templateList}>
                {category.templates.map((template) => (
                  <li key={template.stableId}>
                    <Link
                      className={styles.templateLink}
                      href={`/templates/${template.stableId}`}
                    >
                      <span className={styles.templateName}>
                        {template.name}
                      </span>
                      <span className={styles.templateMeta}>
                        v{template.versionLabel} · .{template.extension} ·{" "}
                        {formatSize(template.byteSize)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </main>
    </PortalShell>
  );
}
