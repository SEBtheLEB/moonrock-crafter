const WIDTH = 34;
const HEIGHT = 58;

export class IslandPlayer {
  constructor({ x = 170, y = 0 } = {}) {
    this.x = x;
    this.y = y;
    this.previousY = y;
    this.width = WIDTH;
    this.height = HEIGHT;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
    this.onGround = false;
    this.health = 100;
    this.maxHealth = 100;
    this.hitCooldown = 0;
    this.step = 0;
  }

  get centerX() {
    return this.x + this.width / 2;
  }

  get centerY() {
    return this.y + this.height / 2;
  }

  get bounds() {
    return {
      left: this.x,
      right: this.x + this.width,
      top: this.y,
      bottom: this.y + this.height,
    };
  }

  update(delta, input, world) {
    const dt = Math.min(delta, 0.05);
    this.previousY = this.y;
    this.hitCooldown = Math.max(0, this.hitCooldown - dt);
    const moveX = Math.max(-1, Math.min(1, input.moveX || 0));
    if (Math.abs(moveX) > 0.05) {
      this.vx += (moveX * 235 - this.vx) * Math.min(1, dt * 14);
      this.facing = moveX > 0 ? 1 : -1;
      this.step += dt * 8;
    } else {
      this.vx *= Math.max(0, 1 - dt * 13);
      if (Math.abs(this.vx) < 1) this.vx = 0;
    }
    if (input.jumpPressed && this.onGround) {
      this.vy = -590;
      this.onGround = false;
    }
    this.vy += 1560 * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.resolve(world);
  }

  resolve(world) {
    this.x = Math.max(24, Math.min(world.width - this.width - 24, this.x));
    this.onGround = false;
    if (this.y + this.height >= world.floorY) {
      this.y = world.floorY - this.height;
      this.vy = 0;
      this.onGround = true;
    }
  }

  damage(amount, sourceX = this.centerX) {
    if (this.hitCooldown > 0) return false;
    this.health = Math.max(0, this.health - amount);
    this.hitCooldown = 0.8;
    this.vx += this.centerX < sourceX ? -190 : 190;
    this.vy = Math.min(this.vy, -180);
    return true;
  }

  draw(ctx, camera, time) {
    const x = this.x - camera.x;
    const y = this.y;
    const bob = this.onGround ? Math.sin(this.step) * Math.min(3, Math.abs(this.vx) / 70) : 0;
    ctx.save();
    ctx.translate(x + this.width / 2, y + bob + this.height / 2);
    if (this.hitCooldown > 0 && Math.sin(time * 32) > 0) ctx.globalAlpha = 0.55;
    ctx.translate(-this.width / 2, -this.height / 2);

    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(this.width / 2, this.height + 5, 17, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();

    const bodyGradient = ctx.createLinearGradient(0, 6, 0, this.height - 4);
    bodyGradient.addColorStop(0, '#f1e6c8');
    bodyGradient.addColorStop(0.52, '#d9c79a');
    bodyGradient.addColorStop(1, '#b9915e');
    ctx.fillStyle = bodyGradient;
    ctx.strokeStyle = 'rgba(8, 17, 26, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(5, 8, 24, 45, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(217, 134, 66, 0.38)';
    ctx.beginPath();
    ctx.roundRect(8, 36, 18, 9, 5);
    ctx.fill();

    ctx.fillStyle = '#101923';
    ctx.beginPath();
    ctx.roundRect(8, 14, 18, 13, 7);
    ctx.fill();

    const visorGradient = ctx.createLinearGradient(8, 14, 26, 27);
    visorGradient.addColorStop(0, 'rgba(102, 216, 232, 0.9)');
    visorGradient.addColorStop(1, 'rgba(102, 216, 232, 0.28)');
    ctx.fillStyle = visorGradient;
    ctx.beginPath();
    ctx.roundRect(this.facing > 0 ? 15 : 8, 17, 9, 5, 3);
    ctx.fill();

    ctx.fillStyle = 'rgba(102, 216, 232, 0.5)';
    ctx.beginPath();
    ctx.arc(this.facing > 0 ? 7 : 27, 10, 2.6 + Math.sin(time * 2.8) * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
