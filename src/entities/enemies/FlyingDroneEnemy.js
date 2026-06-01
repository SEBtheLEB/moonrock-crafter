const TAU = Math.PI * 2;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const normalizeAngle = (angle) => ((angle + Math.PI) % TAU + TAU) % TAU - Math.PI;
const approachValue = (value, target, maxDelta) => {
  if (value < target) return Math.min(target, value + maxDelta);
  if (value > target) return Math.max(target, value - maxDelta);
  return target;
};

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

export class FlyingDroneEnemy {
  constructor({ data, island, angle = -Math.PI / 2, seed = 1 }) {
    this.data = data;
    this.id = `${data.id}-${Math.round(seed)}-${Math.round(angle * 1000)}`;
    this.enemyId = data.id;
    this.islandId = island?.id || '';
    this.seed = seed;
    this.random = seededNoise(seed);
    this.radius = data.radius || 24;
    this.maxHealth = data.maxHealth || 45;
    this.health = this.maxHealth;
    this.active = true;
    this.hitFlash = 0;
    this.squish = 0;
    this.state = 'approach';
    this.stateTimer = 0.8 + this.random() * 0.5;
    this.attackTimer = 0.8 + this.random();
    this.damageTimer = 0;
    this.vx = 0;
    this.vy = 0;
    this.worldX = 0;
    this.worldY = 0;
    this.accent = data.accent || '#8ee8ff';
    this.orbitOffset = (this.random() < 0.5 ? -1 : 1) * (0.18 + this.random() * 0.28);
    const spawn = this.getOrbitPoint(island, angle, data.spawnAltitude || 520);
    this.localX = spawn.x;
    this.localY = spawn.y;
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

  update(delta, context) {
    if (!this.isActive()) return;
    const dt = Math.min(delta, 0.05);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.squish = Math.max(0, this.squish - dt * 4);
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    this.damageTimer = Math.max(0, this.damageTimer - dt);
    this.updateMovement(dt, context);
    this.updateWorldPosition(context);
    this.tryContactAttack(context);
  }

  updateMovement(delta, { island, player }) {
    const center = island?.getCenterLocal?.() || { x: 0, y: 0 };
    const playerAngle = Math.atan2(player.centerY - center.y, player.centerX - center.x);
    const currentAngle = Math.atan2(this.localY - center.y, this.localX - center.x);
    const angleDelta = normalizeAngle(playerAngle + this.orbitOffset - currentAngle);
    const maxAngleStep = (0.56 + this.random() * 0.02) * delta;
    const targetAngle = currentAngle + clamp(angleDelta, -maxAngleStep, maxAngleStep);
    const hoverDistance = this.data.hoverDistance || 176;
    const playerRadius = Math.hypot(player.centerX - center.x, player.centerY - center.y);
    const orbitAltitude = this.data.orbitAltitude || hoverDistance * 0.62;
    const surfaceRadius = this.getSurfaceRadiusAt(island, targetAngle);
    const bob = Math.sin(this.stateTimer * 2.2 + this.seed * 0.001) * 14;
    const desiredRadius = Math.max(
      surfaceRadius + (this.data.minSurfaceClearance || 64),
      Math.min(surfaceRadius + orbitAltitude + bob, playerRadius + hoverDistance * 0.58),
    );
    const targetX = center.x + Math.cos(targetAngle) * desiredRadius;
    const targetY = center.y + Math.sin(targetAngle) * desiredRadius;
    const tx = targetX - this.localX;
    const ty = targetY - this.localY;
    const targetDistance = Math.hypot(tx, ty) || 1;
    const acceleration = this.data.acceleration || 520;
    const maxSpeed = this.data.moveSpeed || 155;
    this.vx += (tx / targetDistance) * acceleration * delta;
    this.vy += (ty / targetDistance) * acceleration * delta;
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > maxSpeed) {
      const scale = maxSpeed / speed;
      this.vx *= scale;
      this.vy *= scale;
    }
    this.localX += this.vx * delta;
    this.localY += this.vy * delta;
    this.keepOutsidePlanet(island);
    this.stateTimer += delta;
  }

  getSurfaceRadiusAt(island, angle) {
    return island?.terrain?.getSurfaceRadiusAtAngle?.(angle)
      || island?.getSurfaceRadiusAtAngle?.(angle)
      || Math.min(island?.width || 800, island?.height || 800) * 0.42;
  }

