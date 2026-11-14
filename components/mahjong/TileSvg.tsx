/**
 * 麻雀牌の SVG。画像素材を使わず自前で描画する。
 *
 * 見やすさの工夫:
 * - 牌面は 60x80 の座標系で描き、厚み（側面）を 4 付けて立体感を出す
 * - 萬子は漢数字を大きく、筒子・索子は配置を整理して数を数えやすく
 * - 赤ドラは色だけでなく右上の ★ 刻印でも区別（色覚への配慮。学雀連も刻印入り牌を推奨）
 */
import { memo, type ReactNode } from "react";
import { numberOf, suitOf, type TileKind } from "@/lib/mahjong/tiles";

const INK = "#1c1a17";
export const RED = "#c3262e";
const GREEN = "#13784a";
const BLUE = "#1f4fa0";
export const FACE = "#fbf7ec";
const FACE_EDGE = "#cfc6ae";
// 牌の背: 山吹色（黄・オレンジ・クリームの中間）
const BACK = "#eba63f";
const BACK_DARK = "#c98428";
const SIDE = "#e9dfc6";

const SERIF = "var(--font-tile), 'Hiragino Mincho ProN', 'Yu Mincho', serif";

const KANJI_NUM = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];
const HONOR = ["東", "南", "西", "北", "白", "發", "中"];

type Dot = [x: number, y: number, r: number, color: string];

const PIN_LAYOUT: Record<number, Dot[]> = {
  2: [
    [30, 22, 11, GREEN],
    [30, 58, 11, BLUE],
  ],
  3: [
    [16, 17, 9, BLUE],
    [30, 40, 9, RED],
    [44, 63, 9, GREEN],
  ],
  4: [
    [18, 23, 10, BLUE],
    [42, 23, 10, GREEN],
    [18, 57, 10, GREEN],
    [42, 57, 10, BLUE],
  ],
  5: [
    [17, 18, 8.5, BLUE],
    [43, 18, 8.5, GREEN],
    [30, 40, 8.5, RED],
    [17, 62, 8.5, GREEN],
    [43, 62, 8.5, BLUE],
  ],
  6: [
    [19, 15, 8, GREEN],
    [41, 15, 8, GREEN],
    [19, 42, 8, RED],
    [41, 42, 8, RED],
    [19, 65, 8, RED],
    [41, 65, 8, RED],
  ],
  7: [
    [14, 12, 7, GREEN],
    [30, 21, 7, GREEN],
    [46, 30, 7, GREEN],
    [19, 50, 7.5, RED],
    [41, 50, 7.5, RED],
    [19, 68, 7.5, RED],
    [41, 68, 7.5, RED],
  ],
  8: [
    [19, 12, 7.5, BLUE],
    [41, 12, 7.5, BLUE],
    [19, 31, 7.5, BLUE],
    [41, 31, 7.5, BLUE],
    [19, 50, 7.5, BLUE],
    [41, 50, 7.5, BLUE],
    [19, 69, 7.5, BLUE],
    [41, 69, 7.5, BLUE],
  ],
  9: [15, 30, 45].flatMap((x) =>
    [
      [16, BLUE],
      [40, RED],
      [64, GREEN],
    ].map(([y, c]) => [x, y as number, 7.5, c as string] as Dot),
  ),
};

function Pin({ x, y, r, color }: { x: number; y: number; r: number; color: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={color} />
      <circle cx={x} cy={y} r={r * 0.72} fill={FACE} />
      <circle cx={x} cy={y} r={r * 0.5} fill={color} />
      <circle cx={x} cy={y} r={r * 0.18} fill={FACE} />
    </g>
  );
}

type Stick = [x: number, y: number, h: number, color: string, rot?: number];

const SOU_LAYOUT: Record<number, Stick[]> = {
  2: [
    [30, 22, 26, GREEN],
    [30, 58, 26, BLUE],
  ],
  3: [
    [30, 22, 26, GREEN],
    [18, 58, 26, BLUE],
    [42, 58, 26, BLUE],
  ],
  4: [
    [18, 22, 26, GREEN],
    [42, 22, 26, BLUE],
    [18, 58, 26, BLUE],
    [42, 58, 26, GREEN],
  ],
  5: [
    [15, 21, 24, GREEN],
    [45, 21, 24, BLUE],
    [30, 40, 24, RED],
    [15, 59, 24, BLUE],
    [45, 59, 24, GREEN],
  ],
  6: [15, 30, 45].flatMap((x) => [
    [x, 22, 26, GREEN] as Stick,
    [x, 58, 26, BLUE] as Stick,
  ]),
  7: [
    [30, 13, 18, RED],
    ...[15, 30, 45].flatMap((x) => [[x, 40, 20, GREEN] as Stick, [x, 65, 20, BLUE] as Stick]),
  ],
  8: [
    [13, 22, 26, GREEN, 0],
    [25, 22, 26, GREEN, 28],
    [35, 22, 26, GREEN, -28],
    [47, 22, 26, GREEN, 0],
    [13, 58, 26, BLUE, 0],
    [25, 58, 26, BLUE, -28],
    [35, 58, 26, BLUE, 28],
    [47, 58, 26, BLUE, 0],
  ],
  9: [15, 30, 45].flatMap((x) =>
    [16, 40, 64].map((y) => [x, y, 20, x === 30 ? RED : GREEN] as Stick),
  ),
};

