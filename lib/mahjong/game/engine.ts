/**
 * 対局エンジン（純粋関数）。
 *
 * applyAction(state, action) で次の状態を返す。UI やサーバから独立しており、
 * 将来の複数人対戦ではサーバ側でこのエンジンを動かす想定。
 */
import { evaluateWin, type Meld, type WinInput } from "../evaluate";
import { GAKUREN_RULES, type RuleConfig } from "../rules";
import { calcPayment, settle } from "../score";
import { decompose, shanten, waits } from "../shape";
import {
  CHUN,
  HAKU,
  HATSU,
  createWall,
  doraFromIndicator,
  kindName,
  toCounts,
  type Tile,
  type TileKind,
} from "../tiles";
import { shuffle } from "./rng";
import type {
  Action,
  CallOption,
  CalledMeld,
  GameState,
  PendingCalls,
  PlayerState,
  RoundResult,
} from "./types";

const DEAD_WALL_START = 122;
const RINSHAN_START = 122;
const DORA_START = 126;
const URA_START = 131;

const WIND_NAMES = ["東", "南", "西", "北"];

// ------------------------------------------------------------------ 生成

export interface NewGameOptions {
  seed: number;
  names?: string[];
  humanSeats?: number[];
  rules?: RuleConfig;
}

export function createGame(opts: NewGameOptions): GameState {
  const rules = opts.rules ?? GAKUREN_RULES;
  const names = opts.names ?? ["あなた", "CPU 下家", "CPU 対面", "CPU 上家"];
  const humans = new Set(opts.humanSeats ?? [0]);
  const state: GameState = {
    rules,
    seed: opts.seed,
    rngState: opts.seed >>> 0,
    roundWind: 0,
    dealer: 0,
    honba: 0,
    kyotaku: 0,
    scores: [0, 1, 2, 3].map(() => rules.startingPoints),
    wall: [],
    drawPos: 0,
    kanCount: 0,
    discardSeq: 0,
    doraRevealed: 1,
    players: names.map((name, i) => emptyPlayer(name, humans.has(i))),
    turn: 0,
    phase: "turn",
    pending: null,
    firstGoAround: true,
    afterKan: false,
    riichiPendingSeat: null,
    result: null,
    standings: null,
    events: [],
  };
  startRound(state);
  return state;
}

function emptyPlayer(name: string, isHuman: boolean): PlayerState {
  return {
    name,
    isHuman,
    hand: [],
    drawn: null,
    melds: [],
    discards: [],
    riichi: null,
    ippatsu: false,
    furitenTemp: false,
    furitenRiichi: false,
    forbiddenKinds: [],
    pao: null,
  };
}

function startRound(s: GameState): void {
  const [wall, next] = shuffle(createWall(s.rules.redFives), s.rngState);
  s.rngState = next;
  s.wall = wall;
  s.drawPos = 0;
  s.kanCount = 0;
  s.discardSeq = 0;
  s.doraRevealed = 1;
  s.players = s.players.map((p) => emptyPlayer(p.name, p.isHuman));
  for (let i = 0; i < 4; i++) {
    const seat = (s.dealer + i) % 4;
    s.players[seat].hand = wall.slice(i * 13, i * 13 + 13);
    sortHand(s.players[seat].hand);
  }
  s.drawPos = 52;
  s.turn = s.dealer;
  s.phase = "turn";
  s.pending = null;
  s.firstGoAround = true;
  s.afterKan = false;
  s.riichiPendingSeat = null;
  s.result = null;
  s.events = [{ seat: null, text: `${roundLabel(s)} 開始` }];
  drawTile(s, s.dealer);
}

export function roundLabel(s: Pick<GameState, "roundWind" | "dealer" | "honba">): string {
  return `${WIND_NAMES[s.roundWind]}${s.dealer + 1}局${s.honba ? ` ${s.honba}本場` : ""}`;
}

// ------------------------------------------------------------------ 参照系

const sortHand = (hand: Tile[]) => hand.sort((a, b) => a.kind - b.kind || a.id - b.id);

export const liveEnd = (s: GameState) => DEAD_WALL_START - s.kanCount;
export const remainingTiles = (s: GameState) => liveEnd(s) - s.drawPos;

