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
      "按 BinType 自动生成箱线图与散点图；可仅按 Spec 上下限分析，无需填写分 Bin 数据。",
    category: "质量分析",
    version: "V1.2",
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
];

export function listApplications(): readonly PortalApplication[] {
  return applications;
}

export function getApplication(id: string): PortalApplication | undefined {
  return applications.find((application) => application.id === id);
}
