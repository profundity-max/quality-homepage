import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Download,
  FileSpreadsheet,
  ShieldCheck,
} from "lucide-react";
import { notFound } from "next/navigation";

import { getApplication } from "@/modules/application-catalog";

import { requirePortalSession } from "../../authorization";
import { PortalShell } from "../../portal-shell";
import styles from "./bof-boxplot.module.css";

const workbookSheets = [
  {
    name: "Data",
    purpose: "每行一个 SN，并包含 Spec 中定义的全部尺寸列。",
    required: "No、SN、尺寸列",
  },
  {
    name: "Spec",
    purpose: "定义每个尺寸所属的 BinType、USL 和 LSL。",
    required: "BinType、FAI#、USL、LSL",
  },
  {
    name: "HL SN",
    purpose: "列出需要突出显示的 SN，对应记录必须存在于 Data。",
    required: "SN",
  },
];

export default async function BofApplicationPage() {
  await requirePortalSession("/apps/bof-boxplot");
  const application = getApplication("bof-boxplot");
  if (!application) notFound();

  return (
    <PortalShell currentPath="/apps">
      <main id="main-content" tabIndex={-1} className={styles.layout}>
        <Link className={styles.backLink} href="/apps">
          <ArrowLeft size={16} aria-hidden="true" />
          返回应用中心
        </Link>

        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>
              {application.category} · {application.version}
            </p>
            <h1>{application.name}</h1>
            <p className={styles.lead}>{application.summary}</p>
            <p className={styles.privacy}>
              <ShieldCheck size={17} aria-hidden="true" />
              工作簿只在当前浏览器本地读取和处理，不会上传到服务器。
            </p>
          </div>
          <div className={styles.actions}>
            <Link
              className={styles.primaryAction}
              href={application.runtimeHref}
              target="_blank"
              rel="noreferrer"
            >
              打开工具
              <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
            <a
              className={styles.secondaryAction}
              href={application.templateHref}
            >
              <Download size={17} aria-hidden="true" />
              下载案例工作簿
            </a>
            <small>将在新窗口打开工具；案例下载需保持品集登录。</small>
          </div>
        </header>

        <section className={styles.facts} aria-label="工具概况">
          <div>
            <span>输入</span>
            <strong>1 份 XLSX 工作簿</strong>
          </div>
          <div>
            <span>分析方式</span>
            <strong>按 BinType 自动分组</strong>
          </div>
          <div>
            <span>输出</span>
            <strong>箱线图、散点图、PNG</strong>
          </div>
        </section>

        <div className={styles.contentGrid}>
          <section className={styles.guide} aria-labelledby="usage-title">
            <div className={styles.sectionHeading}>
              <p>使用说明</p>
              <h2 id="usage-title">四步完成分析</h2>
            </div>
            <ol>
              <li>
                <span>01</span>
                <div>
                  <h3>下载案例工作簿</h3>
                  <p>
                    参考案例中的工作表、列名、Spec 上下限和 Highlight SN
                    写法，替换为本次数据。
                  </p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <h3>检查工作簿结构</h3>
                  <p>
                    必须包含 Data、Spec、HL SN 三个工作表；BinPlot
                    可选，不使用分 Bin 时可直接省略。
                  </p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <h3>打开工具并选择文件</h3>
                  <p>
                    工具会先检查缺表、重复 SN
                    和无效尺寸值。存在阻断错误时不会生成图表。
                  </p>
                </div>
              </li>
              <li>
                <span>04</span>
                <div>
                  <h3>核对并下载图表</h3>
                  <p>
                    核对摘要、Spec 上下限、HL 标记和统计表后，可分别下载单图
                    PNG。
                  </p>
                </div>
              </li>
            </ol>
          </section>

          <aside className={styles.sampleCard} aria-labelledby="sample-title">
            <FileSpreadsheet size={26} aria-hidden="true" />
            <p className={styles.eyebrow}>Sample workbook</p>
            <h2 id="sample-title">案例数据包含什么</h2>
            <ul>
              <li>2 个 BinType</li>
              <li>4 个尺寸与完整 Spec</li>
              <li>8 个 SN，包含超 Spec 数据</li>
              <li>2 个 Highlight SN</li>
            </ul>
            <a href={application.templateHref}>
              <Download size={16} aria-hidden="true" />
              下载 XLSX 案例
            </a>
          </aside>
        </div>

        <section className={styles.requirements} aria-labelledby="sheets-title">
          <div className={styles.sectionHeading}>
            <p>输入结构</p>
            <h2 id="sheets-title">工作簿工作表要求</h2>
          </div>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th scope="col">工作表</th>
                  <th scope="col">用途</th>
                  <th scope="col">必需字段</th>
                </tr>
              </thead>
              <tbody>
                {workbookSheets.map((sheet) => (
                  <tr key={sheet.name}>
                    <th scope="row">{sheet.name}</th>
                    <td>{sheet.purpose}</td>
                    <td>{sheet.required}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.note}>
            本案例工作簿不包含 BinPlot，图表只显示每个尺寸的 USL/LSL。已有
            BinPlot 的工作簿仍可继续使用，并按原规则显示 Bin 色带和边界。
          </p>
        </section>
      </main>
    </PortalShell>
  );
}