export function doraIndicators(s: GameState): Tile[] {
  return s.wall.slice(DORA_START, DORA_START + s.doraRevealed);
}
function uraIndicators(s: GameState): Tile[] {
  return s.wall.slice(URA_START, URA_START + s.doraRevealed);
}

export const seatWind = (s: GameState, seat: number) => ((seat - s.dealer + 4) % 4) as 0 | 1 | 2 | 3;

const isMenzen = (p: PlayerState) => p.melds.every((m) => m.type === "ankan");

export function toMelds(p: PlayerState): Meld[] {
  return p.melds.map((m) => ({
    type: m.type,
    tile: Math.min(...m.tiles.map((t) => t.kind)),
  }));
}

export function handCounts(tiles: readonly Tile[]): number[] {
  return toCounts(tiles.map((t) => t.kind));
}

/** 13枚（3n+1）の手牌の待ち */
export function playerWaits(p: PlayerState, hand: readonly Tile[] = p.hand): TileKind[] {
  return waits(handCounts(hand), p.melds.length);
}

export function isFuriten(p: PlayerState): boolean {
  if (p.furitenTemp || p.furitenRiichi) return true;
  const w = playerWaits(p);
  return p.discards.some((d) => w.includes(d.tile.kind));
}

function buildWinInput(
  s: GameState,
  seat: number,
  winTile: Tile,
  isTsumo: boolean,
  extra: { chankan?: boolean } = {},
): WinInput {
  const p = s.players[seat];
  const handTiles = isTsumo ? p.hand.filter((t) => t.id !== winTile.id) : p.hand;
  const allTiles = [...handTiles, winTile, ...p.melds.flatMap((m) => m.tiles)];
  const remaining = remainingTiles(s);
  const first = s.firstGoAround && p.discards.length === 0 && isTsumo;
  return {
    concealed: handTiles.map((t) => t.kind),
    melds: toMelds(p),
    winTile: winTile.kind,
    isTsumo,
    seatWind: seatWind(s, seat),
    roundWind: s.roundWind,
    riichi: p.riichi ? (p.riichi.double ? "double" : "riichi") : "none",
    ippatsu: p.ippatsu,
    haitei: isTsumo && remaining === 0 && !s.afterKan,
    houtei: !isTsumo && remaining === 0 && !extra.chankan,
    rinshan: isTsumo && s.afterKan,
    chankan: extra.chankan,
    tenhou: first && seat === s.dealer,
    chiihou: first && seat !== s.dealer,
    doraIndicators: doraIndicators(s).map((t) => t.kind),
    uraIndicators: s.rules.uraDora ? uraIndicators(s).map((t) => t.kind) : [],
    redCount: allTiles.filter((t) => t.red).length,
    honba: s.honba,
  };
}

// ------------------------------------------------------------------ 合法手

export interface TurnOptions {
  canTsumo: boolean;
  /** 捨てられる牌の id */
  discards: number[];
  /** 立直宣言できる捨て牌の id（空なら立直不可） */
  riichiDiscards: number[];
  ankan: TileKind[];
  kakan: TileKind[];
}

export function turnOptions(s: GameState, seat: number): TurnOptions {
  const empty: TurnOptions = { canTsumo: false, discards: [], riichiDiscards: [], ankan: [], kakan: [] };
  if (s.phase !== "turn" || s.turn !== seat) return empty;
  const p = s.players[seat];
  const remaining = remainingTiles(s);

  const canTsumo = !!p.drawn && !!evaluateWin(buildWinInput(s, seat, p.drawn, true), s.rules);

  let discards: number[];
  if (p.riichi) {
    discards = p.drawn ? [p.drawn.id] : [];
  } else {
    discards = p.hand.filter((t) => !p.forbiddenKinds.includes(t.kind)).map((t) => t.id);
    if (discards.length === 0) discards = p.hand.map((t) => t.id);
  }

  const riichiDiscards: number[] = [];
  if (!p.riichi && isMenzen(p) && s.scores[seat] >= 1000 && p.drawn) {
    const byKind = new Map<TileKind, boolean>();
    for (const t of p.hand) {
      let ok = byKind.get(t.kind);
      if (ok === undefined) {
        const rest = p.hand.filter((x) => x.id !== t.id);
        ok =
          shanten(handCounts(rest), p.melds.length).shanten === 0 &&
          (s.rules.allowNotenRiichi || playerWaits(p, rest).length > 0);
        byKind.set(t.kind, ok);
      }
      if (ok) riichiDiscards.push(t.id);
    }
  }

  const kanAllowed = s.kanCount < s.rules.maxKans && remaining > 0;
  const counts = handCounts(p.hand);
  const ankan: TileKind[] = [];
  const kakan: TileKind[] = [];
  if (kanAllowed && p.drawn) {
    for (let k = 0; k < 34; k++) {
      if (counts[k] === 4 && (!p.riichi || riichiAnkanOk(p, k))) ankan.push(k);
    }
    if (!p.riichi) {
      for (const m of p.melds) {
        const k = m.tiles[0].kind;
        if (m.type === "pon" && counts[k] >= 1) kakan.push(k);
      }
    }
  }
  return { canTsumo, discards, riichiDiscards, ankan, kakan };
}

