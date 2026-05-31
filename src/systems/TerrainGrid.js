import { getPointAabbDistance, getSegmentPolygonHit } from '../utils/raycast.js?v=112';

export const TERRAIN_MATERIALS = {
  0: { id: 'empty', name: 'Empty', color: 'transparent', hardness: 0, yield: 0, materialId: null },
  1: { id: 'rock', name: 'Rock', color: '#6b625a', edge: '#91867a', hardness: 3.35, yield: 1, materialId: 'stoneOre', miningPowerRequired: 0 },
  2: { id: 'ironOre', name: 'Iron Ore', color: '#9b7a5b', edge: '#d0ad84', hardness: 7.8, yield: 1, materialId: 'ironDust', miningPowerRequired: 0 },
  3: { id: 'copperOre', name: 'Copper Ore', color: '#b87333', edge: '#ffad63', hardness: 6.8, yield: 1, materialId: 'copperShards', miningPowerRequired: 0 },
  4: { id: 'crystal', name: 'Crystal', color: '#3d9fc5', edge: '#65d6ff', hardness: 10.5, yield: 1, materialId: 'glassCrystal', miningPowerRequired: 1.15 },
  5: { id: 'coreFragment', name: 'Core Fragment', color: '#c99235', edge: '#ffcf5a', hardness: 13.5, yield: 1, materialId: 'researchFragment', miningPowerRequired: 1.45 },
  6: { id: 'fireCore', name: 'Fire Core', color: '#ff5d3d', edge: '#ffd36b', hardness: 11.2, yield: 1, materialId: 'fireCore', miningPowerRequired: 0 },
  7: { id: 'crystallizedStone', name: 'Crystallized Stone', color: '#445262', edge: '#9ed7ff', hardness: 14.6, yield: 1, materialId: 'crystallizedStone', miningPowerRequired: 1.15 },
  8: { id: 'redCrystal', name: 'Red Crystal', color: '#a9213c', edge: '#ff6f7d', hardness: 9.4, yield: 1, materialId: 'redCrystal', miningPowerRequired: 1.15 },
};

const TERRAIN_SAVE_VERSION = 13;
const DEFAULT_TERRAIN_CELL_SIZE = 16;

const VISUAL_CONTOUR_OPTIONS = {
  smoothingIterations: 0,
  smoothingAmount: 0.06,
  minSegmentLength: 2,
  sharpAngleDegrees: 36,
  sharpAngleAmount: 0.06,
  gridSnapAmount: 0.82,
  cornerRoundAmount: 0.06,
};

const COLLISION_CONTOUR_OPTIONS = {
  smoothingIterations: 1,
  smoothingAmount: 0.18,
  minSegmentLength: 12,
  sharpAngleDegrees: 58,
  sharpAngleAmount: 0.34,
  gridSnapAmount: 0.34,
  cornerRoundAmount: 0.14,
};

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
  smoothed = smoothSharpContourAngles(smoothed, options);
  for (let iteration = 0; iteration < (options.smoothingIterations || 0); iteration += 1) {
    smoothed = averageContourPoints(smoothed, options.smoothingAmount ?? 0.35);
    smoothed = removeShortContourSegments(smoothed, options.minSegmentLength || 0);
  }
  smoothed = snapContourTowardGrid(smoothed, gridStep, options.gridSnapAmount || 0);
  return smoothed.length >= 3 ? smoothed : points;
}

export class TerrainGrid {
  constructor({ cols, rows, cellSize = 18, cells = null, seed = 1, biome = 'scrap', landingX = 150, landingY = 360 } = {}) {
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
    this.cells = cells ? Uint8Array.from(cells) : new Uint8Array(cols * rows);
    this.damage = new Float32Array(cols * rows);
    this.renderCanvas = null;
    this.renderCtx = null;
    this.renderDirty = true;
    this.fullRenderDirty = true;
    this.dirtyBounds = null;
    this.textureCache = new Map();
    this.contourCache = new Map();
    this.collisionContours = null;
    this.surfacePathCache = null;
  }

