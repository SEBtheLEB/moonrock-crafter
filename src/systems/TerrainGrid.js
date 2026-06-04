import { getPointAabbDistance, getSegmentPolygonHit } from '../utils/raycast.js?v=158';
import { gameBalance } from '../data/gameBalance.js?v=158';
import {
  drawGameArtTexture,
  getTerrainArtKey,
  isGameArtReady,
  onGameArtReady,
} from '../data/gameArt.js?v=158';
import { TerrainBlockEditSystem } from './terrain/TerrainBlockEditSystem.js?v=158';
import { TerrainShadowSystem } from './terrain/TerrainShadowSystem.js?v=158';
import { TerrainWallSystem } from './terrain/TerrainWallSystem.js?v=158';

export const TERRAIN_MATERIALS = {
  0: { id: 'empty', name: 'Empty', color: 'transparent', hardness: 0, yield: 0, materialId: null },
  1: { id: 'moonstone', name: 'Moonstone', color: '#6b625a', edge: '#91867a', hardness: 1.675, yield: 1, materialId: 'stoneOre', miningPowerRequired: 0 },
  2: { id: 'ironDeposit', name: 'Iron Deposit', color: '#9b7a5b', edge: '#d0ad84', hardness: 7.8, yield: 1, materialId: 'ironDust', miningPowerRequired: 0 },
  3: { id: 'copperOre', name: 'Copper Ore', color: '#b87333', edge: '#ffad63', hardness: 6.8, yield: 1, materialId: 'copperShards', miningPowerRequired: 0 },
  4: { id: 'crystal', name: 'Crystal', color: '#3d9fc5', edge: '#65d6ff', hardness: 10.5, yield: 1, materialId: 'glassCrystal', miningPowerRequired: 1.15 },
  5: { id: 'coreFragment', name: 'Core Fragment', color: '#c99235', edge: '#ffcf5a', hardness: 13.5, yield: 1, materialId: 'researchFragment', miningPowerRequired: 1.45 },
  6: { id: 'fireCore', name: 'Fire Core', color: '#ff5d3d', edge: '#ffd36b', hardness: 11.2, yield: 1, materialId: 'fireCore', miningPowerRequired: 0 },
  7: { id: 'crystallizedStone', name: 'Crystallized Stone', color: '#445262', edge: '#9ed7ff', hardness: 14.6, yield: 1, materialId: 'crystallizedStone', miningPowerRequired: 1.15 },
  8: { id: 'redCrystal', name: 'Red Crystal', color: '#a9213c', edge: '#ff6f7d', hardness: 9.4, yield: 1, materialId: 'redCrystal', miningPowerRequired: 1.15 },
  9: { id: 'moonCrystalOre', name: 'Moon Crystal', color: '#545a73', edge: '#a988ff', hardness: 8.4, yield: 1, materialId: 'moonCrystal', miningPowerRequired: 0.95, textureSrc: '/assets/img/ores/moon-crystal.png', textureScale: 0.86, textureOverlap: 12 },
  10: { id: 'facilityIron', name: 'Facility Iron', color: '#465462', edge: '#9fafbd', hardness: 12.2, yield: 1, materialId: 'ironDust', miningPowerRequired: 0 },
  11: { id: 'reinforcedIron', name: 'Reinforced Iron', color: '#26313d', edge: '#c2d0dd', hardness: 17.5, yield: 1, materialId: 'ironDust', miningPowerRequired: 0 },
  12: { id: 'towerIron', name: 'Tower Iron', color: '#2d3c49', edge: '#8fd7ff', hardness: 18.5, yield: 1, materialId: 'ironDust', miningPowerRequired: 1.2 },
};

const CONSTRUCTED_MATERIAL_IDS = new Set([10, 11, 12]);

const TERRAIN_SAVE_VERSION = 25;
const TERRAIN_WALL_LAYER_VERSION = 4;
const SURFACE_IRON_TERRAIN_MIGRATION_VERSION = 2;
const TERRAIN_TUNING = gameBalance.terrain || {};
const DEFAULT_TERRAIN_CELL_SIZE = TERRAIN_TUNING.cellSize || 25;
const DEFAULT_TERRAIN_CHUNK_CELLS = TERRAIN_TUNING.chunkSizeCells || 24;
const TERRAIN_VISUAL_SUBDIVISIONS = TERRAIN_TUNING.visualSubdivisions || 2;
const TERRAIN_COLLISION_SUBDIVISIONS = TERRAIN_TUNING.collisionSubdivisions || TERRAIN_VISUAL_SUBDIVISIONS;
const TERRAIN_VISUAL_DENSITY_RADIUS = TERRAIN_TUNING.visualDensityRadiusCells || 1.32;
const TERRAIN_COLLISION_DENSITY_RADIUS = TERRAIN_TUNING.collisionDensityRadiusCells || TERRAIN_VISUAL_DENSITY_RADIUS;
const TERRAIN_VISUAL_THRESHOLD = TERRAIN_TUNING.visualDensityThreshold || 0.42;
const TERRAIN_COLLISION_THRESHOLD = TERRAIN_TUNING.collisionDensityThreshold || TERRAIN_VISUAL_THRESHOLD;

const VISUAL_CONTOUR_OPTIONS = {
  sampleSubdivisions: TERRAIN_VISUAL_SUBDIVISIONS,
  densityRadiusCells: TERRAIN_VISUAL_DENSITY_RADIUS,
  densityThreshold: TERRAIN_VISUAL_THRESHOLD,
  smoothingIterations: TERRAIN_TUNING.visualSmoothingIterations ?? 2,
  smoothingAmount: TERRAIN_TUNING.visualSmoothingAmount ?? 0.22,
  minSegmentLength: TERRAIN_TUNING.visualMinSegmentLength ?? 2.6,
  sharpAngleDegrees: TERRAIN_TUNING.visualSharpAngleDegrees ?? 42,
  sharpAngleAmount: TERRAIN_TUNING.visualSharpAngleAmount ?? 0.24,
  chamferAngleDegrees: TERRAIN_TUNING.visualChamferAngleDegrees ?? 34,
  chamferLengthCells: TERRAIN_TUNING.visualChamferLengthCells ?? 0.52,
  chamferMinLength: TERRAIN_TUNING.visualChamferMinLength ?? 4,
  chamferMaxLength: TERRAIN_TUNING.visualChamferMaxLength ?? 16,
  gridSnapAmount: TERRAIN_TUNING.visualGridSnapAmount ?? 0.22,
  cornerRoundAmount: TERRAIN_TUNING.visualCornerRoundAmount ?? 0.18,
  spikeAngleDegrees: TERRAIN_TUNING.visualSpikeAngleDegrees ?? 26,
  spikeFlattenAmount: TERRAIN_TUNING.visualSpikeFlattenAmount ?? 0.58,
};

const COLLISION_CONTOUR_OPTIONS = {
  sampleSubdivisions: TERRAIN_COLLISION_SUBDIVISIONS,
  densityRadiusCells: TERRAIN_COLLISION_DENSITY_RADIUS,
  densityThreshold: TERRAIN_COLLISION_THRESHOLD,
  smoothingIterations: TERRAIN_TUNING.collisionSmoothingIterations ?? VISUAL_CONTOUR_OPTIONS.smoothingIterations,
  smoothingAmount: TERRAIN_TUNING.collisionSmoothingAmount ?? VISUAL_CONTOUR_OPTIONS.smoothingAmount,
  minSegmentLength: TERRAIN_TUNING.collisionMinSegmentLength ?? VISUAL_CONTOUR_OPTIONS.minSegmentLength,
  sharpAngleDegrees: TERRAIN_TUNING.collisionSharpAngleDegrees ?? VISUAL_CONTOUR_OPTIONS.sharpAngleDegrees,
  sharpAngleAmount: TERRAIN_TUNING.collisionSharpAngleAmount ?? VISUAL_CONTOUR_OPTIONS.sharpAngleAmount,
  chamferAngleDegrees: TERRAIN_TUNING.collisionChamferAngleDegrees ?? VISUAL_CONTOUR_OPTIONS.chamferAngleDegrees,
  chamferLengthCells: TERRAIN_TUNING.collisionChamferLengthCells ?? VISUAL_CONTOUR_OPTIONS.chamferLengthCells,
  chamferMinLength: TERRAIN_TUNING.collisionChamferMinLength ?? VISUAL_CONTOUR_OPTIONS.chamferMinLength,
  chamferMaxLength: TERRAIN_TUNING.collisionChamferMaxLength ?? VISUAL_CONTOUR_OPTIONS.chamferMaxLength,
  gridSnapAmount: TERRAIN_TUNING.collisionGridSnapAmount ?? VISUAL_CONTOUR_OPTIONS.gridSnapAmount,
  cornerRoundAmount: TERRAIN_TUNING.collisionCornerRoundAmount ?? VISUAL_CONTOUR_OPTIONS.cornerRoundAmount,
  spikeAngleDegrees: TERRAIN_TUNING.collisionSpikeAngleDegrees ?? VISUAL_CONTOUR_OPTIONS.spikeAngleDegrees,
  spikeFlattenAmount: TERRAIN_TUNING.collisionSpikeFlattenAmount ?? VISUAL_CONTOUR_OPTIONS.spikeFlattenAmount,
};

const MATERIAL_CONTOUR_OPTIONS = {
  ...VISUAL_CONTOUR_OPTIONS,
  sampleSubdivisions: TERRAIN_TUNING.materialSubdivisions || 1,
  densityRadiusCells: TERRAIN_TUNING.materialDensityRadiusCells || 1.08,
  densityThreshold: TERRAIN_TUNING.materialDensityThreshold || 0.5,
  smoothingIterations: TERRAIN_TUNING.materialSmoothingIterations ?? 1,
  smoothingAmount: TERRAIN_TUNING.materialSmoothingAmount ?? 0.14,
  chamferAngleDegrees: TERRAIN_TUNING.materialChamferAngleDegrees ?? 36,
  chamferLengthCells: TERRAIN_TUNING.materialChamferLengthCells ?? 0.36,
  chamferMinLength: TERRAIN_TUNING.materialChamferMinLength ?? 3,
  chamferMaxLength: TERRAIN_TUNING.materialChamferMaxLength ?? 11,
  gridSnapAmount: TERRAIN_TUNING.materialGridSnapAmount ?? 0.34,
  cornerRoundAmount: TERRAIN_TUNING.materialCornerRoundAmount ?? 0.12,
};

const TERRAIN_ROUGHNESS = {
  enabled: true,
  edgeNoiseStrength: 2.8,
  edgeNoiseScale: 0.72,
  edgeSegmentCount: 5,
  maxChipDepth: 6,
  chipChance: 0.42,
  cornerBreakChance: 0.28,
  edgeShadowStrength: 0.28,
  crackChance: 0.34,
  dentChance: 0.42,
  pebbleChance: 0.22,
  pebbleLipChance: 0.16,
  surfaceDetailOpacity: 0.38,
  crackLengthMin: 7,
  crackLengthMax: 20,
  materialStyles: {},
  ...(TERRAIN_TUNING.roughness || {}),
};

const SHOW_TERRAIN_REBUILD_DEBUG = true;
const TERRAIN_REBUILD_CHUNK_WARNING_LIMIT = 3;
const TERRAIN_RECENT_MINE_REBUILD_WINDOW_MS = 600;

if (typeof globalThis !== 'undefined' && typeof globalThis.SHOW_TERRAIN_REBUILD_DEBUG === 'undefined') {
  globalThis.SHOW_TERRAIN_REBUILD_DEBUG = SHOW_TERRAIN_REBUILD_DEBUG;
}

const TERRAIN_LIGHTING = {
  enabled: true,
  darknessStartDepth: 3,
  fullDarkDepth: 13,
  maxDarknessOpacity: 0.88,
  darknessFalloffPower: 1.42,
  surfaceLightBleedDepth: 4,
  tunnelDarknessStrength: 0.86,
  lightingCellScale: 0.74,
  lightFalloffPower: 1.18,
  ambientSurfaceLight: 0.08,
  materialLights: {},
  ...(TERRAIN_TUNING.lighting || {}),
};

const TERRAIN_WALLS = {
  enabled: true,
  startDepth: 0.55,
  materialInfluenceRadius: 4,
  textureAlpha: 0.96,
  edgeAlpha: 0.18,
  surfaceFadeDepth: 4.5,
  ...(TERRAIN_TUNING.walls || {}),
};

const WALL_CONTOUR_OPTIONS = {
  ...VISUAL_CONTOUR_OPTIONS,
  sampleSubdivisions: TERRAIN_WALLS.sampleSubdivisions ?? TERRAIN_TUNING.wallSubdivisions ?? VISUAL_CONTOUR_OPTIONS.sampleSubdivisions,
  densityRadiusCells: TERRAIN_WALLS.densityRadiusCells ?? TERRAIN_TUNING.wallDensityRadiusCells ?? 1.22,
  densityThreshold: TERRAIN_WALLS.densityThreshold ?? TERRAIN_TUNING.wallDensityThreshold ?? 0.46,
  smoothingIterations: TERRAIN_WALLS.smoothingIterations ?? TERRAIN_TUNING.wallSmoothingIterations ?? 2,
  smoothingAmount: TERRAIN_WALLS.smoothingAmount ?? TERRAIN_TUNING.wallSmoothingAmount ?? 0.2,
  minSegmentLength: TERRAIN_WALLS.minSegmentLength ?? TERRAIN_TUNING.wallMinSegmentLength ?? VISUAL_CONTOUR_OPTIONS.minSegmentLength,
  sharpAngleDegrees: TERRAIN_WALLS.sharpAngleDegrees ?? TERRAIN_TUNING.wallSharpAngleDegrees ?? VISUAL_CONTOUR_OPTIONS.sharpAngleDegrees,
  sharpAngleAmount: TERRAIN_WALLS.sharpAngleAmount ?? TERRAIN_TUNING.wallSharpAngleAmount ?? VISUAL_CONTOUR_OPTIONS.sharpAngleAmount,
  chamferAngleDegrees: TERRAIN_WALLS.chamferAngleDegrees ?? TERRAIN_TUNING.wallChamferAngleDegrees ?? VISUAL_CONTOUR_OPTIONS.chamferAngleDegrees,
  chamferLengthCells: TERRAIN_WALLS.chamferLengthCells ?? TERRAIN_TUNING.wallChamferLengthCells ?? VISUAL_CONTOUR_OPTIONS.chamferLengthCells,
  chamferMinLength: TERRAIN_WALLS.chamferMinLength ?? TERRAIN_TUNING.wallChamferMinLength ?? VISUAL_CONTOUR_OPTIONS.chamferMinLength,
  chamferMaxLength: TERRAIN_WALLS.chamferMaxLength ?? TERRAIN_TUNING.wallChamferMaxLength ?? VISUAL_CONTOUR_OPTIONS.chamferMaxLength,
  gridSnapAmount: TERRAIN_WALLS.gridSnapAmount ?? TERRAIN_TUNING.wallGridSnapAmount ?? 0.18,
  cornerRoundAmount: TERRAIN_WALLS.cornerRoundAmount ?? TERRAIN_TUNING.wallCornerRoundAmount ?? 0.14,
};

const TERRAIN_TEXTURE_INSTANCES = new Set();
const TERRAIN_IMAGE_CACHE = new Map();

function getTerrainTextureImage(src) {
  if (!src || typeof Image === 'undefined') return null;
  const href = typeof document !== 'undefined'
    ? new URL(src, document.baseURI).href
    : src;
  if (TERRAIN_IMAGE_CACHE.has(href)) return TERRAIN_IMAGE_CACHE.get(href);
  const image = new Image();
  image.onload = () => {
    TERRAIN_TEXTURE_INSTANCES.forEach((terrain) => {
      terrain.textureCache?.clear();
      terrain.renderDirty = true;
      terrain.fullRenderDirty = true;
    });
  };
  image.src = href;
  TERRAIN_IMAGE_CACHE.set(href, image);
  return image;
}

const POINTS = {
  tl: [0, 0],
  top: [0.5, 0],
  tr: [1, 0],
  right: [1, 0.5],
  br: [1, 1],
  bottom: [0.5, 1],
  bl: [0, 1],
  left: [0, 0.5],
};

const FILL_POLYGONS = {
  0: [],
  1: [['left', 'bottom', 'bl']],
  2: [['bottom', 'right', 'br']],
  3: [['left', 'right', 'br', 'bl']],
  4: [['top', 'tr', 'right']],
  5: [['top', 'tr', 'right'], ['left', 'bottom', 'bl']],
  6: [['top', 'tr', 'br', 'bottom']],
  7: [['top', 'tr', 'br', 'bl', 'left']],
  8: [['tl', 'top', 'left']],
  9: [['tl', 'top', 'bottom', 'bl']],
  10: [['tl', 'top', 'left'], ['bottom', 'right', 'br']],
  11: [['tl', 'top', 'right', 'br', 'bl']],
  12: [['tl', 'tr', 'right', 'left']],
  13: [['tl', 'tr', 'right', 'bottom', 'bl']],
  14: [['tl', 'tr', 'br', 'bottom', 'left']],
  15: [['tl', 'tr', 'br', 'bl']],
};

const EDGE_SEGMENTS = {
  0: [],
  1: [['left', 'bottom']],
  2: [['bottom', 'right']],
  3: [['left', 'right']],
  4: [['top', 'right']],
  5: [['top', 'right'], ['left', 'bottom']],
  6: [['top', 'bottom']],
  7: [['top', 'left']],
  8: [['left', 'top']],
  9: [['bottom', 'top']],
  10: [['left', 'bottom'], ['top', 'right']],
  11: [['right', 'top']],
  12: [['right', 'left']],
  13: [['bottom', 'right']],
  14: [['left', 'bottom']],
  15: [],
};

const EDGE_DIRECTIONS = {
  top: { dx: 0, dy: -1, normal: { x: 0, y: -1 }, tangent: { x: 1, y: 0 } },
  right: { dx: 1, dy: 0, normal: { x: 1, y: 0 }, tangent: { x: 0, y: 1 } },
  bottom: { dx: 0, dy: 1, normal: { x: 0, y: 1 }, tangent: { x: 1, y: 0 } },
  left: { dx: -1, dy: 0, normal: { x: -1, y: 0 }, tangent: { x: 0, y: 1 } },
};

const EDGE_DIRECTION_NAMES = Object.keys(EDGE_DIRECTIONS);
const CORNER_EXPOSED_EDGES = {
  tl: ['top', 'left'],
  tr: ['top', 'right'],
  br: ['bottom', 'right'],
  bl: ['bottom', 'left'],
};

const BIOME_PALETTES = {
  scrap: { top: '#777068', body: '#5f5a55', deep: '#403c3a', edge: '#9c9185' },
  forest: { top: '#6c7569', body: '#555f58', deep: '#343f3c', edge: '#8fac87' },
  crystal: { top: '#617282', body: '#455667', deep: '#29334a', edge: '#8ee8ff' },
  ember: { top: '#776054', body: '#5e4b48', deep: '#392c32', edge: '#ff9d55' },
};

function hashString(value = '') {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothStep(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses = ((a.y > y) !== (b.y > y))
      && (x < ((b.x - a.x) * (y - a.y)) / ((b.y - a.y) || 1e-6) + a.x);
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointNearPolygonEdge(x, y, polygon, distance = 1.5) {
  const limitSq = distance * distance;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy || 1;
    const t = clamp(((x - a.x) * dx + (y - a.y) * dy) / lengthSq, 0, 1);
    const px = a.x + dx * t;
    const py = a.y + dy * t;
    const edgeDx = x - px;
    const edgeDy = y - py;
    if (edgeDx * edgeDx + edgeDy * edgeDy <= limitSq) return true;
  }
  return false;
}

function projectPolygonOnAxis(polygon, axis) {
  let min = Infinity;
  let max = -Infinity;
  for (const point of polygon) {
    const value = point.x * axis.x + point.y * axis.y;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return { min, max };
}

function aabbIntersectsPolygon(left, top, right, bottom, polygon) {
  const centerX = (left + right) * 0.5;
  const centerY = (top + bottom) * 0.5;
  const halfWidth = (right - left) * 0.5;
  const halfHeight = (bottom - top) * 0.5;
  const axes = [{ x: 1, y: 0 }, { x: 0, y: 1 }];
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    const edgeX = b.x - a.x;
    const edgeY = b.y - a.y;
    if (edgeX * edgeX + edgeY * edgeY < 0.0001) continue;
    axes.push({ x: -edgeY, y: edgeX });
  }
  for (const axis of axes) {
    const boxCenter = centerX * axis.x + centerY * axis.y;
    const boxRadius = halfWidth * Math.abs(axis.x) + halfHeight * Math.abs(axis.y);
    const polygonProjection = projectPolygonOnAxis(polygon, axis);
    if (boxCenter + boxRadius < polygonProjection.min || polygonProjection.max < boxCenter - boxRadius) return false;
  }
  return true;
}

function withAlpha(hex, alpha) {
  const normalized = hex.replace('#', '');
  const number = Number.parseInt(normalized, 16);
  const r = (number >> 16) & 255;
  const g = (number >> 8) & 255;
  const b = number & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hexToRgb(hex) {
  const number = Number.parseInt(hex.replace('#', ''), 16);
  return {
    r: (number >> 16) & 255,
    g: (number >> 8) & 255,
    b: number & 255,
  };
}

function mixHex(hex, targetHex, amount = 0.5) {
  const source = Number.parseInt(hex.replace('#', ''), 16);
  const target = Number.parseInt(targetHex.replace('#', ''), 16);
  const sr = (source >> 16) & 255;
  const sg = (source >> 8) & 255;
  const sb = source & 255;
  const tr = (target >> 16) & 255;
  const tg = (target >> 8) & 255;
  const tb = target & 255;
  const t = clamp01(amount);
  const r = Math.round(sr + (tr - sr) * t);
  const g = Math.round(sg + (tg - sg) * t);
  const b = Math.round(sb + (tb - sb) * t);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function signedNoise(value) {
  const normalized = (Math.sin(value) * 43758.5453) % 1;
  return normalized - Math.floor(normalized) - 0.5;
}

function hash2D(x, y, seed = 0, salt = 0) {
  let hash = Math.imul(Math.floor(x) ^ 0x9e3779b9, 374761393);
  hash ^= Math.imul(Math.floor(y) ^ 0x85ebca6b, 668265263);
  hash ^= Math.imul(Math.floor(seed) ^ 0xc2b2ae35, 2246822519);
  hash ^= Math.imul(Math.floor(salt) ^ 0x27d4eb2f, 3266489917);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 1274126177);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
}

function signedHash2D(x, y, seed = 0, salt = 0) {
  return hash2D(x, y, seed, salt) * 2 - 1;
}

function pointKey(point) {
  return `${Math.round(point.x * 1000)},${Math.round(point.y * 1000)}`;
}

function midpoint(a, b) {
  return {
    x: (a.x + b.x) * 0.5,
    y: (a.y + b.y) * 0.5,
  };
}

function contourBounds(points) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  return { minX, minY, maxX, maxY };
}

function boundsOverlap(a, b) {
  return a.maxX >= b.minX && a.minX <= b.maxX && a.maxY >= b.minY && a.minY <= b.maxY;
}

function segmentIntersectsSegment(a, b, c, d) {
  const cross = (p, q, r) => ((q.x - p.x) * (r.y - p.y)) - ((q.y - p.y) * (r.x - p.x));
  const onSegment = (p, q, r) => (
    Math.min(p.x, r.x) - 0.001 <= q.x
    && q.x <= Math.max(p.x, r.x) + 0.001
    && Math.min(p.y, r.y) - 0.001 <= q.y
    && q.y <= Math.max(p.y, r.y) + 0.001
  );
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  if (Math.abs(d1) <= 0.001 && onSegment(a, c, b)) return true;
  if (Math.abs(d2) <= 0.001 && onSegment(a, d, b)) return true;
  if (Math.abs(d3) <= 0.001 && onSegment(c, a, d)) return true;
  if (Math.abs(d4) <= 0.001 && onSegment(c, b, d)) return true;
  return false;
}

function pointInOrientedBox(point, shape, padding = 0.001) {
  const dx = point.x - shape.centerX;
  const dy = point.y - shape.centerY;
  const localX = dx * shape.axisX.x + dy * shape.axisX.y;
  const localY = dx * shape.axisY.x + dy * shape.axisY.y;
  return Math.abs(localX) <= shape.halfWidth + padding && Math.abs(localY) <= shape.halfHeight + padding;
}

function removeDuplicateContourPoints(points) {
  if (points.length <= 1) return points;
  const deduped = [];
  for (const point of points) {
    const previous = deduped[deduped.length - 1];
    if (previous && Math.abs(previous.x - point.x) < 0.001 && Math.abs(previous.y - point.y) < 0.001) continue;
    deduped.push(point);
  }
  const first = deduped[0];
  const last = deduped[deduped.length - 1];
  if (deduped.length > 1 && Math.abs(first.x - last.x) < 0.001 && Math.abs(first.y - last.y) < 0.001) deduped.pop();
  return deduped;
}

function removeShortContourSegments(points, minLength) {
  if (points.length <= 4 || minLength <= 0) return points;
  const minSq = minLength * minLength;
  const filtered = [];
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const previous = filtered[filtered.length - 1] || points[(index - 1 + points.length) % points.length];
    const dx = point.x - previous.x;
    const dy = point.y - previous.y;
    if (filtered.length && dx * dx + dy * dy < minSq) continue;
    filtered.push(point);
  }
  if (filtered.length >= 4) {
    const first = filtered[0];
    const last = filtered[filtered.length - 1];
    const dx = first.x - last.x;
    const dy = first.y - last.y;
    if (dx * dx + dy * dy < minSq) filtered.pop();
  }
  return filtered.length >= 3 ? filtered : points;
}

function smoothSharpContourAngles(points, options) {
  if (points.length <= 4) return points;
  const threshold = Math.cos((options.sharpAngleDegrees || 58) * Math.PI / 180);
  const amount = options.sharpAngleAmount ?? 0.45;
  return points.map((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    const ax = previous.x - point.x;
    const ay = previous.y - point.y;
    const bx = next.x - point.x;
    const by = next.y - point.y;
    const al = Math.hypot(ax, ay) || 1;
    const bl = Math.hypot(bx, by) || 1;
    const cosine = (ax * bx + ay * by) / (al * bl);
    if (cosine < threshold) return point;
    const target = midpoint(previous, next);
    return {
      x: point.x + (target.x - point.x) * amount,
      y: point.y + (target.y - point.y) * amount,
    };
  });
}

function averageContourPoints(points, amount = 0.35) {
  if (points.length <= 4) return points;
  return points.map((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    const target = midpoint(previous, next);
    return {
      x: point.x + (target.x - point.x) * amount,
      y: point.y + (target.y - point.y) * amount,
    };
  });
}

function flattenContourSpikes(points, options) {
  if (points.length <= 4) return points;
  const threshold = Math.cos((options.spikeAngleDegrees || 28) * Math.PI / 180);
  const amount = options.spikeFlattenAmount ?? 0.55;
  return points.map((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    const ax = previous.x - point.x;
    const ay = previous.y - point.y;
    const bx = next.x - point.x;
    const by = next.y - point.y;
    const al = Math.hypot(ax, ay) || 1;
    const bl = Math.hypot(bx, by) || 1;
    const cosine = (ax * bx + ay * by) / (al * bl);
    if (cosine > threshold) return point;
    const target = midpoint(previous, next);
    return {
      x: point.x + (target.x - point.x) * amount,
      y: point.y + (target.y - point.y) * amount,
    };
  });
}

function simplifyNearlyStraightContour(points, minSegmentLength = 0) {
  if (points.length <= 6) return points;
  const minSq = Math.max(0.5, minSegmentLength * 0.55) ** 2;
  const simplified = [];
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length];
    const point = points[index];
    const next = points[(index + 1) % points.length];
    const ax = point.x - previous.x;
    const ay = point.y - previous.y;
    const bx = next.x - point.x;
    const by = next.y - point.y;
    const cross = Math.abs(ax * by - ay * bx);
    const dot = ax * bx + ay * by;
    const lenSq = ax * ax + ay * ay;
    if (lenSq < minSq && cross < 0.6 && dot > 0) continue;
    simplified.push(point);
  }
  return simplified.length >= 3 ? simplified : points;
}

function chamferSharpContourCorners(points, options = VISUAL_CONTOUR_OPTIONS, gridStep = 1) {
  if (points.length <= 4) return points;
  const angleDegrees = options.chamferAngleDegrees ?? 0;
  if (angleDegrees <= 0) return points;

  const threshold = Math.cos(angleDegrees * Math.PI / 180);
  const cellSize = gridStep * Math.max(1, options.sampleSubdivisions || 1);
  const preferredLength = cellSize * (options.chamferLengthCells ?? 0.45);
  const minLength = options.chamferMinLength ?? Math.max(2, gridStep * 0.35);
  const maxLength = options.chamferMaxLength ?? preferredLength;
  const chamfered = [];

  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length];
    const point = points[index];
    const next = points[(index + 1) % points.length];
    const inX = point.x - previous.x;
    const inY = point.y - previous.y;
    const outX = next.x - point.x;
    const outY = next.y - point.y;
    const inLength = Math.hypot(inX, inY);
    const outLength = Math.hypot(outX, outY);

    if (inLength < minLength * 0.85 || outLength < minLength * 0.85) {
      chamfered.push(point);
      continue;
    }

    const dot = ((inX / inLength) * (outX / outLength)) + ((inY / inLength) * (outY / outLength));
    if (dot > threshold) {
      chamfered.push(point);
      continue;
    }

    const sharpness = clamp01((threshold - dot) / Math.max(0.001, threshold + 1));
    const targetLength = clamp(preferredLength * (0.85 + sharpness * 0.45), minLength, maxLength);
    const distance = Math.min(targetLength, inLength * 0.44, outLength * 0.44);
    if (distance < minLength * 0.55) {
      chamfered.push(point);
      continue;
    }

    chamfered.push({
      x: point.x - (inX / inLength) * distance,
      y: point.y - (inY / inLength) * distance,
    });
    chamfered.push({
      x: point.x + (outX / outLength) * distance,
      y: point.y + (outY / outLength) * distance,
    });
  }

  return chamfered.length >= 3 ? chamfered : points;
}

function snapContourTowardGrid(points, gridStep, amount = 0) {
  if (!gridStep || amount <= 0) return points;
  const t = clamp01(amount);
  return points.map((point) => {
    const snapX = Math.round(point.x / gridStep) * gridStep;
    const snapY = Math.round(point.y / gridStep) * gridStep;
    return {
      x: point.x + (snapX - point.x) * t,
      y: point.y + (snapY - point.y) * t,
    };
  });
}

function smoothContour(points, options = VISUAL_CONTOUR_OPTIONS, gridStep = 1) {
  let smoothed = removeDuplicateContourPoints(points);
  smoothed = removeShortContourSegments(smoothed, options.minSegmentLength || 0);
  smoothed = flattenContourSpikes(smoothed, options);
  smoothed = smoothSharpContourAngles(smoothed, options);
  for (let iteration = 0; iteration < (options.smoothingIterations || 0); iteration += 1) {
    smoothed = averageContourPoints(smoothed, options.smoothingAmount ?? 0.35);
    smoothed = flattenContourSpikes(smoothed, options);
    smoothed = removeShortContourSegments(smoothed, options.minSegmentLength || 0);
  }
  smoothed = simplifyNearlyStraightContour(smoothed, options.minSegmentLength || 0);
  smoothed = chamferSharpContourCorners(smoothed, options, gridStep);
  smoothed = removeShortContourSegments(smoothed, Math.max(0, (options.minSegmentLength || 0) * 0.5));
  smoothed = snapContourTowardGrid(smoothed, gridStep, options.gridSnapAmount || 0);
  return smoothed.length >= 3 ? smoothed : points;
}

