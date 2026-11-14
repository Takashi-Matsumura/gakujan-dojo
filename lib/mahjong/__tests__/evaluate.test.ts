import { describe, expect, it } from "vitest";
import { evaluateWin, type Meld, type WinInput } from "../evaluate";
import { parseTiles } from "../tiles";

/** 和了牌込みの手牌文字列から入力を作る。win は和了牌（天鳳表記1枚） */
function win(
  hand: string,
  winTile: string,
  opts: Partial<WinInput> & { melds?: Meld[] } = {},
): WinInput {
  const { kinds, red } = parseTiles(hand);
  const w = parseTiles(winTile).kinds[0];
  const idx = kinds.indexOf(w);
  if (idx < 0) throw new Error("和了牌が手牌に含まれていません");
  const concealed = [...kinds];
  concealed.splice(idx, 1);
  return {
    concealed,
    melds: [],
    winTile: w,
    isTsumo: false,
    seatWind: 1,
    roundWind: 0,
    redCount: red,
    ...opts,
  };
}

const names = (r: ReturnType<typeof evaluateWin>) => r?.yaku.map((y) => y.name) ?? [];
const k = (s: string) => parseTiles(s).kinds[0];

describe("役と符", () => {
  it("平和のみ（両面ロン）30符1000点", () => {
    const r = evaluateWin(win("123m456m789p234s55p", "4s", { riichi: "riichi" }));
    expect(names(r)).toEqual(expect.arrayContaining(["立直", "平和"]));
    expect(r?.fu).toBe(30);
    expect(r?.han).toBe(2);
    expect(r?.payment.ron).toBe(2000);
  });

  it("平和ツモは20符", () => {
    const r = evaluateWin(win("123m456m789p234s55p", "2s", { isTsumo: true }));
    expect(names(r)).toEqual(expect.arrayContaining(["門前清自摸和", "平和"]));
    expect(r?.fu).toBe(20);
    // 20符2翻 子ツモ 400/700
    expect(r?.payment.tsumoFromChild).toBe(400);
    expect(r?.payment.tsumoFromDealer).toBe(700);
  });

  it("役なしは null（ドラだけでは和了できない）", () => {
    const r = evaluateWin({
      concealed: parseTiles("456m789p23s99p").kinds,
      melds: [{ type: "chi", tile: k("1m") }],
      winTile: k("1s"),
      isTsumo: false,
      seatWind: 1,
      roundWind: 0,
      doraIndicators: [k("8p")],
    });
    expect(r).toBeNull();
  });

  it("喰いタン可", () => {
    const r = evaluateWin({
      concealed: parseTiles("456m678p3456s").kinds,
      melds: [{ type: "chi", tile: k("2m") }],
      winTile: k("3s"),
      isTsumo: false,
      seatWind: 1,
      roundWind: 0,
    });
    // 234m(チー) 456m 678p 456s + 33s雀頭、3s 単騎（3-6s ノベタン）: 20+単騎2 → 30符
    expect(names(r)).toContain("断么九");
    expect(r?.fu).toBe(30);
    expect(r?.payment.ron).toBe(1000);
  });

  it("嵌張・役牌暗刻の符計算", () => {
    // 13m の嵌張 2m、中暗刻、門前ロン
    const r = evaluateWin(win("123m456p789s55s777z", "2m"));
    expect(names(r)).toContain("役牌 中");
    // 20 + 門前ロン10 + 嵌張2 + 中暗刻8 = 40符
    expect(r?.fu).toBe(40);
    expect(r?.payment.ron).toBe(1300);
  });

  it("双碰ロンの刻子は明刻扱い（三暗刻にならない）", () => {
    const tsumo = evaluateWin(
      win("111m333p555s789s99p", "5s", { isTsumo: true }),
    );
    expect(names(tsumo)).toContain("三暗刻");
    const ron = evaluateWin(win("111m333p555s789s99p", "5s"));
    expect(names(ron)).not.toContain("三暗刻");
  });

  it("連風牌の雀頭は2符（学雀連）", () => {
    // 東場の東家（親）、東の単騎
    const r = evaluateWin(
      win("123m456p789s234s11z", "1z", { seatWind: 0, roundWind: 0, riichi: "riichi" }),
    );
    const pairFu = r?.fuDetail.find((f) => f.label.includes("連風牌"));
    expect(pairFu?.fu).toBe(2);
    // 20 + 10 + 単騎2 + 雀頭2 = 34 → 40符 1翻 親ロン 2000
    expect(r?.fu).toBe(40);
    expect(r?.payment.ron).toBe(2000);
  });

  it("七対子は25符", () => {
    const r = evaluateWin(win("1133m5577p22s66z77z", "7z", { riichi: "riichi" }));
    expect(names(r)).toContain("七対子");
    expect(r?.fu).toBe(25);
    // 25符3翻 子ロン 3200
    expect(r?.payment.ron).toBe(3200);
  });

  it("二盃口は七対子より高く評価される", () => {
    const r = evaluateWin(win("223344m556677p88s", "8s"));
    expect(names(r)).toContain("二盃口");
    expect(names(r)).not.toContain("七対子");
  });

  it("清一色・一気通貫（門前）", () => {
    const r = evaluateWin(win("123456789m11122m", "2m"));
    expect(names(r)).toEqual(expect.arrayContaining(["清一色", "一気通貫"]));
  });

  it("三色同順は鳴くと1翻", () => {
    const r = evaluateWin({
      concealed: parseTiles("234p23s678m55p").kinds,
      melds: [{ type: "chi", tile: k("2m") }],
      winTile: k("4s"),
      isTsumo: false,
      seatWind: 1,
      roundWind: 0,
    });
    const s = r?.yaku.find((y) => y.name === "三色同順");
    expect(s?.han).toBe(1);
  });

  it("切り上げ満貫: 30符4翻は満貫", () => {
    const r = evaluateWin({
      concealed: parseTiles("234m567p67s99s").kinds,
      melds: [{ type: "pon", tile: k("7z") }],
      winTile: k("8s"),
      isTsumo: false,
      seatWind: 1,
      roundWind: 0,
      doraIndicators: [k("1m"), k("4p")],
      redCount: 1,
    });
    // 中1 + ドラ(2m)1 + ドラ(5p)1 + 赤1 = 4翻、20 + 明刻么九4 = 24 → 30符
    expect(r?.han).toBe(4);
    expect(r?.fu).toBe(30);
    expect(r?.payment.ron).toBe(8000);
    expect(r?.payment.limit).toBe("満貫");
  });

  it("数え役満なし: 13翻以上は三倍満", () => {
    const r = evaluateWin(
      win("111222333456m55m", "5m", {
        riichi: "riichi",
        isTsumo: true,
        doraIndicators: [k("4m"), k("4m")],
      }),
    );
    expect(r!.han).toBeGreaterThanOrEqual(13);
    expect(r?.yakuman).toBe(0);
    expect(r?.payment.limit).toBe("三倍満");
  });
});

