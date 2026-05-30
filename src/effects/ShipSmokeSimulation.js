const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;

const SMOKE_SETTINGS = {
  resolution: 92,
  dissipation: 0.986,
  velocityDissipation: 0.978,
  pressure: 0.34,
  pressureIterations: 6,
  curl: 0.58,
  force: 0.42,
  intensity: 0.56,
  splatRadius: 9,
};

// Adapted from the FX Lab smoke-flow grid simulation. This version is scoped to
// the mining camera so the ship gets fluid-like exhaust without a world-sized sim.
export class ShipSmokeSimulation {
  constructor() {
    this.cols = 0;
    this.rows = 0;
    this.width = 0;
    this.height = 0;
    this.dye = new Float32Array(0);
    this.dyeNext = new Float32Array(0);
    this.vx = new Float32Array(0);
    this.vy = new Float32Array(0);
    this.vxNext = new Float32Array(0);
    this.vyNext = new Float32Array(0);
    this.pressure = new Float32Array(0);
    this.pressureNext = new Float32Array(0);
    this.divergence = new Float32Array(0);
    this.curl = new Float32Array(0);
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.imageData = null;
    this.time = 0;
    this.dyeTotal = 0;
    this.flowX = 0;
    this.flowY = 0;
  }

  ensure(width, height) {
    const nextWidth = Math.max(1, Math.floor(width || 1));
    const nextHeight = Math.max(1, Math.floor(height || 1));
    const nextCols = Math.floor(clamp(SMOKE_SETTINGS.resolution, 48, 124));
    const nextRows = Math.floor(clamp(nextCols * nextHeight / Math.max(1, nextWidth), 28, 92));
    if (this.cols === nextCols && this.rows === nextRows && this.width === nextWidth && this.height === nextHeight) return;

    const size = nextCols * nextRows;
    this.cols = nextCols;
    this.rows = nextRows;
    this.width = nextWidth;
    this.height = nextHeight;
    this.dye = new Float32Array(size);
    this.dyeNext = new Float32Array(size);
    this.vx = new Float32Array(size);
    this.vy = new Float32Array(size);
    this.vxNext = new Float32Array(size);
    this.vyNext = new Float32Array(size);
    this.pressure = new Float32Array(size);
    this.pressureNext = new Float32Array(size);
    this.divergence = new Float32Array(size);
    this.curl = new Float32Array(size);
    this.canvas.width = nextCols;
    this.canvas.height = nextRows;
    this.imageData = this.ctx.createImageData(nextCols, nextRows);
    this.dyeTotal = 0;
  }

  clear() {
    this.dye.fill(0);
    this.dyeNext.fill(0);
    this.vx.fill(0);
    this.vy.fill(0);
    this.vxNext.fill(0);
    this.vyNext.fill(0);
    this.pressure.fill(0);
    this.pressureNext.fill(0);
    this.divergence.fill(0);
    this.curl.fill(0);
    this.dyeTotal = 0;
    this.flowX = 0;
    this.flowY = 0;
  }

  index(x, y) {
    return y * this.cols + x;
  }

  sample(field, x, y) {
    const x0 = Math.floor(clamp(x, 0, this.cols - 1));
    const y0 = Math.floor(clamp(y, 0, this.rows - 1));
    const x1 = Math.min(this.cols - 1, x0 + 1);
    const y1 = Math.min(this.rows - 1, y0 + 1);
    const tx = clamp(x - x0, 0, 1);
    const ty = clamp(y - y0, 0, 1);
    const a = field[this.index(x0, y0)];
    const b = field[this.index(x1, y0)];
    const c = field[this.index(x0, y1)];
    const d = field[this.index(x1, y1)];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
  }

