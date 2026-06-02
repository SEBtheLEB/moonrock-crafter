export const GAME_ART_ATLAS_URL = './assets/img/generated/game-art/moonrock-art-atlas-v1.png';

const ATLAS_RECTS = {
  rockTile: [0.028, 0.046, 0.142, 0.15],
  deepRockTile: [0.197, 0.046, 0.142, 0.15],
  ironOreTile: [0.365, 0.046, 0.142, 0.15],
  copperOreTile: [0.531, 0.046, 0.142, 0.15],
  crystalOreTile: [0.682, 0.046, 0.151, 0.15],
  metalBlock: [0.858, 0.046, 0.137, 0.142],
  rockSlab: [0.03, 0.226, 0.228, 0.156],
  moonRockSlab: [0.286, 0.226, 0.228, 0.156],
  metalPanel: [0.54, 0.235, 0.135, 0.145],
  metalWall: [0.707, 0.235, 0.276, 0.145],
  rocket: [0.037, 0.405, 0.142, 0.252],
  astronaut: [0.246, 0.47, 0.082, 0.188],
  craftingStation: [0.372, 0.466, 0.17, 0.143],
  furnace: [0.63, 0.439, 0.186, 0.18],
  researchStation: [0.827, 0.431, 0.17, 0.193],
  torch: [0.25, 0.659, 0.06, 0.13],
  sun: [0.373, 0.66, 0.145, 0.145],
  planet: [0.612, 0.68, 0.112, 0.1],
  asteroid: [0.79, 0.645, 0.2, 0.17],
  stonePile: [0.028, 0.838, 0.152, 0.105],
  moonCrystalPile: [0.208, 0.84, 0.152, 0.105],
  copperPile: [0.396, 0.836, 0.145, 0.103],
  copperCrystalPile: [0.558, 0.828, 0.138, 0.108],
  purpleCrystalPile: [0.704, 0.83, 0.142, 0.105],
  ironIngot: [0.87, 0.842, 0.138, 0.102],
};

let atlasImage = null;
const readyCallbacks = new Set();

export function getGameArtAtlas() {
  if (typeof Image === 'undefined') return null;
  if (atlasImage) return atlasImage;
  atlasImage = new Image();
  atlasImage.decoding = 'async';
  atlasImage.loading = 'eager';
  atlasImage.onload = () => {
    const callbacks = [...readyCallbacks];
    readyCallbacks.clear();
    callbacks.forEach((callback) => callback());
  };
  atlasImage.src = GAME_ART_ATLAS_URL;
  return atlasImage;
}

export function onGameArtReady(callback) {
  if (typeof callback !== 'function') return () => {};
  if (isGameArtReady()) {
    callback();
    return () => {};
  }
  readyCallbacks.add(callback);
  getGameArtAtlas();
  return () => readyCallbacks.delete(callback);
}

export function isGameArtReady() {
  const image = getGameArtAtlas();
  return Boolean(image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
}

export function getGameArtRect(key) {
  const rect = ATLAS_RECTS[key];
  const image = getGameArtAtlas();
  if (!rect || !image?.naturalWidth || !image?.naturalHeight) return null;
  return {
    x: Math.round(rect[0] * image.naturalWidth),
    y: Math.round(rect[1] * image.naturalHeight),
    width: Math.round(rect[2] * image.naturalWidth),
    height: Math.round(rect[3] * image.naturalHeight),
  };
}

export function drawGameArtSprite(ctx, key, x, y, width, height, {
  alpha = 1,
  rotation = 0,
  centered = true,
  flipX = false,
  flipY = false,
} = {}) {
  const image = getGameArtAtlas();
  const rect = getGameArtRect(key);
  if (!rect || !isGameArtReady()) return false;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  if (rotation) ctx.rotate(rotation);
  ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  const dx = centered ? -width / 2 : 0;
  const dy = centered ? -height / 2 : 0;
  ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height, dx, dy, width, height);
  ctx.restore();
  return true;
}

export function drawGameArtTexture(ctx, key, x, y, width, height, {
  alpha = 1,
  seed = 0,
  inset = 0,
  tint = '',
  sourceJitter = 0.16,
  smoothing = true,
} = {}) {
  const image = getGameArtAtlas();
  const rect = getGameArtRect(key);
  if (!rect || !isGameArtReady()) return false;
  const safeInset = Math.max(0, inset);
  const sourceWidth = Math.max(1, rect.width - safeInset * 2);
  const sourceHeight = Math.max(1, rect.height - safeInset * 2);
  const jitter = Math.max(0, Math.min(0.38, sourceJitter));
  const cropW = Math.max(1, Math.floor(sourceWidth * (0.72 + noise(seed, 43) * 0.18)));
  const cropH = Math.max(1, Math.floor(sourceHeight * (0.72 + noise(seed, 47) * 0.18)));
  const jitterX = Math.floor(noise(seed, 17) * Math.max(1, sourceWidth * jitter));
  const jitterY = Math.floor(noise(seed, 31) * Math.max(1, sourceHeight * jitter));
  const sx = rect.x + safeInset + jitterX;
  const sy = rect.y + safeInset + jitterY;
  const sw = Math.max(1, Math.min(cropW, rect.x + rect.width - sx));
  const sh = Math.max(1, Math.min(cropH, rect.y + rect.height - sy));
  ctx.save();
  ctx.imageSmoothingEnabled = smoothing;
  ctx.globalAlpha *= alpha;
  ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);
  if (tint) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = tint;
    ctx.globalAlpha *= 0.22;
    ctx.fillRect(x, y, width, height);
  }
  ctx.restore();
  return true;
}

export function getTerrainArtKey(materialId, biome = 'scrap') {
  if (materialId === 10) return 'metalPanel';
  if (materialId === 11) return 'metalBlock';
  if (materialId === 2) return 'ironOreTile';
  if (materialId === 3) return 'copperOreTile';
  if ([4, 7, 8, 9].includes(materialId)) return 'crystalOreTile';
  if ([5, 6].includes(materialId)) return 'copperCrystalPile';
  if (biome === 'void' || biome === 'crystal') return 'deepRockTile';
  return 'rockTile';
}

function noise(seed, salt) {
  const value = Math.sin((Number(seed) || 0) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}
