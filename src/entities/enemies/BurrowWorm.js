import { PlanetEnemy } from './PlanetEnemy.js?v=131';

const TAU = Math.PI * 2;

const clamp01 = (value) => Math.max(0, Math.min(1, value));

function wrap(value, length) {
  if (!length) return 0;
  return ((value % length) + length) % length;
}

function shortestPathDelta(from, to, length) {
  if (!length) return 0;
  return wrap(to - from + length * 0.5, length) - length * 0.5;
}

export class BurrowWorm extends PlanetEnemy {
  constructor(options) {
    super(options);
    this.state = 'burrow';
    this.stateTimer = 1.2 + this.random() * 1.4;
    this.leapTime = 0;
    this.leapDuration = this.data.leapDuration || 1.25;
    this.startPathDistance = this.pathDistance;
    this.endPathDistance = this.pathDistance;
    this.exposed = false;
    this.surfaceOffset = this.data.surfaceOffset ?? 10;
    this.bodyLength = this.data.bodyLength || this.radius * 6.2;
    this.segmentCount = this.data.segmentCount || 11;
  }

  update(delta, context) {
    if (!this.isActive()) return;
    const dt = Math.min(delta, 0.05);
    this.currentIsland = context.island;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    this.squish = Math.max(0, this.squish - dt * 4);
    if (this.state === 'leap') this.updateLeap(dt, context);
    else this.updateBurrow(dt, context);
    this.updateWorldPosition(context);
    if (this.exposed) this.tryContactAttack(context);
  }

  updateBurrow(delta, { island, player }) {
    this.exposed = false;
    const path = island.terrain?.getSurfacePath?.();
    const length = path?.length || 0;
    if (!length) return;
    const playerPath = island.terrain.getClosestSurfacePathDistance(player.centerX, player.centerY);
    const deltaToPlayer = shortestPathDelta(this.pathDistance, playerPath, length);
    const trackSpeed = this.data.burrowSpeed || 95;
    this.pathDistance = wrap(this.pathDistance + Math.sign(deltaToPlayer || this.direction) * Math.min(Math.abs(deltaToPlayer), trackSpeed * delta), length);
    const sample = island.terrain.sampleSurfacePath(this.pathDistance, -(this.data.burrowDepth || 30));
    this.localX = sample.x;
    this.localY = sample.y;
    this.surfaceSample = sample;

    this.stateTimer -= delta;
    const playerDistance = Math.hypot(player.centerX - sample.surfaceX, player.centerY - sample.surfaceY);
    if (this.stateTimer <= 0 && playerDistance <= (this.data.aggroRadius || 430)) {
      this.beginLeap(island, playerPath, length);
    }
  }

  beginLeap(island, playerPath, pathLength) {
    const side = this.random() > 0.5 ? 1 : -1;
    const approach = this.data.leapApproach || 150;
    const travel = this.data.leapTravel || 310;
    this.startPathDistance = wrap(playerPath - side * approach, pathLength);
    this.endPathDistance = wrap(playerPath + side * travel, pathLength);
    this.pathDistance = this.startPathDistance;
    this.direction = side;
    this.state = 'leap';
    this.leapTime = 0;
    this.exposed = true;
    this.squish = 1;
    this.updateLeapPosition(island, 0);
  }

  updateLeap(delta, { island }) {
    this.leapTime += delta;
    const t = clamp01(this.leapTime / this.leapDuration);
    this.updateLeapPosition(island, t);
    if (t < 1) return;
    this.pathDistance = this.endPathDistance;
    this.state = 'burrow';
    this.stateTimer = this.data.burrowCooldown || (1.5 + this.random() * 1.4);
    this.exposed = false;
  }

