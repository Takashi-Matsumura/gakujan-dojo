import { describe, expect, it } from "vitest";
import { analyzeDiscards, shanten, waits } from "../shape";
import { settle } from "../score";
import { GAKUREN_RULES } from "../rules";
import { doraFromIndicator, formatKinds, parseTiles, toCounts } from "../tiles";

const counts = (s: string) => toCounts(parseTiles(s).kinds);

describe("向聴数", () => {
  it("テンパイは 0", () => {
    expect(shanten(counts("123m456p789s2345s")).shanten).toBe(0);
  });
  it("一向聴", () => {
    expect(shanten(counts("123m456p78s2345s9m")).shanten).toBe(1);
  });
  it("七対子の一向聴", () => {
    const r = shanten(counts("1133m5577p22s6z7z"));
    expect(r.chiitoitsu).toBe(1);
  });
  it("国士の向聴", () => {
    expect(shanten(counts("19m19p19s1234567z")).kokushi).toBe(0);
  });
  it("副露ありの向聴（4副露・単騎）", () => {
    expect(shanten(counts("5m"), 4).shanten).toBe(0);
  });
});

describe("待ち", () => {
  it("2345s のノベタン（2s・5s）", () => {
    expect(formatKinds(waits(counts("123m456p789s2345s")))).toBe("25s");
  });
  it("九蓮の九面待ち", () => {
    expect(waits(counts("1112345678999p")).length).toBe(9);
  });
  it("国士13面", () => {
    expect(waits(counts("19m19p19s1234567z")).length).toBe(13);
  });
});

describe("何切る", () => {
  it("浮き牌の字牌を切るのが最善", () => {
    const opts = analyzeDiscards(counts("123m456p789s2345s1z"));
    expect(opts[0].discard).toBe(parseTiles("1z").kinds[0]);
    expect(opts[0].shanten).toBe(0);
  });
});

describe("ドラ表示牌", () => {
  it.each([
    ["9m", "1m"],
    ["4z", "1z"],
    ["7z", "5z"],
    ["5p", "6p"],
  ])("%s → %s", (ind, dora) => {
    expect(doraFromIndicator(parseTiles(ind).kinds[0])).toBe(parseTiles(dora).kinds[0]);
  });
});

describe("精算（25000持ち30000返し、+30/+10/-10/-30、オカトップ）", () => {
  it("通常", () => {
    const r = settle([45000, 30000, 15000, 10000], GAKUREN_RULES);
    expect(r.map((s) => s.points)).toEqual([65, 10, -25, -50]);
    expect(r.reduce((a, s) => a + s.points, 0)).toBe(0);
  });
  it("1着同点は順位点とオカを等分", () => {
    const r = settle([35000, 35000, 20000, 10000], GAKUREN_RULES);
    expect(r[0].points).toBe(35);
    expect(r[1].points).toBe(35);
  });
  it("3者同点の端数は起家に近い方", () => {
    const r = settle([30000, 30000, 30000, 10000], GAKUREN_RULES);
    // (50+10-10)/3 = 16.66.. → 16.7, 16.7, 16.6
    expect(r.map((s) => s.points)).toEqual([16.7, 16.7, 16.6, -50]);
  });
});
