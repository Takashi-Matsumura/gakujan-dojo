/**
 * 和了判定: 役・符・点数をまとめて計算する。
 * 複数の面子分解・待ちの取り方がある場合は最も高い点数になる解釈を採用する。
 */
import { GAKUREN_RULES, type RuleConfig } from "./rules";
import { calcPayment, type Payment } from "./score";
import { decompose, isChiitoitsu, isKokushi, type Decomposition } from "./shape";
import {
  CHUN,
  EAST,
  HAKU,
  HATSU,
  KIND_COUNT,
  doraFromIndicator,
  isDragon,
  isHonor,
  isSimple,
  isTerminal,
  isWind,
  isYaochu,
  kindName,
  suitOf,
  toCounts,
  type TileKind,
} from "./tiles";

export type MeldType = "chi" | "pon" | "minkan" | "kakan" | "ankan";

export interface Meld {
  type: MeldType;
  /** chi は先頭（最小）の牌、それ以外はその牌 */
  tile: TileKind;
}

export type Wind = 0 | 1 | 2 | 3;

export interface WinInput {
  /** 和了牌を除いた手牌（副露を除く） */
  concealed: TileKind[];
  melds: Meld[];
  winTile: TileKind;
  isTsumo: boolean;
  /** 0=東 1=南 2=西 3=北 */
  seatWind: Wind;
  roundWind: Wind;
  riichi?: "none" | "riichi" | "double";
  ippatsu?: boolean;
  /** 海底摸月（最後のツモ） */
  haitei?: boolean;
  /** 河底撈魚（最後の打牌でロン） */
  houtei?: boolean;
  rinshan?: boolean;
  chankan?: boolean;
  tenhou?: boolean;
  chiihou?: boolean;
  doraIndicators?: TileKind[];
  uraIndicators?: TileKind[];
  /** 手牌・副露・和了牌に含まれる赤5の枚数 */
  redCount?: number;
  honba?: number;
}

export interface YakuEntry {
  name: string;
  han: number;
  /** 役満の倍数（役満でなければ 0） */
  yakuman: number;
}

export interface FuEntry {
  label: string;
  fu: number;
}

export type WaitType = "ryanmen" | "kanchan" | "penchan" | "tanki" | "shanpon" | "kokushi";

export const WAIT_NAMES: Record<WaitType, string> = {
  ryanmen: "両面",
  kanchan: "嵌張",
  penchan: "辺張",
  tanki: "単騎",
  shanpon: "双碰",
  kokushi: "国士",
};

export interface WinResult {
  yaku: YakuEntry[];
  han: number;
  fu: number;
  /** 符の内訳（切り上げ前） */
  fuDetail: FuEntry[];
  yakuman: number;
  payment: Payment;
  waitType: WaitType;
  /** 採用した面子構成の説明 */
  structure: string;
}

/** 和了時の面子1つ（副露を含む） */
interface Block {
  type: "shuntsu" | "koutsu" | "kantsu";
  tile: TileKind;
  /** 副露、またはロンで完成した双碰の刻子 */
  open: boolean;
  /** 副露面子か（門前判定用） */
  called: boolean;
}

type RuleSubset = Pick<
  RuleConfig,
  "kiriageMangan" | "kazoeYakuman" | "honbaPoints" | "doubleWindPairFu" | "kuitan"
>;

const GREEN = new Set<TileKind>([19, 20, 21, 23, 25, HATSU]);

const blockTiles = (b: Block): TileKind[] =>
  b.type === "shuntsu" ? [b.tile, b.tile + 1, b.tile + 2] : [b.tile, b.tile, b.tile];

const isTriplet = (b: Block) => b.type !== "shuntsu";

function meldToBlock(m: Meld): Block {
  if (m.type === "chi") return { type: "shuntsu", tile: m.tile, open: true, called: true };
  if (m.type === "pon") return { type: "koutsu", tile: m.tile, open: true, called: true };
  if (m.type === "ankan") return { type: "kantsu", tile: m.tile, open: false, called: false };
  return { type: "kantsu", tile: m.tile, open: true, called: true };
}

function countDora(input: WinInput, allTiles: readonly TileKind[]) {
  const count = (inds: TileKind[] | undefined) =>
    (inds ?? []).reduce((sum, ind) => {
      const d = doraFromIndicator(ind);
      return sum + allTiles.filter((t) => t === d).length;
    }, 0);
  return {
    dora: count(input.doraIndicators),
    ura: input.riichi && input.riichi !== "none" ? count(input.uraIndicators) : 0,
    red: input.redCount ?? 0,
  };
}

