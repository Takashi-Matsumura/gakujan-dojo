"use client";

/**
 * AI コーチ（ローカル LLM）の解説パネル。
 * 押した瞬間の局面から事実シートを作り、/api/coach にストリームで解説を依頼する。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { FactSheet } from "@/lib/mahjong/coach/facts";
import { TileSvg } from "./TileSvg";

type Status = { ok: true; model: string } | { ok: false; error: string };

let statusPromise: Promise<Status> | null = null;
function fetchStatus(force = false): Promise<Status> {
  if (!statusPromise || force) {
    statusPromise = fetch("/api/coach", { cache: "no-store" })
      .then((r) => r.json() as Promise<Status>)
      .catch(() => ({ ok: false, error: "API に接続できません" }) as Status);
  }
  return statusPromise;
}

export interface CoachAction {
  label: string;
  build: () => FactSheet | null;
  disabled?: boolean;
  /** 結論の表示に LLM を使わない（LLM 未接続でも押せる） */
  instant?: boolean;
}

export function CoachPanel({
  actions,
  compact = false,
  contextKey,
  autoRun = false,
  onRun,
}: {
  actions: CoachAction[];
  compact?: boolean;
  /** 局面が変わったことを検知するためのキー */
  contextKey?: string;
  /** true なら局面が変わるたびに先頭のアクションを自動で実行する（結論の表示まで） */
  autoRun?: boolean;
  /** アクションを実行したとき（手動・自動とも）に呼ぶ */
  onRun?: (facts: FactSheet) => void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [sheet, setSheet] = useState<FactSheet | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 結論だけ見せて、説明が必要か尋ねている状態 */
  const [asking, setAsking] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [sheetKey, setSheetKey] = useState<string | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  const [autoKey, setAutoKey] = useState<string | undefined>(undefined);

  // 自動モード: 局面が変わったら先頭のアクションを実行する（描画中に state を合わせる React の推奨パターン）
  if (autoRun && contextKey !== autoKey) {
    setAutoKey(contextKey);
    const first = actions[0];
    const facts = first && !first.disabled ? first.build() : null;
    if (facts) {
      setSheet(facts);
      setSheetKey(contextKey);
      setText("");
      setError(null);
      setLoading(false);
      setDeclined(false);
      setAsking(!!facts.askBeforeExplain);
    }
  }
  // 自動で切り替わったら、前の局面の解説のストリームは止める
  useEffect(() => {
    if (autoRun) abortRef.current?.abort();
  }, [autoRun, contextKey]);

  useEffect(() => {
    let alive = true;
    void fetchStatus().then((s) => alive && setStatus(s));
    return () => {
      alive = false;
      abortRef.current?.abort();
    };
  }, []);

  const explain = useCallback(async (facts: FactSheet) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setAsking(false);
    setDeclined(false);
    setText("");
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: facts.kind, lines: facts.lines }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `エラー（${res.status}）`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        setText((t) => t + decoder.decode(value, { stream: true }));
      }
    } catch (e) {
      if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (abortRef.current === ctrl) setLoading(false);
    }
  }, []);

  const run = (action: CoachAction) => {
    const facts = action.build();
    if (!facts) return;
    onRun?.(facts);
    abortRef.current?.abort();
    setLoading(false);
    setSheet(facts);
    setSheetKey(contextKey);
    setText("");
    setError(null);
    setDeclined(false);
    if (facts.askBeforeExplain) {
      setAsking(true);
      return;
    }
    void explain(facts);
  };

  const stop = () => {
    abortRef.current?.abort();
    setLoading(false);
  };

  const offline = status !== null && !status.ok;

  return (
    <section className={compact ? "" : "mt-4"}>
      {!compact && (
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-bold">AI コーチ</h2>
          <span className="flex items-center gap-1.5 text-xs opacity-75">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: status === null ? "#999" : status.ok ? "#5fd38a" : "#ff7b7b" }}
            />
            {status === null ? "確認中" : status.ok ? status.model : "未接続"}
          </span>
        </div>
      )}
      {offline && (
        <p className="mb-2 text-xs leading-5 text-red-300">
          {status.error}。llama-server（gemma4）が起動しているか確認してください。
          <button className="ml-1 underline" onClick={() => void fetchStatus(true).then(setStatus)}>
            再確認
          </button>
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            disabled={a.disabled || loading || (offline && !a.instant)}
            onClick={() => run(a)}
            className="rounded-md px-2.5 py-1.5 text-xs font-bold disabled:opacity-40"
            style={{ background: "#2f6f8f", color: "#f3efe2" }}
          >
            {a.label}
          </button>
        ))}
        {loading && (
          <button type="button" onClick={stop} className="rounded-md px-2.5 py-1.5 text-xs" style={{ background: "#555" }}>
            停止
          </button>
        )}
      </div>

      {(sheet || error) && (
        <div className="mt-2 rounded-lg p-3 text-[13px] leading-6" style={{ background: "rgba(0,0,0,0.28)" }}>
          {sheet && <div className="mb-1 text-xs font-bold opacity-70">{sheet.title}</div>}
          {sheet?.headline && (
            <div className="mb-2 flex items-center gap-3">
              {sheet.headline.tile !== undefined && <TileSvg kind={sheet.headline.tile} width="40px" highlight="gold" />}
              <div>
                <div className="text-base font-bold">おすすめ: {sheet.headline.text}</div>
                {sheet.headline.note && <div className="text-xs opacity-75">{sheet.headline.note}</div>}
              </div>
            </div>
          )}
          {sheet && contextKey !== undefined && sheetKey !== contextKey && (
            <p className="mb-2 text-xs text-amber-300">局面が進んだため、この内容は少し前の局面のものです。</p>
          )}
          {asking && (
            <div className="flex flex-wrap items-center gap-2">
              <span>なぜこの牌を切るのか、理由の説明を聞きますか？</span>
              <button
                type="button"
                disabled={offline}
                onClick={() => sheet && void explain(sheet)}
                className="rounded-md px-3 py-1 text-xs font-bold disabled:opacity-40"
                style={{ background: "#e8b931", color: "#1c1a17" }}
              >
                はい、説明して
              </button>
              <button
                type="button"
                onClick={() => {
                  setAsking(false);
                  setDeclined(true);
                }}
                className="rounded-md px-3 py-1 text-xs"
                style={{ background: "#555" }}
              >
                いいえ
              </button>
              {offline && <span className="text-xs text-red-300">AI コーチが未接続のため説明できません</span>}
            </div>
          )}
          {declined && <p className="text-xs opacity-60">説明は省略しました。必要になったら、もう一度ボタンを押してください。</p>}
          {error ? (
            <p className="text-red-300">{error}</p>
          ) : asking || declined ? null : (
            <p className="whitespace-pre-wrap">
              {text}
              {loading && <span className="animate-pulse opacity-60">{text ? " ▍" : "考えています…"}</span>}
            </p>
          )}
          {sheet && !asking && !declined && (
            <details className="mt-2 text-xs opacity-75">
              <summary className="cursor-pointer">AI に渡した事実（コードで計算した確定情報）</summary>
              <ul className="mt-1 flex flex-col gap-0.5">
                {sheet.lines.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </details>
          )}
          {!loading && text && (
            <p className="mt-2 text-[11px] opacity-50">
              解説はローカル LLM の生成文です。数値は「AI に渡した事実」が正です。
            </p>
          )}
        </div>
      )}
    </section>
  );
}
