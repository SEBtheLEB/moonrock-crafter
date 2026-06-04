export class TerrainWallSystem {
  constructor(terrain) {
    this.terrain = terrain;
  }

  getCell(col, row) {
    const terrain = this.terrain;
    if (!terrain.isInside(col, row)) return 0;
    return terrain.wallCells?.[terrain.index(col, row)] || 0;
  }

  setCell(col, row, value) {
    const terrain = this.terrain;
    if (!terrain.isInside(col, row) || !terrain.wallCells) return false;
    const index = terrain.index(col, row);
    const nextValue = Math.max(0, Number(value) || 0);
    if (terrain.wallCells[index] === nextValue) return false;
    terrain.wallCells[index] = nextValue;
    terrain.wallRenderDirty = true;
    terrain.contourCache?.clear();
    terrain.markAirExposureDirty({ defer: true });
    terrain.markLightingOverlayDirty({
      defer: true,
      bounds: { minCol: col, maxCol: col, minRow: row, maxRow: row },
    });
    terrain.renderDirty = true;
    if (terrain.renderCanvas && !terrain.fullRenderDirty) {
      terrain.markDirtyCell(col, row, terrain.getDirtyPaddingCellsForMaterialChange(nextValue, nextValue));
    } else terrain.fullRenderDirty = true;
    return true;
  }

  isCell(col, row) {
    return this.getCell(col, row) > 0;
  }

  getTypeForTile(col, row, fallbackMaterial = 1) {
    const terrain = this.terrain;
    const ownMaterial = terrain.getCell(col, row);
    if (ownMaterial > 0) return ownMaterial;
    const radius = Math.max(1, Math.round(terrain.wallConfig.materialInfluenceRadius || 4));
    const weights = new Map();
    for (let y = row - radius; y <= row + radius; y += 1) {
      for (let x = col - radius; x <= col + radius; x += 1) {
        if (!terrain.isInside(x, y)) continue;
        const material = terrain.getCell(x, y);
        if (material <= 0) continue;
        const dx = x - col;
        const dy = y - row;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq > radius * radius) continue;
        const materialBias = material >= 4 ? 1.7 : material > 1 ? 1.28 : 1;
        const weight = materialBias / Math.max(1, 1 + distanceSq * 0.42);
        weights.set(material, (weights.get(material) || 0) + weight);
      }
    }
    let bestMaterial = fallbackMaterial;
    let bestWeight = 0;
    weights.forEach((weight, material) => {
      if (weight > bestWeight) {
        bestWeight = weight;
        bestMaterial = material;
      }
    });
    return bestMaterial || 1;
  }

  shouldHaveNaturalWallCell(col, row, { stableDepth = false } = {}) {
    const terrain = this.terrain;
    if (!terrain.isInside(col, row)) return false;
    const material = terrain.getCell(col, row);
    if (material > 0 && !terrain.isConstructedMaterial(material)) return true;

    const startDepth = Math.max(0, (terrain.wallConfig.startDepth ?? 0.55) * terrain.cellSize);
    const x = col * terrain.cellSize + terrain.cellSize * 0.5;
    const y = row * terrain.cellSize + terrain.cellSize * 0.5;
    const depth = stableDepth && typeof terrain.getStablePlanetDepthAt === 'function'
      ? terrain.getStablePlanetDepthAt(x, y)
      : terrain.getTerrainDepthAt(x, y);
    return depth >= startDepth;
  }

  generateLayerForPlanet() {
    const terrain = this.terrain;
    if (!terrain.wallConfig.enabled) return;
    const debug = terrain.beginTerrainRebuildDebug?.('wall rebuild', {
      fullPlanetRebuild: true,
      chunksRebuilt: terrain.countChunksForBounds?.(null) || 0,
      fromMining: terrain.isRecentMiningEdit?.() || false,
    });
    terrain.wallCells.fill(0);
    for (let row = 0; row < terrain.rows; row += 1) {
      for (let col = 0; col < terrain.cols; col += 1) {
        if (!this.shouldHaveNaturalWallCell(col, row)) continue;
        const material = terrain.getCell(col, row);
        terrain.wallCells[terrain.index(col, row)] = this.getTypeForTile(col, row, material || 1);
      }
    }
    terrain.contourCache?.clear();
    terrain.wallRenderDirty = true;
    terrain.markAirExposureDirty({ defer: false });
    terrain.markLightingOverlayDirty({ defer: false, full: true });
    terrain.renderDirty = true;
    terrain.fullRenderDirty = true;
    terrain.finishTerrainRebuildDebug?.(debug, {
      tilesProcessed: terrain.countCellsInBounds?.(null) || 0,
      chunksRebuilt: terrain.countChunksForBounds?.(null) || 0,
      fullPlanetRebuild: true,
      fromMining: terrain.isRecentMiningEdit?.() || false,
    });
  }

  repairNaturalLayerForPlanet() {
    const terrain = this.terrain;
    if (!terrain.wallConfig.enabled || !terrain.wallCells?.length) return false;
    const debug = terrain.beginTerrainRebuildDebug?.('wall rebuild', {
      fullPlanetRebuild: true,
      chunksRebuilt: terrain.countChunksForBounds?.(null) || 0,
      fromMining: terrain.isRecentMiningEdit?.() || false,
    });
    let changed = false;
    for (let row = 0; row < terrain.rows; row += 1) {
      for (let col = 0; col < terrain.cols; col += 1) {
        const index = terrain.index(col, row);
        if (!this.shouldHaveNaturalWallCell(col, row, { stableDepth: true })) continue;
        const material = terrain.getCell(col, row);
        const nextWall = this.getTypeForTile(col, row, material || 1);
        if (terrain.wallCells[index] === nextWall) continue;
        terrain.wallCells[index] = nextWall;
        changed = true;
      }
    }
    if (!changed) {
      terrain.finishTerrainRebuildDebug?.(debug, {
        tilesProcessed: terrain.countCellsInBounds?.(null) || 0,
        chunksRebuilt: 0,
        fullPlanetRebuild: false,
        fromMining: terrain.isRecentMiningEdit?.() || false,
      });
      return false;
    }
    terrain.contourCache?.clear();
    terrain.wallRenderDirty = true;
    terrain.markAirExposureDirty({ defer: false });
    terrain.markLightingOverlayDirty({ defer: false, full: true });
    terrain.renderDirty = true;
    terrain.fullRenderDirty = true;
    terrain.finishTerrainRebuildDebug?.(debug, {
      tilesProcessed: terrain.countCellsInBounds?.(null) || 0,
      chunksRebuilt: terrain.countChunksForBounds?.(null) || 0,
      fullPlanetRebuild: true,
      fromMining: terrain.isRecentMiningEdit?.() || false,
    });
    return true;
  }
}
