import Link from "next/link";
import {
  FileText,
  Folder,
  Route,
  Files,
  BookOpen,
  MessageSquare,
  Users,
  ChartNoAxesColumn,
  Archive,
  Download,
  Upload,
  Database,
  ScrollText,
  ArrowLeft,
} from "lucide-react";
import type { ReactNode } from "react";
import { logoutAction } from "../actions";
import { ThemeToggle } from "../theme-toggle";
import type { getSelectedTheme } from "../theme";
import styles from "./admin-shell.module.css";

const groups = [
  {
    title: "内容管理",
    items: [
      { href: "/manage/articles", label: "文章管理", icon: FileText },
      { href: "/manage/columns", label: "栏目与主题管理", icon: Folder },
      { href: "/manage/onboarding", label: "新人路线管理", icon: Route },
      { href: "/manage/templates", label: "模板管理", icon: Files },
      { href: "/manage/books", label: "书单管理", icon: BookOpen },
      { href: "/manage/feedback", label: "内容反馈处理", icon: MessageSquare },
    ],
  },
  {
    title: "人员与统计",
    admin: true,
    items: [
      { href: "/manage", label: "账户管理", icon: Users },
      { href: "/manage/stats", label: "学习统计", icon: ChartNoAxesColumn },
    ],
  },
  {
    title: "系统维护",
    items: [
      { href: "/manage/import", label: "内容导入", icon: Upload },
      {
        href: "/manage/export",
        label: "内容导出",
        icon: Download,
        admin: true,
      },
      {
        href: "/manage/recycle-bin",
        label: "回收站",
        icon: Archive,
        admin: true,
      },
      {
        href: "/manage/backups",
        label: "备份与恢复",
        icon: Database,
        admin: true,
      },
      {
        href: "/manage/audit",
        label: "审计日志",
        icon: ScrollText,
        admin: true,
      },
    ],
  },
];
export function AdminShell({
  currentPath,
  name,
  administrator,
  theme,
  children,
}: {
  currentPath: string;
  name: string;
  administrator: boolean;
  theme: Awaited<ReturnType<typeof getSelectedTheme>>;
  children: ReactNode;
}) {
  const active = (href: string) =>
    href === "/manage" ? currentPath === href : currentPath.startsWith(href);
  const title =
    groups.flatMap((g) => g.items).find((i) => active(i.href))?.label ??
    "门户管理";
  const navigation = (
    <nav aria-label="后台导航">
      {groups
        .filter((g) => !g.admin || administrator)
        .map((g) => (
          <section key={g.title} className={styles.group}>
            <h2>{g.title}</h2>
            {g.items
              .filter((i) => !("admin" in i && i.admin) || administrator)
              .map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  aria-current={active(href) ? "page" : undefined}
                >
                  <Icon size={19} aria-hidden="true" />
                  {label}
                </Link>
              ))}
          </section>
        ))}
    </nav>
  );
  return (
    <div className={styles.shell}>
      <a className={styles.skip} href="#main-content">
        跳到主要内容
      </a>
      <aside className={styles.sidebar}>
        <Link className={styles.brand} href="/">
          品集｜Q Nexus
        </Link>
        <div className={styles.navigation}>{navigation}</div>
        <Link className={styles.returnLink} href="/">
          <ArrowLeft size={19} aria-hidden="true" />
          返回门户
        </Link>
      </aside>
      <div
        className={`${styles.workspace} ${currentPath.endsWith("/edit") || currentPath === "/manage/articles/new" ? styles.editorWorkspace : ""}`}
      >
        <header className={styles.topbar}>
          <div className={styles.breadcrumb}>
            <span>门户管理</span>
            <span aria-hidden="true">/</span>
            <span>{title}</span>
          </div>
          <div className={styles.tools}>
            <span className={styles.identity}>
              {name}
              <small>{administrator ? "管理员" : "编辑者"}</small>
            </span>
            <ThemeToggle current={theme} />
            <form action={logoutAction}>
              <button type="submit">退出登录</button>
            </form>
          </div>
        </header>
        <details key={currentPath} className={styles.mobileNav}>
          <summary>后台导航</summary>
          {navigation}
          <Link href="/">返回门户</Link>
        </details>
        {children}
        <footer className={styles.footer}>品集｜Q Nexus · 门户管理</footer>
      </div>
    </div>
  );
}
