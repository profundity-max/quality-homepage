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
  templateHref: string;
}

const applications: readonly PortalApplication[] = [
  {
    id: "bof-boxplot",
    name: "BOF 箱线图与散点图",
    shortName: "BOF",
    summary:
      "按 BinType 自动生成箱线图与散点图，快速查看 Spec、Bin 区间和 Highlight SN。",
    category: "质量分析",
    version: "V1.1",
    owner: "品质部",
    status: "available",
    href: "/apps/bof-boxplot",
    runtimeHref: "/apps/bof-boxplot/run",
    templateHref: "/apps/bof-boxplot/template",
  },
];

export function listApplications(): readonly PortalApplication[] {
  return applications;
}

export function getApplication(id: string): PortalApplication | undefined {
  return applications.find((application) => application.id === id);
}
