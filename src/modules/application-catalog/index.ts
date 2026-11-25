export interface PortalApplication {
  id: string;
  name: string;
  shortName: string;
  summary: string;
  category: string;
  version: string;
  owner: string;
  status: "available" | "maintenance";
  href: string;
  runtimeHref: string;
  templateHref?: string;
}

const applications: readonly PortalApplication[] = [
  {
    id: "bof-boxplot",
    name: "BOF 箱线图与散点图",
    shortName: "BOF",
    summary:
      "按 BinType 混合绘制 Bin 区间或 Spec 上下限；BinPlot 不完整自动降级，BinType 空白时一尺寸一图。",
    category: "质量分析",
    version: "V1.3",
    owner: "品质部",
    status: "available",
    href: "/apps/bof-boxplot",
    runtimeHref: "/apps/bof-boxplot/run",
    templateHref: "/apps/bof-boxplot/template",
  },
  {
    id: "cqe-yield-analysis",
    name: "CQE 测试线良率分析",
    shortName: "CQE",
    summary:
      "查看 AOI、Delta-T 与 Tester 良率趋势，支持日期、线体和测试项分析。",
    category: "良率分析",
    version: "V1.9.5",
    owner: "品质部",
    status: "available",
    href: "/apps/cqe-yield-analysis",
    runtimeHref: "/apps/cqe-yield-analysis/launch",
  },
  {
    id: "wuzhi-trace",
    name: "物资申领与消耗追溯",
    shortName: "物资追溯",
    summary:
      "支持采购两级审批、OA/行政请购来源分析、成员区域归属、到货签收、指定领用人分发、库存预警与台账导出。",
    category: "物资管理",
    version: "V1.2.3",
    owner: "品质部",
    status: "available",
    href: "/apps/wuzhi-trace",
    runtimeHref: "/apps/wuzhi-trace/launch",
  },
  {
    id: "ipqc-timeliness",
    name: "IPQC 时效看板",
    shortName: "IPQC 时效",
    summary: "跳转至 IPQC 时效看板，查看 IPQC 检验任务时效信息。",
    category: "时效管理",
    version: "外部看板",
    owner: "品质部",
    status: "available",
    href: "/apps/ipqc-timeliness/launch",
    runtimeHref: "/apps/ipqc-timeliness/launch",
  },
];

export function listApplications(): readonly PortalApplication[] {
  return applications;
}

export function getApplication(id: string): PortalApplication | undefined {
  return applications.find((application) => application.id === id);
}
