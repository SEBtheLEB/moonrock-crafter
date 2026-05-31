const DEFAULTS = {
  cooldown: 0.48,
  projectileSpeed: 520,
  homingStrength: 9.5,
  projectileLife: 1.8,
  targetRange: 860,
  aimConeDot: 0.24,
  damage: 16,
};

export class CompanionDrone {
  constructor(options = {}) {
    this.config = { ...DEFAULTS, ...options };
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.cooldown = 0;
    this.floatTime = 0;
    this.initialized = false;
    this.projectiles = [];
    this.projectilePool = [];
  }

  update(delta, anchor, { threats = [], onHit = null } = {}) {
    this.floatTime += delta;
    this.cooldown = Math.max(0, this.cooldown - delta);
    this.updateFollow(delta, anchor);
    this.updateProjectiles(delta, threats, onHit);
  }

  updateFollow(delta, anchor) {
    const facing = anchor.facing ?? (Math.cos(anchor.angle || 0) >= 0 ? 1 : -1);
    const side = anchor.droneSide ?? -1;
    const desiredX = anchor.x + facing * side * 42;
    const desiredY = anchor.y - 34 + Math.sin(this.floatTime * 3.1) * 8;
    if (!this.initialized) {
      this.x = desiredX;
      this.y = desiredY;
      this.initialized = true;
    }
    const follow = Math.min(1, delta * 8);
    this.vx += (desiredX - this.x) * follow * 10;
    this.vy += (desiredY - this.y) * follow * 10;
    this.vx *= Math.max(0, 1 - delta * 6);
    this.vy *= Math.max(0, 1 - delta * 6);
    this.x += this.vx * delta;
    this.y += this.vy * delta;
  }

  tryShoot({ anchor, aimPoint, threats = [], onShoot = null } = {}) {
    if (this.cooldown > 0) return false;
    const target = this.findTarget({ anchor, aimPoint, threats });
    const aim = this.getAimVector(anchor, aimPoint);
    const projectile = this.projectilePool.pop() || {};
    Object.assign(projectile, {
      x: this.x,
      y: this.y,
      vx: aim.x * this.config.projectileSpeed,
      vy: aim.y * this.config.projectileSpeed,
      age: 0,
      life: this.config.projectileLife,
      target,
      active: true,
    });
    this.projectiles.push(projectile);
    this.cooldown = this.config.cooldown;
    onShoot?.(target);
    return true;
  }

  getAimVector(anchor, aimPoint) {
    const dx = (aimPoint?.x ?? anchor.x + 1) - anchor.x;
    const dy = (aimPoint?.y ?? anchor.y) - anchor.y;
    const distance = Math.hypot(dx, dy) || 1;
    return { x: dx / distance, y: dy / distance };
  }

