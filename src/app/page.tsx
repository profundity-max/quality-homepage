import Link from "next/link";

import { logoutAction } from "./actions";
import { requirePortalSession } from "./authorization";
import styles from "./home.module.css";

export default async function HomePage() {
  const session = await requirePortalSession("/");

  const name = session.member.displayName || session.member.username;
  const roleName = {
    administrator: "管理员",
    editor: "编辑者",
    reader: "阅读者",
  }[session.member.role];

  return (
    <>
      <a className={styles.skipLink} href="#main-content">
        跳到主要内容
      </a>
      <header className={styles.siteHeader}>
        <Link className={styles.brand} href="/">
          品集｜Q Nexus
        </Link>
        <form action={logoutAction}>
          <button className={styles.textButton} type="submit">
            退出登录
          </button>
        </form>
      </header>
      <main id="main-content" className={styles.protectedHome}>
        <p className={styles.eyebrow}>欢迎回来</p>
        <h1>{name}</h1>
        <p className={styles.identitySummary}>
          {roleName} · {session.member.username}
        </p>
        <p className={styles.belief}>数据驱动 · 结果闭环</p>
      </main>
    </>
  );
}
