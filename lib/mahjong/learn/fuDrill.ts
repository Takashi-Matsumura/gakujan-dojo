/**
 * 符計算ドリルの問題生成（シード付きで再現可能）。
 * ランダムな和了形を組み立て、evaluateWin で役・符・点数を確定させる。
 */
import { evaluateWin, type Meld, type WinInput, type WinResult, type Wind } from "../evaluate";
import { GAKUREN_RULES } from "../rules";
import { calcPayment } from "../score";
import { KIND_COUNT, type TileKind } from "../tiles";
import { nextRandom } from "../game/rng";

export type DrillLevel = "basic" | "advanced";

export interface FuProblem {
  seed: number;
  level: DrillLevel;
  input: WinInput;
  result: WinResult;
}

export const FU_CHOICES = [20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110];

class Rng {
  constructor(private state: number) {}
  next(): number {
    const [v, n] = nextRandom(this.state);
    this.state = n;
    return v;
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}

interface Block {
  type: "shuntsu" | "koutsu";
  tile: TileKind;
  meld: Meld["type"] | null;
}

function tryGenerate(rng: Rng, level: DrillLevel): WinInput | null {
  const counts = new Array<number>(KIND_COUNT).fill(0);
  const take = (k: TileKind, n: number) => {
    if (counts[k] + n > 4) return false;
    counts[k] += n;
    return true;
  };

  // 七対子（基本でたまに出す）
  if (rng.chance(level === "basic" ? 0.08 : 0.04)) {
    const pairs = new Set<TileKind>();
    while (pairs.size < 7) pairs.add(rng.int(KIND_COUNT));
    const tiles = [...pairs].flatMap((k) => [k, k]);
    const win = tiles[rng.int(tiles.length)];
    const concealed = [...tiles];
    concealed.splice(concealed.indexOf(win), 1);
    return finish(rng, concealed, [], win, true);
  }

  // 雀頭（字牌をやや多めに出して符の判断を練習させる）
  const pair = rng.chance(0.3) ? 27 + rng.int(7) : rng.int(27);
  take(pair, 2);

  const blocks: Block[] = [];
  const koutsuRate = level === "basic" ? 0.35 : 0.45;
  for (let i = 0; i < 4; i++) {
    let placed = false;
    for (let attempt = 0; attempt < 20 && !placed; attempt++) {
      if (rng.chance(koutsuRate)) {
        const k = rng.chance(0.3) ? 27 + rng.int(7) : rng.int(27);
        if (!take(k, 3)) continue;
        let meld: Block["meld"] = null;
        if (level === "advanced") {
          const r = rng.next();
          meld = r < 0.25 ? "pon" : r < 0.35 ? "minkan" : r < 0.45 ? "ankan" : null;
          if ((meld === "minkan" || meld === "ankan") && !take(k, 1)) meld = null;
        }
        blocks.push({ type: "koutsu", tile: k, meld });
        placed = true;
      } else {
        const suit = rng.int(3) * 9;
        const k = suit + rng.int(7);
        if (counts[k] >= 4 || counts[k + 1] >= 4 || counts[k + 2] >= 4) continue;
        take(k, 1);
        take(k + 1, 1);
        take(k + 2, 1);
        const meld = level === "advanced" && rng.chance(0.25) ? "chi" : null;
        blocks.push({ type: "shuntsu", tile: k, meld });
        placed = true;
      }
    }
    if (!placed) return null;
  }

  const melds: Meld[] = blocks.filter((b) => b.meld).map((b) => ({ type: b.meld!, tile: b.tile }));
  const closedBlocks = blocks.filter((b) => !b.meld);
  const closed: TileKind[] = [pair, pair];
  for (const b of closedBlocks) {
    if (b.type === "koutsu") closed.push(b.tile, b.tile, b.tile);
    else closed.push(b.tile, b.tile + 1, b.tile + 2);
  }
  const win = closed[rng.int(closed.length)];
  const concealed = [...closed];
  concealed.splice(concealed.indexOf(win), 1);
  return finish(rng, concealed, melds, win, melds.every((m) => m.type === "ankan"));
}

function finish(rng: Rng, concealed: TileKind[], melds: Meld[], win: TileKind, menzen: boolean): WinInput {
  const isTsumo = rng.chance(0.45);
  return {
    concealed: concealed.sort((a, b) => a - b),
    melds,
    winTile: win,
    isTsumo,
    seatWind: rng.int(4) as Wind,
    roundWind: rng.int(2) as Wind,
    riichi: menzen && rng.chance(0.5) ? "riichi" : "none",
    rinshan: isTsumo && melds.some((m) => m.type === "minkan" || m.type === "ankan") && rng.chance(0.15),
  };
}

export function generateFuProblem(seed: number, level: DrillLevel): FuProblem {
  const rng = new Rng(seed >>> 0);
  for (let i = 0; i < 500; i++) {
    const input = tryGenerate(rng, level);
    if (!input) continue;
    const result = evaluateWin(input);
    if (!result || result.yakuman > 0) continue;
    return { seed, level, input, result };
  }
  throw new Error("問題を生成できませんでした");
}

// ---------------------------------------------------------------- 点数の選択肢

export function paymentLabel(p: ReturnType<typeof calcPayment>, isTsumo: boolean): string {
  if (!isTsumo) return `${p.ron!.toLocaleString()}点`;
  if (p.tsumoFromDealer) return `${p.tsumoFromChild!.toLocaleString()} / ${p.tsumoFromDealer.toLocaleString()}点`;
  return `${p.tsumoFromChild!.toLocaleString()}点オール`;
}

export interface PointOption {
  label: string;
  correct: boolean;
}

/** 正解の点数と、符や翻を少しずらした誤答を混ぜた4択 */
export function pointOptions(p: FuProblem, seed: number): PointOption[] {
  const { input, result } = p;
  const isDealer = input.seatWind === 0;
  const label = (han: number, fu: number) =>
    paymentLabel(
      calcPayment({ han, fu, yakuman: 0, isDealer, isTsumo: input.isTsumo, honba: 0, rules: GAKUREN_RULES }),
      input.isTsumo,
    );
  const correct = label(result.han, result.fu);
  const candidates: string[] = [];
  const fuSteps = [-20, -10, 10, 20, 30];
  for (const dh of [0, 1, -1, 2]) {
    for (const df of [0, ...fuSteps]) {
      const han = result.han + dh;
      const fu = result.fu === 25 ? 25 + (df > 0 ? 5 : 0) : result.fu + df;
      if (han < 1 || fu < 20 || (dh === 0 && df === 0)) continue;
      // 鳴き手のツモ以外で20符はありえないので除外
      if (fu === 20 && !input.isTsumo) continue;
      const l = label(han, fu);
      if (l !== correct && !candidates.includes(l)) candidates.push(l);
    }
  }
  const rng = new Rng(seed ^ 0x5bd1e995);
  const wrong: string[] = [];
  while (wrong.length < 3 && candidates.length) wrong.push(candidates.splice(rng.int(candidates.length), 1)[0]);
  const opts: PointOption[] = [{ label: correct, correct: true }, ...wrong.map((l) => ({ label: l, correct: false }))];
  for (let i = opts.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  return opts;
}
