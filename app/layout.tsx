import type { Metadata } from "next";
import "./globals.css";
import AssetPreloader from "./components/AssetPreloader";
import { Analytics } from '@vercel/analytics/next';

export const metadata: Metadata = {
  title: "오늘의 탐정",
  description: "10분의 미스터리, 당신의 추리력을 시험하세요.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="font-serif bg-gray-950 text-gray-100 antialiased">
        <AssetPreloader />
        {children}
        <Analytics />
      </body>
    </html>
  );
}