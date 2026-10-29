import { requirePortalSession } from "../authorization";
import { PortalShell } from "../portal-shell";
import styles from "../templates/templates.module.css";

export default async function AppsPage() {
  await requirePortalSession("/apps");

  return (
    <PortalShell currentPath="/apps">
      <main id="main-content" tabIndex={-1} className={styles.layout}>
        <h1 className={styles.title}>应用中心</h1>
        <p className={styles.subtitle}>
          汇集团队用 Vibe Coding 打造的 Web 应用，让实用工具触手可及。
        </p>
        <p className={styles.empty}>应用陆续上线</p>
      </main>
    </PortalShell>
  );
}
