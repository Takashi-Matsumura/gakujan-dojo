/**
 * 牌の表現。
 *
 * 牌種（kind）は 0〜33 の整数で表す。
 *   0-8   : 萬子 1m〜9m
 *   9-17  : 筒子 1p〜9p
 *   18-26 : 索子 1s〜9s
 *   27-33 : 字牌 東 南 西 北 白 發 中
 *
 * 文字列表記は天鳳形式（"123m055p789s11z"、0 は赤5）を使う。
 */

export type TileKind = number;

export const KIND_COUNT = 34;

export const EAST = 27;
export const SOUTH = 28;
export const WEST = 29;
export const NORTH = 30;
export const HAKU = 31;
export const HATSU = 32;
export const CHUN = 33;

export type Suit = "m" | "p" | "s" | "z";

export const suitOf = (k: TileKind): Suit =>
  k < 9 ? "m" : k < 18 ? "p" : k < 27 ? "s" : "z";

/** 数牌の数字（1〜9）。字牌は 1〜7。 */
export const numberOf = (k: TileKind): number => (k < 27 ? (k % 9) + 1 : k - 26);

export const isHonor = (k: TileKind): boolean => k >= 27;
export const isWind = (k: TileKind): boolean => k >= 27 && k <= 30;
export const isDragon = (k: TileKind): boolean => k >= 31;
export const isTerminal = (k: TileKind): boolean =>
  k < 27 && (k % 9 === 0 || k % 9 === 8);
/** 么九牌（一九字牌） */
export const isYaochu = (k: TileKind): boolean => isHonor(k) || isTerminal(k);
export const isSimple = (k: TileKind): boolean => !isYaochu(k);

export const YAOCHU_KINDS: readonly TileKind[] = [
  0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33,
];

const HONOR_NAMES = ["東", "南", "西", "北", "白", "發", "中"] as const;
const SUIT_NAMES: Record<Exclude<Suit, "z">, string> = {
  m: "萬",
  p: "筒",
  s: "索",
};
const KANJI_NUM = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];

/** 表示用の日本語名（例: "五萬", "東"） */
export function kindName(k: TileKind): string {
  const s = suitOf(k);
  if (s === "z") return HONOR_NAMES[k - 27];
  return KANJI_NUM[numberOf(k) - 1] + SUIT_NAMES[s];
}

/** 天鳳形式の1牌表記（例: "5m", "1z"） */
export function kindCode(k: TileKind): string {
  return `${numberOf(k)}${suitOf(k)}`;
}

/** ドラ表示牌から実際のドラ牌を求める */
export function doraFromIndicator(ind: TileKind): TileKind {
  if (ind < 27) {
    const base = ind - (ind % 9);
    return base + ((ind % 9) + 1) % 9;
  }
  if (ind <= 30) return 27 + ((ind - 27 + 1) % 4);
  return 31 + ((ind - 31 + 1) % 3);
}

/**
 * 物理的な牌1枚。136枚それぞれに一意の id を持つ。
 * id = kind * 4 + copy（copy 0..3）。赤ドラは各色の 5 の copy 0。
 */
export interface Tile {
  id: number;
  kind: TileKind;
  red: boolean;
}

export const RED_FIVE_KINDS: readonly TileKind[] = [4, 13, 22];

export function tileFromId(id: number, useRed = true): Tile {
  const kind = Math.floor(id / 4);
  const red = useRed && id % 4 === 0 && RED_FIVE_KINDS.includes(kind);
  return { id, kind, red };
}

/** 136枚の牌山（未シャッフル） */
export function createWall(useRed = true): Tile[] {
  return Array.from({ length: 136 }, (_, id) => tileFromId(id, useRed));
}

export function toCounts(kinds: readonly TileKind[]): number[] {
  const c = new Array<number>(KIND_COUNT).fill(0);
  for (const k of kinds) c[k]++;
  return c;
}

export interface ParsedTiles {
  kinds: TileKind[];
  /** 赤5の枚数 */
  red: number;
}

/** "123m055p789s11z" 形式を解析する（0 は赤5） */
export function parseTiles(src: string): ParsedTiles {
  const kinds: TileKind[] = [];
  let red = 0;
  let pending: number[] = [];
  for (const ch of src.replace(/\s+/g, "")) {
    if (ch >= "0" && ch <= "9") {
      pending.push(Number(ch));
      continue;
    }
    const offset = { m: 0, p: 9, s: 18, z: 27 }[ch as Suit];
    if (offset === undefined) throw new Error(`不正な牌表記: ${ch}`);
    for (const n of pending) {
      if (n === 0) {
        if (ch === "z") throw new Error("字牌に赤はありません");
        red++;
        kinds.push(offset + 4);
      } else {
        if (ch === "z" && n > 7) throw new Error(`不正な字牌: ${n}z`);
        kinds.push(offset + n - 1);
      }
    }
    pending = [];
  }
  if (pending.length) throw new Error("末尾に色指定がありません");
  return { kinds, red };
}

/** 牌種の配列を天鳳形式に整形する */
export function formatKinds(kinds: readonly TileKind[]): string {
  const sorted = [...kinds].sort((a, b) => a - b);
  let out = "";
  let cur: Suit | null = null;
  let buf = "";
  for (const k of sorted) {
    const s = suitOf(k);
    if (s !== cur && cur) {
      out += buf + cur;
      buf = "";
    }
    cur = s;
    buf += numberOf(k);
  }
  if (cur) out += buf + cur;
  return out;
}
