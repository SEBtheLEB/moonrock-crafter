import { materials } from '../data/materials.js?v=112';
import { gameBalance } from '../data/gameBalance.js?v=112';
import { getPointAabbDistance, getPointPolygonDistanceSq, getSegmentPolygonHit } from '../utils/raycast.js?v=112';

const MATERIAL_COLORS = Object.fromEntries(materials.map((material) => [material.id, material.color]));

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

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const clamp01 = (value) => Math.max(0, Math.min(1, value));

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

function createRandom(seedValue) {
  let seed = Math.floor(seedValue * 4294967295) >>> 0;
  return () => {
    seed += 0x6D2B79F5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function signedNoise(value) {
  const normalized = (Math.sin(value) * 43758.5453) % 1;
  return normalized - Math.floor(normalized) - 0.5;
}

export class VoxelAsteroidBody {
  constructor({ data, radius, seed, dropScale = 1 }) {
    this.reset({ data, radius, seed, dropScale });
  }

  reset({ data, radius, seed, dropScale = 1 }) {
    this.data = data;
    this.radius = radius;
    this.seed = seed;
    this.dropScale = dropScale;
    this.cellSize = clamp(Math.round(radius / 2.85), 28, 58);
    this.padding = this.cellSize * 3;
    this.size = Math.ceil((radius * 2 + this.padding * 2) / this.cellSize) * this.cellSize;
    this.cols = Math.ceil(this.size / this.cellSize);
    this.rows = this.cols;
    this.originX = this.size / 2;
    this.originY = this.size / 2;
    this.cells = new Uint8Array(this.cols * this.rows);
    this.damage = new Float32Array(this.cols * this.rows);
    this.slotDefs = this.createSlotDefs(data);
    this.renderCanvas = null;
    this.renderCtx = null;
    this.renderDirty = true;
    this.generate();
    return this;
  }

  createSlotDefs(data) {
    const drops = data.drops?.length ? data.drops : [{ materialId: 'stoneOre', chance: 1 }];
    const baseDrop = drops[0];
    const baseColor = MATERIAL_COLORS[baseDrop.materialId] || data.color;
    const hardnessBase = gameBalance.mining?.asteroidCellHardnessBase ?? 3.15;
    const requirementScale = gameBalance.mining?.asteroidCellHardnessRequirementScale ?? 1.25;
    const oreBonus = gameBalance.mining?.asteroidOreHardnessBonus ?? 0.72;
    const defs = [null, {
      materialId: baseDrop.materialId,
      color: data.color || baseColor,
      edge: data.accent || baseColor,
      hardness: hardnessBase + (data.miningPowerRequired || 0) * requirementScale,
      yieldScale: 0.11 * this.dropScale,
    }];

    drops.slice(1).forEach((drop) => {
      const color = MATERIAL_COLORS[drop.materialId] || data.accent || data.color;
      defs.push({
        materialId: drop.materialId,
        color,
        edge: data.accent || color,
        hardness: hardnessBase + oreBonus + (data.miningPowerRequired || 0) * requirementScale,
        yieldScale: Math.max(0.05, (drop.chance || 0.2) * 0.16 * this.dropScale),
      });
    });
    return defs;
  }

  generate() {
    const random = createRandom(this.seed);
    this.cells.fill(0);
    this.damage.fill(0);

    for (let row = 0; row < this.rows; row += 1) {
      for (let col = 0; col < this.cols; col += 1) {
        const { x, y } = this.localCenterOfCell(col, row);
        const angle = Math.atan2(y, x);
        const distance = Math.hypot(x, y);
        const boundary = this.radius
          * (0.88
            + Math.sin(angle * 5 + this.seed * 9) * 0.055
            + Math.sin(angle * 9 + this.seed * 17) * 0.04
            + (random() - 0.5) * 0.045);
        if (distance <= boundary) this.setCell(col, row, 1);
      }
    }

    this.paintOreBlobs(random);
    this.initialSolidCount = this.countSolidCells();
    this.remainingSolidCount = this.initialSolidCount;
    this.renderDirty = true;
  }

  paintOreBlobs(random) {
    if (this.slotDefs.length <= 2) return;
    for (let slot = 2; slot < this.slotDefs.length; slot += 1) {
      const blobCount = slot === 2 ? 1 + Math.floor(random() * 2) : 1;
      for (let blob = 0; blob < blobCount; blob += 1) {
        const angle = random() * Math.PI * 2;
        const distance = this.radius * (0.1 + random() * 0.46);
        const cx = Math.cos(angle) * distance;
        const cy = Math.sin(angle) * distance;
        const rx = this.radius * (0.22 + random() * 0.18);
        const ry = this.radius * (0.12 + random() * 0.1);
        const veinAngle = random() * Math.PI * 2;
        this.paintOreEllipse(cx, cy, rx, ry, veinAngle, slot);
      }
    }
  }

  paintOreEllipse(cx, cy, rx, ry, angle, slot) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (let row = 1; row < this.rows - 1; row += 1) {
      for (let col = 1; col < this.cols - 1; col += 1) {
        if (!this.isSolidCell(col, row)) continue;
        const point = this.localCenterOfCell(col, row);
        const dx = point.x - cx;
        const dy = point.y - cy;
        const localX = dx * cos + dy * sin;
        const localY = -dx * sin + dy * cos;
        const wobble = signedNoise(col * 93.17 + row * 31.9 + this.seed * 71) * 0.2;
        if ((localX / rx) ** 2 + (localY / ry) ** 2 <= 1 + wobble) this.setCell(col, row, slot);
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
    this.cells[this.index(col, row)] = value;
  }

  isSolidCell(col, row) {
    return this.getCell(col, row) > 0;
  }

  localCenterOfCell(col, row) {
    return {
      x: col * this.cellSize + this.cellSize * 0.5 - this.originX,
      y: row * this.cellSize + this.cellSize * 0.5 - this.originY,
    };
  }

  cellFromLocal(x, y) {
    return {
      col: Math.floor((x + this.originX) / this.cellSize),
      row: Math.floor((y + this.originY) / this.cellSize),
    };
  }

  localFromWorld(worldX, worldY, asteroid) {
    const dx = worldX - asteroid.x;
    const dy = worldY - asteroid.y;
    const cos = Math.cos(-asteroid.rotation);
    const sin = Math.sin(-asteroid.rotation);
    return {
      x: dx * cos - dy * sin,
      y: dx * sin + dy * cos,
    };
  }

  worldFromLocal(localX, localY, asteroid) {
    const cos = Math.cos(asteroid.rotation);
    const sin = Math.sin(asteroid.rotation);
    return {
      x: asteroid.x + localX * cos - localY * sin,
      y: asteroid.y + localX * sin + localY * cos,
    };
  }

  containsWorldPoint(worldX, worldY, asteroid, padding = 0) {
    const point = this.localFromWorld(worldX, worldY, asteroid);
    if (Math.hypot(point.x, point.y) > this.radius + padding) return false;
    const canvasX = point.x + this.originX;
    const canvasY = point.y + this.originY;
    const pickPadding = Math.max(padding, this.cellSize * 0.12);
    return this.pointTouchesMarchingSurface(canvasX, canvasY, pickPadding);
  }

  collidesWorldCircle(worldX, worldY, circleRadius, asteroid) {
    const local = this.localFromWorld(worldX, worldY, asteroid);
    const padding = circleRadius + this.cellSize;
    if (Math.hypot(local.x, local.y) > this.radius + padding) return false;
    const startCol = clamp(Math.floor((local.x + this.originX - padding) / this.cellSize), 0, this.cols - 1);
    const endCol = clamp(Math.ceil((local.x + this.originX + padding) / this.cellSize), 0, this.cols - 1);
    const startRow = clamp(Math.floor((local.y + this.originY - padding) / this.cellSize), 0, this.rows - 1);
    const endRow = clamp(Math.ceil((local.y + this.originY + padding) / this.cellSize), 0, this.rows - 1);
    const cellCollisionRadius = this.cellSize * 0.54;

    for (let row = startRow; row <= endRow; row += 1) {
      for (let col = startCol; col <= endCol; col += 1) {
        if (!this.isSolidCell(col, row)) continue;
        const center = this.localCenterOfCell(col, row);
        const dx = center.x - local.x;
        const dy = center.y - local.y;
        const minDistance = circleRadius + cellCollisionRadius;
        if (dx * dx + dy * dy <= minDistance * minDistance) return true;
      }
    }
    return false;
  }

  raycast(startX, startY, endX, endY, asteroid) {
    const surfaceHit = this.raycastMarchingSurface(startX, startY, endX, endY, asteroid);
    if (surfaceHit) return surfaceHit;
    return this.raycastSampledCells(startX, startY, endX, endY, asteroid);
  }

  raycastMarchingSurface(startX, startY, endX, endY, asteroid) {
    const dx = endX - startX;
    const dy = endY - startY;
    const distance = Math.hypot(dx, dy);
    if (distance <= 0.001) return null;
    const start = this.localFromWorld(startX, startY, asteroid);
    const end = this.localFromWorld(endX, endY, asteroid);
    const startCanvasX = start.x + this.originX;
    const startCanvasY = start.y + this.originY;
    const endCanvasX = end.x + this.originX;
    const endCanvasY = end.y + this.originY;
    const size = this.cellSize;
    const minCol = clamp(Math.floor((Math.min(startCanvasX, endCanvasX) - size) / size), 0, this.cols - 2);
    const maxCol = clamp(Math.ceil((Math.max(startCanvasX, endCanvasX) + size) / size), 0, this.cols - 2);
    const minRow = clamp(Math.floor((Math.min(startCanvasY, endCanvasY) - size) / size), 0, this.rows - 2);
    const maxRow = clamp(Math.ceil((Math.max(startCanvasY, endCanvasY) + size) / size), 0, this.rows - 2);
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
          const hit = getSegmentPolygonHit(startCanvasX, startCanvasY, endCanvasX, endCanvasY, points);
          if (!hit || hit.t >= bestT) continue;
          const cell = this.getRaycastSlotFromMarchingCell(col, row, hit.x, hit.y);
          if (!cell) continue;
          const world = this.worldFromLocal(hit.x - this.originX, hit.y - this.originY, asteroid);
          bestT = hit.t;
          best = {
            x: world.x,
            y: world.y,
            col: cell.col,
            row: cell.row,
            slot: cell.slot,
            distance: hit.t * distance,
            data: this.slotDefs[cell.slot],
          };
        }
      }
    }
    return best;
  }

  getRaycastSlotFromMarchingCell(col, row, hitX, hitY) {
    const candidates = [
      { col, row },
      { col: col + 1, row },
      { col: col + 1, row: row + 1 },
      { col, row: row + 1 },
    ];
    let best = null;
    let bestDistanceSq = Infinity;
    for (const candidate of candidates) {
      const slot = this.getCell(candidate.col, candidate.row);
      if (slot <= 0) continue;
      const dx = candidate.col * this.cellSize - hitX;
      const dy = candidate.row * this.cellSize - hitY;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq >= bestDistanceSq) continue;
      bestDistanceSq = distanceSq;
      best = { ...candidate, slot };
    }
    return best;
  }

  pointTouchesMarchingSurface(canvasX, canvasY, padding = 0) {
    const size = this.cellSize;
    const minCol = clamp(Math.floor((canvasX - padding - size) / size), 0, this.cols - 2);
    const maxCol = clamp(Math.ceil((canvasX + padding + size) / size), 0, this.cols - 2);
    const minRow = clamp(Math.floor((canvasY - padding - size) / size), 0, this.rows - 2);
    const maxRow = clamp(Math.ceil((canvasY + padding + size) / size), 0, this.rows - 2);
    const paddingSq = padding * padding;
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
          if (getPointPolygonDistanceSq(canvasX, canvasY, points) <= paddingSq) return true;
        }
      }
    }
    return false;
  }

  raycastSampledCells(startX, startY, endX, endY, asteroid) {
    const dx = endX - startX;
    const dy = endY - startY;
    const distance = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(distance / Math.max(3, this.cellSize * 0.18)));
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const x = startX + dx * t;
      const y = startY + dy * t;
      const point = this.localFromWorld(x, y, asteroid);
      const { col, row } = this.cellFromLocal(point.x, point.y);
      const slot = this.getCell(col, row);
      if (slot > 0) {
        return {
          x,
          y,
          col,
          row,
          slot,
          distance: t * distance,
          data: this.slotDefs[slot],
        };
      }
    }
    return null;
  }

  mineCircleWorld(worldX, worldY, radius, power, delta, asteroid, options = {}) {
    const local = this.localFromWorld(worldX, worldY, asteroid);
    const halfSize = this.cellSize * 0.5;
    const hasTarget = Number.isInteger(options.targetCol) && Number.isInteger(options.targetRow);
    const startCol = hasTarget ? options.targetCol : clamp(Math.floor((local.x + this.originX - radius - halfSize) / this.cellSize), 0, this.cols - 1);
    const endCol = hasTarget ? options.targetCol : clamp(Math.ceil((local.x + this.originX + radius + halfSize) / this.cellSize), 0, this.cols - 1);
    const startRow = hasTarget ? options.targetRow : clamp(Math.floor((local.y + this.originY - radius - halfSize) / this.cellSize), 0, this.rows - 1);
    const endRow = hasTarget ? options.targetRow : clamp(Math.ceil((local.y + this.originY + radius + halfSize) / this.cellSize), 0, this.rows - 1);
    const broken = [];

    for (let row = startRow; row <= endRow; row += 1) {
      for (let col = startCol; col <= endCol; col += 1) {
        const slot = this.getCell(col, row);
        if (slot <= 0) continue;
        const left = col * this.cellSize - this.originX;
        const top = row * this.cellSize - this.originY;
        const center = {
          x: left + halfSize,
          y: top + halfSize,
        };
        if (!hasTarget) {
          const distance = getPointAabbDistance(
            local.x,
            local.y,
            left,
            top,
            left + this.cellSize,
            top + this.cellSize,
          );
          if (distance > radius) continue;
        }
        const slotDef = this.slotDefs[slot] || this.slotDefs[1];
        const index = this.index(col, row);
        this.damage[index] += power * delta;
        if (this.damage[index] < slotDef.hardness) continue;
        this.damage[index] = 0;
        this.cells[index] = 0;
        this.remainingSolidCount -= 1;
        this.renderDirty = true;
        const world = this.worldFromLocal(center.x, center.y, asteroid);
        broken.push({
          x: world.x,
          y: world.y,
          slot,
          materialId: slotDef.materialId,
          yieldScale: slotDef.yieldScale,
          color: slotDef.color,
        });
      }
    }
    return broken;
  }

  getMassRatio() {
    return this.initialSolidCount > 0 ? clamp01(this.remainingSolidCount / this.initialSolidCount) : 0;
  }

  isDepleted() {
    return this.remainingSolidCount <= Math.max(3, this.initialSolidCount * 0.45);
  }

  countSolidCells() {
    let count = 0;
    for (let index = 0; index < this.cells.length; index += 1) {
      if (this.cells[index] > 0) count += 1;
    }
    return count;
  }

  draw(ctx) {
    if (!this.renderCanvas || this.renderDirty) this.redraw();
    ctx.drawImage(this.renderCanvas, -this.originX, -this.originY);
  }

  drawCellHighlight(ctx, hit, time = 0) {
    if (!hit || !this.isSolidCell(hit.col, hit.row)) return;
    const slot = this.getCell(hit.col, hit.row);
    const def = this.slotDefs[slot] || this.slotDefs[1];
    const center = this.localCenterOfCell(hit.col, hit.row);
    const color = def.edge || def.color || '#ffd36b';
    const pulse = 1 + Math.sin(time * 15) * 0.07;
    const size = this.cellSize * 0.9;

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.scale(pulse, pulse);
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = withAlpha(color, 0.22);
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.roundRect(-size * 0.5, -size * 0.5, size, size, Math.max(5, size * 0.22));
    ctx.fill();

    ctx.globalAlpha = 0.88;
    ctx.strokeStyle = withAlpha(color, 0.92);
    ctx.lineWidth = Math.max(1.6, this.cellSize * 0.08);
    ctx.setLineDash([this.cellSize * 0.32, this.cellSize * 0.2]);
    ctx.lineDashOffset = -time * 22;
    ctx.stroke();
    ctx.restore();
  }

  redraw() {
    const canvas = this.getCanvas();
    const ctx = this.renderCtx;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.drawMass(ctx);
    this.drawOre(ctx);
    this.drawTexture(ctx);
    this.drawEdges(ctx);
    this.renderDirty = false;
  }

  getCanvas() {
    if (!this.renderCanvas) {
      this.renderCanvas = document.createElement('canvas');
      this.renderCtx = this.renderCanvas.getContext('2d');
    }
    if (this.renderCanvas.width !== this.size || this.renderCanvas.height !== this.size) {
      this.renderCanvas.width = this.size;
      this.renderCanvas.height = this.size;
      this.renderDirty = true;
    }
    return this.renderCanvas;
  }

  drawMass(ctx) {
    const gradient = ctx.createRadialGradient(this.originX - this.radius * 0.25, this.originY - this.radius * 0.32, this.radius * 0.1, this.originX, this.originY, this.radius * 1.12);
    gradient.addColorStop(0, withAlpha(this.data.accent || this.data.color, 0.52));
    gradient.addColorStop(0.34, this.data.color);
    gradient.addColorStop(1, '#242832');
    ctx.fillStyle = gradient;
    this.fillMarchingPath(ctx, (col, row) => this.isSolidCell(col, row));
  }

  drawOre(ctx) {
    ctx.save();
    this.clipSolid(ctx);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let slot = 2; slot < this.slotDefs.length; slot += 1) {
      const def = this.slotDefs[slot];
      ctx.fillStyle = withAlpha(mixHex(def.color, '#111722', 0.16), 0.52);
      this.fillMarchingPath(ctx, (col, row) => this.getCell(col, row) === slot);
      this.drawOreMottles(ctx, slot, def);
      this.strokeMarchingEdges(ctx, withAlpha(def.edge, 0.42), Math.max(1.2, this.cellSize * 0.1), (col, row) => this.getCell(col, row) === slot);
    }
    ctx.restore();
  }

  drawOreMottles(ctx, slot, def) {
    ctx.save();
    ctx.beginPath();
    this.buildMarchingPath(ctx, (col, row) => this.getCell(col, row) === slot);
    ctx.clip();
    for (let row = 1; row < this.rows - 1; row += 1) {
      for (let col = 1; col < this.cols - 1; col += 1) {
        if (this.getCell(col, row) !== slot) continue;
        const hash = ((col * 19349663 + row * 83492791 + Math.floor(this.seed * 100000)) >>> 0);
        const x = col * this.cellSize + ((hash >>> 5) % Math.max(1, this.cellSize));
        const y = row * this.cellSize + ((hash >>> 11) % Math.max(1, this.cellSize));
        const radius = this.cellSize * (0.1 + ((hash >>> 17) % 100) / 420);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(((hash >>> 23) % 628) / 100);
        ctx.fillStyle = withAlpha(mixHex(def.edge, '#ffffff', slot > 2 ? 0.28 : 0.14), slot > 2 ? 0.38 : 0.24);
        ctx.beginPath();
        if (slot > 2) {
          ctx.moveTo(0, -radius * 1.5);
          ctx.lineTo(radius, 0);
          ctx.lineTo(0, radius * 1.5);
          ctx.lineTo(-radius * 0.8, 0);
          ctx.closePath();
        } else {
          ctx.ellipse(0, 0, radius * 1.9, radius * 0.72, 0, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  drawTexture(ctx) {
    ctx.save();
    this.clipSolid(ctx);
    for (let row = 0; row < this.rows; row += 1) {
      for (let col = 0; col < this.cols; col += 1) {
        const slot = this.getCell(col, row);
        if (slot <= 0) continue;
        const hash = ((col * 928371 + row * 364479 + Math.floor(this.seed * 10000)) >>> 0);
        if (hash % 5 !== 0) continue;
        const x = col * this.cellSize + ((hash >>> 3) % Math.max(1, this.cellSize - 2)) + 1;
        const y = row * this.cellSize + ((hash >>> 9) % Math.max(1, this.cellSize - 2)) + 1;
        ctx.fillStyle = slot > 1 ? withAlpha(this.slotDefs[slot].edge, 0.18) : 'rgba(255, 244, 217, 0.1)';
        ctx.beginPath();
        ctx.ellipse(x, y, 0.8 + (hash % 7) * 0.18, 0.6 + ((hash >>> 4) % 5) * 0.16, ((hash >>> 8) % 628) / 100, 0, Math.PI * 2);
        ctx.fill();
        if (slot === 1 && hash % 19 === 0) {
          ctx.strokeStyle = withAlpha(this.data.accent || '#d7e4ff', 0.11);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(
            x + signedNoise(hash * 0.13) * this.cellSize * 0.42,
            y + signedNoise(hash * 0.27) * this.cellSize * 0.42,
            x + signedNoise(hash * 0.41) * this.cellSize * 0.92,
            y + signedNoise(hash * 0.53) * this.cellSize * 0.92,
          );
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  drawEdges(ctx) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    this.strokeMarchingEdges(ctx, 'rgba(4, 9, 16, 0.7)', Math.max(3.2, this.cellSize * 0.32));
    this.strokeMarchingEdges(ctx, withAlpha(this.data.accent || '#d7e4ff', 0.38), Math.max(1.2, this.cellSize * 0.14));
    ctx.restore();
  }

  clipSolid(ctx) {
    ctx.beginPath();
    this.buildMarchingPath(ctx, (col, row) => this.isSolidCell(col, row));
    ctx.clip();
  }

  fillMarchingPath(ctx, predicate) {
    ctx.beginPath();
    this.buildMarchingPath(ctx, predicate);
    ctx.fill();
  }

  buildMarchingPath(ctx, predicate) {
    for (let row = 0; row < this.rows - 1; row += 1) {
      for (let col = 0; col < this.cols - 1; col += 1) {
        const marchingIndex = this.getMarchingIndex(col, row, predicate);
        const polygons = FILL_POLYGONS[marchingIndex];
        if (!polygons?.length) continue;
        const x = col * this.cellSize;
        const y = row * this.cellSize;
        for (const polygon of polygons) this.tracePolygon(ctx, x, y, this.cellSize, polygon);
      }
    }
  }

  strokeMarchingEdges(ctx, style, width, predicate = (x, y) => this.isSolidCell(x, y)) {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let row = 0; row < this.rows - 1; row += 1) {
      for (let col = 0; col < this.cols - 1; col += 1) {
        const marchingIndex = this.getMarchingIndex(col, row, predicate);
        const segments = EDGE_SEGMENTS[marchingIndex];
        if (!segments?.length) continue;
        const x = col * this.cellSize;
        const y = row * this.cellSize;
        for (const segment of segments) {
          const a = POINTS[segment[0]];
          const b = POINTS[segment[1]];
          ctx.moveTo(x + a[0] * this.cellSize, y + a[1] * this.cellSize);
          ctx.lineTo(x + b[0] * this.cellSize, y + b[1] * this.cellSize);
        }
      }
    }
    ctx.stroke();
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
}
