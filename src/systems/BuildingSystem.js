import { TERRAIN_MATERIALS } from './TerrainGrid.js?v=115';

const DEFAULT_BUILD_RANGE = 178;
const DEFAULT_PAINT_INTERVAL = 0.065;
const STARTER_BASE_WALL_MATERIAL = 10;
const STARTER_BASE_REINFORCED_MATERIAL = 11;

export const BUILDABLE_TERRAIN_ITEMS = {
  stoneOre: { itemId: 'stoneOre', label: 'Stone', terrainMaterial: 1, wallMaterial: 1 },
  ironDust: { itemId: 'ironDust', label: 'Iron', terrainMaterial: 2, wallMaterial: 2 },
  copperShards: { itemId: 'copperShards', label: 'Copper', terrainMaterial: 3, wallMaterial: 3 },
  glassCrystal: { itemId: 'glassCrystal', label: 'Glass Crystal', terrainMaterial: 4, wallMaterial: 4 },
  fireCore: { itemId: 'fireCore', label: 'Fire Core', terrainMaterial: 6, wallMaterial: 6 },
  crystallizedStone: { itemId: 'crystallizedStone', label: 'Crystallized Stone', terrainMaterial: 7, wallMaterial: 7 },
  redCrystal: { itemId: 'redCrystal', label: 'Red Crystal', terrainMaterial: 8, wallMaterial: 8 },
  moonCrystal: { itemId: 'moonCrystal', label: 'Moon Crystal', terrainMaterial: 9, wallMaterial: 9 },
};

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function hexToRgb(hex = '#ffffff') {
  const normalized = String(hex).replace('#', '').trim();
  const value = normalized.length === 3
    ? normalized.split('').map((part) => part + part).join('')
    : normalized;
  const number = Number.parseInt(value, 16);
  if (!Number.isFinite(number)) return { r: 255, g: 255, b: 255 };
  return {
    r: (number >> 16) & 255,
    g: (number >> 8) & 255,
    b: number & 255,
  };
}

function drawPolygon(ctx, points) {
  if (!points?.length) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index].x, points[index].y);
  ctx.closePath();
}

export class BuildingSystem {
  constructor(game) {
    this.game = game;
    this.paintCooldown = 0;
    this.lastPaintKey = '';
    this.lastInvalidReason = '';
    this.invalidToastCooldown = 0;
  }

  isBuildableItem(itemId) {
    return Boolean(BUILDABLE_TERRAIN_ITEMS[itemId]);
  }

  getBuildableItem(itemId) {
    return BUILDABLE_TERRAIN_ITEMS[itemId] || null;
  }

  getBuildRange(scene = null) {
    return scene?.stats?.buildRange || this.game.state?.ship?.buildRange || DEFAULT_BUILD_RANGE;
  }

  getSelectedBuildItem(scene) {
    const slot = this.game.input?.getSelectedHotbarSlot?.();
    const slotBuildable = this.getBuildableItem(slot?.inventoryItemId);
    if (slot?.action === 'build' && slotBuildable) return slotBuildable;
    if (slot?.action && slot.action !== 'build') return null;
    if (scene?.activeBuildItemId && this.isBuildableItem(scene.activeBuildItemId)) {
      return this.getBuildableItem(scene.activeBuildItemId);
    }
    return null;
  }

  setActiveBuildItem(scene, itemId, { assignMode = 'foregroundBlock' } = {}) {
    if (!scene || !this.isBuildableItem(itemId)) return false;
    scene.activeBuildItemId = itemId;
    scene.activeBuildMode ||= assignMode;
    return true;
  }