/** 立直後の暗槓: ツモ牌での槓（送り槓不可）で、待ちと面子構成が変わらないこと */
function riichiAnkanOk(p: PlayerState, kind: TileKind): boolean {
  if (!p.drawn || p.drawn.kind !== kind) return false;
  const before = p.hand.filter((t) => t.id !== p.drawn!.id);
  const waitsBefore = playerWaits(p, before);
  if (waitsBefore.length === 0) return false;
  for (const w of waitsBefore) {
    const c = handCounts(before);
    c[w]++;
    const ds = decompose(c);
    if (ds.length === 0) return false;
    if (!ds.every((d) => d.sets.some((x) => x.type === "koutsu" && x.tile === kind))) return false;
  }
  const after = before.filter((t) => t.kind !== kind);
  const waitsAfter = waits(handCounts(after), p.melds.length + 1);
  return waitsAfter.length === waitsBefore.length && waitsAfter.every((w) => waitsBefore.includes(w));
}

function callOptionsFor(s: GameState, seat: number, tile: Tile, from: number, source: "discard" | "kakan"): CallOption[] {
  const p = s.players[seat];
  const out: CallOption[] = [];
  const w = playerWaits(p);
  if (w.includes(tile.kind) && !isFuriten(p)) {
    const input = buildWinInput(s, seat, tile, false, { chankan: source === "kakan" });
    if (evaluateWin(input, s.rules)) out.push({ type: "ron" });
  }
  if (source === "kakan" || p.riichi || remainingTiles(s) === 0) return out;

  const same = p.hand.filter((t) => t.kind === tile.kind);
  if (same.length >= 2) {
    // 赤を含む/含まないの選択肢を分ける
    const variants = new Map<string, number[]>();
    for (let i = 0; i < same.length; i++)
      for (let j = i + 1; j < same.length; j++) {
        const key = `${same[i].red}-${same[j].red}`;
        if (!variants.has(key)) variants.set(key, [same[i].id, same[j].id]);
      }
    for (const ids of variants.values()) {
      if (canDiscardAfter(p, ids, tile, "pon")) out.push({ type: "pon", tileIds: ids });
    }
  }
  if (same.length === 3 && s.kanCount < s.rules.maxKans) out.push({ type: "minkan" });

  if (seat === (from + 1) % 4 && tile.kind < 27) {
    const n = tile.kind % 9;
    const patterns: [number, number][] = [];
    if (n >= 2) patterns.push([-2, -1]);
    if (n >= 1 && n <= 7) patterns.push([-1, 1]);
    if (n <= 6) patterns.push([1, 2]);
    for (const [a, b] of patterns) {
      const as = p.hand.filter((t) => t.kind === tile.kind + a);
      const bs = p.hand.filter((t) => t.kind === tile.kind + b);
      const seen = new Set<string>();
      for (const x of as)
        for (const y of bs) {
          const key = `${a}${x.red}-${b}${y.red}`;
          if (seen.has(key)) continue;
          seen.add(key);
          if (canDiscardAfter(p, [x.id, y.id], tile, "chi"))
            out.push({ type: "chi", tileIds: [x.id, y.id] });
        }
    }
  }
  return out;
}

