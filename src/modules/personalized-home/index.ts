const sections = [
  { title: "新人学习", href: "/onboarding" },
  { title: "常用模板", href: "/templates" },
  { title: "品质知识", href: "/quality" },
  { title: "散热知识", href: "/thermal" },
  { title: "最近更新", href: "/updates" },
  { title: "推荐书籍", href: "/books" },
] as const;

export function createPersonalizedHome({
  instant,
  username,
  displayName,
}: {
  instant: Date;
  username: string;
  displayName: string | null;
}) {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Shanghai",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(instant),
  );

  return {
    greeting:
      hour >= 5 && hour < 12
        ? "早上好"
        : hour >= 12 && hour < 18
          ? "下午好"
          : "晚上好",
    name: displayName?.trim() || username,
    belief: "数据驱动 · 结果闭环",
    sections,
  } as const;
}