  stampStarterBaseOnIsland(island, {
    surfaceX = island?.terrain?.landingX || 0,
    surfaceY = island?.terrain?.landingY || 0,
    centerOffsetCells = -12,
    widthCells = 34,
    interiorHeightCells = 8,
    floorThicknessCells = 2,
  } = {}) {
    const terrain = island?.terrain;
    if (!terrain) return null;
    const size = terrain.cellSize || 25;
    const padCenterX = surfaceX + centerOffsetCells * size;
    const pad = terrain.createPlacementPad(padCenterX, surfaceY, {
      viewRotation: 0,
      width: (widthCells + 4) * size,
      clearance: (interiorHeightCells + 5) * size,
      depth: Math.max(4, floorThicknessCells + 3) * size,
      material: 1,
    });
    const floorRow = pad.row;
    const ceilingRow = floorRow - interiorHeightCells - 1;
    const centerCol = Math.round(pad.x / size);
    const leftCol = centerCol - Math.floor(widthCells / 2);
    const rightCol = leftCol + widthCells - 1;
    const supportCols = [leftCol + 11, leftCol + 22];
    const doorwayTop = floorRow - 4;
    const doorwayBottom = floorRow - 1;
    const changed = { value: false };
    const inFootprint = (col, row, padding = 0) => (
      col >= leftCol - padding
      && col <= rightCol + padding
      && row >= ceilingRow - padding
      && row <= floorRow + floorThicknessCells + padding
    );

    for (let row = ceilingRow - 3; row <= floorRow + floorThicknessCells + 3; row += 1) {
      for (let col = leftCol - 2; col <= rightCol + 2; col += 1) {
        if (!terrain.isInside(col, row)) continue;
        if (row < floorRow && inFootprint(col, row, 1)) this.setTerrainCellDirect(terrain, col, row, 0, changed);
      }
    }

    for (let col = leftCol; col <= rightCol; col += 1) {
      for (let row = ceilingRow + 1; row <= floorRow - 1; row += 1) {
        this.setWallCellDirect(terrain, col, row, STARTER_BASE_WALL_MATERIAL, changed);
      }
      for (let row = floorRow; row < floorRow + floorThicknessCells; row += 1) {
        this.setTerrainCellDirect(terrain, col, row, STARTER_BASE_WALL_MATERIAL, changed);
        this.setWallCellDirect(terrain, col, row, STARTER_BASE_WALL_MATERIAL, changed);
      }
      this.setTerrainCellDirect(terrain, col, ceilingRow, STARTER_BASE_REINFORCED_MATERIAL, changed);
      this.setWallCellDirect(terrain, col, ceilingRow, STARTER_BASE_REINFORCED_MATERIAL, changed);
      if (col % 4 === 0) this.setTerrainCellDirect(terrain, col, ceilingRow - 1, STARTER_BASE_REINFORCED_MATERIAL, changed);
    }

    for (let row = ceilingRow; row <= floorRow - 1; row += 1) {
      const isDoorway = row >= doorwayTop && row <= doorwayBottom;
      if (!isDoorway) {
        this.setTerrainCellDirect(terrain, leftCol, row, STARTER_BASE_REINFORCED_MATERIAL, changed);
        this.setTerrainCellDirect(terrain, rightCol, row, STARTER_BASE_REINFORCED_MATERIAL, changed);
      }
      this.setWallCellDirect(terrain, leftCol, row, STARTER_BASE_WALL_MATERIAL, changed);
      this.setWallCellDirect(terrain, rightCol, row, STARTER_BASE_WALL_MATERIAL, changed);
    }

    for (const col of supportCols) {
      for (let row = ceilingRow + 1; row <= floorRow - 1; row += 1) {
        const isDoorway = row >= doorwayTop && row <= doorwayBottom;
        if (isDoorway) {
          this.setWallCellDirect(terrain, col, row, STARTER_BASE_REINFORCED_MATERIAL, changed);
          continue;
        }
        this.setTerrainCellDirect(terrain, col, row, STARTER_BASE_REINFORCED_MATERIAL, changed);
        this.setWallCellDirect(terrain, col, row, STARTER_BASE_REINFORCED_MATERIAL, changed);
      }
    }

    const window = {
      col: leftCol + 3,
      row: ceilingRow + 2,
      width: 6,
      height: 2,
    };
    for (let row = window.row; row < window.row + window.height; row += 1) {
      for (let col = window.col; col < window.col + window.width; col += 1) {
        this.setWallCellDirect(terrain, col, row, 4, changed);
      }
    }

    const lab = {
      x: (leftCol + widthCells * 0.5) * size,
      y: floorRow * size,
      width: widthCells * size,
      height: (floorRow - ceilingRow) * size,
      cellSize: size,
      leftCol,
      rightCol,
      floorRow,
      ceilingRow,
      interiorHeightCells,
      buildVersion: 2,
      window,
      supportCols,
      doorCells: {
        left: { col: leftCol, top: doorwayTop, bottom: doorwayBottom },
        right: { col: rightCol, top: doorwayTop, bottom: doorwayBottom },
      },
    };

    if (changed.value) this.commitTerrainStamp(terrain);
    return {
      lab,
      landingSurfaceLocal: { x: surfaceX + 10 * size, y: surfaceY },
    };
  }

