import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Boxes,
  ClipboardList,
  LockKeyhole,
  PackageCheck,
  ShieldCheck,
} from "lucide-react";
import { notFound } from "next/navigation";

import { getApplication } from "@/modules/application-catalog";

import { requirePortalSession } from "../../authorization";
import { PortalShell } from "../../portal-shell";
import styles from "./wuzhi-trace.module.css";

export default async function WuzhiTracePage({
  searchParams,
}: {
  searchParams?: Promise<{ access?: string | string[] }>;
}) {
  await requirePortalSession("/apps/wuzhi-trace");
  const application = getApplication("wuzhi-trace");
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
            访问授权已失效，请从本页重新打开物资追溯系统。
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
              业务数据只对已登录品集成员开放，入口授权 2 小时后自动失效。
            </p>
          </div>
          <div className={styles.actions}>
            <Link
              className={styles.primaryAction}
              href={application.runtimeHref}
              target="_blank"
              rel="noreferrer"
            >
              打开物资追溯系统
              <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
            <small>
              将在新窗口打开。身份由品集自动传递，不需要在应用内再次登录。
            </small>
          </div>
        </header>

        <section className={styles.facts} aria-label="物资追溯系统概况">
          <div>
            <Boxes size={20} aria-hidden="true" />
            <span>业务主线</span>
            <strong>采购 → 审核 → 核准 → 到货 → 领用</strong>
          </div>
          <div>
            <PackageCheck size={20} aria-hidden="true" />
            <span>库存口径</span>
            <strong>按已签收与已分发数量计算</strong>
          </div>
          <div>
            <LockKeyhole size={20} aria-hidden="true" />
            <span>入口方式</span>
            <strong>品集身份免登录</strong>
          </div>
        </section>

        <div className={styles.contentGrid}>
          <section className={styles.guide} aria-labelledby="usage-title">
            <p className={styles.sectionLabel}>业务说明</p>
            <h2 id="usage-title">核心流程</h2>
            <ol>
              <li>
                <span>01</span>
                <div>
                  <h3>提交采购并完成两级审批</h3>
                  <p>
                    申请人提交采购后进入待审核；审核员完成一级审核，核准员完成最终核准。
                  </p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <h3>核准后到货并形成可用库存</h3>
                  <p>
                    只有已核准采购才能登记到货；每个到货批次只允许签收一次，未签收批次不能分发。
                  </p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <h3>指定领用人并确认领用</h3>
                  <p>
                    分发时必须指定区域领用人；区域领用人可确认本区域单据，隶属区域领用人只能确认分配给本人的单据。
                  </p>
                </div>
              </li>
              <li>
                <span>04</span>
                <div>
                  <h3>查看库存预警与导出台账</h3>
                  <p>
                    仪表盘按近 30 天领用速度估算可用天数，支持月度汇总、Excel 和
                    CSV 导出。
                  </p>
                </div>
              </li>
            </ol>
          </section>

          <aside
            className={styles.securityCard}
            aria-labelledby="security-title"
          >
            <ClipboardList size={26} aria-hidden="true" />
            <p className={styles.sectionLabel}>Traceability</p>
            <h2 id="security-title">可追溯边界</h2>
            <p>
              每次新增、修改、删除和整库恢复都会写入服务端审计日志，随品集加密备份一同保存。
            </p>
            <ul>
              <li>审核员执行一级审核，核准员执行最终核准</li>
              <li>区域领用人确认本区域分配单</li>
              <li>隶属区域领用人只确认分配给本人的单据</li>
              <li>成员名单仅系统管理员武欣雨维护</li>
              <li>直接访问应用地址会被网关拒绝</li>
            </ul>
          </aside>
        </div>

        <section className={styles.maintenance}>
          <p className={styles.sectionLabel}>数据与运维</p>
          <h2>统一登录、统一备份、统一回溯</h2>
          <p>
            应用数据保存在品集受控数据目录，由品集加密备份流程一并打包。版本升级遵循
            品集发布规范，保留代码提交、版本标签、变更说明和线上验收记录。
          </p>
        </section>
      </main>
    </PortalShell>
  );
}