function doraEntries(d: { dora: number; ura: number; red: number }): YakuEntry[] {
  const out: YakuEntry[] = [];
  if (d.dora) out.push({ name: "ドラ", han: d.dora, yakuman: 0 });
  if (d.red) out.push({ name: "赤ドラ", han: d.red, yakuman: 0 });
  if (d.ura) out.push({ name: "裏ドラ", han: d.ura, yakuman: 0 });
  return out;
}

/** 状況役（手の形に依存しない役） */
function situationalYaku(input: WinInput, menzen: boolean): YakuEntry[] {
  const out: YakuEntry[] = [];
  if (input.riichi === "double") out.push({ name: "ダブル立直", han: 2, yakuman: 0 });
  else if (input.riichi === "riichi") out.push({ name: "立直", han: 1, yakuman: 0 });
  if (input.ippatsu && input.riichi && input.riichi !== "none")
    out.push({ name: "一発", han: 1, yakuman: 0 });
  if (menzen && input.isTsumo) out.push({ name: "門前清自摸和", han: 1, yakuman: 0 });
  if (input.haitei && input.isTsumo) out.push({ name: "海底摸月", han: 1, yakuman: 0 });
  if (input.houtei && !input.isTsumo) out.push({ name: "河底撈魚", han: 1, yakuman: 0 });
  if (input.rinshan && input.isTsumo) out.push({ name: "嶺上開花", han: 1, yakuman: 0 });
  if (input.chankan && !input.isTsumo) out.push({ name: "槍槓", han: 1, yakuman: 0 });
  return out;
}

function situationalYakuman(input: WinInput): YakuEntry[] {
  const out: YakuEntry[] = [];
  if (input.tenhou) out.push({ name: "天和", han: 0, yakuman: 1 });
  if (input.chiihou) out.push({ name: "地和", han: 0, yakuman: 1 });
  return out;
}

/** 字一色・清老頭・緑一色・混老頭・断么九・染め手など、牌の集合だけで決まる役 */
function tileSetYaku(
  all: readonly TileKind[],
  menzen: boolean,
  rules: RuleSubset,
): { yakuman: YakuEntry[]; normal: YakuEntry[] } {
  const yakuman: YakuEntry[] = [];
  const normal: YakuEntry[] = [];
  if (all.every(isHonor)) yakuman.push({ name: "字一色", han: 0, yakuman: 1 });
  if (all.every(isTerminal)) yakuman.push({ name: "清老頭", han: 0, yakuman: 1 });
  if (all.every((t) => GREEN.has(t))) yakuman.push({ name: "緑一色", han: 0, yakuman: 1 });

  if (all.every(isYaochu) && !all.every(isHonor) && !all.every(isTerminal))
    normal.push({ name: "混老頭", han: 2, yakuman: 0 });
  if (all.every(isSimple) && (menzen || rules.kuitan))
    normal.push({ name: "断么九", han: 1, yakuman: 0 });

  const suits = new Set(all.filter((t) => !isHonor(t)).map(suitOf));
  const hasHonor = all.some(isHonor);
  if (suits.size === 1) {
    if (hasHonor) normal.push({ name: "混一色", han: menzen ? 3 : 2, yakuman: 0 });
    else normal.push({ name: "清一色", han: menzen ? 6 : 5, yakuman: 0 });
  }
  return { yakuman, normal };
}

interface Candidate {
  yaku: YakuEntry[];
  fu: number;
  fuDetail: FuEntry[];
  waitType: WaitType;
  structure: string;
}

function finalize(
  c: Candidate,
  input: WinInput,
  rules: RuleSubset,
  dora: { dora: number; ura: number; red: number },
): WinResult | null {
  const yakumanList = c.yaku.filter((y) => y.yakuman > 0);
  let yaku: YakuEntry[];
  let yakuman = 0;
  if (yakumanList.length) {
    yaku = yakumanList;
    yakuman = yakumanList.reduce((a, y) => a + y.yakuman, 0);
  } else {
    if (c.yaku.length === 0) return null; // 役なし
    yaku = [...c.yaku, ...doraEntries(dora)];
  }
  const han = yaku.reduce((a, y) => a + y.han, 0);
  const isDealer = input.seatWind === 0;
  const payment = calcPayment({
    han,
    fu: c.fu,
    yakuman,
    isDealer,
    isTsumo: input.isTsumo,
    honba: input.honba ?? 0,
    rules,
  });
  return {
    yaku,
    han,
    fu: c.fu,
    fuDetail: c.fuDetail,
    yakuman,
    payment,
    waitType: c.waitType,
    structure: c.structure,
  };
}

