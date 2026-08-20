import { cookies } from "next/headers";

export type Theme = "light" | "dark" | "system";

export async function getSelectedTheme(): Promise<Theme> {
  const value = (await cookies()).get("q_nexus_theme")?.value;
  return isTheme(value) ? value : "system";
}

function isTheme(value: FormDataEntryValue | null | undefined): value is Theme {
  return (
    typeof value === "string" && ["light", "dark", "system"].includes(value)
  );
}
