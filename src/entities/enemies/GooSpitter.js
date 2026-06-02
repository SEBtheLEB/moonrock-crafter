import { PlanetEnemy } from './PlanetEnemy.js?v=153';

const TAU = Math.PI * 2;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class GooSpitter extends PlanetEnemy {
  constructor(options) {
    super(options);
    this.projectiles = [];
  }

  update(delta, context) {
    super.update(delta, context);
    if (!this.isActive()) {
      this.projectiles.length = 0;
      return;
    }
    this.updateProjectiles(delta, context);
    this.tryShoot(context);
  }

  tryContactAttack(context) {
    const distance = Math.hypot(context.player.centerX - this.localX, context.player.centerY - this.localY);
    const closeRange = this.radius + 24;
    if (distance <= closeRange) super.tryContactAttack(context);
  }

  tryShoot({ player }) {
    if (this.attackTimer > 0 || this.projectiles.length >= 4) return;
    const dx = player.centerX - this.localX;
    const dy = player.centerY - this.localY;
    const distance = Math.hypot(dx, dy);
    if (distance > (this.data.attackRange || 300) || distance < this.radius * 1.35) return;
    this.attackTimer = this.data.attackCooldown || 2;
    this.squish = 1;
    const speed = this.data.projectileSpeed || 260;
    const gravity = this.data.projectileGravity || 420;
    const flightTime = clamp(distance / speed, 0.68, 1.35);
    this.projectiles.push({
      x: this.localX,
      y: this.localY - this.radius * 0.22,
      vx: dx / flightTime,
      vy: (dy - 0.5 * gravity * flightTime * flightTime) / flightTime,
      age: 0,
      life: 2.8,
      radius: this.data.projectileRadius || 8,
      hit: false,
    });
  }

  updateProjectiles(delta, { island, player, onPlayerDamage, toWorld }) {
    const gravity = this.data.projectileGravity || 420;
    for (const projectile of this.projectiles) {
      projectile.age += delta;
      projectile.vy += gravity * delta;
      projectile.x += projectile.vx * delta;
      projectile.y += projectile.vy * delta;
      const dx = player.centerX - projectile.x;
      const dy = player.centerY - projectile.y;
      const hitRadius = projectile.radius + 24;
      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        const world = toWorld?.(projectile.x, projectile.y) || projectile;
        projectile.hit = true;
        onPlayerDamage?.({
          enemy: this,
          amount: this.data.projectileDamage || 10,
          sourceX: projectile.x,
          sourceY: projectile.y,
          worldX: world.x,
          worldY: world.y,
          kind: 'projectile',
        });
        continue;
      }
      if (island.terrain?.containsCollisionPoint?.(projectile.x, projectile.y)) {
        projectile.hit = true;
      }
    }
    this.projectiles = this.projectiles.filter((projectile) => !projectile.hit && projectile.age < projectile.life);
  }

  drawGooChunks(ctx, samples, time = 0) {
    super.drawGooChunks(ctx, samples, time);
    const head = samples[0];
    if (!head) return;
    const r = this.radius;
    ctx.save();
    ctx.translate(head.x, head.y);
    ctx.rotate(Math.atan2(head.tangent.y, head.tangent.x));
    ctx.fillStyle = this.data.accent || '#f0ff8e';
    ctx.strokeStyle = 'rgba(9, 20, 24, 0.55)';
    ctx.lineWidth = 1.5;
    const breathe = 1 + Math.sin(time * 4 + this.seed) * 0.08;
    ctx.beginPath();
    ctx.ellipse(-this.direction * r * 0.12, -r * 0.42, r * 0.34 * breathe, r * 0.22, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  draw(ctx, options = {}) {
    super.draw(ctx, options);
    if (!this.projectiles.length) return;
    ctx.save();
    for (const projectile of this.projectiles) {
      const pulse = 1 + Math.sin((options.time || 0) * 14 + projectile.age * 5) * 0.12;
      ctx.fillStyle = 'rgba(184, 255, 142, 0.86)';
      ctx.strokeStyle = 'rgba(17, 39, 26, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(projectile.x, projectile.y, projectile.radius * pulse, projectile.radius * 0.82, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}