  addSplat(canvasX, canvasY, dx, dy, amount = 1, radiusPx = SMOKE_SETTINGS.splatRadius) {
    if (!this.cols || !this.rows) return;

    const gx = clamp(canvasX / Math.max(1, this.width) * (this.cols - 1), 0, this.cols - 1);
    const gy = clamp(canvasY / Math.max(1, this.height) * (this.rows - 1), 0, this.rows - 1);
    const cellSize = (this.width / this.cols + this.height / this.rows) * 0.5;
    const radius = clamp(radiusPx / Math.max(1, cellSize), 0.72, 4.5);
    const minX = Math.max(0, Math.floor(gx - radius * 2));
    const maxX = Math.min(this.cols - 1, Math.ceil(gx + radius * 2));
    const minY = Math.max(0, Math.floor(gy - radius * 2));
    const maxY = Math.min(this.rows - 1, Math.ceil(gy + radius * 2));
    const velocityScale = SMOKE_SETTINGS.force * 0.58;
    const dyeAmount = amount * (0.32 + SMOKE_SETTINGS.intensity * 0.32);

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const px = (x - gx) / radius;
        const py = (y - gy) / radius;
        const falloff = Math.exp(-(px * px + py * py) * 1.65);
        if (falloff < 0.012) continue;
        const idx = this.index(x, y);
        this.dye[idx] = Math.min(1.35, this.dye[idx] + dyeAmount * falloff);
        this.vx[idx] += dx * velocityScale * falloff;
        this.vy[idx] += dy * velocityScale * falloff;
      }
    }
  }

  toViewScreen(point, viewport, viewScale = 1) {
    const width = viewport?.width || this.width || 1;
    const height = viewport?.height || this.height || 1;
    if (Math.abs(viewScale - 1) < 0.001) return point;
    return {
      x: width * 0.5 + (point.x - width * 0.5) * viewScale,
      y: height * 0.5 + (point.y - height * 0.5) * viewScale,
    };
  }

  emitFromShip({ ship, camera, input, viewport, fuelRatio = 1, delta, viewScale = 1 }) {
    this.ensure(viewport?.width || 1, viewport?.height || 1);
    const move = input?.moveVector || { x: 0, y: 0 };
    const thrust = Math.hypot(move.x, move.y);
    if (thrust <= 0.05 || fuelRatio <= 0.02) return false;

    const exhaustAngle = ship.angle + Math.PI;
    const shipScale = Math.max(0.75, ship.sizeScale || 1);
    const exhaustDistance = 40 * shipScale;
    const sideAngle = ship.angle + Math.PI * 0.5;
    const speed = Math.hypot(ship.vx, ship.vy);
    const power = clamp(thrust * (0.68 + fuelRatio * 0.22) + speed / Math.max(1, ship.maxSpeed) * 0.11, 0.12, 0.82);
    const jitter = Math.sin(this.time * 16.7) * 1.35;
    const screenFlowScale = Math.max(0.72, viewScale);
    const baseFlow = (16 + speed * 0.055 + power * 12) * screenFlowScale;
    const flowX = Math.cos(exhaustAngle) * baseFlow - ship.vx * 0.035 * screenFlowScale;
    const flowY = Math.sin(exhaustAngle) * baseFlow - ship.vy * 0.035 * screenFlowScale;
    this.flowX = lerp(this.flowX, flowX, clamp(delta * 7, 0, 1));
    this.flowY = lerp(this.flowY, flowY, clamp(delta * 7, 0, 1));

    for (let i = 0; i < 2; i += 1) {
      const side = i === 0 ? -1 : 1;
      const worldX = ship.x
        + Math.cos(exhaustAngle) * (exhaustDistance + i * 2.2 * shipScale)
        + Math.cos(sideAngle) * side * (2.4 * shipScale + Math.sin(this.time * 11 + i) * 0.7);
      const worldY = ship.y
        + Math.sin(exhaustAngle) * (exhaustDistance + i * 2.2 * shipScale)
        + Math.sin(sideAngle) * side * (2.4 * shipScale + Math.cos(this.time * 9 + i) * 0.7);
      const screen = this.toViewScreen(camera.worldToScreen(worldX, worldY), viewport, viewScale);
      this.addSplat(
        screen.x + Math.sin(this.time * 21 + i) * 0.85,
        screen.y + Math.cos(this.time * 19 + i) * 0.85,
        flowX + Math.cos(sideAngle) * side * (2.6 + jitter),
        flowY + Math.sin(sideAngle) * side * (2.6 - jitter),
        power * delta * 4.8,
        (7.5 + power * 5.5) * shipScale,
      );
    }
    return true;
  }

  applyForces(safeDt) {
    const driftScale = safeDt * 0.5;
    for (let y = 0; y < this.rows; y += 1) {
      for (let x = 0; x < this.cols; x += 1) {
        const idx = this.index(x, y);
        const density = this.dye[idx];
        if (density <= 0.002) continue;
        const densityBoost = 0.35 + Math.min(1.15, density);
        this.vx[idx] += this.flowX * driftScale * densityBoost;
        this.vy[idx] += this.flowY * driftScale * densityBoost;
        this.vy[idx] -= 3.2 * safeDt * densityBoost;
      }
    }
  }

  solveCurl(safeDt) {
    const curlStrength = SMOKE_SETTINGS.curl * 3.8;
    if (curlStrength <= 0.001) return;

    for (let y = 1; y < this.rows - 1; y += 1) {
      for (let x = 1; x < this.cols - 1; x += 1) {
        const idx = this.index(x, y);
        this.curl[idx] = (
          this.vy[this.index(x + 1, y)]
          - this.vy[this.index(x - 1, y)]
          - this.vx[this.index(x, y + 1)]
          + this.vx[this.index(x, y - 1)]
        ) * 0.5;
      }
    }

    for (let y = 1; y < this.rows - 1; y += 1) {
      for (let x = 1; x < this.cols - 1; x += 1) {
        const idx = this.index(x, y);
        const left = Math.abs(this.curl[this.index(x - 1, y)]);
        const right = Math.abs(this.curl[this.index(x + 1, y)]);
        const top = Math.abs(this.curl[this.index(x, y - 1)]);
        const bottom = Math.abs(this.curl[this.index(x, y + 1)]);
        const fx = bottom - top;
        const fy = left - right;
        const length = Math.hypot(fx, fy) + 0.0001;
        const vortex = this.curl[idx] * curlStrength * safeDt;
        this.vx[idx] += fx / length * vortex;
        this.vy[idx] += fy / length * vortex;
      }
    }
  }

  solvePressure() {
    this.pressure.fill(0);
    for (let y = 1; y < this.rows - 1; y += 1) {
      for (let x = 1; x < this.cols - 1; x += 1) {
        const idx = this.index(x, y);
        this.divergence[idx] = -0.5 * (
          this.vx[this.index(x + 1, y)]
          - this.vx[this.index(x - 1, y)]
          + this.vy[this.index(x, y + 1)]
          - this.vy[this.index(x, y - 1)]
        );
      }
    }

    for (let iteration = 0; iteration < SMOKE_SETTINGS.pressureIterations; iteration += 1) {
      for (let y = 1; y < this.rows - 1; y += 1) {
        for (let x = 1; x < this.cols - 1; x += 1) {
          const idx = this.index(x, y);
          this.pressureNext[idx] = (
            this.pressure[this.index(x - 1, y)]
            + this.pressure[this.index(x + 1, y)]
            + this.pressure[this.index(x, y - 1)]
            + this.pressure[this.index(x, y + 1)]
            + this.divergence[idx]
          ) * 0.25;
        }
      }
      [this.pressure, this.pressureNext] = [this.pressureNext, this.pressure];
    }

    const pressureScale = 0.35 + SMOKE_SETTINGS.pressure * 0.65;
    for (let y = 1; y < this.rows - 1; y += 1) {
      for (let x = 1; x < this.cols - 1; x += 1) {
        const idx = this.index(x, y);
        this.vx[idx] -= (this.pressure[this.index(x + 1, y)] - this.pressure[this.index(x - 1, y)]) * pressureScale;
        this.vy[idx] -= (this.pressure[this.index(x, y + 1)] - this.pressure[this.index(x, y - 1)]) * pressureScale;
      }
    }
  }

  advect(safeDt) {
    const advectScale = safeDt * 0.82;
    this.dyeTotal = 0;
    for (let y = 0; y < this.rows; y += 1) {
      for (let x = 0; x < this.cols; x += 1) {
        const idx = this.index(x, y);
        const backX = x - this.vx[idx] * advectScale;
        const backY = y - this.vy[idx] * advectScale;
        const edgeDamp = x <= 0 || y <= 0 || x >= this.cols - 1 || y >= this.rows - 1 ? 0.42 : 1;
        this.vxNext[idx] = this.sample(this.vx, backX, backY) * SMOKE_SETTINGS.velocityDissipation * edgeDamp;
        this.vyNext[idx] = this.sample(this.vy, backX, backY) * SMOKE_SETTINGS.velocityDissipation * edgeDamp;
        this.dyeNext[idx] = Math.max(0, this.sample(this.dye, backX, backY) * SMOKE_SETTINGS.dissipation - 0.0009);
        this.dyeTotal += this.dyeNext[idx];
      }
    }
    [this.vx, this.vxNext] = [this.vxNext, this.vx];
    [this.vy, this.vyNext] = [this.vyNext, this.vy];
    [this.dye, this.dyeNext] = [this.dyeNext, this.dye];
  }

  update({ delta, viewport, ship, camera, input, fuelRatio = 1, viewScale = 1 }) {
    this.ensure(viewport?.width || 1, viewport?.height || 1);
    const safeDt = clamp(delta, 0.001, 0.033);
    this.time += safeDt;
    const emitted = this.emitFromShip({ ship, camera, input, viewport, fuelRatio, delta: safeDt, viewScale });
    if (!emitted && this.dyeTotal <= 0.001) return;
    this.applyForces(safeDt);
    this.solveCurl(safeDt);
    this.solvePressure();
    this.advect(safeDt);
  }

  draw(ctx) {
    if (!this.imageData || this.dyeTotal <= 0.001) return;

    const data = this.imageData.data;
    for (let i = 0; i < this.dye.length; i += 1) {
      const p = i * 4;
      const value = clamp(this.dye[i] * SMOKE_SETTINGS.intensity * 1.15, 0, 0.95);
      if (value <= 0.004) {
        data[p] = 0;
        data[p + 1] = 0;
        data[p + 2] = 0;
        data[p + 3] = 0;
        continue;
      }
      const shade = clamp(0.58 + value * 0.3, 0.5, 0.88);
      data[p] = clamp(116 * shade, 0, 255);
      data[p + 1] = clamp(122 * shade, 0, 255);
      data[p + 2] = clamp(128 * shade, 0, 255);
      data[p + 3] = clamp(value * 92, 0, 112);
    }

    this.ctx.putImageData(this.imageData, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.62;
    ctx.drawImage(this.canvas, 0, 0, this.width, this.height);
    ctx.globalAlpha = 0.14;
    ctx.filter = 'blur(4px)';
    ctx.drawImage(this.canvas, 0, 0, this.width, this.height);
    ctx.restore();
  }
}
