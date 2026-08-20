import { redirect } from "next/navigation";

import { requirePortalSession } from "../../authorization";
import { PortalShell } from "../../portal-shell";
import { ImportPanel } from "@/ui/migration/import-panel";

export default async function ImportManagementPage() {
  const session = await requirePortalSession("/manage/import");
  if (session.member.role === "reader") redirect("/");

  return (
    <PortalShell currentPath="/manage/import">
      <main id="main-content" tabIndex={-1}>
        <div style={{ padding: "clamp(32px,6vw,96px) clamp(20px,8vw,128px)" }}>
          <header>
            <p
              style={{
                color: "var(--color-text-secondary)",
                letterSpacing: "0.12em",
              }}
            >
              品集｜Q Nexus · 门户管理
            </p>
            <h1
              style={{
                margin: "8px 0 12px",
                fontSize: "clamp(2rem,4.5vw,3.25rem)",
                fontWeight: 500,
              }}
            >
              内容导入
            </h1>
            <p style={{ color: "var(--color-text-secondary)" }}>
              导入内容统一进入草稿，发布前仍需补齐主题、摘要、负责人与复核日期（PORT-05）。
            </p>
          </header>
          <div style={{ marginTop: 28 }}>
            <ImportPanel isAdmin={session.member.role === "administrator"} />
          </div>
        </div>
      </main>
    </PortalShell>
  );
}
