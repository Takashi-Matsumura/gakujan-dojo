/**
 * 役一覧（学雀連の採用役）と例題。
 * 例題は tests で evaluateWin にかけ、その役が実際に成立することを保証している。
 */
import { YAKU_GLOSSARY } from "../coach/glossary";
import type { Meld, WinInput } from "../evaluate";
import { parseTiles } from "../tiles";

export type YakuGroup = "1翻" | "2翻" | "3翻" | "6翻" | "役満" | "ドラ";

export interface YakuExample {
  /** 和了牌を含む手牌（副露を除く、天鳳表記） */
  hand: string;
  win: string;
  melds?: { type: Meld["type"]; tile: string }[];
  ctx?: Partial<Omit<WinInput, "concealed" | "melds" | "winTile">>;
  /** 例題の補足 */
  caption?: string;
}

export interface YakuEntry {
  name: string;
  /** evaluateWin が返す役名（「役牌 白」など） */
  match: string;
  group: YakuGroup;
  /** 門前の翻数 */
  han: number | "役満";
  /** 鳴いたときの翻数。null は門前限定 */
  openHan: number | "役満" | null;
  /** 状況役（手の形でなく、和了のしかたで決まる） */
  situational?: boolean;
  description: string;
  tip?: string;
  example?: YakuExample;
}

const D = YAKU_GLOSSARY;
// 子・南家、東場が既定（東は場風、南は自風）
const base = { seatWind: 1 as const, roundWind: 0 as const };

