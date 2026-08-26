// 작성자 : 박현일
// 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
//
// Author: Hyunil Park
// Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).

import type { Metadata } from "next";
import "./globals.css";
import AssetPreloader from "./components/AssetPreloader";

export const metadata: Metadata = {
  title: "오늘의 탐정",
  description: "10분의 미스터리, 당신의 추리력을 시험하세요.",
};

/*
 * 폰트를 next/font/google 대신 Google Fonts CSS API의 <link>로 불러온다.
 *
 * next/font는 지정한 subset을 **빌드 시점에 전부 내려받아 자체 호스팅**한다.
 * 한글 subset은 웨이트당 1MB를 넘어서, 세 폰트에 여러 웨이트면 수 MB가 된다.
 * CSS API는 같은 폰트를 unicode-range로 100여 조각으로 쪼개 서빙하므로
 * **실제로 화면에 나온 글자 범위만** 내려온다 — 한글에서는 이쪽이 압도적으로 가볍다.
 *
 * 대가는 런타임 외부 요청 두 곳(googleapis·gstatic)이다. preconnect로 왕복을 줄인다.
 * display=swap이라 폰트가 늦거나 실패해도 폴백 세리프로 글은 읽힌다.
 */
const GOOGLE_FONTS =
  "https://fonts.googleapis.com/css2" +
  "?family=Cutive+Mono" +
  "&family=Hahmlet:wght@300..700" +
  "&family=Nanum+Myeongjo:wght@400;700;800" +
  "&display=swap";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={GOOGLE_FONTS} />
      </head>
      <body className="font-record bg-desk text-gray-100 antialiased">
        <AssetPreloader />
        {children}
      </body>
    </html>
  );
}
