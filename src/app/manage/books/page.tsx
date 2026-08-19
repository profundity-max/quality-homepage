import { redirect } from "next/navigation";

import { getDatabase } from "@/db/database";
import {
  createBookService,
  type AdminBookView,
  type BookCategoryView,
} from "@/modules/book-service";

import { requirePortalSession } from "../../authorization";
import { PortalShell } from "../../portal-shell";
import { DirectionButtons } from "../direction-buttons";
import {
  createBookAction,
  createCategoryAction,
  moveCategoryAction,
  renameCategoryAction,
  updateBookAction,
} from "./actions";
import styles from "../manage.module.css";

export default async function BookManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const params = await searchParams;
  const session = await requirePortalSession("/manage/books");
  const service = createBookService(getDatabase());
  const loaded = await Promise.all([
    service.listCategoriesForAdmin(session.member.id),
    service.listBooksForAdmin(session.member.id),
  ]).catch(() => null);
  if (!loaded) redirect("/manage");
  const [categories, books] = loaded;

  return (
    <PortalShell currentPath="/manage/books">
      <main id="main-content" tabIndex={-1} className={styles.layout}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>品集｜Q Nexus · 门户管理</p>
            <h1>书单管理</h1>
            <p>维护推荐书目与分类；封面来自受控存储，不依赖外部图片服务。</p>
          </div>
        </header>

        {params.notice ? (
          <p className={styles.notice} role="status">
            {params.notice}
          </p>
        ) : null}
        {params.error ? (
          <p className={styles.error} role="alert">
            {params.error}
          </p>
        ) : null}

        <CategorySection categories={categories} />
        <NewBookForm categories={categories} />
        <BookList books={books} categories={categories} />
      </main>
    </PortalShell>
  );
}

function CategorySection({ categories }: { categories: BookCategoryView[] }) {
  return (
    <section className={styles.panel} aria-labelledby="book-category-heading">
      <h2 id="book-category-heading">书目分类（BOOK-02）</h2>
      <form action={createCategoryAction} className={styles.createForm}>
        <label>
          新分类名称
          <input name="name" required aria-label="新书目分类名称" />
        </label>
        <button type="submit">创建分类</button>
      </form>
      <ul>
        {categories.map((category) => (
          <li key={category.id} className={styles.columnRow}>
            <span className={styles.columnName}>
              {category.name}
              <span className={styles.columnMeta}>
                {category.bookCount} 本书
              </span>
            </span>
            <form action={renameCategoryAction} className={styles.renameForm}>
              <input type="hidden" name="stableId" value={category.stableId} />
              <input
                name="name"
                defaultValue={category.name}
                aria-label={`重命名书目分类 ${category.name}`}
                className={styles.renameInput}
              />
              <button type="submit">改名</button>
            </form>
            <DirectionButtons
              action={moveCategoryAction}
              idName="stableId"
              idValue={category.stableId}
              labelPrefix={`移动书目分类 ${category.name}`}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function NewBookForm({ categories }: { categories: BookCategoryView[] }) {
  return (
    <section className={styles.panel} aria-labelledby="new-book-heading">
      <h2 id="new-book-heading">新建书目</h2>
      <BookForm
        action={createBookAction}
        categories={categories}
        submitLabel="创建书目"
        book={null}
      />
    </section>
  );
}

function BookList({
  books,
  categories,
}: {
  books: AdminBookView[];
  categories: BookCategoryView[];
}) {
  return (
    <section className={styles.panel} aria-labelledby="book-list-heading">
      <h2 id="book-list-heading">推荐书目</h2>
      {books.length === 0 ? <p>暂无书目。</p> : null}
      {books.map((book) => (
        <article
          key={book.id}
          className={styles.memberCard}
          aria-label={`书目 ${book.title}`}
        >
          <div className={styles.memberSummary}>
            <div>
              <h3>{book.title}</h3>
              <p>
                {book.author} · {book.categoryName}
                {book.hasCover ? "" : " · 无封面"}
              </p>
            </div>
          </div>
          <BookForm
            action={updateBookAction}
            categories={categories}
            submitLabel="更新书目"
            book={book}
          />
        </article>
      ))}
    </section>
  );
}

function BookForm({
  action,
  categories,
  submitLabel,
  book,
}: {
  action: (formData: FormData) => Promise<void>;
  categories: BookCategoryView[];
  submitLabel: string;
  book: AdminBookView | null;
}) {
  const prefix = book ? `编辑 ${book.title}` : "新建书目";
  return (
    <form action={action} className={styles.createForm}>
      {book ? (
        <input type="hidden" name="stableId" value={book.stableId} />
      ) : null}
      <label>
        书名
        <input
          name="title"
          required
          defaultValue={book?.title ?? ""}
          aria-label={`${prefix} 书名`}
        />
      </label>
      <label>
        作者
        <input
          name="author"
          required
          defaultValue={book?.author ?? ""}
          aria-label={`${prefix} 作者`}
        />
      </label>
      <label>
        推荐理由
        <input
          name="recommendation"
          defaultValue={book?.recommendation ?? ""}
          aria-label={`${prefix} 推荐理由`}
        />
      </label>
      <label>
        适合人群
        <input
          name="audience"
          defaultValue={book?.audience ?? ""}
          aria-label={`${prefix} 适合人群`}
        />
      </label>
      <label>
        分类
        <select
          name="categoryId"
          required
          defaultValue={book?.categoryId ?? categories[0]?.id}
          aria-label={`${prefix} 分类`}
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        标签（逗号分隔）
        <input
          name="tags"
          defaultValue={book?.tags.join(", ") ?? ""}
          aria-label={`${prefix} 标签`}
        />
      </label>
      <label>
        封面
        <input
          name="cover"
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          aria-label={`${prefix} 封面`}
        />
      </label>
      <button type="submit">{submitLabel}</button>
    </form>
  );
}
