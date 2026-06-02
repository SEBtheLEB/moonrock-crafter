import { getShapeState } from '../systems/MachineSculptingSystem.js?v=133';

const FURNACE_WIDTH = 112;
const FURNACE_HEIGHT = 82;
const FURNACE_TOUCH_RADIUS = 92;
const VOXEL_COLORS = {
  stoneOre: '#a7adb4',
  copperShards: '#d9824a',
  fireCore: '#ff5d3d',
  ironDust: '#c2a889',
};

export class PlacedFurnace {
  constructor({
    id = null,
    x = 0,
    y = 0,
    rotation = 0,
    color = '#ff9f43',
    accent = '#ffd36b',
    shape = null,
  } = {}) {
    this.id = id || `furnace-${Date.now().toString(36)}-${Math.floor(Math.random() * 9999).toString(36)}`;
    this.x = x;
    this.y = y;
    this.rotation = rotation;
    this.color = color;
    this.accent = accent;
    this.shape = shape;
    this.glow = 0;
  }

  static deserialize(data = {}) {
    return new PlacedFurnace(data);
  }

  serialize() {
    return {
      id: this.id,
      x: Math.round(this.x * 10) / 10,
      y: Math.round(this.y * 10) / 10,
      rotation: Math.round(this.rotation * 10000) / 10000,
      color: this.color,
      accent: this.accent,
      shape: this.shape,
    };
  }

  update(delta, { active = false } = {}) {
    const target = active ? 1 : 0.38;
    this.glow += (target - this.glow) * Math.min(1, delta * 5);
  }

  overlapsPlayer(player) {
    if (!player) return false;
    const dx = player.centerX - this.x;
    const dy = player.centerY - (this.y - FURNACE_HEIGHT * 0.42);
    return dx * dx + dy * dy < FURNACE_TOUCH_RADIUS * FURNACE_TOUCH_RADIUS;
  }

  draw(ctx, { time = 0, ghost = false, active = false, progress = 0, tileSize = null } = {}) {
    PlacedFurnace.drawShape(ctx, {
      x: this.x,
      y: this.y,
      rotation: this.rotation,
      time,
      ghost,
      active,
      progress,
      glow: this.glow,
      color: this.color,
      accent: this.accent,
      shape: this.shape,
      tileSize,
    });
  }

  static drawGhost(ctx, { x, y, viewRotation = 0, rotation = -viewRotation, time = 0, color = '#ff9f43', accent = '#ffd36b', shape = null, tileSize = null } = {}) {
    PlacedFurnace.drawShape(ctx, {
      x,
      y,
      rotation,
      time,
      ghost: true,
      active: true,
      progress: 0,
      glow: 0.75,
      color,
      accent,
      shape,
      tileSize,
    });
  }

