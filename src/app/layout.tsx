import type { Metadata } from "next";

import "../styles/tokens.css";
import "./globals.css";
import { getSelectedTheme } from "./theme";

export const metadata: Metadata = {
  title: "品集｜Q Nexus",
  description: "品质部门户",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const theme = await getSelectedTheme();
  return (
    <html lang="zh-CN" data-theme={theme}>
      <body>{children}</body>
    </html>
  );
}