export const YAKU_CATALOG: YakuEntry[] = [
  // ---- 1翻
  {
    name: "立直",
    match: "立直",
    group: "1翻",
    han: 1,
    openHan: null,
    situational: true,
    description: D["立直"],
    tip: "役がない手でも、門前でテンパイすれば立直で和了れるようになる。",
    example: { hand: "123m567m345p789s99p", win: "3m", ctx: { riichi: "riichi" }, caption: "辺張待ちで立直・ロン" },
  },
  {
    name: "一発",
    match: "一発",
    group: "1翻",
    han: 1,
    openHan: null,
    situational: true,
    description: D["一発"],
    example: { hand: "123m567m345p789s99p", win: "3m", ctx: { riichi: "riichi", ippatsu: true } },
  },
  {
    name: "門前清自摸和",
    match: "門前清自摸和",
    group: "1翻",
    han: 1,
    openHan: null,
    situational: true,
    description: D["門前清自摸和"],
    tip: "鳴いていなければ、ツモ和了するだけで1翻つく。",
    example: { hand: "123m567m345p789s99p", win: "3m", ctx: { isTsumo: true } },
  },
  {
    name: "平和",
    match: "平和",
    group: "1翻",
    han: 1,
    openHan: null,
    description: D["平和"],
    tip: "符がつかない形なので、ロンは30符・ツモは20符になる。",
    example: { hand: "234m678m345p678s99p", win: "2m", caption: "三四萬の両面待ちで二萬をロン" },
  },
  {
    name: "断么九",
    match: "断么九",
    group: "1翻",
    han: 1,
    openHan: 1,
    description: D["断么九"],
    tip: "1・9・字牌を1枚も使わない。鳴いても成立するので役作りの基本。",
    example: { hand: "234m567m678s55p", win: "8s", melds: [{ type: "chi", tile: "3p" }], caption: "三四五筒をチーしても成立" },
  },
  {
    name: "一盃口",
    match: "一盃口",
    group: "1翻",
    han: 1,
    openHan: null,
    description: D["一盃口"],
    example: { hand: "112233m456p789s55s", win: "3m" },
  },
  {
    name: "役牌（三元牌）",
    match: "役牌 白",
    group: "1翻",
    han: 1,
    openHan: 1,
    description: D["役牌"],
    tip: "白・發・中は誰が持っても役になる。1組につき1翻。",
    example: { hand: "555z123m456p789s22p", win: "2p" },
  },
  {
    name: "自風",
    match: "自風 南",
    group: "1翻",
    han: 1,
    openHan: 1,
    description: D["自風"],
    example: { hand: "222z123m456p789s55s", win: "5s", caption: "南家なので南が自風" },
  },
  {
    name: "場風",
    match: "場風 東",
    group: "1翻",
    han: 1,
    openHan: 1,
    description: D["場風"],
    example: { hand: "111z123m456p789s55s", win: "5s", caption: "東場なので東が場風" },
  },
  {
    name: "連風牌",
    match: "連風牌 東",
    group: "2翻",
    han: 2,
    openHan: 2,
    description: D["連風牌"],
    example: { hand: "111z123m456p789s55s", win: "5s", ctx: { seatWind: 0 }, caption: "東場の東家（親）が東を刻子にした" },
  },
  {
    name: "海底摸月",
    match: "海底摸月",
    group: "1翻",
    han: 1,
    openHan: 1,
    situational: true,
    description: D["海底摸月"],
    example: { hand: "123m567m345p789s99p", win: "3m", ctx: { isTsumo: true, haitei: true } },
  },
  {
    name: "河底撈魚",
    match: "河底撈魚",
    group: "1翻",
    han: 1,
    openHan: 1,
    situational: true,
    description: D["河底撈魚"],
    example: { hand: "123m567m345p789s99p", win: "3m", ctx: { houtei: true } },
  },
  {
    name: "嶺上開花",
    match: "嶺上開花",
    group: "1翻",
    han: 1,
    openHan: 1,
    situational: true,
    description: D["嶺上開花"],
    example: { hand: "234p567p789s55s", win: "2p", melds: [{ type: "ankan", tile: "9m" }], ctx: { isTsumo: true, rinshan: true } },
  },
  {
    name: "槍槓",
    match: "槍槓",
    group: "1翻",
    han: 1,
    openHan: 1,
    situational: true,
    description: D["槍槓"],
    example: { hand: "123m567m345p789s99p", win: "3m", ctx: { chankan: true } },
  },

  // ---- 2翻
  {
    name: "ダブル立直",
    match: "ダブル立直",
    group: "2翻",
    han: 2,
    openHan: null,
    situational: true,
    description: D["ダブル立直"],
    example: { hand: "123m567m345p789s99p", win: "3m", ctx: { riichi: "double" } },
  },
  {
    name: "対々和",
    match: "対々和",
    group: "2翻",
    han: 2,
    openHan: 2,
    description: D["対々和"],
    example: {
      hand: "333m777s99p",
      win: "3m",
      melds: [
        { type: "pon", tile: "2m" },
        { type: "pon", tile: "5p" },
      ],
    },
  },
  {
    name: "三暗刻",
    match: "三暗刻",
    group: "2翻",
    han: 2,
    openHan: 2,
    description: D["三暗刻"],
    tip: "双碰待ちをロンで和了すると、その刻子は明刻扱いになり三暗刻にならない。",
    example: { hand: "111m333p555s789s99p", win: "9s", caption: "順子側の待ちならロンでも三暗刻" },
  },
  {
    name: "三色同刻",
    match: "三色同刻",
    group: "2翻",
    han: 2,
    openHan: 2,
    description: D["三色同刻"],
    example: { hand: "222m222s456m99p", win: "9p", melds: [{ type: "pon", tile: "2p" }] },
  },
  {
    name: "三槓子",
    match: "三槓子",
    group: "2翻",
    han: 2,
    openHan: 2,
    description: D["三槓子"],
    example: {
      hand: "345s77p",
      win: "7p",
      melds: [
        { type: "ankan", tile: "2m" },
        { type: "minkan", tile: "5p" },
        { type: "ankan", tile: "8s" },
      ],
    },
  },
  {
    name: "小三元",
    match: "小三元",
    group: "2翻",
    han: 2,
    openHan: 2,
    description: D["小三元"],
    example: { hand: "555z666z77z123m456p", win: "7z" },
  },
  {
    name: "混老頭",
    match: "混老頭",
    group: "2翻",
    han: 2,
    openHan: 2,
    description: D["混老頭"],
    example: { hand: "111m999p111s99s", win: "9s", melds: [{ type: "pon", tile: "1z" }], ctx: { seatWind: 2, roundWind: 1 } },
  },
  {
    name: "七対子",
    match: "七対子",
    group: "2翻",
    han: 2,
    openHan: null,
    description: D["七対子"],
    tip: "符は25符固定。七対子を数えるときは符計算をしなくてよい。",
    example: { hand: "1133m5577p22s66z77z", win: "7z" },
  },
  {
    name: "三色同順",
    match: "三色同順",
    group: "2翻",
    han: 2,
    openHan: 1,
    description: D["三色同順"],
    example: { hand: "123m123p123s456m99s", win: "9s" },
  },
  {
    name: "一気通貫",
    match: "一気通貫",
    group: "2翻",
    han: 2,
    openHan: 1,
    description: D["一気通貫"],
    example: { hand: "123456789p234s55m", win: "5m" },
  },
  {
    name: "混全帯么九",
    match: "混全帯么九",
    group: "2翻",
    han: 2,
    openHan: 1,
    description: D["混全帯么九"],
    example: { hand: "123m789p111z789s99s", win: "9s", ctx: { seatWind: 2, roundWind: 1 } },
  },

  // ---- 3翻
  {
    name: "純全帯么九",
    match: "純全帯么九",
    group: "3翻",
    han: 3,
    openHan: 2,
    description: D["純全帯么九"],
    example: { hand: "123m789p123s789s11p", win: "1p" },
  },
  {
    name: "二盃口",
    match: "二盃口",
    group: "3翻",
    han: 3,
    openHan: null,
    description: D["二盃口"],
    example: { hand: "223344m556677p88s", win: "8s" },
  },
  {
    name: "混一色",
    match: "混一色",
    group: "3翻",
    han: 3,
    openHan: 2,
    description: D["混一色"],
    example: { hand: "123m345m789m222z55m", win: "5m", ctx: { seatWind: 2 } },
  },

  // ---- 6翻
  {
    name: "清一色",
    match: "清一色",
    group: "6翻",
    han: 6,
    openHan: 5,
    description: D["清一色"],
    example: { hand: "123456789m11122m", win: "2m" },
  },

  // ---- 役満
  { name: "国士無双", match: "国士無双", group: "役満", han: "役満", openHan: null, description: D["国士無双"], example: { hand: "19m19p19s12345677z", win: "1z" } },
  { name: "四暗刻", match: "四暗刻", group: "役満", han: "役満", openHan: null, description: D["四暗刻"], example: { hand: "111m333p555s777s99p", win: "9p", ctx: { isTsumo: true } } },
  { name: "大三元", match: "大三元", group: "役満", han: "役満", openHan: "役満", description: D["大三元"], example: { hand: "555666777z123m99p", win: "9p" } },
  {
    name: "字一色",
    match: "字一色",
    group: "役満",
    han: "役満",
    openHan: "役満",
    description: D["字一色"],
    example: {
      hand: "333z555z66z",
      win: "6z",
      melds: [
        { type: "pon", tile: "1z" },
        { type: "pon", tile: "2z" },
      ],
    },
  },
  {
    name: "小四喜",
    match: "小四喜",
    group: "役満",
    han: "役満",
    openHan: "役満",
    description: D["小四喜"],
    example: {
      hand: "333z44z123m",
      win: "3m",
      melds: [
        { type: "pon", tile: "1z" },
        { type: "pon", tile: "2z" },
      ],
    },
  },
  {
    name: "大四喜",
    match: "大四喜",
    group: "役満",
    han: "役満",
    openHan: "役満",
    description: D["大四喜"],
    example: {
      hand: "444z55m",
      win: "5m",
      melds: [
        { type: "pon", tile: "1z" },
        { type: "pon", tile: "2z" },
        { type: "pon", tile: "3z" },
      ],
    },
  },
  { name: "緑一色", match: "緑一色", group: "役満", han: "役満", openHan: "役満", description: D["緑一色"], example: { hand: "22334444666888s", win: "8s", caption: "發なしの緑一色（学雀連ルールで可）" } },
  {
    name: "清老頭",
    match: "清老頭",
    group: "役満",
    han: "役満",
    openHan: "役満",
    description: D["清老頭"],
    example: {
      hand: "111s999s99m",
      win: "9m",
      melds: [
        { type: "pon", tile: "1m" },
        { type: "pon", tile: "9p" },
      ],
    },
  },
  {
    name: "四槓子",
    match: "四槓子",
    group: "役満",
    han: "役満",
    openHan: "役満",
    description: D["四槓子"],
    example: {
      hand: "77s",
      win: "7s",
      melds: [
        { type: "ankan", tile: "1m" },
        { type: "minkan", tile: "2p" },
        { type: "ankan", tile: "3s" },
        { type: "minkan", tile: "5z" },
      ],
    },
  },
  { name: "九蓮宝燈", match: "九蓮宝燈", group: "役満", han: "役満", openHan: null, description: D["九蓮宝燈"], example: { hand: "11123455678999p", win: "5p" } },
  {
    name: "天和",
    match: "天和",
    group: "役満",
    han: "役満",
    openHan: null,
    situational: true,
    description: D["天和"],
    example: { hand: "123m456p789s234s55p", win: "5p", ctx: { seatWind: 0, isTsumo: true, tenhou: true } },
  },
  {
    name: "地和",
    match: "地和",
    group: "役満",
    han: "役満",
    openHan: null,
    situational: true,
    description: D["地和"],
    example: { hand: "123m456p789s234s55p", win: "5p", ctx: { isTsumo: true, chiihou: true } },
  },

  // ---- ドラ（役ではない）
  { name: "ドラ", match: "ドラ", group: "ドラ", han: 1, openHan: 1, description: D["ドラ"] },
  { name: "赤ドラ", match: "赤ドラ", group: "ドラ", han: 1, openHan: 1, description: D["赤ドラ"] },
  { name: "裏ドラ", match: "裏ドラ", group: "ドラ", han: 1, openHan: null, description: D["裏ドラ"] },
];

export const YAKU_GROUPS: YakuGroup[] = ["1翻", "2翻", "3翻", "6翻", "役満", "ドラ"];

/** 例題を evaluateWin の入力に変換する */
export function exampleToInput(ex: YakuExample): WinInput {
  const { kinds, red } = parseTiles(ex.hand);
  const w = parseTiles(ex.win).kinds[0];
  const idx = kinds.indexOf(w);
  if (idx < 0) throw new Error(`例題の和了牌 ${ex.win} が手牌にありません`);
  const concealed = [...kinds];
  concealed.splice(idx, 1);
  return {
    concealed,
    melds: (ex.melds ?? []).map((m) => ({ type: m.type, tile: parseTiles(m.tile).kinds[0] })),
    winTile: w,
    isTsumo: false,
    ...base,
    redCount: red,
    ...ex.ctx,
  };
}
