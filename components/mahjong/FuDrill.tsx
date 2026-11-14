"use client";

/**
 * 符計算ドリル。符を当てる → 点数を4択で当てる → 内訳で答え合わせ。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { WAIT_NAMES } from "@/lib/mahjong/evaluate";
import { FU_CHOICES, generateFuProblem, pointOptions, type DrillLevel, type FuProblem } from "@/lib/mahjong/learn/fuDrill";
import { drillFacts } from "@/lib/mahjong/coach/facts";
import { HandView } from "./HandView";
import { FuReference } from "./FuReference";
import { CoachPanel } from "./CoachPanel";

const WIND = ["東", "南", "西", "北"];

type Step = "fu" | "points" | "done";

interface Stats {
  answered: number;
  fuCorrect: number;
  pointCorrect: number;
  streak: number;
}

const newSeed = () => Math.floor(Math.random() * 2 ** 31);

export default function FuDrill() {
  const [level, setLevel] = useState<DrillLevel>("basic");
  const [problem, setProblem] = useState<FuProblem | null>(null);
  const [step, setStep] = useState<Step>("fu");
  const [fuAnswer, setFuAnswer] = useState<number | null>(null);
  const [pointAnswer, setPointAnswer] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>({ answered: 0, fuCorrect: 0, pointCorrect: 0, streak: 0 });

  const next = useCallback((lv: DrillLevel) => {
    setProblem(generateFuProblem(newSeed(), lv));
    setStep("fu");
    setFuAnswer(null);
    setPointAnswer(null);
  }, []);

  // 乱数はブラウザ側でのみ使う（サーバ描画との不一致を避ける）
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 初回の問題生成
    next("basic");
  }, [next]);

  const options = useMemo(() => (problem ? pointOptions(problem, problem.seed) : []), [problem]);

  if (!problem) return <p className="p-6 opacity-70">問題を準備しています…</p>;
  const { input, result } = problem;
  const fuOk = fuAnswer === result.fu;
  const correctPoint = options.find((o) => o.correct)!.label;

  const answerFu = (fu: number) => {
    setFuAnswer(fu);
    setStep("points");
  };
  const answerPoint = (label: string) => {
    setPointAnswer(label);
    setStep("done");
    const ok = label === correctPoint;
    setStats((s) => ({
      answered: s.answered + 1,
      fuCorrect: s.fuCorrect + (fuOk ? 1 : 0),
      pointCorrect: s.pointCorrect + (ok ? 1 : 0),
      streak: fuOk && ok ? s.streak + 1 : 0,
    }));
  };

  const chips = [
    input.isTsumo ? "ツモ和了" : "ロン和了",
    `${WIND[input.roundWind]}場`,
    `${WIND[input.seatWind]}家${input.seatWind === 0 ? "（親）" : "（子）"}`,
    input.melds.some((m) => m.type !== "ankan") ? "鳴きあり" : "門前",
  ];

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-6 lg:grid-cols-[1fr_320px]">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-tile)" }}>
            符計算ドリル
          </h1>
          <div className="flex items-center gap-2 text-sm">
            {(["basic", "advanced"] as const).map((lv) => (
              <button
                key={lv}
                type="button"
                onClick={() => {
                  setLevel(lv);
                  next(lv);
                }}
                className="rounded-full px-3 py-1 font-bold"
                style={{ background: level === lv ? "#e8b931" : "rgba(255,255,255,0.08)", color: level === lv ? "#1c1a17" : undefined }}
              >
                {lv === "basic" ? "基本（門前のみ）" : "応用（鳴き・槓あり）"}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-1 text-sm opacity-75">
          正解 {stats.answered ? `符 ${stats.fuCorrect}/${stats.answered}・点数 ${stats.pointCorrect}/${stats.answered}` : "—"}
          {stats.streak >= 2 && <span className="ml-2 text-amber-300">{stats.streak}問連続正解</span>}
        </p>

        <section className="mt-4 rounded-xl p-4" style={{ background: "rgba(255,255,255,0.05)" }}>
          <div className="mb-3 flex flex-wrap gap-1.5 text-xs">
            {chips.map((c) => (
              <span key={c} className="rounded-full px-2.5 py-1" style={{ background: "rgba(255,255,255,0.1)" }}>
                {c}
              </span>
            ))}
          </div>
          <div style={{ containerType: "inline-size" }}>
            <HandView
              concealed={input.concealed}
              winTile={input.winTile}
              melds={input.melds}
              width="min(48px, calc((100cqw - 24px) / 15))"
              winLabel={input.isTsumo ? "ツモ" : "ロン"}
            />
          </div>
          <p className="mt-3 text-sm">
            役: {result.yaku.map((y) => `${y.name}（${y.han}翻）`).join("・")}
            <span className="ml-2 font-bold">合計 {result.han}翻</span>
          </p>
          {step === "done" && <p className="mt-1 text-xs opacity-70">複数の解釈ができる手は、点数が高くなる方で数えます（高点法）。</p>}
        </section>

        {/* 符の回答 */}
        <section className="mt-4">
          <h2 className="mb-2 font-bold">Q1. この和了は何符？</h2>
          <div className="flex flex-wrap gap-2">
            {FU_CHOICES.map((fu) => {
              const chosen = fuAnswer === fu;
              const isAnswer = step !== "fu" && fu === result.fu;
              return (
                <button
                  key={fu}
                  type="button"
                  disabled={step !== "fu"}
                  onClick={() => answerFu(fu)}
                  className="min-w-14 rounded-lg px-3 py-2 font-bold tabular-nums"
                  style={{
                    background: isAnswer ? "#3fa86a" : chosen ? "#c3473f" : "rgba(255,255,255,0.1)",
                    opacity: step !== "fu" && !isAnswer && !chosen ? 0.4 : 1,
                  }}
                >
                  {fu}符
                </button>
              );
            })}
          </div>
          {step !== "fu" && (
            <p className={`mt-2 font-bold ${fuOk ? "text-green-300" : "text-red-300"}`}>
              {fuOk ? "正解！" : `不正解。正解は ${result.fu}符`}
            </p>
          )}
        </section>

        {/* 点数の回答 */}
        {step !== "fu" && (
          <section className="mt-4">
            <h2 className="mb-2 font-bold">
              Q2. {result.fu}符{result.han}翻、{input.seatWind === 0 ? "親" : "子"}の{input.isTsumo ? "ツモ" : "ロン"}は何点？
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {options.map((o) => {
                const chosen = pointAnswer === o.label;
                const reveal = step === "done";
                return (
                  <button
                    key={o.label}
                    type="button"
                    disabled={step === "done"}
                    onClick={() => answerPoint(o.label)}
                    className="rounded-lg px-3 py-2 font-bold tabular-nums"
                    style={{
                      background: reveal && o.correct ? "#3fa86a" : reveal && chosen ? "#c3473f" : "rgba(255,255,255,0.1)",
                      opacity: reveal && !o.correct && !chosen ? 0.4 : 1,
                    }}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
            {input.isTsumo && <p className="mt-1 text-xs opacity-60">ツモの表記は「子の支払い / 親の支払い」、親のツモは「◯点オール」。</p>}
          </section>
        )}

        {/* 答え合わせ */}
        {step === "done" && (
          <section className="mt-5 rounded-xl p-4" style={{ background: "rgba(0,0,0,0.25)" }}>
            <h2 className="font-bold">答え合わせ</h2>
            <p className="mt-1 text-sm opacity-80">面子構成: {result.structure}</p>
            <p className="text-sm opacity-80">待ち: {WAIT_NAMES[result.waitType]}</p>
            <table className="mt-2 w-full max-w-md text-sm">
              <tbody>
                {result.fuDetail.map((f, i) => (
                  <tr key={i} className="border-t border-white/10">
                    <td className="py-1">{f.label}</td>
                    <td className="py-1 text-right tabular-nums">{f.fu}符</td>
                  </tr>
                ))}
                <tr className="border-t border-white/30 font-bold">
                  <td className="py-1">合計 → 切り上げ</td>
                  <td className="py-1 text-right tabular-nums">
                    {result.fuDetail.reduce((a, f) => a + f.fu, 0)} → {result.fu}符
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-sm">
              点数: {result.fu}符{result.han}翻 {result.payment.limit && <span className="text-amber-300">{result.payment.limit} </span>}
              {correctPoint}
            </p>
            <div className="mt-3">
              <CoachPanel compact actions={[{ label: "AI コーチに解説してもらう", build: () => drillFacts(input, result) }]} />
            </div>
            <button
              type="button"
              onClick={() => next(level)}
              className="mt-4 w-full rounded-lg py-3 text-lg font-bold"
              style={{ background: "#e8b931", color: "#1c1a17" }}
            >
              次の問題
            </button>
          </section>
        )}
      </div>

      <aside className="h-fit rounded-xl p-4" style={{ background: "rgba(255,255,255,0.05)" }}>
        <h2 className="mb-3 text-lg font-bold">符の早見表</h2>
        <FuReference />
      </aside>
    </div>
  );
}
