export class IslandAnimal {
  constructor({ data, x, y }) {
    this.data = data;
    this.id = `${data.id}-${x}`;
    this.x = x;
    this.y = y;
    this.width = 46;
    this.height = 34;
    this.vx = (Math.random() > 0.5 ? 1 : -1) * data.speed * 0.35;
    this.maxHealth = data.health || 2;
    this.health = this.maxHealth;
    this.active = true;
    this.flash = 0;
    this.attackCooldown = 0;
    this.wanderTimer = 0.8 + Math.random();
  }

  get centerX() {
    return this.x + this.width / 2;
  }

  get centerY() {
    return this.y - this.height / 2;
  }

  update(delta, player, world) {
    if (!this.active) return;
    this.flash = Math.max(0, this.flash - delta);
    this.attackCooldown = Math.max(0, this.attackCooldown - delta);
    const dx = player.centerX - this.centerX;
    const chase = this.data.behavior === 'aggressive' && Math.abs(dx) < 260;
    if (chase) {
      this.vx += Math.sign(dx || 1) * this.data.speed * delta * 3;
    } else {
      this.wanderTimer -= delta;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 0.8 + Math.random() * 1.6;
        this.vx = (Math.random() > 0.5 ? 1 : -1) * this.data.speed * 0.42;
      }
    }
    this.vx = Math.max(-this.data.speed, Math.min(this.data.speed, this.vx));
    this.x += this.vx * delta;
    if (this.x < 80 || this.x > world.width - 100) {
      this.vx *= -1;
      this.x = Math.max(80, Math.min(world.width - 100, this.x));
    }
  }

  overlaps(player) {
    return player.bounds.right > this.x
      && player.bounds.left < this.x + this.width
      && player.bounds.bottom > this.y - this.height
      && player.bounds.top < this.y;
  }

  hit() {
    if (!this.active) return null;
    this.health -= 1;
    this.flash = 0.16;
    if (this.health > 0) return null;
    this.active = false;
    return { drops: this.data.drops, animal: this };
  }

  draw(ctx, camera, time) {
    if (!this.active) return;
    const x = this.x - camera.x;
    const y = this.y - this.height;
    const bob = Math.sin(time * 5 + this.x) * 3;
    ctx.save();
    if (this.flash > 0) ctx.filter = 'brightness(1.6)';
    ctx.fillStyle = this.data.color || '#76f3ff';
    ctx.strokeStyle = '#102033';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(x, y + bob, this.width, this.height, 16);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff2cf';
    ctx.beginPath();
    ctx.arc(x + (this.vx >= 0 ? 32 : 14), y + 12 + bob, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#102033';
    ctx.beginPath();
    ctx.arc(x + (this.vx >= 0 ? 33 : 13), y + 12 + bob, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