describe("役満", () => {
  it("国士無双", () => {
    const r = evaluateWin(win("19m19p19s12345677z", "1z"));
    expect(names(r)).toEqual(["国士無双"]);
    expect(r?.payment.ron).toBe(32000);
  });

  it("四暗刻（ツモ）", () => {
    const r = evaluateWin(win("111m333p555s777s99p", "9p", { isTsumo: true }));
    expect(names(r)).toContain("四暗刻");
  });

  it("四暗刻単騎はダブル役満にしない（純粋な複合のみ）", () => {
    const r = evaluateWin(win("111m333p555s777s99p", "9p"));
    expect(r?.yakuman).toBe(1);
  });

  it("字一色＋大四喜はダブル役満", () => {
    const r = evaluateWin(win("111222333444z55z", "5z", { isTsumo: true }));
    expect(names(r)).toEqual(expect.arrayContaining(["字一色", "大四喜", "四暗刻"]));
    expect(r?.yakuman).toBe(3);
    expect(r?.payment.limit).toBe("トリプル役満");
  });

  it("緑一色は發なしでも可", () => {
    const r = evaluateWin(win("22334444666888s", "8s"));
    expect(names(r)).toContain("緑一色");
  });

  it("九蓮宝燈", () => {
    const r = evaluateWin(win("11123455678999p", "5p"));
    expect(names(r)).toContain("九蓮宝燈");
  });

  it("大三元", () => {
    const r = evaluateWin(win("555666777z123m99p", "9p"));
    expect(names(r)).toContain("大三元");
  });
});
