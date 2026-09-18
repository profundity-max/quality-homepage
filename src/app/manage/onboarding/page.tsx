import Link from "next/link";
import { redirect } from "next/navigation";
import { getDatabase } from "@/db/database";
import { createOnboardingAdminService } from "@/modules/onboarding-admin";
import { requirePortalSession } from "../../authorization";
import { PortalShell } from "../../portal-shell";
import {
  addRouteArticleAction,
  moveRouteArticleAction,
  removeRouteArticleAction,
} from "./actions";
import { SubmitButton } from "./submit-button";
import styles from "./route.module.css";

function statusLabel(article: { status: string; publishedAt: Date | null }) {
  if (article.status === "archived") return "已归档 · 阅读者不可见";
  if (article.status === "published") return "已发布";
  return article.publishedAt ? "有待发布修改" : "草稿 · 阅读者不可见";
}

export default async function OnboardingManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; notice?: string; error?: string }>;
}) {
  const params = await searchParams;
  const session = await requirePortalSession("/manage/onboarding");
  if (session.member.role === "reader") redirect("/manage");
  const service = createOnboardingAdminService(getDatabase());
  const [items, candidates] = await Promise.all([
    service.listArticles(session.member.id),
    params.q !== undefined
      ? service.searchArticles(session.member.id, params.q)
      : Promise.resolve([]),
  ]);

  return (
    <PortalShell currentPath="/manage/onboarding">
      <main id="main-content" tabIndex={-1} className={styles.layout}>
        <nav className={styles.breadcrumb} aria-label="后台导航">
          <Link href="/manage">内容管理</Link>
          <span aria-hidden="true">/</span>
          <Link href="/manage/articles">文章管理</Link>
          <span aria-hidden="true">/</span>
          <span>新人路线</span>
        </nav>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>内容编排</p>
            <h1>新人路线</h1>
            <p>每一步是一篇文章，按新人的阅读顺序排列。</p>
          </div>
          <Link className={styles.secondaryLink} href="/onboarding">
            预览新人专区
          </Link>
        </header>
        {params.notice && (
          <p className={styles.notice} role="status">
            {params.notice}
          </p>
        )}
        {params.error && (
          <p className={styles.error} role="alert">
            {params.error}
          </p>
        )}
        <section className={styles.panel} aria-label="路线文章">
          <div className={styles.sectionHeader}>
            <div>
              <h2>
                路线文章 <span>{items.length}</span>
              </h2>
              <p>修改正文请点“编辑文章”。移出路线不会删除原文章。</p>
            </div>
            <div className={styles.toolbar}>
              <a className={styles.secondaryLink} href="#add-articles">
                添加已有文章
              </a>
              <Link
                className={styles.primaryLink}
                href="/manage/articles/new?from=onboarding"
              >
                新建路线文章
              </Link>
            </div>
          </div>
          {items.length === 0 ? (
            <p className={styles.empty}>
              路线中还没有文章。添加已有文章，或新建第一篇。
            </p>
          ) : (
            <ol className={styles.list}>
              {items.map((item, index) => (
                <li
                  key={item.id}
                  className={styles.row}
                  aria-label={`路线文章 ${item.title}`}
                >
                  <span className={styles.order}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className={styles.article}>
                    <Link
                      className={styles.articleTitle}
                      href={`/manage/articles/${item.stableId}/edit?from=onboarding`}
                    >
                      {item.title}
                    </Link>
                    <div className={styles.meta}>
                      <span className={styles.badge}>{statusLabel(item)}</span>
                      <span>负责人：{item.ownerName ?? "待指定"}</span>
                    </div>
                  </div>
                  <div className={styles.rowActions}>
                    <Link
                      href={`/manage/articles/${item.stableId}/edit?from=onboarding`}
                    >
                      编辑文章
                    </Link>
                    <form action={moveRouteArticleAction}>
                      <input type="hidden" name="itemId" value={item.id} />
                      <SubmitButton
                        name="direction"
                        value="up"
                        disabled={index === 0}
                        label={`上移 ${item.title}`}
                      >
                        上移
                      </SubmitButton>
                      <SubmitButton
                        name="direction"
                        value="down"
                        disabled={index === items.length - 1}
                        label={`下移 ${item.title}`}
                      >
                        下移
                      </SubmitButton>
                    </form>
                    <form action={removeRouteArticleAction}>
                      <input type="hidden" name="itemId" value={item.id} />
                      <SubmitButton label={`移出路线 ${item.title}`}>
                        移出路线
                      </SubmitButton>
                    </form>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section
          id="add-articles"
          className={styles.panel}
          aria-labelledby="add-heading"
        >
          <h2 id="add-heading">添加已有文章</h2>
          <p className={styles.help}>
            搜索文章标题后加入路线。草稿可以先编排，发布后才对阅读者可见。
          </p>
          <form
            className={styles.search}
            method="get"
            action="/manage/onboarding#add-articles"
          >
            <label htmlFor="article-search">文章标题</label>
            <input
              id="article-search"
              name="q"
              type="search"
              defaultValue={params.q ?? ""}
              placeholder="输入标题关键词"
            />
            <button type="submit">搜索文章</button>
          </form>
          {params.q !== undefined && (
            <ul className={styles.candidates}>
              {candidates.map((article) => (
                <li key={article.stableId}>
                  <div>
                    <strong>{article.title}</strong>
                    <p>{statusLabel(article)}</p>
                  </div>
                  <form action={addRouteArticleAction}>
                    <input
                      type="hidden"
                      name="stableId"
                      value={article.stableId}
                    />
                    <SubmitButton label={`加入路线 ${article.title}`}>
                      加入路线
                    </SubmitButton>
                  </form>
                </li>
              ))}
              {candidates.length === 0 && (
                <li>
                  没有找到可添加的文章。已在路线中或已归档的文章不会重复显示。
                </li>
              )}
            </ul>
          )}
          {candidates.length === 50 && (
            <p>当前显示前 50 篇，请补充关键词缩小范围。</p>
          )}
        </section>
      </main>
    </PortalShell>
  );
}