const better = (a: WinResult | null, b: WinResult | null): WinResult | null => {
  if (!a) return b;
  if (!b) return a;
  if (b.payment.total !== a.payment.total) return b.payment.total > a.payment.total ? b : a;
  if (b.han !== a.han) return b.han > a.han ? b : a;
  return b.fu > a.fu ? b : a;
};

/**
 * 和了を評価する。アガリ形でない、または役がない場合は null。
 */
export function evaluateWin(
  input: WinInput,
  rules: RuleSubset = GAKUREN_RULES,
): WinResult | null {
  const closedTiles = [...input.concealed, input.winTile];
  const meldBlocks = input.melds.map(meldToBlock);
  const meldTiles = meldBlocks.flatMap(blockTiles);
  const all = [...closedTiles, ...meldTiles];
  if (closedTiles.length + input.melds.length * 3 !== 14) {
    throw new Error("手牌の枚数が不正です（和了牌込みで 14 枚相当である必要があります）");
  }
  const counts = toCounts(closedTiles);
  const menzen = input.melds.every((m) => m.type === "ankan");
  const dora = countDora(input, all);
  const situational = situationalYaku(input, menzen);
  const sitYakuman = situationalYakuman(input);
  const tileSet = tileSetYaku(all, menzen, rules);

  let best: WinResult | null = null;

  // 国士無双
  if (input.melds.length === 0 && isKokushi(counts)) {
    best = better(
      best,
      finalize(
        {
          yaku: [...sitYakuman, { name: "国士無双", han: 0, yakuman: 1 }],
          fu: 0,
          fuDetail: [],
          waitType: "kokushi",
          structure: "国士無双",
        },
        input,
        rules,
        dora,
      ),
    );
    return best;
  }

  // 七対子
  if (input.melds.length === 0 && isChiitoitsu(counts)) {
    const yaku: YakuEntry[] = [
      ...sitYakuman,
      ...tileSet.yakuman.filter((y) => y.name === "字一色"),
      ...situational,
      { name: "七対子", han: 2, yakuman: 0 },
      ...tileSet.normal,
    ];
    best = better(
      best,
      finalize(
        {
          yaku,
          fu: 25,
          fuDetail: [{ label: "七対子（固定）", fu: 25 }],
          waitType: "tanki",
          structure: "七対子",
        },
        input,
        rules,
        dora,
      ),
    );
  }

  // 一般形
  for (const d of decompose(counts)) {
    for (const choice of waitChoices(d, input.winTile)) {
      const blocks: Block[] = [
        ...d.sets.map((s, i) => ({
          type: s.type,
          tile: s.tile,
          // ロンで完成した双碰の刻子は明刻扱い
          open: !input.isTsumo && choice.setIndex === i && choice.wait === "shanpon",
          called: false,
        })),
        ...meldBlocks,
      ];
      const cand = evaluateRegular(
        input,
        rules,
        d,
        blocks,
        choice.wait,
        menzen,
        situational,
        sitYakuman,
        tileSet,
      );
      best = better(best, finalize(cand, input, rules, dora));
    }
  }
  return best;
}

interface WaitChoice {
  wait: WaitType;
  /** 和了牌を含む面子の index（雀頭なら -1） */
  setIndex: number;
}

function waitChoices(d: Decomposition, w: TileKind): WaitChoice[] {
  const out: WaitChoice[] = [];
  if (d.pair === w) out.push({ wait: "tanki", setIndex: -1 });
  d.sets.forEach((s, i) => {
    if (s.type === "koutsu") {
      if (s.tile === w) out.push({ wait: "shanpon", setIndex: i });
      return;
    }
    const pos = w - s.tile;
    if (pos === 1) out.push({ wait: "kanchan", setIndex: i });
    else if (pos === 0) out.push({ wait: s.tile % 9 === 6 ? "penchan" : "ryanmen", setIndex: i });
    else if (pos === 2) out.push({ wait: s.tile % 9 === 0 ? "penchan" : "ryanmen", setIndex: i });
  });
  return out;
}