/** 喰い替えで捨てられない牌種 */
function kuikaeKinds(used: Tile[], called: Tile, type: "pon" | "chi"): TileKind[] {
  const k = called.kind;
  if (type === "pon") return [k];
  const [a, b] = used.map((t) => t.kind).sort((x, y) => x - y);
  const out = [k];
  if (b - a === 1) {
    if (k === a - 1 && (b + 1) % 9 !== 0 && Math.floor((b + 1) / 9) === Math.floor(b / 9)) out.push(b + 1);
    if (k === b + 1 && a % 9 !== 0) out.push(a - 1);
  }
  return out;
}

function canDiscardAfter(p: PlayerState, ids: number[], called: Tile, type: "pon" | "chi"): boolean {
  const used = p.hand.filter((t) => ids.includes(t.id));
  const rest = p.hand.filter((t) => !ids.includes(t.id));
  const forbidden = kuikaeKinds(used, called, type);
  return rest.some((t) => !forbidden.includes(t.kind));
}

// ------------------------------------------------------------------ 進行

function log(s: GameState, seat: number | null, text: string) {
  s.events.push({ seat, text });
  if (s.events.length > 200) s.events.splice(0, s.events.length - 200);
}

function drawTile(s: GameState, seat: number): void {
  const tile = s.wall[s.drawPos++];
  const p = s.players[seat];
  p.hand.push(tile);
  p.drawn = tile;
  s.turn = seat;
  s.phase = "turn";
  s.afterKan = false;
}

function drawRinshan(s: GameState, seat: number): void {
  const tile = s.wall[RINSHAN_START + s.kanCount];
  s.kanCount++;
  if (s.rules.kanDora && s.rules.kanDoraImmediate) s.doraRevealed = Math.min(5, s.doraRevealed + 1);
  const p = s.players[seat];
  p.hand.push(tile);
  p.drawn = tile;
  s.turn = seat;
  s.phase = "turn";
  s.afterKan = true;
}

function clearIppatsu(s: GameState) {
  for (const p of s.players) p.ippatsu = false;
}

/** 状態をコピーしてアクションを適用する */
export function applyAction(prev: GameState, action: Action): GameState {
  const s = structuredClone(prev);
  switch (action.type) {
    case "next":
      if (s.phase !== "roundEnd") throw new Error("局が終わっていません");
      advanceRound(s);
      return s;
    case "discard":
      doDiscard(s, action.seat, action.tileId, !!action.riichi);
      return s;
    case "tsumo":
      doTsumo(s, action.seat);
      return s;
    case "ankan":
      doAnkan(s, action.seat, action.kind);
      return s;
    case "kakan":
      doKakan(s, action.seat, action.kind);
      return s;
    default:
      respond(s, action);
      return s;
  }
}

function assertTurn(s: GameState, seat: number) {
  if (s.phase !== "turn" || s.turn !== seat) throw new Error("手番ではありません");
}

function doDiscard(s: GameState, seat: number, tileId: number, riichi: boolean) {
  assertTurn(s, seat);
  const opts = turnOptions(s, seat);
  if (riichi ? !opts.riichiDiscards.includes(tileId) : !opts.discards.includes(tileId)) {
    throw new Error(riichi ? "この牌では立直できません" : "この牌は捨てられません");
  }
  const p = s.players[seat];
  const idx = p.hand.findIndex((t) => t.id === tileId);
  const [tile] = p.hand.splice(idx, 1);
  const tsumogiri = p.drawn?.id === tileId;
  sortHand(p.hand);

  if (p.riichi && p.ippatsu) p.ippatsu = false;
  if (!p.riichi) p.furitenTemp = false;
  if (riichi) {
    p.riichi = { discardIndex: p.discards.length, double: s.firstGoAround && p.discards.length === 0 };
    s.riichiPendingSeat = seat;
  }
  p.discards.push({ tile, seq: s.discardSeq++, tsumogiri, riichi });
  p.drawn = null;
  p.forbiddenKinds = [];
  s.afterKan = false;
  log(s, seat, `${riichi ? "立直 " : ""}${kindName(tile.kind)} 切り`);

  openCalls(s, tile, seat, "discard");
}

