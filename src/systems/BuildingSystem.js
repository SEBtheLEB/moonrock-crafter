import { TERRAIN_MATERIALS } from './TerrainGrid.js?v=156';

const DEFAULT_BUILD_RANGE = 178;
const STARTER_BASE_WALL_MATERIAL = 10;
const STARTER_BASE_REINFORCED_MATERIAL = 11;
const SMOOTH_BUILD_MATERIAL_IDS = new Set(['facilityIron', 'reinforcedIron']);

export const BUILDABLE_TERRAIN_ITEMS = {
  stoneOre: { itemId: 'stoneOre', label: 'Stone', terrainMaterial: 1, wallMaterial: 1, edgeStyle: 'rough' },
  ironDust: { itemId: 'ironDust', label: 'Iron', terrainMaterial: 2, wallMaterial: 2, edgeStyle: 'rough' },
  copperShards: { itemId: 'copperShards', label: 'Copper', terrainMaterial: 3, wallMaterial: 3, edgeStyle: 'rough' },
  glassCrystal: { itemId: 'glassCrystal', label: 'Glass Crystal', terrainMaterial: 4, wallMaterial: 4, edgeStyle: 'rough' },
  fireCore: { itemId: 'fireCore', label: 'Fire Core', terrainMaterial: 6, wallMaterial: 6, edgeStyle: 'smooth' },
  crystallizedStone: { itemId: 'crystallizedStone', label: 'Crystallized Stone', terrainMaterial: 7, wallMaterial: 7, edgeStyle: 'rough' },
  redCrystal: { itemId: 'redCrystal', label: 'Red Crystal', terrainMaterial: 8, wallMaterial: 8, edgeStyle: 'rough' },
  moonCrystal: { itemId: 'moonCrystal', label: 'Moon Crystal', terrainMaterial: 9, wallMaterial: 9, edgeStyle: 'rough' },
  metalCaseWall: { itemId: 'metalCaseWall', label: 'Metal Case Block', terrainMaterial: 10, wallMaterial: 10, edgeStyle: 'smooth' },
  metalCaseBackWall: {
    itemId: 'metalCaseBackWall',
    label: 'Metal Back Wall',
    terrainMaterial: 0,
    wallMaterial: 10,
    edgeStyle: 'smooth',
    backgroundOnly: true,
  },
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

function hash2D(x, y, seed = 1, salt = 0) {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7 + salt * 19.19) * 43758.5453;
  return value - Math.floor(value);
}