function evaluateRegular(
  input: WinInput,
  rules: RuleSubset,
  d: Decomposition,
  blocks: Block[],
  wait: WaitType,
  menzen: boolean,
  situational: YakuEntry[],
  sitYakuman: YakuEntry[],
  tileSet: { yakuman: YakuEntry[]; normal: YakuEntry[] },
): Candidate {
  const seatWindTile = EAST + input.seatWind;
  const roundWindTile = EAST + input.roundWind;
  const pair = d.pair;
  const triplets = blocks.filter(isTriplet);
  const shuntsu = blocks.filter((b) => b.type === "shuntsu");
  const kans = blocks.filter((b) => b.type === "kantsu");
  const concealedTriplets = triplets.filter((b) => !b.open).length;
  const tripletOf = (t: TileKind) => triplets.some((b) => b.tile === t);

  // ---- 役満
  const yakuman: YakuEntry[] = [...sitYakuman, ...tileSet.yakuman];
  if (concealedTriplets === 4) yakuman.push({ name: "四暗刻", han: 0, yakuman: 1 });
  const dragonTriplets = [HAKU, HATSU, CHUN].filter(tripletOf).length;
  if (dragonTriplets === 3) yakuman.push({ name: "大三元", han: 0, yakuman: 1 });
  const windTriplets = [27, 28, 29, 30].filter(tripletOf).length;
  if (windTriplets === 4) yakuman.push({ name: "大四喜", han: 0, yakuman: 1 });
  else if (windTriplets === 3 && isWind(pair))
    yakuman.push({ name: "小四喜", han: 0, yakuman: 1 });
  if (kans.length === 4) yakuman.push({ name: "四槓子", han: 0, yakuman: 1 });
  if (input.melds.length === 0 && isChuuren(input)) {
    yakuman.push({ name: "九蓮宝燈", han: 0, yakuman: 1 });
  }

  // ---- 通常役
  const yaku: YakuEntry[] = [...situational];

  // 役牌
  for (const t of triplets) {
    if (isDragon(t.tile)) yaku.push({ name: `役牌 ${kindName(t.tile)}`, han: 1, yakuman: 0 });
    const seat = t.tile === seatWindTile;
    const round = t.tile === roundWindTile;
    if (seat && round)
      yaku.push({ name: `連風牌 ${kindName(t.tile)}`, han: 2, yakuman: 0 });
    else if (seat) yaku.push({ name: `自風 ${kindName(t.tile)}`, han: 1, yakuman: 0 });
    else if (round) yaku.push({ name: `場風 ${kindName(t.tile)}`, han: 1, yakuman: 0 });
  }

  const pairIsYakuhai = isDragon(pair) || pair === seatWindTile || pair === roundWindTile;
  const pinfu = menzen && shuntsu.length === 4 && !pairIsYakuhai && wait === "ryanmen";
  if (pinfu) yaku.push({ name: "平和", han: 1, yakuman: 0 });

  if (menzen) {
    const seqCount = new Map<number, number>();
    for (const s of shuntsu) seqCount.set(s.tile, (seqCount.get(s.tile) ?? 0) + 1);
    let peiko = 0;
    for (const n of seqCount.values()) peiko += Math.floor(n / 2);
    if (peiko === 2) yaku.push({ name: "二盃口", han: 3, yakuman: 0 });
    else if (peiko === 1) yaku.push({ name: "一盃口", han: 1, yakuman: 0 });
  }

  if (triplets.length === 4) yaku.push({ name: "対々和", han: 2, yakuman: 0 });
  if (concealedTriplets === 3) yaku.push({ name: "三暗刻", han: 2, yakuman: 0 });
  if (kans.length === 3) yaku.push({ name: "三槓子", han: 2, yakuman: 0 });
  if (dragonTriplets === 2 && isDragon(pair))
    yaku.push({ name: "小三元", han: 2, yakuman: 0 });

  for (let n = 0; n < 9; n++) {
    if ([n, n + 9, n + 18].every(tripletOf)) {
      yaku.push({ name: "三色同刻", han: 2, yakuman: 0 });
      break;
    }
  }
  const seqOf = (t: TileKind) => shuntsu.some((b) => b.tile === t);
  for (let n = 0; n < 7; n++) {
    if ([n, n + 9, n + 18].every(seqOf)) {
      yaku.push({ name: "三色同順", han: menzen ? 2 : 1, yakuman: 0 });
      break;
    }
  }
  for (const base of [0, 9, 18]) {
    if ([base, base + 3, base + 6].every(seqOf)) {
      yaku.push({ name: "一気通貫", han: menzen ? 2 : 1, yakuman: 0 });
      break;
    }
  }

  // 全帯么九 / 純全帯么九（順子を含む場合のみ。順子なしは混老頭・清老頭）
  const allBlocksYaochu =
    isYaochu(pair) && blocks.every((b) => blockTiles(b).some(isYaochu));
  if (allBlocksYaochu && shuntsu.length > 0) {
    const anyHonor = isHonor(pair) || blocks.some((b) => isHonor(b.tile));
    if (anyHonor) yaku.push({ name: "混全帯么九", han: menzen ? 2 : 1, yakuman: 0 });
    else yaku.push({ name: "純全帯么九", han: menzen ? 3 : 2, yakuman: 0 });
  }

  yaku.push(...tileSet.normal);

  // ---- 符
  const { fu, fuDetail } = calcFu(input, rules, pair, blocks, wait, menzen, pinfu, {
    seatWindTile,
    roundWindTile,
  });

  const structure = [
    `雀頭 ${kindName(pair)}${kindName(pair)}`,
    ...blocks.map(describeBlock),
  ].join(" / ");

  return {
    yaku: yakuman.length ? yakuman : yaku,
    fu,
    fuDetail,
    waitType: wait,
    structure,
  };
}

