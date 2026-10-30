import Link from "next/link";
import { ArrowUpRight, ChartNoAxesCombined } from "lucide-react";

import { listApplications } from "@/modules/application-catalog";

import { requirePortalSession } from "../authorization";
import { PortalShell } from "../portal-shell";
import styles from "./apps.module.css";

export default async function AppsPage() {
  await requirePortalSession("/apps");
  const applications = listApplications();

  return (
    <PortalShell currentPath="/apps">
      <main id="main-content" tabIndex={-1} className={styles.layout}>
        <header className={styles.pageHeader}>
          <div>
            <p className={styles.eyebrow}>Q Nexus · Workspace</p>
            <h1 className={styles.title}>应用中心</h1>
            <p className={styles.subtitle}>
              汇集团队日常使用的 Web
              工具。选择一个应用即可进入说明、案例数据和工具页面。
            </p>
          </div>
          <p className={styles.applicationCount} aria-label="可用应用数量">
            <strong>{applications.length}</strong>
            <span>个可用应用</span>
          </p>
        </header>

        <section className={styles.catalog} aria-labelledby="available-apps">
          <div className={styles.sectionHeading}>
            <h2 id="available-apps">可用应用</h2>
            <span>按业务场景逐步接入</span>
          </div>
          <ul className={styles.cardGrid} aria-label="应用列表">
            {applications.map((application) => (
              <li key={application.id}>
                <Link
                  className={styles.appCard}
                  href={application.href}
                  aria-label={`${application.name}：${application.summary}`}
                >
                  <div className={styles.cardTopline}>
                    <span className={styles.appMark} aria-hidden="true">
                      <ChartNoAxesCombined size={22} strokeWidth={1.7} />
                    </span>
                    <span className={styles.status}>
                      <span aria-hidden="true" />
                      可用
                    </span>
                  </div>
                  <div className={styles.cardBody}>
                    <p className={styles.cardCategory}>
                      {application.category} · {application.version}
                    </p>
                    <h3>{application.name}</h3>
                    <p>{application.summary}</p>
                  </div>
                  <div className={styles.cardFooter}>
                    <span>{application.owner}</span>
                    <span className={styles.openLabel}>
                      查看应用
                      <ArrowUpRight size={16} aria-hidden="true" />
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </PortalShell>
  );
}
