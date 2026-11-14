import type { Metadata } from "next";
import FuDrill from "@/components/mahjong/FuDrill";

export const metadata: Metadata = {
  title: "符計算ドリル | 学生麻雀 練習卓",
  description: "ランダムな和了形で符と点数を答える練習",
};

export default function FuPage() {
  return <FuDrill />;
}
