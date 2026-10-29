import { formatIsoDate } from "@/modules/shared/date-format";

type ReadingMember = {
  displayName: string | null;
  username: string;
  role: "reader" | "editor" | "administrator";
};

export function createArticleProtection(
  member: ReadingMember,
  now = new Date(),
) {
  const name = member.displayName?.trim() || member.username;
  return {
    watermark: `天脉品集 Q-Nexus · 内部资料 · ${name}（${member.username}）· ${formatIsoDate(now)}`,
    restrict: true,
  };
}

function escapeXml(value: string) {
  return value.replace(
    /[<>&"']/g,
    (character) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[character]!,
  );
}

/** Pango文字输入用于服务端栅格水印，不依赖会被Next图片优化器禁用的SVG解码。 */
export function watermarkText(label: string) {
  const prefix = "天脉品集 Q-Nexus · 内部资料";
  const identity = label.slice(prefix.length + 3);
  return `<span foreground="#334155" alpha="11796">${escapeXml(prefix)}\n${escapeXml(identity)}</span>`;
}

/** 身份水印只含可见会话资料；SVG 作为图片背景，身份文本必须转义。 */
export function watermarkSvg(
  label: string,
  theme: "light" | "dark",
  opacity = 0.1,
) {
  const prefix = "天脉品集 Q-Nexus · 内部资料";
  const identity = label.slice(prefix.length + 3);
  const color = theme === "dark" ? "#d8e3ee" : "#334155";
  const fit =
    identity.length > 30
      ? ' textLength="290" lengthAdjust="spacingAndGlyphs"'
      : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><g transform="rotate(-22 160 90)" fill="${color}" fill-opacity="${opacity}" font-family="Arial, sans-serif" font-size="12" text-anchor="middle" ><text x="160" y="82">${escapeXml(prefix)}</text><text x="160" y="104"${fit}>${escapeXml(identity)}</text></g></svg>`;
  return svg;
}

export function watermarkImage(label: string, theme: "light" | "dark") {
  return `url("data:image/svg+xml,${encodeURIComponent(watermarkSvg(label, theme))}")`;
}
