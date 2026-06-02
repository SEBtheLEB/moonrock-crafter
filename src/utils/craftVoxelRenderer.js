import {
  detectInternalChambers,
  getAutoShapeType,
  getCellLayers,
  getNeighbors,
  getShapeState,
  getTopMaterialId,
  getVoxelEntries,
  isOccupied,
} from '../systems/MachineSculptingSystem.js?v=158';

const CELL_PIXELS = 42;

const VISUAL_TYPES = {
  stoneOre: 'stone',
  copperShards: 'metal',
  fireCore: 'core',
};

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function hexToRgb(hex = '#ffffff') {
  const normalized = hex.replace('#', '').trim();
  const value = normalized.length === 3
    ? normalized.split('').map((part) => part + part).join('')
    : normalized.padEnd(6, 'f').slice(0, 6);
  const number = Number.parseInt(value, 16);
  return {
    r: (number >> 16) & 255,
    g: (number >> 8) & 255,
    b: number & 255,
  };
}

function rgba(hex, alpha = 1) {
  const color = hexToRgb(hex);
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
}

function mixHex(hex, targetHex, amount = 0.5) {
  const a = hexToRgb(hex);
  const b = hexToRgb(targetHex);
  const t = clamp01(amount);
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
}

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

function getVisualType(materialId, visual = {}) {
  return visual.visualType || VISUAL_TYPES[materialId] || 'stone';
}

function traceRoundedRect(ctx, x, y, width, height, radius = 5) {
  ctx.roundRect(x, y, width, height, radius);
}

function getOuterOrientation(neighbors = {}, col = 0, row = 0) {
  const missing = {
    n: !neighbors.n,
    e: !neighbors.e,
    s: !neighbors.s,
    w: !neighbors.w,
  };
  if (missing.n && missing.w) return 'nw';
  if (missing.n && missing.e) return 'ne';
  if (missing.s && missing.e) return 'se';
  if (missing.s && missing.w) return 'sw';
  if (missing.n) return col % 2 ? 'ne' : 'nw';
  if (missing.e) return row % 2 ? 'se' : 'ne';
  if (missing.s) return col % 2 ? 'se' : 'sw';
  if (missing.w) return row % 2 ? 'sw' : 'nw';
  return 'nw';
}