  findTarget({ anchor, aimPoint, threats }) {
    if (!aimPoint) return this.findNearestThreat(anchor, threats);
    const aim = this.getAimVector(anchor, aimPoint);
    let best = null;
    let bestScore = Infinity;
    for (const threat of threats) {
      if (!this.isThreatActive(threat)) continue;
      const position = this.getThreatPosition(threat);
      const dx = position.x - anchor.x;
      const dy = position.y - anchor.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= 1 || distance > this.config.targetRange) continue;
      const dot = (dx / distance) * aim.x + (dy / distance) * aim.y;
      if (dot < this.config.aimConeDot) continue;
      const perpendicular = Math.abs(dx * aim.y - dy * aim.x);
      const score = perpendicular + distance * 0.11 + (1 - dot) * 90;
      if (score < bestScore) {
        best = threat;
        bestScore = score;
      }
    }
    return best;
  }

  findNearestThreat(anchor, threats) {
    let best = null;
    let bestDistanceSq = Infinity;
    const rangeSq = this.config.targetRange * this.config.targetRange;
    for (const threat of threats) {
      if (!this.isThreatActive(threat)) continue;
      const position = this.getThreatPosition(threat);
      const dx = position.x - anchor.x;
      const dy = position.y - anchor.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq > rangeSq || distanceSq >= bestDistanceSq) continue;
      best = threat;
      bestDistanceSq = distanceSq;
    }
    return best;
  }

  updateProjectiles(delta, threats, onHit) {
    let writeIndex = 0;
    for (let index = 0; index < this.projectiles.length; index += 1) {
      const projectile = this.projectiles[index];
      projectile.age += delta;
      if (projectile.target && !this.isThreatActive(projectile.target)) {
        projectile.target = this.findNearestThreat(projectile, threats);
      }
      if (projectile.target) this.homeProjectile(projectile, delta);
      projectile.x += projectile.vx * delta;
      projectile.y += projectile.vy * delta;
      const hit = projectile.target && this.projectileHits(projectile, projectile.target);
      if (hit) {
        onHit?.(projectile.target, projectile, this.config.damage);
        this.releaseProjectile(projectile);
        continue;
      }
      if (projectile.age < projectile.life) {
        this.projectiles[writeIndex] = projectile;
        writeIndex += 1;
      } else {
        this.releaseProjectile(projectile);
      }
    }
    this.projectiles.length = writeIndex;
  }

  homeProjectile(projectile, delta) {
    const target = this.getThreatPosition(projectile.target);
    const dx = target.x - projectile.x;
    const dy = target.y - projectile.y;
    const distance = Math.hypot(dx, dy) || 1;
    const speed = Math.hypot(projectile.vx, projectile.vy) || this.config.projectileSpeed;
    const turn = Math.min(1, delta * this.config.homingStrength);
    projectile.vx += ((dx / distance) * speed - projectile.vx) * turn;
    projectile.vy += ((dy / distance) * speed - projectile.vy) * turn;
    const nextSpeed = Math.hypot(projectile.vx, projectile.vy) || 1;
    projectile.vx = (projectile.vx / nextSpeed) * speed;
    projectile.vy = (projectile.vy / nextSpeed) * speed;
  }

  projectileHits(projectile, threat) {
    const target = this.getThreatPosition(threat);
    const radius = threat.radius || 20;
    const dx = target.x - projectile.x;
    const dy = target.y - projectile.y;
    return dx * dx + dy * dy <= (radius + 8) ** 2;
  }

  getThreatPosition(threat) {
    if (Number.isFinite(threat.centerX) && Number.isFinite(threat.centerY)) {
      return { x: threat.centerX, y: threat.centerY };
    }
    return threat.getPosition ? threat.getPosition() : { x: threat.x || 0, y: threat.y || 0 };
  }

  isThreatActive(threat) {
    return threat && (threat.isActive ? threat.isActive() : threat.active !== false);
  }

  releaseProjectile(projectile) {
    projectile.active = false;
    projectile.target = null;
    if (this.projectilePool.length < 24) this.projectilePool.push(projectile);
  }

  draw(ctx, camera) {
    const screen = camera.worldToScreen(this.x, this.y);
    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.fillStyle = 'rgba(102, 216, 232, 0.16)';
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#66d8e8';
    ctx.strokeStyle = 'rgba(8, 17, 26, 0.62)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 9 + Math.sin(this.floatTime * 4) * 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff2cf';
    ctx.beginPath();
    ctx.arc(3, -2, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    this.projectiles.forEach((projectile) => {
      const projectileScreen = camera.worldToScreen(projectile.x, projectile.y);
      ctx.save();
      ctx.translate(projectileScreen.x, projectileScreen.y);
      ctx.rotate(Math.atan2(projectile.vy, projectile.vx));
      ctx.fillStyle = '#ffd36b';
      ctx.shadowColor = '#66d8e8';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.ellipse(0, 0, 9, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  clear() {
    this.projectiles.length = 0;
    this.projectilePool.length = 0;
    this.initialized = false;
    this.cooldown = 0;
  }
}
