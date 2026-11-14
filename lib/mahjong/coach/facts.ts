/**
 * 解説用の「事実シート」を局面から決定的に作る。
 * LLM には計算をさせず、ここで確定した事実だけを渡して言い換え・解説させる。
 * 事実シートそのものも画面に出せるので、学習教材として単体でも使える。
 */
import { WAIT_NAMES, type Meld, type WinInput, type WinResult } from "../evaluate";
import { analyzeDiscards } from "../shape";
import { doraFromIndicator, isHonor, kindName, suitOf, type Tile, type TileKind } from "../tiles";
import { danger, decideAction, genbutsuOf, visibleCounts } from "../game/ai";
import { doraIndicators, handCounts, remainingTiles, roundLabel, seatWind, turnOptions } from "../game/engine";
import type { CalledMeld, GameState } from "../game/types";
import { yakuDefinition } from "./glossary";

export type CoachKind = "win" | "discard" | "read";

export interface FactSheet {
  kind: CoachKind;
  title: string;
  lines: string[];
  /** 説明の前に示す結論（何切るの推奨打牌など） */
  headline?: { text: string; tile?: TileKind; note?: string };
  /** true なら結論だけ先に見せ、説明が必要か尋ねてから LLM を呼ぶ */
  askBeforeExplain?: boolean;
}

const WIND = ["東", "南", "西", "北"];
const names = (tiles: readonly Tile[]) => tiles.map((t) => kindName(t.kind) + (t.red ? "(赤)" : "")).join(" ");
const kinds = (ks: readonly TileKind[]) => ks.map(kindName).join("・");

function meldText(m: CalledMeld): string {
  const label = { chi: "チー", pon: "ポン", minkan: "大明槓", kakan: "加槓", ankan: "暗槓" }[m.type];
  return `${label}[${names(m.tiles)}]`;
}

function contextLines(s: GameState, seat: number): string[] {
  const doras = doraIndicators(s).map((t) => doraFromIndicator(t.kind));
  return [
    `局: ${roundLabel(s)}（場風 ${WIND[s.roundWind]}、自風 ${WIND[seatWind(s, seat)]}${seat === s.dealer ? "、親" : "、子"}）`,
    `ドラ: ${kinds(doras)}`,
    `山の残り: ${remainingTiles(s)}枚`,
  ];
}

// ------------------------------------------------------------------ 和了の解説

/** ドラの内訳（どの牌がドラで、和了形に何枚あるか） */
function doraLines(s: GameState, tiles: readonly Tile[], ura: readonly Tile[]): string[] {
  const count = (inds: readonly Tile[]) =>
    inds.map((ind) => {
      const d = doraFromIndicator(ind.kind);
      return `${kindName(ind.kind)}→ドラは${kindName(d)}（和了形に${tiles.filter((t) => t.kind === d).length}枚）`;
    });
  const lines = [`ドラ表示牌: ${count(doraIndicators(s)).join("、")}`];
  if (ura.length) lines.push(`裏ドラ表示牌: ${count(ura).join("、")}`);
  const reds = tiles.filter((t) => t.red);
  if (reds.length) lines.push(`赤ドラ: ${names(reds)}`);
  return lines;
}

