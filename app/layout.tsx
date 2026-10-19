import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "赛事簿 · 设计艺术赛事工作台",
  description: "学校竞赛目录与官方来源驱动的设计艺术赛事工作台。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