  static createForIsland(island, world, savedTerrain = null) {
    if (savedTerrain?.version === TERRAIN_SAVE_VERSION && savedTerrain?.cells?.length) {
      return new TerrainGrid({
        cols: savedTerrain.cols,
        rows: savedTerrain.rows,
        cellSize: savedTerrain.cellSize || 18,
        cells: savedTerrain.cells,
        seed: savedTerrain.seed || hashString(island.id),
        biome: savedTerrain.biome || island.biome,
        landingX: savedTerrain.landingX || world.landingX || 150,
        landingY: savedTerrain.landingY || Math.round(world.height * 0.62),
      });
    }

    const cellSize = DEFAULT_TERRAIN_CELL_SIZE;
    const cols = Math.ceil(world.width / cellSize);
    const rows = Math.ceil(world.height / cellSize);
    const seed = hashString(`${island.id}:${island.type || island.biome}`);
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
      landingX: this.landingX,
      landingY: this.landingY,
      cells: Array.from(this.cells),
    };
  }

  generate(island) {
    const random = createRandom(this.seed);
    this.cells.fill(0);
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
    this.renderDirty = true;
    this.fullRenderDirty = true;
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
    const centerWindow = [];
    const windowRadius = Math.max(4, Math.round((right - left) * 0.08));
    for (let col = centerCol - windowRadius; col <= centerCol + windowRadius; col += 1) {
      const row = profiles.surfaceRows[col];
      if (row !== null) centerWindow.push(row);
    }
    if (!centerWindow.length) return;
    centerWindow.sort((a, b) => a - b);
    const topRow = Math.max(3, centerWindow[Math.floor(centerWindow.length * 0.35)] - 1);
    const halfWidth = Math.max(1, (right - left) * 0.5);
    const crashPlanet = island?.type === 'crashPlanet';
    const maxShoulderDrop = crashPlanet ? 15 : 20;
    const maxSlope = crashPlanet ? 0.16 : 0.2;
    const targetRows = new Array(this.cols).fill(null);

    for (let col = left; col <= right; col += 1) {
      const current = profiles.surfaceRows[col];
      if (current === null) continue;
      const normalized = Math.abs((col - centerCol) / halfWidth);
      const shoulder = smoothStep((normalized - 0.28) / 0.72);
      const broadWave = Math.sin(col * 0.085 + this.seed * 0.0009) * (crashPlanet ? 0.75 : 1.2);
      const fineWave = signedNoise(col * 12.71 + this.seed * 0.002) * (crashPlanet ? 0.75 : 1.05);
      const chipStep = Math.round(signedNoise(Math.floor(col / 3) * 19.31 + this.seed * 0.004) * (crashPlanet ? 1.4 : 1.9));
      const existingBlend = clamp01((normalized - 0.72) / 0.28) * 0.16;
      const gentleRow = topRow + shoulder * maxShoulderDrop + broadWave + fineWave + chipStep;
      targetRows[col] = gentleRow * (1 - existingBlend) + current * existingBlend;
    }

    this.limitSurfaceSlope(targetRows, left, right, maxSlope);
    this.applySurfaceRows(targetRows, profiles.bottomRows, {
      minThickness: crashPlanet ? 26 : 20,
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
    const caveCount = {
      cave: 13,
      largeMineral: 10,
      wreckage: 7,
      crystalCluster: 9,
      smallAsteroid: 5,
    }[island.type] || 7;

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
    }
  }

  placeOreVeins(random, island, surfaceRows) {
    if (island.type === 'crashPlanet') {
      const starterVeins = [
        { material: 2, count: 16, radius: [42, 86], minDepth: 5, depthBias: 0.5, shallowChance: 0.1 },
        { material: 3, count: 15, radius: [40, 82], minDepth: 5, depthBias: 0.56, shallowChance: 0.1 },
      ];
      this.paintVeinPlan(random, starterVeins, surfaceRows);
      return;
    }

    const richness = {
      smallAsteroid: 1,
      largeMineral: 1.45,
      wreckage: 1.1,
      crystalCluster: 1.55,
      cave: 1.25,
    }[island.type] || 1;
    const veinPlan = [
      { material: 2, count: Math.round(6 * richness), radius: [32, 70], minDepth: 5, depthBias: 0.48, shallowChance: 0.12 },
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
    const offsetCol = clamp(centerCol + Math.round((random() - 0.5) * 5), 2, this.cols - 3);
    const offsetRow = clamp(centerRow + Math.round((random() - 0.5) * 5), 2, this.rows - 3);
    const radius = island.type === 'crashPlanet' ? 2 : 1;

    for (let row = offsetRow - radius - 1; row <= offsetRow + radius + 1; row += 1) {
      for (let col = offsetCol - radius - 1; col <= offsetCol + radius + 1; col += 1) {
        if (!this.isInside(col, row)) continue;
        const dx = col - offsetCol;
        const dy = row - offsetRow;
        const distance = Math.hypot(dx, dy);
        if (distance <= radius + 0.15) {
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

  getCell(col, row) {
    if (!this.isInside(col, row)) return 0;
    return this.cells[this.index(col, row)];
  }

  setCell(col, row, value) {
    if (!this.isInside(col, row)) return;
    const index = this.index(col, row);
    if (this.cells[index] === value) return;
    this.cells[index] = value;
    this.damage[index] = 0;
    this.invalidateTerrainGeometry();
    this.renderDirty = true;
    if (this.renderCanvas && !this.fullRenderDirty) this.markDirtyCell(col, row);
    else this.fullRenderDirty = true;
  }

  invalidateTerrainGeometry() {
    this.contourCache?.clear();
    this.collisionContours = null;
    this.surfacePathCache = null;
  }

  getDamageRatio(col, row, materialOverride = null) {
    if (!this.isInside(col, row)) return 0;
    const material = materialOverride || this.getCell(col, row);
    const data = TERRAIN_MATERIALS[material];
    if (!data?.hardness) return 0;
    return clamp01(this.damage[this.index(col, row)] / data.hardness);
  }

  markDirtyCell(col, row, padding = 5) {
    const bounds = {
      minCol: clamp(col - padding, 0, this.cols - 1),
      maxCol: clamp(col + padding, 0, this.cols - 1),
      minRow: clamp(row - padding, 0, this.rows - 1),
      maxRow: clamp(row + padding, 0, this.rows - 1),
    };
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

  isCollisionSolidSample(col, row) {
    if (!this.isInside(col, row)) return false;
    const centerSolid = this.isSolidCell(col, row);
    let solidCount = 0;
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        if (this.isSolidCell(col + ox, row + oy)) solidCount += 1;
      }
    }
    if (centerSolid && solidCount <= 2) return false;
    return centerSolid || solidCount >= 7;
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
    const size = this.cellSize;
    const minCol = clamp(Math.floor(left / size) - 1, 0, this.cols - 2);
    const maxCol = clamp(Math.floor(right / size) + 1, 0, this.cols - 2);
    const minRow = clamp(Math.floor(top / size) - 1, 0, this.rows - 2);
    const maxRow = clamp(Math.floor(bottom / size) + 1, 0, this.rows - 2);
    const predicate = (x, y) => this.isCollisionSolidSample(x, y);
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        const marchingIndex = this.getMarchingIndex(col, row, predicate);
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
    const queryBounds = { minX: x - 2, minY: y - 2, maxX: x + 2, maxY: y + 2 };
    let inside = false;
    for (const contour of this.getCollisionContours()) {
      if (!boundsOverlap(contour.bounds, queryBounds)) continue;
      if (pointNearPolygonEdge(x, y, contour.points, 2.5)) return true;
      if (pointInPolygon(x, y, contour.points)) inside = !inside;
    }
    return inside;
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
    const loops = this.getContourLoops((col, row) => this.isSolidCell(col, row), 'solid');
    let best = null;
    let bestDistanceSq = Infinity;
    for (const loop of loops) {
      const points = loop.points || [];
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
        const segmentLength = Math.sqrt(segmentLengthSq) || 1;
        bestDistanceSq = distanceSq;
        best = {
          surfaceX: px,
          surfaceY: py,
          tangent: { x: dx / segmentLength, y: dy / segmentLength },
          queryVector: { x: qx, y: qy },
        };
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
    let hit = false;
    this.forEachCollisionPolygonInAabb(left, top, right, bottom, (polygon) => {
      if (!aabbIntersectsPolygon(left, top, right, bottom, polygon)) return false;
      hit = true;
      return true;
    });
    return hit;
  }

  raycast(startX, startY, endX, endY) {
    const contourHit = this.raycastContourSurface(startX, startY, endX, endY);
    if (contourHit) return contourHit;
    const surfaceHit = this.raycastMarchingSurface(startX, startY, endX, endY);
    if (surfaceHit) return surfaceHit;
    return this.raycastSampledCells(startX, startY, endX, endY);
  }

  raycastContourSurface(startX, startY, endX, endY) {
    const dx = endX - startX;
    const dy = endY - startY;
    const distance = Math.hypot(dx, dy);
    if (distance <= 0.001) return null;
    const segmentBounds = {
      minX: Math.min(startX, endX) - this.cellSize,
      minY: Math.min(startY, endY) - this.cellSize,
      maxX: Math.max(startX, endX) + this.cellSize,
      maxY: Math.max(startY, endY) + this.cellSize,
    };
    let best = null;
    let bestT = Infinity;
    for (const contour of this.getContourLoops((col, row) => this.isSolidCell(col, row), 'solid')) {
      if (!boundsOverlap(contour.bounds, segmentBounds)) continue;
      const hit = getSegmentPolygonHit(startX, startY, endX, endY, contour.points);
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
    const broken = [];
    const halfSize = this.cellSize * 0.5;
    const hasTarget = Number.isInteger(options.targetCol) && Number.isInteger(options.targetRow);
    const startCol = hasTarget ? options.targetCol : clamp(Math.floor((worldX - radius - halfSize) / this.cellSize), 0, this.cols - 1);
    const endCol = hasTarget ? options.targetCol : clamp(Math.ceil((worldX + radius + halfSize) / this.cellSize), 0, this.cols - 1);
    const startRow = hasTarget ? options.targetRow : clamp(Math.floor((worldY - radius - halfSize) / this.cellSize), 0, this.rows - 1);
    const endRow = hasTarget ? options.targetRow : clamp(Math.ceil((worldY + radius + halfSize) / this.cellSize), 0, this.rows - 1);
    for (let row = startRow; row <= endRow; row += 1) {
      for (let col = startCol; col <= endCol; col += 1) {
        const material = this.getCell(col, row);
        if (material <= 0) continue;
        const left = col * this.cellSize;
        const top = row * this.cellSize;
        const centerX = left + halfSize;
        const centerY = top + halfSize;
        if (!hasTarget) {
          const distance = getPointAabbDistance(
            worldX,
            worldY,
            left,
            top,
            left + this.cellSize,
            top + this.cellSize,
          );
          if (distance > radius) continue;
        }
        const data = TERRAIN_MATERIALS[material];
        const index = this.index(col, row);
        this.damage[index] += power * delta;
        if (this.renderCanvas && !this.fullRenderDirty) {
          this.renderDirty = true;
          this.markDirtyCell(col, row, 2);
        } else {
          this.renderDirty = true;
          this.fullRenderDirty = true;
        }
        if (this.damage[index] < data.hardness) continue;
        const chip = this.getCellPickupChip(col, row, material);
        this.damage[index] = 0;
        this.setCell(col, row, 0);
        broken.push({
          col,
          row,
          x: centerX,
          y: centerY,
          material,
          data,
          chip,
        });
      }
    }
    return broken;
  }

  getCellShapePoints(col, row, { scale = 1, offsetX = 0, offsetY = 0 } = {}) {
    const size = this.cellSize;
    const half = size * 0.5 * scale;
    const bevel = size * 0.18 * scale;
    const centerX = col * size + size * 0.5 + offsetX;
    const centerY = row * size + size * 0.5 + offsetY;
    const exposedUp = !this.isSolidCell(col, row - 1);
    const exposedRight = !this.isSolidCell(col + 1, row);
    const exposedDown = !this.isSolidCell(col, row + 1);
    const exposedLeft = !this.isSolidCell(col - 1, row);
    const top = centerY - half;
    const right = centerX + half;
    const bottom = centerY + half;
    const left = centerX - half;
    return [
      { x: left + (exposedUp || exposedLeft ? bevel : 0), y: top },
      { x: right - (exposedUp || exposedRight ? bevel : 0), y: top },
      { x: right, y: top + (exposedRight || exposedUp ? bevel : 0) },
      { x: right, y: bottom - (exposedRight || exposedDown ? bevel : 0) },
      { x: right - (exposedDown || exposedRight ? bevel : 0), y: bottom },
      { x: left + (exposedDown || exposedLeft ? bevel : 0), y: bottom },
      { x: left, y: bottom - (exposedLeft || exposedDown ? bevel : 0) },
      { x: left, y: top + (exposedLeft || exposedUp ? bevel : 0) },
    ];
  }

  traceCellShape(ctx, col, row, options = {}) {
    const points = this.getCellShapePoints(col, row, options);
    if (!points.length) return;
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index].x, points[index].y);
    ctx.closePath();
  }

  getCellPickupChip(col, row, materialId) {
    const data = TERRAIN_MATERIALS[materialId] || TERRAIN_MATERIALS[1];
    const centerX = col * this.cellSize + this.cellSize * 0.5;
    const centerY = row * this.cellSize + this.cellSize * 0.5;
    return {
      terrainMaterial: materialId,
      color: data.color || '#6b625a',
      edge: data.edge || '#91867a',
      size: this.cellSize,
      lineWidth: Math.max(1.4, this.cellSize * 0.11),
      points: this.getCellShapePoints(col, row).map((point) => ({
        x: (point.x - centerX) / Math.max(1, this.cellSize * 0.5),
        y: (point.y - centerY) / Math.max(1, this.cellSize * 0.5),
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
    ctx.globalAlpha = blocked ? 0.72 : 0.46 + ratio * 0.32;
    ctx.fillStyle = withAlpha(fillColor, blocked ? 0.24 : 0.12 + ratio * 0.2);
    ctx.strokeStyle = withAlpha(edgeColor, blocked ? 0.9 : 0.58 + ratio * 0.34);
    ctx.lineWidth = Math.max(1.4, size * 0.09);
    ctx.beginPath();
    this.traceCellShape(ctx, col, row, { scale: 1 + ratio * 0.035 });
    ctx.fill();
    ctx.stroke();
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

  draw(ctx, camera, viewportWidth, viewportHeight = this.height) {
    if (!this.renderCanvas || this.renderDirty) this.redrawTerrainCache();
    const sx = clamp(Math.floor(camera.x) - this.cellSize * 2, 0, Math.max(0, this.width - 1));
    const sy = clamp(Math.floor(camera.y) - this.cellSize * 2, 0, Math.max(0, this.height - 1));
    const sw = Math.min(this.width - sx, Math.ceil(viewportWidth) + this.cellSize * 4);
    const sh = Math.min(this.height - sy, Math.ceil(viewportHeight) + this.cellSize * 4);
    if (sw <= 0 || sh <= 0) return;
    ctx.save();
    ctx.drawImage(this.renderCanvas, sx, sy, sw, sh, sx - camera.x, sy, sw, sh);
    ctx.restore();
  }

  redrawTerrainCache() {
    const canvas = this.getRenderCanvas();
    const ctx = this.renderCtx;
    if (this.fullRenderDirty || !this.dirtyBounds) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      this.drawTerrainLayers(ctx);
    } else {
      this.redrawTerrainRegion(ctx, this.dirtyBounds);
    }
    this.renderDirty = false;
    this.fullRenderDirty = false;
    this.dirtyBounds = null;
  }

  redrawTerrainRegion(ctx, bounds) {
    const size = this.cellSize;
    const x = bounds.minCol * size;
    const y = bounds.minRow * size;
    const width = (bounds.maxCol - bounds.minCol + 1) * size;
    const height = (bounds.maxRow - bounds.minRow + 1) * size;
    ctx.clearRect(x, y, width, height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();
    this.drawTerrainLayers(ctx, bounds);
    ctx.restore();
  }

  drawTerrainLayers(ctx, bounds = null) {
    this.drawOrganicMass(ctx, bounds);
    this.drawRockTexture(ctx, bounds);
    this.drawOreVeins(ctx, bounds);
    this.drawEdgeContours(ctx, bounds);
    this.drawPersistentDamage(ctx, bounds);
  }

  drawPersistentDamage(ctx, bounds = null) {
    const minCol = bounds ? clamp(bounds.minCol - 2, 0, this.cols - 1) : 0;
    const maxCol = bounds ? clamp(bounds.maxCol + 2, 0, this.cols - 1) : this.cols - 1;
    const minRow = bounds ? clamp(bounds.minRow - 2, 0, this.rows - 1) : 0;
    const maxRow = bounds ? clamp(bounds.maxRow + 2, 0, this.rows - 1) : this.rows - 1;
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        const material = this.getCell(col, row);
        if (material <= 0) continue;
        const ratio = this.getDamageRatio(col, row, material);
        if (ratio <= 0.08) continue;
        this.drawCellDamageOverlay(ctx, col, row, {
          materialId: material,
          ratio,
          time: 0,
          glow: false,
        });
      }
    }
  }

  drawCellTargetGlow(ctx, hit, time = 0, { brushRadius = 0 } = {}) {
    if (!hit) return;
    const material = TERRAIN_MATERIALS[hit.material] || TERRAIN_MATERIALS[1];
    const color = material.edge || '#ffd36b';
    const rgb = hexToRgb(color);
    const pulse = 1 + Math.sin(time * 15) * 0.045;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.globalAlpha = 0.36;
    ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.18)`;
    ctx.beginPath();
    this.traceCellShape(ctx, hit.col, hit.row, { scale: pulse });
    ctx.fill();

    ctx.globalAlpha = 0.88;
    ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.92)`;
    ctx.lineWidth = Math.max(1.4, this.cellSize * 0.09);
    ctx.setLineDash([this.cellSize * 0.34, this.cellSize * 0.2]);
    ctx.lineDashOffset = -time * 20;
    ctx.beginPath();
    this.traceCellShape(ctx, hit.col, hit.row, { scale: pulse });
    ctx.stroke();

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
    this.renderDirty = true;
    this.fullRenderDirty = true;
    this.dirtyBounds = null;
    this.contourCache?.clear();
    this.collisionContours = null;
  }

  drawOrganicMass(ctx, bounds = null) {
    const palette = BIOME_PALETTES[this.biome] || BIOME_PALETTES.scrap;
    const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, palette.top);
    gradient.addColorStop(0.48, palette.body);
    gradient.addColorStop(1, palette.deep);
    ctx.fillStyle = gradient;
    this.fillMarchingPath(ctx, (col, row) => this.isSolidCell(col, row), bounds, 'solid');
  }

  fillMarchingPath(ctx, predicate, bounds = null, cacheKey = null) {
    ctx.beginPath();
    this.buildMarchingPath(ctx, predicate, bounds, cacheKey);
    ctx.fill('evenodd');
  }

  clipSolidMass(ctx, bounds = null) {
    this.clipMarchingPath(ctx, (col, row) => this.isSolidCell(col, row), bounds, 'solid');
  }

  clipMarchingPath(ctx, predicate, bounds = null, cacheKey = null) {
    ctx.beginPath();
    this.buildMarchingPath(ctx, predicate, bounds, cacheKey);
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
    drawTile(canvas.getContext('2d'), canvas.width, canvas.height);
    this.textureCache.set(key, canvas);
    return canvas;
  }

  drawPatternInMask(ctx, predicate, key, drawTile, bounds = null, alpha = 1, maskKey = key) {
    const rect = this.getDrawRect(bounds);
    if (rect.width <= 0 || rect.height <= 0) return;
    const tile = this.getTextureTile(key, drawTile);
    const pattern = ctx.createPattern(tile, 'repeat');
    if (!pattern) return;
    ctx.save();
    this.clipMarchingPath(ctx, predicate, bounds, maskKey);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = pattern;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.restore();
  }

  buildMarchingPath(ctx, predicate, bounds = null, cacheKey = null, options = VISUAL_CONTOUR_OPTIONS) {
    const loops = this.getContourLoops(predicate, cacheKey, options);
    const clipBounds = bounds ? {
      minX: clamp(bounds.minCol * this.cellSize - this.cellSize * 3, 0, this.width),
      minY: clamp(bounds.minRow * this.cellSize - this.cellSize * 3, 0, this.height),
      maxX: clamp((bounds.maxCol + 1) * this.cellSize + this.cellSize * 3, 0, this.width),
      maxY: clamp((bounds.maxRow + 1) * this.cellSize + this.cellSize * 3, 0, this.height),
    } : null;
    for (const loop of loops) {
      if (clipBounds && !boundsOverlap(loop.bounds, clipBounds)) continue;
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

  buildContourLoops(predicate, options = VISUAL_CONTOUR_OPTIONS) {
    const size = this.cellSize;
    const segments = [];
    const minCol = 0;
    const maxCol = this.cols - 2;
    const minRow = 0;
    const maxRow = this.rows - 2;
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        const index = this.getMarchingIndex(col, row, predicate);
        const edgeSegments = EDGE_SEGMENTS[index];
        if (!edgeSegments?.length) continue;
        const x = col * size;
        const y = row * size;
        for (const segment of edgeSegments) {
          const a = POINTS[segment[0]];
          const b = POINTS[segment[1]];
          segments.push({
            a: { x: x + a[0] * size, y: y + a[1] * size },
            b: { x: x + b[0] * size, y: y + b[1] * size },
          });
        }
      }
    }
    return this.linkContourSegments(segments, options, size * 0.5);
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

      const cleaned = removeDuplicateContourPoints(points);
      if (cleaned.length < 3) continue;
      const smoothed = smoothContour(cleaned, options, gridStep);
      loops.push({
        points: smoothed,
        bounds: contourBounds(smoothed),
      });
    }
    return loops;
  }

  traceContourLoop(ctx, points, options = VISUAL_CONTOUR_OPTIONS) {
    if (!points?.length) return;
    if (points.length < 4) {
      ctx.moveTo(points[0].x, points[0].y);
      for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index].x, points[index].y);
      ctx.closePath();
      return;
    }
    const roundAmount = clamp01(options.cornerRoundAmount ?? 0.1);
    if (roundAmount <= 0.001) {
      ctx.moveTo(points[0].x, points[0].y);
      for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index].x, points[index].y);
      ctx.closePath();
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
      ctx.lineTo(after.x, after.y);
    }
    ctx.closePath();
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

  drawOreVeins(ctx, bounds = null) {
    const oreMaterials = Object.keys(TERRAIN_MATERIALS)
      .map(Number)
      .filter((material) => material > 1)
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
      );
      this.drawOreFacets(ctx, material, data, bounds);
      this.strokeMarchingEdges(
        ctx,
        withAlpha(data.edge, material >= 4 ? 0.54 : 0.34),
        Math.max(1.3, this.cellSize * 0.08),
        bounds,
        predicate,
        `ore-mask:${material}`,
      );
    }
  }

  drawOreFacets(ctx, material, data, bounds = null) {
    const rect = this.getDrawRect(bounds);
    const random = createRandom(hashString(`${this.seed}:ore-facets:${material}:${rect.x}:${rect.y}:${rect.width}:${rect.height}`));
    const count = Math.min(140, Math.max(10, Math.floor((rect.width * rect.height) / 18000)));
    ctx.save();
    this.clipMarchingPath(ctx, (col, row) => this.getCell(col, row) === material, bounds, `ore-mask:${material}`);
    for (let index = 0; index < count; index += 1) {
      const x = rect.x + random() * rect.width;
      const y = rect.y + random() * rect.height;
      const radius = this.cellSize * (0.08 + random() * 0.18);
      const angle = random() * Math.PI * 2;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.globalAlpha = material >= 4 ? 0.45 : 0.24;
      ctx.fillStyle = withAlpha(mixHex(data.edge, '#ffffff', 0.22), material >= 4 ? 0.65 : 0.34);
      ctx.beginPath();
      if (material === 4 || material === 5 || material === 8) {
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
    ctx.restore();
  }

  drawRockTexture(ctx, bounds = null) {
    const palette = BIOME_PALETTES[this.biome] || BIOME_PALETTES.scrap;
    this.drawPatternInMask(
      ctx,
      (col, row) => this.isSolidCell(col, row),
      `stone:${this.seed}:${this.biome}`,
      (tileCtx, width, height) => this.drawStoneTextureTile(tileCtx, width, height, palette),
      bounds,
      1,
      'solid',
    );
    this.drawStoneCracks(ctx, palette, bounds);
  }

  drawStoneTextureTile(ctx, width, height, palette) {
    const random = createRandom(hashString(`${this.seed}:${this.biome}:stone-texture`));
    ctx.clearRect(0, 0, width, height);
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
    const random = createRandom(hashString(`${this.seed}:${data.id}:ore-texture`));
    const base = mixHex(data.color, '#1b1e25', material >= 4 ? 0.08 : 0.18);
    const glow = mixHex(data.edge, '#ffffff', material >= 4 ? 0.3 : 0.14);
    ctx.fillStyle = withAlpha(base, material >= 4 ? 0.72 : 0.58);
    ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < 42; i += 1) {
      const x = random() * width;
      const y = random() * height;
      const radius = 3 + random() * (material >= 4 ? 11 : 8);
      ctx.fillStyle = withAlpha(random() > 0.4 ? glow : data.color, 0.12 + random() * 0.26);
      ctx.beginPath();
      if (material === 4 || material === 5 || material === 8) {
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
      ctx.strokeStyle = withAlpha(glow, material >= 4 ? 0.22 : 0.12);
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
  }

  drawStoneCracks(ctx, palette, bounds = null) {
    const rect = this.getDrawRect(bounds);
    const random = createRandom(hashString(`${this.seed}:${this.biome}:cracks:${rect.x}:${rect.y}:${rect.width}:${rect.height}`));
    const count = Math.min(110, Math.max(10, Math.floor((rect.width * rect.height) / 22000)));
    ctx.save();
    this.clipSolidMass(ctx, bounds);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < count; i += 1) {
      const x = rect.x + random() * rect.width;
      const y = rect.y + random() * rect.height;
      const length = 8 + random() * 24;
      const angle = random() * Math.PI * 2;
      ctx.strokeStyle = random() > 0.45
        ? withAlpha(mixHex(palette.edge, '#ffffff', 0.08), 0.1 + random() * 0.08)
        : withAlpha(mixHex(palette.deep, '#000000', 0.16), 0.12 + random() * 0.1);
      ctx.lineWidth = 0.8 + random() * 0.8;
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
    ctx.restore();
  }

  drawEdgeContours(ctx, bounds = null) {
    const palette = BIOME_PALETTES[this.biome] || BIOME_PALETTES.scrap;
    ctx.save();
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'bevel';
    this.strokeMarchingEdges(ctx, 'rgba(5, 11, 19, 0.5)', Math.max(4, this.cellSize * 0.28), bounds, (x, y) => this.isSolidCell(x, y), 'solid');
    this.strokeMarchingEdges(ctx, withAlpha(palette.edge, 0.42), Math.max(1.4, this.cellSize * 0.11), bounds, (x, y) => this.isSolidCell(x, y), 'solid');
    ctx.restore();
  }

  strokeMarchingEdges(ctx, style, width, bounds = null, predicate = (x, y) => this.isSolidCell(x, y), cacheKey = null) {
    const loops = this.getContourLoops(predicate, cacheKey, VISUAL_CONTOUR_OPTIONS);
    const clipBounds = bounds ? {
      minX: clamp(bounds.minCol * this.cellSize - this.cellSize * 3, 0, this.width),
      minY: clamp(bounds.minRow * this.cellSize - this.cellSize * 3, 0, this.height),
      maxX: clamp((bounds.maxCol + 1) * this.cellSize + this.cellSize * 3, 0, this.width),
      maxY: clamp((bounds.maxRow + 1) * this.cellSize + this.cellSize * 3, 0, this.height),
    } : null;
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (const loop of loops) {
      if (clipBounds && !boundsOverlap(loop.bounds, clipBounds)) continue;
      this.traceContourLoop(ctx, loop.points, VISUAL_CONTOUR_OPTIONS);
    }
    ctx.stroke();
  }
}
