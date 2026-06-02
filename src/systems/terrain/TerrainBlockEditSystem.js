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
    terrain.cells[index] = nextValue;
    let wallChanged = false;
    if (autoWall && nextValue > 0 && terrain.wallConfig.enabled && !terrain.wallCells[index]) {
      terrain.wallCells[index] = terrain.getWallTypeForTile(col, row, nextValue);
      wallChanged = true;
    }
    terrain.damage[index] = 0;
    terrain.damagedCells.delete(index);
    this.invalidateEditedTerrainGeometry({
      keepSurfacePath: true,
      previousMaterial: previousValue,
      nextMaterial: nextValue,
    });
    if (wallChanged) terrain.markAirExposureDirty({ defer: true });
    if (terrain.getMaterialLight(previousValue) || terrain.getMaterialLight(nextValue) || wallChanged) {
      terrain.markLightingOverlayDirty({
        defer: true,
        bounds: { minCol: col, maxCol: col, minRow: row, maxRow: row },
      });
    }
    if ((previousValue > 0) !== (nextValue > 0)) terrain.invalidateSurfaceRadiusLookupNear(col, row);
    terrain.renderDirty = true;
    if (terrain.renderCanvas && !terrain.fullRenderDirty) {
      terrain.markDirtyCell(col, row, this.getDirtyPaddingCellsForMaterialChange(previousValue, nextValue));
    } else terrain.fullRenderDirty = true;
  }

  invalidateEditedTerrainGeometry({
    keepSurfacePath = true,
    previousMaterial = 0,
    nextMaterial = 0,
  } = {}) {
    const terrain = this.terrain;
    terrain.contourCache?.clear();
    const touchedNaturalSurface = (
      (previousMaterial > 0 && !terrain.isConstructedMaterial(previousMaterial))
      || (nextMaterial > 0 && !terrain.isConstructedMaterial(nextMaterial))
    );
    if (touchedNaturalSurface) {
      terrain.roughEdgeCache?.clear();
      terrain.roughContourCache?.clear();
    }
    // Runtime collision uses local sampled contours. Keep the full debug contour cache stable
    // during single-tile edits so mining/building does not force a planet-wide collision rebuild.
    if (!keepSurfacePath) {
      terrain.surfaceRadiusLookupCache?.clear();
      terrain.markAirExposureDirty({ defer: true });
      terrain.surfacePathCache = null;
      terrain.collisionContours = null;
    }
  }

  getLocalRedrawPaddingPixels() {
    const terrain = this.terrain;
    const roughPadding = terrain.roughnessRenderEnabled ? terrain.cellSize * 5.5 : terrain.cellSize * 4;
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
    return Math.max(4, Math.ceil((terrain.cellSize * 5.5) / Math.max(1, terrain.cellSize)));
  }

  mineCircle(worldX, worldY, radius, power, delta, options = {}) {
    const terrain = this.terrain;
    const broken = [];
    let brokeEmissiveMaterial = false;
    const halfSize = terrain.cellSize * 0.5;
    const hasTarget = Number.isInteger(options.targetCol) && Number.isInteger(options.targetRow);
    const startCol = Math.max(0, Math.min(terrain.cols - 1, Math.floor((worldX - radius - halfSize) / terrain.cellSize)));
    const endCol = Math.max(0, Math.min(terrain.cols - 1, Math.ceil((worldX + radius + halfSize) / terrain.cellSize)));
    const startRow = Math.max(0, Math.min(terrain.rows - 1, Math.floor((worldY - radius - halfSize) / terrain.cellSize)));
    const endRow = Math.max(0, Math.min(terrain.rows - 1, Math.ceil((worldY + radius + halfSize) / terrain.cellSize)));
    for (let row = startRow; row <= endRow; row += 1) {
      for (let col = startCol; col <= endCol; col += 1) {
        const material = terrain.getCell(col, row);
        if (material <= 0) continue;
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
      let qualityPadding = 0;
      let previousMaterial = 0;
      for (const cell of broken) {
        previousMaterial = previousMaterial || cell.material;
        terrain.invalidateSurfaceRadiusLookupNear(cell.col, cell.row);
        editBounds = terrain.mergeBounds(editBounds, {
          minCol: cell.col,
          maxCol: cell.col,
          minRow: cell.row,
          maxRow: cell.row,
        });
        qualityPadding = Math.max(qualityPadding, this.getDirtyPaddingCellsForMaterialChange(cell.material, 0));
        if (terrain.renderCanvas && !terrain.fullRenderDirty) {
          terrain.markDirtyCell(cell.col, cell.row, this.getFastEditDirtyPaddingCells());
        }
      }
      this.invalidateEditedTerrainGeometry({
        keepSurfacePath: true,
        previousMaterial,
        nextMaterial: 0,
      });
      if (brokeEmissiveMaterial) terrain.markLightingOverlayDirty({ defer: true, bounds: editBounds });
      terrain.markFastTerrainEdit(editBounds, qualityPadding);
      terrain.renderDirty = true;
      if (!terrain.renderCanvas || terrain.fullRenderDirty) terrain.fullRenderDirty = true;
    }
    return broken;
  }
}