function traceVoxelShape(ctx, cell, cellSize = CELL_PIXELS, inset = 0.45, resetPath = true) {
  const x = cell.col * cellSize + inset;
  const y = cell.row * cellSize + inset;
  const size = cellSize - inset * 2;
  const right = x + size;
  const bottom = y + size;
  const cut = size * 0.34;
  const smallCut = size * 0.22;
  const state = cell.autoShapeType === 'interior' ? 'full' : getShapeState(cell.shapeState);
  const orientation = getOuterOrientation(cell.neighbors, cell.col, cell.row);

  if (resetPath) ctx.beginPath();
  if (state === 'diagonalSlope') {
    if (orientation === 'nw') {
      ctx.moveTo(x + cut, y); ctx.lineTo(right, y); ctx.lineTo(right, bottom); ctx.lineTo(x, bottom); ctx.lineTo(x, y + cut);
    } else if (orientation === 'ne') {
      ctx.moveTo(x, y); ctx.lineTo(right - cut, y); ctx.lineTo(right, y + cut); ctx.lineTo(right, bottom); ctx.lineTo(x, bottom);
    } else if (orientation === 'se') {
      ctx.moveTo(x, y); ctx.lineTo(right, y); ctx.lineTo(right, bottom - cut); ctx.lineTo(right - cut, bottom); ctx.lineTo(x, bottom);
    } else {
      ctx.moveTo(x, y); ctx.lineTo(right, y); ctx.lineTo(right, bottom); ctx.lineTo(x + cut, bottom); ctx.lineTo(x, bottom - cut);
    }
    ctx.closePath();
    return;
  }
  if (state === 'invertedDiagonal') {
    traceRoundedRect(ctx, x, y, size, size, Math.max(3, size * 0.12));
    const notch = cut * 0.72;
    if (orientation === 'nw') ctx.rect(x, y, notch, notch);
    if (orientation === 'ne') ctx.rect(right - notch, y, notch, notch);
    if (orientation === 'se') ctx.rect(right - notch, bottom - notch, notch, notch);
    if (orientation === 'sw') ctx.rect(x, bottom - notch, notch, notch);
    return;
  }
  if (state === 'halfBlock') {
    if (orientation === 'nw' || orientation === 'ne') traceRoundedRect(ctx, x, y + size * 0.35, size, size * 0.65, Math.max(3, size * 0.1));
    else if (orientation === 'se' || orientation === 'sw') traceRoundedRect(ctx, x, y, size, size * 0.65, Math.max(3, size * 0.1));
    return;
  }
  if (state === 'quarterBlock') {
    const px = orientation === 'ne' || orientation === 'se' ? x + size * 0.36 : x;
    const py = orientation === 'sw' || orientation === 'se' ? y + size * 0.36 : y;
    traceRoundedRect(ctx, px, py, size * 0.64, size * 0.64, Math.max(3, size * 0.12));
    return;
  }
  if (state === 'roundedCorner') {
    const radius = size * 0.3;
    traceRoundedRect(ctx, x, y, size, size, radius);
    return;
  }
  if (state === 'concaveCorner') {
    const notch = size * 0.35;
    if (orientation === 'nw') {
      ctx.moveTo(x + notch, y); ctx.lineTo(right, y); ctx.lineTo(right, bottom); ctx.lineTo(x, bottom); ctx.lineTo(x, y + notch); ctx.quadraticCurveTo(x + notch * 0.1, y + notch * 0.1, x + notch, y);
    } else if (orientation === 'ne') {
      ctx.moveTo(x, y); ctx.lineTo(right - notch, y); ctx.quadraticCurveTo(right - notch * 0.1, y + notch * 0.1, right, y + notch); ctx.lineTo(right, bottom); ctx.lineTo(x, bottom);
    } else if (orientation === 'se') {
      ctx.moveTo(x, y); ctx.lineTo(right, y); ctx.lineTo(right, bottom - notch); ctx.quadraticCurveTo(right - notch * 0.1, bottom - notch * 0.1, right - notch, bottom); ctx.lineTo(x, bottom);
    } else {
      ctx.moveTo(x, y); ctx.lineTo(right, y); ctx.lineTo(right, bottom); ctx.lineTo(x + notch, bottom); ctx.quadraticCurveTo(x + notch * 0.1, bottom - notch * 0.1, x, bottom - notch); ctx.lineTo(x, y);
    }
    ctx.closePath();
    return;
  }
  if (state === 'pipeCorner') {
    const radius = size * 0.44;
    ctx.arc(x + size * 0.5, y + size * 0.5, radius, 0, Math.PI * 2);
    return;
  }
  if (state === 'cracked' || state === 'boltedPlate') {
    traceRoundedRect(ctx, x + smallCut * 0.12, y + smallCut * 0.12, size - smallCut * 0.24, size - smallCut * 0.24, Math.max(3, size * 0.08));
    return;
  }
  traceRoundedRect(ctx, x, y, size, size, Math.max(2, size * 0.08));
}

