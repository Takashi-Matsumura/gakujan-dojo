/**
 * 局の結果（和了・流局）と終局の成績表示。
 * 符の内訳まで出して、点数計算の学習に使えるようにする。
 */
import { WAIT_NAMES } from "@/lib/mahjong/evaluate";
import type { GameState, RoundResult } from "@/lib/mahjong/game/types";
import { seatWind } from "@/lib/mahjong/game/engine";
import { TileSvg } from "./TileSvg";
import { MeldView, WIND_CHARS } from "./TableParts";
import { CoachPanel } from "./CoachPanel";
import { winFacts } from "@/lib/mahjong/coach/facts";

const panel: React.CSSProperties = {
  background: "rgba(18, 24, 21, 0.94)",
  color: "#f3efe2",
  borderRadius: 14,
  padding: "20px 22px",
  boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
  border: "1px solid rgba(255,255,255,0.12)",
  width: "min(640px, calc(100vw - 32px))",
  maxHeight: "calc(100dvh - 24px)",
  overflowY: "auto",
};

const btn: React.CSSProperties = {
  flexShrink: 0,
  padding: "10px 18px",
  fontSize: 16,
  fontWeight: 700,
  borderRadius: 10,
  border: "none",
  background: "#e8b931",
  color: "#1c1a17",
  cursor: "pointer",
};

/**
 * 見出しと「次へ」ボタン。ボタンが内容の長さで画面外に押し出されないよう、
 * パネルの先頭に置き、スクロールしても上に貼り付ける。
 */
