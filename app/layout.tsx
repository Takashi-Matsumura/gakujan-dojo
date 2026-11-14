import type { Metadata } from "next";
import { Noto_Sans_JP, Noto_Serif_JP } from "next/font/google";
import "./globals.css";

const sans = Noto_Sans_JP({
  variable: "--font-ui",
  weight: ["400", "700"],
  preload: false,
});

// 牌の文字（萬子・字牌）用
const tileFont = Noto_Serif_JP({
  variable: "--font-tile",
  weight: ["700", "900"],
  preload: false,
});

export const metadata: Metadata = {
  title: "学生麻雀 練習卓",
  description: "学生麻雀連盟ルールで麻雀を学べる練習用 Web ゲーム",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${sans.variable} ${tileFont.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
