/**
 * ルール設定。
 *
 * 既定値は学生麻雀連盟（学雀連）競技規定（2024-03-25 改訂、Mリーグ準拠ベース）に従う。
 *   https://gakusei-majan.com/rule/
 *   https://gakusei-majan.com/rule/mahjong-hand/
 * 規定に明記がなく、このアプリで決めた項目は「アプリ判断」と注記する。
 */

export interface RuleConfig {
  /** 東南戦（"tonnan"）。西入なし */
  length: "tonpu" | "tonnan";
  westRound: boolean;
  startingPoints: number;
  returnPoints: number;
  /** 順位点（1着〜4着、単位: 1000点 = 1pt） */
  uma: [number, number, number, number];
  /** オカはトップ総取り */
  okaToTop: boolean;

  /** 赤ドラ（各色1枚） */
  redFives: boolean;
  kuitan: boolean;
  atozuke: boolean;
  pinfuTsumo: boolean;
  ippatsu: boolean;
  uraDora: boolean;
  kanDora: boolean;
  kanUraDora: boolean;
  /** 槓ドラ即めくり */
  kanDoraImmediate: boolean;

  honbaPoints: number;
  /** 流局時ノーテン罰符の総額 */
  notenPenaltyTotal: number;
  /** 親の連荘条件: テンパイ連荘 */
  dealerRenchan: "tenpai" | "agari";
  /** オーラス親のアガリやめ・テンパイやめ */
  allLastStop: boolean;
  /** 箱下: トップから借りて続行（トビ終了なし） */
  bust: "continue" | "end";

  /** ダブロン不可（頭ハネ） */
  multipleRon: "headBump" | "allowed";
  /** 途中流局なし（九種九牌・四風連打・四家立直・四槓散了・三家和） */
  abortiveDraws: boolean;
  /** 4回カン後の5回目のカン不可 */
  maxKans: number;

  /** フリテン立直は可。ただしロン不可・ツモ可 */
  furitenRiichi: boolean;
  /** 立直後の暗槓は面子構成が変わらない場合のみ */
  riichiAnkan: "noChange" | "never";
  /** 喰い替え不可 */
  kuikae: boolean;
  /** ツモ番のない立直も可 */
  riichiWithoutDraw: boolean;
  /** ノーテン立直（アプリ判断: 宣言できないようにする） */
  allowNotenRiichi: boolean;

  /** 切り上げ満貫（30符4翻・60符3翻） */
  kiriageMangan: boolean;
  /** 数え役満なし（13翻以上は三倍満止まり） */
  kazoeYakuman: boolean;
  /** 役満の複合は「純粋な複合」のみダブル以上（単一役満のダブル扱いなし） */
  doubleYakumanSingle: boolean;
  /** 連風牌の雀頭は 2 符 */
  doubleWindPairFu: 2 | 4;
  nagashiMangan: boolean;
  renhou: boolean;
  /** 緑一色は發なしでも可 */
  ryuuiisouWithoutHatsu: boolean;
  /** 国士無双の暗槓チャンカン不可 */
  kokushiAnkanChankan: boolean;
  /** 包: 大三元・大四喜・四槓子 */
  pao: readonly ("daisangen" | "daisuushii" | "suukantsu")[];
  /** 大明槓の嶺上開花は責任払いにしない */
  minkanRinshanPao: boolean;

  /** 対局人数構成（アプリ判断: 人間1 + CPU3） */
  seats: { humans: number; cpus: number };
}

export const GAKUREN_RULES: RuleConfig = {
  length: "tonnan",
  westRound: false,
  startingPoints: 25000,
  returnPoints: 30000,
  // 規定の「10,000点－30,000点」をアプリ判断で +30/+10/-10/-30 と解釈
  uma: [30, 10, -10, -30],
  okaToTop: true,

  redFives: true,
  kuitan: true,
  atozuke: true,
  pinfuTsumo: true,
  ippatsu: true,
  uraDora: true,
  kanDora: true,
  kanUraDora: true,
  kanDoraImmediate: true,

  honbaPoints: 300,
  notenPenaltyTotal: 3000,
  dealerRenchan: "tenpai",
  allLastStop: false,
  bust: "continue",

  multipleRon: "headBump",
  abortiveDraws: false,
  maxKans: 4,

  furitenRiichi: true,
  riichiAnkan: "noChange",
  kuikae: false,
  riichiWithoutDraw: true,
  allowNotenRiichi: false,

  kiriageMangan: true,
  kazoeYakuman: false,
  doubleYakumanSingle: false,
  doubleWindPairFu: 2,
  nagashiMangan: false,
  renhou: false,
  ryuuiisouWithoutHatsu: true,
  kokushiAnkanChankan: false,
  pao: ["daisangen", "daisuushii", "suukantsu"],
  minkanRinshanPao: false,

  seats: { humans: 1, cpus: 3 },
};
