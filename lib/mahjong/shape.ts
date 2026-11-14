/**
 * 手牌の形の解析: 面子分解・向聴数・待ち。
 * すべて牌種カウント配列（長さ34）で扱う。
 */
import { KIND_COUNT, YAOCHU_KINDS, type TileKind } from "./tiles";

export interface SetBlock {
  type: "shuntsu" | "koutsu";
  /** 順子は先頭の牌、刻子はその牌 */
  tile: TileKind;
}

export interface Decomposition {
  pair: TileKind;
  sets: SetBlock[];
}

const canStartShuntsu = (k: TileKind) => k < 27 && k % 9 <= 6;

/**
 * 雀頭1つ + 面子に分解できる全パターンを返す。
 * counts の枚数は 3n+2 であること。
 */
export function decompose(counts: readonly number[]): Decomposition[] {
  const results: Decomposition[] = [];
  const c = [...counts];
  for (let p = 0; p < KIND_COUNT; p++) {
    if (c[p] < 2) continue;
    c[p] -= 2;
    const sets: SetBlock[] = [];
    extractSets(c, 0, sets, (s) => results.push({ pair: p, sets: [...s] }));
    c[p] += 2;
  }
  return results;
}

function extractSets(
  c: number[],
  start: number,
  sets: SetBlock[],
  emit: (s: SetBlock[]) => void,
): void {
  let i = start;
  while (i < KIND_COUNT && c[i] === 0) i++;
  if (i === KIND_COUNT) {
    emit(sets);
    return;
  }
  if (c[i] >= 3) {
    c[i] -= 3;
    sets.push({ type: "koutsu", tile: i });
    extractSets(c, i, sets, emit);
    sets.pop();
    c[i] += 3;
  }
  if (canStartShuntsu(i) && c[i + 1] > 0 && c[i + 2] > 0) {
    c[i]--;
    c[i + 1]--;
    c[i + 2]--;
    sets.push({ type: "shuntsu", tile: i });
    extractSets(c, i, sets, emit);
    sets.pop();
    c[i]++;
    c[i + 1]++;
    c[i + 2]++;
  }
}

export function isChiitoitsu(counts: readonly number[]): boolean {
  let pairs = 0;
  for (const n of counts) {
    if (n === 2) pairs++;
    else if (n !== 0) return false;
  }
  return pairs === 7;
}

export function isKokushi(counts: readonly number[]): boolean {
  let total = 0;
  let hasPair = false;
  for (let k = 0; k < KIND_COUNT; k++) {
    const n = counts[k];
    total += n;
    if (n === 0) {
      if (YAOCHU_KINDS.includes(k)) return false;
      continue;
    }
    if (!YAOCHU_KINDS.includes(k)) return false;
    if (n === 2) hasPair = true;
    else if (n > 2) return false;
  }
  return total === 14 && hasPair;
}

/** アガリ形かどうか（役の有無は問わない）。meldCount は副露数 */
export function isAgariShape(counts: readonly number[], meldCount = 0): boolean {
  if (meldCount === 0 && (isChiitoitsu(counts) || isKokushi(counts))) return true;
  return decompose(counts).length > 0;
}

// ---------------------------------------------------------------- 向聴数

/** 1色（9種）で作れる (面子数, 搭子数, 雀頭有無) の組み合わせ。メモ化する */
type SuitOption = [m: number, t: number, p: number];
const suitMemo = new Map<number, SuitOption[]>();
const honorMemo = new Map<number, SuitOption[]>();

function suitOptions(c: number[], isHonorSuit: boolean): SuitOption[] {
  const memo = isHonorSuit ? honorMemo : suitMemo;
  let key = 0;
  for (const n of c) key = key * 5 + n;
  const hit = memo.get(key);
  if (hit) return hit;
  const found = new Set<number>();
  const len = c.length;
  const search = (i: number, m: number, t: number, p: number) => {
    while (i < len && c[i] === 0) i++;
    if (i === len) {
      found.add(m * 100 + t * 10 + p);
      return;
    }
    if (c[i] >= 3) {
      c[i] -= 3;
      search(i, m + 1, t, p);
      c[i] += 3;
    }
    const seq = !isHonorSuit && i <= 6;
    if (seq && c[i + 1] > 0 && c[i + 2] > 0) {
      c[i]--;
      c[i + 1]--;
      c[i + 2]--;
      search(i, m + 1, t, p);
      c[i]++;
      c[i + 1]++;
      c[i + 2]++;
    }
    if (c[i] >= 2) {
      c[i] -= 2;
      if (p === 0) search(i, m, t, 1);
      search(i, m, t + 1, p);
      c[i] += 2;
    }
    if (!isHonorSuit && i <= 7 && c[i + 1] > 0) {
      c[i]--;
      c[i + 1]--;
      search(i, m, t + 1, p);
      c[i]++;
      c[i + 1]++;
    }
    if (seq && c[i + 2] > 0) {
      c[i]--;
      c[i + 2]--;
      search(i, m, t + 1, p);
      c[i]++;
      c[i + 2]++;
    }
    c[i]--;
    search(i, m, t, p);
    c[i]++;
  };
  search(0, 0, 0, 0);
  const opts: SuitOption[] = [...found].map((v) => [Math.floor(v / 100), Math.floor(v / 10) % 10, v % 10]);
  memo.set(key, opts);
  return opts;
}

