export class Ship {
  constructor(stats = {}) {
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.angle = 0;
    this.radius = 22;
    this.acceleration = 500 + (stats.acceleration || 1) * 48;
    this.drag = 0.9;
    this.maxSpeed = 250 + (stats.speed || 1) * 30;
    this.turnSpeed = 8 + (stats.handling || 1) * 1.1;
    this.hitCooldown = 0;
  }

  update(delta, input, fuelRatio = 1) {
    const move = input.moveVector;
    const thrust = Math.hypot(move.x, move.y);
    const fuelFactor = fuelRatio > 0 ? 1 : 0.28;

    if (thrust > 0.05) {
      this.vx += move.x * this.acceleration * fuelFactor * delta;
      this.vy += move.y * this.acceleration * fuelFactor * delta;
      const targetAngle = Math.atan2(move.y, move.x);
      this.angle = this.rotateToward(this.angle, targetAngle, this.turnSpeed * delta);
    } else if (Math.hypot(this.vx, this.vy) > 8) {
      const driftAngle = Math.atan2(this.vy, this.vx);
      this.angle = this.rotateToward(this.angle, driftAngle, this.turnSpeed * 0.35 * delta);
    }

    this.vx *= Math.max(0, 1 - this.drag * delta);
    this.vy *= Math.max(0, 1 - this.drag * delta);

    const speed = Math.hypot(this.vx, this.vy);
    const maxSpeed = this.maxSpeed * fuelFactor;
    if (speed > maxSpeed) {
      this.vx = (this.vx / speed) * maxSpeed;
      this.vy = (this.vy / speed) * maxSpeed;
    }

    this.x += this.vx * delta;
    this.y += this.vy * delta;
    this.hitCooldown = Math.max(0, this.hitCooldown - delta);
  }

  applyKnockback(fromX, fromY, force = 260) {
    const dx = this.x - fromX;
    const dy = this.y - fromY;
    const distance = Math.hypot(dx, dy) || 1;
    this.vx += (dx / distance) * force;
    this.vy += (dy / distance) * force;
    this.hitCooldown = 0.85;
  }

  isThrusting(input) {
    return Math.hypot(input.moveVector.x, input.moveVector.y) > 0.08;
  }

  rotateToward(current, target, maxStep) {
    let delta = target - current;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const step = Math.max(-maxStep, Math.min(maxStep, delta));
    return current + step;
  }

  draw(ctx, camera, input) {
    const screen = camera.worldToScreen(this.x, this.y);
    const flashing = this.hitCooldown > 0 && Math.floor(this.hitCooldown * 16) % 2 === 0;
    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.rotate(this.angle);

    if (this.isThrusting(input)) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#ff8f3d';
      ctx.shadowColor = '#ffd36b';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.moveTo(-28, 0);
      ctx.lineTo(-52 - Math.random() * 8, -10);
      ctx.lineTo(-42, 0);
      ctx.lineTo(-52 - Math.random() * 8, 10);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.fillStyle = flashing ? '#fff2cf' : '#d7f7ff';
    ctx.strokeStyle = '#081626';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(30, 0);
    ctx.lineTo(-20, -18);
    ctx.lineTo(-9, 0);
    ctx.lineTo(-20, 18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#76f3ff';
    ctx.strokeStyle = '#081626';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(6, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffb84d';
    ctx.fillRect(-32, -7, 11, 14);
    ctx.restore();
  }
}
