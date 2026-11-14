"use client";

/**
 * three.js（React Three Fiber）による3D卓。
 *
 * 座標系: 卓の中心が原点、y が上。自分（人間）の席は +z 側でカメラもそちらから見下ろす。
 * 各席は「席ローカル座標（自分の席が +z、中心を向く）」で配置し、y 軸回転で4方向に回す。
 */
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { memo, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactElement } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { doraIndicators, remainingTiles, roundLabel, seatWind } from "@/lib/mahjong/game/engine";
import type { CalledMeld, GameState } from "@/lib/mahjong/game/types";
import type { Tile } from "@/lib/mahjong/tiles";
import { loadTileFaces, makeLabelTexture, textureKey } from "./textures";

// ------------------------------------------------------------------ 寸法と共有リソース

const W = 1;
const H = 1.36;
const D = 0.78;
const GAP = 0.03;
const TABLE = 28;
const CENTER = 3.9; // 中央パネルの半分の大きさ
const RIVER_Z = CENTER + 0.3;
/** 河の牌の拡大率（奥の席の河も読みやすくする） */
const RIVER_SCALE = 1.15;
const HAND_Z = 11.8;
/** 自分の手牌は手前に大きく置く */
const HUMAN_HAND_Z = 12.6;
const HUMAN_HAND_SCALE = 1.45;
const HUMAN = 0;
const WIND = ["東", "南", "西", "北"];

const geo = {
  front: new RoundedBoxGeometry(W, H, D * 0.64, 3, 0.11),
  back: new RoundedBoxGeometry(W, H, D * 0.42, 3, 0.11),
  face: new THREE.PlaneGeometry(W * 0.9, H * 0.9),
};
const mat = {
  ivory: new THREE.MeshStandardMaterial({ color: "#f3ede0", roughness: 0.42 }),
  ivoryDim: new THREE.MeshStandardMaterial({ color: "#a9a49a", roughness: 0.5 }),
  // 牌の背: 山吹色（黄・オレンジ・クリームの中間）
  back: new THREE.MeshStandardMaterial({ color: "#eba63f", roughness: 0.4 }),
};

type Faces = Map<string, THREE.Texture>;

const faceMatCache = new Map<string, THREE.MeshStandardMaterial>();
function faceMaterial(faces: Faces, tile: Tile, variant: "normal" | "dim" | "dark" | "gold" | "blue" | "select") {
  const key = `${textureKey(tile.kind, tile.red)}:${variant}`;
  let m = faceMatCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      map: faces.get(textureKey(tile.kind, tile.red)) ?? null,
      roughness: 0.5,
      color: variant === "dim" ? "#8a8780" : variant === "dark" ? "#c9c3b6" : "#ffffff",
      emissive: variant === "gold" ? "#b98400" : variant === "blue" ? "#1d5fd6" : variant === "select" ? "#6b5200" : "#000000",
      emissiveIntensity: variant === "gold" || variant === "blue" ? 0.45 : variant === "select" ? 0.25 : 0,
    });
    faceMatCache.set(key, m);
  }
  return m;
}

// ------------------------------------------------------------------ 牌1枚

type Pose = "stand" | "lie" | "down";

interface Tile3DProps {
  faces: Faces;
  tile: Tile | null;
  pose: Pose;
  position: [number, number, number];
  /** 卓上での向き（y 軸回転）。横向きの牌は +π/2 */
  rotY?: number;
  /** 手牌を少し後ろに傾ける角度 */
  tilt?: number;
  variant?: "normal" | "dim" | "dark" | "gold" | "blue" | "select";
  lift?: number;
  onClick?: () => void;
  onHover?: (over: boolean) => void;
}

const Tile3D = memo(function Tile3D({ faces, tile, pose, position, rotY = 0, tilt = 0, variant = "normal", lift = 0, onClick, onHover }: Tile3DProps) {
  const rotX = pose === "stand" ? -tilt : pose === "lie" ? -Math.PI / 2 : Math.PI / 2;
  const y = pose === "stand" ? H / 2 : D / 2;
  const handlers = onClick
    ? {
        onClick: (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          if (e.delta > 6) return; // ドラッグ（視点操作）は無視
          onClick();
        },
        onPointerOver: (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          document.body.style.cursor = "pointer";
          onHover?.(true);
        },
        onPointerOut: () => {
          document.body.style.cursor = "";
          onHover?.(false);
        },
      }
    : {};
  return (
    <group position={[position[0], position[1] + y + lift, position[2]]} rotation={[0, rotY, 0]}>
      <group rotation={[rotX, 0, 0]} {...handlers}>
        <mesh geometry={geo.front} material={variant === "dim" ? mat.ivoryDim : mat.ivory} position={[0, 0, D * 0.18]} castShadow receiveShadow />
        <mesh geometry={geo.back} material={mat.back} position={[0, 0, -D * 0.29]} castShadow receiveShadow />
        {tile && <mesh geometry={geo.face} material={faceMaterial(faces, tile, variant)} position={[0, 0, D / 2 + 0.003]} />}
      </group>
    </group>
  );
});

