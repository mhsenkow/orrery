/** Shared Path2D sprite atlas — globe billboards + local flat map. */

export const SPRITES = [
  [['M28 64 L28 38 L36 38 L36 64 Z', '#6b4a2f'], ['M32 6 C13 6 6 21 6 30 C6 41 17 48 32 48 C47 48 58 41 58 30 C58 21 51 6 32 6 Z', '#3f9450'], ['M32 10 C20 10 14 20 14 27 C14 34 21 39 32 39 Z', '#4fae5f']],
  [['M29 64 L29 50 L35 50 L35 64 Z', '#5a3f28'], ['M32 30 L57 58 L7 58 Z', '#2f7046'], ['M32 16 L52 44 L12 44 Z', '#387f52'], ['M32 3 L47 30 L17 30 Z', '#2f7046']],
  [['M30 64 L21 33 L26 34 L33 64 Z', '#7fa04a'], ['M33 64 L44 36 L47 40 L37 64 Z', '#8fb055'], ['M32 64 L31 26 L35 28 L36 64 Z', '#9cbe61']],
  [['M25 64 L25 20 C25 13 39 13 39 20 L39 64 Z', '#3f8452'], ['M25 42 L13 42 C8 42 8 33 13 33 L25 33 Z', '#3f8452'], ['M39 36 L50 36 C55 36 55 27 50 27 L39 27 Z', '#3f8452']],
  [['M5 64 L13 38 L28 29 L47 36 L59 64 Z', '#7d7d87'], ['M13 38 L28 29 L34 47 Z', '#9a9aa6']],
  [['M13 64 L13 41 L51 41 L51 64 Z', '#bd9463'], ['M4 44 L32 17 L60 44 Z', '#8c5b3d'], ['M27 64 L27 50 L37 50 L37 64 Z', '#5d4530']],
  [['M32 2 L46 64 L18 64 Z', '#a9dcef'], ['M32 2 L39 64 L32 64 Z', '#e2f5fd']],
  [['M2 64 C2 36 18 22 32 22 C47 22 62 36 62 64 L47 64 C47 44 40 36 32 36 C22 36 17 44 17 64 Z', '#c4884f'], ['M17 64 C17 46 22 38 32 38 L32 22 C18 22 2 36 2 64 Z', '#a86e3c']],
  [['M12 64 C4 44 17 27 33 30 C51 33 58 49 54 64 Z', '#d9b276'], ['M24 64 C20 51 28 42 38 45 C47 48 49 56 47 64 Z', '#eccb97']],
  [['M6 64 C6 53 18 48 27 53 C34 42 52 46 52 57 L55 64 Z', '#8c6fae'], ['M20 64 C20 57 28 54 33 58 L36 64 Z', '#a98ac9']],
  [['M2 64 C10 49 24 44 32 44 C43 44 55 49 62 64 Z', '#8a8a94'], ['M18 64 C23 55 41 55 46 64 Z', '#6b6b76']],
  [['M25 64 L25 5 L39 5 L39 64 Z', '#23232b'], ['M25 5 L39 5 L39 13 L25 13 Z', '#6ee0ff']],
  /* 12 black daisy */ [['M32 32 m-20 0 a20 20 0 1 0 40 0 a20 20 0 1 0 -40 0', '#1a1a22'], ['M32 32 m-8 0 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0', '#3a3a48']],
  /* 13 white daisy */ [['M32 32 m-20 0 a20 20 0 1 0 40 0 a20 20 0 1 0 -40 0', '#f2f4f8'], ['M32 32 m-6 0 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0', '#e8c84a']],
  /* 14 reef */ [['M10 64 L18 40 L28 55 L38 32 L48 58 L54 44 L58 64 Z', '#2a8a8a'], ['M22 64 L30 48 L40 64 Z', '#3cb0a0']],
  /* 15 fish */ [['M8 40 L32 22 L56 40 L32 52 Z', '#4a8ab8'], ['M56 40 L62 36 L62 44 Z', '#4a8ab8']],
];

export const ATLAS_COLS = 4;
export const TILE = 128;

let _atlas = null;

/** Build (once) the shared canvas atlas used by WebGL and the local map. */
export function getSpriteAtlas() {
  if (_atlas) return _atlas;
  const cv = document.createElement('canvas');
  cv.width = cv.height = ATLAS_COLS * TILE;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);
  SPRITES.forEach((sp, n) => {
    const tx = (n % ATLAS_COLS) * TILE;
    const ty = Math.floor(n / ATLAS_COLS) * TILE;
    g.save();
    g.translate(tx, ty);
    g.scale(TILE / 64, TILE / 64);
    for (const [d, fill] of sp) {
      g.fillStyle = fill;
      g.fill(new Path2D(d));
    }
    g.restore();
  });
  _atlas = cv;
  return _atlas;
}

/** Draw sprite `kind` (0–15) centred at (cx,cy) sized to `size` CSS/device pixels. */
export function drawSprite(ctx, kind, cx, cy, size) {
  const atlas = getSpriteAtlas();
  const k = Math.max(0, Math.min(SPRITES.length - 1, kind | 0));
  const sx = (k % ATLAS_COLS) * TILE;
  const sy = Math.floor(k / ATLAS_COLS) * TILE;
  const s = Math.max(2, size);
  ctx.drawImage(atlas, sx, sy, TILE, TILE, cx - s * 0.5, cy - s * 0.5, s, s);
}
