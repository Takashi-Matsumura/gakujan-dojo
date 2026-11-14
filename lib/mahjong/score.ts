/**
 * 点数計算（翻・符 → 支払い）と、終局時の順位点精算。
 */
import type { RuleConfig } from "./rules";

export type LimitName =
  | ""
  | "満貫"
  | "跳満"
  | "倍満"
  | "三倍満"
  | "役満"
  | "ダブル役満"
  | "トリプル役満";

export interface Payment {
  /** ロン時の放銃者支払い */
  ron?: number;
  /** ツモ時: 親の支払い（和了者が子のとき） */
  tsumoFromDealer?: number;
  /** ツモ時: 子1人あたりの支払い（和了者が親なら全員この額） */
  tsumoFromChild?: number;
  /** 和了者の受け取り合計（本場込み、供託は含まない） */
  total: number;
  basePoints: number;
  limit: LimitName;
}

const ceil100 = (n: number) => Math.ceil(n / 100) * 100;

export function basePoints(
  han: number,
  fu: number,
  yakuman: number,
  rules: Pick<RuleConfig, "kiriageMangan" | "kazoeYakuman">,
): { base: number; limit: LimitName } {
  if (yakuman > 0) {
    const limit: LimitName =
      yakuman === 1 ? "役満" : yakuman === 2 ? "ダブル役満" : "トリプル役満";
    return { base: 8000 * yakuman, limit };
  }
  if (han >= 13 && rules.kazoeYakuman) return { base: 8000, limit: "役満" };
  if (han >= 11) return { base: 6000, limit: "三倍満" };
  if (han >= 8) return { base: 4000, limit: "倍満" };
  if (han >= 6) return { base: 3000, limit: "跳満" };
  if (han >= 5) return { base: 2000, limit: "満貫" };
  const raw = fu * 2 ** (han + 2);
  if (raw >= 2000) return { base: 2000, limit: "満貫" };
  if (
    rules.kiriageMangan &&
    ((han === 4 && fu === 30) || (han === 3 && fu === 60))
  )
    return { base: 2000, limit: "満貫" };
  return { base: raw, limit: "" };
}

export function calcPayment(opts: {
  han: number;
  fu: number;
  yakuman: number;
  isDealer: boolean;
  isTsumo: boolean;
  honba: number;
  rules: Pick<RuleConfig, "kiriageMangan" | "kazoeYakuman" | "honbaPoints">;
}): Payment {
  const { han, fu, yakuman, isDealer, isTsumo, honba, rules } = opts;
  const { base, limit } = basePoints(han, fu, yakuman, rules);
  const honbaEach = rules.honbaPoints / 3;
  if (!isTsumo) {
    const ron = ceil100(base * (isDealer ? 6 : 4)) + rules.honbaPoints * honba;
    return { ron, total: ron, basePoints: base, limit };
  }
  if (isDealer) {
    const each = ceil100(base * 2) + honbaEach * honba;
    return { tsumoFromChild: each, total: each * 3, basePoints: base, limit };
  }
  const fromDealer = ceil100(base * 2) + honbaEach * honba;
  const fromChild = ceil100(base) + honbaEach * honba;
  return {
    tsumoFromDealer: fromDealer,
    tsumoFromChild: fromChild,
    total: fromDealer + fromChild * 2,
    basePoints: base,
    limit,
  };
}

// ---------------------------------------------------------------- 精算

export interface Standing {
  seat: number;
  score: number;
  rank: number;
  /** 素点ポイント + 順位点 + オカ（小数第1位まで） */
  points: number;
}

/**
 * 終局時の精算。同点は順位点・オカを等分し、割り切れない端数は
 * 起家（seat 0）に近い方が多く取る（学雀連規定）。
 * scores は seat 0（起家）から順の最終持ち点。
 */
export function settle(
  scores: readonly number[],
  rules: Pick<RuleConfig, "uma" | "returnPoints" | "startingPoints" | "okaToTop">,
): Standing[] {
  const n = scores.length;
  const oka = ((rules.returnPoints - rules.startingPoints) * n) / 1000;
  // 0.1pt 単位の整数で扱う
  const bonus = rules.uma.map((u, i) => (u + (i === 0 && rules.okaToTop ? oka : 0)) * 10);
  const order = scores
    .map((score, seat) => ({ seat, score }))
    .sort((a, b) => b.score - a.score || a.seat - b.seat);

  const result: Standing[] = [];
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && order[j + 1].score === order[i].score) j++;
    const group = order.slice(i, j + 1); // 起家に近い順
    const pool = bonus.slice(i, j + 1).reduce((a, b) => a + b, 0);
    const share = Math.floor(pool / group.length);
    let rem = pool - share * group.length;
    for (const g of group) {
      const extra = rem > 0 ? 1 : 0;
      rem -= extra;
      const raw = ((g.score - rules.returnPoints) / 1000) * 10;
      result.push({
        seat: g.seat,
        score: g.score,
        rank: i + 1,
        points: Math.round(raw + share + extra) / 10,
      });
    }
    i = j + 1;
  }
  return result.sort((a, b) => a.seat - b.seat);
}
