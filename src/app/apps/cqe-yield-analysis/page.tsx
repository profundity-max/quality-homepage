import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  ChartNoAxesCombined,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { notFound } from "next/navigation";

import { getApplication } from "@/modules/application-catalog";

import { requirePortalSession } from "../../authorization";
import { PortalShell } from "../../portal-shell";
import styles from "./cqe-yield-analysis.module.css";

export default async function CqeYieldAnalysisPage({
  searchParams,
}: {
  searchParams?: Promise<{ access?: string | string[] }>;
}) {
  await requirePortalSession("/apps/cqe-yield-analysis");
  const application = getApplication("cqe-yield-analysis");
  if (!application) notFound();
  const params = await searchParams;
  const accessExpired = params?.access === "expired";

  return (
    <PortalShell currentPath="/apps">
      <main id="main-content" tabIndex={-1} className={styles.layout}>
        <Link className={styles.backLink} href="/apps">
          <ArrowLeft size={16} aria-hidden="true" />
          返回应用中心
        </Link>

        {accessExpired ? (
          <div className={styles.alert} role="alert">
            <AlertTriangle size={18} aria-hidden="true" />
            访问授权已失效，请从本页重新打开良率分析网站。
          </div>
        ) : null}

        <header className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>
              {application.category} · {application.version}
            </p>
            <h1>{application.name}</h1>
            <p className={styles.lead}>{application.summary}</p>
            <p className={styles.privacy}>
              <ShieldCheck size={17} aria-hidden="true" />
              只有通过品集签发的短期授权才能进入原良率分析网站。
            </p>
          </div>
          <div className={styles.actions}>
            <Link
              className={styles.primaryAction}
              href={application.runtimeHref}
              target="_blank"
              rel="noreferrer"
            >
              打开良率分析网站
              <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
            <small>
              将在新窗口打开。授权有效期 2 小时，失效后重新从品集进入。
            </small>
          </div>
        </header>

        <section className={styles.facts} aria-label="良率分析网站概况">
          <div>
            <ChartNoAxesCombined size={20} aria-hidden="true" />
            <span>分析内容</span>
            <strong>AOI、Delta-T、Tester 良率</strong>
          </div>
          <div>
            <ShieldCheck size={20} aria-hidden="true" />
            <span>入口方式</span>
            <strong>仅限品集应用卡片跳转</strong>
          </div>
          <div>
            <LockKeyhole size={20} aria-hidden="true" />
            <span>原站账号</span>
            <strong>继续使用原良率网站账号</strong>
          </div>
        </section>

        <div className={styles.contentGrid}>
          <section className={styles.guide} aria-labelledby="usage-title">
            <p className={styles.sectionLabel}>访问说明</p>
            <h2 id="usage-title">使用流程</h2>
            <ol>
              <li>
                <span>01</span>
                <div>
                  <h3>确认品集登录状态</h3>
                  <p>未登录或密码待修改时，系统会先返回品集登录流程。</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <h3>点击打开良率分析网站</h3>
                  <p>
                    品集生成短期签名授权，原站网关校验通过后才会放行页面与接口。
                  </p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <h3>使用原站账号登录</h3>
                  <p>
                    数据权限和账号体系仍由原良率分析网站维护，品集不保存其分析数据。
                  </p>
                </div>
              </li>
            </ol>
          </section>

          <aside
            className={styles.securityCard}
            aria-labelledby="security-title"
          >
            <LockKeyhole size={26} aria-hidden="true" />
            <p className={styles.sectionLabel}>Access boundary</p>
            <h2 id="security-title">禁止直接访问</h2>
            <p>
              直接打开原站
              IP、端口、书签或分享链接时，网关会拒绝并返回品集应用页。
            </p>
            <ul>
              <li>授权与品集登录用户绑定</li>
              <li>签名令牌不可由浏览器伪造</li>
              <li>授权过期后必须重新从品集进入</li>
            </ul>
          </aside>
        </div>

        <section
          className={styles.maintenance}
          aria-labelledby="maintenance-title"
        >
          <p className={styles.sectionLabel}>维护边界</p>
          <h2 id="maintenance-title">网站功能仍在原区域维护</h2>
          <p>
            AOI、Delta-T、Tester 分析逻辑、数据导入和原站账号继续由“CQE
            测试线良率分析网站”原对话维护。品集只负责统一入口、访问授权和跳转。
          </p>
        </section>
      </main>
    </PortalShell>
  );
}