export class TerrainGrid {
  constructor({ cols, rows, cellSize = 18, cells = null, wallCells = null, wallLayerVersion = 0, seed = 1, biome = 'scrap', landingX = 150, landingY = 360 } = {}) {
    this.cols = cols;
    this.rows = rows;
    this.cellSize = cellSize;
    this.width = cols * cellSize;
    this.height = rows * cellSize;
    this.planetCenterX = this.width * 0.5;
    this.planetCenterY = this.height * 0.5;
    this.planetRadius = Math.min(this.width, this.height) * 0.39;
    this.seed = seed;
    this.biome = biome;
    this.landingX = landingX;
    this.landingY = landingY;
    this.chunkSizeCells = DEFAULT_TERRAIN_CHUNK_CELLS;
    this.dirtyChunks = new Set();
    const cellCount = cols * rows;
    this.cells = cells ? Uint8Array.from(cells) : new Uint8Array(cellCount);
    this.wallCells = wallCells?.length === cellCount ? Uint8Array.from(wallCells) : new Uint8Array(cellCount);
    this.materials = TERRAIN_MATERIALS;
    this.wallConfig = TERRAIN_WALLS;
    this.damage = new Float32Array(cols * rows);
    this.renderCanvas = null;
    this.renderCtx = null;
    this.renderDirty = true;
    this.fullRenderDirty = true;
    this.dirtyBounds = null;
    this.damagedCells = new Set();
    this.textureCache = new Map();
    this.contourCache = new Map();
    this.roughEdgeCache = new Map();
    this.roughContourCache = new Map();
    this.contourCacheStale = false;
    this.roughContourCacheStale = false;
    this.collisionContours = null;
    this.surfacePathCache = null;
    this.surfaceRadiusLookupCache = new Map();
    this.roughnessRenderEnabled = Boolean(TERRAIN_ROUGHNESS.enabled);
    this.lightingRenderEnabled = Boolean(TERRAIN_LIGHTING.enabled);
    this.lightingDebugEnabled = false;
    this.depthDebugEnabled = false;
    this.lightingCanvas = null;
    this.lightingCtx = null;
    this.lightingFieldCanvas = null;
    this.lightingFieldCtx = null;
    this.blockSystem = new TerrainBlockEditSystem(this);
    this.wallSystem = new TerrainWallSystem(this);
    this.wallLayerVersion = Number(wallLayerVersion) || 0;
    this.shadowSystem = new TerrainShadowSystem(this);
    this.progressivePrewarm = null;
    this.airExposureMap = null;
    this.airExposureDirty = true;
    this.airExposureDirtyDeferred = false;
    this.airExposureRebuildAt = 0;
    this.fastTerrainRedrawUntil = 0;
    this.fastTerrainNextRedrawAt = 0;
    this.fastTerrainQualityBounds = null;
    this.fastTerrainQualityPadding = 0;
    this.fastTerrainQualityPending = false;
    this.terrainRebuildDebugStack = [];
    this.terrainRebuildDebugId = 0;
    this.lastMiningEditAt = 0;
    this.lastMiningEditBounds = null;
    this.lastMiningBrokenCount = 0;
    this.removeGameArtReadyListener = onGameArtReady(() => {
      this.textureCache?.clear();
      this.renderDirty = true;
      this.fullRenderDirty = true;
    });
    if (cells && TERRAIN_WALLS.enabled) {
      if (wallCells?.length !== cellCount) this.generateWallLayerForPlanet();
      else if (this.wallLayerVersion < TERRAIN_WALL_LAYER_VERSION) {
        this.repairNaturalWallLayerForPlanet();
        this.wallLayerVersion = TERRAIN_WALL_LAYER_VERSION;
      }
    }
    TERRAIN_TEXTURE_INSTANCES.add(this);
  }

  static createForIsland(island, world, savedTerrain = null) {
    if (savedTerrain?.version === TERRAIN_SAVE_VERSION && savedTerrain?.cells?.length) {
      const terrain = new TerrainGrid({
        cols: savedTerrain.cols,
        rows: savedTerrain.rows,
        cellSize: savedTerrain.cellSize || 18,
        cells: savedTerrain.cells,
        wallCells: savedTerrain.wallCells,
        wallLayerVersion: savedTerrain.wallLayerVersion || 0,
        seed: savedTerrain.seed || hashString(island.id),
        biome: savedTerrain.biome || island.biome,
        landingX: savedTerrain.landingX || world.landingX || 150,
        landingY: savedTerrain.landingY || Math.round(world.height * 0.62),
      });
      terrain.surfaceIronMigrationVersion = Number(savedTerrain.surfaceIronMigrationVersion) || 0;
      if (terrain.surfaceIronMigrationVersion < SURFACE_IRON_TERRAIN_MIGRATION_VERSION) {
        terrain.migrateSurfaceIronTiles(island);
      }
      return terrain;
    }

    const cellSize = DEFAULT_TERRAIN_CELL_SIZE;
    const cols = Math.ceil(world.width / cellSize);
    const rows = Math.ceil(world.height / cellSize);
    const seed = Number.isFinite(island.terrainSeed)
      ? island.terrainSeed
      : hashString(`${island.id}:${island.terrainRevision || 0}:${island.type || island.biome}`);
    const terrain = new TerrainGrid({
      cols,
      rows,
      cellSize,
      seed,
      biome: island.biome || 'scrap',
      landingX: island.landingX || world.landingX || Math.max(180, world.width * 0.22),
      landingY: Math.round((world.height * 0.32) / cellSize) * cellSize,
    });
    terrain.generate(island);
    return terrain;
  }

  serialize() {
    return {
      cols: this.cols,
      rows: this.rows,
      cellSize: this.cellSize,
      version: TERRAIN_SAVE_VERSION,
      seed: this.seed,
      biome: this.biome,
      wallLayerVersion: TERRAIN_WALL_LAYER_VERSION,
      surfaceIronMigrationVersion: SURFACE_IRON_TERRAIN_MIGRATION_VERSION,
      landingX: this.landingX,
      landingY: this.landingY,
      cells: Array.from(this.cells),
      wallCells: Array.from(this.wallCells || []),
    };
  }

  generate(island) {
    const random = createRandom(this.seed);
    this.cells.fill(0);
    this.wallCells.fill(0);
    this.surfaceRows = [];
    this.bottomRows = [];
    const surfaceRows = [];
    const bottomRows = [];
    const radiusX = this.planetRadius * (0.94 + random() * 0.08);
    const radiusY = this.planetRadius * (0.94 + random() * 0.08);

    for (let col = 0; col < this.cols; col += 1) {
      surfaceRows[col] = null;
      bottomRows[col] = null;
    }

    for (let row = 0; row < this.rows; row += 1) {
      for (let col = 0; col < this.cols; col += 1) {
        const x = col * this.cellSize + this.cellSize * 0.5;
        const y = row * this.cellSize + this.cellSize * 0.5;
        const dx = x - this.planetCenterX;
        const dy = y - this.planetCenterY;
        const angle = Math.atan2(dy, dx);
        const boundary = 1
          + Math.sin(angle * 4 + this.seed * 0.0007) * 0.032
          + Math.sin(angle * 7 + this.seed * 0.0013) * 0.018
          + signedNoise(col * 17.37 + row * 31.91 + this.seed * 0.003) * 0.008;
        const value = (dx / radiusX) ** 2 + (dy / radiusY) ** 2;
        if (value <= boundary * boundary) {
          this.setCell(col, row, 1);
          surfaceRows[col] = surfaceRows[col] === null ? row : Math.min(surfaceRows[col], row);
          bottomRows[col] = bottomRows[col] === null ? row : Math.max(bottomRows[col], row);
        }
      }
    }
    this.surfaceRows = surfaceRows;
    this.bottomRows = bottomRows;

    this.smoothTerrain(1);
    this.shapeGentlePlanetSurface(island);
    this.carveCaves(random, island);
    this.smoothTerrain(1);
    this.shapeGentlePlanetSurface(island);
    this.flattenSurfaceTeeth(4);
    this.flattenStarterLandingPlateau(island);
    const { surfaceRows: flattenedSurfaceRows } = this.rebuildSurfaceProfiles();
    this.placeOreVeins(random, island, flattenedSurfaceRows);
    this.placeFireCoreDeposit(random, island);
    this.placeCrystalVault(random, island);
    this.smoothMaterialPatches(1);
    this.shapeGentlePlanetSurface(island);
    this.flattenSurfaceTeeth(2);
    this.flattenStarterLandingPlateau(island);
    const placedSurfaceIron = this.placeSurfaceIronDeposits(random, island);
    if (placedSurfaceIron) this.rebuildSurfaceProfiles();
    this.generateWallLayerForPlanet(island);
    this.surfaceIronMigrationVersion = SURFACE_IRON_TERRAIN_MIGRATION_VERSION;
    this.renderDirty = true;
    this.fullRenderDirty = true;
  }

  migrateSurfaceIronTiles(island = {}) {
    const convertedEmbeddedIron = this.migrateEmbeddedIronToMoonstone();
    const random = createRandom(hashString(`${this.seed}:${island?.id || 'planet'}:surface-iron-tiles`));
    const placedSurfaceIron = this.placeSurfaceIronDeposits(random, island);
    const changed = convertedEmbeddedIron || placedSurfaceIron;
    this.surfaceIronMigrationVersion = SURFACE_IRON_TERRAIN_MIGRATION_VERSION;
    if (!changed) return;
    this.invalidateTerrainGeometry();
    this.textureCache.clear();
    this.rebuildSurfaceProfiles();
    this.generateWallLayerForPlanet(island);
    this.renderDirty = true;
    this.fullRenderDirty = true;
  }

  migrateEmbeddedIronToMoonstone() {
    let changed = false;
    for (let row = 0; row < this.rows; row += 1) {
      for (let col = 0; col < this.cols; col += 1) {
        const index = this.index(col, row);
        if (this.cells[index] !== 2) continue;
        const naturalWall = (this.wallCells?.[index] || 0) > 0;
        const embedded = this.countSolidNeighbors(col, row) >= 5;
        if (!naturalWall && !embedded) continue;
        this.cells[index] = 1;
        changed = true;
      }
    }
    return changed;
  }

  placeSurfaceIronDeposits(random, island = {}) {
    const profiles = {
      pebble: { widthCells: [1.7, 2.6], heightCells: [0.9, 1.35], inwardCells: 0.65 },
      rock: { widthCells: [3.0, 4.8], heightCells: [1.5, 2.4], inwardCells: 0.95 },
      boulder: { widthCells: [5.2, 7.6], heightCells: [2.6, 4.0], inwardCells: 1.35 },
      giant: { widthCells: [8.0, 11.5], heightCells: [4.0, 6.4], inwardCells: 1.8 },
    };
    const chooseProfile = () => {
      const roll = random();
      if (roll < 0.24) return profiles.pebble;
      if (roll < 0.62) return profiles.rock;
      if (roll < 0.88) return profiles.boulder;
      return profiles.giant;
    };
    const deposits = [];

    if (island?.type === 'crashPlanet') {
      deposits.push(
        { angle: -Math.PI / 2 - 0.78, profile: profiles.rock },
        { angle: -Math.PI / 2 - 0.36, profile: profiles.boulder },
        { angle: -Math.PI / 2 + 0.43, profile: profiles.rock },
        { angle: -Math.PI / 2 + 0.9, profile: profiles.giant },
      );
    } else {
      const sizeScale = clamp(this.planetRadius / 720, 0.65, 2.2);
      const count = clamp(Math.round((2 + random() * 3) * sizeScale), 2, 8);
      for (let index = 0; index < count; index += 1) {
        deposits.push({
          angle: random() * Math.PI * 2,
          profile: chooseProfile(),
        });
      }
    }

    return deposits.reduce((changed, deposit) => (
      this.paintSurfaceIronDeposit(deposit.angle, deposit.profile, random) || changed
    ), false);
  }

  paintSurfaceIronDeposit(angle, profile, random) {
    const surface = this.getMoonstoneSurfacePointAtAngle(angle, 0);
    if (!surface) return false;
    const outward = { x: Math.cos(angle), y: Math.sin(angle) };
    const tangent = { x: -outward.y, y: outward.x };
    const widthCells = profile.widthCells[0] + random() * (profile.widthCells[1] - profile.widthCells[0]);
    const heightCells = profile.heightCells[0] + random() * (profile.heightCells[1] - profile.heightCells[0]);
    const halfWidth = this.cellSize * widthCells * 0.5;
    const height = this.cellSize * heightCells;
    const inwardDepth = this.cellSize * (profile.inwardCells || 1);
    const centerLift = height * 0.34 - inwardDepth * 0.08;
    const centerX = surface.x + outward.x * centerLift + tangent.x * signedNoise(angle * 41.3 + this.seed * 0.002) * this.cellSize * 0.6;
    const centerY = surface.y + outward.y * centerLift + tangent.y * signedNoise(angle * 41.3 + this.seed * 0.002) * this.cellSize * 0.6;
    const radius = Math.max(halfWidth, height + inwardDepth) + this.cellSize * 2;
    const startCol = clamp(Math.floor((centerX - radius) / this.cellSize), 0, this.cols - 1);
    const endCol = clamp(Math.ceil((centerX + radius) / this.cellSize), 0, this.cols - 1);
    const startRow = clamp(Math.floor((centerY - radius) / this.cellSize), 0, this.rows - 1);
    const endRow = clamp(Math.ceil((centerY + radius) / this.cellSize), 0, this.rows - 1);
    const candidates = [];
    const candidateMap = new Map();

    for (let row = startRow; row <= endRow; row += 1) {
      for (let col = startCol; col <= endCol; col += 1) {
        const current = this.getCell(col, row);
        if (current !== 0 && current !== 1) continue;
        if (this.hasIronSpawnBlockerNear(col, row)) continue;
        const x = col * this.cellSize + this.cellSize * 0.5;
        const y = row * this.cellSize + this.cellSize * 0.5;
        const dx = x - surface.x;
        const dy = y - surface.y;
        const along = dx * tangent.x + dy * tangent.y;
        const lift = dx * outward.x + dy * outward.y;
        if (lift < -inwardDepth || lift > height) continue;
        const widthTaper = 1 - clamp01((lift - height * 0.28) / Math.max(1, height * 0.92)) * 0.28;
        const nx = along / Math.max(1, halfWidth * widthTaper);
        const ny = (lift - centerLift) / Math.max(1, (height + inwardDepth) * 0.54);
        const wobble = signedNoise(col * 31.7 + row * 47.9 + this.seed * 0.006) * 0.2
          + signedNoise(col * 11.1 - row * 19.3 + this.seed * 0.011) * 0.08;
        if (nx * nx + ny * ny > 1 + wobble) continue;
        const candidate = { col, row, current };
        candidates.push(candidate);
        candidateMap.set(`${col},${row}`, candidate);
      }
    }

    const isAnchored = (candidate) => {
      if (candidate.current === 1) return true;
      const neighbors = [
        [candidate.col + 1, candidate.row],
        [candidate.col - 1, candidate.row],
        [candidate.col, candidate.row + 1],
        [candidate.col, candidate.row - 1],
      ];
      return neighbors.some(([col, row]) => this.getCell(col, row) === 1);
    };
    const queue = candidates.filter(isAnchored);
    const attached = new Set(queue.map((candidate) => `${candidate.col},${candidate.row}`));
    for (let index = 0; index < queue.length; index += 1) {
      const candidate = queue[index];
      const neighbors = [
        [candidate.col + 1, candidate.row],
        [candidate.col - 1, candidate.row],
        [candidate.col, candidate.row + 1],
        [candidate.col, candidate.row - 1],
      ];
      for (const [col, row] of neighbors) {
        const key = `${col},${row}`;
        const next = candidateMap.get(key);
        if (!next || attached.has(key)) continue;
        attached.add(key);
        queue.push(next);
      }
    }

    let changed = false;
    for (const key of attached) {
      const candidate = candidateMap.get(key);
      if (!candidate) continue;
      const index = this.index(candidate.col, candidate.row);
      if (this.cells[index] !== 2) {
        this.cells[index] = 2;
        this.damage[index] = 0;
        this.damagedCells.delete(index);
        changed = true;
      }
      if (this.wallCells?.length) this.wallCells[index] = 2;
    }
    return changed;
  }

  getMoonstoneSurfacePointAtAngle(angle, offset = 0) {
    const maxRadius = Math.min(this.width, this.height) * 0.52;
    const step = Math.max(4, this.cellSize * 0.45);
    for (let radius = maxRadius; radius >= 0; radius -= step) {
      const x = this.planetCenterX + Math.cos(angle) * radius;
      const y = this.planetCenterY + Math.sin(angle) * radius;
      const { col, row } = this.cellFromWorld(x, y);
      const material = this.getCell(col, row);
      if (material <= 0) continue;
      if (material !== 1) return null;
      const adjustedRadius = radius + offset;
      return {
        x: this.planetCenterX + Math.cos(angle) * adjustedRadius,
        y: this.planetCenterY + Math.sin(angle) * adjustedRadius,
        radius: adjustedRadius,
      };
    }
    return null;
  }