function Bamboo({ x, y, h, color, rot = 0 }: { x: number; y: number; h: number; color: string; rot?: number }) {
  const w = 7;
  return (
    <g transform={`rotate(${rot} ${x} ${y})`}>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={3.5} fill={color} />
      <rect x={x - 1} y={y - h / 2 + 2.5} width={2} height={h - 5} rx={1} fill={FACE} opacity={0.55} />
      <rect x={x - w / 2 - 0.6} y={y - 1} width={w + 1.2} height={2} rx={1} fill={color} />
    </g>
  );
}

/**
 * 一索の鳥（伝統的な孔雀の図案）。
 * 上: 白い目玉模様が並ぶ緑の扇形の尾羽 / 下: 黒い輪郭の白い胴と格子模様の翼 / 赤いくちばしと脚。
 * 三角関数の結果はサーバとブラウザで端数が変わり hydration がずれるため、座標は計算済みの固定値。
 */
const BIRD_FRINGE: [number, number, number, number][] = [[14.6, 22.6, 7.84, 21.44], [15.3, 20.28, 10.45, 18.57], [16.46, 18.1, 10.51, 14.75], [18.02, 16.13, 14.07, 12.92], [19.95, 14.43, 15.54, 9.3], [22.18, 13.05, 19.6, 8.72], [24.65, 12.03, 22.3, 5.74], [27.28, 11.41, 26.39, 6.49], [30.0, 11.2, 30.0, 4.5], [32.72, 11.41, 33.61, 6.49], [35.35, 12.03, 37.7, 5.74], [37.82, 13.05, 40.4, 8.72], [40.05, 14.43, 44.46, 9.3], [41.98, 16.13, 45.93, 12.92], [43.54, 18.1, 49.49, 14.75], [44.7, 20.28, 49.55, 18.57], [45.4, 22.6, 52.16, 21.44]];
const BIRD_WING_RIBS: [number, number, number, number][] = [[25.0, 61.0, 12.0, 61.0], [25.36, 58.95, 13.15, 56.32], [26.4, 57.14, 16.45, 52.21], [28.0, 55.8, 21.5, 49.15], [29.96, 55.09, 27.7, 47.53], [32.04, 55.09, 34.3, 47.53], [34.0, 55.8, 40.5, 49.15], [35.6, 57.14, 45.55, 52.21], [36.64, 58.95, 48.85, 56.32], [37.0, 61.0, 50.0, 61.0]];
const BIRD_EYES: [number, number][] = [
  [25.5, 15], [34.5, 15],
  [21, 22], [30, 22], [39, 22],
  [17, 29], [25.5, 29], [34.5, 29], [43, 29],
  [21, 36], [30, 36], [39, 36],
];

function SouBird() {
  const PEACOCK = "#4f8a2f";
  const BEAK = "#c4472b";
  return (
    <g transform="translate(30 41) scale(0.86) translate(-30 -41)" strokeLinecap="round" strokeLinejoin="round">
      {/* 尾羽の扇 */}
      {BIRD_FRINGE.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={PEACOCK} strokeWidth={1.9} />
      ))}
      <ellipse cx={30} cy={25} rx={18.5} ry={15.5} fill={PEACOCK} />
      <path d="M15 33 Q14.5 41 20.5 43.5 L39.5 43.5 Q45.5 41 45 33 Z" fill={PEACOCK} />
      {[24, 28, 32, 36].map((x) => (
        <line key={x} x1={x} y1={42} x2={x} y2={50} stroke={PEACOCK} strokeWidth={1.4} />
      ))}
      {BIRD_EYES.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={2.7} fill="none" stroke="#ffffff" strokeWidth={1.6} />
      ))}

      {/* 翼（格子模様の半円） */}
      <path d="M12 61 Q12 46 31 47 Q50 46 50 61 Z" fill="#ffffff" stroke={INK} strokeWidth={1.3} />
      {BIRD_WING_RIBS.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={INK} strokeWidth={0.9} />
      ))}
      <path d="M17 58 Q19 50 31 51 Q43 50 45 58" fill="none" stroke={INK} strokeWidth={0.9} />
      <path d="M21.5 59.5 Q23 54 31 54.5 Q39 54 40.5 59.5" fill="none" stroke={INK} strokeWidth={0.8} />

      {/* 冠羽とくちばし */}
      <path d="M17 50 L8 45 M17 51.5 L7.5 50" stroke={BEAK} strokeWidth={1.5} />
      <path d="M15.5 53 L9 54.5 L15.5 56 Z" fill={BEAK} />

      {/* 胴と頭（白、黒い輪郭） */}
      <path
        d="M15.5 54.5 Q15 49 20 48.5 Q25 48.5 24.5 54 Q24 57 27 58 Q35 57 41 59 Q44 62 39 65 Q30 68 21 64 Q15.5 61 15.5 54.5 Z"
        fill="#ffffff"
        stroke={INK}
        strokeWidth={1.4}
      />
      <path d="M26 60.5 Q32 59 38 61.5" fill="none" stroke={INK} strokeWidth={0.9} />
      <circle cx={19.6} cy={52.2} r={1.2} fill={INK} />

      {/* 脚 */}
      <path d="M27 66 L26 74 M26 74 L22.5 75 M26 74 L28.5 75.5" stroke={BEAK} strokeWidth={1.6} />
      <path d="M34 66 L35 74 M35 74 L31.5 75 M35 74 L38.5 75.5" stroke={BEAK} strokeWidth={1.6} />
    </g>
  );
}

