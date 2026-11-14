import type { MeldType, WinResult } from "../evaluate";
import type { RuleConfig } from "../rules";
import type { Standing } from "../score";
import type { Tile } from "../tiles";

export type Seat = 0 | 1 | 2 | 3;

export interface CalledMeld {
  type: MeldType;
  /** 面子を構成する全ての牌（chi は昇順） */
  tiles: Tile[];
  /** 他家から取得した牌（暗槓は無し） */
  calledTile?: Tile;
  from?: number;
}

export interface Discard {
  tile: Tile;
  /** ツモ切り（河読みの学習用） */
  tsumogiri: boolean;
  /** 立直宣言牌 */
  riichi: boolean;
  /** 鳴かれた場合、鳴いた人の席 */
  calledBy?: number;
}

export interface PlayerState {
  name: string;
  isHuman: boolean;
  /** 手牌（副露を除く）。ツモ牌も含む */
  hand: Tile[];
  /** 直前にツモった牌（鳴いた直後は null） */
  drawn: Tile | null;
  melds: CalledMeld[];
  discards: Discard[];
  riichi: null | { discardIndex: number; double: boolean };
  ippatsu: boolean;
  /** 同巡内フリテン（次の自分の打牌で解除） */
  furitenTemp: boolean;
  /** 立直後の見逃しによる永久フリテン */
  furitenRiichi: boolean;
  /** 喰い替えで捨てられない牌種 */
  forbiddenKinds: number[];
  /** 包の対象: この席が責任を負う相手と役 */
  pao: { seat: number; yaku: "daisangen" | "daisuushii" | "suukantsu" } | null;
}

export type CallType = "ron" | "pon" | "chi" | "minkan";

export interface CallOption {
  type: CallType;
  /** 手牌から使う牌の id（ron/minkan は不要） */
  tileIds?: number[];
}

export interface PendingCalls {
  tile: Tile;
  from: number;
  /** discard: 通常の打牌 / kakan: 加槓（槍槓のみ可） */
  source: "discard" | "kakan";
  options: CallOption[][];
  /** 回答（null = 見送り、undefined = 未回答） */
  responses: (Action | null | undefined)[];
}

export type Action =
  | { type: "discard"; seat: number; tileId: number; riichi?: boolean }
  | { type: "tsumo"; seat: number }
  | { type: "ankan"; seat: number; kind: number }
  | { type: "kakan"; seat: number; kind: number }
  | { type: "ron"; seat: number }
  | { type: "pon"; seat: number; tileIds: number[] }
  | { type: "chi"; seat: number; tileIds: number[] }
  | { type: "minkan"; seat: number }
  | { type: "pass"; seat: number }
  | { type: "next" };

export type RoundResult =
  | {
      type: "win";
      winner: number;
      /** 放銃者（ツモなら null） */
      from: number | null;
      win: WinResult;
      hand: Tile[];
      melds: CalledMeld[];
      winTile: Tile;
      uraIndicators: Tile[];
      deltas: number[];
      paoSeat: number | null;
    }
  | {
      type: "draw";
      tenpai: boolean[];
      deltas: number[];
    };

export type Phase = "turn" | "calls" | "roundEnd" | "gameEnd";

export interface GameEvent {
  seat: number | null;
  text: string;
}

export interface GameState {
  rules: RuleConfig;
  seed: number;
  rngState: number;
  /** 0=東場 1=南場 */
  roundWind: 0 | 1;
  /** 親の席（＝局数-1） */
  dealer: number;
  honba: number;
  /** 供託の立直棒の本数 */
  kyotaku: number;
  scores: number[];

  wall: Tile[];
  drawPos: number;
  kanCount: number;
  /** 表示済みのドラ表示牌の枚数 */
  doraRevealed: number;

  players: PlayerState[];
  turn: number;
  phase: Phase;
  pending: PendingCalls | null;
  /** 第一巡で誰も鳴いていない間 true（ダブル立直・天和・地和の判定） */
  firstGoAround: boolean;
  /** 嶺上牌をツモった直後 */
  afterKan: boolean;
  /** 立直宣言牌が通ったら供託する席 */
  riichiPendingSeat: number | null;

  result: RoundResult | null;
  standings: Standing[] | null;
  events: GameEvent[];
}
