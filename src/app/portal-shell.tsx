import Link from "next/link";

import { logoutAction } from "./actions";
import styles from "./portal-shell.module.css";
import { StickyHeader } from "./sticky-header";
import { getCurrentSession } from "./session";
import { getSelectedTheme } from "./theme";
import { ThemeToggle } from "./theme-toggle";

const navigation = [
  { label: "首页", href: "/" },
  { label: "新人专区", href: "/onboarding" },
  { label: "品质知识", href: "/quality" },
  { label: "散热知识", href: "/thermal" },
  { label: "推荐书单", href: "/books" },
  { label: "模板中心", href: "/templates" },
] as const;

export async function PortalShell({
  currentPath,
  children,
}: {
  currentPath: string;
  children: React.ReactNode;
}) {
  const session = await getCurrentSession();
  const currentTheme = await getSelectedTheme();
  const canManage =
    session?.member.role === "editor" ||
    session?.member.role === "administrator";
  return (
    <>
      <a className={styles.skipLink} href="#main-content">
        跳到主要内容
      </a>
      <StickyHeader
        className={styles.siteHeader}
        compactClassName={styles.compactHeader}
      >
        <Link className={styles.brand} href="/">
          品集｜Q Nexus
        </Link>
        <nav className={styles.desktopNavigation} aria-label="主导航">
          <NavigationLinks currentPath={currentPath} />
        </nav>
        <div className={styles.tools}>
          {canManage ? (
            <Link className={styles.searchLink} href="/manage">
              管理
            </Link>
          ) : null}
          <Link className={styles.searchLink} href="/search">
            搜索
          </Link>
          <Link className={styles.searchLink} href="/favorites">
            收藏
          </Link>
          <ThemeToggle current={currentTheme} />
          <form action={logoutAction}>
            <button className={styles.textButton} type="submit">
              退出登录
            </button>
          </form>
        </div>
        <details className={styles.mobileNavigation} aria-label="移动端主导航">
          <summary aria-label="打开主导航">菜单</summary>
          <div className={styles.drawer}>
            <nav aria-label="移动端主导航链接">
              <NavigationLinks currentPath={currentPath} />
            </nav>
            <div className={styles.mobileTools}>
              {canManage ? (
                <Link className={styles.searchLink} href="/manage">
                  管理
                </Link>
              ) : null}
              <Link className={styles.searchLink} href="/search">
                搜索
              </Link>
              <Link className={styles.searchLink} href="/favorites">
                收藏
              </Link>
              <ThemeToggle current={currentTheme} />
              <form action={logoutAction}>
                <button className={styles.textButton} type="submit">
                  退出登录
                </button>
              </form>
            </div>
          </div>
        </details>
      </StickyHeader>
      {children}
    </>
  );
}

function NavigationLinks({ currentPath }: { currentPath: string }) {
  return navigation.map(({ label, href }) => (
    <Link
      aria-current={currentPath === href ? "page" : undefined}
      href={href}
      key={href}
    >
      {label}
    </Link>
  ));
}