  getOrbitPoint(island, angle, altitude = 260) {
    const center = island?.getCenterLocal?.() || { x: (island?.width || 0) * 0.5, y: (island?.height || 0) * 0.5 };
    const radius = this.getSurfaceRadiusAt(island, angle) + altitude;
    return {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    };
  }

  keepOutsidePlanet(island) {
    if (!island) return;
    const center = island.getCenterLocal?.() || { x: island.width * 0.5, y: island.height * 0.5 };
    const dx = this.localX - center.x;
    const dy = this.localY - center.y;
    const distance = Math.hypot(dx, dy) || 1;
    const angle = Math.atan2(dy, dx);
    const minRadius = this.getSurfaceRadiusAt(island, angle) + (this.data.minSurfaceClearance || 64);
    if (distance >= minRadius) return;
    const nx = dx / distance;
    const ny = dy / distance;
    this.localX = center.x + nx * minRadius;
    this.localY = center.y + ny * minRadius;
    const inwardSpeed = this.vx * -nx + this.vy * -ny;
    if (inwardSpeed > 0) {
      this.vx += nx * inwardSpeed;
      this.vy += ny * inwardSpeed;
    }
    const tangentSpeed = this.vx * -ny + this.vy * nx;
    const clamped = approachValue(tangentSpeed, 0, 18);
    this.vx += -ny * (clamped - tangentSpeed);
    this.vy += nx * (clamped - tangentSpeed);
  }

  updateWorldPosition({ toWorld }) {
    const world = toWorld ? toWorld(this.localX, this.localY) : { x: this.localX, y: this.localY };
    this.worldX = world.x;
    this.worldY = world.y;
  }

  tryContactAttack({ player, onPlayerDamage }) {
    if (this.damageTimer > 0) return;
    const dx = player.centerX - this.localX;
    const dy = player.centerY - this.localY;
    const range = this.radius + 30;
    if (dx * dx + dy * dy > range * range) return;
    this.damageTimer = 0.72;
    onPlayerDamage?.({
      enemy: this,
      amount: this.data.contactDamage || 9,
      sourceX: this.localX,
      sourceY: this.localY,
      worldX: this.worldX,
      worldY: this.worldY,
      kind: 'drone',
    });
  }

  takeDamage(amount = 1, knockback = null) {
    if (!this.isActive()) return false;
    this.health = Math.max(0, this.health - amount);
    this.hitFlash = knockback?.flashDuration || 0.18;
    this.squish = 1;
    if (knockback) {
      const resistance = clamp(this.data.knockbackResistance ?? 0.18, 0, 0.9);
      this.vx += (knockback.x || 0) * (1 - resistance);
      this.vy += (knockback.y || 0) * (1 - resistance);
      this.state = 'recover';
      this.stateTimer = Math.max(this.stateTimer, 0.28);
    }
    if (this.health > 0) return false;
    this.active = false;
    return true;
  }

  draw(ctx, { time = 0 } = {}) {
    if (!this.isActive()) return;
    const pulse = 1 + Math.sin(time * 5.2 + this.seed) * 0.04 + this.squish * 0.08;
    ctx.save();
    ctx.translate(this.localX, this.localY);
    if (this.hitFlash > 0) ctx.filter = 'brightness(1.8)';
    ctx.shadowColor = this.accent;
    ctx.shadowBlur = 10;
    ctx.fillStyle = this.data.color || '#243a52';
    ctx.strokeStyle = 'rgba(6, 13, 22, 0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius * pulse, 0, TAU);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = this.accent;
    ctx.beginPath();
    ctx.arc(this.radius * 0.24, -this.radius * 0.18, this.radius * 0.23, 0, TAU);
    ctx.fill();

    if (this.health < this.maxHealth) this.drawHealth(ctx);
    ctx.restore();
  }

  drawHealth(ctx) {
    const width = this.radius * 1.9;
    const height = 5;
    ctx.save();
    ctx.translate(0, -this.radius * 1.35);
    ctx.fillStyle = 'rgba(7, 12, 18, 0.62)';
    ctx.fillRect(-width / 2, -height / 2, width, height);
    ctx.fillStyle = this.accent;
    ctx.fillRect(-width / 2, -height / 2, width * clamp(this.health / this.maxHealth, 0, 1), height);
    ctx.restore();
  }
}