function describeBlock(b: Block): string {
  const tiles = blockTiles(b).map(kindName).join("");
  const kind =
    b.type === "shuntsu"
      ? b.called
        ? "明順"
        : "暗順"
      : b.type === "koutsu"
        ? b.open
          ? "明刻"
          : "暗刻"
        : b.open
          ? "明槓"
          : "暗槓";
  return `${kind} ${tiles}`;
}

function isChuuren(input: WinInput): boolean {
  const c = toCounts([...input.concealed, input.winTile]);
  for (const base of [0, 9, 18]) {
    const need = [3, 1, 1, 1, 1, 1, 1, 1, 3];
    let ok = true;
    let total = 0;
    for (let k = 0; k < KIND_COUNT; k++) {
      const inSuit = k >= base && k < base + 9;
      if (!inSuit && c[k] > 0) ok = false;
      if (inSuit) {
        if (c[k] < need[k - base]) ok = false;
        total += c[k];
      }
    }
    if (ok && total === 14) return true;
  }
  return false;
}

function calcFu(
  input: WinInput,
  rules: RuleSubset,
  pair: TileKind,
  blocks: Block[],
  wait: WaitType,
  menzen: boolean,
  pinfu: boolean,
  w: { seatWindTile: TileKind; roundWindTile: TileKind },
): { fu: number; fuDetail: FuEntry[] } {
  if (pinfu && input.isTsumo) {
    return { fu: 20, fuDetail: [{ label: "平和ツモ（固定）", fu: 20 }] };
  }
  const detail: FuEntry[] = [{ label: "副底", fu: 20 }];
  if (menzen && !input.isTsumo) detail.push({ label: "門前ロン", fu: 10 });
  if (input.isTsumo) detail.push({ label: "ツモ", fu: 2 });
  if (wait === "kanchan" || wait === "penchan" || wait === "tanki") {
    detail.push({ label: `${WAIT_NAMES[wait]}待ち`, fu: 2 });
  }

  // 雀頭
  const isSeat = pair === w.seatWindTile;
  const isRound = pair === w.roundWindTile;
  if (isDragon(pair)) detail.push({ label: `雀頭 ${kindName(pair)}（役牌）`, fu: 2 });
  else if (isSeat && isRound)
    detail.push({ label: `雀頭 ${kindName(pair)}（連風牌）`, fu: rules.doubleWindPairFu });
  else if (isSeat || isRound)
    detail.push({ label: `雀頭 ${kindName(pair)}（${isSeat ? "自風" : "場風"}）`, fu: 2 });

  // 面子
  for (const b of blocks) {
    if (b.type === "shuntsu") continue;
    let fu = b.type === "kantsu" ? 8 : 2;
    if (!b.open) fu *= 2;
    if (isYaochu(b.tile)) fu *= 2;
    detail.push({ label: `${describeBlock(b)}${isYaochu(b.tile) ? "（么九）" : ""}`, fu });
  }

  const raw = detail.reduce((a, e) => a + e.fu, 0);
  let fu = Math.ceil(raw / 10) * 10;
  if (fu === 20 && !input.isTsumo) {
    // 喰い平和形のロン
    fu = 30;
    detail.push({ label: "鳴き手の最低符（30符に繰り上げ）", fu: 10 });
  }
  return { fu, fuDetail: detail };
}