export function winFacts(s: GameState): FactSheet | null {
  const r = s.result;
  if (!r || r.type !== "win") return null;
  const w = r.win;
  const winner = s.players[r.winner];
  const lines: string[] = [
    `和了者: ${winner.name}（${r.from === null ? "ツモ" : `ロン、放銃者 ${s.players[r.from].name}`}）`,
    `自風: ${WIND[seatWind(s, r.winner)]}、場風: ${WIND[s.roundWind]}`,
    `手牌: ${names([...r.hand].sort((a, b) => a.kind - b.kind))}`,
    `和了牌: ${kindName(r.winTile.kind)}`,
    ...(r.melds.length ? [`副露: ${r.melds.map(meldText).join(" ")}`] : []),
    `面子構成: ${w.structure}`,
    `待ちの形: ${WAIT_NAMES[w.waitType]}`,
    ...doraLines(s, [...r.hand, r.winTile, ...r.melds.flatMap((m) => m.tiles)], r.uraIndicators),
    "成立した役:",
    ...w.yaku.map((y) => {
      const def = yakuDefinition(y.name);
      const value = y.yakuman ? (y.yakuman > 1 ? `${y.yakuman}倍役満` : "役満") : `${y.han}翻`;
      return `- ${y.name}（${value}）${def ? `: ${def}` : ""}`;
    }),
  ];
  if (!w.yakuman) {
    lines.push("符の内訳:", ...w.fuDetail.map((f) => `- ${f.label}: ${f.fu}符`));
    const raw = w.fuDetail.reduce((a, f) => a + f.fu, 0);
    lines.push(`符の合計 ${raw}符 → 10符単位に切り上げて ${w.fu}符`);
    lines.push(`翻の合計: ${w.han}翻`);
  }
  const pay = w.payment;
  lines.push(
    `点数: ${w.yakuman ? "" : `${w.fu}符${w.han}翻 `}${pay.limit ? `${pay.limit} ` : ""}${pay.total}点`,
    r.from === null
      ? pay.tsumoFromDealer
        ? `支払い: 子 ${pay.tsumoFromChild}点、親 ${pay.tsumoFromDealer}点`
        : `支払い: ${pay.tsumoFromChild}点オール`
      : `支払い: 放銃者が ${pay.ron}点`,
  );
  if (s.honba) lines.push(`本場: ${s.honba}本場（1本場につき300点を加算済み）`);
  if (pay.limit === "満貫" && w.han <= 4) lines.push("補足: 30符4翻・60符3翻は切り上げ満貫（学雀連ルール）");
  return { kind: "win", title: `${winner.name}の和了`, lines };
}

// ------------------------------------------------------------------ 何切る

export function discardFacts(s: GameState, seat: number): FactSheet | null {
  if (s.phase !== "turn" || s.turn !== seat) return null;
  const p = s.players[seat];
  const opts = turnOptions(s, seat);
  const allowed = new Set(p.hand.filter((t) => opts.discards.includes(t.id)).map((t) => t.kind));
  const visible = visibleCounts(s);
  const analysis = analyzeDiscards(handCounts(p.hand), p.melds.length, visible).filter((o) => allowed.has(o.discard));
  if (!analysis.length) return null;
  const threats = s.players.map((x, i) => (i !== seat && x.riichi ? i : -1)).filter((i) => i >= 0);

  const rec = decideAction(s, seat);
  const recKind = rec?.type === "discard" ? p.hand.find((t) => t.id === rec.tileId)?.kind : undefined;

  const lines = [
    ...contextLines(s, seat),
    `手牌: ${names([...p.hand].filter((t) => t.id !== p.drawn?.id).sort((a, b) => a.kind - b.kind))}`,
    ...(p.drawn ? [`ツモ牌: ${kindName(p.drawn.kind)}`] : []),
    ...(p.melds.length ? [`副露: ${p.melds.map(meldText).join(" ")}`] : []),
    `立直している相手: ${threats.length ? threats.map((i) => s.players[i].name).join("、") : "なし"}`,
    "向聴数の意味: 0=テンパイ（あと1枚で和了）、1=一向聴（あと1枚でテンパイ）。数字が大きいほど和了から遠い。2向聴以上はまだ手作りの序盤〜中盤。",
    "受け入れ枚数の意味: 引くと向聴数が1つ進む（テンパイ・和了に1歩近づく）牌の残り枚数。和了牌の枚数ではない。",
    "打牌候補（向聴数が小さく、受け入れ枚数が多いほど和了に近い。受け入れ枚数は見えている牌を除いた残り枚数）:",
    ...analysis.slice(0, 5).map((o, i) => {
      const shantenText = o.shanten === 0 ? "テンパイ" : `${o.shanten}向聴`;
      const uke = o.ukeire.map((u) => `${kindName(u.kind)}${u.remaining}枚`).join(" ");
      const dangerText = threats.length
        ? `、危険度 ${threats.map((t) => danger(s, t, o.discard, visible)).join("/")}（0=現物、10=最も危険）`
        : "";
      return `${i + 1}. ${kindName(o.discard)}切り → ${shantenText}、受け入れ ${o.ukeireTotal}枚（${uke || "なし"}）${dangerText}`;
    }),
  ];
  let headline: FactSheet["headline"];
  if (recKind !== undefined) {
    const isDefense = threats.length > 0 && analysis[0].shanten >= 1;
    const riichi = rec?.type === "discard" && !!rec.riichi;
    const opt = analysis.find((o) => o.discard === recKind);
    headline = {
      text: `${kindName(recKind)}切り${riichi ? "（立直）" : ""}`,
      tile: recKind,
      note: isDefense
        ? "相手の立直に対して手が遠いので、安全な牌を優先"
        : opt
          ? `${opt.shanten <= 0 ? "テンパイ" : `${opt.shanten}向聴`}・受け入れ${opt.ukeireTotal}枚`
          : undefined,
    };
    lines.push(
      `コードの推奨: ${kindName(recKind)}切り${rec?.type === "discard" && rec.riichi ? "（立直）" : ""}` +
        (isDefense ? "（相手の立直に対して手が遠いので守備を優先）" : "（向聴数→受け入れ枚数→牌の価値の順で比較）"),
    );
  }
  if (opts.riichiDiscards.length) {
    lines.push(`立直できる打牌: ${kinds([...new Set(p.hand.filter((t) => opts.riichiDiscards.includes(t.id)).map((t) => t.kind))])}`);
  }
  return { kind: "discard", title: "この局面の何切る", lines, headline, askBeforeExplain: true };
}

