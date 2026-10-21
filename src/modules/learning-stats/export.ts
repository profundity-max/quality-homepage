import { zipFiles } from "@/modules/markdown-package";
import { formatDateTime, formatIsoDate } from "@/modules/shared/date-format";
import type { LearningReport } from "./types";

function xml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** All text uses inline strings; user-controlled values can never become formulas. */
export function buildPeopleWorkbook(report: LearningReport): Buffer {
  const metric = (value: number | null) => value ?? "未采集";
  const timestamp = (value: Date | null) =>
    value ? formatDateTime(value) : "—";
  const rows: (string | number)[][] = [
    ["品集｜Q Nexus · 人员学习汇总"],
    ["统计周期（上海）", report.range.from, report.range.to],
    [
      "有效阅读与时长采集起点",
      report.collectedSince
        ? `${formatIsoDate(report.collectedSince)} · ${timestamp(report.collectedSince)}`
        : "未采集",
    ],
    [
      "口径",
      "有效阅读满30秒；活跃时长暂停隐藏、失焦和闲置；仅辅助培养与评优，不代表学习成效；收藏为当前数量。",
    ],
    [
      "账号",
      "姓名",
      "状态",
      "访问次数",
      "有效阅读次数",
      "有效阅读篇数",
      "活跃阅读秒数",
      "活跃天数",
      "下载次数",
      "不同模板数",
      "当前收藏数",
      "成功登录次数",
      "最近登录",
      "最近活跃",
    ],
    ...report.people.map((person) => [
      person.username,
      person.name,
      person.disabled ? "已停用" : "正常",
      person.visits,
      metric(person.effectiveReads),
      metric(person.effectiveArticles),
      metric(person.activeSeconds),
      person.activeDays,
      person.downloads,
      person.distinctTemplates,
      person.favorites,
      person.logins,
      timestamp(person.lastLoginAt),
      timestamp(person.lastActiveAt),
    ]),
  ];
  const sheetData = rows
    .map(
      (row, index) =>
        `<row r="${index + 1}">${row
          .map((value) =>
            typeof value === "number"
              ? `<c><v>${value}</v></c>`
              : `<c t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`,
          )
          .join("")}</row>`,
    )
    .join("");
  const files: Record<string, string> = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="人员学习汇总" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="5" topLeftCell="A6" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="3" width="22" customWidth="1"/><col min="4" max="12" width="18" customWidth="1"/><col min="13" max="14" width="24" customWidth="1"/></cols><sheetData>${sheetData}</sheetData><autoFilter ref="A5:N${rows.length}"/></worksheet>`,
  };
  return zipFiles(
    Object.entries(files).map(([path, content]) => ({
      path,
      content: Buffer.from(content),
    })),
  );
}