// ------------------------------------------------------------------ 文字ラベル

function Label({
  lines,
  position,
  size,
  rotation = [-Math.PI / 2, 0, 0],
  canvas = [512, 256],
}: {
  lines: Parameters<typeof makeLabelTexture>[0];
  position: [number, number, number];
  size: [number, number];
  rotation?: [number, number, number];
  canvas?: [number, number];
}) {
  const key = JSON.stringify(lines);
  const tex = useMemo(() => makeLabelTexture(lines, canvas[0], canvas[1]), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={size} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} />
    </mesh>
  );
}

// ------------------------------------------------------------------ 席ごとの配置

interface SeatProps {
  faces: Faces;
  state: GameState;
  seat: number;
  lastId: number | null;
  markTsumogiri: boolean;
  reveal: boolean;
  selectable: Set<number>;
  riichiMode: boolean;
  onDiscard: (tileId: number) => void;
}

function sortedForView(hand: Tile[], drawn: Tile | null): Tile[] {
  const rest = hand.filter((t) => t.id !== drawn?.id).sort((a, b) => a.kind - b.kind || a.id - b.id);
  return drawn && hand.some((t) => t.id === drawn.id) ? [...rest, drawn] : rest;
}

type MeldItem = { tile: Tile; sideways: boolean; faceDown: boolean; stack?: boolean };

function meldLayout(meld: CalledMeld, owner: number): MeldItem[] {
  if (meld.type === "ankan") return meld.tiles.map((t, i) => ({ tile: t, sideways: false, faceDown: i === 0 || i === 3 }));
  const called = meld.calledTile!;
  const rel = ((meld.from ?? owner) - owner + 4) % 4;
  const rest = meld.tiles.filter((t) => t.id !== called.id);
  const extra = meld.type === "kakan" ? rest.pop() : undefined;
  const pos = rel === 3 ? 0 : rel === 2 ? 1 : rest.length;
  const out: { tile: Tile; sideways: boolean; faceDown: boolean; stack?: boolean }[] = rest.map((t) => ({
    tile: t,
    sideways: false,
    faceDown: false,
  }));
  out.splice(pos, 0, { tile: called, sideways: true, faceDown: false });
  if (extra) out.splice(pos + 1, 0, { tile: extra, sideways: true, faceDown: false, stack: true });
  return out;
}