function PanelHeader({ title, action, onAction }: { title: React.ReactNode; action: string; onAction: () => void }) {
  return (
    <div
      style={{
        position: "sticky",
        top: -20,
        zIndex: 1,
        margin: "-20px -22px 0",
        padding: "16px 22px 12px",
        background: "rgba(18, 24, 21, 0.98)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <h2 style={{ fontSize: 22, fontWeight: 800 }}>{title}</h2>
      <button style={btn} onClick={onAction} autoFocus>
        {action}
      </button>
    </div>
  );
}

function Deltas({ state, result }: { state: GameState; result: RoundResult }) {
  return (
    <table style={{ width: "100%", marginTop: 14, borderCollapse: "collapse", fontSize: 15 }}>
      <tbody>
        {state.players.map((p, i) => {
          const d = result.deltas[i];
          return (
            <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <td style={{ padding: "5px 4px", width: 32, fontWeight: 900 }}>{WIND_CHARS[seatWind(state, i)]}</td>
              <td style={{ padding: "5px 4px" }}>{p.name}</td>
              <td style={{ padding: "5px 4px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {state.scores[i].toLocaleString()}
              </td>
              <td
                style={{
                  padding: "5px 4px",
                  textAlign: "right",
                  width: 90,
                  fontVariantNumeric: "tabular-nums",
                  color: d > 0 ? "#7fdc9a" : d < 0 ? "#ff8f8f" : "#bbb",
                }}
              >
                {d > 0 ? "+" : ""}
                {d ? d.toLocaleString() : "±0"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function RoundResultPanel({ state, onNext }: { state: GameState; onNext: () => void }) {
  const r = state.result!;
  if (r.type === "draw") {
    return (
      <div style={panel}>
        <PanelHeader title="流局" action="次の局へ" onAction={onNext} />
        <p style={{ marginTop: 6, opacity: 0.85 }}>
          テンパイ: {state.players.filter((_, i) => r.tenpai[i]).map((p) => p.name).join("、") || "なし"}
          {r.tenpai[state.dealer] ? "（親テンパイで連荘）" : "（親流れ）"}
        </p>
        <Deltas state={state} result={r} />
      </div>
    );
  }
  const w = r.win;
  const winner = state.players[r.winner];
  return (
    <div style={panel}>
      <PanelHeader
        title={
          <>
            {winner.name} の{r.from === null ? "ツモ" : "ロン"}和了
            {r.from !== null && <span style={{ fontSize: 15, fontWeight: 500, opacity: 0.8 }}>（放銃: {state.players[r.from].name}）</span>}
          </>
        }
        action="次の局へ"
        onAction={onNext}
      />

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 2, marginTop: 12 }}>
        {r.hand
          .slice()
          .sort((a, b) => a.kind - b.kind)
          .map((t) => (
            <TileSvg key={t.id} kind={t.kind} red={t.red} width="clamp(22px, 5.4vw, 38px)" />
          ))}
        <div style={{ width: 8 }} />
        <TileSvg kind={r.winTile.kind} red={r.winTile.red} width="clamp(22px, 5.4vw, 38px)" highlight="gold" />
        <div style={{ width: 8 }} />
        {r.melds.map((m, i) => (
          <MeldView key={i} meld={m} owner={r.winner} width="clamp(18px, 4.4vw, 30px)" />
        ))}
      </div>
      {r.uraIndicators.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 13, opacity: 0.85 }}>
          裏ドラ表示牌
          {r.uraIndicators.map((t) => (
            <TileSvg key={t.id} kind={t.kind} red={t.red} width="22px" />
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 14 }}>
        <div>
          <h3 style={{ fontSize: 14, opacity: 0.7, marginBottom: 4 }}>役</h3>
          <ul>
            {w.yaku.map((y) => (
              <li key={y.name} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                <span>{y.name}</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{y.yakuman ? (y.yakuman > 1 ? `${y.yakuman}倍役満` : "役満") : `${y.han}翻`}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 style={{ fontSize: 14, opacity: 0.7, marginBottom: 4 }}>
            符の内訳{w.yakuman ? "" : `（${WAIT_NAMES[w.waitType]}待ち）`}
          </h3>
          {w.yakuman ? (
            <p style={{ opacity: 0.8 }}>役満のため符計算は不要</p>
          ) : (
            <ul>
              {w.fuDetail.map((f, i) => (
                <li key={i} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 14 }}>
                  <span>{f.label}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{f.fu}符</span>
                </li>
              ))}
              <li style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>合計を10符単位に切り上げ → {w.fu}符</li>
            </ul>
          )}
        </div>
      </div>

      <div style={{ marginTop: 14, padding: "10px 12px", background: "rgba(255,255,255,0.06)", borderRadius: 10 }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>
          {w.yakuman ? "" : `${w.fu}符 ${w.han}翻 `}
          {w.payment.limit && <span style={{ color: "#ffcf4a" }}>{w.payment.limit} </span>}
          {w.payment.total.toLocaleString()}点
        </div>
        <div style={{ fontSize: 13, opacity: 0.75, marginTop: 2 }}>
          {r.from === null
            ? w.payment.tsumoFromDealer
              ? `子 ${w.payment.tsumoFromChild}点 / 親 ${w.payment.tsumoFromDealer}点 の支払い`
              : `${w.payment.tsumoFromChild}点オール`
            : `${state.players[r.from].name} が ${w.payment.ron?.toLocaleString()}点 支払い`}
          {state.honba > 0 && `（${state.honba}本場を含む）`}
          {r.paoSeat !== null && ` ／ 包: ${state.players[r.paoSeat].name}`}
        </div>
        <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>面子構成: {w.structure}</div>
      </div>

      <div style={{ marginTop: 12 }}>
        <CoachPanel compact actions={[{ label: "AI コーチにこの和了を解説してもらう", build: () => winFacts(state) }]} />
      </div>

      <Deltas state={state} result={r} />
    </div>
  );
}

export function GameEndPanel({ state, onRestart }: { state: GameState; onRestart: () => void }) {
  const rows = [...state.standings!].sort((a, b) => a.rank - b.rank || a.seat - b.seat);
  return (
    <div style={panel}>
      <PanelHeader title="終局" action="もう一度対局する" onAction={onRestart} />
      <p style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>25,000点持ち 30,000点返し ／ 順位点 +30・+10・−10・−30 ／ オカ +20 はトップ</p>
      <table style={{ width: "100%", marginTop: 12, borderCollapse: "collapse", fontSize: 16 }}>
        <thead>
          <tr style={{ fontSize: 13, opacity: 0.7, textAlign: "left" }}>
            <th style={{ padding: 4 }}>順位</th>
            <th style={{ padding: 4 }}>名前</th>
            <th style={{ padding: 4, textAlign: "right" }}>持ち点</th>
            <th style={{ padding: 4, textAlign: "right" }}>ポイント</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.seat} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <td style={{ padding: "6px 4px", fontWeight: 800 }}>{s.rank}位</td>
              <td style={{ padding: "6px 4px" }}>{state.players[s.seat].name}</td>
              <td style={{ padding: "6px 4px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{s.score.toLocaleString()}</td>
              <td
                style={{
                  padding: "6px 4px",
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                  color: s.points >= 0 ? "#7fdc9a" : "#ff8f8f",
                }}
              >
                {s.points > 0 ? "+" : ""}
                {s.points.toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
