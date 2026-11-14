/**
 * 学習用の手牌表示（牌種ベース）。和了牌を金枠で強調し、副露は鳴いた牌を横向きにする。
 */
import type { Meld } from "@/lib/mahjong/evaluate";
import type { TileKind } from "@/lib/mahjong/tiles";
import { TileSvg } from "./TileSvg";

function MeldTiles({ meld, width }: { meld: Meld; width: string }) {
  const t = meld.tile;
  if (meld.type === "ankan") {
    return (
      <div className="flex items-end">
        <TileSvg back width={width} />
        <TileSvg kind={t} width={width} />
        <TileSvg kind={t} width={width} />
        <TileSvg back width={width} />
      </div>
    );
  }
  const tiles = meld.type === "chi" ? [t, t + 1, t + 2] : meld.type === "pon" ? [t, t, t] : [t, t, t, t];
  return (
    <div className="flex items-end">
      {tiles.map((k, i) => (
        <TileSvg key={i} kind={k} width={width} sideways={i === 0} />
      ))}
    </div>
  );
}

export function HandView({
  concealed,
  winTile,
  melds = [],
  width = "clamp(24px, 6vw, 44px)",
  winLabel,
}: {
  /** 和了牌を除く手牌 */
  concealed: TileKind[];
  winTile: TileKind;
  melds?: Meld[];
  width?: string;
  winLabel?: string;
}) {
  const sorted = [...concealed].sort((a, b) => a - b);
  return (
    <div className="flex flex-wrap items-end gap-y-2">
      <div className="flex items-end" style={{ gap: 2 }}>
        {sorted.map((k, i) => (
          <TileSvg key={i} kind={k} width={width} />
        ))}
      </div>
      <div className="ml-2 flex flex-col items-center">
        <TileSvg kind={winTile} width={width} highlight="gold" title="和了牌" />
        {winLabel && <span className="mt-0.5 text-[11px] leading-none text-amber-300">{winLabel}</span>}
      </div>
      {melds.length > 0 && (
        <div className="ml-3 flex items-end gap-2">
          {melds.map((m, i) => (
            <MeldTiles key={i} meld={m} width={`calc(${width} * 0.82)`} />
          ))}
        </div>
      )}
    </div>
  );
}
