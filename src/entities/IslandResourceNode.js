export class IslandResourceNode {
  constructor({ data, x, y }) {
    this.data = data;
    this.id = `${data.id}-${x}`;
    this.x = x;
    this.y = y;
    this.width = data.type === 'tree' ? 68 : 76;
    this.height = data.type === 'tree' ? 132 : 62;
    this.maxHealth = data.health || 1;
    this.health = this.maxHealth;
    this.active = true;
    this.flash = 0;
  }

  get centerX() {
    return this.x + this.width / 2;
  }

  get centerY() {
    return this.y - this.height / 2;
  }

  isNear(player, range = 84) {
    const dx = player.centerX - this.centerX;
    const dy = player.centerY - this.centerY;
    return dx * dx + dy * dy <= range * range;
  }

  hit() {
    if (!this.active) return null;
    this.health -= 1;
    this.flash = 0.18;
    if (this.health > 0) return null;
    this.active = false;
    return { drops: this.data.resourceDrops, node: this };
  }

  gather() {
    if (!this.active) return null;
    this.health = 0;
    this.active = false;
    this.flash = 0.18;
    return { drops: this.data.resourceDrops, node: this };
  }

  update(delta) {
    this.flash = Math.max(0, this.flash - delta);
  }

  draw(ctx, camera, time) {
    if (!this.active) return;
    const x = this.x - camera.x;
    const baseY = this.y;
    ctx.save();
    if (this.flash > 0) ctx.filter = 'brightness(1.45)';
    ctx.strokeStyle = '#102033';
    ctx.lineWidth = 4;
    if (this.data.type === 'tree') {
      ctx.fillStyle = this.data.visualStyle?.trunk || '#8a5630';
      ctx.beginPath();
      ctx.roundRect(x + 24, baseY - 92, 22, 92, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = this.data.visualStyle?.crown || '#57c77c';
      ctx.beginPath();
      ctx.ellipse(x + 35, baseY - 112 + Math.sin(time * 2 + this.x) * 2, 44, 34, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (this.data.type === 'plant') {
      ctx.fillStyle = this.data.visualStyle?.leaf || '#57c77c';
      ctx.beginPath();
      ctx.ellipse(x + 32, baseY - 18, 34, 20, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = this.data.visualStyle?.fruit || '#76f3ff';
      ctx.beginPath();
      ctx.arc(x + 22, baseY - 26, 6, 0, Math.PI * 2);
      ctx.arc(x + 42, baseY - 28, 6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = this.data.visualStyle?.rock || '#55606d';
      ctx.beginPath();
      ctx.moveTo(x + 4, baseY - 6);
      ctx.lineTo(x + 22, baseY - 58);
      ctx.lineTo(x + 62, baseY - 52);
      ctx.lineTo(x + 76, baseY - 10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = this.data.visualStyle?.accent || '#8ee8ff';
      ctx.beginPath();
      ctx.arc(x + 45, baseY - 34, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
