import { getDatabase } from "@/db/database";
import { createBookService } from "@/modules/book-service";

import { requirePortalSession } from "../authorization";
import { PortalShell } from "../portal-shell";
import styles from "./books.module.css";

export default async function BooksPage() {
  await requirePortalSession("/books");

  const service = createBookService(getDatabase());
  const categories = await service.listBooksByCategory();

  const totalBooks = categories.reduce(
    (total, category) => total + category.books.length,
    0,
  );

  return (
    <PortalShell currentPath="/books">
      <main id="main-content" tabIndex={-1} className={styles.layout}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>READING COLLECTION · 精选阅读</p>
            <h1 className={styles.title}>推荐书单</h1>
            <p className={styles.subtitle}>
              部门推荐的品质、统计与工程类书籍。
            </p>
          </div>
          <p className={styles.summary}>
            <strong>{totalBooks}</strong>
            <span>本推荐书籍</span>
          </p>
        </header>
        {categories.length > 0 && (
          <nav className={styles.categoryNav} aria-label="书单分类">
            {categories.map((category) => (
              <a
                key={category.stableId}
                href={`#book-category-${category.stableId}`}
              >
                {category.name}
                <span>{category.books.length}</span>
              </a>
            ))}
          </nav>
        )}

        {categories.length === 0 && (
          <p className={styles.empty}>暂无推荐书籍。</p>
        )}

        <div className={styles.catalog}>
          {categories.map((category) => (
            <section
              key={category.stableId}
              id={`book-category-${category.stableId}`}
              className={styles.category}
              aria-label={category.name}
            >
              <div className={styles.categoryHeading}>
                <h2>{category.name}</h2>
                <span>{category.books.length} 本</span>
              </div>
              {category.books.length === 0 ? (
                <p className={styles.categoryEmpty}>该分类暂无书籍。</p>
              ) : (
                <ul className={styles.bookList}>
                  {category.books.map((book) => (
                    <li key={book.stableId} className={styles.bookCard}>
                      <div className={styles.cover}>
                        {book.hasCover && book.coverUrl ? (
                          // 封面图片来自受控目录（BOOK-04）
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={book.coverUrl} alt={`${book.title} 封面`} />
                        ) : (
                          <span className={styles.placeholder}>无封面</span>
                        )}
                      </div>
                      <div className={styles.bookInfo}>
                        <h3>{book.title}</h3>
                        <p className={styles.author}>{book.author}</p>
                        {book.recommendation && (
                          <p className={styles.recommendation}>
                            <span className={styles.infoLabel}>推荐理由</span>
                            {book.recommendation}
                          </p>
                        )}
                        {book.audience && (
                          <p className={styles.audience}>
                            <span className={styles.infoLabel}>适合人群</span>
                            {book.audience}
                          </p>
                        )}
                        {book.tags.length > 0 && (
                          <p className={styles.tags}>
                            {book.tags.map((tag) => (
                              <span key={tag} className={styles.tag}>
                                {tag}
                              </span>
                            ))}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </main>
    </PortalShell>
  );
}
