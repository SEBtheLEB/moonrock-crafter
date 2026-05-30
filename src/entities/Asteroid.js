import { asteroids as asteroidData } from '../data/asteroids.js?v=30';

export const ASTEROID_TYPES = Object.fromEntries(asteroidData.map((asteroid) => [asteroid.id, asteroid]));

export class Asteroid {
  constructor({ x, y, type = 'stone', seed = Math.random() }) {
    this.reset({ x, y, type, seed });
  }

  reset({ x, y, type = 'stone', seed = Math.random() }) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.seed = seed;
    this.data = ASTEROID_TYPES[type] || ASTEROID_TYPES.stone;
    this.radius = this.data.radius * (0.9 + seed * 0.22);
    this.maxHealth = this.data.health * (0.92 + seed * 0.22);
    this.health = this.maxHealth;
    this.rotation = seed * Math.PI * 2;
    this.rotationSpeed = this.getRotationSpeed();
    this.vx = Math.cos(seed * 18.1) * this.getDriftSpeed();
    this.vy = Math.sin(seed * 13.7) * this.getDriftSpeed();
    this.flash = 0;
    this.scannerPulse = 0;
    this.scannerRevealed = false;
    this.active = true;
    this.cracks = Array.from({ length: 8 }, (_, index) => ({
      angle: (Math.PI * 2 * index) / 8 + seed,
      length: 0.24 + ((index + seed) % 3) * 0.11,
    }));
    return this;
  }

  getDriftSpeed() {
    if (this.data.movement === 'heavy') return 4 + this.seed * 4;
    if (this.data.movement === 'strange') return 14 + this.seed * 8;
    if (this.data.movement === 'slippery') return 16 + this.seed * 9;
    return 8 + this.seed * 10;
  }

  getRotationSpeed() {
    if (this.data.movement === 'heavy') return (this.seed - 0.5) * 0.14;
    if (this.data.movement === 'strange') return (this.seed - 0.5) * 0.9;
    return (this.seed - 0.5) * 0.45;
  }

  update(delta, time = 0) {
    let vx = this.vx;
    let vy = this.vy;
    if (this.data.movement === 'strange') {
      vx += Math.sin(time * 1.8 + this.seed * 10) * 18;
      vy += Math.cos(time * 1.4 + this.seed * 8) * 18;
      this.scannerPulse += delta * 3;
    }
    if (this.data.movement === 'relic') {
      vx += Math.sin(time * 0.9 + this.seed * 12) * 9;
      vy += Math.sin(time * 1.2 + this.seed * 5) * 9;
      this.scannerPulse += delta * 2.2;
    }
    this.x += vx * delta;
    this.y += vy * delta;
    this.rotation += this.rotationSpeed * delta;
    this.flash = Math.max(0, this.flash - delta);
  }

  takeDamage(amount) {
    this.health = Math.max(0, this.health - amount);
    this.flash = 0.08;
    return this.health <= 0;
  }

  getDropPayload() {
    const drops = [];
    this.data.drops.forEach((drop) => {
      if (Math.random() > drop.chance) return;
      const amount = drop.min + Math.floor(Math.random() * (drop.max - drop.min + 1));
      drops.push({ materialId: drop.materialId, amount });
    });
    return drops;
  }

  collidesWith(entity) {
    return Math.hypot(this.x - entity.x, this.y - entity.y) < this.radius + entity.radius;
  }

  draw(ctx, camera) {
    const screen = camera.worldToScreen(this.x, this.y);
    const healthRatio = this.health / this.maxHealth;
    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.rotate(this.rotation);

    if (this.data.glow) {
      ctx.save();
      ctx.globalAlpha = 0.34 + Math.sin(this.scannerPulse) * 0.08;
      ctx.fillStyle = this.data.accent;
      ctx.shadowColor = this.data.accent;
      ctx.shadowBlur = this.data.rarity === 'epic' ? 34 : 24;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * (this.data.rarity === 'epic' ? 1.34 : 1.2), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (['rare', 'epic'].includes(this.data.rarity)) {
      ctx.save();
      ctx.globalAlpha = this.data.rarity === 'epic' ? 0.52 : 0.34;
      ctx.strokeStyle = this.data.accent;
      ctx.lineWidth = this.data.rarity === 'epic' ? 3.2 : 2.4;
      ctx.shadowColor = this.data.accent;
      ctx.shadowBlur = 16;
      this.drawSilhouette(ctx, 1.08);
      ctx.stroke();
      ctx.restore();
    }

    ctx.fillStyle = this.flash > 0 ? '#ece7d8' : this.data.color;
    ctx.strokeStyle = this.data.accent;
    ctx.lineWidth = this.data.rarity === 'epic' ? 2.2 : 1.6;
    this.drawSilhouette(ctx);
    ctx.fill();
    ctx.stroke();
    this.drawFacetHighlights(ctx);

    ctx.strokeStyle = 'rgba(8, 22, 38, 0.68)';
    ctx.lineWidth = 1.2;
    this.cracks.forEach((crack, index) => {
      if (healthRatio > 0.78 - index * 0.09) return;
      ctx.beginPath();
      ctx.moveTo(Math.cos(crack.angle) * this.radius * 0.16, Math.sin(crack.angle) * this.radius * 0.16);
      ctx.lineTo(Math.cos(crack.angle) * this.radius * crack.length, Math.sin(crack.angle) * this.radius * crack.length);
      ctx.stroke();
    });

    if (this.scannerRevealed && this.data.scannerPing) this.drawScannerPing(ctx);
    if (healthRatio < 1) this.drawHealthBar(ctx, healthRatio);
    ctx.restore();
  }

  drawSilhouette(ctx, scale = 1) {
    const points = this.data.rarity === 'epic' ? 12 : this.data.rarity === 'rare' ? 9 : 10;
    ctx.beginPath();
    for (let i = 0; i < points; i += 1) {
      const angle = (Math.PI * 2 * i) / points;
      const relicSpike = this.data.movement === 'relic' && i % 3 === 0 ? 1.22 : 1;
      const crystalSpike = this.type === 'crystal' && i % 2 === 0 ? 1.18 : 1;
      const wobble = this.radius * scale * (0.78 + ((i * 17 + this.seed * 10) % 4) * 0.06) * relicSpike * crystalSpike;
      const x = Math.cos(angle) * wobble;
      const y = Math.sin(angle) * wobble;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  drawFacetHighlights(ctx) {
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = this.data.rarity === 'common' ? 'rgba(255, 242, 207, 0.24)' : this.data.accent;
    ctx.lineWidth = this.data.rarity === 'epic' ? 1.5 : 1.1;
    for (let i = 0; i < 4; i += 1) {
      const a = this.seed * 6 + i * 1.7;
      const inner = this.radius * (0.12 + i * 0.03);
      const outer = this.radius * (0.46 + (i % 2) * 0.12);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
      ctx.lineTo(Math.cos(a + 0.38) * outer, Math.sin(a + 0.38) * outer);
      ctx.stroke();
    }
    if (['rare', 'epic'].includes(this.data.rarity)) {
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = '#ece7d8';
      ctx.shadowColor = this.data.accent;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(-this.radius * 0.24, -this.radius * 0.26, Math.max(2, this.radius * 0.055), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawScannerPing(ctx) {
    ctx.save();
    ctx.rotate(-this.rotation);
    ctx.globalAlpha = 0.35 + Math.sin(this.scannerPulse * 2) * 0.18;
    ctx.strokeStyle = this.data.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius + 8 + Math.sin(this.scannerPulse) * 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawHealthBar(ctx, healthRatio) {
    ctx.rotate(-this.rotation);
    ctx.fillStyle = '#081626';
    ctx.fillRect(-this.radius, -this.radius - 15, this.radius * 2, 7);
    ctx.fillStyle = this.data.accent;
    ctx.fillRect(-this.radius, -this.radius - 15, this.radius * 2 * healthRatio, 7);
  }
}
