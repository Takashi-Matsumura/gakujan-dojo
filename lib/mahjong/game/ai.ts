/**
 * ルールベースの CPU 思考。
 * - 攻撃: 向聴数 → 受け入れ枚数 → 牌の価値（字牌・端牌から切る、ドラは残す）
 * - テンパイ即リー（門前）
 * - 守備: 立直者がいて一向聴以上なら、安全度の高い牌（現物 > 字牌/筋 > …）を切る
 * - 鳴き: 役牌のポン、役のある鳴き手での前進するチー/ポン
 */
import { analyzeDiscards, shanten } from "../shape";
import { doraFromIndicator, isHonor, isTerminal, type Tile, type TileKind } from "../tiles";
import { doraIndicators, handCounts, seatWind, turnOptions } from "./engine";
import type { Action, CallOption, GameState } from "./types";

export function decideAction(s: GameState, seat: number): Action | null {
  if (s.phase === "calls" && s.pending && s.pending.responses[seat] === undefined) {
    return decideCall(s, seat, s.pending.options[seat]);
  }
  if (s.phase === "turn" && s.turn === seat) return decideTurn(s, seat);
  return null;
}

/** 自分から見えている牌（自分の手牌以外）の枚数 */
export function visibleCounts(s: GameState): number[] {
  const c = new Array<number>(34).fill(0);
  for (const p of s.players) {
    for (const d of p.discards) if (d.calledBy === undefined) c[d.tile.kind]++;
    for (const m of p.melds) for (const t of m.tiles) c[t.kind]++;
  }
  for (const t of doraIndicators(s)) c[t.kind]++;
  return c;
}

function yakuhaiKinds(s: GameState, seat: number): TileKind[] {
  return [31, 32, 33, 27 + seatWind(s, seat), 27 + s.roundWind];
}

function tileValue(s: GameState, seat: number, kind: TileKind): number {
  const doras = doraIndicators(s).map((t) => doraFromIndicator(t.kind));
  let v = 0;
  if (doras.includes(kind)) v += 30;
  if (isHonor(kind)) v += yakuhaiKinds(s, seat).includes(kind) ? 6 : 0;
  else if (isTerminal(kind)) v += 4;
  else {
    const n = kind % 9;
    v += n >= 2 && n <= 6 ? 12 : 8;
  }
  return v;
}

/**
 * threat に対する現物: 本人の捨て牌すべて + 立直宣言以降に他家が切って通った牌。
 */
export function genbutsuOf(s: GameState, threat: number): Set<TileKind> {
  const tp = s.players[threat];
  const set = new Set(tp.discards.map((d) => d.tile.kind));
  if (tp.riichi) {
    const riichiSeq = tp.discards[tp.riichi.discardIndex].seq;
    s.players.forEach((p, i) => {
      if (i === threat) return;
      for (const d of p.discards) if (d.seq > riichiSeq) set.add(d.tile.kind);
    });
  }
  return set;
}

/** 立直者 threat に対する危険度（0 = 現物） */
export function danger(s: GameState, threat: number, kind: TileKind, visible: number[]): number {
  const genbutsu = genbutsuOf(s, threat);
  if (genbutsu.has(kind)) return 0;
  if (isHonor(kind)) return visible[kind] >= 3 ? 1 : visible[kind] === 2 ? 3 : 6;
  const n = kind % 9;
  const has = (k: number) => genbutsu.has(k);
  let suji = false;
  if (n <= 2) suji = has(kind + 3);
  else if (n >= 6) suji = has(kind - 3);
  else suji = has(kind - 3) && has(kind + 3);
  if (suji) return isTerminal(kind) ? 2 : 4;
  if (isTerminal(kind)) return 6;
  return n === 1 || n === 7 ? 8 : 10;
}

function pickTile(hand: Tile[], kind: TileKind, allowed: number[]): Tile | undefined {
  const cands = hand.filter((t) => t.kind === kind && allowed.includes(t.id));
  return cands.find((t) => !t.red) ?? cands[0];
}

function decideTurn(s: GameState, seat: number): Action {
  const p = s.players[seat];
  const opts = turnOptions(s, seat);
  if (opts.canTsumo) return { type: "tsumo", seat };
  if (p.riichi) return { type: "discard", seat, tileId: opts.discards[0] };

  const visible = visibleCounts(s);
  const allowedKinds = new Set(p.hand.filter((t) => opts.discards.includes(t.id)).map((t) => t.kind));
  const analysis = analyzeDiscards(handCounts(p.hand), p.melds.length, visible).filter((o) =>
    allowedKinds.has(o.discard),
  );
  const bestShanten = analysis[0].shanten;
  const threats = s.players.map((x, i) => (i !== seat && x.riichi ? i : -1)).filter((i) => i >= 0);

  let chosen: TileKind;
  if (threats.length && bestShanten >= 1) {
    chosen = [...allowedKinds].sort((a, b) => {
      const da = threats.reduce((acc, t) => acc + danger(s, t, a, visible), 0);
      const db = threats.reduce((acc, t) => acc + danger(s, t, b, visible), 0);
      return da - db || tileValue(s, seat, a) - tileValue(s, seat, b);
    })[0];
  } else {
    const top = analysis.filter((o) => o.shanten === bestShanten);
    const maxUke = Math.max(...top.map((o) => o.ukeireTotal));
    const near = top.filter((o) => o.ukeireTotal >= maxUke - 1);
    chosen = near.sort((a, b) => tileValue(s, seat, a.discard) - tileValue(s, seat, b.discard))[0].discard;
  }

  const tile = pickTile(p.hand, chosen, opts.discards)!;
  const riichi =
    opts.riichiDiscards.includes(tile.id) &&
    (analysis.find((o) => o.discard === chosen)?.ukeireTotal ?? 0) > 0;
  return { type: "discard", seat, tileId: tile.id, riichi };
}

function shantenAfterCall(s: GameState, seat: number, useIds: number[]): number {
  const p = s.players[seat];
  const rest = p.hand.filter((t) => !useIds.includes(t.id));
  let best = 99;
  for (let i = 0; i < rest.length; i++) {
    const r = rest.filter((_, j) => j !== i);
    best = Math.min(best, shanten(handCounts(r), p.melds.length + 1).regular);
  }
  return best;
}

function decideCall(s: GameState, seat: number, options: CallOption[]): Action {
  const pass: Action = { type: "pass", seat };
  if (options.some((o) => o.type === "ron")) return { type: "ron", seat };
  const p = s.players[seat];
  const tile = s.pending!.tile;
  const threats = s.players.some((x, i) => i !== seat && x.riichi);
  const current = shanten(handCounts(p.hand), p.melds.length).regular;
  if (threats && current >= 2) return pass;

  const yakuhai = yakuhaiKinds(s, seat);
  const hasYakuMeld = p.melds.some((m) => m.type !== "chi" && yakuhai.includes(m.tiles[0].kind));

  for (const o of options) {
    if (o.type !== "pon" || !o.tileIds) continue;
    const after = shantenAfterCall(s, seat, o.tileIds);
    if (yakuhai.includes(tile.kind) && after <= current) return { type: "pon", seat, tileIds: o.tileIds };
    if (hasYakuMeld && after < current) return { type: "pon", seat, tileIds: o.tileIds };
  }
  if (hasYakuMeld) {
    for (const o of options) {
      if (o.type !== "chi" || !o.tileIds) continue;
      if (shantenAfterCall(s, seat, o.tileIds) < current) return { type: "chi", seat, tileIds: o.tileIds };
    }
  }
  return pass;
}
