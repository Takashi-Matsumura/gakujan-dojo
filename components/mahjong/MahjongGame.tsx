"use client";

/**
 * 対局画面（人間1 + CPU3）。エンジンの状態を保持し、CPU の手番を自動で進める。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { decideAction } from "@/lib/mahjong/game/ai";
import {
  applyAction,
  createGame,
  handCounts,
  isFuriten,
  playerWaits,
  turnOptions,
} from "@/lib/mahjong/game/engine";
import type { Action, CallOption, GameState } from "@/lib/mahjong/game/types";
import { shanten } from "@/lib/mahjong/shape";
import { kindName, type Tile } from "@/lib/mahjong/tiles";
import { TileSvg } from "./TileSvg";
import { CenterInfo, Melds, River, SeatLabel } from "./TableParts";
import { GameEndPanel, RoundResultPanel } from "./ResultPanel";
import { CoachPanel } from "./CoachPanel";
import { discardFacts, readFacts } from "@/lib/mahjong/coach/facts";

const HUMAN = 0;

// three.js はブラウザでのみ読み込む
const Table3D = dynamic(() => import("./three/Table3D"), {
  ssr: false,
  loading: () => <div className="p-10 text-sm opacity-70">3D 卓を読み込んでいます…</div>,
});

/** 直前の打牌（鳴き受付中はその牌、ツモ番なら上家の最後の打牌） */
function lastDiscardId(state: GameState): number | null {
  if (state.pending) return state.pending.tile.id;
  if (state.phase !== "turn") return null;
  const prev = state.players[(state.turn + 3) % 4].discards.at(-1);
  return prev && prev.calledBy === undefined ? prev.tile.id : null;
}

/** 自分が今クリックして切れる牌 */
function humanSelectable(state: GameState, riichiMode: boolean): Set<number> {
  if (!(state.phase === "turn" && state.turn === HUMAN)) return new Set();
  const opts = turnOptions(state, HUMAN);
  return new Set(riichiMode ? opts.riichiDiscards : opts.discards);
}
const SPEEDS = { slow: 1100, normal: 650, fast: 250 } as const;
type Speed = keyof typeof SPEEDS;

