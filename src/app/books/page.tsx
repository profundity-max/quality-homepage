import Link from "next/link";
import { BookOpen } from "lucide-react";
import { getDatabase } from "@/db/database";
import { createBookService } from "@/modules/book-service";

import { requirePortalSession } from "../authorization";
import { PortalShell } from "../portal-shell";
import styles from "./books.module.css";

export default async function BooksPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  await requirePortalSession("/books");
  const categories =
    await createBookService(getDatabase()).listBooksByCategory();
  const { category: selectedId } = await searchParams;
  const selectedCategory = categories.find(
    (category) => category.stableId === selectedId,
  );
  const allBooks = categories.flatMap((category) => category.books);
  const visibleBooks = selectedCategory?.books ?? allBooks;

  return (
    <PortalShell currentPath="/books">
      <main id="main-content" tabIndex={-1} className={styles.layout}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>READING COLLECTION · 封面书墙</p>
          <h1 className={styles.title}>推荐书单</h1>
          <p className={styles.subtitle}>部门推荐的品质、统计与工程类书籍。</p>
          <p className={styles.summary}>
            {allBooks.length} 本精选 · {categories.length} 个方向
          </p>
        </header>
        <nav className={styles.categoryNav} aria-label="书单分类">
          <Link
            href="/books"
            aria-current={!selectedCategory ? "page" : undefined}
            scroll={false}
          >
            全部
          </Link>
          {categories.map((category) => (
            <Link
              key={category.stableId}
              href={`/books?category=${encodeURIComponent(category.stableId)}`}
              aria-current={
                selectedCategory?.stableId === category.stableId
                  ? "page"
                  : undefined
              }
              scroll={false}
            >
              {category.name}
            </Link>
          ))}
        </nav>
        <section
          className={styles.collection}
          aria-label={selectedCategory?.name ?? "全部书籍"}
        >
          {visibleBooks.length === 0 ? (
            <p className={styles.empty}>
              {selectedCategory ? "该分类暂无书籍。" : "暂无推荐书籍。"}
            </p>
          ) : (
            <ul className={styles.gallery} aria-label="推荐书籍">
              {visibleBooks.map((book) => (
                <li key={book.stableId} className={styles.book}>
                  <div className={styles.cover}>
                    {book.hasCover && book.coverUrl ? (
                      // 继续使用真实受控封面，保留原图片授权与身份水印。
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={book.coverUrl} alt={`${book.title} 封面`} />
                    ) : (
                      <div className={styles.placeholder}>
                        <BookOpen
                          size={32}
                          strokeWidth={1.25}
                          aria-hidden="true"
                        />
                        <span>无封面</span>
                      </div>
                    )}
                  </div>
                  <div className={styles.bookInfo}>
                    <h2>{book.title}</h2>
                    <p className={styles.author}>{book.author}</p>
                    <p className={styles.categoryLabel}>{book.categoryName}</p>
                    {book.recommendation && (
                      <p className={styles.recommendation}>
                        {book.recommendation}
                      </p>
                    )}
                    {book.audience && (
                      <p className={styles.audience}>
                        <span>适合</span>
                        {book.audience}
                      </p>
                    )}
                    {book.tags.length > 0 && (
                      <p className={styles.tags}>
                        {book.tags.map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </PortalShell>
  );
}