function openCalls(s: GameState, tile: Tile, from: number, source: "discard" | "kakan") {
  const options = [0, 1, 2, 3].map((i) => (i === from ? [] : callOptionsFor(s, i, tile, from, source)));
  const pending: PendingCalls = {
    tile,
    from,
    source,
    options,
    responses: options.map((o) => (o.length ? undefined : null)),
  };
  s.pending = pending;
  s.phase = "calls";
  maybeResolve(s);
}

/** 他家への見逃しフリテン付与 */
function applyMissedRon(s: GameState, tile: Tile, from: number) {
  for (let i = 0; i < 4; i++) {
    if (i === from) continue;
    const p = s.players[i];
    if (playerWaits(p).includes(tile.kind)) {
      p.furitenTemp = true;
      if (p.riichi) p.furitenRiichi = true;
    }
  }
}

function respond(s: GameState, action: Exclude<Action, { type: "next" | "discard" | "tsumo" | "ankan" | "kakan" }>) {
  const pend = s.pending;
  if (s.phase !== "calls" || !pend) throw new Error("鳴きの受付中ではありません");
  if (pend.responses[action.seat] !== undefined) throw new Error("回答済みです");
  if (action.type === "pass") {
    pend.responses[action.seat] = null;
  } else {
    const ok = pend.options[action.seat].some(
      (o) =>
        o.type === action.type &&
        (!("tileIds" in action) || sameIds(o.tileIds ?? [], action.tileIds)),
    );
    if (!ok) throw new Error("その鳴きはできません");
    pend.responses[action.seat] = action;
  }
  maybeResolve(s);
}

const sameIds = (a: number[], b: number[]) => a.length === b.length && a.every((x) => b.includes(x));

function maybeResolve(s: GameState) {
  const pend = s.pending!;
  if (pend.responses.some((r) => r === undefined)) return;
  const order = [1, 2, 3].map((d) => (pend.from + d) % 4);
  const ronSeat = order.find((i) => pend.responses[i]?.type === "ron");
  s.pending = null;

  if (ronSeat !== undefined) {
    // 頭ハネ: 放銃者から見て最も近い1人のみ
    applyMissedRon(s, pend.tile, pend.from);
    finishWin(s, ronSeat, pend.tile, pend.from, pend.source === "kakan");
    return;
  }
  // 立直宣言牌が通った
  if (s.riichiPendingSeat !== null) {
    const r = s.riichiPendingSeat;
    s.scores[r] -= 1000;
    s.kyotaku++;
    s.players[r].ippatsu = s.rules.ippatsu;
    s.riichiPendingSeat = null;
  }
  applyMissedRon(s, pend.tile, pend.from);

  if (pend.source === "kakan") {
    completeKakan(s, pend.from, pend.tile);
    return;
  }

  const caller = order.find((i) => {
    const r = pend.responses[i];
    return r && (r.type === "pon" || r.type === "minkan");
  });
  const chiSeat = order.find((i) => pend.responses[i]?.type === "chi");
  const seat = caller ?? chiSeat;
  if (seat !== undefined) {
    doCall(s, seat, pend.responses[seat]!, pend.tile, pend.from);
    return;
  }
  // 誰も鳴かない
  const next = (pend.from + 1) % 4;
  if (next === s.dealer && s.firstGoAround && s.players.every((p) => p.discards.length >= 1)) {
    s.firstGoAround = false;
  }
  if (remainingTiles(s) <= 0) {
    exhaustiveDraw(s);
    return;
  }
  drawTile(s, next);
}

