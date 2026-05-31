import { getPointAabbDistance, getSegmentPolygonHit } from '../utils/raycast.js?v=93';

export const TERRAIN_MATERIALS = {
  0: { id: 'empty', name: 'Empty', color: 'transparent', hardness: 0, yield: 0, materialId: null },
  1: { id: 'rock', name: 'Rock', color: '#6b625a', edge: '#91867a', hardness: 4.8, yield: 1, materialId: 'stoneOre', miningPowerRequired: 0 },
  2: { id: 'ironOre', name: 'Iron Ore', color: '#9b7a5b', edge: '#d0ad84', hardness: 7.8, yield: 1, materialId: 'ironDust', miningPowerRequired: 0 },
  3: { id: 'copperOre', name: 'Copper Ore', color: '#b87333', edge: '#ffad63', hardness: 6.8, yield: 1, materialId: 'copperShards', miningPowerRequired: 0 },
  4: { id: 'crystal', name: 'Crystal', color: '#3d9fc5', edge: '#65d6ff', hardness: 10.5, yield: 1, materialId: 'glassCrystal', miningPowerRequired: 1.15 },
  5: { id: 'coreFragment', name: 'Core Fragment', color: '#c99235', edge: '#ffcf5a', hardness: 13.5, yield: 1, materialId: 'researchFragment', miningPowerRequired: 1.45 },
  6: { id: 'fireCore', name: 'Fire Core', color: '#ff5d3d', edge: '#ffd36b', hardness: 11.2, yield: 1, materialId: 'fireCore', miningPowerRequired: 0 },
  7: { id: 'crystallizedStone', name: 'Crystallized Stone', color: '#445262', edge: '#9ed7ff', hardness: 14.6, yield: 1, materialId: 'crystallizedStone', miningPowerRequired: 1.15 },
  8: { id: 'redCrystal', name: 'Red Crystal', color: '#a9213c', edge: '#ff6f7d', hardness: 9.4, yield: 1, materialId: 'redCrystal', miningPowerRequired: 1.15 },
};

