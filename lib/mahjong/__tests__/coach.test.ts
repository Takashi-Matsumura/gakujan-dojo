import { afterEach, describe, expect, it, vi } from "vitest";
import { decideAction } from "../game/ai";
import { applyAction, createGame } from "../game/engine";
import type { GameState } from "../game/types";
import { discardFacts, readFacts, winFacts } from "../coach/facts";
import { buildMessages } from "../coach/prompt";
import { kindName } from "../tiles";
import { GET, POST } from "@/app/api/coach/route";

/** 条件を満たす局面まで CPU だけで進める */
function advanceUntil(seed: number, pred: (s: GameState) => boolean): GameState {
  let s = createGame({ seed, humanSeats: [] });
  for (let i = 0; i < 5000; i++) {
    if (pred(s)) return s;
    if (s.phase === "gameEnd") break;
    if (s.phase === "roundEnd") s = applyAction(s, { type: "next" });
    else {
      const seat = s.phase === "calls" ? s.pending!.responses.findIndex((r) => r === undefined) : s.turn;
      s = applyAction(s, decideAction(s, seat)!);
    }
  }
  throw new Error("条件を満たす局面に到達しませんでした");
}

describe("事実シート", () => {
  it("和了: 役の定義・符の内訳・点数を含む", () => {
    const s = advanceUntil(3, (x) => x.result?.type === "win");
    const f = winFacts(s)!;
    expect(f.kind).toBe("win");
    expect(f.lines.some((l) => l.startsWith("成立した役"))).toBe(true);
    expect(f.lines.some((l) => l.startsWith("点数:"))).toBe(true);
    // 役ごとに定義が付いている（ドラ類も含む）
    const yakuLines = f.lines.filter((l) => l.startsWith("- ") && (l.includes("翻）") || l.includes("役満）")));
    expect(yakuLines.length).toBeGreaterThan(0);
    expect(yakuLines.every((l) => l.includes(": "))).toBe(true);
  });

  it("何切る: 手番でなければ null、手番なら候補と推奨を含む", () => {
    const s = advanceUntil(4, (x) => x.phase === "turn" && x.turn === 1 && x.players[1].discards.length >= 3);
    expect(discardFacts(s, 0)).toBeNull();
    const f = discardFacts(s, 1)!;
    expect(f.lines.some((l) => l.startsWith("1. "))).toBe(true);
    expect(f.lines.some((l) => l.startsWith("コードの推奨:"))).toBe(true);
  });

  it("河読み: 立直者の現物には本人の捨て牌がすべて含まれる", () => {
    const s = advanceUntil(5, (x) => x.phase === "turn" && x.players.some((p, i) => i !== 0 && p.riichi));
    const target = s.players.findIndex((p, i) => i !== 0 && p.riichi);
    const f = readFacts(s, 0, target)!;
    const line = f.lines.find((l) => l.startsWith("確定情報"))!;
    for (const d of s.players[target].discards) expect(line).toContain(kindName(d.tile.kind));
    expect(f.lines.some((l) => l.includes("立直中"))).toBe(true);
    expect(f.lines.some((l) => l.startsWith("自分の手牌の安全度"))).toBe(true);
    expect(readFacts(s, 0, 0)).toBeNull();
  });

  it("プロンプトは事実シートを含み、事実以外を作らないよう指示する", () => {
    const msgs = buildMessages("win", ["点数: 1000点"]);
    expect(msgs[0].content).toContain("事実シート");
    expect(msgs[1].content).toContain("点数: 1000点");
  });
});

describe("/api/coach", () => {
  afterEach(() => vi.unstubAllGlobals());

  const post = (body: unknown) =>
    POST(new Request("http://localhost/api/coach", { method: "POST", body: JSON.stringify(body) }));

  it("不正な kind・行数超過・長すぎる行は 400", async () => {
    expect((await post({ kind: "hack", lines: ["a"] })).status).toBe(400);
    expect((await post({ kind: "win", lines: [] })).status).toBe(400);
    expect((await post({ kind: "win", lines: Array(81).fill("a") })).status).toBe(400);
    expect((await post({ kind: "win", lines: ["a".repeat(401)] })).status).toBe(400);
  });

  it("LLM の SSE から本文だけを取り出して流す", async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"平和"}}]}\n',
      'data: {"choices":[{"delta":{"con',
      'tent":"です"}}]}\n\ndata: [DONE]\n',
    ];
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("http://127.0.0.1:8080/v1/chat/completions");
      const body = JSON.parse(String(init.body));
      expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
      const stream = new ReadableStream({
        start(c) {
          for (const chunk of sse) c.enqueue(new TextEncoder().encode(chunk));
          c.close();
        },
      });
      return new Response(stream, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await post({ kind: "win", lines: ["役: 平和"] });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("平和です");
  });

  it("LLM に接続できないときは 502 / 状態は ok:false", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }));
    expect((await post({ kind: "win", lines: ["a"] })).status).toBe(502);
    expect(await (await GET()).json()).toMatchObject({ ok: false });
  });
});
