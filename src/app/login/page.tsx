import { redirect } from "next/navigation";

import { LoginForm } from "./login-form";
import styles from "./login.module.css";
import { getCurrentSession } from "../session";

export default async function LoginPage() {
  const session = await getCurrentSession();
  if (session) {
    redirect(session.mustChangePassword ? "/change-password" : "/");
  }

  return (
    <main className={styles.layout}>
      <section className={styles.introduction} aria-labelledby="login-heading">
        <p className={styles.eyebrow}>品质部门户</p>
        <h1 id="login-heading">登录品集｜Q Nexus</h1>
        <p>连接部门知识，沉淀共同经验。</p>
        <p className={styles.lanNotice}>仅限受信任的公司局域网访问。</p>
      </section>
      <LoginForm />
    </main>
  );
}