function doCall(s: GameState, seat: number, action: Action, tile: Tile, from: number) {
  const p = s.players[seat];
  const fromP = s.players[from];
  fromP.discards[fromP.discards.length - 1].calledBy = seat;
  clearIppatsu(s);
  s.firstGoAround = false;

  let used: Tile[];
  let type: CalledMeld["type"];
  if (action.type === "minkan") {
    used = p.hand.filter((t) => t.kind === tile.kind);
    type = "minkan";
  } else if (action.type === "pon" || action.type === "chi") {
    used = p.hand.filter((t) => action.tileIds.includes(t.id));
    type = action.type;
  } else {
    throw new Error("不正な鳴き");
  }
  p.hand = p.hand.filter((t) => !used.includes(t));
  const tiles = [...used, tile].sort((a, b) => a.kind - b.kind);
  p.melds.push({ type, tiles, calledTile: tile, from });
  p.drawn = null;
  s.turn = seat;
  s.phase = "turn";
  log(s, seat, `${{ pon: "ポン", chi: "チー", minkan: "カン" }[type as "pon" | "chi" | "minkan"]} ${kindName(tile.kind)}`);

  checkPao(s, seat, from);
  if (type === "minkan") {
    drawRinshan(s, seat);
  } else {
    p.forbiddenKinds = s.rules.kuikae ? [] : kuikaeKinds(used, tile, type as "pon" | "chi");
  }
}

function checkPao(s: GameState, seat: number, from: number) {
  const p = s.players[seat];
  if (p.pao) return;
  const triplets = p.melds.filter((m) => m.type !== "chi").map((m) => m.tiles[0].kind);
  const dragons = [HAKU, HATSU, CHUN].filter((k) => triplets.includes(k)).length;
  const winds = [27, 28, 29, 30].filter((k) => triplets.includes(k)).length;
  const kans = p.melds.filter((m) => m.type === "minkan" || m.type === "kakan" || m.type === "ankan").length;
  if (dragons === 3 && s.rules.pao.includes("daisangen")) p.pao = { seat: from, yaku: "daisangen" };
  else if (winds === 4 && s.rules.pao.includes("daisuushii")) p.pao = { seat: from, yaku: "daisuushii" };
  else if (kans === 4 && s.rules.pao.includes("suukantsu")) p.pao = { seat: from, yaku: "suukantsu" };
}

function doAnkan(s: GameState, seat: number, kind: TileKind) {
  assertTurn(s, seat);
  if (!turnOptions(s, seat).ankan.includes(kind)) throw new Error("暗槓できません");
  const p = s.players[seat];
  const tiles = p.hand.filter((t) => t.kind === kind);
  p.hand = p.hand.filter((t) => t.kind !== kind);
  p.melds.push({ type: "ankan", tiles });
  clearIppatsu(s);
  s.firstGoAround = false;
  log(s, seat, `暗槓 ${kindName(kind)}`);
  drawRinshan(s, seat);
}

function doKakan(s: GameState, seat: number, kind: TileKind) {
  assertTurn(s, seat);
  if (!turnOptions(s, seat).kakan.includes(kind)) throw new Error("加槓できません");
  const p = s.players[seat];
  const tile = p.hand.find((t) => t.kind === kind)!;
  p.hand = p.hand.filter((t) => t.id !== tile.id);
  p.drawn = null;
  log(s, seat, `加槓 ${kindName(kind)}`);
  // 槍槓の受付
  openCalls(s, tile, seat, "kakan");
}

function completeKakan(s: GameState, seat: number, tile: Tile) {
  const p = s.players[seat];
  const meld = p.melds.find((m) => m.type === "pon" && m.tiles[0].kind === tile.kind)!;
  meld.type = "kakan";
  meld.tiles = [...meld.tiles, tile];
  clearIppatsu(s);
  if (meld.from !== undefined) checkPao(s, seat, meld.from);
  drawRinshan(s, seat);
}

function doTsumo(s: GameState, seat: number) {
  assertTurn(s, seat);
  const p = s.players[seat];
  if (!p.drawn || !turnOptions(s, seat).canTsumo) throw new Error("ツモ和了できません");
  finishWin(s, seat, p.drawn, null, false);
}

// ------------------------------------------------------------------ 精算

