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

/** 一索の鳥（尾羽を扇のように広げた正面向きの孔雀）。牌面に余白を残す大きさで描く */
function SouBird() {
  const ORANGE = "#d9861c";
  const TEAL = "#2a9d8f";
  // 尾羽: 胴の付け根 (30,50) から扇状に7本（半径22、-162°〜-18°）。
  // サーバとブラウザで三角関数の端数が変わり hydration がずれるため、座標は計算済みの固定値にする
  const feathers = [{ x: 9.08, y: 43.2 }, { x: 13.65, y: 35.28 }, { x: 21.05, y: 29.9 }, { x: 30.0, y: 28.0 }, { x: 38.95, y: 29.9 }, { x: 46.35, y: 35.28 }, { x: 50.92, y: 43.2 }];
  return (
    <g transform="translate(30 37.5) scale(0.8) translate(-30 -42)" strokeLinecap="round" strokeLinejoin="round">
      {feathers.map((f, i) => (
        <g key={i}>
          <line x1={30} y1={50} x2={f.x} y2={f.y} stroke={GREEN} strokeWidth={2.6} />
          <circle cx={f.x} cy={f.y} r={4} fill={TEAL} />
          <circle cx={f.x} cy={f.y} r={2.2} fill={BLUE} />
          <circle cx={f.x} cy={f.y} r={0.9} fill="#f2c94c" />
        </g>
      ))}
      {/* 胴と翼 */}
      <path d="M22 50 Q19 60 26 64 L34 64 Q41 60 38 50 Z" fill={GREEN} />
      <ellipse cx={30} cy={51} rx={7} ry={11} fill={BLUE} />
      <path d="M25 46 Q30 52 25 60" fill="none" stroke={TEAL} strokeWidth={1.6} />
      <path d="M35 46 Q30 52 35 60" fill="none" stroke={TEAL} strokeWidth={1.6} />
      {/* 首と頭 */}
      <path d="M27.5 44 Q28 37 30 34 Q32 37 32.5 44 Z" fill={BLUE} />
      <circle cx={30} cy={32} r={4.6} fill={BLUE} />
      {/* 冠羽 */}
      {[[27.38, 23.51], [30.0, 23.0], [32.62, 23.51]].map(([x, y], i) => {
        return (
          <g key={i}>
            <line x1={30} y1={28} x2={x} y2={y} stroke={INK} strokeWidth={0.9} />
            <circle cx={x} cy={y} r={1.4} fill={RED} />
          </g>
        );
      })}
      {/* 目とくちばし */}
      <circle cx={28.4} cy={31.4} r={1.2} fill={FACE} />
      <circle cx={31.6} cy={31.4} r={1.2} fill={FACE} />
      <path d="M29 34 L30 36.6 L31 34 Z" fill={ORANGE} />
      {/* 脚 */}
      <line x1={27} y1={63} x2={26} y2={68} stroke={ORANGE} strokeWidth={1.8} />
      <line x1={33} y1={63} x2={34} y2={68} stroke={ORANGE} strokeWidth={1.8} />
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
