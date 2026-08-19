import Link from "next/link";

import { getDatabase } from "@/db/database";
import { createFavoritesService } from "@/modules/favorites";

import { requirePortalSession } from "../authorization";
import { PortalShell } from "../portal-shell";
import styles from "./favorites.module.css";

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(value);
}

export default async function FavoritesPage() {
  const session = await requirePortalSession("/favorites");
  const favorites = await createFavoritesService(getDatabase()).listFavorites(
    session.member.id,
  );

  return (
    <PortalShell currentPath="/favorites">
      <main id="main-content" tabIndex={-1} className={styles.layout}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>品集｜Q Nexus · 我的收藏</p>
          <h1>收藏</h1>
          <p>收藏仅对本人可见，用于保留常用文章入口（FAV-01）。</p>
        </header>

        {favorites.length === 0 ? (
          <section className={styles.empty} aria-label="暂无收藏">
            <h2>还没有收藏文章</h2>
            <p>在文章页点击“收藏”，即可在这里快速找到它。</p>
          </section>
        ) : (
          <ul className={styles.list}>
            {favorites.map((favorite) => (
              <li key={favorite.stableId}>
                <Link
                  href={`/articles/${favorite.stableId}`}
                  className={styles.item}
                >
                  <span className={styles.title}>{favorite.title}</span>
                  <span className={styles.meta}>
                    {favorite.sectionName} · {favorite.topicName} · 更新于{" "}
                    {formatDate(favorite.updatedAt)}
                  </span>
                  {favorite.summary ? (
                    <span className={styles.summary}>{favorite.summary}</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </PortalShell>
  );
}
