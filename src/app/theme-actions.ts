"use server";

import { cookies } from "next/headers";

import { themeCookieOptions } from "./theme-cookie";

export type Theme = "light" | "dark" | "system";

export async function setThemeAction(formData: FormData) {
  const value = formData.get("theme");
  if (!isTheme(value)) return;
  (await cookies()).set(
    "q_nexus_theme",
    value,
    themeCookieOptions(process.env),
  );
}

function isTheme(value: FormDataEntryValue | null | undefined): value is Theme {
  return (
    typeof value === "string" && ["light", "dark", "system"].includes(value)
  );
}