function makeTexturePattern(ctx, visual, seed, visualType) {
  const tile = document.createElement('canvas');
  tile.width = 128;
  tile.height = 128;
  const tileCtx = tile.getContext('2d');
  const random = createRandom(hashString(`${seed}:${visual.id}:${visual.color}:${visual.edge}:${visualType}`));
  const baseTextureAlpha = visualType === 'stone' ? 0.86 : visualType === 'metal' ? 0.22 : 0.36;
  tileCtx.fillStyle = rgba(mixHex(visual.color, '#07101a', visualType === 'metal' ? 0.03 : 0.12), baseTextureAlpha);
  tileCtx.fillRect(0, 0, tile.width, tile.height);

  const fleckCount = visualType === 'metal' ? 22 : 56;
  for (let index = 0; index < fleckCount; index += 1) {
    const x = random() * tile.width;
    const y = random() * tile.height;
    const radius = visualType === 'metal' ? 1 + random() * 2.5 : 2 + random() * 8;
    tileCtx.save();
    tileCtx.translate(x, y);
    tileCtx.rotate(random() * Math.PI);
    tileCtx.fillStyle = random() > 0.45
      ? rgba(mixHex(visual.edge, '#ffffff', 0.18), 0.14 + random() * 0.18)
      : rgba(mixHex(visual.color, '#000000', 0.24), 0.12 + random() * 0.14);
    tileCtx.beginPath();
    if (visualType === 'metal') tileCtx.roundRect(-radius * 1.8, -radius * 0.5, radius * 3.6, radius, radius * 0.3);
    else tileCtx.ellipse(0, 0, radius * (0.9 + random()), radius * (0.34 + random() * 0.45), 0, 0, Math.PI * 2);
    tileCtx.fill();
    tileCtx.restore();
  }

  if (visualType === 'metal') {
    tileCtx.strokeStyle = rgba(mixHex(visual.edge, '#ffffff', 0.2), 0.16);
    tileCtx.lineWidth = 1;
    for (let y = 16; y < tile.height; y += 32) {
      tileCtx.beginPath();
      tileCtx.moveTo(0, y + random() * 4);
      tileCtx.lineTo(tile.width, y + random() * 4);
      tileCtx.stroke();
    }
  } else {
    for (let index = 0; index < 16; index += 1) {
      const x = random() * tile.width;
      const y = random() * tile.height;
      const length = 10 + random() * 30;
      const angle = random() * Math.PI * 2;
      tileCtx.strokeStyle = rgba(mixHex(visual.edge, '#ffffff', 0.18), 0.08 + random() * 0.1);
      tileCtx.lineWidth = 0.8 + random() * 1.3;
      tileCtx.beginPath();
      tileCtx.moveTo(x, y);
      tileCtx.quadraticCurveTo(
        x + Math.cos(angle + 0.7) * length * 0.35,
        y + Math.sin(angle + 0.7) * length * 0.35,
        x + Math.cos(angle) * length,
        y + Math.sin(angle) * length,
      );
      tileCtx.stroke();
    }
  }
  return ctx.createPattern(tile, 'repeat');
}

function getMaterialBodyFill(visual, visualType) {
  if (visualType === 'core') return mixHex(visual.color, '#210b06', 0.16);
  if (visualType === 'metal') return mixHex(visual.color, '#1c1820', 0.08);
  return mixHex(visual.color, '#19212a', 0.08);
}

function makeMaterialBodyGradient(ctx, canvas, visual, visualType) {
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  if (visualType === 'stone') {
    gradient.addColorStop(0, mixHex(visual.color, visual.edge || '#ffffff', 0.2));
    gradient.addColorStop(0.52, visual.color);
    gradient.addColorStop(1, mixHex(visual.color, '#050912', 0.18));
    return gradient;
  }
  gradient.addColorStop(0, mixHex(visual.color, '#ffffff', visualType === 'metal' ? 0.24 : 0.14));
  gradient.addColorStop(0.52, visual.color);
  gradient.addColorStop(1, mixHex(visual.color, '#050912', visualType === 'core' ? 0.05 : 0.24));
  return gradient;
}

function isSameTopMaterial(grid, size, cell, dx, dy) {
  const x = cell.col + dx;
  const y = cell.row + dy;
  if (x < 0 || x >= size || y < 0 || y >= size) return false;
  return getTopMaterialId(grid[y * size + x]) === cell.itemId;
}

