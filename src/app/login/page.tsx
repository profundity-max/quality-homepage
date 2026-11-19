import { redirect } from "next/navigation";

import { LoginForm } from "./login-form";
import { StatisticsField } from "./statistics-field";
import styles from "./login.module.css";
import { passwordChangePath, resolveSafeReturnPath } from "../return-path";
import { getCurrentSession } from "../session";
import { getSelectedTheme } from "../theme";
import { ThemeToggle } from "../theme-toggle";
import "./tokens.css";

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
    <div className={styles.scene} data-login-screen>
      <div className={styles.screen}>
        <header className={styles.header}>
          <p className={styles.portalName} data-statistics-quiet="text">
            品质部门户
          </p>
          <div className={styles.headerControls} data-statistics-quiet>
            <StatisticsField />
            <div className={styles.theme}>
              <ThemeToggle current={theme} />
            </div>
          </div>
        </header>
        <main className={styles.layout}>
          <section
            className={styles.introduction}
            aria-labelledby="login-heading"
            data-statistics-quiet="text"
          >
            <h1 id="login-heading">
              <span className={styles.headingLine} data-testid="login-line-zh">
                欢迎来到
              </span>
              <span className={styles.headingLine} data-testid="login-line-en">
                品集｜Q Nexus
              </span>
            </h1>
            <p className={styles.description}>连接部门知识，沉淀共同经验。</p>
          </section>
          <LoginForm returnPath={returnPath} />
        </main>
        <footer className={styles.footer}>
          <p className={styles.lanNotice} data-statistics-quiet="text">
            仅限受信任的公司局域网访问。
          </p>
          <span className={styles.wordmark} data-statistics-quiet="text">
            品集｜Q Nexus
          </span>
        </footer>
      </div>
    </div>
  );
}