export function faceContent(kind: TileKind, red: boolean): ReactNode {
  const suit = suitOf(kind);
  const n = numberOf(kind);
  if (suit === "z") {
    // 白は無地
    if (kind === 31) return null;
    const color = kind === 32 ? GREEN : kind === 33 ? RED : INK;
    return (
      <text
        x={30}
        y={41}
        fontSize={42}
        fontWeight={900}
        fontFamily={SERIF}
        fill={color}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {HONOR[n - 1]}
      </text>
    );
  }
  if (suit === "m") {
    return (
      <g fontFamily={SERIF} fontWeight={900} textAnchor="middle" dominantBaseline="central">
        <text x={30} y={22} fontSize={30} fill={red ? RED : INK}>
          {KANJI_NUM[n - 1]}
        </text>
        <text x={30} y={57} fontSize={30} fill={RED}>
          萬
        </text>
      </g>
    );
  }
  if (suit === "p") {
    if (n === 1) {
      return (
        <g>
          <circle cx={30} cy={40} r={21} fill={GREEN} />
          <circle cx={30} cy={40} r={17} fill={FACE} />
          <circle cx={30} cy={40} r={14} fill={RED} />
          <circle cx={30} cy={40} r={9} fill={FACE} />
          <circle cx={30} cy={40} r={6} fill={BLUE} />
          <circle cx={30} cy={40} r={2.2} fill={FACE} />
        </g>
      );
    }
    return PIN_LAYOUT[n].map(([x, y, r, c], i) => (
      <Pin key={i} x={x} y={y} r={r} color={red && n === 5 ? RED : c} />
    ));
  }
  // 索子
  // 一索は鳥
  if (n === 1) return <SouBird />;
  return SOU_LAYOUT[n].map(([x, y, h, c, rot], i) => (
    <Bamboo key={i} x={x} y={y} h={h} color={red && n === 5 ? RED : c} rot={rot} />
  ));
}

export interface TileSvgProps {
  kind?: TileKind;
  red?: boolean;
  /** 裏向き */
  back?: boolean;
  /** 横向き（立直宣言牌・鳴いた牌） */
  sideways?: boolean;
  /** 幅（CSS 値）。高さは比率で決まる */
  width: string;
  dim?: boolean;
  highlight?: "gold" | "blue" | "red" | null;
  title?: string;
}

function Face({ kind, red, back, highlight }: Pick<TileSvgProps, "kind" | "red" | "back" | "highlight">) {
  const stroke = highlight === "gold" ? "#e0a400" : highlight === "blue" ? "#2b7bff" : highlight === "red" ? RED : null;
  return (
    <g>
      {/* 厚み */}
      <rect x={0.5} y={3} width={59} height={80.5} rx={7} fill={back ? BACK_DARK : SIDE} />
      {back ? (
        <>
          <rect x={0.5} y={0.5} width={59} height={79} rx={7} fill={BACK} />
          <rect x={6} y={6} width={48} height={68} rx={4} fill="none" stroke="#fff3d6" strokeOpacity={0.45} strokeWidth={2} />
        </>
      ) : (
        <>
          <rect x={0.5} y={0.5} width={59} height={79} rx={7} fill={FACE} stroke={FACE_EDGE} strokeWidth={1} />
          {kind !== undefined && faceContent(kind, !!red)}
          {red && (
            <text x={53} y={9} fontSize={10} fill={RED} textAnchor="middle" dominantBaseline="central" aria-hidden>
              ★
            </text>
          )}
        </>
      )}
      {stroke && <rect x={1.5} y={1.5} width={57} height={77} rx={6.5} fill="none" stroke={stroke} strokeWidth={3.5} />}
    </g>
  );
}

function TileSvgImpl(props: TileSvgProps) {
  const { sideways, width, dim, title } = props;
  const label = title ?? (props.back ? "伏せ牌" : undefined);
  if (sideways) {
    return (
      <svg
        viewBox="0 0 84 60"
        style={{ width: `calc(${width} * 84 / 60)`, height: width, opacity: dim ? 0.45 : 1, display: "block", flex: "none" }}
        role="img"
        aria-label={label}
      >
        <g transform="translate(0 60) rotate(-90)">
          <Face {...props} />
        </g>
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 60 84"
      style={{ width, height: `calc(${width} * 84 / 60)`, opacity: dim ? 0.45 : 1, display: "block", flex: "none" }}
      role="img"
      aria-label={label}
    >
      <Face {...props} />
    </svg>
  );
}

export const TileSvg = memo(TileSvgImpl);