function drawChambers(ctx, chambers, cellSize, cellsByIndex, size, time) {
  chambers.forEach((chamber) => {
    const hasCoreNearby = chamber.cells.some((cell) => [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
    ].some(([dx, dy]) => getCellLayers(cellsByIndex[(cell.y + dy) * size + (cell.x + dx)]).includes('fireCore')));
    ctx.save();
    ctx.fillStyle = hasCoreNearby ? `rgba(255, 103, 43, ${0.18 + Math.sin(time * 3) * 0.03})` : 'rgba(1, 5, 10, 0.62)';
    ctx.strokeStyle = hasCoreNearby ? 'rgba(255, 153, 79, 0.45)' : 'rgba(5, 11, 18, 0.7)';
    ctx.lineWidth = Math.max(1, cellSize * 0.055);
    chamber.cells.forEach((cell) => {
      const x = cell.x * cellSize + cellSize * 0.14;
      const y = cell.y * cellSize + cellSize * 0.14;
      ctx.beginPath();
      ctx.roundRect(x, y, cellSize * 0.72, cellSize * 0.72, cellSize * 0.18);
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
  });
}

function drawMaterialDetails(ctx, cell, cellSize, seed, time) {
  const x = cell.col * cellSize;
  const y = cell.row * cellSize;
  const cx = x + cellSize * 0.5;
  const cy = y + cellSize * 0.5;
  const visualType = getVisualType(cell.itemId, cell.visual);
  const random = createRandom(hashString(`${seed}:${cell.index}:${cell.itemId}:detail`));
  ctx.save();
  traceVoxelShape(ctx, cell, cellSize, 2.2);
  ctx.clip();

  if (visualType === 'stone') {
    ctx.strokeStyle = 'rgba(15, 20, 26, 0.34)';
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i += 1) {
      const sx = x + cellSize * (0.22 + random() * 0.56);
      const sy = y + cellSize * (0.2 + random() * 0.6);
      const length = cellSize * (0.12 + random() * 0.22);
      const angle = random() * Math.PI * 2;
      ctx.lineWidth = 1 + random() * 1.2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(angle) * length, sy + Math.sin(angle) * length);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.ellipse(x + cellSize * 0.3, y + cellSize * 0.28, cellSize * 0.12, cellSize * 0.035, -0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  if (visualType === 'metal') {
    ctx.strokeStyle = rgba(mixHex(cell.visual.edge, '#ffffff', 0.18), 0.42);
    ctx.lineWidth = Math.max(1, cellSize * 0.035);
    ctx.beginPath();
    ctx.moveTo(x + cellSize * 0.18, cy);
    ctx.lineTo(x + cellSize * 0.82, cy);
    ctx.stroke();
    ctx.fillStyle = rgba(mixHex(cell.visual.edge, '#ffffff', 0.22), 0.52);
    [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]].forEach(([px, py]) => {
      ctx.beginPath();
      ctx.arc(x + cellSize * px, y + cellSize * py, cellSize * 0.035, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  if (visualType === 'core') {
    const pulse = 0.72 + Math.sin(time * 4.6) * 0.12;
    const gradient = ctx.createRadialGradient(cx, cy, cellSize * 0.05, cx, cy, cellSize * 0.56);
    gradient.addColorStop(0, `rgba(255, 245, 193, ${0.86 * pulse})`);
    gradient.addColorStop(0.36, `rgba(255, 109, 61, ${0.72 * pulse})`);
    gradient.addColorStop(1, 'rgba(255, 55, 45, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, cellSize * 0.58, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(255, 225, 128, ${0.55 * pulse})`;
    ctx.lineWidth = Math.max(1.2, cellSize * 0.045);
    for (let i = 0; i < 5; i += 1) {
      const angle = i * 1.25 + time * 0.7;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * cellSize * 0.12, cy + Math.sin(angle) * cellSize * 0.12);
      ctx.lineTo(cx + Math.cos(angle) * cellSize * 0.34, cy + Math.sin(angle) * cellSize * 0.34);
      ctx.stroke();
    }
  }

  if (cell.shapeState === 'cracked') {
    ctx.strokeStyle = 'rgba(6, 8, 12, 0.6)';
    ctx.lineWidth = Math.max(1, cellSize * 0.05);
    ctx.beginPath();
    ctx.moveTo(x + cellSize * 0.25, y + cellSize * 0.24);
    ctx.lineTo(x + cellSize * 0.54, y + cellSize * 0.48);
    ctx.lineTo(x + cellSize * 0.42, y + cellSize * 0.77);
    ctx.stroke();
  }

  if (cell.shapeState === 'boltedPlate') {
    ctx.fillStyle = 'rgba(255, 242, 207, 0.28)';
    [[0.22, 0.22], [0.78, 0.22], [0.22, 0.78], [0.78, 0.78]].forEach(([px, py]) => {
      ctx.beginPath();
      ctx.arc(x + cellSize * px, y + cellSize * py, cellSize * 0.055, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.restore();
}

function drawAutoModule(ctx, cell, grid, size, cellSize) {
  const x = cell.col * cellSize;
  const y = cell.row * cellSize;
  const cx = x + cellSize * 0.5;
  const cy = y + cellSize * 0.5;
  const visualType = getVisualType(cell.itemId, cell.visual);
  const edge = cell.visual.edge || '#76f3ff';
  const sameH = isSameTopMaterial(grid, size, cell, -1, 0) || isSameTopMaterial(grid, size, cell, 1, 0);
  const sameV = isSameTopMaterial(grid, size, cell, 0, -1) || isSameTopMaterial(grid, size, cell, 0, 1);
  const outsideEdge = ['standalone', 'cap', 'edge', 'corner', 'tJunction'].includes(cell.autoShapeType);

  if (visualType === 'metal' && sameH && !sameV) {
    ctx.strokeStyle = rgba(mixHex(edge, '#ffffff', 0.3), 0.62);
    ctx.lineWidth = cellSize * 0.15;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + cellSize * 0.08, cy);
    ctx.lineTo(x + cellSize * 0.92, cy);
    ctx.stroke();
    return;
  }

  if (visualType === 'metal' && sameV && !sameH) {
    ctx.strokeStyle = rgba(mixHex(edge, '#ffffff', 0.3), 0.56);
    ctx.lineWidth = cellSize * 0.14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, y + cellSize * 0.08);
    ctx.lineTo(cx, y + cellSize * 0.92);
    ctx.stroke();
    return;
  }

  if (visualType === 'metal' && outsideEdge) {
    ctx.strokeStyle = 'rgba(9, 18, 27, 0.62)';
    ctx.lineWidth = Math.max(1, cellSize * 0.04);
    for (let i = 0; i < 4; i += 1) {
      const yy = y + cellSize * (0.28 + i * 0.12);
      ctx.beginPath();
      ctx.moveTo(x + cellSize * 0.22, yy);
      ctx.lineTo(x + cellSize * 0.78, yy);
      ctx.stroke();
    }
  }

  if (visualType === 'stone' && !cell.neighbors.n && cell.neighbors.s && (cell.neighbors.s?.layers || []).includes('stoneOre')) {
    ctx.fillStyle = 'rgba(7, 12, 17, 0.48)';
    ctx.fillRect(x + cellSize * 0.32, y + cellSize * 0.08, cellSize * 0.36, cellSize * 0.45);
  }
}

function drawSurfaceDetail(ctx, cell, cellSize) {
  if (!cell.detailId) return;
  const x = cell.col * cellSize;
  const y = cell.row * cellSize;
  const cx = x + cellSize * 0.5;
  const cy = y + cellSize * 0.5;
  ctx.save();
  traceVoxelShape(ctx, cell, cellSize, 3);
  ctx.clip();
  if (cell.detailId === 'bolts') {
    ctx.fillStyle = 'rgba(255, 242, 207, 0.4)';
    [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]].forEach(([px, py]) => {
      ctx.beginPath();
      ctx.arc(x + cellSize * px, y + cellSize * py, cellSize * 0.045, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (cell.detailId === 'scratches') {
    ctx.strokeStyle = 'rgba(255, 242, 207, 0.28)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo(x + cellSize * (0.22 + i * 0.14), y + cellSize * 0.25);
      ctx.lineTo(x + cellSize * (0.38 + i * 0.14), y + cellSize * 0.68);
      ctx.stroke();
    }
  } else if (cell.detailId === 'warningStripes') {
    ctx.strokeStyle = 'rgba(255, 211, 107, 0.75)';
    ctx.lineWidth = cellSize * 0.08;
    for (let i = -1; i < 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo(x + i * cellSize * 0.3, y + cellSize);
      ctx.lineTo(x + cellSize * (0.45 + i * 0.3), y);
      ctx.stroke();
    }
  } else if (cell.detailId === 'glowingLines') {
    ctx.strokeStyle = 'rgba(118, 243, 255, 0.8)';
    ctx.shadowColor = '#76f3ff';
    ctx.shadowBlur = 8;
    ctx.lineWidth = cellSize * 0.045;
    ctx.beginPath();
    ctx.moveTo(x + cellSize * 0.22, cy);
    ctx.lineTo(x + cellSize * 0.78, cy);
    ctx.stroke();
  } else if (cell.detailId === 'pipe') {
    ctx.strokeStyle = 'rgba(176, 119, 66, 0.82)';
    ctx.lineWidth = cellSize * 0.16;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + cellSize * 0.14, cy);
    ctx.lineTo(x + cellSize * 0.86, cy);
    ctx.stroke();
  } else if (cell.detailId === 'handle') {
    ctx.strokeStyle = 'rgba(232, 227, 211, 0.48)';
    ctx.lineWidth = cellSize * 0.08;
    ctx.beginPath();
    ctx.arc(cx, cy, cellSize * 0.22, Math.PI, Math.PI * 2);
    ctx.stroke();
  } else if (cell.detailId === 'window') {
    ctx.fillStyle = 'rgba(118, 243, 255, 0.28)';
    ctx.strokeStyle = 'rgba(118, 243, 255, 0.52)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(x + cellSize * 0.28, y + cellSize * 0.28, cellSize * 0.44, cellSize * 0.34, cellSize * 0.08);
    ctx.fill();
    ctx.stroke();
  } else if (cell.detailId === 'rust') {
    ctx.fillStyle = 'rgba(157, 78, 39, 0.35)';
    ctx.beginPath();
    ctx.ellipse(cx - cellSize * 0.12, cy + cellSize * 0.08, cellSize * 0.18, cellSize * 0.08, -0.4, 0, Math.PI * 2);
    ctx.fill();
  } else if (cell.detailId === 'heatBurn') {
    const gradient = ctx.createRadialGradient(cx, cy, 2, cx, cy, cellSize * 0.42);
    gradient.addColorStop(0, 'rgba(255, 104, 43, 0.32)');
    gradient.addColorStop(1, 'rgba(4, 3, 2, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, cellSize, cellSize);
  }
  ctx.restore();
}

function drawOuterSilhouette(ctx, cells, size, cellSize) {
  const addSegment = (ax, ay, bx, by) => {
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
  };
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  [
    ['rgba(3, 8, 14, 0.74)', Math.max(3.4, cellSize * 0.14)],
    ['rgba(209, 226, 235, 0.34)', Math.max(1.2, cellSize * 0.045)],
  ].forEach(([style, width]) => {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.beginPath();
    cells.forEach((cell) => {
      const x = cell.col * cellSize;
      const y = cell.row * cellSize;
      const r = x + cellSize;
      const b = y + cellSize;
      if (!isOccupied(cells.byIndex, cell.col, cell.row - 1, size)) addSegment(x, y, r, y);
      if (!isOccupied(cells.byIndex, cell.col + 1, cell.row, size)) addSegment(r, y, r, b);
      if (!isOccupied(cells.byIndex, cell.col, cell.row + 1, size)) addSegment(r, b, x, b);
      if (!isOccupied(cells.byIndex, cell.col - 1, cell.row, size)) addSegment(x, b, x, y);
    });
    ctx.stroke();
  });
  ctx.restore();
}

export function drawCraftVoxelPreview(canvas, {
  grid = [],
  size = 16,
  getMaterialVisual = () => ({ id: 'stone', color: '#6b625a', edge: '#91867a', visualType: 'stone' }),
  seed = 'craft',
} = {}) {
  if (!canvas) return;
  const cellSize = CELL_PIXELS;
  const pixelSize = Math.max(1, size * cellSize);
  if (canvas.width !== pixelSize || canvas.height !== pixelSize) {
    canvas.width = pixelSize;
    canvas.height = pixelSize;
  }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  const time = (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) / 1000;

  const cells = getVoxelEntries(grid, size).map((entry) => {
    const itemId = getTopMaterialId(entry);
    return {
      ...entry,
      col: entry.x,
      row: entry.y,
      itemId,
      visual: getMaterialVisual(itemId),
    };
  });
  cells.byIndex = grid.map((cell) => (getCellLayers(cell).length ? cell : null));
  if (!cells.length) return;

  const chambers = detectInternalChambers(grid, size);
  drawChambers(ctx, chambers, cellSize, grid, size, time);

  const coreCells = cells.filter((cell) => cell.layers.includes('fireCore'));
  coreCells.forEach((cell) => {
    const cx = (cell.col + 0.5) * cellSize;
    const cy = (cell.row + 0.5) * cellSize;
    const gradient = ctx.createRadialGradient(cx, cy, cellSize * 0.2, cx, cy, cellSize * 3.2);
    gradient.addColorStop(0, 'rgba(255, 111, 61, 0.28)');
    gradient.addColorStop(0.45, 'rgba(255, 111, 61, 0.1)');
    gradient.addColorStop(1, 'rgba(255, 111, 61, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(cx - cellSize * 3.4, cy - cellSize * 3.4, cellSize * 6.8, cellSize * 6.8);
  });

  const materialGroups = new Map();
  cells.forEach((cell) => {
    if (!materialGroups.has(cell.itemId)) materialGroups.set(cell.itemId, []);
    materialGroups.get(cell.itemId).push(cell);
  });

  materialGroups.forEach((group, itemId) => {
    const visual = group[0].visual;
    const visualType = getVisualType(itemId, visual);
    const gradient = makeMaterialBodyGradient(ctx, canvas, visual, visualType);
    ctx.save();
    ctx.beginPath();
    group.forEach((cell) => traceVoxelShape(ctx, cell, cellSize, 0.35, false));
    ctx.fillStyle = getMaterialBodyFill(visual, visualType);
    ctx.fill();
    ctx.globalAlpha = visualType === 'stone' ? 0.74 : 0.92;
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.clip();
    const pattern = makeTexturePattern(ctx, visual, `${seed}:${itemId}`, visualType);
    if (pattern) {
      ctx.globalAlpha = visualType === 'core' ? 0.46 : visualType === 'stone' ? 0.48 : 0.72;
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.restore();
  });

  cells.forEach((cell) => {
    drawMaterialDetails(ctx, cell, cellSize, seed, time);
    drawAutoModule(ctx, cell, grid, size, cellSize);
    drawSurfaceDetail(ctx, cell, cellSize);
  });

  drawOuterSilhouette(ctx, cells, size, cellSize);
}
