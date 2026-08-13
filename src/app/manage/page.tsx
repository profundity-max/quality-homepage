import Link from "next/link";
import { redirect } from "next/navigation";

import { getIdentityModule } from "@/modules/identity";

import { requirePortalSession } from "../authorization";
import styles from "../home.module.css";

export default async function AccountManagementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined) query.append(key, item);
    }
  }
  const requestedPath = `/manage${query.size > 0 ? `?${query}` : ""}`;
  const session = await requirePortalSession(requestedPath);
  const isAdministrator = await getIdentityModule()
    .assertAdministrator(session.member.id)
    .then(
      () => true,
      () => false,
    );
  if (!isAdministrator) redirect("/");

  return (
    <main className={styles.protectedHome}>
      <p className={styles.eyebrow}>门户管理</p>
      <h1>账户管理</h1>
      <p className={styles.identitySummary}>账户管理功能正在建设中。</p>
      <Link href="/">返回首页</Link>
    </main>
  );
}