  setTerrainCellDirect(terrain, col, row, value, changed = null) {
    if (!terrain?.isInside?.(col, row)) return false;
    const index = terrain.index(col, row);
    const nextValue = Math.max(0, Number(value) || 0);
    if (terrain.cells[index] === nextValue) return false;
    terrain.cells[index] = nextValue;
    if (nextValue > 0 && terrain.wallCells?.length && !terrain.wallCells[index]) {
      terrain.wallCells[index] = terrain.getWallTypeForTile(col, row, nextValue);
    }
    if (terrain.damage) terrain.damage[index] = 0;
    terrain.damagedCells?.delete?.(index);
    if (changed) changed.value = true;
    return true;
  }

  setWallCellDirect(terrain, col, row, value, changed = null) {
    if (!terrain?.isInside?.(col, row) || !terrain.wallCells?.length) return false;
    const index = terrain.index(col, row);
    const nextValue = Math.max(0, Number(value) || 0);
    if (terrain.wallCells[index] === nextValue) return false;
    terrain.wallCells[index] = nextValue;
    if (changed) changed.value = true;
    return true;
  }

  commitTerrainStamp(terrain) {
    terrain.invalidateTerrainGeometry?.({ keepSurfacePath: false });
    terrain.renderDirty = true;
    terrain.fullRenderDirty = true;
    terrain.airExposureDirty = true;
  }

  updateMode(scene) {
    if (!scene) return;
    scene.activeBuildMode ||= 'foregroundBlock';
    const input = this.game.input;
    if (input?.actions?.justPressed?.buildModeToggle) {
      scene.activeBuildMode = scene.activeBuildMode === 'backgroundWall' ? 'foregroundBlock' : 'backgroundWall';
      const label = scene.activeBuildMode === 'backgroundWall' ? 'Wall paint' : 'Block paint';
      this.game.ui.showToast(label, 'default', 850);
      this.game.audio.playButtonClick?.();
    }
  }

  getEffectiveBuildMode(scene) {
    const input = this.game.input;
    if (input?.keys?.has('Shift') || input?.keys?.has('ShiftLeft') || input?.keys?.has('ShiftRight')) return 'backgroundWall';
    if (input?.actions?.buildWallModifier) return 'backgroundWall';
    return scene?.activeBuildMode || 'foregroundBlock';
  }

  getAimState(scene) {
    if (!scene?.activeIsland || !scene?.islandPlayer) return null;
    const rawAimPoint = scene.getIslandAimPoint();
    const origin = {
      x: scene.islandPlayer.centerX,
      y: scene.islandPlayer.centerY - 7,
    };
    const dx = rawAimPoint.x - origin.x;
    const dy = rawAimPoint.y - origin.y;
    const distance = Math.hypot(dx, dy) || 1;
    const range = this.getBuildRange(scene);
    const length = Math.min(distance, range);
    const aimPoint = {
      x: origin.x + (dx / distance) * length,
      y: origin.y + (dy / distance) * length,
    };
    return {
      origin,
      rawAimPoint,
      aimPoint,
      direction: { x: dx / distance, y: dy / distance },
      length,
      range,
      inRange: distance <= range + 0.001,
    };
  }