// ------------------------------------------------------------------ 河読み

export function readFacts(s: GameState, viewer: number, target: number): FactSheet | null {
  if (viewer === target) return null;
  const tp = s.players[target];
  const me = s.players[viewer];
  const visible = visibleCounts(s);
  const genbutsu = genbutsuOf(s, target);

  const river = tp.discards.map((d, i) => {
    const flags = [d.tsumogiri ? "ツモ切り" : "手出し", d.riichi ? "立直宣言牌" : "", d.calledBy !== undefined ? "鳴かれた" : ""]
      .filter(Boolean)
      .join("・");
    return `${i + 1}.${kindName(d.tile.kind)}(${flags})`;
  });

  const lines = [
    ...contextLines(s, viewer),
    `読む相手: ${tp.name}（自風 ${WIND[seatWind(s, target)]}）`,
    `相手の状態: ${tp.riichi ? `立直中（${tp.riichi.discardIndex + 1}枚目で宣言${tp.riichi.double ? "、ダブル立直" : ""}）` : tp.melds.length ? `${tp.melds.length}副露` : "門前・未立直"}`,
    `相手の河（打牌順）: ${river.join(" ") || "まだなし"}`,
    ...(tp.melds.length ? [`相手の副露: ${tp.melds.map(meldText).join(" ")}`] : []),
    `確定情報 — 現物（この相手にはロンされない牌）: ${kinds([...genbutsu].sort((a, b) => a - b)) || "なし"}`,
  ];

  // 筋（現物の±3）で比較的安全な牌
  const suji: TileKind[] = [];
  for (let k = 0; k < 27; k++) {
    if (genbutsu.has(k)) continue;
    const n = k % 9;
    const has = (x: number) => genbutsu.has(x);
    const ok = n <= 2 ? has(k + 3) : n >= 6 ? has(k - 3) : has(k - 3) && has(k + 3);
    if (ok) suji.push(k);
  }
  lines.push(
    `推測・比較的安全な牌（筋）: ${kinds(suji) || "なし"}。理由: 現物の3つ隣なので両面待ちでは当たらない。ただし嵌張・単騎・双碰待ちでは当たることがある`,
  );

  // 壁（4枚見えている数牌）→ ノーチャンス
  const walls = [...Array(27).keys()].filter((k) => visible[k] >= 4);
  if (walls.length) lines.push(`推測・比較的安全な牌の手がかり（壁）: ${kinds(walls)} が4枚見えている。その外側の牌は両面待ちで当たらない（ノーチャンス）`);
  const honorsSafe = [27, 28, 29, 30, 31, 32, 33].filter((k) => !genbutsu.has(k) && visible[k] >= 3);
  if (honorsSafe.length) lines.push(`推測・比較的安全な牌（字牌）: ${kinds(honorsSafe)}。理由: 3枚見えているので単騎待ちでしか当たらない`);

  // 立直宣言牌の周辺
  if (tp.riichi) {
    const decl = tp.discards[tp.riichi.discardIndex].tile.kind;
    if (!isHonor(decl)) {
      const around = [decl - 2, decl - 1, decl + 1, decl + 2].filter(
        (k) => k >= 0 && k < 27 && suitOf(k) === suitOf(decl) && !genbutsu.has(k),
      );
      lines.push(`推測・注意が必要な牌（一般論）: 立直宣言牌 ${kindName(decl)} の周辺（${kinds(around)}）は待ちに絡むことがある（またぎ筋・裏筋）`);
    }
  }

  // 色の偏り
  const counts = { m: 0, p: 0, s: 0 } as Record<"m" | "p" | "s", number>;
  for (const d of tp.discards) if (!isHonor(d.tile.kind)) counts[suitOf(d.tile.kind) as "m" | "p" | "s"]++;
  const meldSuits = new Set(tp.melds.flatMap((m) => m.tiles.filter((t) => !isHonor(t.kind)).map((t) => suitOf(t.kind))));
  const suitName = { m: "萬子", p: "筒子", s: "索子" };
  const total = counts.m + counts.p + counts.s;
  if (total >= 6) {
    const missing = (Object.keys(counts) as ("m" | "p" | "s")[]).filter((k) => counts[k] === 0);
    if (missing.length === 1) lines.push(`推測・手の方向性: ${suitName[missing[0]]}を1枚も切っていない。${suitName[missing[0]]}の染め手（混一色・清一色）の可能性`);
  }
  if (meldSuits.size === 1 && tp.melds.length >= 2) {
    lines.push(`推測・手の方向性: 副露が${suitName[[...meldSuits][0] as "m" | "p" | "s"]}だけ。染め手の可能性`);
  }
  const recentTegiri = tp.discards.filter((d) => !d.tsumogiri).slice(-3);
  if (recentTegiri.length) lines.push(`最近の手出し: ${kinds(recentTegiri.map((d) => d.tile.kind))}（手の形が変わったタイミングの手がかり）`);

  // 自分の手牌の安全度
  if (me.hand.length) {
    const uniq = [...new Set(me.hand.map((t) => t.kind))];
    const ranked = uniq
      .map((k) => ({ k, d: danger(s, target, k, visible) }))
      .sort((a, b) => a.d - b.d);
    lines.push(
      `自分の手牌の安全度（0=現物、10=最も危険、コードの機械的な目安）: ${ranked.map((x) => `${kindName(x.k)}=${x.d}`).join(" ")}`,
    );
  }
  return { kind: "read", title: `${tp.name}の河読み`, lines };
}