/** 一般形の向聴数。-1 がアガリ、0 がテンパイ */
export function regularShanten(counts: readonly number[], meldCount = 0): number {
  const parts = [
    suitOptions(counts.slice(0, 9), false),
    suitOptions(counts.slice(9, 18), false),
    suitOptions(counts.slice(18, 27), false),
    suitOptions(counts.slice(27, 34), true),
  ];
  let best = 8;
  const combine = (idx: number, m: number, t: number, p: number) => {
    if (idx === parts.length) {
      const s = 8 - 2 * m - Math.min(t, 4 - m) - p;
      if (s < best) best = s;
      return;
    }
    for (const [om, ot, op] of parts[idx]) {
      if (p + op > 1) continue;
      combine(idx + 1, m + om, t + ot, p + op);
    }
  };
  combine(0, meldCount, 0, 0);
  return best;
}

export function chiitoitsuShanten(counts: readonly number[]): number {
  let pairs = 0;
  let kinds = 0;
  for (const n of counts) {
    if (n >= 1) kinds++;
    if (n >= 2) pairs++;
  }
  return 6 - pairs + Math.max(0, 7 - kinds);
}

export function kokushiShanten(counts: readonly number[]): number {
  let kinds = 0;
  let pair = 0;
  for (const k of YAOCHU_KINDS) {
    if (counts[k] >= 1) kinds++;
    if (counts[k] >= 2) pair = 1;
  }
  return 13 - kinds - pair;
}

export interface ShantenResult {
  shanten: number;
  regular: number;
  chiitoitsu: number | null;
  kokushi: number | null;
}

export function shanten(counts: readonly number[], meldCount = 0): ShantenResult {
  const regular = regularShanten(counts, meldCount);
  const chiitoitsu = meldCount === 0 ? chiitoitsuShanten(counts) : null;
  const kokushi = meldCount === 0 ? kokushiShanten(counts) : null;
  return {
    shanten: Math.min(regular, chiitoitsu ?? 99, kokushi ?? 99),
    regular,
    chiitoitsu,
    kokushi,
  };
}

// ---------------------------------------------------------------- 待ち

/**
 * テンパイ時の待ち牌（形として和了できる牌種）を返す。
 * 手牌で4枚使い切っている牌種は除外する（純カラ判定は呼び出し側で場況を見る）。
 */
export function waits(counts: readonly number[], meldCount = 0): TileKind[] {
  const out: TileKind[] = [];
  if (shanten(counts, meldCount).shanten !== 0) return out;
  const c = [...counts];
  for (let k = 0; k < KIND_COUNT; k++) {
    if (c[k] >= 4) continue;
    c[k]++;
    if (isAgariShape(c, meldCount)) out.push(k);
    c[k]--;
  }
  return out;
}

export interface DiscardOption {
  discard: TileKind;
  shanten: number;
  /** 有効牌（向聴数を下げる牌種）と残り枚数 */
  ukeire: { kind: TileKind; remaining: number }[];
  ukeireTotal: number;
}

/**
 * 14枚（3n+2）の手から各打牌候補の向聴数と受け入れを計算する（何切る学習用）。
 * visible は自分から見えている牌の枚数（河・副露・ドラ表示など）。手牌分は自動で引く。
 */
export function analyzeDiscards(
  counts: readonly number[],
  meldCount = 0,
  visible: readonly number[] = new Array(KIND_COUNT).fill(0),
): DiscardOption[] {
  const c = [...counts];
  const options: DiscardOption[] = [];
  for (let d = 0; d < KIND_COUNT; d++) {
    if (c[d] === 0) continue;
    c[d]--;
    const base = shanten(c, meldCount).shanten;
    const ukeire: DiscardOption["ukeire"] = [];
    for (let k = 0; k < KIND_COUNT; k++) {
      const remaining = 4 - c[k] - visible[k] - (k === d ? 1 : 0);
      if (remaining <= 0) continue;
      c[k]++;
      if (shanten(c, meldCount).shanten < base) ukeire.push({ kind: k, remaining });
      c[k]--;
    }
    options.push({
      discard: d,
      shanten: base,
      ukeire,
      ukeireTotal: ukeire.reduce((a, u) => a + u.remaining, 0),
    });
    c[d]++;
  }
  return options.sort(
    (a, b) => a.shanten - b.shanten || b.ukeireTotal - a.ukeireTotal,
  );
}
