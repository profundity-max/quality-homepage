import { redirect } from "next/navigation";

import styles from "../login/login.module.css";
import { getCurrentSession } from "../session";
import { ChangePasswordForm } from "./change-password-form";

export default async function ChangePasswordPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (!session.mustChangePassword) redirect("/");

  return (
    <main className={styles.layout}>
      <section
        className={styles.introduction}
        aria-labelledby="change-password-heading"
      >
        <p className={styles.eyebrow}>首次登录</p>
        <h1 id="change-password-heading">设置你的正式密码</h1>
        <p>临时密码只能用于首次登录。更新后，旧会话会立即失效。</p>
      </section>
      <ChangePasswordForm />
    </main>
  );
}
