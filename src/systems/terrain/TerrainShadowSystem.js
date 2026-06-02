function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

export class TerrainShadowSystem {
  constructor(terrain) {
    this.terrain = terrain;
    this.overlayCanvas = null;
    this.overlayCtx = null;
    this.dirty = true;
    this.ready = false;
    this.fullDirty = true;
    this.dirtyBounds = null;
    this.rebuildAt = 0;
    this.extraLightSources = [];
    this.extraLightSignature = '';
  }

  markDirty({ defer = true, delayMs = 180, bounds = null, full = false } = {}) {
    const terrain = this.terrain;
    this.dirty = true;
    if (full || !bounds || !this.ready) {
      this.fullDirty = true;
      this.dirtyBounds = null;
    } else if (!this.fullDirty) {
      this.dirtyBounds = terrain.mergeBounds(this.dirtyBounds, bounds);
    }
    if (!defer || !this.ready) {
      this.rebuildAt = 0;
      return;
    }
    this.rebuildAt = Math.max(
      this.rebuildAt || 0,
      terrain.getClockNow() + Math.max(0, delayMs),
    );
  }

  setExtraLightSources(sources = []) {
    const terrain = this.terrain;
    const normalized = (Array.isArray(sources) ? sources : [])
      .filter((source) => Number.isFinite(source?.x) && Number.isFinite(source?.y))
      .map((source, index) => ({
        id: source.id || `light-${index}`,
        x: source.x,
        y: source.y,
        color: source.color || '#ffb45f',
        radius: Math.max(terrain.cellSize * 2, Number(source.radius) || terrain.cellSize * 8),
        intensity: clamp01(source.intensity ?? 0.8),
      }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const signature = normalized
      .map((source) => `${source.id}:${Math.round(source.x)}:${Math.round(source.y)}:${Math.round(source.radius)}:${Math.round(source.intensity * 12)}:${source.color}`)
      .join('|');
    if (signature === this.extraLightSignature) return;
    const previousSources = this.extraLightSources || [];
    this.extraLightSources = normalized;
    this.extraLightSignature = signature;
    if (previousSources.length || normalized.length) this.markDirty({ defer: true, delayMs: 90 });
  }

  getExtraLightSources() {
    return this.extraLightSources || [];
  }

  drawCached(ctx, camera, { sx, sy, sw, sh } = {}) {
    const terrain = this.terrain;
    if (!terrain.lightingRenderEnabled && !terrain.depthDebugEnabled) return;
    const overlay = this.getOverlayCanvas();
    if (!overlay.width || !overlay.height) return;
    if (this.dirty) {
      const rebuildDue = !this.ready || !this.rebuildAt || terrain.getClockNow() >= this.rebuildAt;
      if (rebuildDue) this.redrawCache();
    }
    ctx.drawImage(overlay, sx, sy, sw, sh, sx - camera.x, sy, sw, sh);
  }

  redrawCache() {
    const terrain = this.terrain;
    const overlay = this.getOverlayCanvas();
    const overlayCtx = this.overlayCtx;
    const partialBounds = !this.fullDirty && this.dirtyBounds
      ? terrain.expandCellBounds(
        this.dirtyBounds,
        Math.ceil((terrain.getMaxMaterialLightRadius() + terrain.cellSize * 4) / Math.max(1, terrain.cellSize)),
      )
      : null;
    if (partialBounds) {
      const rect = terrain.getLightingDrawRect(partialBounds);
      overlayCtx.clearRect(rect.x, rect.y, rect.width, rect.height);
      if (terrain.lightingRenderEnabled || terrain.depthDebugEnabled) {
        overlayCtx.save();
        overlayCtx.beginPath();
        overlayCtx.rect(rect.x, rect.y, rect.width, rect.height);
        overlayCtx.clip();
        terrain.drawDepthLightingOverlay(overlayCtx, partialBounds, { fastRedraw: true });
        overlayCtx.restore();
      }
    } else {
      overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
      if (terrain.lightingRenderEnabled || terrain.depthDebugEnabled) {
        terrain.drawDepthLightingOverlay(overlayCtx, null, { fastRedraw: false });
      }
    }
    this.dirty = false;
    this.ready = true;
    this.fullDirty = false;
    this.dirtyBounds = null;
    this.rebuildAt = 0;
  }

  getOverlayCanvas() {
    const terrain = this.terrain;
    if (!this.overlayCanvas) {
      this.overlayCanvas = document.createElement('canvas');
      this.overlayCtx = this.overlayCanvas.getContext('2d');
    }
    if (this.overlayCanvas.width !== terrain.width || this.overlayCanvas.height !== terrain.height) {
      this.overlayCanvas.width = terrain.width;
      this.overlayCanvas.height = terrain.height;
      this.markDirty({ defer: false });
    }
    return this.overlayCanvas;
  }

  release() {
    this.overlayCanvas = null;
    this.overlayCtx = null;
    this.dirty = true;
    this.ready = false;
    this.fullDirty = true;
    this.dirtyBounds = null;
    this.rebuildAt = 0;
  }
}
