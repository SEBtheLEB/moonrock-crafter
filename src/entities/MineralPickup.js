export class MineralPickup {
  constructor(options = {}) {
    this.reset(options);
  }

  reset({ materialId = 'stoneOre', amount = 1, x = 0, y = 0, seed = Math.random(), material = null } = {}) {
    this.materialId = materialId;
    this.amount = amount;
    this.x = x;
    this.y = y;
    this.seed = seed;
    this.material = material;
    this.vx = Math.cos(seed * 15.3) * 42;
    this.vy = Math.sin(seed * 18.9) * 42;
    this.radius = 12;
    this.age = 0;
    this.active = true;
    return this;
  }

  update(delta) {
    this.age += delta;
    this.x += this.vx * delta;
    this.y += this.vy * delta;
    this.vx *= Math.max(0, 1 - delta * 0.8);
    this.vy *= Math.max(0, 1 - delta * 0.8);
  }

  collidesWith(entity) {
    return Math.hypot(this.x - entity.x, this.y - entity.y) < this.radius + entity.radius;
  }

  draw(ctx, camera) {
    const color = this.material?.color || '#ffd36b';
    const rarity = this.material?.rarity || 'common';
    const screen = camera.worldToScreen(this.x, this.y + Math.sin(this.age * 4 + this.seed) * 4);
    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.rotate(this.age * 1.4 + this.seed);
    ctx.fillStyle = color;
    ctx.strokeStyle = '#081626';
    ctx.lineWidth = rarity === 'epic' ? 4 : 3;
    if (rarity !== 'common') {
      ctx.shadowColor = color;
      ctx.shadowBlur = rarity === 'epic' ? 18 : 10;
    }
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(10, 0);
    ctx.lineTo(0, 12);
    ctx.lineTo(-10, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
