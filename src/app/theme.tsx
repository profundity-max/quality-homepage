import { cookies } from "next/headers";

import styles from "./theme.module.css";
import { themeCookieOptions } from "./theme-cookie";

export type Theme = "light" | "dark" | "system";

export async function getSelectedTheme(): Promise<Theme> {
  const value = (await cookies()).get("q_nexus_theme")?.value;
  return isTheme(value) ? value : "system";
}

export async function setThemeAction(formData: FormData) {
  "use server";
  const value = formData.get("theme");
  if (!isTheme(value)) return;
  (await cookies()).set(
    "q_nexus_theme",
    value,
    themeCookieOptions(process.env),
  );
}

export function ThemeControl({ current }: { current: Theme }) {
  return (
    <form action={setThemeAction} className={styles.control}>
      <label>
        <span>主题</span>
        <select name="theme" defaultValue={current}>
          <option value="light">浅色</option>
          <option value="dark">深色</option>
          <option value="system">跟随系统</option>
        </select>
      </label>
      <button type="submit">应用主题</button>
    </form>
  );
}

function isTheme(value: FormDataEntryValue | null | undefined): value is Theme {
  return (
    typeof value === "string" && ["light", "dark", "system"].includes(value)
  );
}
