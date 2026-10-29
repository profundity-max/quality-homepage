import Link from "next/link";
import { Menu } from "lucide-react";
import { QuickSearch } from "@/ui/search/quick-search";
import { AdminShell } from "./manage/admin-shell";

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
  { label: "应用中心", href: "/apps" },
] as const;

export async function PortalShell({
  currentPath,
  children,
  designSystem = "editorial",
}: {
  currentPath: string;
  children: React.ReactNode;
  designSystem?: "editorial";
}) {
  const session = await getCurrentSession();
  const currentTheme = await getSelectedTheme();
  const canManage =
    session?.member.role === "editor" ||
    session?.member.role === "administrator";
  if (currentPath.startsWith("/manage") && canManage && session) {
    return (
      <AdminShell
        currentPath={currentPath}
        name={session.member.displayName || session.member.username}
        administrator={session.member.role === "administrator"}
        theme={currentTheme}
      >
        {children}
      </AdminShell>
    );
  }
  return (
    <div
      data-design-system={designSystem}
      className={designSystem ? styles.editorial : undefined}
    >
      <a className={styles.skipLink} href="#main-content">
        跳到主要内容
      </a>
      <StickyHeader
        className={styles.siteHeader}
        compactClassName={styles.compactHeader}
        shrink={!designSystem}
      >
        <Link className={styles.brand} href="/" aria-label="品集｜Q Nexus">
          <span>品集｜Q Nexus</span>
          <small>Better quality</small>
        </Link>
        <nav className={styles.desktopNavigation} aria-label="主导航">
          <NavigationLinks currentPath={currentPath} />
        </nav>
        <div className={styles.quickSearch}>
          <QuickSearch compact />
        </div>
        <div className={styles.tools}>
          {canManage ? (
            <Link className={styles.searchLink} href="/manage">
              管理
            </Link>
          ) : null}
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
          <summary aria-label="打开主导航">
            <Menu size={20} aria-hidden="true" />
            菜单
          </summary>
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
    </div>
  );
}

function NavigationLinks({ currentPath }: { currentPath: string }) {
  return navigation.map(({ label, href }) => (
    <Link
      aria-current={
        currentPath === href ||
        (href !== "/" && currentPath.startsWith(`${href}/`))
          ? "page"
          : undefined
      }
      href={href}
      key={href}
    >
      {label}
    </Link>
  ));
}