  getPreview(scene) {
    const island = scene?.activeIsland;
    const terrain = island?.terrain;
    const player = scene?.islandPlayer;
    const buildable = this.getSelectedBuildItem(scene);
    if (!terrain || !player || !buildable) return null;

    const aim = this.getAimState(scene);
    if (!aim) return null;
    const mode = this.getEffectiveBuildMode(scene);
    const target = this.getTargetTile(terrain, aim, mode);
    const materialId = mode === 'backgroundWall' ? buildable.wallMaterial : buildable.terrainMaterial;
    const data = TERRAIN_MATERIALS[materialId] || TERRAIN_MATERIALS[1];
    const center = target
      ? this.planetTileToWorld(target.col, target.row, { terrain })
      : aim.aimPoint;
    const validation = target
      ? this.validatePlacement(scene, target.col, target.row, {
        mode,
        itemId: buildable.itemId,
        materialId,
        center,
        inRange: aim.inRange,
      })
      : { ok: false, reason: 'No target tile' };

    return {
      island,
      terrain,
      buildable,
      itemId: buildable.itemId,
      mode,
      materialId,
      data,
      target,
      center,
      valid: validation.ok,
      reason: validation.reason,
      origin: aim.origin,
      aimPoint: center || aim.aimPoint,
      rawAimPoint: aim.rawAimPoint,
      end: center || aim.aimPoint,
      range: aim.range,
      length: aim.length,
    };
  }

  getTargetTile(terrain, aim, mode) {
    const cursorTile = this.worldToPlanetTile(aim.aimPoint.x, aim.aimPoint.y, { terrain });
    if (!terrain.isInside(cursorTile.col, cursorTile.row)) return null;
    if (mode === 'backgroundWall') return cursorTile;
    if (!terrain.isSolidCell(cursorTile.col, cursorTile.row)) return cursorTile;

    const hit = terrain.raycast(aim.origin.x, aim.origin.y, aim.aimPoint.x, aim.aimPoint.y);
    if (!hit) return cursorTile;
    const beforeHit = {
      x: hit.x - aim.direction.x * Math.max(terrain.cellSize * 0.42, 4),
      y: hit.y - aim.direction.y * Math.max(terrain.cellSize * 0.42, 4),
    };
    const adjacent = this.worldToPlanetTile(beforeHit.x, beforeHit.y, { terrain });
    if (terrain.isInside(adjacent.col, adjacent.row) && !terrain.isSolidCell(adjacent.col, adjacent.row)) return adjacent;

    const bestNeighbor = this.getTileNeighbors(hit.col, hit.row, { terrain })
      .filter((neighbor) => terrain.isInside(neighbor.col, neighbor.row) && !terrain.isSolidCell(neighbor.col, neighbor.row))
      .sort((left, right) => {
        const leftCenter = this.planetTileToWorld(left.col, left.row, { terrain });
        const rightCenter = this.planetTileToWorld(right.col, right.row, { terrain });
        const leftScore = (leftCenter.x - beforeHit.x) ** 2 + (leftCenter.y - beforeHit.y) ** 2;
        const rightScore = (rightCenter.x - beforeHit.x) ** 2 + (rightCenter.y - beforeHit.y) ** 2;
        return leftScore - rightScore;
      })[0];
    return bestNeighbor || cursorTile;
  }

  validatePlacement(scene, col, row, { mode, itemId, center, inRange, materialId }) {
    const terrain = scene?.activeIsland?.terrain;
    if (!terrain?.isInside?.(col, row)) return { ok: false, reason: 'Outside build grid' };
    if (!inRange) return { ok: false, reason: 'Too far' };
    if (this.game.systems.inventory.getStoredAmount(itemId) <= 0) return { ok: false, reason: `No ${this.getItemName(itemId)}` };
    if (mode === 'backgroundWall') {
      if (terrain.getWallCell(col, row) === materialId) return { ok: false, reason: 'Wall already placed' };
      if (!this.hasWallSupport(terrain, col, row)) return { ok: false, reason: 'Needs support' };
      return { ok: true, reason: '' };
    }
    if (terrain.isSolidCell(col, row)) return { ok: false, reason: 'Tile occupied' };
    if (this.doesTileOverlapPlayer(scene, col, row)) return { ok: false, reason: 'Too close to you' };
    if (!this.hasPlacementSupport(terrain, col, row)) return { ok: false, reason: 'Needs support' };
    return { ok: true, reason: '' };
  }

  hasPlacementSupport(terrain, col, row) {
    return this.getTileNeighbors(col, row, { terrain }).some((neighbor) => (
      terrain.isInside(neighbor.col, neighbor.row)
      && (terrain.isSolidCell(neighbor.col, neighbor.row) || terrain.isWallCell(neighbor.col, neighbor.row))
    ));
  }

