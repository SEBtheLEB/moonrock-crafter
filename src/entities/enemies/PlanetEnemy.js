const TAU = Math.PI * 2;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function wrap(value, length) {
  if (!length) return 0;
  return ((value % length) + length) % length;
}

function shortestPathDelta(from, to, length) {
  if (!length) return 0;
  return wrap(to - from + length * 0.5, length) - length * 0.5;
}

function seededNoise(seed = 1) {
  let value = Math.floor(seed) >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export class PlanetEnemy {
  constructor({ data, island, angle = -Math.PI / 2, seed = 1 }) {
    this.data = data;
    this.id = `${data.id}-${Math.round(seed)}-${Math.round(angle * 1000)}`;
    this.enemyId = data.id;
    this.islandId = island?.id || '';
    this.seed = seed;
    this.random = seededNoise(seed);
    this.direction = this.random() > 0.5 ? 1 : -1;
    this.radius = data.radius || 28;
    this.surfaceOffset = Math.max(12, data.surfaceOffset ?? this.radius * 0.38);
    this.bodyLength = data.bodyLength || this.radius * 4.4;
    this.segmentCount = data.segmentCount || 8;
    this.maxHealth = data.maxHealth || 40;
    this.health = this.maxHealth;
    this.active = true;
    this.hitFlash = 0;
    this.attackTimer = this.random() * 0.45;
    this.wanderTimer = 0.8 + this.random() * 1.6;
    this.squish = 0;
    this.accent = data.accent || '#b8ff8e';
    this.pathDistance = this.getInitialPathDistance(island, angle);
    this.localX = 0;
    this.localY = 0;
    this.worldX = 0;
    this.worldY = 0;
    this.surfaceSample = null;
    this.updateSurfacePosition(island);
  }

  get centerX() {
    return this.worldX;
  }

  get centerY() {
    return this.worldY;
  }

  getPosition() {
    return { x: this.worldX, y: this.worldY };
  }

  isActive() {
    return this.active && this.health > 0;
  }

  isTargetable() {
    return this.isActive();
  }

  getInitialPathDistance(island, angle) {
    const terrain = island?.terrain;
    if (!terrain?.getClosestSurfacePathDistance) return 0;
    const point = island.getSurfaceLocalAtAngle?.(angle, 0)
      || {
        x: island.getCenterLocal().x + Math.cos(angle) * island.radius,
        y: island.getCenterLocal().y + Math.sin(angle) * island.radius,
      };
    return terrain.getClosestSurfacePathDistance(point.x, point.y);
  }

  update(delta, context) {
    if (!this.isActive()) return;
    const dt = Math.min(delta, 0.05);
    this.currentIsland = context.island;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    this.squish = Math.max(0, this.squish - dt * 4);
    this.updateMovement(dt, context);
    this.updateSurfacePosition(context.island);
    this.updateWorldPosition(context);
    this.tryContactAttack(context);
  }

  updateMovement(delta, { island, player }) {
    const path = island.terrain?.getSurfacePath?.();
    const pathLength = path?.length || 0;
    if (!pathLength) return;
    const playerPath = island.terrain.getClosestSurfacePathDistance(player.centerX, player.centerY);
    const playerDistance = Math.hypot(player.centerX - this.localX, player.centerY - this.localY);
    const aggro = playerDistance <= (this.data.aggroRadius || 320);
    let speed = this.data.wanderSpeed || this.data.moveSpeed || 44;

    if (aggro) {
      const deltaToPlayer = shortestPathDelta(this.pathDistance, playerPath, pathLength);
      this.direction = Math.abs(deltaToPlayer) < 6 ? this.direction : Math.sign(deltaToPlayer);
      speed = this.data.chaseSpeed || this.data.moveSpeed || speed;
    } else {
      this.wanderTimer -= delta;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 1 + this.random() * 2.2;
        this.direction *= -1;
      }
    }

    this.pathDistance = wrap(this.pathDistance + this.direction * speed * delta, pathLength);
  }

  updateSurfacePosition(island) {
    const sample = island.terrain?.sampleSurfacePath?.(this.pathDistance, this.surfaceOffset);
    if (!sample) return;
    this.surfaceSample = sample;
    this.localX = sample.x;
    this.localY = sample.y;
  }

  updateWorldPosition({ toWorld }) {
    const world = toWorld ? toWorld(this.localX, this.localY) : { x: this.localX, y: this.localY };
    this.worldX = world.x;
    this.worldY = world.y;
  }

  tryContactAttack({ player, onPlayerDamage }) {
    if (this.attackTimer > 0) return;
    const dx = player.centerX - this.localX;
    const dy = player.centerY - this.localY;
    const range = this.data.attackRange || this.radius + 24;
    if (dx * dx + dy * dy > range * range) return;
    this.attackTimer = this.data.attackCooldown || 0.8;
    this.squish = 1;
    onPlayerDamage?.({
      enemy: this,
      amount: this.data.contactDamage || (this.data.damagePerSecond || 6) * this.attackTimer,
      sourceX: this.localX,
      sourceY: this.localY,
      worldX: this.worldX,
      worldY: this.worldY,
      kind: 'contact',
    });
  }

  takeDamage(amount = 1) {
    if (!this.isActive()) return false;
    this.health = Math.max(0, this.health - amount);
    this.hitFlash = 0.18;
    this.squish = 1;
    if (this.health > 0) return false;
    this.active = false;
    return true;
  }

  drawHealth(ctx) {
    if (this.health >= this.maxHealth) return;
    const width = this.radius * 1.8;
    const height = 5;
    ctx.save();
    ctx.translate(this.localX, this.localY - this.radius * 1.4);
    ctx.fillStyle = 'rgba(7, 12, 18, 0.62)';
    ctx.fillRect(-width / 2, -height / 2, width, height);
    ctx.fillStyle = '#b8ff8e';
    ctx.fillRect(-width / 2, -height / 2, width * clamp(this.health / this.maxHealth, 0, 1), height);
    ctx.restore();
  }

  getBodySamples(time = 0) {
    const spacing = this.bodyLength / Math.max(1, this.segmentCount - 1);
    const samples = [];
    const waveStrength = this.radius * 0.08;
    for (let index = 0; index < this.segmentCount; index += 1) {
      const distance = this.pathDistance - this.direction * spacing * index;
      const sample = this.getPathSample(distance, time, index, waveStrength);
      const t = index / Math.max(1, this.segmentCount - 1);
      samples.push({
        ...sample,
        t,
        size: this.radius * (1 - t * 0.48) * (1 + Math.sin(time * 5 + this.seed + index) * 0.045),
      });
    }
    return samples;
  }

  getPathSample(distance, time = 0, index = 0, waveStrength = 0) {
    const offsetPulse = Math.sin(time * 4.6 + this.seed + index * 0.7) * waveStrength;
    return this.currentIsland?.terrain?.sampleSurfacePath?.(distance, this.surfaceOffset + offsetPulse)
      || this.surfaceSample
      || { x: this.localX, y: this.localY, tangent: { x: 1, y: 0 }, outward: { x: 0, y: -1 }, distance };
  }

  draw(ctx, { time = 0 } = {}) {
    if (!this.isActive()) return;
    const samples = this.getBodySamples(time);
    if (!samples.length) return;
    ctx.save();
    if (this.hitFlash > 0) ctx.filter = 'brightness(1.55)';
    this.drawGooStroke(ctx, samples, time);
    this.drawGooChunks(ctx, samples, time);
    this.drawHealth(ctx);
    ctx.restore();
  }

  drawGooStroke(ctx, samples) {
    const fill = this.data.color || '#68d477';
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = fill;
    ctx.lineWidth = this.radius * (1.22 + this.squish * 0.16);
    ctx.beginPath();
    samples.forEach((sample, index) => {
      if (index === 0) ctx.moveTo(sample.x, sample.y);
      else ctx.lineTo(sample.x, sample.y);
    });
    ctx.stroke();
    ctx.strokeStyle = 'rgba(6, 17, 22, 0.58)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  drawGooChunks(ctx, samples, time = 0) {
    const fill = this.data.color || '#68d477';
    const belly = this.data.belly || '#3f9d5e';
    const accent = this.data.accent || '#b8ff8e';
    samples.forEach((sample, index) => {
      const isHead = index === 0;
      const size = sample.size * (isHead ? 1.12 + this.squish * 0.18 : 0.92);
      const tangentAngle = Math.atan2(sample.tangent.y, sample.tangent.x);
      ctx.save();
      ctx.translate(sample.x, sample.y);
      ctx.rotate(tangentAngle);
      ctx.fillStyle = fill;
      ctx.strokeStyle = 'rgba(6, 17, 22, 0.66)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.roundRect(-size * 0.54, -size * 0.34, size * 1.08, size * 0.68, Math.max(6, size * 0.22));
      ctx.fill();
      ctx.stroke();

      if (index % 2 === 0) {
        ctx.globalAlpha = 0.42;
        ctx.fillStyle = belly;
        ctx.beginPath();
        ctx.roundRect(-size * 0.32, -size * 0.14, size * 0.58, size * 0.24, Math.max(4, size * 0.1));
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      if (index % 3 === 1 || isHead) {
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.arc(size * 0.12, -size * 0.16 + Math.sin(time * 5 + index) * 1.2, Math.max(2.2, size * 0.08), 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    });
  }
}