// ------------------------------------------------------------------ 符計算ドリル

function meldInputText(m: Meld): string {
  const label = { chi: "チー", pon: "ポン", minkan: "大明槓", kakan: "加槓", ankan: "暗槓" }[m.type];
  const tiles = m.type === "chi" ? [m.tile, m.tile + 1, m.tile + 2] : Array(m.type === "pon" ? 3 : 4).fill(m.tile);
  return `${label}[${kinds(tiles)}]`;
}

/** 盤面のない単独の和了（ドリル用）の事実シート */
export function drillFacts(input: WinInput, w: WinResult): FactSheet {
  const lines = [
    `和了: ${input.isTsumo ? "ツモ" : "ロン"}（場風 ${WIND[input.roundWind]}、自風 ${WIND[input.seatWind]}${input.seatWind === 0 ? "、親" : "、子"}）`,
    `手牌: ${kinds([...input.concealed].sort((a, b) => a - b))}`,
    `和了牌: ${kindName(input.winTile)}`,
    ...(input.melds.length ? [`副露: ${input.melds.map(meldInputText).join(" ")}`] : []),
    `面子構成（最も高くなる解釈）: ${w.structure}`,
    `待ちの形: ${WAIT_NAMES[w.waitType]}`,
    "成立した役:",
    ...w.yaku.map((y) => `- ${y.name}（${y.han}翻）${yakuDefinition(y.name) ? `: ${yakuDefinition(y.name)}` : ""}`),
    "符の内訳:",
    ...w.fuDetail.map((f) => `- ${f.label}: ${f.fu}符`),
    `符の合計 ${w.fuDetail.reduce((a, f) => a + f.fu, 0)}符 → 10符単位に切り上げて ${w.fu}符`,
    `点数: ${w.fu}符${w.han}翻 ${w.payment.limit ? `${w.payment.limit} ` : ""}${w.payment.total}点`,
  ];
  return { kind: "win", title: "この問題の符計算", lines };
}