const TERRAIN_SAVE_VERSION = 7;

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

    const cellSize = 22;
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
          + Math.sin(angle * 5 + this.seed * 0.0007) * 0.045
          + Math.sin(angle * 9 + this.seed * 0.0013) * 0.032
          + signedNoise(col * 17.37 + row * 31.91 + this.seed * 0.003) * 0.028;
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
    this.carveCaves(random, island);
    this.smoothTerrain(1);
    this.placeOreVeins(random, island, surfaceRows);
    this.placeFireCoreDeposit(random, island);
    this.placeCrystalVault(random, island);
    this.renderDirty = true;
    this.fullRenderDirty = true;
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
        { material: 2, count: 16, radius: [42, 86], minDepth: 2, depthBias: 0.36 },
        { material: 3, count: 15, radius: [40, 82], minDepth: 2, depthBias: 0.44 },
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
      { material: 2, count: Math.round(6 * richness), radius: [32, 70], minDepth: 2, depthBias: 0.34 },
      { material: 3, count: Math.round(6 * richness), radius: [30, 68], minDepth: 2, depthBias: 0.42 },
      { material: 4, count: Math.round((island.biome === 'crystal' ? 9 : 4) * richness), radius: [26, 58], minDepth: 3, depthBias: 0.56 },
      { material: 5, count: island.dangerLevel >= 3 || island.biome === 'crystal' ? 3 : 1, radius: [20, 42], minDepth: 8, depthBias: 0.74 },
    ];

    this.paintVeinPlan(random, veinPlan, surfaceRows);
  }

  paintVeinPlan(random, veinPlan, surfaceRows) {
    for (const vein of veinPlan) {
      for (let i = 0; i < vein.count; i += 1) {
        const col = clamp(Math.floor(random() * this.cols), 3, this.cols - 4);
        const surfaceRow = surfaceRows[col] || this.findSurfaceRow(col) || Math.round(this.landingY / this.cellSize);
        const bottomRow = this.findLastSolidRow(col) || this.rows - 5;
        const depthRows = Math.max(4, bottomRow - surfaceRow - vein.minDepth);
        const depthRoll = vein.depthBias + (1 - vein.depthBias) * random();
        const row = clamp(surfaceRow + vein.minDepth + Math.floor(depthRows * depthRoll), surfaceRow + vein.minDepth, bottomRow - 1);
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
    this.renderDirty = true;
    if (this.renderCanvas && !this.fullRenderDirty) this.markDirtyCell(col, row);
    else this.fullRenderDirty = true;
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

  forEachCollisionPolygonInAabb(left, top, right, bottom, callback) {
    const size = this.cellSize;
    const minCol = clamp(Math.floor(left / size) - 1, 0, this.cols - 2);
    const maxCol = clamp(Math.floor(right / size) + 1, 0, this.cols - 2);
    const minRow = clamp(Math.floor(top / size) - 1, 0, this.rows - 2);
    const maxRow = clamp(Math.floor(bottom / size) + 1, 0, this.rows - 2);
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        const marchingIndex = this.getMarchingIndex(col, row, (x, y) => this.isSolidCell(x, y));
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
    let hit = false;
    this.forEachCollisionPolygonInAabb(x - 1, y - 1, x + 1, y + 1, (polygon) => {
      if (!pointInPolygon(x, y, polygon) && !pointNearPolygonEdge(x, y, polygon)) return false;
      hit = true;
      return true;
    });
    return hit;
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
    const surfaceHit = this.raycastMarchingSurface(startX, startY, endX, endY);
    if (surfaceHit) return surfaceHit;
    return this.raycastSampledCells(startX, startY, endX, endY);
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

  mineCircle(worldX, worldY, radius, power, delta) {
    const broken = [];
    const halfSize = this.cellSize * 0.5;
    const startCol = clamp(Math.floor((worldX - radius - halfSize) / this.cellSize), 0, this.cols - 1);
    const endCol = clamp(Math.ceil((worldX + radius + halfSize) / this.cellSize), 0, this.cols - 1);
    const startRow = clamp(Math.floor((worldY - radius - halfSize) / this.cellSize), 0, this.rows - 1);
    const endRow = clamp(Math.ceil((worldY + radius + halfSize) / this.cellSize), 0, this.rows - 1);
    for (let row = startRow; row <= endRow; row += 1) {
      for (let col = startCol; col <= endCol; col += 1) {
        const material = this.getCell(col, row);
        if (material <= 0) continue;
        const centerX = col * this.cellSize;
        const centerY = row * this.cellSize;
        const distance = getPointAabbDistance(
          worldX,
          worldY,
          centerX - halfSize,
          centerY - halfSize,
          centerX + halfSize,
          centerY + halfSize,
        );
        const edgeNoise = signedNoise(col * 27.17 + row * 48.63 + this.seed * 0.01) * this.cellSize * 0.28;
        if (distance > radius + edgeNoise + this.cellSize * 0.22) continue;
        const data = TERRAIN_MATERIALS[material];
        const centerFalloff = clamp01(1 - distance / Math.max(1, radius + this.cellSize * 0.2));
        const falloff = 0.24 + centerFalloff * centerFalloff * 1.15;
        const index = this.index(col, row);
        this.damage[index] += power * delta * falloff;
        if (this.damage[index] < data.hardness) continue;
        this.damage[index] = 0;
        this.setCell(col, row, 0);
        broken.push({
          col,
          row,
          x: centerX,
          y: centerY,
          material,
          data,
        });
      }
    }
    return broken;
  }

  drawDamageFeedback(ctx, feedback, time = 0) {
    if (!feedback) return;
    const materialId = feedback.material || this.getCell(feedback.col, feedback.row);
    const data = TERRAIN_MATERIALS[materialId] || TERRAIN_MATERIALS[1];
    const ratio = clamp01(feedback.ratio ?? this.getDamageRatio(feedback.col, feedback.row, materialId));
    if (ratio <= 0.01 && !feedback.blocked) return;

    const size = this.cellSize;
    const centerX = feedback.col * size + size * 0.5;
    const centerY = feedback.row * size + size * 0.5;
    const seed = feedback.col * 97.13 + feedback.row * 41.77 + this.seed * 0.013;
    const shakePower = feedback.blocked ? 1.5 : 0.55 + ratio * 2.8;
    const shakeX = Math.sin(time * 82 + seed) * shakePower;
    const shakeY = Math.cos(time * 91 + seed * 0.7) * shakePower;
    const edgeColor = feedback.blocked ? '#ff756f' : (data.edge || '#ffd36b');
    const fillColor = mixHex(data.color || '#716b64', '#ffffff', feedback.blocked ? 0.1 : ratio * 0.18);
    const pointCount = 12;
    const radius = size * (0.54 + ratio * 0.08);

    ctx.save();
    ctx.translate(centerX + shakeX, centerY + shakeY);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowColor = edgeColor;
    ctx.shadowBlur = feedback.blocked ? 8 : 5 + ratio * 13;
    ctx.globalAlpha = feedback.blocked ? 0.72 : 0.66 + ratio * 0.28;
    ctx.fillStyle = withAlpha(fillColor, feedback.blocked ? 0.24 : 0.18 + ratio * 0.28);
    ctx.strokeStyle = withAlpha(edgeColor, feedback.blocked ? 0.9 : 0.62 + ratio * 0.3);
    ctx.lineWidth = Math.max(1.6, size * 0.08);
    ctx.beginPath();
    for (let index = 0; index < pointCount; index += 1) {
      const angle = (Math.PI * 2 * index) / pointCount;
      const noise = signedNoise(seed + index * 19.23 + ratio * 3.1);
      const localRadius = radius * (0.92 + noise * 0.18 + Math.sin(time * 11 + index) * ratio * 0.025);
      const x = Math.cos(angle) * localRadius;
      const y = Math.sin(angle) * localRadius;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (ratio > 0.18) {
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.28 + ratio * 0.62;
      ctx.strokeStyle = withAlpha('#170f10', 0.52 + ratio * 0.34);
      ctx.lineWidth = Math.max(1, size * 0.055);
      const crackCount = Math.min(7, 2 + Math.floor(ratio * 6));
      for (let crack = 0; crack < crackCount; crack += 1) {
        const angle = seed * 0.04 + crack * 2.17 + Math.sin(time * 7 + crack) * 0.08;
        const start = size * (0.08 + signedNoise(seed + crack * 3.3) * 0.04);
        const length = size * (0.18 + ratio * (0.18 + Math.abs(signedNoise(seed + crack * 11.1)) * 0.22));
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * start, Math.sin(angle) * start);
        ctx.quadraticCurveTo(
          Math.cos(angle + 0.45) * length * 0.55,
          Math.sin(angle + 0.45) * length * 0.55,
          Math.cos(angle) * length,
          Math.sin(angle) * length,
        );
        ctx.stroke();
      }
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
  }

  drawOrganicMass(ctx, bounds = null) {
    const palette = BIOME_PALETTES[this.biome] || BIOME_PALETTES.scrap;
    const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, palette.top);
    gradient.addColorStop(0.48, palette.body);
    gradient.addColorStop(1, palette.deep);
    ctx.fillStyle = gradient;
    this.fillMarchingPath(ctx, (col, row) => this.isSolidCell(col, row), bounds);
  }

  fillMarchingPath(ctx, predicate, bounds = null) {
    ctx.beginPath();
    this.buildMarchingPath(ctx, predicate, bounds);
    ctx.fill();
  }

  clipSolidMass(ctx, bounds = null) {
    this.clipMarchingPath(ctx, (col, row) => this.isSolidCell(col, row), bounds);
  }

  clipMarchingPath(ctx, predicate, bounds = null) {
    ctx.beginPath();
    this.buildMarchingPath(ctx, predicate, bounds);
    ctx.clip();
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

  drawPatternInMask(ctx, predicate, key, drawTile, bounds = null, alpha = 1) {
    const rect = this.getDrawRect(bounds);
    if (rect.width <= 0 || rect.height <= 0) return;
    const tile = this.getTextureTile(key, drawTile);
    const pattern = ctx.createPattern(tile, 'repeat');
    if (!pattern) return;
    ctx.save();
    this.clipMarchingPath(ctx, predicate, bounds);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = pattern;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.restore();
  }

  buildMarchingPath(ctx, predicate, bounds = null) {
    const size = this.cellSize;
    const minCol = bounds ? clamp(bounds.minCol - 1, 0, this.cols - 2) : 0;
    const maxCol = bounds ? clamp(bounds.maxCol + 1, 0, this.cols - 2) : this.cols - 2;
    const minRow = bounds ? clamp(bounds.minRow - 1, 0, this.rows - 2) : 0;
    const maxRow = bounds ? clamp(bounds.maxRow + 1, 0, this.rows - 2) : this.rows - 2;
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        const index = this.getMarchingIndex(col, row, predicate);
        const polygons = FILL_POLYGONS[index];
        if (!polygons?.length) continue;
        const x = col * size;
        const y = row * size;
        for (const polygon of polygons) this.tracePolygon(ctx, x, y, size, polygon);
      }
    }
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
      );
      this.drawOreFacets(ctx, material, data, bounds);
      this.strokeMarchingEdges(
        ctx,
        withAlpha(data.edge, material >= 4 ? 0.54 : 0.34),
        Math.max(1.3, this.cellSize * 0.08),
        bounds,
        predicate,
      );
    }
  }

  drawOreFacets(ctx, material, data, bounds = null) {
    const rect = this.getDrawRect(bounds);
    const random = createRandom(hashString(`${this.seed}:ore-facets:${material}:${rect.x}:${rect.y}:${rect.width}:${rect.height}`));
    const count = Math.min(140, Math.max(10, Math.floor((rect.width * rect.height) / 18000)));
    ctx.save();
    this.clipMarchingPath(ctx, (col, row) => this.getCell(col, row) === material, bounds);
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
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    this.strokeMarchingEdges(ctx, 'rgba(5, 11, 19, 0.5)', Math.max(4, this.cellSize * 0.28), bounds);
    this.strokeMarchingEdges(ctx, withAlpha(palette.edge, 0.42), Math.max(1.4, this.cellSize * 0.11), bounds);
    ctx.restore();
  }

  strokeMarchingEdges(ctx, style, width, bounds = null, predicate = (x, y) => this.isSolidCell(x, y)) {
    const size = this.cellSize;
    const minCol = bounds ? clamp(bounds.minCol - 1, 0, this.cols - 2) : 0;
    const maxCol = bounds ? clamp(bounds.maxCol + 1, 0, this.cols - 2) : this.cols - 2;
    const minRow = bounds ? clamp(bounds.minRow - 1, 0, this.rows - 2) : 0;
    const maxRow = bounds ? clamp(bounds.maxRow + 1, 0, this.rows - 2) : this.rows - 2;
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        const index = this.getMarchingIndex(col, row, predicate);
        const segments = EDGE_SEGMENTS[index];
        if (!segments?.length) continue;
        const x = col * size;
        const y = row * size;
        for (const segment of segments) {
          const a = POINTS[segment[0]];
          const b = POINTS[segment[1]];
          ctx.moveTo(x + a[0] * size, y + a[1] * size);
          ctx.lineTo(x + b[0] * size, y + b[1] * size);
        }
      }
    }
    ctx.stroke();
  }
}
