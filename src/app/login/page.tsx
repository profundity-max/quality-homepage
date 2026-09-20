import { redirect } from "next/navigation";

import { LoginForm } from "./login-form";
import styles from "./login.module.css";
import { passwordChangePath, resolveSafeReturnPath } from "../return-path";
import { getCurrentSession } from "../session";
import { getSelectedTheme } from "../theme";
import { ThemeToggle } from "../theme-toggle";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const returnPath = resolveSafeReturnPath((await searchParams).next);
  const session = await getCurrentSession();
  if (session) {
    redirect(
      session.mustChangePassword ? passwordChangePath(returnPath) : returnPath,
    );
  }
  const theme = await getSelectedTheme();
  return (
    <>
      <div className={styles.theme}>
        <ThemeToggle current={theme} />
      </div>
      <main className={styles.layout}>
        <section
          className={styles.introduction}
          aria-labelledby="login-heading"
        >
          <p className={styles.eyebrow}>品集｜Q Nexus · 品质部门户</p>
          {/* 中文一行、英文一行，避免「Q Nexus」被拆开 */}
          <h1 id="login-heading">
            <span className={styles.headingLine} data-testid="login-line-zh">
              登录品集｜
            </span>
            <span className={styles.headingLine} data-testid="login-line-en">
              Q Nexus
            </span>
          </h1>
          <p>连接部门知识，沉淀共同经验。</p>
          <p className={styles.lanNotice}>仅限受信任的公司局域网访问。</p>
        </section>
        <LoginForm returnPath={returnPath} />
      </main>
    </>
  );
}