function signedHash2D(x, y, seed = 1, salt = 0) {
  return hash2D(x, y, seed, salt) * 2 - 1;
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
    this.paintHeld = false;
    this.lastPaintKey = '';
    this.lastPaintTarget = null;
    this.paintedKeysThisHold = new Set();
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
    const heldItemId = scene?.heldItemState?.itemId;
    if (heldItemId && this.isBuildableItem(heldItemId)) return this.getBuildableItem(heldItemId);
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
    const buildable = this.getBuildableItem(itemId);
    scene.activeBuildMode = buildable?.backgroundOnly ? 'backgroundWall' : (assignMode || 'foregroundBlock');
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
    terrain.markAirExposureDirty?.({ defer: true });
  }

  updateMode(scene, delta = 0) {
    if (!scene) return;
    scene.buildSnapCursorStepCooldown = Math.max(0, (scene.buildSnapCursorStepCooldown || 0) - delta);
    scene.activeBuildMode ||= 'foregroundBlock';
    const input = this.game.input;
    if (input?.actions?.justPressed?.buildModeToggle) {
      this.game.ui.showToast('Equip a wall item to place background walls', 'default', 1050);
      this.game.audio.playButtonClick?.();
    }
    if (input?.actions?.justPressed?.buildSnapToggle) {
      scene.buildSnapCursorEnabled = !scene.buildSnapCursorEnabled;
      scene.buildSnapCursorTile = null;
      scene.buildSnapCursorStepCooldown = 0;
      this.game.ui.showToast(scene.buildSnapCursorEnabled ? 'Grid cursor on' : 'Grid cursor off', 'default', 900);
      this.game.audio.playButtonClick?.();
    }
  }

  getEffectiveBuildMode(scene, buildable = null) {
    const item = buildable || this.getSelectedBuildItem(scene);
    if (item?.backgroundOnly) return 'backgroundWall';
    return 'foregroundBlock';
  }

  getAimState(scene) {
    if (!scene?.activeIsland || !scene?.islandPlayer) return null;
    const terrain = scene.activeIsland.terrain;
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
    if (scene.buildSnapCursorEnabled && terrain) {
      const tile = this.getSnapCursorTile(scene, terrain, aimPoint);
      if (tile) {
        const center = this.planetTileToWorld(tile.col, tile.row, { terrain });
        const snapDx = center.x - origin.x;
        const snapDy = center.y - origin.y;
        const snapDistance = Math.hypot(snapDx, snapDy) || 1;
        return {
          origin,
          rawAimPoint: center,
          aimPoint: center,
          direction: { x: snapDx / snapDistance, y: snapDy / snapDistance },
          length: Math.min(snapDistance, range),
          range,
          inRange: snapDistance <= range + 0.001,
          snapped: true,
        };
      }
    }
    return {
      origin,
      rawAimPoint,
      aimPoint,
      direction: { x: dx / distance, y: dy / distance },
      length,
      range,
      inRange: distance <= range + 0.001,
      snapped: false,
    };
  }

  getSnapCursorTile(scene, terrain, fallbackPoint) {
    const fallbackTile = this.worldToPlanetTile(fallbackPoint.x, fallbackPoint.y, { terrain });
    if (!scene.buildSnapCursorTile || !terrain.isInside(scene.buildSnapCursorTile.col, scene.buildSnapCursorTile.row)) {
      scene.buildSnapCursorTile = terrain.isInside(fallbackTile.col, fallbackTile.row)
        ? { col: fallbackTile.col, row: fallbackTile.row }
        : { col: 0, row: 0 };
    }

    const controllerActive = Boolean(this.game.input.isControllerActive?.());
    const inputMode = typeof document !== 'undefined'
      ? document.documentElement.dataset.inputMode
      : 'keyboard';
    if (!controllerActive && inputMode !== 'touch') {
      scene.buildSnapCursorTile = { col: fallbackTile.col, row: fallbackTile.row };
      return terrain.isInside(fallbackTile.col, fallbackTile.row) ? scene.buildSnapCursorTile : null;
    }

    const aim = this.game.input.aimVector || { x: 0, y: 0 };
    const magnitude = Math.hypot(aim.x, aim.y);
    if (magnitude > 0.48 && (scene.buildSnapCursorStepCooldown || 0) <= 0) {
      const localAim = scene.rotateScreenVectorToIslandLocal?.(aim.x / magnitude, aim.y / magnitude) || {
        x: aim.x / magnitude,
        y: aim.y / magnitude,
      };
      const step = Math.abs(localAim.x) >= Math.abs(localAim.y)
        ? { col: Math.sign(localAim.x), row: 0 }
        : { col: 0, row: Math.sign(localAim.y) };
      const next = {
        col: scene.buildSnapCursorTile.col + step.col,
        row: scene.buildSnapCursorTile.row + step.row,
      };
      if (terrain.isInside(next.col, next.row)) scene.buildSnapCursorTile = next;
      scene.buildSnapCursorStepCooldown = magnitude > 0.82 ? 0.09 : 0.14;
    }
    return scene.buildSnapCursorTile;
  }

  getPreview(scene) {
    const island = scene?.activeIsland;
    const terrain = island?.terrain;
    const player = scene?.islandPlayer;
    const buildable = this.getSelectedBuildItem(scene);
    if (!terrain || !player || !buildable) return null;

    const aim = this.getAimState(scene);
    if (!aim) return null;
    const mode = this.getEffectiveBuildMode(scene, buildable);
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
      snapCursor: aim.snapped,
    };
  }

  getTargetTile(terrain, aim, mode) {
    const cursorTile = this.worldToPlanetTile(aim.aimPoint.x, aim.aimPoint.y, { terrain });
    return terrain.isInside(cursorTile.col, cursorTile.row) ? cursorTile : null;
  }

  validatePlacement(scene, col, row, { mode, itemId, center, inRange, materialId }) {
    const terrain = scene?.activeIsland?.terrain;
    if (!terrain?.isInside?.(col, row)) return { ok: false, reason: 'Outside build grid' };
    if (!inRange) return { ok: false, reason: 'Too far' };
    const available = scene?.getAvailableItemAmount?.(itemId) ?? this.game.systems.inventory.getStoredAmount(itemId);
    if (available <= 0) return { ok: false, reason: `No ${this.getItemName(itemId)}` };
    if (mode === 'backgroundWall') {
      if (terrain.isSolidCell(col, row)) return { ok: false, reason: 'Clear foreground first' };
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
    this.invalidToastCooldown = Math.max(0, this.invalidToastCooldown - delta);
    this.updateMode(scene, delta);
    const preview = this.getPreview(scene);
    if (scene) scene.buildPlacementPreview = preview;

    const input = this.game.input;
    const isHeld = Boolean(input?.actions?.build || (input?.actions?.primaryUse && preview));
    const justPressed = Boolean(
      input?.actions?.justPressed?.build
      || input?.actions?.justPressed?.primaryUse
      || input?.actions?.justPressed?.attack
    );
    if (!preview || !isHeld) {
      this.resetPaintStroke();
      return;
    }
    scene.updateIslandPlayerFacingFromAim?.(preview.rawAimPoint);
    if (!preview.valid) {
      this.showInvalidPlacement(preview);
      return;
    }
    const key = `${preview.mode}:${preview.target.col}:${preview.target.row}:${preview.itemId}`;
    const shouldStartStroke = justPressed || !this.paintHeld;
    if (shouldStartStroke) {
      this.paintHeld = true;
      this.paintedKeysThisHold.clear();
      this.lastPaintKey = '';
      this.lastPaintTarget = null;
    }
    if (!shouldStartStroke && !this.canContinuePaintStroke(preview, key)) return;
    if (this.place(scene, preview)) {
      this.lastPaintKey = key;
      this.lastPaintTarget = { col: preview.target.col, row: preview.target.row };
      this.paintedKeysThisHold.add(key);
    }
  }

  resetPaintStroke() {
    this.paintHeld = false;
    this.lastPaintKey = '';
    this.lastPaintTarget = null;
    this.paintedKeysThisHold.clear();
  }

  canContinuePaintStroke(preview, key) {
    if (!preview?.target) return false;
    if (this.paintedKeysThisHold.has(key) || key === this.lastPaintKey) return false;
    if (!this.lastPaintTarget) return true;
    const dx = Math.abs(preview.target.col - this.lastPaintTarget.col);
    const dy = Math.abs(preview.target.row - this.lastPaintTarget.row);
    return Math.max(dx, dy) <= 1;
  }

  place(scene, preview) {
    if (!preview?.valid || !preview.target) return false;
    const { terrain, target, mode, materialId, itemId } = preview;
    let changed = false;
    let previousValue = 0;
    if (mode === 'backgroundWall') {
      previousValue = terrain.getWallCell?.(target.col, target.row) || 0;
      changed = terrain.setWallCell?.(target.col, target.row, materialId) !== false;
    } else {
      previousValue = terrain.getCell(target.col, target.row);
      terrain.setCell(target.col, target.row, materialId, { autoWall: false });
      changed = previousValue !== terrain.getCell(target.col, target.row);
    }
    if (!changed) return false;
    const consumed = scene?.consumeHeldOrInventoryItem?.(itemId, 1) || {
      ok: this.game.systems.inventory.remove(itemId, 1, { skipSave: true }),
      source: 'inventory',
    };
    if (!consumed.ok) {
      if (mode === 'backgroundWall') terrain.setWallCell?.(target.col, target.row, previousValue);
      else terrain.setCell(target.col, target.row, previousValue, { autoWall: false });
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
    if (
      preview.reason === 'Too far'
      || preview.reason === 'Needs support'
      || preview.reason === 'Clear foreground first'
      || preview.reason.startsWith('No ')
    ) {
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
    else this.drawBlockPreview(ctx, terrain, col, row, material, rgb, pulse, preview.valid, preview.buildable);
    if (preview.snapCursor) this.drawSnapCursorFrame(ctx, terrain, col, row, rgb, preview.valid);
    ctx.restore();
  }

  drawSnapCursorFrame(ctx, terrain, col, row, rgb, valid) {
    const size = terrain.cellSize;
    const x = col * size;
    const y = row * size;
    const inset = size * 0.16;
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = valid ? 0.78 : 0.52;
    ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${valid ? 0.9 : 0.62})`;
    ctx.lineWidth = Math.max(1.4, size * 0.055);
    ctx.setLineDash([size * 0.2, size * 0.14]);
    ctx.strokeRect(x + inset, y + inset, size - inset * 2, size - inset * 2);
    ctx.setLineDash([]);
    ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.82)`;
    const corner = Math.max(2.5, size * 0.09);
    const corners = [
      [x + inset, y + inset],
      [x + size - inset, y + inset],
      [x + size - inset, y + size - inset],
      [x + inset, y + size - inset],
    ];
    for (const [cx, cy] of corners) {
      ctx.beginPath();
      ctx.arc(cx, cy, corner, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawBlockPreview(ctx, terrain, col, row, material, rgb, pulse, valid, buildable = null) {
    const size = terrain.cellSize;
    const x = col * size;
    const y = row * size;
    const edgeStyle = this.getBuildPreviewEdgeStyle(material, buildable);
    const shapePulse = edgeStyle === 'smooth' ? 1 : pulse;
    ctx.globalAlpha = valid ? 0.58 : 0.42;
    ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${valid ? 0.34 : 0.22})`;
    ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${valid ? 0.96 : 0.82})`;
    ctx.lineWidth = Math.max(1.5, terrain.cellSize * 0.09);
    ctx.lineJoin = edgeStyle === 'smooth' ? 'miter' : 'round';
    ctx.lineCap = edgeStyle === 'smooth' ? 'butt' : 'round';
    if (edgeStyle === 'smooth') this.traceSmoothGridTile(ctx, x, y, size, shapePulse);
    else this.traceRoughGridTile(ctx, col, row, x, y, size, material, shapePulse);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = valid ? 0.28 : 0.18;
    ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.72)`;
    ctx.lineWidth = Math.max(1, terrain.cellSize * 0.04);
    ctx.beginPath();
    ctx.moveTo(col * size + size * 0.22, row * size + size * 0.72);
    ctx.lineTo(col * size + size * 0.72, row * size + size * 0.22);
    ctx.stroke();
  }

  getBuildPreviewEdgeStyle(material, buildable = null) {
    if (!material) return 'rough';
    if (buildable?.edgeStyle) return buildable.edgeStyle;
    if (SMOOTH_BUILD_MATERIAL_IDS.has(material.id)) return 'smooth';
    return material.id?.includes('Iron') ? 'smooth' : 'rough';
  }

  traceSmoothGridTile(ctx, x, y, size, pulse = 1) {
    const inset = size * (1 - pulse) * 0.5;
    ctx.beginPath();
    ctx.rect(x + inset, y + inset, size - inset * 2, size - inset * 2);
  }

  traceRoughGridTile(ctx, col, row, x, y, size, material, pulse = 1) {
    const materialSalt = Array.from(material?.id || 'rock').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const inset = size * (1 - pulse) * 0.5;
    const left = x + inset;
    const top = y + inset;
    const right = x + size - inset;
    const bottom = y + size - inset;
    const jitter = size * 0.055;
    const point = (px, py, salt) => ({
      x: px + signedHash2D(col * 19 + salt, row * 23, 11, materialSalt) * jitter,
      y: py + signedHash2D(col * 29, row * 31 + salt, 17, materialSalt) * jitter,
    });
    const points = [
      { x: left, y: top },
      point(left + size * 0.33, top, 1),
      point(left + size * 0.66, top, 2),
      { x: right, y: top },
      point(right, top + size * 0.33, 3),
      point(right, top + size * 0.66, 4),
      { x: right, y: bottom },
      point(left + size * 0.66, bottom, 5),
      point(left + size * 0.33, bottom, 6),
      { x: left, y: bottom },
      point(left, top + size * 0.66, 7),
      point(left, top + size * 0.33, 8),
    ];
    drawPolygon(ctx, points);
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
