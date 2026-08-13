import Link from "next/link";
import { redirect } from "next/navigation";

import { logoutAction } from "./actions";
import styles from "./home.module.css";
import { getCurrentSession } from "./session";

export default async function HomePage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.mustChangePassword) redirect("/change-password");

  const name = session.member.displayName || session.member.username;

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
          管理员 · {session.member.username}
        </p>
        <p className={styles.belief}>数据驱动 · 结果闭环</p>
      </main>
    </>
  );
}