  updateLeapPosition(island, t) {
    const path = island.terrain?.getSurfacePath?.();
    const length = path?.length || 0;
    const deltaPath = shortestPathDelta(this.startPathDistance, this.endPathDistance, length);
    this.pathDistance = wrap(this.startPathDistance + deltaPath * t, length);
    const arc = Math.sin(t * Math.PI) * (this.data.leapHeight || 150);
    const sample = island.terrain.sampleSurfacePath(this.pathDistance, this.surfaceOffset + arc);
    this.localX = sample.x;
    this.localY = sample.y;
    this.surfaceSample = sample;
  }

  takeDamage(amount = 1, knockback = null) {
    if (!this.exposed) return false;
    return super.takeDamage(amount, knockback);
  }

  isTargetable() {
    return this.isActive() && this.exposed;
  }

  draw(ctx, { time = 0 } = {}) {
    if (!this.isActive()) return;
    if (this.state === 'leap') {
      this.drawLeapingWorm(ctx, time);
    } else {
      this.drawBurrowRipple(ctx, time);
    }
  }

  drawBurrowRipple(ctx, time = 0) {
    const sample = this.currentIsland?.terrain?.sampleSurfacePath?.(this.pathDistance, 2);
    if (!sample) return;
    const pulse = 1 + Math.sin(time * 7 + this.seed) * 0.12;
    ctx.save();
    ctx.translate(sample.x, sample.y);
    ctx.rotate(Math.atan2(sample.tangent.y, sample.tangent.x));
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = this.data.accent || '#d3a05e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, this.radius * 1.35 * pulse, this.radius * 0.22, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  drawLeapingWorm(ctx, time = 0) {
    const samples = this.getWormSamples();
    if (!samples.length) return;
    ctx.save();
    if (this.hitFlash > 0) ctx.filter = 'brightness(1.55)';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = this.data.color || '#9f6c45';
    ctx.lineWidth = this.radius * 0.95;
    ctx.beginPath();
    samples.forEach((sample, index) => {
      if (index === 0) ctx.moveTo(sample.x, sample.y);
      else ctx.lineTo(sample.x, sample.y);
    });
    ctx.stroke();
    ctx.strokeStyle = 'rgba(8, 16, 18, 0.64)';
    ctx.lineWidth = 2;
    ctx.stroke();

    samples.forEach((sample, index) => {
      const t = index / Math.max(1, samples.length - 1);
      const size = this.radius * (1 - t * 0.42);
      ctx.save();
      ctx.translate(sample.x, sample.y);
      ctx.rotate(Math.atan2(sample.tangent.y, sample.tangent.x));
      ctx.fillStyle = index % 2 === 0 ? (this.data.color || '#9f6c45') : (this.data.belly || '#6f4935');
      ctx.strokeStyle = 'rgba(8, 16, 18, 0.58)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-size * 0.5, -size * 0.34, size, size * 0.68, Math.max(5, size * 0.18));
      ctx.fill();
      ctx.stroke();
      if (index % 3 === 1) {
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = this.data.accent || '#f4c36a';
        ctx.beginPath();
        ctx.arc(size * 0.12, -size * 0.14 + Math.sin(time * 8 + index) * 1.4, Math.max(2, size * 0.08), 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    });
    this.drawHealth(ctx);
    ctx.restore();
  }

  getWormSamples() {
    const island = this.currentIsland;
    const path = island?.terrain?.getSurfacePath?.();
    const length = path?.length || 0;
    if (!island || !length) return [];
    const currentT = clamp01(this.leapTime / this.leapDuration);
    const deltaPath = shortestPathDelta(this.startPathDistance, this.endPathDistance, length);
    const samples = [];
    for (let index = 0; index < this.segmentCount; index += 1) {
      const lag = index * 0.055;
      const t = clamp01(currentT - lag);
      const pathDistance = wrap(this.startPathDistance + deltaPath * t, length);
      const arc = Math.sin(t * Math.PI) * (this.data.leapHeight || 150);
      samples.push(island.terrain.sampleSurfacePath(pathDistance, this.surfaceOffset + arc - index * 1.2));
    }
    return samples;
  }
}
