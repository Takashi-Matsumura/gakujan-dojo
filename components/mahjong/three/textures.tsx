"use client";

/**
 * 3D 用テクスチャ。
 * - 牌の面: 2D 版と同じ SVG（faceContent）を画像化して CanvasTexture にする
 * - 文字ラベル: Canvas 2D で描画（ページで読み込んだ Web フォントが使える）
 */
import * as THREE from "three";
import { renderToStaticMarkup } from "react-dom/server";
import { FACE, RED, faceContent } from "../TileSvg";

const TEX_W = 240;
const TEX_H = 320;

export const textureKey = (kind: number, red: boolean) => `${kind}${red ? "r" : ""}`;

function faceMarkup(kind: number, red: boolean): string {
  const html = renderToStaticMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="2 2 56 76" width={TEX_W} height={TEX_H}>
      <rect x={0} y={0} width={60} height={80} fill={FACE} />
      {faceContent(kind, red)}
      {red && (
        <text x={52} y={9} fontSize={9} fill={RED} textAnchor="middle" dominantBaseline="central">
          ★
        </text>
      )}
    </svg>,
  );
  // 画像化した SVG ではページの CSS 変数が使えないので、明朝系のシステムフォントに置き換える
  return html.replace(/var\(--font-tile\),\s*/g, "");
}

async function loadFace(kind: number, red: boolean): Promise<THREE.Texture> {
  const img = new Image();
  const markup = faceMarkup(kind, red);
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  canvas.getContext("2d")!.drawImage(img, 0, 0, TEX_W, TEX_H);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

let facesPromise: Promise<Map<string, THREE.Texture>> | null = null;

/** 34種 + 赤5（3種）の牌面テクスチャを読み込む（1回だけ） */
export function loadTileFaces(): Promise<Map<string, THREE.Texture>> {
  if (!facesPromise) {
    facesPromise = (async () => {
      const jobs: Promise<[string, THREE.Texture]>[] = [];
      for (let k = 0; k < 34; k++) jobs.push(loadFace(k, false).then((t) => [textureKey(k, false), t]));
      for (const k of [4, 13, 22]) jobs.push(loadFace(k, true).then((t) => [textureKey(k, true), t]));
      return new Map(await Promise.all(jobs));
    })();
  }
  return facesPromise;
}

export interface LabelLine {
  text: string;
  size: number;
  color?: string;
  weight?: number;
}

/** 複数行の文字ラベルを描いたテクスチャ（背景は透明） */
export function makeLabelTexture(lines: LabelLine[], width = 512, height = 256): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const family = getComputedStyle(document.body).fontFamily || "sans-serif";
  const total = lines.reduce((a, l) => a + l.size * 1.25, 0);
  let y = (height - total) / 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const l of lines) {
    ctx.font = `${l.weight ?? 700} ${l.size}px ${family}`;
    ctx.fillStyle = l.color ?? "#f3efe2";
    ctx.fillText(l.text, width / 2, y);
    y += l.size * 1.25;
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
