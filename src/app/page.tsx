import Link from "next/link";

import { createPersonalizedHome } from "@/modules/personalized-home";

import { requirePortalSession } from "./authorization";
import styles from "./home.module.css";
import { PortalShell } from "./portal-shell";

export default async function HomePage() {
  const session = await requirePortalSession("/");
  const model = createPersonalizedHome({
    instant: new Date(),
    username: session.member.username,
    displayName: session.member.displayName,
  });

  return (
    <PortalShell currentPath="/">
      <main id="main-content" tabIndex={-1}>
        <section className={styles.hero} data-testid="home-hero">
          <div>
            <p className={styles.eyebrow}>{model.greeting}</p>
            <h1>{model.name}</h1>
            <p className={styles.belief}>{model.belief}</p>
          </div>
          <aside className={styles.searchPosition} aria-label="站内搜索位置">
            <span>站内搜索</span>
            <p>搜索将随知识内容一同开放</p>
            <Link href="/search">查看搜索建设状态</Link>
          </aside>
        </section>
        <div className={styles.sections}>
          {model.sections.map((section, index) => (
            <section className={styles.section} key={section.title}>
              <p className={styles.index}>
                {String(index + 1).padStart(2, "0")}
              </p>
              <Link href={section.href} className={styles.sectionLink}>
                <h2>{section.title}</h2>
                <p>内容建设中</p>
              </Link>
            </section>
          ))}
        </div>
      </main>
    </PortalShell>
  );
}
