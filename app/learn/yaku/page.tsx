import type { Metadata } from "next";
import { evaluateWin, type WinInput } from "@/lib/mahjong/evaluate";
import { YAKU_CATALOG, YAKU_GROUPS, exampleToInput, type YakuEntry } from "@/lib/mahjong/learn/yakuCatalog";
import { HandView } from "@/components/mahjong/HandView";

export const metadata: Metadata = {
  title: "役一覧 | 学生麻雀 練習卓",
  description: "学生麻雀連盟ルールで採用されている役の一覧と例題",
};

const WIND = ["東", "南", "西", "北"];

function hanLabel(v: number | "役満" | null): string {
  if (v === null) return "門前限定";
  return v === "役満" ? "役満" : `${v}翻`;
}

function situation(input: WinInput): string[] {
  const chips = [input.isTsumo ? "ツモ" : "ロン", `${WIND[input.roundWind]}場`, `${WIND[input.seatWind]}家${input.seatWind === 0 ? "（親）" : ""}`];
  if (input.riichi === "riichi") chips.push("立直");
  if (input.riichi === "double") chips.push("ダブル立直");
  if (input.ippatsu) chips.push("一発");
  if (input.haitei) chips.push("最後のツモ");
  if (input.houtei) chips.push("最後の打牌");
  if (input.rinshan) chips.push("嶺上牌");
  if (input.chankan) chips.push("加槓した牌");
  if (input.tenhou) chips.push("配牌で和了");
  if (input.chiihou) chips.push("第一ツモ");
  return chips;
}

function YakuCard({ entry }: { entry: YakuEntry }) {
  const input = entry.example ? exampleToInput(entry.example) : null;
  const result = input ? evaluateWin(input) : null;
  return (
    <article id={entry.name} className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.05)" }}>
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-lg font-bold">{entry.name}</h3>
        <span className="rounded px-1.5 py-0.5 text-xs font-bold" style={{ background: "#e8b931", color: "#1c1a17" }}>
          {hanLabel(entry.han)}
        </span>
        {entry.group !== "ドラ" && (
          <span className="text-xs opacity-75">
            鳴いた場合: {entry.openHan === entry.han ? "同じ" : hanLabel(entry.openHan)}
          </span>
        )}
        {entry.situational && <span className="text-xs opacity-60">状況役</span>}
      </header>
      <p className="mt-1.5 text-sm leading-6">{entry.description}</p>
      {entry.tip && <p className="mt-1 text-xs leading-5 text-amber-200/90">ポイント: {entry.tip}</p>}
      {input && result && (
        <div className="mt-3" style={{ containerType: "inline-size" }}>
          <HandView
            concealed={input.concealed}
            winTile={input.winTile}
            melds={input.melds}
            width="min(34px, calc((100cqw - 24px) / 15))"
            winLabel="和了牌"
          />
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
            {situation(input).map((c) => (
              <span key={c} className="rounded-full px-2 py-0.5" style={{ background: "rgba(255,255,255,0.1)" }}>
                {c}
              </span>
            ))}
          </div>
          {entry.example?.caption && <p className="mt-1 text-xs opacity-70">{entry.example.caption}</p>}
          <p className="mt-1.5 text-xs opacity-80">
            この例で成立する役: {result.yaku.map((y) => (y.yakuman ? `${y.name}` : `${y.name}${y.han}`)).join("・")}
            {" ／ "}
            {result.yakuman ? "" : `${result.fu}符${result.han}翻 `}
            {result.payment.limit} {result.payment.total.toLocaleString()}点
          </p>
        </div>
      )}
    </article>
  );
}

export default function YakuPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
      <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-tile)" }}>
        役一覧
      </h1>
      <p className="mt-2 text-sm leading-6 opacity-80">
        学生麻雀連盟（学雀連）の競技規定で採用されている役です。人和・流し満貫・数え役満は採用されていません。
        和了には役が1つ以上必要で、ドラは役になりません。例題の点数は子・ドラなしで計算しています。
      </p>
      <nav className="sticky top-0 z-10 -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 py-2" style={{ background: "rgba(16,32,26,0.92)" }}>
        {YAKU_GROUPS.map((g) => (
          <a key={g} href={`#group-${g}`} className="shrink-0 rounded-full px-3 py-1 text-sm font-bold" style={{ background: "rgba(255,255,255,0.08)" }}>
            {g}
          </a>
        ))}
      </nav>
      {YAKU_GROUPS.map((g) => (
        <section key={g} id={`group-${g}`} className="mt-6 scroll-mt-14">
          <h2 className="mb-3 border-b border-white/15 pb-1 text-xl font-bold">{g === "ドラ" ? "ドラ（役ではない）" : g}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {YAKU_CATALOG.filter((e) => e.group === g).map((e) => (
              <YakuCard key={e.name} entry={e} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
