/**
 * 卓まわりの表示部品（河・副露・中央パネル）。サイズは卓コンテナ基準の cqw 単位。
 */
import type { CalledMeld, Discard, GameState } from "@/lib/mahjong/game/types";
import { doraIndicators, remainingTiles, roundLabel, seatWind } from "@/lib/mahjong/game/engine";
import { TileSvg } from "./TileSvg";

export const WIND_CHARS = ["東", "南", "西", "北"];

export function River({
  discards,
  width,
  lastId,
  markTsumogiri,
}: {
  discards: Discard[];
  width: string;
  lastId: number | null;
  markTsumogiri: boolean;
}) {
  const rows: Discard[][] = [];
  for (let i = 0; i < discards.length; i += 6) rows.push(discards.slice(i, i + 6));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.15cqw" }}>
      {rows.map((row, ri) => (
        <div key={ri} style={{ display: "flex", alignItems: "flex-end", gap: "0.1cqw" }}>
          {row.map((d) => (
            <div
              key={d.tile.id}
              style={{
                filter: markTsumogiri && d.tsumogiri ? "brightness(0.8) saturate(0.7)" : undefined,
              }}
              title={`${d.tsumogiri ? "ツモ切り" : "手出し"}${d.riichi ? "・立直宣言牌" : ""}${d.calledBy !== undefined ? "・鳴かれた牌" : ""}`}
            >
              <TileSvg
                kind={d.tile.kind}
                red={d.tile.red}
                width={width}
                sideways={d.riichi}
                dim={d.calledBy !== undefined}
                highlight={d.tile.id === lastId ? "blue" : null}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** 副露1組。取得元に応じて横向きにする牌の位置を変える */
export function MeldView({ meld, owner, width }: { meld: CalledMeld; owner: number; width: string }) {
  const tiles = [...meld.tiles];
  if (meld.type === "ankan") {
    return (
      <div style={{ display: "flex", alignItems: "flex-end" }}>
        {tiles.map((t, i) => (
          <TileSvg key={t.id} kind={t.kind} red={t.red} width={width} back={i === 0 || i === 3} />
        ))}
      </div>
    );
  }
  const called = meld.calledTile!;
  const rel = ((meld.from ?? owner) - owner + 4) % 4; // 1=下家 2=対面 3=上家
  const rest = tiles.filter((t) => t.id !== called.id);
  const extra = meld.type === "kakan" ? rest.pop() : undefined;
  const pos = rel === 3 ? 0 : rel === 2 ? 1 : rest.length;
  const order = [...rest];
  order.splice(pos, 0, called);
  return (
    <div style={{ display: "flex", alignItems: "flex-end" }}>
      {order.map((t) =>
        t.id === called.id ? (
          <div key={t.id} style={{ display: "flex", flexDirection: "column" }}>
            {extra && <TileSvg kind={extra.kind} red={extra.red} width={width} sideways />}
            <TileSvg kind={t.kind} red={t.red} width={width} sideways />
          </div>
        ) : (
          <TileSvg key={t.id} kind={t.kind} red={t.red} width={width} />
        ),
      )}
    </div>
  );
}

export function Melds({ melds, owner, width }: { melds: CalledMeld[]; owner: number; width: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "row-reverse", alignItems: "flex-end", gap: "0.8cqw" }}>
      {melds.map((m, i) => (
        <MeldView key={i} meld={m} owner={owner} width={width} />
      ))}
    </div>
  );
}

export function CenterInfo({ state }: { state: GameState }) {
  const shown = doraIndicators(state);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.8cqw",
        color: "#f3efe2",
      }}
    >
      <div style={{ fontSize: "2.6cqw", fontWeight: 700, letterSpacing: "0.1em" }}>{roundLabel(state)}</div>
      <div style={{ display: "flex", gap: "1.4cqw", fontSize: "1.6cqw", opacity: 0.9 }}>
        <span>残り {remainingTiles(state)}</span>
        <span>供託 {state.kyotaku}</span>
      </div>
      <div style={{ display: "flex", gap: "0.25cqw" }} aria-label="ドラ表示牌">
        {[0, 1, 2, 3, 4].map((i) =>
          shown[i] ? (
            <TileSvg key={i} kind={shown[i].kind} red={shown[i].red} width="2.5cqw" title="ドラ表示牌" />
          ) : (
            <TileSvg key={i} back width="2.5cqw" />
          ),
        )}
      </div>
      <div style={{ fontSize: "1.3cqw", opacity: 0.75 }}>ドラ表示牌</div>
    </div>
  );
}

export function SeatLabel({ state, seat }: { state: GameState; seat: number }) {
  const p = state.players[seat];
  const wind = WIND_CHARS[seatWind(state, seat)];
  const isDealer = seat === state.dealer;
  const active = state.phase === "turn" && state.turn === seat;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5cqw" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.8cqw",
          fontSize: "1.9cqw",
          color: "#f3efe2",
          padding: "0.3cqw 1cqw",
          borderRadius: "0.8cqw",
          background: active ? "rgba(255, 214, 92, 0.25)" : "transparent",
          outline: active ? "0.2cqw solid rgba(255, 214, 92, 0.8)" : "none",
        }}
      >
        <span
          style={{
            fontWeight: 900,
            color: isDealer ? "#ffcf4a" : "#f3efe2",
          }}
        >
          {wind}
        </span>
        <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{state.scores[seat].toLocaleString()}</span>
      </div>
      <div
        aria-label={p.riichi ? "立直" : undefined}
        style={{
          width: "10cqw",
          height: "0.9cqw",
          borderRadius: "0.45cqw",
          background: p.riichi ? "#fbf7ec" : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {p.riichi && <span style={{ width: "0.7cqw", height: "0.7cqw", borderRadius: "50%", background: "#c3262e" }} />}
      </div>
    </div>
  );
}
