/**
 * シード付き乱数（mulberry32）。
 * 同じシードなら同じ牌山になるので、牌譜の再現や将来のサーバ側対局に使える。
 */
export function nextRandom(state: number): [value: number, next: number] {
  let t = (state + 0x6d2b79f5) >>> 0;
  const next = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, next];
}

/** Fisher-Yates シャッフル。新しい配列と次の乱数状態を返す */
export function shuffle<T>(items: readonly T[], state: number): [T[], number] {
  const arr = [...items];
  let s = state;
  for (let i = arr.length - 1; i > 0; i--) {
    const [r, n] = nextRandom(s);
    s = n;
    const j = Math.floor(r * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return [arr, s];
}