function finishWin(s: GameState, winner: number, winTile: Tile, from: number | null, chankan: boolean) {
  const p = s.players[winner];
  const isTsumo = from === null;
  const input = buildWinInput(s, winner, winTile, isTsumo, { chankan });
  const win = evaluateWin(input, s.rules);
  if (!win) throw new Error("和了できません");

  const deltas = [0, 0, 0, 0];
  const isDealer = winner === s.dealer;
  const pay = win.payment;
  let paoSeat: number | null = null;

  const paoYakuName = p.pao && { daisangen: "大三元", daisuushii: "大四喜", suukantsu: "四槓子" }[p.pao.yaku];
  const paoApplies = !!p.pao && win.yaku.some((y) => y.name === paoYakuName) && p.pao.seat !== winner;

  if (isTsumo) {
    for (let i = 0; i < 4; i++) {
      if (i === winner) continue;
      const amount = isDealer ? pay.tsumoFromChild! : i === s.dealer ? pay.tsumoFromDealer! : pay.tsumoFromChild!;
      deltas[i] -= amount;
    }
  } else {
    deltas[from!] -= pay.ron!;
  }

  if (paoApplies) {
    paoSeat = p.pao!.seat;
    // 包の役満1倍分を責任者に付け替える
    const unit = calcPayment({ han: 0, fu: 0, yakuman: 1, isDealer, isTsumo, honba: 0, rules: s.rules });
    if (isTsumo) {
      // ツモ: 役満1倍分は包の責任者が全額
      for (let i = 0; i < 4; i++) {
        if (i === winner) continue;
        const share = isDealer ? unit.tsumoFromChild! : i === s.dealer ? unit.tsumoFromDealer! : unit.tsumoFromChild!;
        deltas[i] += share;
        deltas[paoSeat] -= share;
      }
    } else if (paoSeat !== from) {
      // ロン: 役満1倍分を放銃者と折半（積み棒は放銃者）
      const half = unit.ron! / 2;
      deltas[from!] += half;
      deltas[paoSeat] -= half;
    }
  }

  const received = -deltas.reduce((a, b) => a + b, 0);
  deltas[winner] += received + s.kyotaku * 1000;
  s.kyotaku = 0;

  for (let i = 0; i < 4; i++) s.scores[i] += deltas[i];
  const result: RoundResult = {
    type: "win",
    winner,
    from,
    win,
    hand: isTsumo ? p.hand.filter((t) => t.id !== winTile.id) : [...p.hand],
    melds: p.melds,
    winTile,
    uraIndicators: p.riichi ? uraIndicators(s) : [],
    deltas,
    paoSeat,
  };
  s.result = result;
  s.phase = "roundEnd";
  s.riichiPendingSeat = null;
  log(s, winner, `${isTsumo ? "ツモ" : "ロン"} ${win.payment.total}点`);
}

function exhaustiveDraw(s: GameState) {
  const tenpai = s.players.map((p) => playerWaits(p).length > 0);
  const n = tenpai.filter(Boolean).length;
  const deltas = [0, 0, 0, 0];
  if (n > 0 && n < 4) {
    const total = s.rules.notenPenaltyTotal;
    for (let i = 0; i < 4; i++) deltas[i] = tenpai[i] ? total / n : -total / (4 - n);
  }
  for (let i = 0; i < 4; i++) s.scores[i] += deltas[i];
  s.result = { type: "draw", tenpai, deltas };
  s.phase = "roundEnd";
  log(s, null, "流局");
}

function advanceRound(s: GameState) {
  const r = s.result!;
  let renchan: boolean;
  if (r.type === "win") {
    renchan = r.winner === s.dealer;
    s.honba = renchan ? s.honba + 1 : 0;
  } else {
    renchan = r.tenpai[s.dealer] && s.rules.dealerRenchan === "tenpai";
    s.honba += 1;
  }
  if (!renchan) {
    s.dealer = (s.dealer + 1) % 4;
    if (s.dealer === 0) {
      const lastWind = s.rules.length === "tonpu" ? 0 : 1;
      if (s.roundWind >= lastWind) {
        endGame(s);
        return;
      }
      s.roundWind = (s.roundWind + 1) as 0 | 1;
    }
  }
  startRound(s);
}

function endGame(s: GameState) {
  // 残った供託はトップが取得（同点は等分）
  if (s.kyotaku > 0) {
    const top = Math.max(...s.scores);
    const tops = s.scores.map((v, i) => (v === top ? i : -1)).filter((i) => i >= 0);
    const share = Math.floor((s.kyotaku * 1000) / tops.length / 100) * 100;
    for (const i of tops) s.scores[i] += share;
    s.kyotaku = 0;
  }
  s.standings = settle(s.scores, s.rules);
  s.phase = "gameEnd";
  s.result = null;
}

export { doraFromIndicator };
