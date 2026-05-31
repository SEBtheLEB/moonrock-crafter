export class MineralPickup {
  constructor(options = {}) {
    this.reset(options);
  }

  reset({ materialId = 'stoneOre', amount = 1, x = 0, y = 0, seed = Math.random(), material = null, chip = null } = {}) {
    this.materialId = materialId;
    this.amount = amount;
    this.x = x;
    this.y = y;
    this.seed = seed;
    this.material = material;
    this.chip = chip;
    this.vx = Math.cos(seed * 15.3) * 42;
    this.vy = Math.sin(seed * 18.9) * 42;
    this.radius = chip?.size ? Math.max(10, chip.size * 0.48) : 12;
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
    const screen = camera.worldToScreen(this.x, this.y + Math.sin(this.age * 4 + this.seed) * 4);
    this.drawAt(ctx, screen.x, screen.y);
  }

  drawLocal(ctx) {
    this.drawAt(ctx, this.x, this.y + Math.sin(this.age * 4 + this.seed) * 4);
  }

  drawAt(ctx, x, y) {
    if (this.chip) {
      this.drawVoxelChip(ctx, x, y);
      return;
    }
    const color = this.material?.color || '#ffd36b';
    const rarity = this.material?.rarity || 'common';
    ctx.save();
    ctx.translate(x, y);
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

  drawVoxelChip(ctx, x, y) {
    const chip = this.chip;
    const color = chip.color || this.material?.color || '#6b625a';
    const edge = chip.edge || this.material?.color || '#91867a';
    const size = this.radius * (0.92 + Math.sin(this.age * 3 + this.seed) * 0.03);
    const points = Array.isArray(chip.points) && chip.points.length
      ? chip.points
      : [
        { x: -0.72, y: -0.52 },
        { x: 0.42, y: -0.62 },
        { x: 0.72, y: -0.16 },
        { x: 0.5, y: 0.56 },
        { x: -0.42, y: 0.64 },
        { x: -0.72, y: 0.2 },
      ];

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.age * 0.9 + this.seed * 2);
    if ((this.material?.rarity || 'common') !== 'common') {
      ctx.shadowColor = edge;
      ctx.shadowBlur = 9;
    }
    ctx.beginPath();
    points.forEach((point, index) => {
      const px = point.x * size;
      const py = point.y * size;
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();

    ctx.save();
    ctx.clip();
    this.drawChipTexture(ctx, size, color, edge);
    ctx.restore();

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(6, 13, 18, 0.72)';
    ctx.lineWidth = Math.max(2.2, (chip.lineWidth || 1.8) * 1.3);
    ctx.stroke();
    ctx.strokeStyle = edge;
    ctx.globalAlpha = 0.68;
    ctx.lineWidth = Math.max(1.2, chip.lineWidth || 1.6);
    ctx.stroke();
    ctx.restore();
  }

  drawChipTexture(ctx, size, color, edge) {
    const flecks = 8;
    for (let index = 0; index < flecks; index += 1) {
      const hash = Math.sin(this.seed * 999 + index * 37.21) * 10000;
      const fx = ((hash % 1) - 0.5) * size * 1.15;
      const fy = (((hash * 1.73) % 1) - 0.5) * size * 0.96;
      const radius = size * (0.035 + Math.abs((hash * 2.17) % 1) * 0.045);
      ctx.fillStyle = index % 3 === 0 ? 'rgba(255, 244, 217, 0.16)' : `${edge}33`;
      ctx.beginPath();
      ctx.ellipse(fx, fy, radius * 1.7, radius, (hash % 1) * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(22, 16, 15, 0.22)';
    ctx.lineWidth = Math.max(0.8, size * 0.055);
    ctx.beginPath();
    ctx.moveTo(-size * 0.36, -size * 0.08);
    ctx.quadraticCurveTo(-size * 0.06, -size * 0.22, size * 0.34, -size * 0.03);
    ctx.stroke();
  }
}
