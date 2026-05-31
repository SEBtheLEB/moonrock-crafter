export class CargoTransferEffectSystem {
  constructor() {
    this.effects = [];
  }

  spawnFromCargo({ cargo, getMaterial, ship }) {
    this.effects = [];
    let effectIndex = 0;
    Object.entries(cargo).forEach(([materialId, amount]) => {
      const material = getMaterial(materialId);
      const visibleCount = Math.max(1, Math.min(6, amount));
      for (let i = 0; i < visibleCount; i += 1) {
        const spread = (effectIndex % 7) - 3;
        this.effects.push({
          materialId,
          icon: material?.icon || '*',
          color: material?.color || '#ffd36b',
          age: -effectIndex * 0.045,
          life: 0.78 + (i % 3) * 0.08,
          startX: ship.x + Math.cos(effectIndex * 1.8) * 18,
          startY: ship.y + Math.sin(effectIndex * 2.1) * 14,
          endX: spread * 10,
          endY: -18 - (effectIndex % 3) * 7,
          arc: 80 + (effectIndex % 4) * 18,
          size: 15 + (effectIndex % 3) * 2,
        });
        effectIndex += 1;
      }
    });
    return effectIndex;
  }

  update(delta) {
    for (let index = 0; index < this.effects.length; index += 1) {
      this.effects[index].age += delta;
    }
  }

  draw(ctx, camera) {
    if (!this.effects.length) return;
    this.effects.forEach((effect) => {
      if (effect.age < 0) return;
      const t = Math.min(1, effect.age / effect.life);
      const ease = 1 - (1 - t) ** 3;
      const lift = Math.sin(t * Math.PI) * effect.arc;
      const x = effect.startX + (effect.endX - effect.startX) * ease;
      const y = effect.startY + (effect.endY - effect.startY) * ease - lift;
      const screen = camera.worldToScreen(x, y);
      const alpha = t > 0.86 ? Math.max(0, (1 - t) / 0.14) : Math.min(1, t / 0.16);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(screen.x, screen.y);
      ctx.rotate(effect.age * 7);
      ctx.fillStyle = effect.color;
      ctx.strokeStyle = '#081626';
      ctx.lineWidth = 3;
      ctx.shadowColor = effect.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(0, 0, effect.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#081626';
      ctx.font = '900 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(effect.icon, 0, 1);
      ctx.restore();
    });
    ctx.globalAlpha = 1;
  }

  clear() {
    this.effects.length = 0;
  }
}