export default function MahjongGame() {
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [riichiMode, setRiichiMode] = useState(false);
  const [speed, setSpeed] = useState<Speed>("normal");
  const [showNames, setShowNames] = useState(true);
  const [showHints, setShowHints] = useState(true);
  const [markTsumogiri, setMarkTsumogiri] = useState(true);
  const [view3d, setView3d] = useState(true);

  const start = useCallback(() => {
    setError(null);
    setRiichiMode(false);
    setState(createGame({ seed: Math.floor(Math.random() * 2 ** 31) }));
  }, []);

  const act = useCallback(
    (a: Action) => {
      if (!state) return;
      try {
        setState(applyAction(state, a));
        setError(null);
        setRiichiMode(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [state],
  );

  // CPU の手番・鳴き判断、立直後の自動ツモ切り
  useEffect(() => {
    if (!state) return;
    if (state.phase === "calls" && state.pending) {
      const cpu = state.pending.responses.findIndex((r, i) => r === undefined && !state.players[i].isHuman);
      if (cpu >= 0) {
        const t = setTimeout(() => act(decideAction(state, cpu)!), 80);
        return () => clearTimeout(t);
      }
      return;
    }
    if (state.phase === "turn") {
      const p = state.players[state.turn];
      if (!p.isHuman) {
        const t = setTimeout(() => act(decideAction(state, state.turn)!), SPEEDS[speed]);
        return () => clearTimeout(t);
      }
      if (p.riichi && p.drawn) {
        const o = turnOptions(state, state.turn);
        if (!o.canTsumo && o.ankan.length === 0) {
          const t = setTimeout(() => act({ type: "discard", seat: state.turn, tileId: p.drawn!.id }), 700);
          return () => clearTimeout(t);
        }
      }
    }
  }, [state, act, speed]);

  if (!state) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
        <h1 className="text-3xl font-bold tracking-wide" style={{ fontFamily: "var(--font-tile)" }}>
          学生麻雀 練習卓
        </h1>
        <p className="max-w-md text-sm leading-7 opacity-80">
          学生麻雀連盟の競技規定に沿ったルールで、CPU 3人と東南戦を打ちます。
          <br />
          25,000点持ち・30,000点返し、赤ドラ各1枚、喰いタンあり、途中流局なし。
        </p>
        <div className="flex gap-3">
          {[1, 5, 9].map((n) => (
            <TileSvg key={n} kind={n - 1 + 18} width="44px" />
          ))}
          <TileSvg kind={4} red width="44px" />
          <TileSvg kind={33} width="44px" />
        </div>
        <button
          onClick={start}
          className="rounded-xl px-8 py-3 text-lg font-bold"
          style={{ background: "#e8b931", color: "#1c1a17" }}
        >
          対局開始
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-3 px-2 py-3 lg:flex-row lg:items-start lg:justify-center lg:gap-6">
      <div className="flex flex-col items-center gap-2">
        {view3d ? (
          <Table3D
            state={state}
            lastId={lastDiscardId(state)}
            markTsumogiri={markTsumogiri}
            selectable={humanSelectable(state, riichiMode)}
            riichiMode={riichiMode}
            onDiscard={(tileId) => act({ type: "discard", seat: HUMAN, tileId, riichi: riichiMode })}
          />
        ) : (
          <Table state={state} markTsumogiri={markTsumogiri} />
        )}
        <HumanArea
          state={state}
          act={act}
          riichiMode={riichiMode}
          setRiichiMode={setRiichiMode}
          showNames={showNames}
          showHints={showHints}
          hideHand={view3d}
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
      <SidePanel
        state={state}
        speed={speed}
        setSpeed={setSpeed}
        showNames={showNames}
        setShowNames={setShowNames}
        showHints={showHints}
        setShowHints={setShowHints}
        markTsumogiri={markTsumogiri}
        setMarkTsumogiri={setMarkTsumogiri}
        view3d={view3d}
        setView3d={setView3d}
      />
      {(state.phase === "roundEnd" || state.phase === "gameEnd") && (
        <div className="fixed inset-0 z-20 flex items-center justify-center p-3" style={{ background: "rgba(0,0,0,0.45)" }}>
          {state.phase === "roundEnd" ? (
            <RoundResultPanel state={state} onNext={() => act({ type: "next" })} />
          ) : (
            <GameEndPanel state={state} onRestart={start} />
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ 卓

function Table({ state, markTsumogiri }: { state: GameState; markTsumogiri: boolean }) {
  const lastId = lastDiscardId(state);
  const reveal = state.phase === "roundEnd" || state.phase === "gameEnd";

  return (
    <div
      className="mj-table relative"
      style={{
        width: "min(calc(100vw - 16px), calc(100dvh - 275px), 860px)",
        minWidth: 300,
        aspectRatio: "1 / 1",
        containerType: "size",
      }}
    >
      {/* 中央パネル */}
      <div
        className="absolute"
        style={{
          left: "35cqw",
          top: "35cqw",
          width: "30cqw",
          height: "30cqw",
          borderRadius: "2cqw",
          background: "rgba(8, 30, 22, 0.55)",
          border: "0.25cqw solid rgba(255,255,255,0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CenterInfo state={state} />
      </div>

      {[0, 1, 2, 3].map((seat) => {
        const p = state.players[seat];
        const rel = (seat - HUMAN + 4) % 4;
        return (
          <div
            key={seat}
            className="pointer-events-none absolute inset-0"
            style={{ transform: `rotate(${-90 * rel}deg)` }}
          >
            {/* 点数・立直棒 */}
            <div className="absolute" style={{ left: "50%", top: "57cqw", transform: "translateX(-50%)" }}>
              <SeatLabel state={state} seat={seat} />
            </div>
            {/* 河 */}
            <div className="absolute" style={{ left: "37.6cqw", top: "66cqw" }}>
              <River
                discards={p.discards}
                width="4.1cqw"
                lastId={lastId}
                markTsumogiri={markTsumogiri}
              />
            </div>
            {/* 手牌（CPU）と副露 */}
            {seat !== HUMAN && (
              <div className="absolute flex items-end" style={{ left: "9cqw", bottom: "calc(14px + 0.6cqw)", gap: "0.1cqw" }}>
                {sortedForView(p.hand, p.drawn).map((t, i, arr) => (
                  <div key={t.id} style={{ marginLeft: p.drawn && t.id === p.drawn.id && i === arr.length - 1 ? "1cqw" : 0 }}>
                    <TileSvg kind={t.kind} red={t.red} back={!reveal} width="3.3cqw" />
                  </div>
                ))}
              </div>
            )}
            <div className="absolute" style={{ right: "calc(14px + 2cqw)", bottom: "calc(14px + 0.6cqw)" }}>
              <Melds melds={p.melds} owner={seat} width="3.3cqw" />
            </div>
            {p.name && seat !== HUMAN && (
              <div
                className="absolute"
                style={{ left: "9cqw", bottom: "calc(16px + 6cqw)", fontSize: "1.6cqw", color: "rgba(243,239,226,0.75)" }}
              >
                {p.name}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function sortedForView(hand: Tile[], drawn: Tile | null): Tile[] {
  const rest = hand.filter((t) => t.id !== drawn?.id).sort((a, b) => a.kind - b.kind || a.id - b.id);
  return drawn && hand.some((t) => t.id === drawn.id) ? [...rest, drawn] : rest;
}

// ------------------------------------------------------------------ 自分の手牌と操作

const HAND_TILE = "clamp(26px, 6.1vw, 54px)";

function HumanArea({
  state,
  act,
  riichiMode,
  setRiichiMode,
  showNames,
  showHints,
  hideHand = false,
}: {
  state: GameState;
  act: (a: Action) => void;
  riichiMode: boolean;
  setRiichiMode: (v: boolean) => void;
  showNames: boolean;
  showHints: boolean;
  /** 3D 表示では手牌を卓の中に描くので、ここでは出さない */
  hideHand?: boolean;
}) {
  const me = state.players[HUMAN];
  const myTurn = state.phase === "turn" && state.turn === HUMAN;
  const opts = turnOptions(state, HUMAN);
  const callOpts: CallOption[] =
    state.phase === "calls" && state.pending && state.pending.responses[HUMAN] === undefined
      ? state.pending.options[HUMAN]
      : [];
  const selectable = humanSelectable(state, riichiMode);
  const tiles = sortedForView(me.hand, me.drawn);

  // 学習ヒント
  const hint = useMemo(() => {
    const n = me.hand.length + me.melds.length * 3;
    if (n !== 13) return null;
    const sh = shanten(handCounts(me.hand), me.melds.length).shanten;
    const w = sh === 0 ? playerWaits(me) : [];
    return { shanten: sh, waits: w, furiten: sh === 0 && isFuriten(me) };
  }, [me]);
  const hint14 = useMemo(() => {
    if (!myTurn) return null;
    return shanten(handCounts(me.hand), me.melds.length).shanten;
  }, [me, myTurn]);

  return (
    <div className="flex w-full flex-col items-center gap-2">
      {/* 操作ボタン */}
      <div className="flex min-h-11 flex-wrap items-center justify-center gap-2">
        {myTurn && opts.canTsumo && <ActionButton color="#e8b931" onClick={() => act({ type: "tsumo", seat: HUMAN })}>ツモ</ActionButton>}
        {myTurn && opts.riichiDiscards.length > 0 && (
          <ActionButton color={riichiMode ? "#ff9d6e" : "#f0d27a"} onClick={() => setRiichiMode(!riichiMode)}>
            {riichiMode ? "立直をやめる" : "立直"}
          </ActionButton>
        )}
        {myTurn &&
          opts.ankan.map((k) => (
            <ActionButton key={`a${k}`} color="#b9d7ff" onClick={() => act({ type: "ankan", seat: HUMAN, kind: k })}>
              暗槓 {kindName(k)}
            </ActionButton>
          ))}
        {myTurn &&
          opts.kakan.map((k) => (
            <ActionButton key={`k${k}`} color="#b9d7ff" onClick={() => act({ type: "kakan", seat: HUMAN, kind: k })}>
              加槓 {kindName(k)}
            </ActionButton>
          ))}
        {callOpts.map((o, i) => (
          <ActionButton
            key={i}
            color={o.type === "ron" ? "#e8b931" : "#b9e3c6"}
            onClick={() => act({ ...o, seat: HUMAN, tileIds: o.tileIds ?? [] } as Action)}
          >
            <span className="flex items-center gap-1">
              {{ ron: "ロン", pon: "ポン", chi: "チー", minkan: "カン" }[o.type]}
              {o.type === "chi" &&
                o.tileIds?.map((id) => {
                  const t = me.hand.find((x) => x.id === id)!;
                  return <TileSvg key={id} kind={t.kind} red={t.red} width="18px" />;
                })}
            </span>
          </ActionButton>
        ))}
        {callOpts.length > 0 && (
          <ActionButton color="#d6d6d6" onClick={() => act({ type: "pass", seat: HUMAN })}>
            スキップ
          </ActionButton>
        )}
        {myTurn && riichiMode && <span className="text-sm opacity-80">立直を宣言する牌を選んでください</span>}
        {!myTurn && callOpts.length === 0 && state.phase !== "roundEnd" && state.phase !== "gameEnd" && (
          <span className="text-sm opacity-60">{state.players[state.turn].name} の手番</span>
        )}
      </div>

      {/* 手牌 */}
      <div className={hideHand ? "hidden" : "flex items-end justify-center"} style={{ gap: 3 }}>
        {tiles.map((t, i) => {
          const isDrawn = me.drawn?.id === t.id && i === tiles.length - 1;
          const can = selectable.has(t.id);
          return (
            <button
              key={t.id}
              type="button"
              disabled={!can}
              onClick={() => act({ type: "discard", seat: HUMAN, tileId: t.id, riichi: riichiMode })}
              className="mj-hand-tile flex flex-col items-center"
              style={{ marginLeft: isDrawn ? 12 : 0, cursor: can ? "pointer" : "default" }}
              aria-label={`${kindName(t.kind)}${t.red ? "（赤）" : ""}${can ? "を切る" : ""}`}
            >
              <TileSvg
                kind={t.kind}
                red={t.red}
                width={HAND_TILE}
                dim={myTurn && !can}
                highlight={riichiMode && can ? "gold" : null}
              />
              {showNames && (
                <span className="mt-0.5 text-[10px] leading-none opacity-70 sm:text-xs">{kindName(t.kind)}</span>
              )}
            </button>
          );
        })}
        <div className="ml-3">
          <Melds melds={me.melds} owner={HUMAN} width="clamp(20px, 4.2vw, 38px)" />
        </div>
      </div>

      {showHints && (
        <div className="min-h-5 text-sm opacity-85">
          {myTurn && hint14 !== null && (
            <span>
              {hint14 === -1 ? "和了形です" : hint14 === 0 ? "テンパイを維持できる牌を切りましょう" : `${hint14}向聴`}
            </span>
          )}
          {!myTurn && hint && (
            <span>
              {hint.shanten === 0 ? (
                <>
                  テンパイ　待ち: {hint.waits.map(kindName).join("・") || "なし"}
                  {hint.furiten && <strong className="ml-2 text-red-400">フリテン（ロン不可）</strong>}
                </>
              ) : (
                `${hint.shanten}向聴`
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ActionButton({ children, color, onClick }: { children: React.ReactNode; color: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg px-4 py-2 text-base font-bold shadow"
      style={{ background: color, color: "#1c1a17" }}
    >
      {children}
    </button>
  );
}

// ------------------------------------------------------------------ サイドパネル

function SidePanel(props: {
  state: GameState;
  speed: Speed;
  setSpeed: (s: Speed) => void;
  showNames: boolean;
  setShowNames: (v: boolean) => void;
  showHints: boolean;
  setShowHints: (v: boolean) => void;
  markTsumogiri: boolean;
  setMarkTsumogiri: (v: boolean) => void;
  view3d: boolean;
  setView3d: (v: boolean) => void;
}) {
  const { state } = props;
  const events = state.events.slice(-14).reverse();
  return (
    <aside className="w-full max-w-[860px] rounded-xl p-4 text-sm lg:w-64" style={{ background: "rgba(255,255,255,0.05)" }}>
      <h2 className="mb-2 font-bold">表示設定</h2>
      <div className="flex flex-col gap-1.5">
        <Toggle label="牌の名前を表示" value={props.showNames} onChange={props.setShowNames} />
        <Toggle label="向聴数・待ちのヒント" value={props.showHints} onChange={props.setShowHints} />
        <Toggle label="3D 表示" value={props.view3d} onChange={props.setView3d} />
        <Toggle label="ツモ切りを暗く表示" value={props.markTsumogiri} onChange={props.setMarkTsumogiri} />
        <label className="mt-1 flex items-center justify-between gap-2">
          CPU の速さ
          <select
            value={props.speed}
            onChange={(e) => props.setSpeed(e.target.value as Speed)}
            className="rounded bg-black/30 px-2 py-1"
          >
            <option value="slow">ゆっくり</option>
            <option value="normal">ふつう</option>
            <option value="fast">はやい</option>
          </select>
        </label>
      </div>
      <p className="mt-3 text-xs leading-5 opacity-60">
        河の暗い牌はツモ切り、明るい牌は手出しです。手出しの牌は相手の手の形を読む手がかりになります。★ は赤ドラ。
      </p>
      <CoachPanel
        contextKey={`${state.roundWind}-${state.dealer}-${state.honba}-${state.discardSeq}-${state.turn}-${state.phase}`}
        actions={[
          {
            label: "何を切る？",
            build: () => discardFacts(state, HUMAN),
            instant: true,
            disabled: !(state.phase === "turn" && state.turn === HUMAN),
          },
          ...[1, 2, 3].map((seat) => ({
            label: `${state.players[seat].name.replace("CPU ", "")}の河を読む${state.players[seat].riichi ? "（立直）" : ""}`,
            build: () => readFacts(state, HUMAN, seat),
            disabled: state.phase === "gameEnd" || state.players[seat].discards.length === 0,
          })),
        ]}
      />
      <h2 className="mb-1 mt-4 font-bold">経過</h2>
      <ol className="flex flex-col gap-0.5 text-xs opacity-80">
        {events.map((e, i) => (
          <li key={i}>
            {e.seat !== null ? `${state.players[e.seat].name}: ` : ""}
            {e.text}
          </li>
        ))}
      </ol>
    </aside>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2">
      {label}
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-amber-400" />
    </label>
  );
}
