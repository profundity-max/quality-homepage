import { notFound } from "next/navigation";

import { requirePortalSession } from "../authorization";
import styles from "../destination.module.css";
import { PortalShell } from "../portal-shell";

const destinations = {
  onboarding: "新人专区",
  quality: "品质知识",
  thermal: "散热知识",
  books: "推荐书单",
  templates: "模板中心",
  updates: "最近更新",
  search: "搜索",
} as const;

export default async function DestinationPage({
  params,
}: {
  params: Promise<{ destination: string }>;
}) {
  const { destination } = await params;
  if (!(destination in destinations)) notFound();
  const path = `/${destination}`;
  await requirePortalSession(path);
  const title = destinations[destination as keyof typeof destinations];

  return (
    <PortalShell currentPath={path}>
      <main id="main-content" tabIndex={-1} className={styles.main}>
        <p>品集｜Q Nexus</p>
        <h1>{title}</h1>
        <p className={styles.status}>内容建设中</p>
        <p>这里暂不提供虚构的文章、数量或操作；内容完成后将沿用此稳定入口。</p>
      </main>
    </PortalShell>
  );
}
