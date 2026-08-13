import type { Metadata } from "next";

import "../styles/tokens.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "品集｜Q Nexus",
  description: "品质部门户",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
