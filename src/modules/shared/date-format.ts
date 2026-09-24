/**
 * 面向用户的日期展示：统一按部门所在时区（上海）渲染。
 *
 * 服务器容器运行在 UTC，页面若直接用 `Intl.DateTimeFormat("zh-CN", …)`
 * 不带 timeZone，会把 UTC 时间当成本地时间显示（例如备份时间少 8 小时）。
 * 所有页面都必须经由这里格式化，不要再各自 new Intl.DateTimeFormat。
 */

export const displayTimeZone = "Asia/Shanghai";

const placeholder = "—";

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: displayTimeZone,
  year: "numeric",
  month: "short",
  day: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: displayTimeZone,
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const shortDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: displayTimeZone,
  month: "short",
  day: "numeric",
});

function format(
  formatter: Intl.DateTimeFormat,
  value: Date | null | undefined,
): string {
  if (!value) return placeholder;
  return formatter.format(value);
}

/** 2026年9月24日 */
export function formatDate(value: Date | null | undefined): string {
  return format(dateFormatter, value);
}

/** 2026年9月24日 10:40 */
export function formatDateTime(value: Date | null | undefined): string {
  return format(dateTimeFormatter, value);
}

/** 9月24日 */
export function formatShortDate(value: Date | null | undefined): string {
  return format(shortDateFormatter, value);
}
