import { redirect } from "next/navigation";

import { requirePortalSession } from "../../authorization";
import { PortalShell } from "../../portal-shell";
import styles from "./export.module.css";

export default async function ExportManagementPage() {
  const session = await requirePortalSession("/manage/export");
  if (session.member.role !== "administrator") redirect("/");

  return (
    <PortalShell currentPath="/manage/export">
      <main id="main-content" tabIndex={-1} className={styles.layout}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>品集｜Q Nexus · 门户管理</p>
          <h1>内容导出</h1>
          <p>
            全站导出为独立可读的 Markdown 包（含栏目、主题、别名与清单）；
            模板文件单独导出、不嵌入 Markdown（PORT-07/08/09）。
          </p>
        </header>

        <section className={styles.card} aria-label="全站导出">
          <h2>全站 Markdown 导出</h2>
          <p>
            导出内容不依赖当前网站即可阅读；单篇文章可在文章版本历史页导出。
          </p>
          <a
            href="/api/migration/export/full"
            download
            className={styles.export}
          >
            导出全站 Markdown 包
          </a>
        </section>
      </main>
    </PortalShell>
  );
}
