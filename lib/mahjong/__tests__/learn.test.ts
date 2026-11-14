import { describe, expect, it } from "vitest";
import { evaluateWin } from "../evaluate";
import { YAKU_CATALOG, exampleToInput } from "../learn/yakuCatalog";
import { generateFuProblem, pointOptions } from "../learn/fuDrill";
import { nextRandom } from "../game/rng";

describe("役一覧の例題", () => {
  for (const entry of YAKU_CATALOG.filter((e) => e.example)) {
    it(`${entry.name} の例題で「${entry.match}」が成立する`, () => {
      const input = exampleToInput(entry.example!);
      const r = evaluateWin(input);
      expect(r, "和了にならない").not.toBeNull();
      const y = r!.yaku.find((x) => x.name === entry.match);
      expect(y, `成立した役: ${r!.yaku.map((x) => x.name).join(",")}`).toBeDefined();
      if (typeof entry.han === "number") {
        const menzen = (entry.example!.melds ?? []).every((m) => m.type === "ankan");
        expect(y!.han).toBe(menzen ? entry.han : entry.openHan);
      } else {
        expect(y!.yakuman).toBeGreaterThan(0);
      }
    });
  }
});

describe("符計算ドリル", () => {
  it("生成した問題はすべて役があり、役満ではなく、符が正しい範囲", () => {
    let seed = 12345;
    for (let i = 0; i < 300; i++) {
      const level = i % 2 === 0 ? "basic" : "advanced";
      const [, next] = nextRandom(seed);
      const p = generateFuProblem(seed, level);
      seed = next;
      expect(p.result.yakuman).toBe(0);
      expect(p.result.yaku.length).toBeGreaterThan(0);
      expect([20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110]).toContain(p.result.fu);
      if (level === "basic") expect(p.input.melds).toHaveLength(0);
      // 再評価しても同じ結果（決定的）
      expect(evaluateWin(p.input)?.fu).toBe(p.result.fu);
    }
  });

  it("基本・応用ともに多様な符が出る", () => {
    const fus = new Set<number>();
    let seed = 7;
    for (let i = 0; i < 200; i++) {
      fus.add(generateFuProblem(seed, "advanced").result.fu);
      seed = nextRandom(seed)[1];
    }
    expect(fus.size).toBeGreaterThanOrEqual(5);
  });

  it("点数の選択肢は4つで、正解を1つだけ含む", () => {
    const p = generateFuProblem(99, "basic");
    const opts = pointOptions(p, 99);
    expect(opts).toHaveLength(4);
    expect(opts.filter((o) => o.correct)).toHaveLength(1);
    expect(new Set(opts.map((o) => o.label)).size).toBe(4);
  });
});