  hasWallSupport(terrain, col, row) {
    if (terrain.isSolidCell(col, row)) return true;
    return this.getTileNeighbors(col, row, { terrain }).some((neighbor) => (
      terrain.isInside(neighbor.col, neighbor.row)
      && (terrain.isSolidCell(neighbor.col, neighbor.row) || terrain.isWallCell(neighbor.col, neighbor.row))
    ));
  }

  doesTileOverlapPlayer(scene, col, row) {
    const terrain = scene?.activeIsland?.terrain;
    const player = scene?.islandPlayer;
    if (!terrain || !player) return false;
    const size = terrain.cellSize;
    const left = col * size;
    const top = row * size;
    const right = left + size;
    const bottom = top + size;
    const shape = scene.getPlanetPlayerCollisionShape?.(player, scene.activeIsland);
    if (!shape) {
      const bounds = player.collisionBounds;
      return !(right < bounds.left || left > bounds.right || bottom < bounds.top || top > bounds.bottom);
    }
    return scene.orientedBoxIntersectsAabb(shape, left, top, right, bottom);
  }

  update(scene, delta) {
    this.paintCooldown = Math.max(0, this.paintCooldown - delta);
    this.invalidToastCooldown = Math.max(0, this.invalidToastCooldown - delta);
    this.updateMode(scene);
    const preview = this.getPreview(scene);
    if (scene) scene.buildPlacementPreview = preview;

    const input = this.game.input;
    const isHeld = Boolean(input?.actions?.build || (input?.actions?.primaryUse && preview));
    if (!preview || !isHeld) {
      this.lastPaintKey = '';
      return;
    }
    scene.updateIslandPlayerFacingFromAim?.(preview.rawAimPoint);
    if (!preview.valid) {
      this.showInvalidPlacement(preview);
      this.lastPaintKey = '';
      return;
    }
    const key = `${preview.mode}:${preview.target.col}:${preview.target.row}:${preview.itemId}`;
    if (this.paintCooldown > 0 && key === this.lastPaintKey) return;
    if (this.place(scene, preview)) {
      this.paintCooldown = DEFAULT_PAINT_INTERVAL;
      this.lastPaintKey = key;
    }
  }

  place(scene, preview) {
    if (!preview?.valid || !preview.target) return false;
    const { terrain, target, mode, materialId, itemId } = preview;
    const inventory = this.game.systems.inventory;
    if (!inventory.remove(itemId, 1, { skipSave: true })) return false;
    let changed = false;
    if (mode === 'backgroundWall') {
      changed = terrain.setWallCell?.(target.col, target.row, materialId) !== false;
    } else {
      const before = terrain.getCell(target.col, target.row);
      terrain.setCell(target.col, target.row, materialId);
      changed = before !== terrain.getCell(target.col, target.row);
    }
    if (!changed) {
      inventory.add(itemId, 1, { skipSave: true });
      return false;
    }
    scene.islandTerrainDirty = true;
    scene.buildSaveDelay = 0.45;
    scene.refreshHotbar?.(true);
    scene.updateQuickInventory?.(true);
    this.game.audio.playButtonClick?.();
    return true;
  }

  flushSave(scene, delta) {
    if (!scene?.islandTerrainDirty || !scene.activeIsland || !scene.buildSaveDelay) return;
    scene.buildSaveDelay = Math.max(0, scene.buildSaveDelay - delta);
    if (scene.buildSaveDelay > 0) return;
    this.game.systems.islands.saveTerrain(scene.activeIsland.id, scene.activeIsland.terrain);
    scene.islandTerrainDirty = false;
  }

  showInvalidPlacement(preview) {
    if (this.invalidToastCooldown > 0 || !preview?.reason || preview.reason === this.lastInvalidReason) return;
    this.invalidToastCooldown = 0.7;
    this.lastInvalidReason = preview.reason;
    if (preview.reason === 'Too far' || preview.reason === 'Needs support' || preview.reason.startsWith('No ')) {
      this.game.ui.showToast(preview.reason, 'danger', 850);
    }
  }

