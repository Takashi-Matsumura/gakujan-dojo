import { describe, expect, it } from "vitest";
import { decideAction } from "../game/ai";
import { applyAction, createGame, remainingTiles } from "../game/engine";
import type { GameState } from "../game/types";

/** 全員 CPU で1半荘を最後まで進める */
function playOut(seed: number): { final: GameState; rounds: number; wins: number } {
  let s = createGame({ seed, humanSeats: [] });
  let rounds = 0;
  let wins = 0;
  for (let step = 0; step < 20000; step++) {
    if (s.phase === "gameEnd") return { final: s, rounds, wins };
    if (s.phase === "roundEnd") {
      rounds++;
      if (s.result?.type === "win") wins++;
      // 点棒の総和は常に 100000（供託込み）
      expect(s.scores.reduce((a, b) => a + b, 0) + s.kyotaku * 1000).toBe(100000);
      s = applyAction(s, { type: "next" });
      continue;
    }
    if (s.phase === "calls") {
      const seat = s.pending!.responses.findIndex((r) => r === undefined);
      s = applyAction(s, decideAction(s, seat)!);
      continue;
    }
    s = applyAction(s, decideAction(s, s.turn)!);
    // 手牌枚数の整合性
    s.players.forEach((p) => {
      const n = p.hand.length + p.melds.length * 3;
      expect([13, 14]).toContain(n);
    });
    expect(remainingTiles(s)).toBeGreaterThanOrEqual(0);
  }
  throw new Error("終局しませんでした");
}

describe("対局エンジン", () => {
  it("配牌: 親14枚・子13枚、残り70枚から1枚ツモ済み", () => {
    const s = createGame({ seed: 1 });
    expect(s.players[0].hand).toHaveLength(14);
    expect(s.players[1].hand).toHaveLength(13);
    expect(remainingTiles(s)).toBe(69);
  });

  it("同じシードなら同じ配牌", () => {
    const a = createGame({ seed: 42 });
    const b = createGame({ seed: 42 });
    expect(a.players[0].hand.map((t) => t.id)).toEqual(b.players[0].hand.map((t) => t.id));
  });

  it.each([1, 2, 3, 7, 11, 2026])("CPU 4人で半荘を完走できる（seed %i）", (seed) => {
    const { final, rounds } = playOut(seed);
    expect(final.standings).toHaveLength(4);
    expect(rounds).toBeGreaterThanOrEqual(8);
    const pts = final.standings!.reduce((a, x) => a + x.points, 0);
    expect(Math.abs(pts)).toBeLessThan(0.05);
  });

  it("手番以外の打牌はエラー", () => {
    const s = createGame({ seed: 5 });
    expect(() =>
      applyAction(s, { type: "discard", seat: 1, tileId: s.players[1].hand[0].id }),
    ).toThrow();
  });
});

describe("CPU のダマテン", () => {
  it("ときどきダマにし、ダマにした手はどの待ちでも立直なしで役がある", async () => {
    const { decideAction, shouldDama } = await import("../game/ai");
    const { applyAction, createGame, playerWaits, seatWind, toMelds, doraIndicators, turnOptions } = await import("../game/engine");
    const { evaluateWin } = await import("../evaluate");
    const damaRounds = new Set<string>();
    let dama = 0;
    let riichi = 0;
    for (let seed = 1; seed <= 6; seed++) {
      let s = createGame({ seed, humanSeats: [] });
      for (let i = 0; i < 20000 && s.phase !== "gameEnd"; i++) {
        if (s.phase === "roundEnd") {
          s = applyAction(s, { type: "next" });
          continue;
        }
        const seat = s.phase === "calls" ? s.pending!.responses.findIndex((r) => r === undefined) : s.turn;
        const a = decideAction(s, seat)!;
        if (a.type === "discard" && !s.players[seat].riichi && turnOptions(s, seat).riichiDiscards.includes(a.tileId)) {
          const tile = s.players[seat].hand.find((t) => t.id === a.tileId)!;
          if (a.riichi) riichi++;
          else if (shouldDama(s, seat, tile)) {
            const key = `${seed}-${s.roundWind}-${s.dealer}-${s.honba}-${seat}`;
            if (!damaRounds.has(key)) dama++;
            damaRounds.add(key);
            const p = s.players[seat];
            const rest = p.hand.filter((t) => t.id !== tile.id);
            for (const w of playerWaits(p, rest)) {
              const r = evaluateWin({
                concealed: rest.map((t) => t.kind),
                melds: toMelds(p),
                winTile: w,
                isTsumo: false,
                seatWind: seatWind(s, seat),
                roundWind: s.roundWind,
                doraIndicators: doraIndicators(s).map((t) => t.kind),
              });
              expect(r).not.toBeNull();
            }
          }
        }
        s = applyAction(s, a);
      }
    }
    expect(dama).toBeGreaterThan(0);
    expect(riichi).toBeGreaterThan(dama);
  });
});