  hasIronSpawnBlockerNear(col, row) {
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        const material = this.getCell(col + ox, row + oy);
        if (material > 0 && material !== 1) return true;
      }
    }
    return false;
  }

  countSolidNeighbors(col, row) {
    let count = 0;
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        if (ox === 0 && oy === 0) continue;
        if (this.isSolidCell(col + ox, row + oy)) count += 1;
      }
    }
    return count;
  }

  shapeGentlePlanetSurface(island) {
    const profiles = this.rebuildSurfaceProfiles();
    const solidColumns = profiles.surfaceRows
      .map((row, col) => (row === null ? null : col))
      .filter((col) => col !== null);
    if (solidColumns.length < 8) return;

    const left = solidColumns[0];
    const right = solidColumns[solidColumns.length - 1];
    const centerCol = clamp(Math.round(this.planetCenterX / this.cellSize), left, right);
    const centerRow = this.planetCenterY / this.cellSize;
    const radiusYRows = Math.max(10, this.planetRadius / this.cellSize);
    const topRow = Math.max(3, centerRow - radiusYRows);
    const halfWidth = Math.max(1, (right - left) * 0.5);
    const crashPlanet = island?.type === 'crashPlanet';
    const maxSlope = crashPlanet ? 0.72 : 0.86;
    const targetRows = new Array(this.cols).fill(null);

    for (let col = left; col <= right; col += 1) {
      const current = profiles.surfaceRows[col];
      if (current === null) continue;
      const normalized = Math.abs((col - centerCol) / halfWidth);
      if (normalized > 0.99) {
        targetRows[col] = current;
        continue;
      }
      const circle = Math.sqrt(Math.max(0, 1 - normalized * normalized));
      const roundedRow = centerRow - radiusYRows * circle;
      const broadWave = Math.sin(col * 0.045 + this.seed * 0.0009) * (crashPlanet ? 1.15 : 1.65);
      const detailWave = Math.sin(col * 0.15 + this.seed * 0.0017) * (crashPlanet ? 0.35 : 0.55);
      const chipStep = Math.round(signedNoise(Math.floor(col / 4) * 19.31 + this.seed * 0.004) * (crashPlanet ? 0.95 : 1.25));
      const edgeBlend = smoothStep((normalized - 0.78) / 0.21) * 0.1;
      const roundedTarget = roundedRow + broadWave + detailWave + chipStep;
      targetRows[col] = roundedTarget * (1 - edgeBlend) + current * edgeBlend;
    }

    this.limitSurfaceSlope(targetRows, left, right, maxSlope);
    this.applySurfaceRows(targetRows, profiles.bottomRows, {
      minThickness: crashPlanet ? 32 : 26,
    });
  }

  limitSurfaceSlope(rows, left, right, maxSlope) {
    for (let col = left + 1; col <= right; col += 1) {
      if (rows[col] === null || rows[col - 1] === null) continue;
      const delta = rows[col] - rows[col - 1];
      if (Math.abs(delta) > maxSlope) rows[col] = rows[col - 1] + Math.sign(delta) * maxSlope;
    }
    for (let col = right - 1; col >= left; col -= 1) {
      if (rows[col] === null || rows[col + 1] === null) continue;
      const delta = rows[col] - rows[col + 1];
      if (Math.abs(delta) > maxSlope) rows[col] = rows[col + 1] + Math.sign(delta) * maxSlope;
    }
  }

  applySurfaceRows(targetRows, bottomRows, { minThickness = 18 } = {}) {
    let changed = false;
    for (let col = 0; col < this.cols; col += 1) {
      if (targetRows[col] === null) continue;
      const current = this.findSurfaceRow(col);
      const bottom = bottomRows[col] ?? this.findLastSolidRow(col);
      if (current === null || bottom === null) continue;
      const maxTarget = Math.min(bottom - minThickness, this.rows - 3);
      if (maxTarget < 3) continue;
      const target = clamp(Math.round(targetRows[col]), 3, maxTarget);
      if (target < current) {
        for (let row = target; row < current; row += 1) {
          const index = this.index(col, row);
          if (this.cells[index] === 0) {
            this.cells[index] = 1;
            this.damage[index] = 0;
            changed = true;
          }
        }
      } else if (target > current) {
        for (let row = current; row < target; row += 1) {
          const index = this.index(col, row);
          if (this.cells[index] !== 0) {
            this.cells[index] = 0;
            this.damage[index] = 0;
            changed = true;
          }
        }
      }
    }

    if (changed) {
      this.invalidateTerrainGeometry();
      this.renderDirty = true;
      this.fullRenderDirty = true;
      this.rebuildSurfaceProfiles();
    }
  }

  flattenStarterLandingPlateau(island) {
    if (island?.type !== 'crashPlanet') return;
    const profiles = this.rebuildSurfaceProfiles();
    const centerCol = clamp(Math.round(this.planetCenterX / this.cellSize), 2, this.cols - 3);
    const baseRow = profiles.surfaceRows[centerCol];
    if (baseRow === null) return;
    const halfFlat = Math.round(380 / this.cellSize);
    const halfShoulder = Math.round(680 / this.cellSize);
    const targetRows = new Array(this.cols).fill(null);

    for (let col = centerCol - halfShoulder; col <= centerCol + halfShoulder; col += 1) {
      if (col < 0 || col >= this.cols) continue;
      const current = profiles.surfaceRows[col];
      if (current === null) continue;
      const distance = Math.abs(col - centerCol);
      const blend = distance <= halfFlat
        ? 0
        : smoothStep((distance - halfFlat) / Math.max(1, halfShoulder - halfFlat));
      const terraceNoise = Math.sin(col * 0.19 + this.seed * 0.001) * 0.36
        + Math.round(signedNoise(Math.floor(col / 4) * 23.7 + this.seed * 0.006) * 0.85);
      targetRows[col] = baseRow + blend * Math.min(9, Math.max(0, current - baseRow)) + terraceNoise;
    }

    this.limitSurfaceSlope(targetRows, Math.max(0, centerCol - halfShoulder), Math.min(this.cols - 1, centerCol + halfShoulder), 0.12);
    this.applySurfaceRows(targetRows, profiles.bottomRows, { minThickness: 28 });
  }

  smoothTerrain(iterations = 1) {
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const next = new Uint8Array(this.cells);
      for (let row = 1; row < this.rows - 1; row += 1) {
        for (let col = 1; col < this.cols - 1; col += 1) {
          const material = this.getCell(col, row);
          const isOre = material > 1;
          if (isOre) continue;
          let solidCount = 0;
          for (let oy = -1; oy <= 1; oy += 1) {
            for (let ox = -1; ox <= 1; ox += 1) {
              if (this.getCell(col + ox, row + oy) > 0) solidCount += 1;
            }
          }
          const index = this.index(col, row);
          if (solidCount >= 6) next[index] = material || 1;
          if (solidCount <= 2) next[index] = 0;
        }
      }
      this.cells = next;
    }
  }

  smoothMaterialPatches(iterations = 1) {
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const next = new Uint8Array(this.cells);
      for (let row = 1; row < this.rows - 1; row += 1) {
        for (let col = 1; col < this.cols - 1; col += 1) {
          const material = this.getCell(col, row);
          if (material <= 0) continue;
          const counts = new Map();
          for (let oy = -1; oy <= 1; oy += 1) {
            for (let ox = -1; ox <= 1; ox += 1) {
              const neighbor = this.getCell(col + ox, row + oy);
              if (neighbor <= 1) continue;
              counts.set(neighbor, (counts.get(neighbor) || 0) + 1);
            }
          }
          let bestMaterial = material;
          let bestCount = material > 1 ? counts.get(material) || 0 : 0;
          for (const [candidate, count] of counts.entries()) {
            if (count > bestCount) {
              bestMaterial = candidate;
              bestCount = count;
            }
          }
          const index = this.index(col, row);
          if (material > 1 && bestCount <= 1) next[index] = 1;
          else if (material === 1 && bestMaterial > 1 && bestCount >= 5) next[index] = bestMaterial;
          else if (material > 1 && bestMaterial !== material && bestCount >= 5) next[index] = bestMaterial;
        }
      }
      this.cells = next;
    }
    this.invalidateTerrainGeometry({ keepSurfacePath: true });
    this.renderDirty = true;
    this.fullRenderDirty = true;
  }

  rebuildSurfaceProfiles() {
    const surfaceRows = new Array(this.cols).fill(null);
    const bottomRows = new Array(this.cols).fill(null);
    for (let col = 0; col < this.cols; col += 1) {
      for (let row = 0; row < this.rows; row += 1) {
        if (this.isSolidCell(col, row)) {
          surfaceRows[col] = row;
          break;
        }
      }
      for (let row = this.rows - 1; row >= 0; row -= 1) {
        if (this.isSolidCell(col, row)) {
          bottomRows[col] = row;
          break;
        }
      }
    }
    this.surfaceRows = surfaceRows;
    this.bottomRows = bottomRows;
    return { surfaceRows, bottomRows };
  }

  flattenSurfaceTeeth(iterations = 1) {
    let profiles = this.rebuildSurfaceProfiles();
    let changed = false;

    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const targetRows = this.createTerracedSurfaceRows(profiles.surfaceRows);
      for (let col = 1; col < this.cols - 1; col += 1) {
        const current = profiles.surfaceRows[col];
        const target = targetRows[col];
        if (current === null || target === null || current === target) continue;

        if (target > current) {
          for (let row = current; row < target; row += 1) {
            const index = this.index(col, row);
            if (this.cells[index] === 1) {
              this.cells[index] = 0;
              this.damage[index] = 0;
              changed = true;
            }
          }
        } else {
          for (let row = target; row < current; row += 1) {
            const index = this.index(col, row);
            if (this.cells[index] === 0) {
              this.cells[index] = 1;
              this.damage[index] = 0;
              changed = true;
            }
          }
        }
      }
      profiles = this.rebuildSurfaceProfiles();
    }

    if (changed) {
      this.invalidateTerrainGeometry();
      this.renderDirty = true;
      this.fullRenderDirty = true;
    }
  }

  createTerracedSurfaceRows(surfaceRows) {
    const rows = surfaceRows.slice();
    const targetRows = rows.slice();
    const maxStep = 1;
    const terraceStep = 2;

    for (let col = 3; col < this.cols - 3; col += 1) {
      const current = rows[col];
      if (current === null) continue;
      const windowRows = [];
      for (let offset = -3; offset <= 3; offset += 1) {
        const row = rows[col + offset];
        if (row !== null) windowRows.push(row);
      }
      if (windowRows.length < 3) continue;

      windowRows.sort((a, b) => a - b);
      const median = windowRows[Math.floor(windowRows.length * 0.5)];
      const left = rows[col - 1];
      const right = rows[col + 1];
      const isNeedlePeak = left !== null && right !== null && current <= left - 2 && current <= right - 2;
      const isNeedleDip = left !== null && right !== null && current >= left + 3 && current >= right + 3;
      const delta = median - current;
      if ((isNeedlePeak || isNeedleDip || Math.abs(delta) <= 3) && Math.abs(delta) > 0) {
        const pulled = current + Math.sign(delta) * Math.min(Math.abs(delta), isNeedlePeak || isNeedleDip ? 2 : 1);
        targetRows[col] = Math.round(pulled / terraceStep) * terraceStep;
      }
    }

    for (let col = 1; col < this.cols; col += 1) {
      if (targetRows[col] === null || targetRows[col - 1] === null) continue;
      const delta = targetRows[col] - targetRows[col - 1];
      if (Math.abs(delta) > maxStep) {
        targetRows[col] = targetRows[col - 1] + Math.sign(delta) * maxStep;
      }
    }
    for (let col = this.cols - 2; col >= 0; col -= 1) {
      if (targetRows[col] === null || targetRows[col + 1] === null) continue;
      const delta = targetRows[col] - targetRows[col + 1];
      if (Math.abs(delta) > maxStep) {
        targetRows[col] = targetRows[col + 1] + Math.sign(delta) * maxStep;
      }
    }

    return targetRows.map((row) => (row === null ? null : clamp(Math.round(row), 1, this.rows - 2)));
  }

  carveCaves(random, island) {
    const density = TERRAIN_TUNING.caveDensity || 1;
    const caveCount = Math.max(1, Math.round(({
      cave: 13,
      largeMineral: 10,
      wreckage: 7,
      crystalCluster: 9,
      smallAsteroid: 5,
    }[island.type] || 7) * density));

    for (let i = 0; i < caveCount; i += 1) {
      const startCol = clamp(Math.floor(4 + random() * Math.max(1, this.cols - 8)), 3, this.cols - 4);
      const surfaceRow = this.findSurfaceRow(startCol);
      const bottomRow = this.findLastSolidRow(startCol);
      if (surfaceRow === null || bottomRow === null || bottomRow - surfaceRow < 12) continue;
      const startX = startCol * this.cellSize;
      const depthT = 0.28 + random() * 0.58;
      const startY = (surfaceRow + (bottomRow - surfaceRow) * depthT) * this.cellSize;
      const angle = (random() - 0.5) * Math.PI * 0.75;
      const length = 80 + random() * 220;
      const steps = 3 + Math.floor(random() * 4);
      for (let step = 0; step < steps; step += 1) {
        const t = steps <= 1 ? 0 : step / (steps - 1);
        const cx = startX + Math.cos(angle) * length * (t - 0.5) + (random() - 0.5) * 80;
        const cy = startY + Math.sin(angle) * length * (t - 0.5) + Math.sin(t * Math.PI * 2) * 34;
        const rx = 42 + random() * 84;
        const ry = 30 + random() * 62;
        this.carveEllipse(cx, cy, rx, ry);
      }
      if (random() < 0.68) {
        this.carveWormCave(startX, startY, angle + (random() - 0.5) * 0.8, length * (0.55 + random() * 0.55), random);
      }
    }
  }

  carveWormCave(startX, startY, angle, length, random) {
    const steps = Math.max(8, Math.floor(length / Math.max(28, this.cellSize * 2.2)));
    let x = startX;
    let y = startY;
    let direction = angle;
    for (let step = 0; step < steps; step += 1) {
      const t = step / Math.max(1, steps - 1);
      direction += signedNoise(this.seed * 0.02 + step * 13.71 + x * 0.03) * 0.22;
      const radius = this.cellSize * (1.55 + Math.sin(t * Math.PI) * 1.6 + random() * 0.55);
      this.carveEllipse(
        x,
        y,
        radius * (1.15 + random() * 0.35),
        radius * (0.75 + random() * 0.3),
      );
      x += Math.cos(direction) * this.cellSize * (1.65 + random() * 0.6);
      y += Math.sin(direction) * this.cellSize * (1.65 + random() * 0.6);
      const { col, row } = this.cellFromWorld(x, y);
      if (!this.isInside(col, row) || !this.isSolidCell(col, row)) break;
    }
  }

  placeOreVeins(random, island, surfaceRows) {
    const oreDensity = TERRAIN_TUNING.oreDensity || 1;
    if (island.type === 'crashPlanet') {
      const starterVeins = [
        { material: 9, count: Math.round(6 * oreDensity), radius: [22, 48], minDepth: 5, depthBias: 0.52, shallowChance: 0.18 },
      ];
      this.paintVeinPlan(random, starterVeins, surfaceRows);
      this.paintStarterMoonCrystalPatch(random);
      this.paintStarterBottomCopperPatch(random);
      return;
    }

    const richness = ({
      smallAsteroid: 1,
      largeMineral: 1.45,
      wreckage: 1.1,
      crystalCluster: 1.55,
      cave: 1.25,
    }[island.type] || 1) * oreDensity;
    const veinPlan = [
      { material: 3, count: Math.round(6 * richness), radius: [30, 68], minDepth: 6, depthBias: 0.54, shallowChance: 0.1 },
      { material: 4, count: Math.round((island.biome === 'crystal' ? 9 : 4) * richness), radius: [26, 58], minDepth: 7, depthBias: 0.64, shallowChance: 0.08 },
      { material: 5, count: island.dangerLevel >= 3 || island.biome === 'crystal' ? 3 : 1, radius: [20, 42], minDepth: 10, depthBias: 0.78, shallowChance: 0.04 },
    ];

    this.paintVeinPlan(random, veinPlan, surfaceRows);
  }

  paintVeinPlan(random, veinPlan, surfaceRows) {
    for (const vein of veinPlan) {
      for (let i = 0; i < vein.count; i += 1) {
        const col = clamp(Math.floor(random() * this.cols), 3, this.cols - 4);
        const surfaceRow = surfaceRows[col] || this.findSurfaceRow(col) || Math.round(this.landingY / this.cellSize);
        const bottomRow = this.findLastSolidRow(col) || this.rows - 5;
        const shallowRoll = random() < (vein.shallowChance ?? 0.1);
        const minDepth = shallowRoll ? Math.max(1, Math.floor(vein.minDepth * 0.45)) : vein.minDepth;
        const depthRows = Math.max(4, bottomRow - surfaceRow - minDepth);
        const depthBias = shallowRoll ? 0.08 + random() * 0.18 : vein.depthBias;
        const depthRoll = depthBias + (1 - depthBias) * random();
        const row = clamp(surfaceRow + minDepth + Math.floor(depthRows * depthRoll), surfaceRow + minDepth, bottomRow - 1);
        const startX = col * this.cellSize;
        const startY = row * this.cellSize;
        const angle = random() * Math.PI * 2;
        const blobCount = 3 + Math.floor(random() * 4);
        for (let blob = 0; blob < blobCount; blob += 1) {
          const t = blobCount <= 1 ? 0 : blob / (blobCount - 1) - 0.5;
          const cx = startX + Math.cos(angle) * t * vein.radius[1] * 1.8 + (random() - 0.5) * 34;
          const cy = startY + Math.sin(angle) * t * vein.radius[1] * 1.2 + (random() - 0.5) * 30;
          const rx = vein.radius[0] + random() * vein.radius[1];
          const ry = vein.radius[0] * 0.62 + random() * vein.radius[1] * 0.48;
          this.paintOreEllipse(cx, cy, rx, ry, vein.material);
        }
      }
    }
  }

  paintStarterBottomCopperPatch(random) {
    const angle = Math.PI / 2;
    const surfaceRadius = this.getSurfaceRadiusAtAngle(angle);
    const normal = { x: Math.cos(angle), y: Math.sin(angle) };
    const centerX = this.planetCenterX + normal.x * Math.max(0, surfaceRadius - this.cellSize * 1.65);
    const centerY = this.planetCenterY + normal.y * Math.max(0, surfaceRadius - this.cellSize * 1.65);
    const tangent = { x: -normal.y, y: normal.x };
    const blobs = [
      { offset: -1.8, radius: 1.8 },
      { offset: 0, radius: 2.25 },
      { offset: 1.8, radius: 1.65 },
    ];
    blobs.forEach((blob) => {
      const wobble = (random() - 0.5) * this.cellSize * 0.55;
      const cx = centerX + tangent.x * blob.offset * this.cellSize + normal.x * wobble * 0.35;
      const cy = centerY + tangent.y * blob.offset * this.cellSize + normal.y * wobble * 0.35;
      this.paintOreEllipse(
        cx,
        cy,
        this.cellSize * (blob.radius + random() * 0.18),
        this.cellSize * (blob.radius * 0.74 + random() * 0.14),
        3,
      );
    });
  }

  paintStarterMoonCrystalPatch(random) {
    const seams = [
      { angle: -Math.PI / 2 - 0.72, depth: 1.7, spread: 1.65 },
      { angle: -Math.PI / 2 + 0.82, depth: 2.15, spread: 1.35 },
    ];
    seams.forEach((seam) => {
      const surfaceRadius = this.getSurfaceRadiusAtAngle(seam.angle);
      const normal = { x: Math.cos(seam.angle), y: Math.sin(seam.angle) };
      const tangent = { x: -normal.y, y: normal.x };
      const centerX = this.planetCenterX + normal.x * Math.max(0, surfaceRadius - this.cellSize * seam.depth);
      const centerY = this.planetCenterY + normal.y * Math.max(0, surfaceRadius - this.cellSize * seam.depth);
      for (let blob = -1; blob <= 1; blob += 1) {
        const wobble = (random() - 0.5) * this.cellSize * 0.45;
        const cx = centerX + tangent.x * blob * seam.spread * this.cellSize + normal.x * wobble * 0.25;
        const cy = centerY + tangent.y * blob * seam.spread * this.cellSize + normal.y * wobble * 0.25;
        this.paintOreEllipse(
          cx,
          cy,
          this.cellSize * (1.1 + random() * 0.28),
          this.cellSize * (0.82 + random() * 0.18),
          9,
        );
      }
    });
  }

  shouldPlaceFireCore(island) {
    if (!island) return false;
    if (island.type === 'crashPlanet') return true;
    return (island.dangerLevel || 1) <= 1
      && (island.biome === 'scrap' || island.biome === 'forest' || island.kind === 'loose');
  }

  placeFireCoreDeposit(random, island) {
    if (!this.shouldPlaceFireCore(island)) return;
    const centerCol = clamp(Math.round(this.planetCenterX / this.cellSize), 2, this.cols - 3);
    const centerRow = clamp(Math.round(this.planetCenterY / this.cellSize), 2, this.rows - 3);
    const offsetCol = island.type === 'crashPlanet'
      ? centerCol
      : clamp(centerCol + Math.round((random() - 0.5) * 5), 2, this.cols - 3);
    const offsetRow = island.type === 'crashPlanet'
      ? centerRow
      : clamp(centerRow + Math.round((random() - 0.5) * 5), 2, this.rows - 3);
    const radius = island.type === 'crashPlanet' ? 4 : 1;

    for (let row = offsetRow - radius - 1; row <= offsetRow + radius + 1; row += 1) {
      for (let col = offsetCol - radius - 1; col <= offsetCol + radius + 1; col += 1) {
        if (!this.isInside(col, row)) continue;
        const dx = col - offsetCol;
        const dy = row - offsetRow;
        const distance = Math.hypot(dx, dy);
        if (distance <= radius + 0.2) {
          this.setCell(col, row, 6);
        } else if (distance <= radius + 1.1 && this.getCell(col, row) === 0) {
          this.setCell(col, row, 1);
        }
      }
    }
  }

  shouldPlaceCrystalVault(island) {
    if (!island) return false;
    if (island.type === 'crashPlanet') return true;
    return (island.dangerLevel || 1) <= 1
      && (island.biome === 'scrap' || island.biome === 'forest' || island.kind === 'loose');
  }

  placeCrystalVault(random, island) {
    if (!this.shouldPlaceCrystalVault(island)) return;
    const lowerArc = Math.PI * (0.34 + random() * 0.32);
    const vaultDistance = this.planetRadius * (0.36 + random() * 0.1);
    const cx = this.planetCenterX + Math.cos(lowerArc) * vaultDistance;
    const cy = this.planetCenterY + Math.sin(lowerArc) * vaultDistance;
    const rx = this.cellSize * (5.4 + random() * 1.6);
    const ry = this.cellSize * (4.2 + random() * 1.25);
    const wall = this.cellSize * 1.85;
    const surfaceRadius = this.getSurfaceRadiusAtAngle(lowerArc);
    const startX = this.planetCenterX + Math.cos(lowerArc) * Math.max(0, surfaceRadius - this.cellSize * 0.5);
    const startY = this.planetCenterY + Math.sin(lowerArc) * Math.max(0, surfaceRadius - this.cellSize * 0.5);
    const endX = cx + Math.cos(lowerArc) * (rx + wall * 0.7);
    const endY = cy + Math.sin(lowerArc) * (ry + wall * 0.7);

    this.paintMaterialLine(startX, startY, endX, endY, this.cellSize * 1.55, 7);
    this.carveCrystalVaultRoom(cx, cy, rx, ry, wall);

    const spikeCount = island.type === 'crashPlanet' ? 8 : 6;
    for (let index = 0; index < spikeCount; index += 1) {
      const angle = (Math.PI * 2 * index) / spikeCount + random() * 0.36;
      this.paintVaultCrystalSpike(cx, cy, rx, ry, angle, random);
    }
  }

  paintMaterialLine(startX, startY, endX, endY, width, material) {
    const minX = Math.min(startX, endX) - width - this.cellSize;
    const maxX = Math.max(startX, endX) + width + this.cellSize;
    const minY = Math.min(startY, endY) - width - this.cellSize;
    const maxY = Math.max(startY, endY) + width + this.cellSize;
    const startCol = clamp(Math.floor(minX / this.cellSize), 0, this.cols - 1);
    const endCol = clamp(Math.ceil(maxX / this.cellSize), 0, this.cols - 1);
    const startRow = clamp(Math.floor(minY / this.cellSize), 0, this.rows - 1);
    const endRow = clamp(Math.ceil(maxY / this.cellSize), 0, this.rows - 1);
    const dx = endX - startX;
    const dy = endY - startY;
    const lengthSq = dx * dx + dy * dy || 1;
    const widthSq = width * width;
    for (let row = startRow; row <= endRow; row += 1) {
      for (let col = startCol; col <= endCol; col += 1) {
        const x = col * this.cellSize + this.cellSize * 0.5;
        const y = row * this.cellSize + this.cellSize * 0.5;
        if (!this.isSolidCell(col, row)) continue;
        const centerDistance = Math.hypot(x - this.planetCenterX, y - this.planetCenterY);
        if (centerDistance > this.planetRadius * 1.04) continue;
        const t = clamp(((x - startX) * dx + (y - startY) * dy) / lengthSq, 0, 1);
        const px = startX + dx * t;
        const py = startY + dy * t;
        const distanceSq = (x - px) ** 2 + (y - py) ** 2;
        const wobble = signedNoise(col * 54.3 + row * 11.7 + this.seed * 0.004) * this.cellSize * 0.26;
        if (distanceSq <= (width + wobble) * (width + wobble) || distanceSq <= widthSq * 0.72) this.setCell(col, row, material);
      }
    }
  }

  carveCrystalVaultRoom(cx, cy, rx, ry, wall) {
    const outerRx = rx + wall;
    const outerRy = ry + wall;
    const startCol = clamp(Math.floor((cx - outerRx - this.cellSize) / this.cellSize), 0, this.cols - 1);
    const endCol = clamp(Math.ceil((cx + outerRx + this.cellSize) / this.cellSize), 0, this.cols - 1);
    const startRow = clamp(Math.floor((cy - outerRy - this.cellSize) / this.cellSize), 0, this.rows - 1);
    const endRow = clamp(Math.ceil((cy + outerRy + this.cellSize) / this.cellSize), 0, this.rows - 1);
    for (let row = startRow; row <= endRow; row += 1) {
      for (let col = startCol; col <= endCol; col += 1) {
        const x = col * this.cellSize + this.cellSize * 0.5;
        const y = row * this.cellSize + this.cellSize * 0.5;
        const inner = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        const outer = ((x - cx) / outerRx) ** 2 + ((y - cy) / outerRy) ** 2;
        const wobble = signedNoise(col * 18.7 + row * 49.1 + this.seed * 0.009) * 0.1;
        if (inner <= 1 + wobble * 0.35) {
          this.setCell(col, row, 0);
        } else if (outer <= 1 + wobble) {
          this.setCell(col, row, 7);
        }
      }
    }
  }

  paintVaultCrystalSpike(cx, cy, rx, ry, angle, random) {
    const normal = { x: Math.cos(angle), y: Math.sin(angle) };
    const inward = { x: -normal.x, y: -normal.y };
    const tangent = { x: -normal.y, y: normal.x };
    const baseX = cx + normal.x * rx * 0.94;
    const baseY = cy + normal.y * ry * 0.94;
    const length = this.cellSize * (1.55 + random() * 1.45);
    const width = this.cellSize * (0.48 + random() * 0.42);
    const search = Math.ceil((length + width + this.cellSize) / this.cellSize);
    const center = this.cellFromWorld(baseX, baseY);

    for (let row = center.row - search; row <= center.row + search; row += 1) {
      for (let col = center.col - search; col <= center.col + search; col += 1) {
        if (!this.isInside(col, row)) continue;
        const x = col * this.cellSize + this.cellSize * 0.5;
        const y = row * this.cellSize + this.cellSize * 0.5;
        const dx = x - baseX;
        const dy = y - baseY;
        const along = dx * tangent.x + dy * tangent.y;
        const depth = dx * inward.x + dy * inward.y;
        if (depth < -this.cellSize * 0.25 || depth > length) continue;
        const taper = 1 - clamp01(depth / Math.max(1, length));
        const halfWidth = Math.max(this.cellSize * 0.28, width * (0.35 + taper * 0.9));
        if (Math.abs(along) <= halfWidth) this.setCell(col, row, 8);
      }
    }
  }

  clearLandingZone() {
    const baseRow = clamp(Math.round(this.landingY / this.cellSize), 5, this.rows - 4);
    const flatHalfWidth = 120;
    const shoulderHalfWidth = 230;
    const startCol = Math.max(0, Math.floor((this.landingX - shoulderHalfWidth) / this.cellSize));
    const endCol = Math.min(this.cols - 1, Math.ceil((this.landingX + shoulderHalfWidth) / this.cellSize));

    for (let col = startCol; col <= endCol; col += 1) {
      const x = col * this.cellSize;
      const dx = Math.abs(x - this.landingX);
      const existing = this.findSurfaceRow(col) || baseRow;
      const existingBottomRow = this.findLastSolidRow(col) || clamp(baseRow + 12, baseRow + 8, this.rows - 3);
      const blend = dx <= flatHalfWidth ? 0 : smoothStep((dx - flatHalfWidth) / Math.max(1, shoulderHalfWidth - flatHalfWidth));
      const targetRow = clamp(Math.round(baseRow + (existing - baseRow) * blend), 5, this.rows - 4);
      const bottomRow = clamp(Math.max(existingBottomRow, targetRow + 8), targetRow + 8, this.rows - 3);
      for (let row = 0; row < targetRow; row += 1) this.setCell(col, row, 0);
      for (let row = targetRow; row <= bottomRow; row += 1) {
        if (this.getCell(col, row) === 0 || row < baseRow + 4) this.setCell(col, row, 1);
      }
      for (let row = bottomRow + 1; row < this.rows; row += 1) this.setCell(col, row, 0);
    }
  }

  carveEllipse(cx, cy, rx, ry) {
    const startCol = clamp(Math.floor((cx - rx) / this.cellSize), 0, this.cols - 1);
    const endCol = clamp(Math.ceil((cx + rx) / this.cellSize), 0, this.cols - 1);
    const startRow = clamp(Math.floor((cy - ry) / this.cellSize), 0, this.rows - 1);
    const endRow = clamp(Math.ceil((cy + ry) / this.cellSize), 0, this.rows - 1);
    for (let row = startRow; row <= endRow; row += 1) {
      for (let col = startCol; col <= endCol; col += 1) {
        const x = col * this.cellSize + this.cellSize * 0.5;
        const y = row * this.cellSize + this.cellSize * 0.5;
        const wobble = signedNoise(col * 13.17 + row * 71.91 + this.seed * 0.013) * 0.16;
        const value = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (value <= 1 + wobble) this.setCell(col, row, 0);
      }
    }
  }

  paintOreEllipse(cx, cy, rx, ry, material) {
    const startCol = clamp(Math.floor((cx - rx) / this.cellSize), 0, this.cols - 1);
    const endCol = clamp(Math.ceil((cx + rx) / this.cellSize), 0, this.cols - 1);
    const startRow = clamp(Math.floor((cy - ry) / this.cellSize), 0, this.rows - 1);
    const endRow = clamp(Math.ceil((cy + ry) / this.cellSize), 0, this.rows - 1);
    for (let row = startRow; row <= endRow; row += 1) {
      for (let col = startCol; col <= endCol; col += 1) {
        if (!this.isSolidCell(col, row)) continue;
        const x = col * this.cellSize + this.cellSize * 0.5;
        const y = row * this.cellSize + this.cellSize * 0.5;
        const wobble = signedNoise(col * 91.7 + row * 37.3 + this.seed * 0.007) * 0.22;
        const value = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (value <= 1 + wobble) this.setCell(col, row, material);
      }
    }
  }

  index(col, row) {
    return row * this.cols + col;
  }

  isInside(col, row) {
    return col >= 0 && col < this.cols && row >= 0 && row < this.rows;
  }

  getClockNow() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  isTerrainRebuildDebugEnabled() {
    if (typeof globalThis?.SHOW_TERRAIN_REBUILD_DEBUG === 'boolean') {
      return globalThis.SHOW_TERRAIN_REBUILD_DEBUG;
    }
    return SHOW_TERRAIN_REBUILD_DEBUG;
  }

  beginTerrainRebuildDebug(functionName, details = {}) {
    if (!this.isTerrainRebuildDebugEnabled()) return null;
    this.terrainRebuildDebugId = (this.terrainRebuildDebugId || 0) + 1;
    const entry = {
      id: this.terrainRebuildDebugId,
      functionName,
      startedAt: this.getClockNow(),
      tilesProcessed: 0,
      chunksRebuilt: 0,
      roughEdgesRegenerated: 0,
      fullPlanetRebuild: false,
      ...details,
    };
    entry.timerLabel = `terrain:${functionName}#${entry.id}`;
    this.terrainRebuildDebugStack.push(entry);
    console.time?.(entry.timerLabel);
    return entry;
  }

  getActiveTerrainRebuildDebug() {
    return this.terrainRebuildDebugStack[this.terrainRebuildDebugStack.length - 1] || null;
  }

  addTerrainRebuildDebugStats(entry, stats = {}) {
    if (!entry || !stats) return;
    ['tilesProcessed', 'roughEdgesRegenerated', 'roughEdgesDrawn'].forEach((key) => {
      if (Number.isFinite(stats[key])) entry[key] = (entry[key] || 0) + stats[key];
    });
    if (Number.isFinite(stats.chunksRebuilt)) {
      entry.chunksRebuilt = Math.max(entry.chunksRebuilt || 0, stats.chunksRebuilt);
    }
    if (stats.fullPlanetRebuild) entry.fullPlanetRebuild = true;
    if (stats.bounds) entry.bounds = stats.bounds;
    if (stats.fromMining) entry.fromMining = true;
    if (Number.isFinite(stats.brokenTiles)) entry.brokenTiles = stats.brokenTiles;
  }

  finishTerrainRebuildDebug(entry, stats = {}) {
    if (!entry) return;
    this.addTerrainRebuildDebugStats(entry, stats);
    const index = this.terrainRebuildDebugStack.lastIndexOf(entry);
    if (index >= 0) this.terrainRebuildDebugStack.splice(index, 1);
    console.timeEnd?.(entry.timerLabel);
    const timeMs = Math.max(0, this.getClockNow() - entry.startedAt);
    const fromMining = Boolean(entry.fromMining || this.isRecentMiningEdit());
    const payload = {
      functionName: entry.functionName,
      timeMs: Number(timeMs.toFixed(3)),
      tilesProcessed: entry.tilesProcessed || 0,
      chunksRebuilt: entry.chunksRebuilt || 0,
      roughEdgesRegenerated: entry.roughEdgesRegenerated || 0,
      roughEdgesDrawn: entry.roughEdgesDrawn || 0,
      fullPlanetRebuild: Boolean(entry.fullPlanetRebuild),
      fromMining,
      brokenTiles: Number.isFinite(entry.brokenTiles) ? entry.brokenTiles : this.lastMiningBrokenCount || 0,
      bounds: entry.bounds || null,
    };
    console.log('[terrain rebuild debug]', payload);
    if (fromMining && payload.brokenTiles <= 1 && payload.chunksRebuilt > TERRAIN_REBUILD_CHUNK_WARNING_LIMIT) {
      console.warn('WARNING: mining caused too many chunk rebuilds', payload);
    }
    if (fromMining && payload.fullPlanetRebuild) {
      console.error('ERROR: mining triggered full planet visual rebuild', payload);
    }
  }

  recordTerrainRoughEdgeRegenerated(count = 1) {
    const entry = this.getActiveTerrainRebuildDebug();
    if (entry) entry.roughEdgesRegenerated = (entry.roughEdgesRegenerated || 0) + count;
  }

  recordMiningEditDebug(bounds, brokenCount = 0) {
    this.lastMiningEditAt = this.getClockNow();
    this.lastMiningEditBounds = bounds ? { ...bounds } : null;
    this.lastMiningBrokenCount = brokenCount;
  }

  isRecentMiningEdit(now = this.getClockNow()) {
    return this.lastMiningEditAt > 0
      && now - this.lastMiningEditAt <= TERRAIN_RECENT_MINE_REBUILD_WINDOW_MS;
  }

  countCellsInBounds(bounds = null) {
    const scan = bounds || {
      minCol: 0,
      maxCol: this.cols - 1,
      minRow: 0,
      maxRow: this.rows - 1,
    };
    return Math.max(0, scan.maxCol - scan.minCol + 1) * Math.max(0, scan.maxRow - scan.minRow + 1);
  }

  getChunkRangeForBounds(bounds = null) {
    const chunkSize = Math.max(4, this.chunkSizeCells || DEFAULT_TERRAIN_CHUNK_CELLS);
    const scan = bounds || {
      minCol: 0,
      maxCol: this.cols - 1,
      minRow: 0,
      maxRow: this.rows - 1,
    };
    return {
      minChunkCol: Math.floor(clamp(scan.minCol, 0, this.cols - 1) / chunkSize),
      maxChunkCol: Math.floor(clamp(scan.maxCol, 0, this.cols - 1) / chunkSize),
      minChunkRow: Math.floor(clamp(scan.minRow, 0, this.rows - 1) / chunkSize),
      maxChunkRow: Math.floor(clamp(scan.maxRow, 0, this.rows - 1) / chunkSize),
    };
  }

  countChunksForBounds(bounds = null) {
    const range = this.getChunkRangeForBounds(bounds);
    return Math.max(0, range.maxChunkCol - range.minChunkCol + 1)
      * Math.max(0, range.maxChunkRow - range.minChunkRow + 1);
  }

  markDirtyChunksForBounds(bounds = null) {
    if (!bounds) return 0;
    const range = this.getChunkRangeForBounds(bounds);
    let count = 0;
    for (let chunkRow = range.minChunkRow; chunkRow <= range.maxChunkRow; chunkRow += 1) {
      for (let chunkCol = range.minChunkCol; chunkCol <= range.maxChunkCol; chunkCol += 1) {
        const key = `${chunkCol},${chunkRow}`;
        if (!this.dirtyChunks.has(key)) count += 1;
        this.dirtyChunks.add(key);
      }
    }
    return count;
  }

  invalidateRoughEdgesAroundCell(col, row, { radius = 1 } = {}) {
    if (!this.roughEdgeCache?.size) return 0;
    let deleted = 0;
    const materialIds = Object.keys(TERRAIN_MATERIALS);
    for (let y = row - radius; y <= row + radius; y += 1) {
      for (let x = col - radius; x <= col + radius; x += 1) {
        if (!this.isInside(x, y)) continue;
        for (const directionName of EDGE_DIRECTION_NAMES) {
          for (const materialId of materialIds) {
            if (this.roughEdgeCache.delete(`${x}:${y}:${directionName}:${materialId}`)) deleted += 1;
          }
        }
      }
    }
    return deleted;
  }

  invalidateRoughEdgesForEditedCells(cells = []) {
    let deleted = 0;
    for (const cell of cells) {
      if (!Number.isInteger(cell?.col) || !Number.isInteger(cell?.row)) continue;
      deleted += this.invalidateRoughEdgesAroundCell(cell.col, cell.row, { radius: 1 });
    }
    return deleted;
  }

  markAirExposureDirty({ defer = false } = {}) {
    if (!defer || !this.airExposureMap || this.airExposureMap.length !== this.cells.length) {
      this.airExposureDirty = true;
      this.airExposureDirtyDeferred = false;
      this.airExposureRebuildAt = 0;
      return;
    }
    const delay = Math.max(0, TERRAIN_LIGHTING.airExposureRebuildDelay ?? 0.75);
    this.airExposureDirty = true;
    this.airExposureDirtyDeferred = true;
    this.airExposureRebuildAt = this.getClockNow() + delay * 1000;
  }

  invalidateSurfaceRadiusLookupNear(col, row, spread = 5) {
    if (!this.surfaceRadiusLookupCache?.size || !this.isInside(col, row)) return;
    const x = col * this.cellSize + this.cellSize * 0.5 - this.planetCenterX;
    const y = row * this.cellSize + this.cellSize * 0.5 - this.planetCenterY;
    const angle = (Math.atan2(y, x) + Math.PI * 2) % (Math.PI * 2);
    const bucket = Math.round((angle / (Math.PI * 2)) * 720);
    for (let offset = -spread; offset <= spread; offset += 1) {
      this.surfaceRadiusLookupCache.delete((bucket + offset + 720) % 720);
    }
  }

  getCell(col, row) {
    if (!this.isInside(col, row)) return 0;
    return this.cells[this.index(col, row)];
  }

  isConstructedMaterial(materialId) {
    return CONSTRUCTED_MATERIAL_IDS.has(Number(materialId) || 0);
  }

  isConstructedCell(col, row) {
    return this.isConstructedMaterial(this.getCell(col, row));
  }

  isNaturalSolidCell(col, row) {
    const material = this.getCell(col, row);
    return material > 0 && !this.isConstructedMaterial(material);
  }

  setCell(col, row, value, { autoWall = false } = {}) {
    return this.blockSystem.setCell(col, row, value, { autoWall });
  }

  clearContourRenderCaches({ rough = true } = {}) {
    this.contourCache?.clear();
    this.contourCacheStale = false;
    if (!rough) return;
    this.roughEdgeCache?.clear();
    this.roughContourCache?.clear();
    this.roughContourCacheStale = false;
  }

  markContourRenderCachesStale({ rough = true } = {}) {
    this.contourCacheStale = true;
    if (rough) this.roughContourCacheStale = true;
  }

  flushStaleContourRenderCaches() {
    if (!this.contourCacheStale && !this.roughContourCacheStale) return;
    const debug = this.beginTerrainRebuildDebug('outline/contour cache flush', {
      fullPlanetRebuild: true,
      fromMining: this.isRecentMiningEdit(),
    });
    if (this.contourCacheStale) {
      this.contourCache?.clear();
      this.contourCacheStale = false;
    }
    if (this.roughContourCacheStale) {
      this.roughEdgeCache?.clear();
      this.roughContourCache?.clear();
      this.roughContourCacheStale = false;
    }
    this.finishTerrainRebuildDebug(debug, {
      tilesProcessed: this.countCellsInBounds(null),
      chunksRebuilt: this.countChunksForBounds(null),
      fullPlanetRebuild: true,
      fromMining: this.isRecentMiningEdit(),
    });
  }

  invalidateTerrainGeometry({ keepSurfacePath = false } = {}) {
    this.clearContourRenderCaches();
    this.collisionContours = null;
    if (!keepSurfacePath) {
      this.surfaceRadiusLookupCache?.clear();
      this.markAirExposureDirty({ defer: false });
      this.surfacePathCache = null;
    }
  }

  invalidateEditedTerrainGeometry({
    keepSurfacePath = true,
    previousMaterial = 0,
    nextMaterial = 0,
  } = {}) {
    return this.blockSystem.invalidateEditedTerrainGeometry({ keepSurfacePath, previousMaterial, nextMaterial });
  }

  markLightingOverlayDirty({ defer = true, delayMs = 180, bounds = null, full = false } = {}) {
    return this.shadowSystem.markDirty({ defer, delayMs, bounds, full });
  }

  getDamageRatio(col, row, materialOverride = null) {
    if (!this.isInside(col, row)) return 0;
    const material = materialOverride || this.getCell(col, row);
    const data = TERRAIN_MATERIALS[material];
    if (!data?.hardness) return 0;
    return clamp01(this.damage[this.index(col, row)] / data.hardness);
  }

  getMaterialLightRadiusPixels(materialId) {
    const light = this.getMaterialLight?.(materialId);
    if (!light) return 0;
    return Math.max(this.cellSize * 1.5, (light.radius || 0) * this.cellSize);
  }

  getLocalRedrawPaddingPixels(...materialIds) {
    return this.blockSystem.getLocalRedrawPaddingPixels(...materialIds);
  }

  isRoughnessOutlineOnly() {
    return TERRAIN_ROUGHNESS.outlineOnly === true;
  }

  getDirtyPaddingCellsForMaterialChange(previousMaterial = 0, nextMaterial = 0) {
    return this.blockSystem.getDirtyPaddingCellsForMaterialChange(previousMaterial, nextMaterial);
  }

  getFastEditDirtyPaddingCells() {
    return this.blockSystem.getFastEditDirtyPaddingCells();
  }

  mergeBounds(target, source) {
    if (!source) return target;
    if (!target) return { ...source };
    target.minCol = Math.min(target.minCol, source.minCol);
    target.maxCol = Math.max(target.maxCol, source.maxCol);
    target.minRow = Math.min(target.minRow, source.minRow);
    target.maxRow = Math.max(target.maxRow, source.maxRow);
    return target;
  }

  expandCellBounds(bounds, padding = 0) {
    const resolvedPadding = Math.max(0, Math.ceil(padding));
    return {
      minCol: clamp(bounds.minCol - resolvedPadding, 0, this.cols - 1),
      maxCol: clamp(bounds.maxCol + resolvedPadding, 0, this.cols - 1),
      minRow: clamp(bounds.minRow - resolvedPadding, 0, this.rows - 1),
      maxRow: clamp(bounds.maxRow + resolvedPadding, 0, this.rows - 1),
    };
  }

  markDirtyBounds(bounds, padding = 0) {
    if (!bounds) return;
    const expanded = this.expandCellBounds(bounds, padding);
    this.markDirtyChunksForBounds(expanded);
    if (!this.dirtyBounds) {
      this.dirtyBounds = expanded;
      return;
    }
    this.mergeBounds(this.dirtyBounds, expanded);
  }

  markFastTerrainEdit(bounds, qualityPadding = 0, durationMs = 150) {
    if (!bounds) return;
    const now = this.getClockNow();
    this.fastTerrainRedrawUntil = Math.max(this.fastTerrainRedrawUntil || 0, now + durationMs);
    this.fastTerrainQualityBounds = this.mergeBounds(this.fastTerrainQualityBounds, bounds);
    this.fastTerrainQualityPadding = Math.max(this.fastTerrainQualityPadding || 0, qualityPadding || 0);
    this.fastTerrainQualityPending = true;
  }

  isFastTerrainRedrawActive(now = this.getClockNow()) {
    return now < (this.fastTerrainRedrawUntil || 0);
  }

  flushDeferredTerrainQualityRedraw(now = this.getClockNow()) {
    if (!this.fastTerrainQualityPending || this.isFastTerrainRedrawActive(now)) return;
    if (!this.fastTerrainQualityBounds) {
      this.fastTerrainQualityPending = false;
      this.fastTerrainQualityPadding = 0;
      return;
    }
    this.markDirtyBounds(this.fastTerrainQualityBounds, Math.max(3, this.fastTerrainQualityPadding || 0));
    this.renderDirty = true;
    this.fastTerrainQualityBounds = null;
    this.fastTerrainQualityPadding = 0;
    this.fastTerrainQualityPending = false;
  }

  markDirtyCell(col, row, padding = null) {
    const resolvedPadding = Number.isFinite(padding)
      ? Math.max(1, Math.ceil(padding))
      : this.getDirtyPaddingCellsForMaterialChange(this.getCell(col, row), this.getCell(col, row));
    const bounds = {
      minCol: clamp(col - resolvedPadding, 0, this.cols - 1),
      maxCol: clamp(col + resolvedPadding, 0, this.cols - 1),
      minRow: clamp(row - resolvedPadding, 0, this.rows - 1),
      maxRow: clamp(row + resolvedPadding, 0, this.rows - 1),
    };
    this.markDirtyChunksForBounds(bounds);
    if (!this.dirtyBounds) {
      this.dirtyBounds = bounds;
      return;
    }
    this.dirtyBounds.minCol = Math.min(this.dirtyBounds.minCol, bounds.minCol);
    this.dirtyBounds.maxCol = Math.max(this.dirtyBounds.maxCol, bounds.maxCol);
    this.dirtyBounds.minRow = Math.min(this.dirtyBounds.minRow, bounds.minRow);
    this.dirtyBounds.maxRow = Math.max(this.dirtyBounds.maxRow, bounds.maxRow);
  }

  isSolidCell(col, row) {
    return this.getCell(col, row) > 0;
  }

  getWallCell(col, row) {
    if (!this.wallConfig.enabled) return 0;
    return this.wallSystem.getCell(col, row);
  }

  setWallCell(col, row, value) {
    if (!this.wallConfig.enabled) return false;
    return this.wallSystem.setCell(col, row, value);
  }

  isWallCell(col, row) {
    if (!this.wallConfig.enabled) return false;
    return this.wallSystem.isCell(col, row);
  }

  getWallTypeForTile(col, row, fallbackMaterial = 1) {
    return this.wallSystem.getTypeForTile(col, row, fallbackMaterial);
  }

  generateWallLayerForPlanet() {
    const result = this.wallSystem.generateLayerForPlanet();
    this.wallLayerVersion = TERRAIN_WALL_LAYER_VERSION;
    return result;
  }

  repairNaturalWallLayerForPlanet() {
    return this.wallSystem.repairNaturalLayerForPlanet();
  }

  isCollisionSolidSample(col, row) {
    return this.isSolidCell(col, row);
  }

  getCollisionContours() {
    if (!this.collisionContours) {
      this.collisionContours = this.buildContourLoops(
        (col, row) => this.isCollisionSolidSample(col, row),
        COLLISION_CONTOUR_OPTIONS,
      );
    }
    return this.collisionContours;
  }

  forEachCollisionPolygonInAabb(left, top, right, bottom, callback) {
    const size = this.getContourStep(COLLISION_CONTOUR_OPTIONS);
    const minCol = clamp(Math.floor(left / size) - 2, 0, Math.max(0, Math.ceil(this.width / size) - 1));
    const maxCol = clamp(Math.floor(right / size) + 2, 0, Math.max(0, Math.ceil(this.width / size) - 1));
    const minRow = clamp(Math.floor(top / size) - 2, 0, Math.max(0, Math.ceil(this.height / size) - 1));
    const maxRow = clamp(Math.floor(bottom / size) + 2, 0, Math.max(0, Math.ceil(this.height / size) - 1));
    const predicate = (x, y) => this.isSolidCell(x, y);
    const sample = (x, y) => this.sampleContourNode(predicate, x, y, size, COLLISION_CONTOUR_OPTIONS);
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        const marchingIndex = this.getMarchingIndex(col, row, sample);
        const polygons = FILL_POLYGONS[marchingIndex];
        if (!polygons?.length) continue;
        const x = col * size;
        const y = row * size;
        for (const polygon of polygons) {
          const points = polygon.map((pointName) => {
            const point = POINTS[pointName];
            return { x: x + point[0] * size, y: y + point[1] * size };
          });
          const minX = Math.min(...points.map((point) => point.x));
          const maxX = Math.max(...points.map((point) => point.x));
          const minY = Math.min(...points.map((point) => point.y));
          const maxY = Math.max(...points.map((point) => point.y));
          if (maxX < left || minX > right || maxY < top || minY > bottom) continue;
          if (callback(points, col, row, marchingIndex) === true) return true;
        }
      }
    }
    return false;
  }

  containsCollisionPoint(x, y) {
    return this.isPointInsideCollisionContours(x, y);
  }

  isPointInsideCollisionContours(x, y) {
    if (x < 0 || x > this.width || y < 0 || y > this.height) return false;
    return this.samplePredicateDensity(
      (col, row) => this.isCollisionSolidSample(col, row),
      x,
      y,
      COLLISION_CONTOUR_OPTIONS,
    ) >= (COLLISION_CONTOUR_OPTIONS.densityThreshold ?? 0.5);
  }

  intersectsCollisionShape(shape) {
    if (!shape?.corners?.length) return false;
    const shapeBounds = contourBounds(shape.corners);
    const shapeEdges = shape.corners.map((point, index) => ({
      a: point,
      b: shape.corners[(index + 1) % shape.corners.length],
    }));

    return this.forEachCollisionPolygonInAabb(
      shapeBounds.minX - 2,
      shapeBounds.minY - 2,
      shapeBounds.maxX + 2,
      shapeBounds.maxY + 2,
      (points) => {
        if (shape.corners.some((corner) => pointInPolygon(corner.x, corner.y, points))) return true;
        if (points.some((point) => pointInOrientedBox(point, shape))) return true;
        for (let index = 0; index < points.length; index += 1) {
          const a = points[index];
          const b = points[(index + 1) % points.length];
          for (const edge of shapeEdges) {
            if (segmentIntersectsSegment(a, b, edge.a, edge.b)) return true;
          }
        }
        return false;
      },
    ) === true;
  }

  cellFromWorld(x, y) {
    return {
      col: Math.floor(x / this.cellSize),
      row: Math.floor(y / this.cellSize),
    };
  }

  createPlacementPad(worldX, worldY, {
    viewRotation = 0,
    width = 96,
    clearance = 74,
    depth = 42,
    material = null,
  } = {}) {
    const size = this.cellSize;
    const outwardAngle = -Math.PI / 2 - viewRotation;
    const outward = { x: Math.cos(outwardAngle), y: Math.sin(outwardAngle) };
    const inward = { x: -outward.x, y: -outward.y };
    const tangent = { x: -outward.y, y: outward.x };
    const halfWidth = width * 0.5;
    const center = this.cellFromWorld(worldX, worldY);
    const sourceMaterial = material || this.getCell(center.col, center.row) || 1;
    const searchCells = Math.ceil((halfWidth + clearance + depth + size * 2) / size);
    let changed = false;

    for (let row = center.row - searchCells; row <= center.row + searchCells; row += 1) {
      for (let col = center.col - searchCells; col <= center.col + searchCells; col += 1) {
        if (!this.isInside(col, row)) continue;
        const pointX = col * size;
        const pointY = row * size;
        const dx = pointX - worldX;
        const dy = pointY - worldY;
        const along = dx * tangent.x + dy * tangent.y;
        if (Math.abs(along) > halfWidth + size * 0.35) continue;

        const outwardDistance = dx * outward.x + dy * outward.y;
        const inwardDistance = dx * inward.x + dy * inward.y;
        if (outwardDistance > 0 && outwardDistance <= clearance) {
          if (this.getCell(col, row) !== 0) {
            this.setCell(col, row, 0);
            changed = true;
          }
          continue;
        }
        if (inwardDistance >= -size * 0.25 && inwardDistance <= depth) {
          if (this.getCell(col, row) !== sourceMaterial) {
            this.setCell(col, row, sourceMaterial);
            changed = true;
          }
        }
      }
    }

    const flagInset = Math.max(2, size * 0.12);
    return {
      x: worldX + outward.x * flagInset,
      y: worldY + outward.y * flagInset,
      col: center.col,
      row: center.row,
      material: sourceMaterial,
      changed,
      outward,
      tangent,
      width,
    };
  }

  findSurfaceRow(col) {
    const safeCol = clamp(col, 0, this.cols - 1);
    for (let row = 0; row < this.rows; row += 1) {
      if (this.isSolidCell(safeCol, row)) return row;
    }
    return null;
  }

  findLastSolidRow(col) {
    const safeCol = clamp(col, 0, this.cols - 1);
    for (let row = this.rows - 1; row >= 0; row -= 1) {
      if (this.isSolidCell(safeCol, row)) return row;
    }
    return null;
  }

  getSurfaceY(x) {
    return this.getFloorYAt(x, 0, this.height) ?? (this.height - this.cellSize);
  }

  getSurfaceRadiusAtAngle(angle) {
    const maxRadius = Math.min(this.width, this.height) * 0.52;
    const step = Math.max(4, this.cellSize * 0.45);
    for (let radius = maxRadius; radius >= 0; radius -= step) {
      const x = this.planetCenterX + Math.cos(angle) * radius;
      const y = this.planetCenterY + Math.sin(angle) * radius;
      const { col, row } = this.cellFromWorld(x, y);
      if (this.isSolidCell(col, row)) return radius;
    }
    return this.planetRadius;
  }

  getSurfacePointAtAngle(angle, offset = 0) {
    const radius = this.getSurfaceRadiusAtAngle(angle) + offset;
    return {
      x: this.planetCenterX + Math.cos(angle) * radius,
      y: this.planetCenterY + Math.sin(angle) * radius,
      radius,
    };
  }

  getSurfacePath() {
    if (this.surfacePathCache) return this.surfacePathCache;
    const loops = this.getContourLoops((col, row) => this.isSolidCell(col, row), 'solid');
    let bestLoop = null;
    let bestArea = -Infinity;
    for (const loop of loops) {
      const area = Math.abs(this.getPathArea(loop.points));
      if (area > bestArea) {
        bestArea = area;
        bestLoop = loop;
      }
    }
    const points = bestLoop?.points?.length ? bestLoop.points.map((point) => ({ x: point.x, y: point.y })) : [];
    const cumulative = [0];
    let length = 0;
    for (let index = 0; index < points.length; index += 1) {
      const a = points[index];
      const b = points[(index + 1) % points.length];
      length += Math.hypot(b.x - a.x, b.y - a.y);
      cumulative.push(length);
    }
    this.surfacePathCache = { points, cumulative, length };
    return this.surfacePathCache;
  }

  getPathArea(points) {
    let area = 0;
    for (let index = 0; index < points.length; index += 1) {
      const a = points[index];
      const b = points[(index + 1) % points.length];
      area += a.x * b.y - b.x * a.y;
    }
    return area * 0.5;
  }

  wrapSurfaceDistance(distance) {
    const path = this.getSurfacePath();
    if (!path.length) return 0;
    return ((distance % path.length) + path.length) % path.length;
  }

  sampleSurfacePath(distance = 0, offset = 0) {
    const path = this.getSurfacePath();
    const { points, cumulative, length } = path;
    if (!points.length || length <= 0) {
      return { x: this.planetCenterX, y: this.planetCenterY, tangent: { x: 1, y: 0 }, outward: { x: 0, y: -1 }, distance: 0 };
    }
    const wrapped = this.wrapSurfaceDistance(distance);
    let segmentIndex = 0;
    while (segmentIndex < points.length - 1 && cumulative[segmentIndex + 1] < wrapped) segmentIndex += 1;
    const a = points[segmentIndex];
    const b = points[(segmentIndex + 1) % points.length];
    const segmentLength = Math.max(0.001, cumulative[segmentIndex + 1] - cumulative[segmentIndex]);
    const t = clamp01((wrapped - cumulative[segmentIndex]) / segmentLength);
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const tx = (b.x - a.x) / segmentLength;
    const ty = (b.y - a.y) / segmentLength;
    const cx = x - this.planetCenterX;
    const cy = y - this.planetCenterY;
    const centerDistance = Math.hypot(cx, cy) || 1;
    const outward = { x: cx / centerDistance, y: cy / centerDistance };
    return {
      x: x + outward.x * offset,
      y: y + outward.y * offset,
      surfaceX: x,
      surfaceY: y,
      tangent: { x: tx, y: ty },
      outward,
      angle: Math.atan2(outward.y, outward.x),
      distance: wrapped,
    };
  }

  getClosestSurfacePathDistance(x, y) {
    const path = this.getSurfacePath();
    const { points, cumulative, length } = path;
    if (!points.length || length <= 0) return 0;
    let bestDistance = 0;
    let bestDistanceSq = Infinity;
    for (let index = 0; index < points.length; index += 1) {
      const a = points[index];
      const b = points[(index + 1) % points.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const segmentLengthSq = dx * dx + dy * dy || 1;
      const t = clamp(((x - a.x) * dx + (y - a.y) * dy) / segmentLengthSq, 0, 1);
      const px = a.x + dx * t;
      const py = a.y + dy * t;
      const qx = x - px;
      const qy = y - py;
      const distanceSq = qx * qx + qy * qy;
      if (distanceSq >= bestDistanceSq) continue;
      bestDistanceSq = distanceSq;
      bestDistance = cumulative[index] + Math.sqrt(segmentLengthSq) * t;
    }
    return this.wrapSurfaceDistance(bestDistance);
  }

  getClosestTerrainSurfacePoint(x, y, offset = 0) {
    return this.getClosestSurfacePointWithOptions(
      x,
      y,
      offset,
      VISUAL_CONTOUR_OPTIONS,
      (col, row) => this.isSolidCell(col, row),
    );
  }

  getClosestCollisionSurfacePoint(x, y, offset = 0) {
    return this.getClosestSurfacePointWithOptions(
      x,
      y,
      offset,
      COLLISION_CONTOUR_OPTIONS,
      (col, row) => this.isCollisionSolidSample(col, row),
    );
  }

  getClosestSurfacePointWithOptions(x, y, offset = 0, options = VISUAL_CONTOUR_OPTIONS, predicate = (col, row) => this.isSolidCell(col, row)) {
    const step = this.getContourStep(options);
    const searchRadius = Math.max(this.cellSize * 8, Math.abs(offset) + this.cellSize * 5);
    const minCol = clamp(Math.floor((x - searchRadius) / step), 0, Math.max(0, Math.ceil(this.width / step) - 1));
    const maxCol = clamp(Math.ceil((x + searchRadius) / step), 0, Math.max(0, Math.ceil(this.width / step) - 1));
    const minRow = clamp(Math.floor((y - searchRadius) / step), 0, Math.max(0, Math.ceil(this.height / step) - 1));
    const maxRow = clamp(Math.ceil((y + searchRadius) / step), 0, Math.max(0, Math.ceil(this.height / step) - 1));
    const sample = (col, row) => this.sampleContourNode(predicate, col, row, step, options);
    let best = null;
    let bestDistanceSq = Infinity;
    const testSegment = (a, b) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const segmentLengthSq = dx * dx + dy * dy || 1;
      const t = clamp(((x - a.x) * dx + (y - a.y) * dy) / segmentLengthSq, 0, 1);
      const px = a.x + dx * t;
      const py = a.y + dy * t;
      const qx = x - px;
      const qy = y - py;
      const distanceSq = qx * qx + qy * qy;
      if (distanceSq >= bestDistanceSq) return;
      const segmentLength = Math.sqrt(segmentLengthSq) || 1;
      bestDistanceSq = distanceSq;
      best = {
        surfaceX: px,
        surfaceY: py,
        tangent: { x: dx / segmentLength, y: dy / segmentLength },
        queryVector: { x: qx, y: qy },
      };
    };
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        const marchingIndex = this.getMarchingIndex(col, row, sample);
        const segments = EDGE_SEGMENTS[marchingIndex];
        if (!segments?.length) continue;
        const originX = col * step;
        const originY = row * step;
        for (const segment of segments) {
          const a = POINTS[segment[0]];
          const b = POINTS[segment[1]];
          testSegment(
            { x: originX + a[0] * step, y: originY + a[1] * step },
            { x: originX + b[0] * step, y: originY + b[1] * step },
          );
        }
      }
    }
    if (!best) return null;
    let normalX = best.queryVector.x;
    let normalY = best.queryVector.y;
    const queryDistance = Math.hypot(normalX, normalY);
    if (queryDistance > 0.001) {
      normalX /= queryDistance;
      normalY /= queryDistance;
    } else {
      normalX = -best.tangent.y;
      normalY = best.tangent.x;
    }
    let finalX = best.surfaceX + normalX * offset;
    let finalY = best.surfaceY + normalY * offset;
    if (this.containsCollisionPoint(finalX, finalY)) {
      normalX *= -1;
      normalY *= -1;
      finalX = best.surfaceX + normalX * offset;
      finalY = best.surfaceY + normalY * offset;
    }
    return {
      x: finalX,
      y: finalY,
      surfaceX: best.surfaceX,
      surfaceY: best.surfaceY,
      tangent: best.tangent,
      normal: { x: normalX, y: normalY },
      distanceSq: bestDistanceSq,
    };
  }

  getFloorYAt(x, startY = 0, maxDistance = this.height) {
    const colFloat = clamp(x / this.cellSize, 0, this.cols - 1);
    const col0 = clamp(Math.floor(colFloat), 0, this.cols - 1);
    const col1 = clamp(col0 + 1, 0, this.cols - 1);
    const t = smoothStep(colFloat - col0);
    const startRow = clamp(Math.floor(startY / this.cellSize), 0, this.rows - 1);
    const endRow = clamp(Math.ceil((startY + maxDistance) / this.cellSize), 0, this.rows - 1);
    const row0 = this.findFirstSolidRowFrom(col0, startRow, endRow);
    const row1 = this.findFirstSolidRowFrom(col1, startRow, endRow);
    if (row0 === null && row1 === null) return null;
    if (row0 === null) return row1 * this.cellSize;
    if (row1 === null) return row0 * this.cellSize;
    return (row0 + (row1 - row0) * t) * this.cellSize;
  }

  findFirstSolidRowFrom(col, startRow, endRow) {
    for (let row = startRow; row <= endRow; row += 1) {
      if (this.isSolidCell(col, row)) return row;
    }
    return null;
  }

  sampleGroundY(left, right, probeTop, probeBottom) {
    const samples = [left, (left + right) * 0.5, right];
    let groundY = null;
    for (const x of samples) {
      const y = this.getFloorYAt(x, probeTop, Math.max(1, probeBottom - probeTop));
      if (y === null || y < probeTop - 0.5 || y > probeBottom + 0.5) continue;
      groundY = groundY === null ? y : Math.min(groundY, y);
    }
    return groundY;
  }

  collidesAabb(left, top, right, bottom) {
    if (right < 0 || left > this.width || bottom < 0 || top > this.height) return false;
    const shape = {
      centerX: (left + right) * 0.5,
      centerY: (top + bottom) * 0.5,
      axisX: { x: 1, y: 0 },
      axisY: { x: 0, y: 1 },
      halfWidth: Math.max(0, (right - left) * 0.5),
      halfHeight: Math.max(0, (bottom - top) * 0.5),
      corners: [
        { x: left, y: top },
        { x: right, y: top },
        { x: right, y: bottom },
        { x: left, y: bottom },
      ],
    };
    return this.intersectsCollisionShape(shape);
  }

  raycast(startX, startY, endX, endY) {
    const contourHit = this.raycastContourSurface(startX, startY, endX, endY);
    if (contourHit) return contourHit;
    const surfaceHit = this.raycastMarchingSurface(startX, startY, endX, endY);
    if (surfaceHit) return surfaceHit;
    return this.raycastSampledCells(startX, startY, endX, endY);
  }

  raycastCollision(startX, startY, endX, endY) {
    const contourHit = this.raycastContourSurfaceWithOptions(
      startX,
      startY,
      endX,
      endY,
      COLLISION_CONTOUR_OPTIONS,
      (col, row) => this.isCollisionSolidSample(col, row),
    );
    if (contourHit) return contourHit;
    return this.raycastMarchingSurface(startX, startY, endX, endY);
  }

  raycastContourSurface(startX, startY, endX, endY) {
    return this.raycastContourSurfaceWithOptions(
      startX,
      startY,
      endX,
      endY,
      VISUAL_CONTOUR_OPTIONS,
      (col, row) => this.isSolidCell(col, row),
    );
  }

  raycastContourSurfaceWithOptions(startX, startY, endX, endY, options = VISUAL_CONTOUR_OPTIONS, predicate = (col, row) => this.isSolidCell(col, row)) {
    const dx = endX - startX;
    const dy = endY - startY;
    const distance = Math.hypot(dx, dy);
    if (distance <= 0.001) return null;
    const step = this.getContourStep(options);
    const minCol = clamp(Math.floor((Math.min(startX, endX) - this.cellSize) / step), 0, Math.max(0, Math.ceil(this.width / step) - 1));
    const maxCol = clamp(Math.ceil((Math.max(startX, endX) + this.cellSize) / step), 0, Math.max(0, Math.ceil(this.width / step) - 1));
    const minRow = clamp(Math.floor((Math.min(startY, endY) - this.cellSize) / step), 0, Math.max(0, Math.ceil(this.height / step) - 1));
    const maxRow = clamp(Math.ceil((Math.max(startY, endY) + this.cellSize) / step), 0, Math.max(0, Math.ceil(this.height / step) - 1));
    const sample = (col, row) => this.sampleContourNode(predicate, col, row, step, options);
    let best = null;
    let bestT = Infinity;

    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        const marchingIndex = this.getMarchingIndex(col, row, sample);
        const polygons = FILL_POLYGONS[marchingIndex];
        if (!polygons?.length) continue;
        const originX = col * step;
        const originY = row * step;
        for (const polygon of polygons) {
          const points = polygon.map((pointName) => {
            const point = POINTS[pointName];
            return { x: originX + point[0] * step, y: originY + point[1] * step };
          });
          const hit = getSegmentPolygonHit(startX, startY, endX, endY, points);
          if (!hit || hit.t >= bestT) continue;
          const cell = this.getRaycastCellNearPoint(hit.x, hit.y);
          if (!cell) continue;
          bestT = hit.t;
          best = {
            x: hit.x,
            y: hit.y,
            col: cell.col,
            row: cell.row,
            material: cell.material,
            distance: hit.t * distance,
            data: TERRAIN_MATERIALS[cell.material],
          };
        }
      }
    }
    return best;
  }

  getRaycastCellNearPoint(hitX, hitY, searchRadius = 2) {
    const center = this.cellFromWorld(hitX, hitY);
    let best = null;
    let bestDistance = Infinity;
    for (let row = center.row - searchRadius; row <= center.row + searchRadius; row += 1) {
      for (let col = center.col - searchRadius; col <= center.col + searchRadius; col += 1) {
        const material = this.getCell(col, row);
        if (material <= 0) continue;
        const left = col * this.cellSize;
        const top = row * this.cellSize;
        const distanceToCell = getPointAabbDistance(hitX, hitY, left, top, left + this.cellSize, top + this.cellSize);
        if (distanceToCell >= bestDistance) continue;
        bestDistance = distanceToCell;
        best = { col, row, material };
      }
    }
    return best;
  }

  raycastMarchingSurface(startX, startY, endX, endY) {
    const dx = endX - startX;
    const dy = endY - startY;
    const distance = Math.hypot(dx, dy);
    if (distance <= 0.001) return null;
    const size = this.cellSize;
    const minCol = clamp(Math.floor((Math.min(startX, endX) - size) / size), 0, this.cols - 2);
    const maxCol = clamp(Math.ceil((Math.max(startX, endX) + size) / size), 0, this.cols - 2);
    const minRow = clamp(Math.floor((Math.min(startY, endY) - size) / size), 0, this.rows - 2);
    const maxRow = clamp(Math.ceil((Math.max(startY, endY) + size) / size), 0, this.rows - 2);
    let best = null;
    let bestT = Infinity;

    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        const marchingIndex = this.getMarchingIndex(col, row, (x, y) => this.isSolidCell(x, y));
        const polygons = FILL_POLYGONS[marchingIndex];
        if (!polygons?.length) continue;
        const originX = col * size;
        const originY = row * size;
        for (const polygon of polygons) {
          const points = polygon.map((pointName) => {
            const point = POINTS[pointName];
            return { x: originX + point[0] * size, y: originY + point[1] * size };
          });
          const hit = getSegmentPolygonHit(startX, startY, endX, endY, points);
          if (!hit || hit.t >= bestT) continue;
          const cell = this.getRaycastCellFromMarchingCell(col, row, hit.x, hit.y);
          if (!cell) continue;
          bestT = hit.t;
          best = {
            x: hit.x,
            y: hit.y,
            col: cell.col,
            row: cell.row,
            material: cell.material,
            distance: hit.t * distance,
            data: TERRAIN_MATERIALS[cell.material],
          };
        }
      }
    }
    return best;
  }

  getRaycastCellFromMarchingCell(col, row, hitX, hitY) {
    const candidates = [
      { col, row },
      { col: col + 1, row },
      { col: col + 1, row: row + 1 },
      { col, row: row + 1 },
    ];
    let best = null;
    let bestDistanceSq = Infinity;
    for (const candidate of candidates) {
      const material = this.getCell(candidate.col, candidate.row);
      if (material <= 0) continue;
      const dx = candidate.col * this.cellSize - hitX;
      const dy = candidate.row * this.cellSize - hitY;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq >= bestDistanceSq) continue;
      bestDistanceSq = distanceSq;
      best = { ...candidate, material };
    }
    return best;
  }

  raycastSampledCells(startX, startY, endX, endY) {
    const dx = endX - startX;
    const dy = endY - startY;
    const distance = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(distance / Math.max(2, this.cellSize * 0.14)));
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const x = startX + dx * t;
      const y = startY + dy * t;
      const { col, row } = this.cellFromWorld(x, y);
      const material = this.getCell(col, row);
      if (material > 0) {
        return {
          x,
          y,
          col,
          row,
          material,
          distance: t * distance,
          data: TERRAIN_MATERIALS[material],
        };
      }
    }
    return null;
  }

  mineCircle(worldX, worldY, radius, power, delta, options = {}) {
    return this.blockSystem.mineCircle(worldX, worldY, radius, power, delta, options);
  }

  getCellShapePoints(col, row, { scale = 1, offsetX = 0, offsetY = 0 } = {}) {
    const size = this.cellSize;
    const half = size * 0.5 * scale;
    const bevel = size * 0.14 * scale;
    const cornerCut = size * 0.38 * scale;
    const centerX = col * size + size * 0.5 + offsetX;
    const centerY = row * size + size * 0.5 + offsetY;
    const exposedUp = !this.isSolidCell(col, row - 1);
    const exposedRight = !this.isSolidCell(col + 1, row);
    const exposedDown = !this.isSolidCell(col, row + 1);
    const exposedLeft = !this.isSolidCell(col - 1, row);
    const cutTl = exposedUp && exposedLeft ? cornerCut : exposedUp || exposedLeft ? bevel : 0;
    const cutTr = exposedUp && exposedRight ? cornerCut : exposedUp || exposedRight ? bevel : 0;
    const cutBr = exposedDown && exposedRight ? cornerCut : exposedDown || exposedRight ? bevel : 0;
    const cutBl = exposedDown && exposedLeft ? cornerCut : exposedDown || exposedLeft ? bevel : 0;
    const top = centerY - half;
    const right = centerX + half;
    const bottom = centerY + half;
    const left = centerX - half;
    return [
      { x: left + cutTl, y: top },
      { x: right - cutTr, y: top },
      { x: right, y: top + cutTr },
      { x: right, y: bottom - cutBr },
      { x: right - cutBr, y: bottom },
      { x: left + cutBl, y: bottom },
      { x: left, y: bottom - cutBl },
      { x: left, y: top + cutTl },
    ];
  }

  traceCellShape(ctx, col, row, options = {}) {
    const points = this.getCellShapePoints(col, row, options);
    if (!points.length) return;
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index].x, points[index].y);
    ctx.closePath();
  }

  getCellSurfaceContourSegments(col, row) {
    const size = this.getContourStep(VISUAL_CONTOUR_OPTIONS);
    const cellSize = this.cellSize;
    const bounds = {
      minX: col * cellSize - cellSize * 0.08,
      minY: row * cellSize - cellSize * 0.08,
      maxX: (col + 1) * cellSize + cellSize * 0.08,
      maxY: (row + 1) * cellSize + cellSize * 0.08,
    };
    const segments = [];
    const minCol = clamp(Math.floor(bounds.minX / size) - 1, 0, Math.max(0, Math.ceil(this.width / size) - 1));
    const maxCol = clamp(Math.floor(bounds.maxX / size) + 1, 0, Math.max(0, Math.ceil(this.width / size) - 1));
    const minRow = clamp(Math.floor(bounds.minY / size) - 1, 0, Math.max(0, Math.ceil(this.height / size) - 1));
    const maxRow = clamp(Math.floor(bounds.maxY / size) + 1, 0, Math.max(0, Math.ceil(this.height / size) - 1));
    const predicate = (x, y) => this.isSolidCell(x, y);
    const sample = (x, y) => this.sampleContourNode(predicate, x, y, size, VISUAL_CONTOUR_OPTIONS);
    const addSegment = (a, b) => {
      const midX = (a.x + b.x) * 0.5;
      const midY = (a.y + b.y) * 0.5;
      if (midX < bounds.minX || midX > bounds.maxX || midY < bounds.minY || midY > bounds.maxY) return;
      segments.push({ a, b });
    };

    for (let marchingRow = minRow; marchingRow <= maxRow; marchingRow += 1) {
      for (let marchingCol = minCol; marchingCol <= maxCol; marchingCol += 1) {
        const index = this.getMarchingIndex(marchingCol, marchingRow, sample);
        const edgeSegments = EDGE_SEGMENTS[index];
        if (!edgeSegments?.length) continue;
        const originX = marchingCol * size;
        const originY = marchingRow * size;
        for (const segment of edgeSegments) {
          const start = POINTS[segment[0]];
          const end = POINTS[segment[1]];
          addSegment(
            { x: originX + start[0] * size, y: originY + start[1] * size },
            { x: originX + end[0] * size, y: originY + end[1] * size },
          );
        }
      }
    }
    return segments;
  }

  drawCellSurfaceContourSegments(ctx, col, row, time, color) {
    const segments = this.getCellSurfaceContourSegments(col, row);
    if (!segments.length) return false;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.6, this.cellSize * 0.12);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([this.cellSize * 0.32, this.cellSize * 0.18]);
    ctx.lineDashOffset = -time * 22;
    ctx.beginPath();
    for (const segment of segments) {
      ctx.moveTo(segment.a.x, segment.a.y);
      ctx.lineTo(segment.b.x, segment.b.y);
    }
    ctx.stroke();
    ctx.restore();
    return true;
  }

  getCellPickupChip(col, row, materialId) {
    const data = TERRAIN_MATERIALS[materialId] || TERRAIN_MATERIALS[1];
    const centerX = col * this.cellSize + this.cellSize * 0.5;
    const centerY = row * this.cellSize + this.cellSize * 0.5;
    const normalizePoint = (point) => ({
      x: (point.x - centerX) / Math.max(1, this.cellSize * 0.5),
      y: (point.y - centerY) / Math.max(1, this.cellSize * 0.5),
    });
    return {
      terrainMaterial: materialId,
      color: data.color || '#6b625a',
      edge: data.edge || '#91867a',
      darkEdge: 'rgba(5, 11, 19, 0.74)',
      size: this.cellSize,
      darkLineWidth: Math.max(3.2, this.cellSize * 0.24),
      lineWidth: Math.max(1.4, this.cellSize * 0.11),
      points: this.getCellShapePoints(col, row).map(normalizePoint),
      surfaceSegments: this.getCellSurfaceContourSegments(col, row).map((segment) => ({
        a: normalizePoint(segment.a),
        b: normalizePoint(segment.b),
      })),
    };
  }

  drawDamageFeedback(ctx, feedback, time = 0) {
    if (!feedback) return;
    const materialId = feedback.material || this.getCell(feedback.col, feedback.row);
    const data = TERRAIN_MATERIALS[materialId] || TERRAIN_MATERIALS[1];
    const ratio = clamp01(feedback.ratio ?? this.getDamageRatio(feedback.col, feedback.row, materialId));
    if (ratio <= 0.01 && !feedback.blocked) return;

    const seed = feedback.col * 97.13 + feedback.row * 41.77 + this.seed * 0.013;
    const shakePower = feedback.blocked ? 1.5 : 0.55 + ratio * 2.8;
    const shakeX = Math.sin(time * 82 + seed) * shakePower;
    const shakeY = Math.cos(time * 91 + seed * 0.7) * shakePower;
    this.drawCellDamageOverlay(ctx, feedback.col, feedback.row, {
      materialId,
      ratio,
      blocked: feedback.blocked,
      time,
      shakeX,
      shakeY,
      glow: true,
    });
  }

  drawCellDamageOverlay(ctx, col, row, {
    materialId = this.getCell(col, row),
    ratio = this.getDamageRatio(col, row, materialId),
    blocked = false,
    time = 0,
    shakeX = 0,
    shakeY = 0,
    glow = false,
  } = {}) {
    const material = TERRAIN_MATERIALS[materialId] || TERRAIN_MATERIALS[1];
    const edgeColor = blocked ? '#ff756f' : (material.edge || '#ffd36b');
    const fillColor = mixHex(material.color || '#716b64', '#ffffff', blocked ? 0.1 : ratio * 0.18);
    const size = this.cellSize;
    ctx.save();
    ctx.translate(shakeX, shakeY);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (glow) {
      ctx.shadowColor = edgeColor;
      ctx.shadowBlur = blocked ? 8 : 5 + ratio * 13;
    }
    if (blocked) {
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = withAlpha(fillColor, 0.24);
      ctx.strokeStyle = withAlpha(edgeColor, 0.9);
      ctx.lineWidth = Math.max(1.4, size * 0.09);
      ctx.beginPath();
      this.traceCellShape(ctx, col, row, { scale: 1 + ratio * 0.035 });
      ctx.fill();
      ctx.stroke();
    }
    if (ratio > 0.1 || blocked) this.drawCellCracks(ctx, col, row, ratio, { time, blocked });
    ctx.restore();
  }

  drawCellCracks(ctx, col, row, ratio, { time = 0, blocked = false } = {}) {
    const size = this.cellSize;
    const centerX = col * size + size * 0.5;
    const centerY = row * size + size * 0.5;
    const seed = col * 97.13 + row * 41.77 + this.seed * 0.013;
    ctx.save();
    ctx.beginPath();
    this.traceCellShape(ctx, col, row, { scale: 0.92 });
    ctx.clip();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = blocked ? 0.45 : 0.26 + ratio * 0.62;
    ctx.strokeStyle = withAlpha('#150f10', blocked ? 0.62 : 0.48 + ratio * 0.38);
    ctx.lineWidth = Math.max(1, size * 0.055);
    const crackCount = Math.min(7, 1 + Math.floor(ratio * 7));
    for (let crack = 0; crack < crackCount; crack += 1) {
      const angle = seed * 0.04 + crack * 2.17 + Math.sin(time * 3.5 + crack) * 0.03;
      const start = size * (0.04 + Math.abs(signedNoise(seed + crack * 3.3)) * 0.08);
      const length = size * (0.16 + ratio * (0.2 + Math.abs(signedNoise(seed + crack * 11.1)) * 0.22));
      ctx.beginPath();
      ctx.moveTo(centerX + Math.cos(angle) * start, centerY + Math.sin(angle) * start);
      ctx.quadraticCurveTo(
        centerX + Math.cos(angle + 0.45) * length * 0.55,
        centerY + Math.sin(angle + 0.45) * length * 0.55,
        centerX + Math.cos(angle) * length,
        centerY + Math.sin(angle) * length,
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  draw(ctx, camera, viewportWidth, viewportHeight = this.height, options = {}) {
    const now = this.getClockNow();
    const nextRoughnessEnabled = TERRAIN_ROUGHNESS.enabled && options?.roughness !== false;
    const nextLightingEnabled = TERRAIN_LIGHTING.enabled && options?.lighting !== false;
    const nextLightingDebugEnabled = Boolean(options?.lightingDebug);
    const nextDepthDebugEnabled = Boolean(options?.depthDebug);
    if (nextRoughnessEnabled !== this.roughnessRenderEnabled) {
      this.roughnessRenderEnabled = nextRoughnessEnabled;
      this.renderDirty = true;
      this.fullRenderDirty = true;
    }
    if (
      nextLightingEnabled !== this.lightingRenderEnabled
      || nextLightingDebugEnabled !== this.lightingDebugEnabled
      || nextDepthDebugEnabled !== this.depthDebugEnabled
    ) {
      this.lightingRenderEnabled = nextLightingEnabled;
      this.lightingDebugEnabled = nextLightingDebugEnabled;
      this.depthDebugEnabled = nextDepthDebugEnabled;
      this.markLightingOverlayDirty({ defer: false });
    }
    this.flushDeferredTerrainQualityRedraw(now);
    if (this.progressivePrewarm) {
      this.processProgressivePrewarm({
        budgetMs: TERRAIN_TUNING.progressivePrewarmFrameBudgetMs ?? 3.5,
        maxChunks: TERRAIN_TUNING.progressivePrewarmChunksPerFrame ?? 3,
      });
    }
    if (!this.renderCanvas) {
      this.redrawTerrainCache({ now });
    } else if (this.renderDirty && !this.progressivePrewarm) {
      const fastActive = this.isFastTerrainRedrawActive(now);
      const interval = Math.max(16, TERRAIN_TUNING.fastMiningRedrawIntervalMs ?? 42);
      if (!fastActive || now >= (this.fastTerrainNextRedrawAt || 0)) {
        this.redrawTerrainCache({ now, fastRedraw: fastActive });
        if (fastActive) this.fastTerrainNextRedrawAt = now + interval;
      }
    }
    const sx = clamp(Math.floor(camera.x) - this.cellSize * 2, 0, Math.max(0, this.width - 1));
    const sy = clamp(Math.floor(camera.y) - this.cellSize * 2, 0, Math.max(0, this.height - 1));
    const sw = Math.min(this.width - sx, Math.ceil(viewportWidth) + this.cellSize * 4);
    const sh = Math.min(this.height - sy, Math.ceil(viewportHeight) + this.cellSize * 4);
    if (sw <= 0 || sh <= 0) return;
    ctx.save();
    ctx.drawImage(this.renderCanvas, sx, sy, sw, sh, sx - camera.x, sy, sw, sh);
    this.drawCachedDepthLightingOverlay(ctx, camera, { sx, sy, sw, sh });
    this.drawLiveDamageOverlays(ctx, camera, { sx, sy, sw, sh });
    ctx.restore();
  }

  redrawTerrainCache({ now = this.getClockNow(), fastRedraw = this.isFastTerrainRedrawActive(now) } = {}) {
    const canvas = this.getRenderCanvas();
    const ctx = this.renderCtx;
    const rebuildBounds = this.dirtyBounds ? { ...this.dirtyBounds } : null;
    const fullPlanetRebuild = Boolean(this.fullRenderDirty || !rebuildBounds);
    const chunksRebuilt = fullPlanetRebuild
      ? this.countChunksForBounds(null)
      : (this.dirtyChunks.size || this.countChunksForBounds(rebuildBounds));
    const debug = this.beginTerrainRebuildDebug('terrain visual rebuild', {
      bounds: rebuildBounds,
      chunksRebuilt,
      fullPlanetRebuild,
      fromMining: this.isRecentMiningEdit(now),
    });
    try {
      if (fullPlanetRebuild) {
        this.flushStaleContourRenderCaches();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        this.drawTerrainLayers(ctx);
      } else {
        this.redrawTerrainRegion(ctx, rebuildBounds, { fastRedraw });
      }
    } finally {
      this.finishTerrainRebuildDebug(debug, {
        tilesProcessed: fullPlanetRebuild ? this.countCellsInBounds(null) : this.countCellsInBounds(rebuildBounds),
        chunksRebuilt,
        fullPlanetRebuild,
        fromMining: this.isRecentMiningEdit(now),
      });
    }
    this.renderDirty = false;
    this.fullRenderDirty = false;
    this.dirtyBounds = null;
    this.dirtyChunks.clear();
  }

  redrawTerrainRegion(ctx, bounds, { fastRedraw = false } = {}) {
    const clearPadding = fastRedraw
      ? Math.min(this.getLocalRedrawPaddingPixels(), this.cellSize * 6)
      : this.getLocalRedrawPaddingPixels();
    const cellPadding = Math.max(1, Math.ceil(clearPadding / this.cellSize));
    const paintBounds = {
      minCol: clamp(bounds.minCol - cellPadding, 0, this.cols - 1),
      maxCol: clamp(bounds.maxCol + cellPadding, 0, this.cols - 1),
      minRow: clamp(bounds.minRow - cellPadding, 0, this.rows - 1),
      maxRow: clamp(bounds.maxRow + cellPadding, 0, this.rows - 1),
    };
    const rect = this.getDrawRect(bounds, clearPadding);
    if (rect.width <= 0 || rect.height <= 0) return;
    const debug = this.beginTerrainRebuildDebug('chunk rebuild', {
      bounds: paintBounds,
      chunksRebuilt: this.countChunksForBounds(paintBounds),
      fullPlanetRebuild: false,
      fromMining: this.isRecentMiningEdit(),
    });
    try {
      ctx.clearRect(rect.x, rect.y, rect.width, rect.height);
      ctx.save();
      ctx.beginPath();
      ctx.rect(rect.x, rect.y, rect.width, rect.height);
      ctx.clip();
      this.drawTerrainLayers(ctx, paintBounds, { fastRedraw });
      ctx.restore();
    } finally {
      this.finishTerrainRebuildDebug(debug, {
        tilesProcessed: this.countCellsInBounds(paintBounds),
        chunksRebuilt: this.countChunksForBounds(paintBounds),
        fullPlanetRebuild: false,
        fromMining: this.isRecentMiningEdit(),
      });
    }
  }

  drawTerrainLayers(ctx, bounds = null, { drawOutline = true } = {}) {
    this.drawBackgroundWalls(ctx, bounds);
    this.drawOrganicMass(ctx, bounds);
    this.drawRockTexture(ctx, bounds, { fastRedraw: false });
    this.drawOreVeins(ctx, bounds, { fastRedraw: false });
    if (drawOutline) this.drawTerrainOutlineLayer(ctx, bounds, { fastRedraw: false });
    this.drawConstructedMaterials(ctx, bounds);
  }

  drawTerrainOutlineLayer(ctx, bounds = null, { fastRedraw = false } = {}) {
    if (this.roughnessRenderEnabled) this.drawExposedEdgeRoughness(ctx, bounds, { fastRedraw });
    else this.drawEdgeContours(ctx, bounds);
  }

  drawFastTerrainLayers(ctx, bounds, { drawOutline = true } = {}) {
    this.drawFastBackgroundWalls(ctx, bounds);
    this.drawFastNaturalMass(ctx, bounds);
    this.drawOreVeins(ctx, bounds, { fastRedraw: true });
    if (drawOutline) this.drawTerrainOutlineLayer(ctx, bounds, { fastRedraw: true });
    this.drawConstructedMaterials(ctx, bounds);
  }

  drawFastBackgroundWalls(ctx, bounds) {
    if (!TERRAIN_WALLS.enabled || !this.wallCells?.length || !bounds) return;
    const size = this.cellSize;
    ctx.save();
    for (let row = bounds.minRow; row <= bounds.maxRow; row += 1) {
      for (let col = bounds.minCol; col <= bounds.maxCol; col += 1) {
        const material = this.getWallCell(col, row);
        if (material <= 0) continue;
        const style = this.getWallStyleForMaterial(material);
        ctx.fillStyle = withAlpha(style.base, style.alpha);
        ctx.fillRect(col * size, row * size, size, size);
        if (this.getWallCell(col, row - 1) !== material) {
          ctx.fillStyle = withAlpha(style.edge, clamp01((TERRAIN_WALLS.edgeAlpha ?? 0.18) * 0.85));
          ctx.fillRect(col * size, row * size, size, Math.max(1, size * 0.06));
        }
      }
    }
    ctx.restore();
  }

  drawFastNaturalMass(ctx, bounds) {
    if (!bounds) return;
    const palette = BIOME_PALETTES[this.biome] || BIOME_PALETTES.scrap;
    const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, palette.top);
    gradient.addColorStop(0.48, palette.body);
    gradient.addColorStop(1, palette.deep);
    const tile = this.getTextureTile(
      `stone:${this.seed}:${this.biome}`,
      (tileCtx, width, height) => this.drawStoneTextureTile(tileCtx, width, height, palette),
    );
    const pattern = ctx.createPattern(tile, 'repeat');
    const rect = this.getDrawRect(bounds);
    if (rect.width <= 0 || rect.height <= 0) return;
    ctx.save();
    this.clipNaturalMass(ctx, bounds);
    ctx.fillStyle = gradient;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    }
    ctx.restore();
  }

  drawCachedDepthLightingOverlay(ctx, camera, { sx, sy, sw, sh } = {}) {
    return this.shadowSystem.drawCached(ctx, camera, { sx, sy, sw, sh });
  }

  redrawLightingOverlayCache() {
    return this.shadowSystem.redrawCache();
  }

  getLightingOverlayCanvas() {
    return this.shadowSystem.getOverlayCanvas();
  }

  getLightingCanvas(width, height) {
    if (!this.lightingCanvas) {
      this.lightingCanvas = document.createElement('canvas');
      this.lightingCtx = this.lightingCanvas.getContext('2d');
    }
    const nextWidth = Math.max(1, Math.ceil(width));
    const nextHeight = Math.max(1, Math.ceil(height));
    if (this.lightingCanvas.width !== nextWidth || this.lightingCanvas.height !== nextHeight) {
      this.lightingCanvas.width = nextWidth;
      this.lightingCanvas.height = nextHeight;
    }
    return this.lightingCanvas;
  }

  getLightingFieldCanvas(width, height) {
    if (!this.lightingFieldCanvas) {
      this.lightingFieldCanvas = document.createElement('canvas');
      this.lightingFieldCtx = this.lightingFieldCanvas.getContext('2d', { willReadFrequently: true });
    }
    const nextWidth = Math.max(1, Math.ceil(width));
    const nextHeight = Math.max(1, Math.ceil(height));
    if (this.lightingFieldCanvas.width !== nextWidth || this.lightingFieldCanvas.height !== nextHeight) {
      this.lightingFieldCanvas.width = nextWidth;
      this.lightingFieldCanvas.height = nextHeight;
    }
    return this.lightingFieldCanvas;
  }

  getCachedSurfaceRadiusAtAngle(angle) {
    const normalized = (angle + Math.PI * 2) % (Math.PI * 2);
    const bucket = Math.round((normalized / (Math.PI * 2)) * 720);
    if (this.surfaceRadiusLookupCache.has(bucket)) return this.surfaceRadiusLookupCache.get(bucket);
    const radius = this.getSurfaceRadiusAtAngle(normalized);
    this.surfaceRadiusLookupCache.set(bucket, radius);
    return radius;
  }

  getTerrainDepthAt(x, y) {
    const dx = x - this.planetCenterX;
    const dy = y - this.planetCenterY;
    const distance = Math.hypot(dx, dy);
    if (distance <= 0.001) return this.planetRadius;
    const surfaceRadius = this.getCachedSurfaceRadiusAtAngle(Math.atan2(dy, dx));
    return surfaceRadius - distance;
  }

  getStablePlanetDepthAt(x, y) {
    const dx = x - this.planetCenterX;
    const dy = y - this.planetCenterY;
    return this.planetRadius - Math.hypot(dx, dy);
  }

  getBaseDarknessAtDepth(depth) {
    if (depth <= 0) return 0;
    const start = (TERRAIN_LIGHTING.darknessStartDepth ?? 3) * this.cellSize;
    const full = Math.max(start + this.cellSize, (TERRAIN_LIGHTING.fullDarkDepth ?? 13) * this.cellSize);
    const t = smoothStep((depth - start) / Math.max(1, full - start));
    const falloff = Math.max(0.2, TERRAIN_LIGHTING.darknessFalloffPower ?? 1.4);
    const maxOpacity = clamp01(TERRAIN_LIGHTING.maxDarknessOpacity ?? 0.88);
    const bleedDepth = Math.max(this.cellSize, (TERRAIN_LIGHTING.surfaceLightBleedDepth ?? 4) * this.cellSize);
    const surfaceBleed = 1 - (1 - clamp01(depth / bleedDepth)) * clamp01(TERRAIN_LIGHTING.ambientSurfaceLight ?? 0.08);
    return clamp01(Math.pow(t, falloff) * maxOpacity * surfaceBleed);
  }

  getBaseWallDarknessAtDistance(distance) {
    if (distance <= 0) return 0;
    const start = (TERRAIN_LIGHTING.wallDarknessStartDepth ?? 0.25) * this.cellSize;
    const full = Math.max(start + this.cellSize, (TERRAIN_LIGHTING.wallFullDarkDepth ?? 7.5) * this.cellSize);
    const t = smoothStep((distance - start) / Math.max(1, full - start));
    const falloff = Math.max(0.2, TERRAIN_LIGHTING.darknessFalloffPower ?? 1.4);
    const maxOpacity = clamp01(TERRAIN_LIGHTING.maxDarknessOpacity ?? 0.88);
    const strength = Math.max(0, TERRAIN_LIGHTING.wallDarknessStrength ?? 1);
    return clamp01(Math.pow(t, falloff) * maxOpacity * strength);
  }

  ensureAirExposureMap() {
    if (!this.airExposureDirty && this.airExposureMap?.length === this.cells.length) return this.airExposureMap;
    if (
      this.airExposureDirtyDeferred
      && this.airExposureMap?.length === this.cells.length
      && this.getClockNow() < this.airExposureRebuildAt
    ) {
      return this.airExposureMap;
    }
    const total = this.cols * this.rows;
    const distances = new Float32Array(total);
    const infinity = 1e6;
    for (let row = 0; row < this.rows; row += 1) {
      for (let col = 0; col < this.cols; col += 1) {
        const index = this.index(col, row);
        distances[index] = this.isWallCell(col, row) ? infinity : 0;
      }
    }

    const airCost = Math.max(0.2, TERRAIN_LIGHTING.airExposureCost ?? 0.72);
    const solidCost = Math.max(0.2, TERRAIN_LIGHTING.solidExposureCost ?? 1.22);
    const costFor = (col, row, diagonal = false) => {
      const base = this.isWallCell(col, row) ? solidCost : airCost;
      return diagonal ? base * 1.4142 : base;
    };

    for (let row = 0; row < this.rows; row += 1) {
      for (let col = 0; col < this.cols; col += 1) {
        const index = this.index(col, row);
        let best = distances[index];
        if (col > 0) best = Math.min(best, distances[this.index(col - 1, row)] + costFor(col, row));
        if (row > 0) best = Math.min(best, distances[this.index(col, row - 1)] + costFor(col, row));
        if (col > 0 && row > 0) best = Math.min(best, distances[this.index(col - 1, row - 1)] + costFor(col, row, true));
        if (col < this.cols - 1 && row > 0) best = Math.min(best, distances[this.index(col + 1, row - 1)] + costFor(col, row, true));
        distances[index] = best;
      }
    }

    for (let row = this.rows - 1; row >= 0; row -= 1) {
      for (let col = this.cols - 1; col >= 0; col -= 1) {
        const index = this.index(col, row);
        let best = distances[index];
        if (col < this.cols - 1) best = Math.min(best, distances[this.index(col + 1, row)] + costFor(col, row));
        if (row < this.rows - 1) best = Math.min(best, distances[this.index(col, row + 1)] + costFor(col, row));
        if (col < this.cols - 1 && row < this.rows - 1) best = Math.min(best, distances[this.index(col + 1, row + 1)] + costFor(col, row, true));
        if (col > 0 && row < this.rows - 1) best = Math.min(best, distances[this.index(col - 1, row + 1)] + costFor(col, row, true));
        distances[index] = best;
      }
    }

    this.airExposureMap = distances;
    this.airExposureDirty = false;
    this.airExposureDirtyDeferred = false;
    this.airExposureRebuildAt = 0;
    return distances;
  }

  getAirExposureDistanceAt(x, y) {
    const map = this.ensureAirExposureMap();
    const fx = clamp(x / this.cellSize - 0.5, 0, this.cols - 1);
    const fy = clamp(y / this.cellSize - 0.5, 0, this.rows - 1);
    const col = Math.floor(fx);
    const row = Math.floor(fy);
    const tx = fx - col;
    const ty = fy - row;
    const col1 = Math.min(this.cols - 1, col + 1);
    const row1 = Math.min(this.rows - 1, row + 1);
    const a = map[this.index(col, row)];
    const b = map[this.index(col1, row)];
    const c = map[this.index(col, row1)];
    const d = map[this.index(col1, row1)];
    const top = a + (b - a) * tx;
    const bottom = c + (d - c) * tx;
    return (top + (bottom - top) * ty) * this.cellSize;
  }

  getWallCoverageAt(x, y) {
    const fx = clamp(x / this.cellSize - 0.5, 0, this.cols - 1);
    const fy = clamp(y / this.cellSize - 0.5, 0, this.rows - 1);
    const col = Math.floor(fx);
    const row = Math.floor(fy);
    const tx = fx - col;
    const ty = fy - row;
    const col1 = Math.min(this.cols - 1, col + 1);
    const row1 = Math.min(this.rows - 1, row + 1);
    const sample = (xCol, yRow) => (this.isWallCell(xCol, yRow) ? 1 : 0);
    const a = sample(col, row);
    const b = sample(col1, row);
    const c = sample(col, row1);
    const d = sample(col1, row1);
    const top = a + (b - a) * tx;
    const bottom = c + (d - c) * tx;
    return clamp01(top + (bottom - top) * ty);
  }

  getSmoothDarknessAt(x, y) {
    const wallCoverage = this.getWallCoverageAt(x, y);
    if (wallCoverage <= 0.015) return 0;
    const radialDepth = this.getStablePlanetDepthAt(x, y);
    const exposureDistance = this.getAirExposureDistanceAt(x, y);
    const wallDarkness = this.getBaseWallDarknessAtDistance(exposureDistance);
    const radialDarkness = radialDepth > 0 ? this.getBaseDarknessAtDepth(radialDepth) : 0;
    const exposureBoost = Math.max(0.5, TERRAIN_LIGHTING.exposureDarknessBoost ?? 1.08);
    const centerInfluence = clamp01(TERRAIN_LIGHTING.centerDepthInfluence ?? 0.58);
    const centerBlend = clamp01(TERRAIN_LIGHTING.centerDepthBlend ?? 0.28);
    const centerDarknessFloor = radialDarkness * centerInfluence;
    const enclosedDarkness = Math.max(wallDarkness * exposureBoost, centerDarknessFloor, wallDarkness + radialDarkness * centerBlend);
    return clamp01(enclosedDarkness * smoothStep(wallCoverage));
  }

  getMaterialLight(materialId) {
    const material = TERRAIN_MATERIALS[materialId];
    if (!material?.id) return null;
    return TERRAIN_LIGHTING.materialLights?.[material.id] || null;
  }

  setExtraLightSources(sources = []) {
    return this.shadowSystem.setExtraLightSources(sources);
  }

  getMaxStaticMaterialLightRadius() {
    const lights = TERRAIN_LIGHTING.materialLights || {};
    return Object.values(lights).reduce((max, light) => Math.max(max, (light.radius || 0) * this.cellSize), 0);
  }

  getMaxMaterialLightRadius() {
    const staticRadius = this.getMaxStaticMaterialLightRadius();
    const extraRadius = this.shadowSystem.getExtraLightSources().reduce((max, source) => Math.max(max, source.radius || 0), 0);
    return Math.max(staticRadius, extraRadius);
  }

  getLightSourceCenterBounds(sources = []) {
    let bounds = null;
    for (const source of sources || []) {
      if (!Number.isFinite(source?.x) || !Number.isFinite(source?.y)) continue;
      const col = clamp(Math.floor(source.x / this.cellSize), 0, this.cols - 1);
      const row = clamp(Math.floor(source.y / this.cellSize), 0, this.rows - 1);
      bounds = this.mergeBounds(bounds, { minCol: col, maxCol: col, minRow: row, maxRow: row });
    }
    return bounds;
  }

  getLightReductionAt(x, y) {
    let reduction = 0;
    const falloffPower = Math.max(0.4, TERRAIN_LIGHTING.lightFalloffPower ?? 1.18);
    for (const source of this.shadowSystem.getExtraLightSources()) {
      const distance = Math.hypot(x - source.x, y - source.y);
      if (distance >= source.radius) continue;
      const falloff = Math.pow(1 - distance / Math.max(1, source.radius), falloffPower);
      reduction = Math.max(reduction, clamp01(source.intensity * falloff));
    }

    const staticRadius = this.getMaxStaticMaterialLightRadius();
    if (staticRadius <= 0) return reduction;
    const minCol = clamp(Math.floor((x - staticRadius) / this.cellSize), 0, this.cols - 1);
    const maxCol = clamp(Math.ceil((x + staticRadius) / this.cellSize), 0, this.cols - 1);
    const minRow = clamp(Math.floor((y - staticRadius) / this.cellSize), 0, this.rows - 1);
    const maxRow = clamp(Math.ceil((y + staticRadius) / this.cellSize), 0, this.rows - 1);
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        const materialId = this.getCell(col, row);
        const light = this.getMaterialLight(materialId);
        if (!light) continue;
        const radius = Math.max(this.cellSize * 1.5, (light.radius || 5) * this.cellSize);
        const sourceX = col * this.cellSize + this.cellSize * 0.5;
        const sourceY = row * this.cellSize + this.cellSize * 0.5;
        const distance = Math.hypot(x - sourceX, y - sourceY);
        if (distance >= radius) continue;
        const falloff = Math.pow(1 - distance / Math.max(1, radius), falloffPower);
        reduction = Math.max(reduction, clamp01((light.intensity ?? 0.65) * falloff * 0.92));
      }
    }
    return reduction;
  }

  getDarknessAtWithLights(x, y) {
    const darkness = this.getSmoothDarknessAt(x, y);
    if (darkness <= 0) return 0;
    return clamp01(darkness * (1 - this.getLightReductionAt(x, y)));
  }

  getLightingDrawRect(bounds = null) {
    const maxRadius = this.getMaxMaterialLightRadius() + this.cellSize * 1.5;
    const blurPadding = Math.max(0, TERRAIN_LIGHTING.darknessBlur ?? 0) * 2 + this.cellSize * 1.5;
    const padding = bounds
      ? Math.max(this.cellSize * 3, maxRadius, blurPadding)
      : Math.max(this.cellSize * 2, maxRadius, blurPadding);
    return this.snapDrawRectToPixelGrid(this.getDrawRect(bounds, padding));
  }

  snapDrawRectToPixelGrid(rect) {
    const grid = Math.max(4, Math.round(1 / Math.max(0.08, TERRAIN_LIGHTING.darknessFieldScale ?? 0.26)));
    const x = clamp(Math.floor(rect.x / grid) * grid, 0, this.width);
    const y = clamp(Math.floor(rect.y / grid) * grid, 0, this.height);
    const right = clamp(Math.ceil((rect.x + rect.width) / grid) * grid, 0, this.width);
    const bottom = clamp(Math.ceil((rect.y + rect.height) / grid) * grid, 0, this.height);
    return {
      x,
      y,
      width: Math.max(0, right - x),
      height: Math.max(0, bottom - y),
    };
  }

  collectExtraLightSources(rect) {
    const extraLightSources = this.shadowSystem.getExtraLightSources();
    if (!extraLightSources.length) return [];
    return extraLightSources
      .filter((source) => boundsOverlap(
        {
          minX: source.x - source.radius,
          minY: source.y - source.radius,
          maxX: source.x + source.radius,
          maxY: source.y + source.radius,
        },
        {
          minX: rect.x,
          minY: rect.y,
          maxX: rect.x + rect.width,
          maxY: rect.y + rect.height,
        },
      ))
      .map((source) => ({
        ...source,
        materialId: 0,
        material: null,
        dynamic: true,
      }));
  }

  collectLightSources(bounds = null, { fastRedraw = false } = {}) {
    const rect = this.getLightingDrawRect(bounds);
    const maxRadius = this.getMaxStaticMaterialLightRadius();
    const minCol = clamp(Math.floor((rect.x - maxRadius) / this.cellSize), 0, this.cols - 1);
    const maxCol = clamp(Math.ceil((rect.x + rect.width + maxRadius) / this.cellSize), 0, this.cols - 1);
    const minRow = clamp(Math.floor((rect.y - maxRadius) / this.cellSize), 0, this.rows - 1);
    const maxRow = clamp(Math.ceil((rect.y + rect.height + maxRadius) / this.cellSize), 0, this.rows - 1);
    const extraSources = this.collectExtraLightSources(rect);
    const sources = [...extraSources];
    const sourceLimit = (fastRedraw ? 80 : (bounds ? 260 : 720)) + extraSources.length;
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        const materialId = this.getCell(col, row);
        const light = this.getMaterialLight(materialId);
        if (!light) continue;
        const material = TERRAIN_MATERIALS[materialId];
        const sourceHash = hash2D(col, row, this.seed, materialId * 131);
        const stride = Math.max(1, Math.round(light.sampleStride || (materialId === 6 ? 1 : 2)));
        if (stride > 1 && ((col + row * 3 + materialId) % stride) !== 0 && sourceHash < 0.7) continue;
        sources.push({
          x: col * this.cellSize + this.cellSize * 0.5,
          y: row * this.cellSize + this.cellSize * 0.5,
          col,
          row,
          materialId,
          material,
          color: light.color || material.edge || '#ffffff',
          radius: Math.max(this.cellSize * 1.5, (light.radius || 5) * this.cellSize),
          intensity: clamp01((light.intensity ?? 0.65) * (0.86 + sourceHash * 0.18)),
          glowScale: clamp01(light.glowScale ?? TERRAIN_LIGHTING.materialVisibleGlowScale ?? 0.44),
        });
        if (sources.length >= sourceLimit) return sources;
      }
    }
    return sources;
  }

  drawDepthLightingOverlay(ctx, bounds = null, { fastRedraw = false } = {}) {
    const rect = this.getLightingDrawRect(bounds);
    if (rect.width <= 0 || rect.height <= 0) return;
    const canvas = this.getLightingCanvas(rect.width, rect.height);
    const lightCtx = this.lightingCtx;
    lightCtx.clearRect(0, 0, canvas.width, canvas.height);
    this.drawDepthDarknessGrid(lightCtx, rect, Boolean(bounds), { fastRedraw });
    const sources = this.lightingRenderEnabled ? this.collectLightSources(bounds, { fastRedraw }) : [];
    if (sources.length) this.eraseLightFromOverlay(lightCtx, rect, sources);
    ctx.save();
    ctx.drawImage(canvas, rect.x, rect.y);
    ctx.restore();
    if (sources.length) this.drawColoredLightGlows(ctx, rect, sources);
    if (this.lightingDebugEnabled) this.drawLightingDebug(ctx, rect, sources);
  }

  drawDepthDarknessGrid(ctx, rect, isLocalUpdate = false, { fastRedraw = false } = {}) {
    const baseScale = TERRAIN_LIGHTING.darknessFieldScale ?? 0.26;
    const localScale = TERRAIN_LIGHTING.dirtyDarknessFieldScale ?? baseScale;
    const scale = clamp(isLocalUpdate ? Math.max(baseScale, localScale) : baseScale, 0.12, 0.72);
    const fieldWidth = Math.max(2, Math.ceil(rect.width * scale));
    const fieldHeight = Math.max(2, Math.ceil(rect.height * scale));
    const fieldCanvas = this.getLightingFieldCanvas(fieldWidth, fieldHeight);
    const fieldCtx = this.lightingFieldCtx;
    const imageData = fieldCtx.createImageData(fieldWidth, fieldHeight);
    const pixels = imageData.data;
    const invScale = 1 / scale;
    const darkStrength = TERRAIN_LIGHTING.tunnelDarknessStrength ?? 0.86;

    for (let y = 0; y < fieldHeight; y += 1) {
      const worldY = rect.y + (y + 0.5) * invScale;
      for (let x = 0; x < fieldWidth; x += 1) {
        const worldX = rect.x + (x + 0.5) * invScale;
        const depth = this.getStablePlanetDepthAt(worldX, worldY);
        const darkness = this.getSmoothDarknessAt(worldX, worldY);
        if (darkness <= 0.006) continue;
        const offset = (y * fieldWidth + x) * 4;
        if (this.depthDebugEnabled) {
          const t = clamp01(depth / Math.max(1, this.planetRadius * 0.42));
          pixels[offset] = Math.round(45 + t * 70);
          pixels[offset + 1] = Math.round(150 + t * 60);
          pixels[offset + 2] = Math.round(255 - t * 80);
          pixels[offset + 3] = Math.round(Math.min(0.62, darkness * 0.82) * 255);
        } else {
          const strength = clamp01(darkness * darkStrength);
          pixels[offset] = 2;
          pixels[offset + 1] = 4;
          pixels[offset + 2] = 11;
          pixels[offset + 3] = Math.round(strength * 255);
        }
      }
    }

    fieldCtx.putImageData(imageData, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const blur = Math.max(0, TERRAIN_LIGHTING.darknessBlur ?? 0);
    if (blur > 0 && 'filter' in ctx) {
      ctx.filter = `blur(${blur}px)`;
      ctx.drawImage(fieldCanvas, -blur, -blur, ctx.canvas.width + blur * 2, ctx.canvas.height + blur * 2);
    } else {
      ctx.drawImage(fieldCanvas, 0, 0, ctx.canvas.width, ctx.canvas.height);
    }
    ctx.restore();
  }

  eraseLightFromOverlay(ctx, rect, sources) {
    const falloffPower = Math.max(0.4, TERRAIN_LIGHTING.lightFalloffPower ?? 1.18);
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    for (const source of sources) {
      if (!boundsOverlap(
        {
          minX: source.x - source.radius,
          minY: source.y - source.radius,
          maxX: source.x + source.radius,
          maxY: source.y + source.radius,
        },
        {
          minX: rect.x,
          minY: rect.y,
          maxX: rect.x + rect.width,
          maxY: rect.y + rect.height,
        },
      )) continue;
      const localX = source.x - rect.x;
      const localY = source.y - rect.y;
      const gradient = ctx.createRadialGradient(localX, localY, this.cellSize * 0.25, localX, localY, source.radius);
      const coreAlpha = clamp01(source.intensity * 0.92);
      const midAlpha = clamp01(source.intensity * 0.5 / falloffPower);
      gradient.addColorStop(0, `rgba(255,255,255,${coreAlpha})`);
      gradient.addColorStop(0.42, `rgba(255,255,255,${midAlpha})`);
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(localX, localY, source.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawColoredLightGlows(ctx, rect, sources) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    for (const source of sources) {
      const rgb = hexToRgb(source.color);
      const radius = source.radius * 0.92;
      const glowScale = source.dynamic
        ? clamp01(source.glowScale ?? 1)
        : clamp01(source.glowScale ?? TERRAIN_LIGHTING.materialVisibleGlowScale ?? 0.44);
      const coreAlpha = (source.dynamic ? 0.2 : 0.11) * source.intensity * glowScale;
      const midAlpha = (source.dynamic ? 0.075 : 0.032) * source.intensity * glowScale;
      const gradient = ctx.createRadialGradient(source.x, source.y, this.cellSize * 0.2, source.x, source.y, radius);
      gradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${coreAlpha})`);
      gradient.addColorStop(0.5, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${midAlpha})`);
      gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(source.x, source.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawLightingDebug(ctx, rect, sources) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();
    ctx.lineWidth = 1.2;
    ctx.setLineDash([6, 5]);
    for (const source of sources) {
      ctx.strokeStyle = withAlpha(source.color, 0.68);
      ctx.beginPath();
      ctx.arc(source.x, source.y, source.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawLiveDamageOverlays(ctx, camera, visible) {
    if (!this.damagedCells?.size) return;
    const minCol = clamp(Math.floor(visible.sx / this.cellSize) - 1, 0, this.cols - 1);
    const maxCol = clamp(Math.ceil((visible.sx + visible.sw) / this.cellSize) + 1, 0, this.cols - 1);
    const minRow = clamp(Math.floor(visible.sy / this.cellSize) - 1, 0, this.rows - 1);
    const maxRow = clamp(Math.ceil((visible.sy + visible.sh) / this.cellSize) + 1, 0, this.rows - 1);
    ctx.save();
    ctx.translate(-camera.x, 0);
    for (const index of this.damagedCells) {
      const row = Math.floor(index / this.cols);
      const col = index - row * this.cols;
      if (col < minCol || col > maxCol || row < minRow || row > maxRow) continue;
      const material = this.getCell(col, row);
      if (material <= 0) {
        this.damagedCells.delete(index);
        continue;
      }
      const ratio = this.getDamageRatio(col, row, material);
      if (ratio <= 0.06) {
        this.damagedCells.delete(index);
        continue;
      }
      this.drawCellDamageOverlay(ctx, col, row, {
        materialId: material,
        ratio,
        time: 0,
        glow: false,
      });
    }
    ctx.restore();
  }

  drawCellContourPatch(ctx, col, row, {
    fillStyle = 'rgba(255,255,255,0.16)',
    strokeStyle = 'rgba(255,255,255,0.8)',
    lineWidth = 1.5,
    alpha = 1,
    scale = 1,
    stroke = false,
  } = {}) {
    const size = this.cellSize;
    const centerX = col * size + size * 0.5;
    const centerY = row * size + size * 0.5;
    const bounds = {
      minCol: clamp(col - 2, 0, this.cols - 1),
      maxCol: clamp(col + 2, 0, this.cols - 1),
      minRow: clamp(row - 2, 0, this.rows - 1),
      maxRow: clamp(row + 2, 0, this.rows - 1),
    };
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.scale(scale, scale);
    ctx.translate(-centerX, -centerY);
    ctx.beginPath();
    ctx.rect(col * size - size * 0.18, row * size - size * 0.18, size * 1.36, size * 1.36);
    ctx.clip();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = fillStyle;
    ctx.beginPath();
    this.buildMarchingPath(ctx, (x, y) => this.isSolidCell(x, y), bounds, 'solid', VISUAL_CONTOUR_OPTIONS);
    ctx.fill('evenodd');
    if (stroke) {
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
    ctx.restore();
  }

  drawCellTargetGlow(ctx, hit, time = 0, { brushRadius = 0 } = {}) {
    if (!hit) return;
    const material = TERRAIN_MATERIALS[hit.material] || TERRAIN_MATERIALS[1];
    const color = material.edge || '#ffd36b';
    const rgb = hexToRgb(color);
    const pulse = 1 + Math.sin(time * 15) * 0.045;
    const surfaceSegments = this.getCellSurfaceContourSegments(hit.col, hit.row);
    const hasSurfaceContour = surfaceSegments.length > 0;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    this.drawCellContourPatch(ctx, hit.col, hit.row, {
      fillStyle: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${hasSurfaceContour ? 0.24 : 0.18})`,
      alpha: hasSurfaceContour ? 0.32 : 0.45,
      scale: pulse,
    });

    ctx.globalAlpha = hasSurfaceContour ? 0.2 : 0.42;
    ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.92)`;
    ctx.lineWidth = Math.max(1.2, this.cellSize * 0.07);
    ctx.setLineDash([]);
    if (!hasSurfaceContour) {
      ctx.beginPath();
      this.traceCellShape(ctx, hit.col, hit.row, { scale: pulse });
      ctx.stroke();
    }

    ctx.globalAlpha = 0.96;
    ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.98)`;
    ctx.lineWidth = Math.max(1.7, this.cellSize * 0.12);
    ctx.setLineDash([this.cellSize * 0.34, this.cellSize * 0.2]);
    ctx.lineDashOffset = -time * 20;
    ctx.beginPath();
    const drewSurfaceContour = this.drawCellSurfaceContourSegments(
      ctx,
      hit.col,
      hit.row,
      time,
      `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.98)`,
    );
    if (!drewSurfaceContour) {
      this.traceCellShape(ctx, hit.col, hit.row, { scale: pulse });
      ctx.stroke();
    }

    if (brushRadius > 0) {
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.16;
      ctx.setLineDash([]);
      ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.55)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(hit.x, hit.y, brushRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  getRenderCanvas() {
    if (!this.renderCanvas) {
      this.renderCanvas = document.createElement('canvas');
      this.renderCtx = this.renderCanvas.getContext('2d');
    }
    if (this.renderCanvas.width !== this.width || this.renderCanvas.height !== this.height) {
      this.renderCanvas.width = this.width;
      this.renderCanvas.height = this.height;
      this.renderDirty = true;
      this.fullRenderDirty = true;
    }
    return this.renderCanvas;
  }

  releaseRenderCache() {
    this.renderCanvas = null;
    this.renderCtx = null;
    this.lightingCanvas = null;
    this.lightingCtx = null;
    this.lightingFieldCanvas = null;
    this.lightingFieldCtx = null;
    this.shadowSystem.release();
    this.progressivePrewarm = null;
    this.airExposureMap = null;
    this.airExposureDirty = true;
    this.airExposureDirtyDeferred = false;
    this.airExposureRebuildAt = 0;
    this.renderDirty = true;
    this.fullRenderDirty = true;
    this.dirtyBounds = null;
    this.dirtyChunks.clear();
    this.clearContourRenderCaches();
    this.collisionContours = null;
    this.surfaceRadiusLookupCache?.clear();
  }

  prewarmForGameplay({
    progressive = false,
    priorityPoint = null,
    budgetMs = 8,
    maxChunks = 6,
  } = {}) {
    if (typeof document === 'undefined') return;
    if (progressive) {
      this.beginProgressivePrewarm({ priorityPoint });
      this.processProgressivePrewarm({ budgetMs, maxChunks });
      return;
    }
    if (!this.renderCanvas || this.renderDirty) this.redrawTerrainCache();
    this.ensureAirExposureMap();
    if (this.lightingRenderEnabled || this.depthDebugEnabled) this.redrawLightingOverlayCache();
  }

  beginProgressivePrewarm({ priorityPoint = null, chunkSizeCells = null } = {}) {
    if (typeof document === 'undefined') return false;
    if (this.renderCanvas && !this.renderDirty && !this.fullRenderDirty && !this.progressivePrewarm) return true;
    if (this.progressivePrewarm) return false;

    const chunkSize = Math.max(8, Math.round(chunkSizeCells || this.chunkSizeCells || DEFAULT_TERRAIN_CHUNK_CELLS));
    const chunks = [];
    for (let minRow = 0; minRow < this.rows; minRow += chunkSize) {
      for (let minCol = 0; minCol < this.cols; minCol += chunkSize) {
        const bounds = {
          minCol,
          maxCol: Math.min(this.cols - 1, minCol + chunkSize - 1),
          minRow,
          maxRow: Math.min(this.rows - 1, minRow + chunkSize - 1),
        };
        const centerX = ((bounds.minCol + bounds.maxCol + 1) * 0.5) * this.cellSize;
        const centerY = ((bounds.minRow + bounds.maxRow + 1) * 0.5) * this.cellSize;
        const priority = priorityPoint
          ? (centerX - priorityPoint.x) ** 2 + (centerY - priorityPoint.y) ** 2
          : chunks.length;
        chunks.push({ bounds, priority });
      }
    }
    chunks.sort((a, b) => a.priority - b.priority);

    const canvas = this.getRenderCanvas();
    this.renderCtx.clearRect(0, 0, canvas.width, canvas.height);
    this.progressivePrewarm = {
      chunks,
      cursor: 0,
    };
    this.renderDirty = true;
    this.fullRenderDirty = true;
    this.dirtyBounds = null;
    this.dirtyChunks.clear();
    return false;
  }

  processProgressivePrewarm({ budgetMs = 4, maxChunks = 4 } = {}) {
    const state = this.progressivePrewarm;
    if (!state) return !this.renderDirty;
    const canvas = this.getRenderCanvas();
    const ctx = this.renderCtx;
    const startedAt = this.getClockNow();
    let painted = 0;
    while (state.cursor < state.chunks.length && painted < Math.max(1, maxChunks)) {
      this.drawTerrainPrewarmChunk(ctx, state.chunks[state.cursor].bounds);
      state.cursor += 1;
      painted += 1;
      if (painted > 0 && this.getClockNow() - startedAt >= Math.max(1, budgetMs)) break;
    }
    if (state.cursor < state.chunks.length) return false;

    this.progressivePrewarm = null;
    this.flushStaleContourRenderCaches();
    this.renderDirty = false;
    this.fullRenderDirty = false;
    this.dirtyBounds = null;
    this.dirtyChunks.clear();
    if (this.lightingRenderEnabled || this.depthDebugEnabled) {
      this.markLightingOverlayDirty({ defer: true, delayMs: 90, full: true });
    }
    return canvas.width > 0 && canvas.height > 0;
  }

  drawTerrainPrewarmChunk(ctx, bounds) {
    const rect = this.getDrawRect(bounds, 0);
    if (rect.width <= 0 || rect.height <= 0) return;
    const paintBounds = this.expandCellBounds(bounds, 4);
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();
    this.drawTerrainLayers(ctx, paintBounds, { fastRedraw: false, drawOutline: true });
    ctx.restore();
  }

  drawBackgroundWalls(ctx, bounds = null) {
    if (!TERRAIN_WALLS.enabled || !this.wallCells?.length) return;
    const wallMaterials = Object.keys(TERRAIN_MATERIALS)
      .map(Number)
      .filter((material) => material > 0 && this.hasWallMaterialInBounds(material, bounds));
    if (!wallMaterials.length) return;

    ctx.save();
    for (const material of wallMaterials) {
      const style = this.getWallStyleForMaterial(material);
      const predicate = (col, row) => this.getWallCell(col, row) === material;
      this.drawPatternInMask(
        ctx,
        predicate,
        `wall:${this.seed}:${this.biome}:${material}:${style.base}:${style.accent}`,
        (tileCtx, width, height) => this.drawWallTextureTile(tileCtx, width, height, style, material),
        bounds,
        style.alpha,
        `wall-mask:${material}`,
        WALL_CONTOUR_OPTIONS,
      );
      const edgeAlpha = clamp01((TERRAIN_WALLS.edgeAlpha ?? 0.18) * (material >= 4 ? 1.35 : 1));
      if (edgeAlpha > 0.01) {
        this.strokeMarchingEdges(
          ctx,
          withAlpha(style.edge, edgeAlpha),
          Math.max(1, this.cellSize * 0.055),
          bounds,
          predicate,
          `wall-mask:${material}`,
          WALL_CONTOUR_OPTIONS,
        );
      }
    }
    ctx.restore();
  }

  hasWallMaterialInBounds(material, bounds = null) {
    if (!this.wallCells?.length) return false;
    const minCol = bounds ? clamp(bounds.minCol - 2, 0, this.cols - 1) : 0;
    const maxCol = bounds ? clamp(bounds.maxCol + 2, 0, this.cols - 1) : this.cols - 1;
    const minRow = bounds ? clamp(bounds.minRow - 2, 0, this.rows - 1) : 0;
    const maxRow = bounds ? clamp(bounds.maxRow + 2, 0, this.rows - 1) : this.rows - 1;
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        if (this.getWallCell(col, row) === material) return true;
      }
    }
    return false;
  }

  hasMaterialInBounds(material, bounds = null, padding = 2) {
    const minCol = bounds ? clamp(bounds.minCol - padding, 0, this.cols - 1) : 0;
    const maxCol = bounds ? clamp(bounds.maxCol + padding, 0, this.cols - 1) : this.cols - 1;
    const minRow = bounds ? clamp(bounds.minRow - padding, 0, this.rows - 1) : 0;
    const maxRow = bounds ? clamp(bounds.maxRow + padding, 0, this.rows - 1) : this.rows - 1;
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        if (this.getCell(col, row) === material) return true;
      }
    }
    return false;
  }

  getWallStyleForMaterial(materialId) {
    const palette = BIOME_PALETTES[this.biome] || BIOME_PALETTES.scrap;
    const material = TERRAIN_MATERIALS[materialId] || TERRAIN_MATERIALS[1];
    const baseSource = materialId === 1
      ? mixHex(palette.body, palette.deep, 0.42)
      : mixHex(material.color || palette.body, palette.body, materialId >= 4 ? 0.34 : 0.54);
    const base = mixHex(baseSource, '#0b0d13', materialId >= 4 ? 0.4 : 0.48);
    const mid = mixHex(baseSource, '#151823', materialId >= 4 ? 0.22 : 0.34);
    const accent = mixHex(material.edge || palette.edge, base, materialId >= 4 ? 0.46 : 0.68);
    const shadow = mixHex(base, '#010207', 0.42);
    return {
      base,
      mid,
      accent,
      edge: mixHex(accent, '#0b0d13', 0.32),
      shadow,
      alpha: clamp01((TERRAIN_WALLS.textureAlpha ?? 0.96) * (materialId >= 4 ? 0.92 : 1)),
    };
  }

  drawWallTextureTile(ctx, width, height, style, material) {
    const random = createRandom(hashString(`${this.seed}:${this.biome}:wall:${material}`));
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = style.base;
    ctx.fillRect(0, 0, width, height);

    for (let i = 0; i < 34; i += 1) {
      const x = random() * width;
      const y = random() * height;
      const radius = 10 + random() * 34;
      const gradient = ctx.createRadialGradient(x, y, 1, x, y, radius);
      const color = random() > 0.42 ? style.mid : style.shadow;
      gradient.addColorStop(0, withAlpha(color, 0.2 + random() * 0.13));
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = 0; i < 90; i += 1) {
      const x = random() * width;
      const y = random() * height;
      const radius = 0.7 + random() * 2.8;
      ctx.fillStyle = random() > 0.58
        ? withAlpha(style.accent, material >= 4 ? 0.15 : 0.08)
        : withAlpha(style.shadow, 0.12 + random() * 0.12);
      ctx.beginPath();
      ctx.ellipse(x, y, radius * (0.8 + random()), radius * (0.45 + random() * 0.75), random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < 18; i += 1) {
      const x = random() * width;
      const y = random() * height;
      const length = 12 + random() * 42;
      const angle = random() * Math.PI * 2;
      ctx.strokeStyle = withAlpha(random() > 0.38 ? style.shadow : style.accent, material >= 4 ? 0.14 : 0.09);
      ctx.lineWidth = 0.8 + random() * 1.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(
        x + Math.cos(angle + 0.7) * length * 0.35,
        y + Math.sin(angle + 0.7) * length * 0.35,
        x + Math.cos(angle) * length,
        y + Math.sin(angle) * length,
      );
      ctx.stroke();
    }

    if (material >= 4) {
      for (let i = 0; i < 16; i += 1) {
        const x = random() * width;
        const y = random() * height;
        const length = 8 + random() * 22;
        ctx.strokeStyle = withAlpha(style.accent, 0.12 + random() * 0.16);
        ctx.lineWidth = 1 + random() * 1.4;
        ctx.beginPath();
        ctx.moveTo(x - length * 0.4, y + length * 0.18);
        ctx.lineTo(x + length * 0.4, y - length * 0.18);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawOrganicMass(ctx, bounds = null) {
    const palette = BIOME_PALETTES[this.biome] || BIOME_PALETTES.scrap;
    const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, palette.top);
    gradient.addColorStop(0.48, palette.body);
    gradient.addColorStop(1, palette.deep);
    ctx.fillStyle = gradient;
    this.fillMarchingPath(ctx, (col, row) => this.isNaturalSolidCell(col, row), bounds, 'natural-solid');
  }

  fillMarchingPath(ctx, predicate, bounds = null, cacheKey = null, options = VISUAL_CONTOUR_OPTIONS) {
    ctx.beginPath();
    this.buildMarchingPath(ctx, predicate, bounds, cacheKey, options);
    ctx.fill('evenodd');
  }

  clipSolidMass(ctx, bounds = null) {
    this.clipMarchingPath(ctx, (col, row) => this.isSolidCell(col, row), bounds, 'solid');
  }

  clipNaturalMass(ctx, bounds = null) {
    this.clipMarchingPath(ctx, (col, row) => this.isNaturalSolidCell(col, row), bounds, 'natural-solid');
  }

  clipMarchingPath(ctx, predicate, bounds = null, cacheKey = null, options = VISUAL_CONTOUR_OPTIONS) {
    ctx.beginPath();
    this.buildMarchingPath(ctx, predicate, bounds, cacheKey, options);
    ctx.clip('evenodd');
  }

  getDrawRect(bounds = null, padding = this.cellSize * 2) {
    if (!bounds) {
      return { x: 0, y: 0, width: this.width, height: this.height };
    }
    const x = clamp(bounds.minCol * this.cellSize - padding, 0, this.width);
    const y = clamp(bounds.minRow * this.cellSize - padding, 0, this.height);
    const right = clamp((bounds.maxCol + 1) * this.cellSize + padding, 0, this.width);
    const bottom = clamp((bounds.maxRow + 1) * this.cellSize + padding, 0, this.height);
    return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
  }

  getTextureTile(key, drawTile) {
    if (this.textureCache.has(key)) return this.textureCache.get(key);
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 160;
    const cacheable = drawTile(canvas.getContext('2d'), canvas.width, canvas.height) !== false;
    if (cacheable) this.textureCache.set(key, canvas);
    return canvas;
  }

  drawPatternInMask(ctx, predicate, key, drawTile, bounds = null, alpha = 1, maskKey = key, options = VISUAL_CONTOUR_OPTIONS) {
    const rect = this.getDrawRect(bounds);
    if (rect.width <= 0 || rect.height <= 0) return;
    const tile = this.getTextureTile(key, drawTile);
    const pattern = ctx.createPattern(tile, 'repeat');
    if (!pattern) return;
    ctx.save();
    this.clipMarchingPath(ctx, predicate, bounds, maskKey, options);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = pattern;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.restore();
  }

  buildSampledMarchingCellPath(ctx, predicate, bounds, options = VISUAL_CONTOUR_OPTIONS) {
    const step = this.getContourStep(options);
    const padding = this.cellSize * 3;
    const minCol = clamp(Math.floor((bounds.minCol * this.cellSize - padding) / step), 0, Math.max(0, Math.ceil(this.width / step) - 1));
    const maxCol = clamp(Math.ceil(((bounds.maxCol + 1) * this.cellSize + padding) / step), 0, Math.max(0, Math.ceil(this.width / step) - 1));
    const minRow = clamp(Math.floor((bounds.minRow * this.cellSize - padding) / step), 0, Math.max(0, Math.ceil(this.height / step) - 1));
    const maxRow = clamp(Math.ceil(((bounds.maxRow + 1) * this.cellSize + padding) / step), 0, Math.max(0, Math.ceil(this.height / step) - 1));
    const sample = (col, row) => this.sampleContourNode(predicate, col, row, step, options);
    const debug = this.beginTerrainRebuildDebug('outline/contour generation', {
      bounds,
      chunksRebuilt: this.countChunksForBounds(bounds),
      fullPlanetRebuild: false,
      fromMining: this.isRecentMiningEdit(),
    });
    try {
      for (let row = minRow; row <= maxRow; row += 1) {
        for (let col = minCol; col <= maxCol; col += 1) {
          const marchingIndex = this.getMarchingIndex(col, row, sample);
          const polygons = FILL_POLYGONS[marchingIndex];
          if (!polygons?.length) continue;
          const x = col * step;
          const y = row * step;
          for (const polygon of polygons) this.tracePolygon(ctx, x, y, step, polygon);
        }
      }
    } finally {
      this.finishTerrainRebuildDebug(debug, {
        tilesProcessed: Math.max(0, maxCol - minCol + 1) * Math.max(0, maxRow - minRow + 1),
        chunksRebuilt: this.countChunksForBounds(bounds),
        fullPlanetRebuild: false,
        fromMining: this.isRecentMiningEdit(),
      });
    }
  }

  buildMarchingPath(ctx, predicate, bounds = null, cacheKey = null, options = VISUAL_CONTOUR_OPTIONS) {
    if (bounds) {
      const loops = this.buildContourLoopsInBounds(predicate, bounds, options);
      for (const loop of loops) {
        this.traceContourLoop(ctx, loop.points, options);
      }
      return;
    }
    const loops = this.getContourLoops(predicate, cacheKey, options);
    for (const loop of loops) {
      this.traceContourLoop(ctx, loop.points, options);
    }
  }

  getContourLoops(predicate, cacheKey = null, options = VISUAL_CONTOUR_OPTIONS) {
    const key = cacheKey || null;
    if (key && this.contourCache.has(key)) return this.contourCache.get(key);
    const loops = this.buildContourLoops(predicate, options);
    if (key) this.contourCache.set(key, loops);
    return loops;
  }

  getContourStep(options = VISUAL_CONTOUR_OPTIONS) {
    const subdivisions = Math.max(1, options.sampleSubdivisions || 1);
    return this.cellSize / subdivisions;
  }

  samplePredicateDensity(predicate, x, y, options = VISUAL_CONTOUR_OPTIONS) {
    const size = this.cellSize;
    const radiusCells = Math.max(0.55, options.densityRadiusCells || 1);
    const thresholdFallback = predicate(Math.floor(x / size), Math.floor(y / size)) ? 1 : 0;
    const centerCol = x / size - 0.5;
    const centerRow = y / size - 0.5;
    const reach = Math.ceil(radiusCells + 0.5);
    const baseCol = Math.floor(centerCol);
    const baseRow = Math.floor(centerRow);
    let total = 0;
    let filled = 0;

    for (let row = baseRow - reach; row <= baseRow + reach; row += 1) {
      for (let col = baseCol - reach; col <= baseCol + reach; col += 1) {
        if (!this.isInside(col, row)) continue;
        const dx = centerCol - col;
        const dy = centerRow - row;
        const distance = Math.hypot(dx, dy);
        if (distance > radiusCells) continue;
        const falloff = 1 - distance / radiusCells;
        const weight = falloff * falloff * (3 - 2 * falloff);
        total += weight;
        if (predicate(col, row)) filled += weight;
      }
    }

    return total > 0 ? filled / total : thresholdFallback;
  }

  sampleContourNode(predicate, sampleCol, sampleRow, step, options = VISUAL_CONTOUR_OPTIONS) {
    const x = sampleCol * step;
    const y = sampleRow * step;
    const threshold = options.densityThreshold ?? 0.5;
    return this.samplePredicateDensity(predicate, x, y, options) >= threshold;
  }

  buildContourLoops(predicate, options = VISUAL_CONTOUR_OPTIONS) {
    const step = this.getContourStep(options);
    const segments = [];
    const maxCol = Math.max(1, Math.ceil(this.width / step));
    const maxRow = Math.max(1, Math.ceil(this.height / step));
    const sample = (col, row) => this.sampleContourNode(predicate, col, row, step, options);
    const debug = this.beginTerrainRebuildDebug('outline/contour generation', {
      chunksRebuilt: this.countChunksForBounds(null),
      fullPlanetRebuild: true,
      fromMining: this.isRecentMiningEdit(),
    });
    try {
      for (let row = 0; row < maxRow; row += 1) {
        for (let col = 0; col < maxCol; col += 1) {
          const index = this.getMarchingIndex(col, row, sample);
          const edgeSegments = EDGE_SEGMENTS[index];
          if (!edgeSegments?.length) continue;
          const x = col * step;
          const y = row * step;
          for (const segment of edgeSegments) {
            const a = POINTS[segment[0]];
            const b = POINTS[segment[1]];
            segments.push({
              a: { x: x + a[0] * step, y: y + a[1] * step },
              b: { x: x + b[0] * step, y: y + b[1] * step },
            });
          }
        }
      }
      return this.linkContourSegments(segments, options, step);
    } finally {
      this.finishTerrainRebuildDebug(debug, {
        tilesProcessed: maxCol * maxRow,
        chunksRebuilt: this.countChunksForBounds(null),
        fullPlanetRebuild: true,
        fromMining: this.isRecentMiningEdit(),
      });
    }
  }

  linkContourSegments(segments, options = VISUAL_CONTOUR_OPTIONS, gridStep = 1) {
    if (!segments.length) return [];
    const adjacency = new Map();
    const unused = new Set();
    segments.forEach((segment, index) => {
      unused.add(index);
      const aKey = pointKey(segment.a);
      const bKey = pointKey(segment.b);
      if (!adjacency.has(aKey)) adjacency.set(aKey, []);
      if (!adjacency.has(bKey)) adjacency.set(bKey, []);
      adjacency.get(aKey).push(index);
      adjacency.get(bKey).push(index);
    });

    const loops = [];
    while (unused.size) {
      const firstIndex = unused.values().next().value;
      const firstSegment = segments[firstIndex];
      unused.delete(firstIndex);
      const points = [firstSegment.a, firstSegment.b];
      let currentKey = pointKey(firstSegment.b);
      const startKey = pointKey(firstSegment.a);

      for (let guard = 0; guard < segments.length + 4; guard += 1) {
        if (currentKey === startKey) break;
        const candidates = adjacency.get(currentKey) || [];
        const nextIndex = candidates.find((candidate) => unused.has(candidate));
        if (nextIndex === undefined) break;
        unused.delete(nextIndex);
        const nextSegment = segments[nextIndex];
        const nextPoint = pointKey(nextSegment.a) === currentKey ? nextSegment.b : nextSegment.a;
        points.push(nextPoint);
        currentKey = pointKey(nextPoint);
      }

      const closed = currentKey === startKey;
      const cleaned = removeDuplicateContourPoints(points);
      if (cleaned.length < 3) continue;
      const smoothed = smoothContour(cleaned, options, gridStep);
      loops.push({
        points: smoothed,
        bounds: contourBounds(smoothed),
        closed,
      });
    }
    return loops;
  }

  traceContourLoop(ctx, points, options = VISUAL_CONTOUR_OPTIONS, { close = true } = {}) {
    if (!points?.length) return;
    if (!close || points.length < 4) {
      ctx.moveTo(points[0].x, points[0].y);
      for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index].x, points[index].y);
      if (close) ctx.closePath();
      return;
    }
    const roundAmount = clamp01(options.cornerRoundAmount ?? 0.1);
    if (roundAmount <= 0.001) {
      ctx.moveTo(points[0].x, points[0].y);
      for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index].x, points[index].y);
      if (close) ctx.closePath();
      return;
    }
    const offsetToward = (point, target) => ({
      x: point.x + (target.x - point.x) * roundAmount,
      y: point.y + (target.y - point.y) * roundAmount,
    });
    const first = points[0];
    const previousFirst = points[points.length - 1];
    const start = offsetToward(first, previousFirst);
    ctx.moveTo(start.x, start.y);
    for (let index = 0; index < points.length; index += 1) {
      const previous = points[(index - 1 + points.length) % points.length];
      const point = points[index];
      const next = points[(index + 1) % points.length];
      const before = offsetToward(point, previous);
      const after = offsetToward(point, next);
      ctx.lineTo(before.x, before.y);
      ctx.quadraticCurveTo(point.x, point.y, after.x, after.y);
    }
    if (close) ctx.closePath();
  }

  getMarchingIndex(col, row, predicate) {
    return (predicate(col, row) ? 8 : 0)
      | (predicate(col + 1, row) ? 4 : 0)
      | (predicate(col + 1, row + 1) ? 2 : 0)
      | (predicate(col, row + 1) ? 1 : 0);
  }

  tracePolygon(ctx, x, y, size, polygon) {
    const first = POINTS[polygon[0]];
    ctx.moveTo(x + first[0] * size, y + first[1] * size);
    for (let index = 1; index < polygon.length; index += 1) {
      const point = POINTS[polygon[index]];
      ctx.lineTo(x + point[0] * size, y + point[1] * size);
    }
    ctx.closePath();
  }

  drawOreVeins(ctx, bounds = null, { fastRedraw = false } = {}) {
    const oreMaterials = Object.keys(TERRAIN_MATERIALS)
      .map(Number)
      .filter((material) => material > 1 && !this.isConstructedMaterial(material) && this.hasMaterialInBounds(material, bounds, 3))
      .sort((a, b) => a - b);
    for (const material of oreMaterials) {
      const data = TERRAIN_MATERIALS[material];
      const predicate = (col, row) => this.getCell(col, row) === material;
      this.drawPatternInMask(
        ctx,
        predicate,
        `ore:${this.seed}:${material}:${data.color}:${data.edge}`,
        (tileCtx, width, height) => this.drawOreTextureTile(tileCtx, width, height, data, material),
        bounds,
        material >= 4 ? 0.95 : 0.86,
        `ore-mask:${material}`,
        MATERIAL_CONTOUR_OPTIONS,
      );
      if (fastRedraw) continue;
      this.drawOreFacets(ctx, material, data, bounds);
      this.strokeMarchingEdges(
        ctx,
        withAlpha(data.edge, material >= 4 ? 0.54 : 0.34),
        Math.max(1.3, this.cellSize * 0.08),
        bounds,
        predicate,
        `ore-mask:${material}`,
        MATERIAL_CONTOUR_OPTIONS,
      );
    }
  }

  drawOreFacets(ctx, material, data, bounds = null) {
    const scan = this.getRoughnessBounds(bounds, 2);
    const size = this.cellSize;
    ctx.save();
    this.clipMarchingPath(ctx, (col, row) => this.getCell(col, row) === material, bounds, `ore-mask:${material}`, MATERIAL_CONTOUR_OPTIONS);
    for (let row = scan.minRow; row <= scan.maxRow; row += 1) {
      for (let col = scan.minCol; col <= scan.maxCol; col += 1) {
        if (this.getCell(col, row) !== material) continue;
        const baseChance = material >= 4 ? 0.7 : 0.42;
        if (hash2D(col, row, this.seed, material * 809) > baseChance) continue;
        const facetCount = 1 + Number(material >= 4 && hash2D(row, col, this.seed, material * 811) > 0.72);
        for (let index = 0; index < facetCount; index += 1) {
          const salt = material * 823 + index * 47;
          const x = col * size + size * (0.18 + hash2D(col, row, this.seed, salt) * 0.64);
          const y = row * size + size * (0.18 + hash2D(row, col, this.seed, salt + 7) * 0.64);
          const radius = size * (0.08 + hash2D(col + index, row, this.seed, salt + 13) * 0.18);
          const angle = hash2D(row, col + index, this.seed, salt + 19) * Math.PI * 2;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(angle);
          ctx.globalAlpha = material >= 4 ? 0.45 : 0.24;
          ctx.fillStyle = withAlpha(mixHex(data.edge, '#ffffff', 0.22), material >= 4 ? 0.65 : 0.34);
          ctx.beginPath();
          if (material === 4 || material === 5 || material === 8 || material === 9) {
            ctx.moveTo(0, -radius * 1.5);
            ctx.lineTo(radius * 1.1, 0);
            ctx.lineTo(0, radius * 1.5);
            ctx.lineTo(-radius * 0.9, 0);
          } else {
            ctx.ellipse(0, 0, radius * 1.8, radius * 0.72, 0, 0, Math.PI * 2);
          }
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }
    }
    ctx.restore();
  }

  drawConstructedMaterials(ctx, bounds = null) {
    for (const material of CONSTRUCTED_MATERIAL_IDS) {
      if (!this.hasMaterialInBounds(material, bounds, 1)) continue;
      this.drawConstructedMaterial(ctx, material, bounds);
    }
  }

  drawConstructedMaterial(ctx, materialId, bounds = null) {
    const data = TERRAIN_MATERIALS[materialId] || TERRAIN_MATERIALS[10];
    const size = this.cellSize;
    const scan = this.getRoughnessBounds(bounds, 1);
    const base = data.color || '#465462';
    const top = mixHex(base, '#ffffff', 0.18);
    const bottom = mixHex(base, '#05070b', 0.18);
    const edge = data.edge || '#9fafbd';
    const shadow = mixHex(base, '#000000', 0.55);
    const rect = this.getDrawRect(scan, size * 0.5);

    ctx.save();
    ctx.beginPath();
    for (let row = scan.minRow; row <= scan.maxRow; row += 1) {
      for (let col = scan.minCol; col <= scan.maxCol; col += 1) {
        if (this.getCell(col, row) !== materialId) continue;
        const x = col * size;
        const y = row * size;
        ctx.rect(x, y, size, size);
      }
    }
    const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, top);
    gradient.addColorStop(0.52, base);
    gradient.addColorStop(1, bottom);
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.save();
    ctx.clip();
    this.drawConstructedArtTexture(ctx, materialId, scan);
    ctx.globalAlpha = 0.42;
    ctx.strokeStyle = withAlpha(mixHex(edge, '#ffffff', 0.12), 0.18);
    ctx.lineWidth = Math.max(0.7, size * 0.035);
    const spacing = size * 2.35;
    const diagonalReach = rect.width + rect.height + spacing * 2;
    for (let offset = -rect.height - spacing; offset < rect.width + spacing; offset += spacing) {
      ctx.beginPath();
      ctx.moveTo(rect.x + offset, rect.y + rect.height + size * 0.3);
      ctx.lineTo(rect.x + offset + diagonalReach, rect.y - size * 0.3);
      ctx.stroke();
    }

    const speckStep = Math.max(1, Math.floor(size * 0.9));
    ctx.fillStyle = withAlpha(mixHex(edge, '#ffffff', 0.18), 0.1);
    for (let row = scan.minRow; row <= scan.maxRow; row += 1) {
      for (let col = scan.minCol; col <= scan.maxCol; col += 1) {
        if (this.getCell(col, row) !== materialId) continue;
        if (hash2D(col, row, this.seed, materialId * 79) <= 0.7) continue;
        const x = col * size + size * (0.18 + hash2D(row, col, this.seed, materialId * 83) * 0.44);
        const y = row * size + size * (0.18 + hash2D(col, row, this.seed, materialId * 89) * 0.44);
        ctx.fillRect(x, y, Math.max(1, speckStep * 0.12), Math.max(1, speckStep * 0.12));
      }
    }
    ctx.restore();

    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 2;
    for (let pass = 0; pass < 2; pass += 1) {
      ctx.strokeStyle = pass === 0 ? withAlpha(shadow, 0.82) : withAlpha(edge, 0.68);
      ctx.lineWidth = pass === 0 ? Math.max(2, size * 0.13) : Math.max(1, size * 0.055);
      ctx.beginPath();
      for (let row = scan.minRow; row <= scan.maxRow; row += 1) {
        for (let col = scan.minCol; col <= scan.maxCol; col += 1) {
          if (this.getCell(col, row) !== materialId) continue;
          const x = col * size;
          const y = row * size;
          if (this.getCell(col, row - 1) !== materialId) {
            ctx.moveTo(x, y);
            ctx.lineTo(x + size, y);
          }
          if (this.getCell(col + 1, row) !== materialId) {
            ctx.moveTo(x + size, y);
            ctx.lineTo(x + size, y + size);
          }
          if (this.getCell(col, row + 1) !== materialId) {
            ctx.moveTo(x + size, y + size);
            ctx.lineTo(x, y + size);
          }
          if (this.getCell(col - 1, row) !== materialId) {
            ctx.moveTo(x, y + size);
            ctx.lineTo(x, y);
          }
        }
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  drawConstructedArtTexture(ctx, materialId, scan) {
    if (!isGameArtReady()) return;
    const size = this.cellSize;
    const key = getTerrainArtKey(materialId, this.biome);
    const overlap = size * 0.08;
    for (let row = scan.minRow; row <= scan.maxRow; row += 1) {
      for (let col = scan.minCol; col <= scan.maxCol; col += 1) {
        if (this.getCell(col, row) !== materialId) continue;
        const seed = hash2D(col, row, this.seed, materialId * 701) * 100000;
        drawGameArtTexture(ctx, key, col * size - overlap, row * size - overlap, size + overlap * 2, size + overlap * 2, {
          alpha: materialId === 11 ? 0.74 : 0.62,
          seed,
          sourceJitter: 0.24,
          smoothing: true,
          tint: materialId === 11 ? 'rgba(118, 243, 255, 0.08)' : '',
        });
        const rightSame = this.getCell(col + 1, row) === materialId;
        const downSame = this.getCell(col, row + 1) === materialId;
        ctx.save();
        ctx.globalAlpha = 0.12;
        ctx.strokeStyle = 'rgba(226, 242, 255, 0.65)';
        ctx.lineWidth = Math.max(0.7, size * 0.026);
        ctx.beginPath();
        if (rightSame) {
          ctx.moveTo((col + 1) * size, row * size + size * 0.22);
          ctx.lineTo((col + 1) * size, row * size + size * 0.78);
        }
        if (downSame) {
          ctx.moveTo(col * size + size * 0.22, (row + 1) * size);
          ctx.lineTo(col * size + size * 0.78, (row + 1) * size);
        }
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  drawRockTexture(ctx, bounds = null, { fastRedraw = false } = {}) {
    const palette = BIOME_PALETTES[this.biome] || BIOME_PALETTES.scrap;
    this.drawPatternInMask(
      ctx,
      (col, row) => this.isNaturalSolidCell(col, row),
      `stone:${this.seed}:${this.biome}`,
      (tileCtx, width, height) => this.drawStoneTextureTile(tileCtx, width, height, palette),
      bounds,
      1,
      'natural-solid',
    );
    if (!fastRedraw) this.drawStoneCracks(ctx, palette, bounds);
  }

  drawStoneTextureTile(ctx, width, height, palette) {
    const random = createRandom(hashString(`${this.seed}:${this.biome}:stone-texture`));
    ctx.clearRect(0, 0, width, height);
    if (isGameArtReady()) {
      drawGameArtTexture(ctx, getTerrainArtKey(1, this.biome), 0, 0, width, height, {
        alpha: 0.38,
        seed: hashString(`${this.seed}:${this.biome}:stone-art`),
        sourceJitter: 0.26,
        tint: withAlpha(palette.base || palette.deep || '#6b625a', 0.32),
      });
    }
    for (let i = 0; i < 95; i += 1) {
      const x = random() * width;
      const y = random() * height;
      const radius = 0.7 + random() * 2.4;
      ctx.fillStyle = random() > 0.48
        ? withAlpha(mixHex(palette.edge, '#ffffff', 0.12), 0.11 + random() * 0.12)
        : withAlpha(mixHex(palette.deep, '#000000', 0.16), 0.12 + random() * 0.16);
      ctx.beginPath();
      ctx.ellipse(x, y, radius * (0.65 + random()), radius * (0.5 + random() * 0.8), random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 20; i += 1) {
      const x = random() * width;
      const y = random() * height;
      const radius = 10 + random() * 30;
      const gradient = ctx.createRadialGradient(x, y, 1, x, y, radius);
      gradient.addColorStop(0, withAlpha(random() > 0.5 ? palette.top : palette.deep, 0.12));
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawOreTextureTile(ctx, width, height, data, material) {
    if (data.textureSrc) {
      const drawnTexture = this.drawImageOreTextureTile(ctx, width, height, data);
      if (drawnTexture) return true;
    }
    const random = createRandom(hashString(`${this.seed}:${data.id}:ore-texture`));
    const base = mixHex(data.color, '#1b1e25', material >= 4 ? 0.08 : 0.18);
    const glow = mixHex(data.edge, '#ffffff', material >= 4 ? 0.16 : 0.1);
    ctx.fillStyle = withAlpha(base, material >= 4 ? 0.72 : 0.58);
    ctx.fillRect(0, 0, width, height);
    if (isGameArtReady()) {
      drawGameArtTexture(ctx, getTerrainArtKey(material, this.biome), 0, 0, width, height, {
        alpha: material >= 4 ? 0.56 : 0.42,
        seed: hashString(`${this.seed}:${data.id}:ore-art`),
        sourceJitter: material >= 4 ? 0.18 : 0.28,
        tint: withAlpha(data.color, material >= 4 ? 0.16 : 0.24),
      });
    }
    for (let i = 0; i < 42; i += 1) {
      const x = random() * width;
      const y = random() * height;
      const radius = 3 + random() * (material >= 4 ? 11 : 8);
      ctx.fillStyle = withAlpha(random() > 0.4 ? glow : data.color, 0.08 + random() * 0.16);
      ctx.beginPath();
      if (material === 4 || material === 5 || material === 8 || material === 9) {
        ctx.moveTo(x, y - radius);
        ctx.lineTo(x + radius * (0.55 + random()), y);
        ctx.lineTo(x, y + radius);
        ctx.lineTo(x - radius * (0.55 + random()), y);
        ctx.closePath();
      } else {
        ctx.ellipse(x, y, radius * (0.85 + random() * 0.9), radius * (0.36 + random() * 0.52), random() * Math.PI, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    for (let i = 0; i < 18; i += 1) {
      ctx.strokeStyle = withAlpha(glow, material >= 4 ? 0.12 : 0.08);
      ctx.lineWidth = 0.8 + random() * 1.4;
      const x = random() * width;
      const y = random() * height;
      const length = 14 + random() * 38;
      const angle = random() * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(
        x + Math.cos(angle + 0.8) * length * 0.35,
        y + Math.sin(angle + 0.8) * length * 0.35,
        x + Math.cos(angle) * length,
        y + Math.sin(angle) * length,
      );
      ctx.stroke();
    }
    return !data.textureSrc;
  }

  drawImageOreTextureTile(ctx, width, height, data) {
    const image = getTerrainTextureImage(data.textureSrc);
    if (!image?.complete || !image.naturalWidth) return false;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = mixHex(data.color || '#545a73', '#080a12', 0.32);
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const scale = clamp(data.textureScale ?? 1, 0.55, 1.25);
    const overlap = Math.max(0, data.textureOverlap ?? 0);
    const drawWidth = width * scale;
    const drawHeight = height * scale;
    const strideX = Math.max(1, drawWidth - overlap);
    const strideY = Math.max(1, drawHeight - overlap);
    for (let y = -strideY; y < height + strideY; y += strideY) {
      for (let x = -strideX; x < width + strideX; x += strideX) {
        ctx.drawImage(image, x, y, drawWidth + overlap, drawHeight + overlap);
      }
    }
    ctx.globalCompositeOperation = 'source-atop';
    const glow = ctx.createRadialGradient(width * 0.45, height * 0.38, 4, width * 0.5, height * 0.5, width * 0.7);
    glow.addColorStop(0, 'rgba(169, 136, 255, 0.1)');
    glow.addColorStop(1, 'rgba(28, 31, 45, 0.035)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
    return true;
  }

  drawStoneCracks(ctx, palette, bounds = null) {
    const scan = this.getRoughnessBounds(bounds, 2);
    const size = this.cellSize;
    ctx.save();
    this.clipNaturalMass(ctx, bounds);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let row = scan.minRow; row <= scan.maxRow; row += 1) {
      for (let col = scan.minCol; col <= scan.maxCol; col += 1) {
        if (!this.isNaturalSolidCell(col, row)) continue;
        const material = this.getCell(col, row);
        const chance = material === 1 ? 0.16 : 0.1;
        if (hash2D(col, row, this.seed, material * 887) > chance) continue;
        const crackCount = 1 + Number(hash2D(row, col, this.seed, material * 889) > 0.86);
        for (let index = 0; index < crackCount; index += 1) {
          const salt = material * 907 + index * 53;
          const x = col * size + size * (0.14 + hash2D(col, row, this.seed, salt) * 0.72);
          const y = row * size + size * (0.14 + hash2D(row, col, this.seed, salt + 5) * 0.72);
          const length = 7 + hash2D(col + index, row, this.seed, salt + 11) * 22;
          const angle = hash2D(row, col + index, this.seed, salt + 17) * Math.PI * 2;
          const bright = hash2D(col, row, this.seed, salt + 23) > 0.45;
          const alpha = bright
            ? 0.1 + hash2D(row, col, this.seed, salt + 29) * 0.08
            : 0.12 + hash2D(col, row, this.seed, salt + 31) * 0.1;
          ctx.strokeStyle = bright
            ? withAlpha(mixHex(palette.edge, '#ffffff', 0.08), alpha)
            : withAlpha(mixHex(palette.deep, '#000000', 0.16), alpha);
          ctx.lineWidth = 0.8 + hash2D(row, col, this.seed, salt + 37) * 0.8;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(
            x + Math.cos(angle + 0.7) * length * 0.4,
            y + Math.sin(angle + 0.7) * length * 0.4,
            x + Math.cos(angle) * length,
            y + Math.sin(angle) * length,
          );
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  getMaterialRoughnessStyle(materialId) {
    const material = TERRAIN_MATERIALS[materialId] || TERRAIN_MATERIALS[1];
    return {
      ...TERRAIN_ROUGHNESS,
      ...(TERRAIN_ROUGHNESS.materialStyles?.[material.id] || {}),
    };
  }

  getRoughnessBounds(bounds = null, padding = 2) {
    if (!bounds) {
      return {
        minCol: 0,
        maxCol: this.cols - 1,
        minRow: 0,
        maxRow: this.rows - 1,
      };
    }
    return {
      minCol: clamp(bounds.minCol - padding, 0, this.cols - 1),
      maxCol: clamp(bounds.maxCol + padding, 0, this.cols - 1),
      minRow: clamp(bounds.minRow - padding, 0, this.rows - 1),
      maxRow: clamp(bounds.maxRow + padding, 0, this.rows - 1),
    };
  }

  getExposedEdges(col, row) {
    const material = this.getCell(col, row);
    if (material <= 0 || this.isConstructedMaterial(material)) return [];
    return EDGE_DIRECTION_NAMES.filter((directionName) => {
      const direction = EDGE_DIRECTIONS[directionName];
      return !this.isNaturalSolidCell(col + direction.dx, row + direction.dy);
    });
  }

  forEachExposedTerrainCell(bounds, callback) {
    const scan = this.getRoughnessBounds(bounds);
    const stats = {
      tilesProcessed: 0,
      exposedCells: 0,
      roughEdgesDrawn: 0,
    };
    for (let row = scan.minRow; row <= scan.maxRow; row += 1) {
      for (let col = scan.minCol; col <= scan.maxCol; col += 1) {
        stats.tilesProcessed += 1;
        const material = this.getCell(col, row);
        if (material <= 0 || this.isConstructedMaterial(material)) continue;
        const edges = this.getExposedEdges(col, row);
        if (!edges.length) continue;
        stats.exposedCells += 1;
        stats.roughEdgesDrawn += edges.length;
        callback({ col, row, material, edges });
      }
    }
    return stats;
  }

  getEdgeBasePoint(col, row, directionName, t = 0) {
    const size = this.cellSize;
    const x = col * size;
    const y = row * size;
    switch (directionName) {
      case 'top':
        return { x: x + t * size, y };
      case 'right':
        return { x: x + size, y: y + t * size };
      case 'bottom':
        return { x: x + t * size, y: y + size };
      case 'left':
      default:
        return { x, y: y + t * size };
    }
  }

  getRoughEdgeData(col, row, directionName, materialId) {
    const key = `${col}:${row}:${directionName}:${materialId}`;
    if (this.roughEdgeCache.has(key)) return this.roughEdgeCache.get(key);
    this.recordTerrainRoughEdgeRegenerated(1);
    const direction = EDGE_DIRECTIONS[directionName];
    const style = this.getMaterialRoughnessStyle(materialId);
    const directionIndex = EDGE_DIRECTION_NAMES.indexOf(directionName) + 1;
    const segmentCount = clamp(Math.round(style.edgeSegmentCount || 5), 3, 9);
    const strength = Math.min(this.cellSize * 0.22, Math.max(0, style.edgeNoiseStrength ?? 2.8));
    const scale = Math.max(0.1, style.edgeNoiseScale ?? 0.72);
    const points = [];

    for (let index = 0; index <= segmentCount; index += 1) {
      const t = index / segmentCount;
      const base = this.getEdgeBasePoint(col, row, directionName, t);
      const endFade = index === 0 || index === segmentCount ? 0.42 : 1;
      const curveFade = 0.62 + Math.sin(t * Math.PI) * 0.38;
      const noise = signedHash2D(col * 17 + index * scale * 11, row * 19 + directionIndex, this.seed, materialId * 101 + directionIndex * 37);
      const tangentNoise = signedHash2D(col * 29 + index, row * 31 + directionIndex * 7, this.seed, materialId * 211 + directionIndex * 43);
      points.push({
        x: base.x + direction.normal.x * noise * strength * endFade * curveFade + direction.tangent.x * tangentNoise * strength * 0.18 * endFade,
        y: base.y + direction.normal.y * noise * strength * endFade * curveFade + direction.tangent.y * tangentNoise * strength * 0.18 * endFade,
      });
    }

    const chips = [];
    const chipChance = clamp01(style.chipChance ?? 0.42);
    const maxDepth = Math.min(this.cellSize * 0.35, Math.max(1, style.maxChipDepth ?? 6));
    for (let index = 0; index < segmentCount; index += 1) {
      const roll = hash2D(col * 41 + index, row * 47 + directionIndex, this.seed, materialId * 313 + directionIndex * 59);
      if (roll > chipChance * 0.62) continue;
      const t = (index + 0.32 + hash2D(col, row + index, this.seed, materialId * 67) * 0.36) / segmentCount;
      const width = this.cellSize * (0.08 + hash2D(col + index, row, this.seed, materialId * 83) * 0.1);
      const depth = maxDepth * (0.35 + hash2D(col, row, this.seed, materialId * 97 + index) * 0.65);
      chips.push({
        t: clamp01(t),
        width,
        depth,
        skew: signedHash2D(col, row, this.seed, materialId * 109 + index) * width * 0.45,
      });
    }

    const data = { directionName, direction, materialId, style, points, chips };
    this.roughEdgeCache.set(key, data);
    return data;
  }

  traceRoughEdge(ctx, points) {
    if (!points?.length) return;
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const point = points[index];
      const midX = (previous.x + point.x) * 0.5;
      const midY = (previous.y + point.y) * 0.5;
      ctx.quadraticCurveTo(previous.x, previous.y, midX, midY);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
  }

  isVisualSolidAt(x, y) {
    return this.samplePredicateDensity(
      (col, row) => this.isNaturalSolidCell(col, row),
      x,
      y,
      VISUAL_CONTOUR_OPTIONS,
    ) >= (VISUAL_CONTOUR_OPTIONS.densityThreshold ?? 0.5);
  }

  getContourPointAirNormal(point, tangent) {
    const tangentLength = Math.hypot(tangent.x, tangent.y) || 1;
    const tx = tangent.x / tangentLength;
    const ty = tangent.y / tangentLength;
    let normal = { x: -ty, y: tx };
    const sampleDistance = Math.max(3, this.cellSize * 0.34);
    const leftSolid = this.isVisualSolidAt(point.x + normal.x * sampleDistance, point.y + normal.y * sampleDistance);
    const rightSolid = this.isVisualSolidAt(point.x - normal.x * sampleDistance, point.y - normal.y * sampleDistance);
    if (leftSolid && !rightSolid) normal = { x: -normal.x, y: -normal.y };
    else if (leftSolid === rightSolid) {
      const centerX = point.x - this.planetCenterX;
      const centerY = point.y - this.planetCenterY;
      if (normal.x * centerX + normal.y * centerY < 0) normal = { x: -normal.x, y: -normal.y };
    }
    return normal;
  }

  getContourMaterialNear(point, airNormal) {
    const distances = [this.cellSize * 0.38, this.cellSize * 0.78, this.cellSize * 1.18];
    for (const distance of distances) {
      const sample = this.cellFromWorld(point.x - airNormal.x * distance, point.y - airNormal.y * distance);
      const material = this.getCell(sample.col, sample.row);
      if (material > 0) return material;
    }
    const fallback = this.cellFromWorld(point.x, point.y);
    return this.getCell(fallback.col, fallback.row) || 1;
  }

  getRoughContourLoops(bounds = null) {
    const cacheKey = 'natural-rough-contours';
    if (this.roughContourCache.has(cacheKey)) return this.roughContourCache.get(cacheKey);
    const sourceLoops = this.getContourLoops((col, row) => this.isNaturalSolidCell(col, row), 'natural-solid', VISUAL_CONTOUR_OPTIONS);
    const roughLoops = this.createRoughContourLoopsFromSource(sourceLoops);
    this.roughContourCache.set(cacheKey, roughLoops);
    return roughLoops;
  }

  buildContourLoopsInBounds(predicate, bounds, options = VISUAL_CONTOUR_OPTIONS) {
    const step = this.getContourStep(options);
    const padding = this.cellSize * 3;
    const minCol = clamp(Math.floor((bounds.minCol * this.cellSize - padding) / step), 0, Math.max(0, Math.ceil(this.width / step) - 1));
    const maxCol = clamp(Math.ceil(((bounds.maxCol + 1) * this.cellSize + padding) / step), 0, Math.max(0, Math.ceil(this.width / step) - 1));
    const minRow = clamp(Math.floor((bounds.minRow * this.cellSize - padding) / step), 0, Math.max(0, Math.ceil(this.height / step) - 1));
    const maxRow = clamp(Math.ceil(((bounds.maxRow + 1) * this.cellSize + padding) / step), 0, Math.max(0, Math.ceil(this.height / step) - 1));
    const sample = (col, row) => this.sampleContourNode(predicate, col, row, step, options);
    const segments = [];
    const debug = this.beginTerrainRebuildDebug('outline/contour generation', {
      bounds,
      chunksRebuilt: this.countChunksForBounds(bounds),
      fullPlanetRebuild: false,
      fromMining: this.isRecentMiningEdit(),
    });
    try {
      for (let row = minRow; row <= maxRow; row += 1) {
        for (let col = minCol; col <= maxCol; col += 1) {
          const index = this.getMarchingIndex(col, row, sample);
          const edgeSegments = EDGE_SEGMENTS[index];
          if (!edgeSegments?.length) continue;
          const x = col * step;
          const y = row * step;
          for (const segment of edgeSegments) {
            const a = POINTS[segment[0]];
            const b = POINTS[segment[1]];
            segments.push({
              a: { x: x + a[0] * step, y: y + a[1] * step },
              b: { x: x + b[0] * step, y: y + b[1] * step },
            });
          }
        }
      }
      return this.linkContourSegments(segments, options, step);
    } finally {
      this.finishTerrainRebuildDebug(debug, {
        tilesProcessed: Math.max(0, maxCol - minCol + 1) * Math.max(0, maxRow - minRow + 1),
        chunksRebuilt: this.countChunksForBounds(bounds),
        fullPlanetRebuild: false,
        fromMining: this.isRecentMiningEdit(),
      });
    }
  }

  createRoughContourLoopsFromSource(sourceLoops) {
    const roughLoops = sourceLoops.map((loop) => {
      const sourcePoints = loop.points || [];
      const points = [];
      const segmentCount = loop.closed === false ? sourcePoints.length - 1 : sourcePoints.length;
      for (let index = 0; index < segmentCount; index += 1) {
        const a = sourcePoints[index];
        const b = sourcePoints[(index + 1) % sourcePoints.length];
        const segmentLength = Math.hypot(b.x - a.x, b.y - a.y);
        const maxSubdivisions = Math.max(1, Math.floor(TERRAIN_ROUGHNESS.maxContourSubdivisions ?? 4));
        const segmentCellScale = Math.max(0.4, TERRAIN_ROUGHNESS.contourSegmentCellScale ?? 0.55);
        const subdivisions = Math.max(
          1,
          Math.min(maxSubdivisions, Math.ceil(segmentLength / Math.max(6, this.cellSize * segmentCellScale))),
        );
        for (let sub = 0; sub < subdivisions; sub += 1) {
          const t = sub / subdivisions;
          const base = {
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t,
          };
          const tangent = { x: b.x - a.x, y: b.y - a.y };
          const normal = this.getContourPointAirNormal(base, tangent);
          const material = this.getContourMaterialNear(base, normal);
          const style = this.getMaterialRoughnessStyle(material);
          const strength = Math.min(this.cellSize * 0.18, Math.max(0, style.edgeNoiseStrength ?? 2.8));
          const noiseScale = Math.max(0.1, style.edgeNoiseScale ?? 0.72);
          const salt = material * 131
            + Math.round(base.x * 0.73) * 17
            + Math.round(base.y * 0.73) * 31;
          const outwardNoise = signedHash2D(
            Math.round(base.x * noiseScale),
            Math.round(base.y * noiseScale),
            this.seed,
            salt,
          );
          const tangentNoise = signedHash2D(
            Math.round(base.y * noiseScale),
            Math.round(base.x * noiseScale),
            this.seed,
            salt + 211,
          );
          const tangentLength = Math.hypot(tangent.x, tangent.y) || 1;
          const tx = tangent.x / tangentLength;
          const ty = tangent.y / tangentLength;
          const outwardShift = Math.max(0, outwardNoise) * strength;
          points.push({
            x: base.x + normal.x * outwardShift + tx * tangentNoise * strength * 0.14,
            y: base.y + normal.y * outwardShift + ty * tangentNoise * strength * 0.14,
            baseX: base.x,
            baseY: base.y,
            normal,
            tangent: { x: tx, y: ty },
            material,
            style,
          });
        }
      }
      return {
        points,
        sourceBounds: loop.bounds,
        bounds: contourBounds(points),
        closed: loop.closed !== false,
      };
    }).filter((loop) => loop.points.length >= 3);
    return roughLoops;
  }

  getContourClipBounds(bounds = null) {
    if (!bounds) return null;
    return {
      minX: clamp(bounds.minCol * this.cellSize - this.cellSize * 3, 0, this.width),
      minY: clamp(bounds.minRow * this.cellSize - this.cellSize * 3, 0, this.height),
      maxX: clamp((bounds.maxCol + 1) * this.cellSize + this.cellSize * 3, 0, this.width),
      maxY: clamp((bounds.maxRow + 1) * this.cellSize + this.cellSize * 3, 0, this.height),
    };
  }

  traceRoughContourLoop(ctx, points, offset = 0, { close = true } = {}) {
    if (!points?.length) return;
    const getPoint = (point) => ({
      x: point.x - (point.normal?.x || 0) * offset,
      y: point.y - (point.normal?.y || 0) * offset,
    });
    const first = getPoint(points[0]);
    ctx.moveTo(first.x, first.y);
    const limit = close ? points.length : points.length - 1;
    for (let index = 1; index <= limit; index += 1) {
      const previous = getPoint(points[(index - 1 + points.length) % points.length]);
      const current = getPoint(points[index % points.length]);
      const midX = (previous.x + current.x) * 0.5;
      const midY = (previous.y + current.y) * 0.5;
      ctx.quadraticCurveTo(previous.x, previous.y, midX, midY);
    }
    if (close) ctx.closePath();
  }

  forEachRoughContourLoop(bounds, callback) {
    for (const loop of this.getVisibleRoughContourLoops(bounds)) {
      callback(loop);
    }
  }

  getVisibleRoughContourLoops(bounds = null) {
    const clipBounds = this.getContourClipBounds(bounds);
    return this.getRoughContourLoops(bounds)
      .filter((loop) => (
        !clipBounds
        || boundsOverlap(loop.bounds, clipBounds)
        || boundsOverlap(loop.sourceBounds, clipBounds)
      ));
  }

  drawExposedEdgeRoughness(ctx, bounds = null, { fastRedraw = false } = {}) {
    const debug = this.beginTerrainRebuildDebug('rough edge generation', {
      bounds,
      chunksRebuilt: this.countChunksForBounds(bounds),
      fullPlanetRebuild: !bounds,
      fromMining: this.isRecentMiningEdit(),
    });
    let stats = null;
    const outlineOnly = this.isRoughnessOutlineOnly();
    try {
      if (fastRedraw && !outlineOnly && TERRAIN_ROUGHNESS.fastRedrawSimple !== false) {
        stats = this.drawRoughEdgeLines(ctx, bounds);
        return;
      }
      if (bounds) {
        stats = this.drawLocalRoughContourLayer(ctx, bounds, { fastRedraw });
        return;
      }
      if (outlineOnly) {
        const loops = this.getRoughContourLoops(bounds);
        this.drawRoughContourLinesForLoops(ctx, loops);
        stats = {
          tilesProcessed: this.countCellsInBounds(bounds),
          roughEdgesDrawn: loops.length,
        };
        return;
      }
      if (TERRAIN_ROUGHNESS.chipCuts !== false) this.drawRoughContourChipCuts(ctx, bounds);
      if (TERRAIN_ROUGHNESS.edgeShadows !== false) this.drawRoughContourShadows(ctx, bounds);
      if (TERRAIN_ROUGHNESS.surfaceDetails !== false) this.drawRoughSurfaceDetails(ctx, bounds);
      if (TERRAIN_ROUGHNESS.pebbleLips !== false) this.drawRoughContourPebbleLips(ctx, bounds);
      this.drawRoughContourLines(ctx, bounds);
    } finally {
      this.finishTerrainRebuildDebug(debug, {
        tilesProcessed: stats?.tilesProcessed || this.countCellsInBounds(bounds),
        roughEdgesDrawn: stats?.roughEdgesDrawn || 0,
        chunksRebuilt: this.countChunksForBounds(bounds),
        fullPlanetRebuild: !bounds,
        fromMining: this.isRecentMiningEdit(),
      });
    }
  }

  drawLocalRoughContourLayer(ctx, bounds, { fastRedraw = false } = {}) {
    const loops = this.getLocalRoughContourLoops(bounds);
    if (!loops.length) {
      return {
        tilesProcessed: this.countCellsInBounds(bounds),
        roughEdgesDrawn: 0,
      };
    }
    if (TERRAIN_ROUGHNESS.edgeShadows !== false) {
      this.drawRoughContourShadowsForLoops(ctx, loops);
    }
    this.drawRoughContourLinesForLoops(ctx, loops);
    if (!fastRedraw && TERRAIN_ROUGHNESS.surfaceDetails !== false) {
      this.drawRoughSurfaceDetails(ctx, bounds);
    }
    return {
      tilesProcessed: this.countCellsInBounds(bounds),
      roughEdgesDrawn: loops.length,
    };
  }

  getLocalRoughContourLoops(bounds) {
    if (!bounds) return [];
    const clipBounds = this.getContourClipBounds(bounds);
    const sourceLoops = this.buildContourLoopsInBounds(
      (col, row) => this.isNaturalSolidCell(col, row),
      bounds,
      VISUAL_CONTOUR_OPTIONS,
    );
    return this.createRoughContourLoopsFromSource(sourceLoops)
      .filter((loop) => (
        !clipBounds
        || boundsOverlap(loop.bounds, clipBounds)
        || boundsOverlap(loop.sourceBounds, clipBounds)
      ));
  }

  getLocalRoughContourSegments(bounds) {
    const segments = [];
    this.forEachLocalRoughContourSegment(bounds, (segment) => segments.push(segment));
    return segments;
  }

  forEachLocalRoughContourSegment(bounds, callback) {
    if (!bounds) return;
    const step = this.getContourStep(VISUAL_CONTOUR_OPTIONS);
    const padding = this.cellSize * 4;
    const minCol = clamp(Math.floor((bounds.minCol * this.cellSize - padding) / step), 0, Math.max(0, Math.ceil(this.width / step) - 1));
    const maxCol = clamp(Math.ceil(((bounds.maxCol + 1) * this.cellSize + padding) / step), 0, Math.max(0, Math.ceil(this.width / step) - 1));
    const minRow = clamp(Math.floor((bounds.minRow * this.cellSize - padding) / step), 0, Math.max(0, Math.ceil(this.height / step) - 1));
    const maxRow = clamp(Math.ceil(((bounds.maxRow + 1) * this.cellSize + padding) / step), 0, Math.max(0, Math.ceil(this.height / step) - 1));
    const clipBounds = this.getContourClipBounds(bounds);
    const sample = (col, row) => this.sampleContourNode(
      (x, y) => this.isNaturalSolidCell(x, y),
      col,
      row,
      step,
      VISUAL_CONTOUR_OPTIONS,
    );

    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        const marchingIndex = this.getMarchingIndex(col, row, sample);
        const edgeSegments = EDGE_SEGMENTS[marchingIndex];
        if (!edgeSegments?.length) continue;
        const originX = col * step;
        const originY = row * step;
        for (const segment of edgeSegments) {
          const start = POINTS[segment[0]];
          const end = POINTS[segment[1]];
          const a = { x: originX + start[0] * step, y: originY + start[1] * step };
          const b = { x: originX + end[0] * step, y: originY + end[1] * step };
          if (clipBounds && !boundsOverlap({
            minX: Math.min(a.x, b.x),
            minY: Math.min(a.y, b.y),
            maxX: Math.max(a.x, b.x),
            maxY: Math.max(a.y, b.y),
          }, clipBounds)) continue;
          callback(this.createLocalRoughContourSegment(a, b));
        }
      }
    }
  }

  createLocalRoughContourSegment(a, b) {
    const tangent = { x: b.x - a.x, y: b.y - a.y };
    const length = Math.hypot(tangent.x, tangent.y) || 1;
    const mid = { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
    const normal = this.getContourPointAirNormal(mid, tangent);
    const material = this.getContourMaterialNear(mid, normal);
    const style = this.getMaterialRoughnessStyle(material);
    const strength = Math.min(this.cellSize * 0.14, Math.max(0, style.edgeNoiseStrength ?? 2.8) * 0.72);
    const tx = tangent.x / length;
    const ty = tangent.y / length;
    const roughPoint = (point, salt, pointStrength = strength) => {
      const qx = Math.round(point.x * 0.45);
      const qy = Math.round(point.y * 0.45);
      const pointSalt = material * 811
        + Math.round(point.x * 0.73) * 19
        + Math.round(point.y * 0.73) * 37
        + salt;
      const normalNoise = signedHash2D(qx, qy, this.seed, pointSalt);
      const tangentNoise = signedHash2D(qy, qx, this.seed, pointSalt + 211);
      const normalPush = Math.max(0, normalNoise) * pointStrength;
      return {
        x: point.x + normal.x * normalPush + tx * tangentNoise * pointStrength * 0.12,
        y: point.y + normal.y * normalPush + ty * tangentNoise * pointStrength * 0.12,
      };
    };
    return {
      a: roughPoint(a, 0, strength * 0.52),
      mid: roughPoint(mid, 97, strength),
      b: roughPoint(b, 0, strength * 0.52),
      normal,
      material,
      style,
    };
  }

  traceLocalRoughContourSegment(ctx, segment, offset = 0) {
    const offsetPoint = (point) => ({
      x: point.x - segment.normal.x * offset,
      y: point.y - segment.normal.y * offset,
    });
    const a = offsetPoint(segment.a);
    const mid = offsetPoint(segment.mid);
    const b = offsetPoint(segment.b);
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(mid.x, mid.y, b.x, b.y);
  }

  drawLocalRoughContourShadows(ctx, segments) {
    if (!segments?.length) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(5, 8, 14, 0.28)';
    ctx.lineWidth = Math.max(3.8, this.cellSize * 0.19);
    ctx.beginPath();
    segments.forEach((segment) => {
      this.traceLocalRoughContourSegment(ctx, segment, this.cellSize * 0.08);
    });
    ctx.stroke();
    ctx.restore();
  }

  drawLocalRoughContourLines(ctx, segments) {
    if (!segments?.length) return;
    const palette = BIOME_PALETTES[this.biome] || BIOME_PALETTES.scrap;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(5, 11, 19, 0.62)';
    ctx.lineWidth = Math.max(2.5, this.cellSize * 0.16);
    ctx.beginPath();
    segments.forEach((segment) => {
      this.traceLocalRoughContourSegment(ctx, segment);
    });
    ctx.stroke();
    ctx.strokeStyle = withAlpha(palette.edge, 0.72);
    ctx.lineWidth = Math.max(1.05, this.cellSize * 0.06);
    ctx.beginPath();
    segments.forEach((segment) => {
      this.traceLocalRoughContourSegment(ctx, segment);
    });
    ctx.stroke();
    ctx.restore();
  }

  drawRoughContourChipCuts(ctx, bounds = null) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,1)';
    this.forEachRoughContourLoop(bounds, (loop) => {
      const points = loop.points;
      const step = Math.max(3, Math.floor(points.length / Math.max(12, Math.min(52, points.length * 0.28))));
      for (let index = 0; index < points.length; index += step) {
        const point = points[index];
        const style = point.style || TERRAIN_ROUGHNESS;
        const pointX = Math.round((point.baseX ?? point.x) * 0.73);
        const pointY = Math.round((point.baseY ?? point.y) * 0.73);
        const pointSalt = point.material * 701 + pointX * 17 + pointY * 31;
        if (hash2D(pointX, pointY, this.seed, pointSalt) > (style.chipChance ?? 0.42) * 0.55) continue;
        const width = this.cellSize * (0.08 + hash2D(pointX, pointY, this.seed, pointSalt + 19) * 0.11);
        const depth = Math.min(this.cellSize * 0.34, (style.maxChipDepth ?? 6) * (0.55 + hash2D(pointY, pointX, this.seed, pointSalt + 27) * 0.75));
        const inward = { x: -point.normal.x, y: -point.normal.y };
        ctx.beginPath();
        ctx.moveTo(point.x - point.tangent.x * width, point.y - point.tangent.y * width);
        ctx.lineTo(point.x + point.tangent.x * width, point.y + point.tangent.y * width);
        ctx.lineTo(
          point.x + inward.x * depth + point.tangent.x * signedHash2D(pointX, pointY, this.seed, pointSalt + 33) * width * 0.45,
          point.y + inward.y * depth + point.tangent.y * signedHash2D(pointX, pointY, this.seed, pointSalt + 33) * width * 0.45,
        );
        ctx.closePath();
        ctx.fill();
      }
    });
    ctx.restore();
  }

  drawRoughContourShadows(ctx, bounds = null) {
    this.drawRoughContourShadowsForLoops(ctx, this.getVisibleRoughContourLoops(bounds));
  }

  drawRoughContourShadowsForLoops(ctx, loops) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const loop of loops) {
      const averageShadow = loop.points.reduce((total, point) => total + (point.style?.edgeShadowStrength ?? 0.28), 0) / Math.max(1, loop.points.length);
      ctx.strokeStyle = `rgba(5, 8, 14, ${clamp01(averageShadow)})`;
      ctx.lineWidth = Math.max(3.8, this.cellSize * 0.19);
      ctx.beginPath();
      this.traceRoughContourLoop(ctx, loop.points, this.cellSize * 0.08, { close: loop.closed !== false });
      ctx.stroke();
    }
    ctx.restore();
  }

  drawRoughContourLines(ctx, bounds = null) {
    this.drawRoughContourLinesForLoops(ctx, this.getVisibleRoughContourLoops(bounds));
  }

  drawRoughContourLinesForLoops(ctx, loops) {
    const palette = BIOME_PALETTES[this.biome] || BIOME_PALETTES.scrap;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const loop of loops) {
      ctx.strokeStyle = 'rgba(5, 11, 19, 0.62)';
      ctx.lineWidth = Math.max(2.5, this.cellSize * 0.16);
      ctx.beginPath();
      this.traceRoughContourLoop(ctx, loop.points, 0, { close: loop.closed !== false });
      ctx.stroke();
      ctx.strokeStyle = withAlpha(palette.edge, 0.72);
      ctx.lineWidth = Math.max(1.05, this.cellSize * 0.06);
      ctx.beginPath();
      this.traceRoughContourLoop(ctx, loop.points, 0, { close: loop.closed !== false });
      ctx.stroke();
    }
    ctx.restore();
  }

  drawRoughContourPebbleLips(ctx, bounds = null) {
    ctx.save();
    this.forEachRoughContourLoop(bounds, (loop) => {
      const points = loop.points;
      const step = Math.max(7, Math.floor(points.length / 42));
      for (let index = 0; index < points.length; index += step) {
        const point = points[index];
        const style = point.style || TERRAIN_ROUGHNESS;
        const pointX = Math.round((point.baseX ?? point.x) * 0.73);
        const pointY = Math.round((point.baseY ?? point.y) * 0.73);
        const pointSalt = point.material * 751 + pointX * 17 + pointY * 31;
        if (hash2D(pointX, pointY, this.seed, pointSalt) > (style.pebbleLipChance ?? 0.16)) continue;
        const materialData = TERRAIN_MATERIALS[point.material] || TERRAIN_MATERIALS[1];
        const radius = this.cellSize * (0.04 + hash2D(pointY, pointX, this.seed, pointSalt + 6) * 0.045);
        ctx.save();
        ctx.translate(point.x + point.normal.x * radius * 0.42, point.y + point.normal.y * radius * 0.42);
        ctx.rotate(hash2D(pointX, pointY, this.seed, pointSalt + 10) * Math.PI);
        ctx.fillStyle = withAlpha(mixHex(materialData.color || '#6b625a', '#ffffff', 0.08), 0.62);
        ctx.strokeStyle = 'rgba(5, 11, 19, 0.34)';
        ctx.lineWidth = Math.max(0.8, radius * 0.36);
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * 1.45, radius * 0.85, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    });
    ctx.restore();
  }

  drawRoughEdgeChipCuts(ctx, bounds = null) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,1)';
    this.forEachExposedTerrainCell(bounds, ({ col, row, material, edges }) => {
      edges.forEach((directionName) => {
        const data = this.getRoughEdgeData(col, row, directionName, material);
        data.chips.forEach((chip) => {
          const base = this.getEdgeBasePoint(col, row, directionName, chip.t);
          const inward = { x: -data.direction.normal.x, y: -data.direction.normal.y };
          const tangent = data.direction.tangent;
          ctx.beginPath();
          ctx.moveTo(base.x - tangent.x * chip.width, base.y - tangent.y * chip.width);
          ctx.lineTo(base.x + tangent.x * chip.width, base.y + tangent.y * chip.width);
          ctx.lineTo(
            base.x + inward.x * chip.depth + tangent.x * chip.skew,
            base.y + inward.y * chip.depth + tangent.y * chip.skew,
          );
          ctx.closePath();
          ctx.fill();
        });
      });
      this.drawRoughCornerCuts(ctx, col, row, material, edges);
    });
    ctx.restore();
  }

  drawRoughCornerCuts(ctx, col, row, material, edges) {
    const style = this.getMaterialRoughnessStyle(material);
    const chance = clamp01(style.cornerBreakChance ?? 0.28);
    const edgeSet = new Set(edges);
    const size = this.cellSize;
    const left = col * size;
    const top = row * size;
    const corners = {
      tl: { x: left, y: top, ix: 1, iy: 1 },
      tr: { x: left + size, y: top, ix: -1, iy: 1 },
      br: { x: left + size, y: top + size, ix: -1, iy: -1 },
      bl: { x: left, y: top + size, ix: 1, iy: -1 },
    };
    Object.entries(CORNER_EXPOSED_EDGES).forEach(([cornerName, requiredEdges], index) => {
      if (!requiredEdges.every((edge) => edgeSet.has(edge))) return;
      if (hash2D(col, row, this.seed, material * 401 + index * 73) > chance) return;
      const corner = corners[cornerName];
      const depthA = size * (0.12 + hash2D(col, row, this.seed, material * 409 + index) * 0.12);
      const depthB = size * (0.1 + hash2D(row, col, this.seed, material * 419 + index) * 0.1);
      ctx.beginPath();
      ctx.moveTo(corner.x, corner.y);
      ctx.lineTo(corner.x + corner.ix * depthA, corner.y);
      ctx.lineTo(corner.x + corner.ix * depthA * 0.45, corner.y + corner.iy * depthB * 0.72);
      ctx.lineTo(corner.x, corner.y + corner.iy * depthB);
      ctx.closePath();
      ctx.fill();
    });
  }

  drawRoughEdgeShadows(ctx, bounds = null) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    this.forEachExposedTerrainCell(bounds, ({ col, row, material, edges }) => {
      const style = this.getMaterialRoughnessStyle(material);
      const alpha = clamp01(style.edgeShadowStrength ?? 0.28);
      edges.forEach((directionName) => {
        const data = this.getRoughEdgeData(col, row, directionName, material);
        ctx.save();
        ctx.translate(-data.direction.normal.x * this.cellSize * 0.08, -data.direction.normal.y * this.cellSize * 0.08);
        ctx.strokeStyle = `rgba(5, 8, 14, ${alpha})`;
        ctx.lineWidth = Math.max(3.5, this.cellSize * 0.18);
        ctx.beginPath();
        this.traceRoughEdge(ctx, data.points);
        ctx.stroke();
        ctx.restore();
      });
    });
    ctx.restore();
  }

  drawRoughEdgeLines(ctx, bounds = null) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const stats = this.forEachExposedTerrainCell(bounds, ({ col, row, material, edges }) => {
      const materialData = TERRAIN_MATERIALS[material] || TERRAIN_MATERIALS[1];
      edges.forEach((directionName) => {
        const data = this.getRoughEdgeData(col, row, directionName, material);
        ctx.strokeStyle = 'rgba(5, 11, 19, 0.58)';
        ctx.lineWidth = Math.max(2.2, this.cellSize * 0.15);
        ctx.beginPath();
        this.traceRoughEdge(ctx, data.points);
        ctx.stroke();
        ctx.strokeStyle = withAlpha(materialData.edge || '#91867a', material >= 4 ? 0.76 : 0.58);
        ctx.lineWidth = Math.max(1.1, this.cellSize * 0.055);
        ctx.beginPath();
        this.traceRoughEdge(ctx, data.points);
        ctx.stroke();
      });
    });
    ctx.restore();
    return stats;
  }

  drawRoughPebbleLips(ctx, bounds = null) {
    ctx.save();
    this.forEachExposedTerrainCell(bounds, ({ col, row, material, edges }) => {
      const materialData = TERRAIN_MATERIALS[material] || TERRAIN_MATERIALS[1];
      const style = this.getMaterialRoughnessStyle(material);
      edges.forEach((directionName, edgeIndex) => {
        if (hash2D(col, row, this.seed, material * 503 + edgeIndex * 37) > (style.pebbleLipChance ?? 0.16)) return;
        const data = this.getRoughEdgeData(col, row, directionName, material);
        const t = 0.18 + hash2D(row, col, this.seed, material * 509 + edgeIndex) * 0.64;
        const base = this.getEdgeBasePoint(col, row, directionName, t);
        const radius = this.cellSize * (0.045 + hash2D(col + edgeIndex, row, this.seed, material * 521) * 0.045);
        ctx.save();
        ctx.translate(base.x + data.direction.normal.x * radius * 0.45, base.y + data.direction.normal.y * radius * 0.45);
        ctx.rotate(hash2D(col, row, this.seed, material * 541 + edgeIndex) * Math.PI);
        ctx.fillStyle = withAlpha(mixHex(materialData.color || '#6b625a', '#ffffff', 0.08), 0.62);
        ctx.strokeStyle = 'rgba(5, 11, 19, 0.36)';
        ctx.lineWidth = Math.max(0.8, radius * 0.38);
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * 1.45, radius * 0.85, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      });
    });
    ctx.restore();
  }

  drawRoughSurfaceDetails(ctx, bounds = null) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    this.forEachExposedTerrainCell(bounds, ({ col, row, material, edges }) => {
      const materialData = TERRAIN_MATERIALS[material] || TERRAIN_MATERIALS[1];
      const style = this.getMaterialRoughnessStyle(material);
      const opacity = clamp01(style.surfaceDetailOpacity ?? 0.38);
      const edgeName = edges[Math.floor(hash2D(col, row, this.seed, material * 601) * edges.length)] || edges[0];
      const direction = EDGE_DIRECTIONS[edgeName];
      const baseT = 0.18 + hash2D(col, row, this.seed, material * 607) * 0.64;
      const base = this.getEdgeBasePoint(col, row, edgeName, baseT);
      const inward = { x: -direction.normal.x, y: -direction.normal.y };
      const tangent = direction.tangent;

      ctx.save();
      ctx.beginPath();
      this.traceCellShape(ctx, col, row, { scale: 0.98 });
      ctx.clip();

      if (hash2D(col, row, this.seed, material * 613) < (style.crackChance ?? 0.34)) {
        const minLength = style.crackLengthMin ?? 7;
        const maxLength = style.crackLengthMax ?? 20;
        const length = minLength + hash2D(col, row, this.seed, material * 617) * Math.max(1, maxLength - minLength);
        const startX = base.x + inward.x * this.cellSize * (0.12 + hash2D(row, col, this.seed, material * 619) * 0.18);
        const startY = base.y + inward.y * this.cellSize * (0.12 + hash2D(row, col, this.seed, material * 619) * 0.18);
        const angleOffset = signedHash2D(col, row, this.seed, material * 631) * 0.55;
        const dirX = tangent.x * Math.cos(angleOffset) + inward.x * Math.sin(angleOffset);
        const dirY = tangent.y * Math.cos(angleOffset) + inward.y * Math.sin(angleOffset);
        ctx.strokeStyle = `rgba(12, 13, 18, ${0.22 + opacity * 0.42})`;
        ctx.lineWidth = Math.max(0.9, this.cellSize * 0.045);
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(startX + dirX * length * 0.52 + inward.x * length * 0.18, startY + dirY * length * 0.52 + inward.y * length * 0.18);
        ctx.lineTo(startX + dirX * length, startY + dirY * length);
        ctx.stroke();
      }

      if (hash2D(col, row, this.seed, material * 641) < (style.dentChance ?? 0.42)) {
        const x = base.x + inward.x * this.cellSize * (0.2 + hash2D(col, row, this.seed, material * 643) * 0.28);
        const y = base.y + inward.y * this.cellSize * (0.2 + hash2D(col, row, this.seed, material * 643) * 0.28);
        const radius = this.cellSize * (0.035 + hash2D(row, col, this.seed, material * 647) * 0.045);
        ctx.fillStyle = `rgba(7, 9, 14, ${0.08 + opacity * 0.16})`;
        ctx.beginPath();
        ctx.ellipse(x, y, radius * 1.6, radius, hash2D(col, row, this.seed, material * 653) * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }

      if (hash2D(col, row, this.seed, material * 659) < (style.pebbleChance ?? 0.22)) {
        const x = base.x + inward.x * this.cellSize * 0.28 + tangent.x * signedHash2D(col, row, this.seed, material * 661) * this.cellSize * 0.18;
        const y = base.y + inward.y * this.cellSize * 0.28 + tangent.y * signedHash2D(col, row, this.seed, material * 661) * this.cellSize * 0.18;
        const radius = this.cellSize * (0.035 + hash2D(col, row, this.seed, material * 673) * 0.035);
        ctx.fillStyle = withAlpha(mixHex(materialData.edge || '#91867a', '#ffffff', 0.18), 0.14 + opacity * 0.16);
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    });
    ctx.restore();
  }

  drawRoughnessDebug(ctx, bounds = null) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 214, 107, 0.75)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
    this.forEachRoughContourLoop(bounds, (loop) => {
      ctx.beginPath();
      this.traceRoughContourLoop(ctx, loop.points);
      ctx.stroke();
    });
    ctx.restore();
  }

  drawEdgeContours(ctx, bounds = null) {
    const palette = BIOME_PALETTES[this.biome] || BIOME_PALETTES.scrap;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    this.strokeMarchingEdges(ctx, 'rgba(5, 11, 19, 0.5)', Math.max(4, this.cellSize * 0.28), bounds, (x, y) => this.isNaturalSolidCell(x, y), 'natural-solid');
    this.strokeMarchingEdges(ctx, withAlpha(palette.edge, 0.42), Math.max(1.4, this.cellSize * 0.11), bounds, (x, y) => this.isNaturalSolidCell(x, y), 'natural-solid');
    ctx.restore();
  }

  strokeMarchingEdges(ctx, style, width, bounds = null, predicate = (x, y) => this.isSolidCell(x, y), cacheKey = null, options = VISUAL_CONTOUR_OPTIONS) {
    const loops = bounds
      ? this.buildContourLoopsInBounds(predicate, bounds, options)
      : this.getContourLoops(predicate, cacheKey, options);
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (const loop of loops) {
      this.traceContourLoop(ctx, loop.points, options, { close: loop.closed !== false });
    }
    ctx.stroke();
  }

  strokeSampledMarchingEdges(ctx, style, width, bounds, predicate, options = VISUAL_CONTOUR_OPTIONS) {
    const step = this.getContourStep(options);
    const padding = this.cellSize * 3;
    const minCol = clamp(Math.floor((bounds.minCol * this.cellSize - padding) / step), 0, Math.max(0, Math.ceil(this.width / step) - 1));
    const maxCol = clamp(Math.ceil(((bounds.maxCol + 1) * this.cellSize + padding) / step), 0, Math.max(0, Math.ceil(this.width / step) - 1));
    const minRow = clamp(Math.floor((bounds.minRow * this.cellSize - padding) / step), 0, Math.max(0, Math.ceil(this.height / step) - 1));
    const maxRow = clamp(Math.ceil(((bounds.maxRow + 1) * this.cellSize + padding) / step), 0, Math.max(0, Math.ceil(this.height / step) - 1));
    const sample = (col, row) => this.sampleContourNode(predicate, col, row, step, options);
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        const marchingIndex = this.getMarchingIndex(col, row, sample);
        const segments = EDGE_SEGMENTS[marchingIndex];
        if (!segments?.length) continue;
        const x = col * step;
        const y = row * step;
        for (const segment of segments) {
          const a = POINTS[segment[0]];
          const b = POINTS[segment[1]];
          ctx.moveTo(x + a[0] * step, y + a[1] * step);
          ctx.lineTo(x + b[0] * step, y + b[1] * step);
        }
      }
    }
    ctx.stroke();
  }

  drawDebug(ctx, flags = {}) {
    if (!flags?.rawGrid && !flags?.visualMesh && !flags?.collision && !flags?.roughnessDebug) return;
    ctx.save();
    if (flags.rawGrid) this.drawRawGridDebug(ctx);
    if (flags.visualMesh) this.drawVisualMeshDebug(ctx);
    if (flags.collision) this.drawCollisionDebug(ctx);
    if (flags.roughnessDebug) this.drawRoughnessDebug(ctx);
    ctx.restore();
  }

  drawRawGridDebug(ctx) {
    const size = this.cellSize;
    ctx.save();
    ctx.lineWidth = 1;
    for (let row = 0; row < this.rows; row += 1) {
      for (let col = 0; col < this.cols; col += 1) {
        const material = this.getCell(col, row);
        if (material <= 0) continue;
        const data = TERRAIN_MATERIALS[material] || TERRAIN_MATERIALS[1];
        ctx.fillStyle = withAlpha(data.edge || '#76f3ff', 0.08);
        ctx.strokeStyle = 'rgba(126, 231, 255, 0.18)';
        ctx.fillRect(col * size, row * size, size, size);
        ctx.strokeRect(col * size + 0.5, row * size + 0.5, size - 1, size - 1);
      }
    }
    ctx.restore();
  }

  drawVisualMeshDebug(ctx) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([12, 8]);
    this.strokeMarchingEdges(
      ctx,
      'rgba(118, 243, 255, 0.88)',
      2,
      null,
      (col, row) => this.isSolidCell(col, row),
      'solid',
      VISUAL_CONTOUR_OPTIONS,
    );
    ctx.restore();
  }

  drawCollisionDebug(ctx) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([5, 7]);
    this.strokeMarchingEdges(
      ctx,
      'rgba(255, 117, 111, 0.9)',
      2.5,
      null,
      (col, row) => this.isSolidCell(col, row),
      'collision',
      COLLISION_CONTOUR_OPTIONS,
    );
    ctx.restore();
  }
}
