import { setThemeAction } from "./theme-actions";
import styles from "./theme.module.css";

// 单一按钮在浅色/深色之间切换；不提供“跟随系统”选项。
export function ThemeToggle({
  current,
}: {
  current: "light" | "dark" | "system";
}) {
  // 服务端只区分显式深浅；"system" 按浅色展示（默认外观）。
  const dark = current === "dark";
  const target = dark ? "light" : "dark";

  return (
    <form action={setThemeAction} className={styles.control}>
      <input type="hidden" name="theme" value={target} />
      <button type="submit" aria-label={`切换到${dark ? "浅色" : "深色"}模式`}>
        {dark ? "浅色" : "深色"}
      </button>
    </form>
  );
}
