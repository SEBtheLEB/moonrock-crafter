import { getPointAabbDistance } from '../../utils/raycast.js?v=158';

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothStep(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

export class TerrainBlockEditSystem {
  constructor(terrain) {
    this.terrain = terrain;
  }

  setCell(col, row, value, { autoWall = false } = {}) {
    const terrain = this.terrain;
    if (!terrain.isInside(col, row)) return;
    const index = terrain.index(col, row);
    const previousValue = terrain.cells[index];
    const nextValue = Math.max(0, Number(value) || 0);
    if (previousValue === nextValue) return;
    const debug = terrain.beginTerrainRebuildDebug?.('setCell update', {
      bounds: { minCol: col, maxCol: col, minRow: row, maxRow: row },
      chunksRebuilt: terrain.countChunksForBounds?.({ minCol: col, maxCol: col, minRow: row, maxRow: row }) || 0,
      fullPlanetRebuild: false,
    });
    terrain.cells[index] = nextValue;
    terrain.damage[index] = 0;
    terrain.damagedCells.delete(index);
    this.invalidateEditedTerrainGeometry({
      keepSurfacePath: true,
      previousMaterial: previousValue,
      nextMaterial: nextValue,
      editedCells: [{ col, row }],
    });
    if (terrain.getMaterialLight(previousValue) || terrain.getMaterialLight(nextValue)) {
      terrain.markLightingOverlayDirty({
        defer: true,
        full: true,
      });
    }
    if ((previousValue > 0) !== (nextValue > 0)) terrain.invalidateSurfaceRadiusLookupNear(col, row);
    terrain.renderDirty = true;
    if (terrain.renderCanvas && !terrain.fullRenderDirty) {
      terrain.markDirtyCell(col, row, this.getDirtyPaddingCellsForMaterialChange(previousValue, nextValue));
    } else terrain.fullRenderDirty = true;
    terrain.finishTerrainRebuildDebug?.(debug, {
      tilesProcessed: 1,
      chunksRebuilt: terrain.dirtyChunks?.size || 0,
      fullPlanetRebuild: Boolean(terrain.fullRenderDirty && !terrain.dirtyBounds),
    });
  }

  invalidateEditedTerrainGeometry({
    keepSurfacePath = true,
    previousMaterial = 0,
    nextMaterial = 0,
    editedCells = [],
  } = {}) {
    const terrain = this.terrain;
    if (keepSurfacePath) {
      terrain.markContourRenderCachesStale({ rough: false });
      return;
    }
    terrain.clearContourRenderCaches();
    terrain.surfaceRadiusLookupCache?.clear();
    terrain.markAirExposureDirty({ defer: true });
    terrain.surfacePathCache = null;
    terrain.collisionContours = null;
  }

  getLocalRedrawPaddingPixels() {
    const terrain = this.terrain;
    const outlineOnly = terrain.roughnessRenderEnabled && terrain.isRoughnessOutlineOnly?.();
    const roughPadding = terrain.roughnessRenderEnabled && !outlineOnly ? terrain.cellSize * 5.5 : terrain.cellSize * 4;
    const texturePadding = terrain.cellSize * 3.5;
    return Math.ceil(Math.max(roughPadding, texturePadding));
  }

  getDirtyPaddingCellsForMaterialChange(previousMaterial = 0, nextMaterial = 0) {
    return Math.max(
      3,
      Math.ceil(this.getLocalRedrawPaddingPixels(previousMaterial, nextMaterial) / Math.max(1, this.terrain.cellSize)),
    );
  }

  getFastEditDirtyPaddingCells() {
    const terrain = this.terrain;
    return Math.max(2, Math.ceil(this.getLocalRedrawPaddingPixels() / Math.max(1, terrain.cellSize)));
  }

  mineCircle(worldX, worldY, radius, power, delta, options = {}) {
    const terrain = this.terrain;
    const debug = terrain.beginTerrainRebuildDebug?.('mineCircle update', {
      bounds: Number.isInteger(options.targetCol) && Number.isInteger(options.targetRow)
        ? { minCol: options.targetCol, maxCol: options.targetCol, minRow: options.targetRow, maxRow: options.targetRow }
        : null,
      fullPlanetRebuild: false,
      fromMining: true,
    });
    const broken = [];
    let brokeEmissiveMaterial = false;
    let tilesProcessed = 0;
    const halfSize = terrain.cellSize * 0.5;
    const hasTarget = Number.isInteger(options.targetCol) && Number.isInteger(options.targetRow);
    const canMineMaterial = typeof options.canMineMaterial === 'function'
      ? options.canMineMaterial
      : null;
    const startCol = Math.max(0, Math.min(terrain.cols - 1, Math.floor((worldX - radius - halfSize) / terrain.cellSize)));
    const endCol = Math.max(0, Math.min(terrain.cols - 1, Math.ceil((worldX + radius + halfSize) / terrain.cellSize)));
    const startRow = Math.max(0, Math.min(terrain.rows - 1, Math.floor((worldY - radius - halfSize) / terrain.cellSize)));
    const endRow = Math.max(0, Math.min(terrain.rows - 1, Math.ceil((worldY + radius + halfSize) / terrain.cellSize)));
    for (let row = startRow; row <= endRow; row += 1) {
      for (let col = startCol; col <= endCol; col += 1) {
        tilesProcessed += 1;
        const material = terrain.getCell(col, row);
        if (material <= 0) continue;
        if (canMineMaterial && !canMineMaterial(material, col, row)) continue;
        const left = col * terrain.cellSize;
        const top = row * terrain.cellSize;
        const centerX = left + halfSize;
        const centerY = top + halfSize;
        const distance = getPointAabbDistance(
          worldX,
          worldY,
          left,
          top,
          left + terrain.cellSize,
          top + terrain.cellSize,
        );
        const isTarget = hasTarget && col === options.targetCol && row === options.targetRow;
        if (distance > radius && !isTarget) continue;
        const edgeFalloff = smoothStep(1 - clamp01(distance / Math.max(1, radius)));
        const damageScale = isTarget
          ? 1
          : hasTarget
            ? 0.2 + edgeFalloff * 0.34
            : 0.48 + edgeFalloff * 0.52;
        if (!isTarget && damageScale <= 0.04) continue;
        const data = terrain.materials[material];
        const index = terrain.index(col, row);
        terrain.damage[index] += power * delta * damageScale;
        if (terrain.damage[index] > data.hardness * 0.06) terrain.damagedCells.add(index);
        if (terrain.damage[index] < data.hardness) continue;
        const chip = terrain.getCellPickupChip(col, row, material);
        terrain.damage[index] = 0;
        terrain.damagedCells.delete(index);
        terrain.cells[index] = 0;
        if (terrain.getMaterialLight(material)) brokeEmissiveMaterial = true;
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
    if (broken.length) {
      let editBounds = null;
      let previousMaterial = 0;
      const editedCells = [];
      for (const cell of broken) {
        previousMaterial = previousMaterial || cell.material;
        editedCells.push({ col: cell.col, row: cell.row });
        terrain.invalidateSurfaceRadiusLookupNear(cell.col, cell.row);
        editBounds = terrain.mergeBounds(editBounds, {
          minCol: cell.col,
          maxCol: cell.col,
          minRow: cell.row,
          maxRow: cell.row,
        });
      }
      this.invalidateEditedTerrainGeometry({
        keepSurfacePath: true,
        previousMaterial,
        nextMaterial: 0,
        editedCells,
      });
      terrain.recordMiningEditDebug?.(editBounds, broken.length);
      if (brokeEmissiveMaterial) {
        terrain.markLightingOverlayDirty({
          defer: true,
          bounds: editBounds,
        });
      }
      if (terrain.renderCanvas && terrain.renderCtx && !terrain.fullRenderDirty) {
        terrain.applyImmediateMiningCutout?.(editBounds, editedCells);
      } else {
        terrain.markDirtyBounds?.(editBounds, terrain.getMiningDirtyRadiusCells?.() || 3);
        terrain.renderDirty = true;
        terrain.fullRenderDirty = true;
      }
    }
    terrain.finishTerrainRebuildDebug?.(debug, {
      tilesProcessed,
      chunksRebuilt: terrain.visualRebuildQueue?.size || terrain.dirtyChunks?.size || 0,
      fullPlanetRebuild: Boolean(terrain.fullRenderDirty && !terrain.dirtyBounds),
      fromMining: true,
      brokenTiles: broken.length,
      bounds: broken.length ? broken.reduce((bounds, cell) => terrain.mergeBounds(bounds, {
        minCol: cell.col,
        maxCol: cell.col,
        minRow: cell.row,
        maxRow: cell.row,
      }), null) : null,
    });
    return broken;
  }
}