  worldToPlanetTile(worldX, worldY, planet) {
    const terrain = planet?.terrain || planet;
    return terrain.cellFromWorld(worldX, worldY);
  }

  planetTileToWorld(tileX, tileY, planet) {
    const terrain = planet?.terrain || planet;
    const size = terrain.cellSize || 20;
    return {
      x: tileX * size + size * 0.5,
      y: tileY * size + size * 0.5,
    };
  }

  getTileCenterWorld(tileX, tileY, planet) {
    return this.planetTileToWorld(tileX, tileY, planet);
  }

  getTileNormal(tileX, tileY, planet) {
    const terrain = planet?.terrain || planet;
    const center = this.planetTileToWorld(tileX, tileY, { terrain });
    const dx = center.x - terrain.planetCenterX;
    const dy = center.y - terrain.planetCenterY;
    const length = Math.hypot(dx, dy) || 1;
    return { x: dx / length, y: dy / length };
  }

  getPlanetGridRotation(tileX, tileY, planet) {
    const normal = this.getTileNormal(tileX, tileY, planet);
    return Math.atan2(normal.y, normal.x) + Math.PI * 0.5;
  }

  getTileNeighbors(tileX, tileY) {
    return [
      { col: tileX + 1, row: tileY },
      { col: tileX - 1, row: tileY },
      { col: tileX, row: tileY + 1 },
      { col: tileX, row: tileY - 1 },
    ];
  }

  drawPreview(ctx, preview, time = 0) {
    if (!preview?.target || !preview.terrain) return;
    const terrain = preview.terrain;
    const { col, row } = preview.target;
    const material = preview.data || TERRAIN_MATERIALS[preview.materialId] || TERRAIN_MATERIALS[1];
    const color = preview.valid ? (material.edge || material.color || '#76f3ff') : '#ff756f';
    const rgb = hexToRgb(color);
    const pulse = 1 + Math.sin(time * 10) * 0.025;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowColor = color;
    ctx.shadowBlur = preview.valid ? 10 : 4;
    if (preview.mode === 'backgroundWall') this.drawWallPreview(ctx, terrain, col, row, material, rgb, pulse, preview.valid);
    else this.drawBlockPreview(ctx, terrain, col, row, material, rgb, pulse, preview.valid);
    ctx.restore();
  }

  drawBlockPreview(ctx, terrain, col, row, material, rgb, pulse, valid) {
    const points = terrain.getCellShapePoints?.(col, row, { scale: 0.94 * pulse }) || [];
    ctx.globalAlpha = valid ? 0.58 : 0.42;
    ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${valid ? 0.34 : 0.22})`;
    ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${valid ? 0.96 : 0.82})`;
    ctx.lineWidth = Math.max(1.5, terrain.cellSize * 0.09);
    drawPolygon(ctx, points);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = valid ? 0.28 : 0.18;
    ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.72)`;
    ctx.lineWidth = Math.max(1, terrain.cellSize * 0.04);
    const size = terrain.cellSize;
    ctx.beginPath();
    ctx.moveTo(col * size + size * 0.22, row * size + size * 0.72);
    ctx.lineTo(col * size + size * 0.72, row * size + size * 0.22);
    ctx.stroke();
  }

  drawWallPreview(ctx, terrain, col, row, material, rgb, pulse, valid) {
    const size = terrain.cellSize;
    const inset = size * 0.11;
    const x = col * size + inset;
    const y = row * size + inset;
    const width = size - inset * 2;
    const height = size - inset * 2;
    ctx.globalAlpha = valid ? 0.42 : 0.28;
    ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${valid ? 0.22 : 0.14})`;
    ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${valid ? 0.86 : 0.76})`;
    ctx.lineWidth = Math.max(1.2, size * 0.055);
    ctx.setLineDash([size * 0.2, size * 0.13]);
    ctx.lineDashOffset = -pulse * 8;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, size * 0.1);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = valid ? 0.18 : 0.12;
    ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.6)`;
    ctx.beginPath();
    ctx.moveTo(x + width * 0.18, y + height * 0.72);
    ctx.lineTo(x + width * 0.72, y + height * 0.18);
    ctx.stroke();
  }

  getItemName(itemId) {
    return this.game.systems.materials.getDisplayName(itemId);
  }
}