function Seat({ faces, state, seat, lastId, markTsumogiri, reveal, selectable, riichiMode, onDiscard }: SeatProps) {
  const p = state.players[seat];
  const rel = (seat - HUMAN + 4) % 4;
  const [hover, setHover] = useState<number | null>(null);
  const isHuman = seat === HUMAN;

  // 河: 6枚ごとに改行、立直宣言牌は横向き
  const river: ReactElement[] = [];
  let row = 0;
  let x = -3 * (W + GAP);
  p.discards.forEach((d, i) => {
    if (i > 0 && i % 6 === 0) {
      row++;
      x = -3 * (W + GAP);
    }
    const width = d.riichi ? H : W;
    const variant = d.tile.id === lastId ? "blue" : d.calledBy !== undefined ? "dim" : markTsumogiri && d.tsumogiri ? "dark" : "normal";
    river.push(
      <Tile3D
        key={d.tile.id}
        faces={faces}
        tile={d.tile}
        pose="lie"
        rotY={d.riichi ? Math.PI / 2 : 0}
        position={[x + width / 2, 0, row * (H + GAP) + (d.riichi ? W / 2 + (H - W) / 2 : H / 2)]}
        variant={variant}
      />,
    );
    x += width + GAP;
  });

  // 副露: 右端から左へ
  const melds: ReactElement[] = [];
  let mx = TABLE / 2 - 1.2;
  for (const m of p.melds) {
    const items = meldLayout(m, seat).reverse();
    for (const it of items) {
      const width = it.sideways ? H : W;
      if (it.stack) {
        // 加槓: 横向きの牌の上に重ねる（奥側にずらす）
        melds.push(
          <Tile3D key={it.tile.id} faces={faces} tile={it.tile} pose="lie" rotY={Math.PI / 2} position={[mx + width / 2 + GAP, 0, HAND_Z + 0.15 - W - GAP]} />,
        );
        continue;
      }
      mx -= width;
      melds.push(
        <Tile3D
          key={it.tile.id}
          faces={faces}
          tile={it.faceDown ? null : it.tile}
          pose={it.faceDown ? "down" : "lie"}
          rotY={it.sideways ? Math.PI / 2 : 0}
          position={[mx + width / 2, 0, HAND_Z + 0.15 + (it.sideways ? (H - W) / 2 : 0)]}
        />,
      );
      mx -= GAP;
    }
    mx -= 0.25;
  }
  const meldsWidth = TABLE / 2 - 1.2 - mx;

  // 手牌
  const tiles = sortedForView(p.hand, p.drawn);
  const handScale = isHuman ? HUMAN_HAND_SCALE : 1;
  const hw = (W + GAP) * handScale;
  const total = tiles.length * hw + (p.drawn ? 0.35 : 0);
  const startX = Math.min(-total / 2, TABLE / 2 - 1.5 - meldsWidth - total);
  const hand = tiles.map((t, i) => {
    const isDrawn = p.drawn?.id === t.id && i === tiles.length - 1;
    const hx = startX + i * hw + hw / 2 + (isDrawn ? 0.35 : 0);
    const can = isHuman && selectable.has(t.id);
    if (!isHuman && !reveal) {
      return <Tile3D key={t.id} faces={faces} tile={null} pose="stand" position={[hx, 0, HAND_Z]} />;
    }
    if (!isHuman) {
      return <Tile3D key={t.id} faces={faces} tile={t} pose="lie" position={[hx, 0, HAND_Z - 0.2]} />;
    }
    return (
      <group key={t.id} scale={handScale}>
        <Tile3D
          faces={faces}
          tile={t}
          pose="stand"
          tilt={0.45}
          position={[hx / handScale, 0, HUMAN_HAND_Z / handScale]}
          lift={can && hover === t.id ? 0.28 : 0}
          variant={riichiMode && can ? "gold" : can && hover === t.id ? "select" : selectable.size > 0 && !can ? "dim" : "normal"}
          onClick={can ? () => onDiscard(t.id) : undefined}
          onHover={(over) => setHover(over ? t.id : null)}
        />
      </group>
    );
  });

  const active = state.phase === "turn" && state.turn === seat;
  const isDealer = seat === state.dealer;

  return (
    <group rotation={[0, (rel * Math.PI) / 2, 0]}>
      <group position={[0, 0, RIVER_Z]} scale={RIVER_SCALE}>
        {river}
      </group>
      {melds}
      {hand}
      {/* 席の表示（風・点数） */}
      <Label
        position={[0, 0.17, CENTER - 0.55]}
        size={[4.4, 1.1]}
        canvas={[640, 160]}
        lines={[
          {
            text: `${WIND[seatWind(state, seat)]}  ${state.scores[seat].toLocaleString()}`,
            size: 76,
            color: active ? "#ffd65c" : isDealer ? "#ffcf4a" : "#f3efe2",
            weight: 900,
          },
        ]}
      />
      {!isHuman && <Label position={[-TABLE / 2 + 3.2, 0.02, HAND_Z + 1.25]} size={[4, 0.7]} canvas={[512, 90]} lines={[{ text: p.name, size: 50, color: "rgba(243,239,226,0.7)" }]} />}
      {/* 立直棒 */}
      {p.riichi && (
        <group position={[0, 0.12, CENTER + 0.05]}>
          <mesh castShadow>
            <boxGeometry args={[2.4, 0.08, 0.2]} />
            <meshStandardMaterial color="#fbf7ec" roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.045, 0]}>
            <cylinderGeometry args={[0.07, 0.07, 0.01, 16]} />
            <meshStandardMaterial color="#c3262e" />
          </mesh>
        </group>
      )}
      {active && (
        <mesh position={[0, 0.012, HAND_Z + 0.4]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[Math.max(total, 6) + 1, 2.4]} />
          <meshBasicMaterial color="#ffd65c" transparent opacity={0.1} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

// ------------------------------------------------------------------ 卓全体

function Scene({ faces, ...props }: Omit<SeatProps, "seat" | "faces"> & { faces: Faces }) {
  const { state } = props;
  const indicators = doraIndicators(state);
  return (
    <>
      <ambientLight intensity={0.55} />
      <hemisphereLight args={["#fff8e8", "#1b3a2c", 0.45]} />
      <directionalLight
        position={[7, 18, 10]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
        shadow-bias={-0.0004}
      />

      {/* 羅紗 */}
      <mesh position={[0, -0.25, 0]} receiveShadow>
        <boxGeometry args={[TABLE, 0.5, TABLE]} />
        <meshStandardMaterial color="#1e6a4f" roughness={0.95} />
      </mesh>
      {/* 木枠 */}
      {[0, 1, 2, 3].map((i) => (
        <group key={i} rotation={[0, (i * Math.PI) / 2, 0]}>
          <mesh position={[0, 0.05, TABLE / 2 + 0.4]} castShadow receiveShadow>
            <boxGeometry args={[TABLE + 1.6, 0.6, 0.8]} />
            <meshStandardMaterial color="#5b3a22" roughness={0.6} />
          </mesh>
        </group>
      ))}
      {/* 中央パネル */}
      <mesh position={[0, 0.05, 0]} receiveShadow>
        <boxGeometry args={[CENTER * 2, 0.1, CENTER * 2]} />
        <meshStandardMaterial color="#123d2d" roughness={0.7} />
      </mesh>
      <Label
        position={[0, 0.11, -1.5]}
        size={[5.6, 2.15]}
        canvas={[640, 246]}
        lines={[
          { text: roundLabel(state), size: 70, weight: 900 },
          { text: `残り ${remainingTiles(state)}   供託 ${state.kyotaku}`, size: 44, weight: 500, color: "rgba(243,239,226,0.85)" },
        ]}
      />
      {[0, 1, 2, 3, 4].map((i) => (
        <Tile3D
          key={i}
          faces={faces}
          tile={indicators[i] ?? null}
          pose={indicators[i] ? "lie" : "down"}
          position={[(i - 2) * (W * 0.98 + GAP), 0.1, 0.6]}
        />
      ))}
      <Label position={[0, 0.11, 1.68]} size={[3, 0.5]} canvas={[400, 70]} lines={[{ text: "ドラ表示牌", size: 40, weight: 500, color: "rgba(243,239,226,0.7)" }]} />

      {[0, 1, 2, 3].map((seat) => (
        <Seat key={seat} faces={faces} seat={seat} {...props} />
      ))}
    </>
  );
}

export interface Table3DProps {
  state: GameState;
  lastId: number | null;
  markTsumogiri: boolean;
  selectable: Set<number>;
  riichiMode: boolean;
  onDiscard: (tileId: number) => void;
}

const DEFAULT_CAMERA: [number, number, number] = [0, 27.5, 25.5];
const DEFAULT_TARGET: [number, number, number] = [0, 0, 5.2];

export default function Table3D(props: Table3DProps) {
  const [faces, setFaces] = useState<Faces | null>(null);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  useEffect(() => {
    let alive = true;
    void loadTileFaces().then((f) => alive && setFaces(f));
    return () => {
      alive = false;
      document.body.style.cursor = "";
    };
  }, []);
  const reveal = props.state.phase === "roundEnd" || props.state.phase === "gameEnd";

  const resetView = () => {
    const c = controls.current;
    if (!c) return;
    c.object.position.set(...DEFAULT_CAMERA);
    c.target.set(...DEFAULT_TARGET);
    c.update();
  };

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ background: "radial-gradient(ellipse at 50% 30%, #2a4a3c, #0d1a14)" }}
    >
      {faces ? (
        <Canvas shadows={{ type: THREE.PCFShadowMap }} dpr={[1, 2]} camera={{ position: DEFAULT_CAMERA, fov: 40 }}>
          <Scene faces={faces} reveal={reveal} {...props} />
          <OrbitControls
            ref={controls}
            target={DEFAULT_TARGET}
            enablePan={false}
            enableDamping
            minPolarAngle={0.15}
            maxPolarAngle={1.1}
            minDistance={14}
            maxDistance={45}
          />
        </Canvas>
      ) : (
        <div className="flex h-full items-center justify-center text-sm opacity-70">牌を準備しています…</div>
      )}
      <div className="absolute left-3 top-2 flex items-center gap-2">
        <button type="button" onClick={resetView} className="rounded-md px-2 py-1 text-xs" style={{ background: "rgba(0,0,0,0.45)" }}>
          視点を戻す
        </button>
        <span className="pointer-events-none text-[11px] opacity-60">ドラッグで視点を回転・ホイールで拡大縮小</span>
      </div>
    </div>
  );
}