  static getShapeFootprint(shape = null, fallbackWidth = FURNACE_WIDTH) {
    if (!shape?.cells?.length) return { width: fallbackWidth, height: FURNACE_HEIGHT, baseWidth: fallbackWidth };
    const xs = shape.cells.map((cell) => cell.x);
    const ys = shape.cells.map((cell) => cell.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const bottomY = maxY;
    const baseCells = shape.cells.filter((cell) => cell.y === bottomY);
    const baseMinX = Math.min(...baseCells.map((cell) => cell.x));
    const baseMaxX = Math.max(...baseCells.map((cell) => cell.x));
    const tile = shape.tileSize || 22;
    return {
      minX,
      maxX,
      minY,
      maxY,
      width: (maxX - minX + 1) * tile,
      height: (maxY - minY + 1) * tile,
      baseWidth: Math.max(tile, (baseMaxX - baseMinX + 1) * tile),
    };
  }

  static drawShape(ctx, {
    x,
    y,
    rotation = 0,
    time = 0,
    ghost = false,
    active = false,
    progress = 0,
    glow = 0.5,
    color = '#ff9f43',
    accent = '#ffd36b',
    shape = null,
    tileSize = null,
  } = {}) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.globalAlpha *= ghost ? 0.55 : 1;

    if (shape?.cells?.length) {
      PlacedFurnace.drawVoxelShape(ctx, { shape, tileSize, time, ghost, active, progress, color, accent });
      ctx.restore();
      return;
    }

    ctx.fillStyle = ghost ? 'rgba(255, 159, 67, 0.12)' : 'rgba(3, 9, 16, 0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 7, FURNACE_WIDTH * 0.52, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    const heat = active ? 0.72 + Math.sin(time * 9) * 0.12 : 0.34 + glow * 0.22;
    ctx.shadowColor = color;
    ctx.shadowBlur = ghost ? 16 : 12 + heat * 18;

    ctx.fillStyle = ghost ? 'rgba(255, 159, 67, 0.2)' : '#31404a';
    ctx.strokeStyle = ghost ? 'rgba(255, 211, 107, 0.68)' : 'rgba(5, 12, 19, 0.78)';
    ctx.lineWidth = ghost ? 2 : 2.4;
    ctx.beginPath();
    ctx.roundRect(-FURNACE_WIDTH / 2, -FURNACE_HEIGHT, FURNACE_WIDTH, FURNACE_HEIGHT, 13);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = ghost ? 'rgba(255, 211, 107, 0.18)' : '#17242d';
    ctx.beginPath();
    ctx.roundRect(-36, -58, 72, 38, 10);
    ctx.fill();
    ctx.stroke();

    const flameGradient = ctx.createRadialGradient(0, -38, 4, 0, -38, 34);
    flameGradient.addColorStop(0, `rgba(255, 244, 204, ${0.8 * heat})`);
    flameGradient.addColorStop(0.45, `rgba(255, 159, 67, ${0.75 * heat})`);
    flameGradient.addColorStop(1, `rgba(255, 78, 43, ${0.2 * heat})`);
    ctx.fillStyle = flameGradient;
    ctx.beginPath();
    ctx.ellipse(0, -38, 28, 19, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = ghost ? 'rgba(255, 242, 207, 0.55)' : '#d7c2a0';
    ctx.fillRect(-45, -14, 90, 10);
    ctx.strokeRect(-45, -14, 90, 10);

    if (progress > 0) {
      ctx.fillStyle = accent;
      ctx.fillRect(-41, -11, 82 * Math.max(0, Math.min(1, progress)), 4);
    }

    ctx.fillStyle = accent;
    ctx.globalAlpha *= ghost ? 0.5 : 0.84;
    for (let index = 0; index < 3; index += 1) {
      const spark = time * 2.6 + index * 2.1;
      ctx.beginPath();
      ctx.arc(-22 + index * 22 + Math.sin(spark) * 3, -72 - Math.cos(spark) * 5, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  static drawVoxelShape(ctx, { shape, tileSize = null, time = 0, ghost = false, active = false, progress = 0, color = '#ff9f43', accent = '#ffd36b' } = {}) {
    const tile = tileSize || shape.tileSize || 22;
    const footprint = PlacedFurnace.getShapeFootprint(shape, FURNACE_WIDTH);
    const centerOffset = (footprint.minX + footprint.maxX + 1) * 0.5;
    const baseY = footprint.maxY + 1;
    const heat = active ? 0.78 + Math.sin(time * 9) * 0.12 : 0.36;

    ctx.fillStyle = ghost ? 'rgba(255, 159, 67, 0.12)' : 'rgba(3, 9, 16, 0.32)';
    ctx.beginPath();
    ctx.ellipse(0, 8, Math.max(26, footprint.baseWidth * 0.48), 8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(-centerOffset * tile, -baseY * tile);
    ctx.shadowColor = color;
    ctx.shadowBlur = ghost ? 14 : active ? 22 : 8;
    for (const cell of shape.cells) {
      const x = cell.x * tile;
      const y = cell.y * tile;
      const layers = PlacedFurnace.getCellLayers(cell);
      const baseId = layers[0] || cell.itemId;
      const topId = layers[layers.length - 1] || cell.itemId;
      const cellColor = VOXEL_COLORS[baseId] || cell.color || '#a7adb4';
      const topColor = VOXEL_COLORS[topId] || cell.color || cellColor;
      ctx.fillStyle = ghost ? `${cellColor}66` : cellColor;
      ctx.beginPath();
      PlacedFurnace.traceVoxelCell(ctx, x, y, tile, cell.shape || 0);
      ctx.fill();
      if (layers.length > 1) {
        ctx.fillStyle = ghost ? `${topColor}88` : topColor;
        ctx.beginPath();
        ctx.roundRect(x + tile * 0.2, y + tile * 0.2, tile * 0.6, tile * 0.6, Math.max(3, tile * 0.14));
        ctx.fill();
      }
      if (layers.includes('fireCore')) {
        ctx.fillStyle = `rgba(255, 244, 204, ${0.35 + heat * 0.35})`;
        ctx.beginPath();
        ctx.arc(x + tile * 0.5, y + tile * 0.5, tile * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }
      if (cell.detailId === 'bolts' || cell.shapeState === 'boltedPlate') {
        ctx.fillStyle = 'rgba(255, 242, 207, 0.34)';
        [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]].forEach(([px, py]) => {
          ctx.beginPath();
          ctx.arc(x + tile * px, y + tile * py, tile * 0.045, 0, Math.PI * 2);
          ctx.fill();
        });
      }
      if (cell.detailId === 'warningStripes') {
        ctx.strokeStyle = 'rgba(255, 211, 107, 0.65)';
        ctx.lineWidth = Math.max(1, tile * 0.08);
        ctx.beginPath();
        ctx.moveTo(x + tile * 0.18, y + tile * 0.82);
        ctx.lineTo(x + tile * 0.82, y + tile * 0.18);
        ctx.stroke();
      }
    }

    if (progress > 0) {
      ctx.fillStyle = accent;
      ctx.fillRect(0, baseY * tile + 4, footprint.width * Math.max(0, Math.min(1, progress)), 4);
    }
    ctx.restore();

    ctx.fillStyle = accent;
    ctx.globalAlpha *= ghost ? 0.5 : 0.8;
    for (let index = 0; index < 3; index += 1) {
      const spark = time * 2.8 + index * 2.1;
      ctx.beginPath();
      ctx.arc(-footprint.width * 0.24 + index * footprint.width * 0.22 + Math.sin(spark) * 3, -footprint.height - 10 - Math.cos(spark) * 5, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  static getCellLayers(cell) {
    if (Array.isArray(cell?.layers) && cell.layers.length) return cell.layers;
    return cell?.itemId ? [cell.itemId] : [];
  }

  static traceVoxelCell(ctx, x, y, tile, shape = 0) {
    const shapeState = getShapeState(shape);
    const inset = Math.max(0.5, tile * 0.035);
    const left = x + inset;
    const top = y + inset;
    const right = x + tile - inset;
    const bottom = y + tile - inset;
    const cut = tile * 0.32;
    if (shapeState === 'diagonalSlope') {
      ctx.moveTo(left + cut, top);
      ctx.lineTo(right, top);
      ctx.lineTo(right, bottom);
      ctx.lineTo(left, bottom);
      ctx.lineTo(left, top + cut);
    } else if (shapeState === 'invertedDiagonal') {
      ctx.moveTo(left, top);
      ctx.lineTo(right - cut, top);
      ctx.lineTo(right, top + cut);
      ctx.lineTo(right, bottom);
      ctx.lineTo(left, bottom);
    } else if (shapeState === 'halfBlock') {
      ctx.roundRect(left, top + tile * 0.34, tile - inset * 2, tile * 0.62, Math.max(2, tile * 0.08));
      return;
    } else if (shapeState === 'quarterBlock') {
      ctx.roundRect(left, top, tile * 0.64, tile * 0.64, Math.max(2, tile * 0.08));
      return;
    } else if (shapeState === 'roundedCorner') {
      ctx.roundRect(left, top, tile - inset * 2, tile - inset * 2, Math.max(4, tile * 0.24));
      return;
    } else if (shapeState === 'pipeCorner') {
      ctx.arc(x + tile * 0.5, y + tile * 0.5, tile * 0.42, 0, Math.PI * 2);
      return;
    } else {
      ctx.roundRect(left, top, tile - inset * 2, tile - inset * 2, Math.max(2, tile * 0.1));
      return;
    }
    ctx.closePath();
  }
}
