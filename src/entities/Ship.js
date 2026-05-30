export class Ship {
  constructor(stats = {}) {
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.angle = 0;
    this.radius = 22;
    this.acceleration = 326 + (stats.acceleration || 1) * 36;
    this.drag = 0.68;
    this.activeControl = 2.9 + (stats.handling || 1) * 0.35;
    this.maxSpeed = 176 + (stats.speed || 1) * 21;
    this.turnSpeed = 9.5 + (stats.handling || 1) * 1.2;
    this.hitCooldown = 0;
  }

  update(delta, input, fuelRatio = 1) {
    const move = input.moveVector;
    const thrust = Math.hypot(move.x, move.y);
    const fuelFactor = fuelRatio > 0 ? 1 : 0.28;

    if (thrust > 0.05) {
      const moveLength = Math.hypot(move.x, move.y) || 1;
      const nx = move.x / moveLength;
      const ny = move.y / moveLength;
      this.vx += nx * this.acceleration * fuelFactor * delta;
      this.vy += ny * this.acceleration * fuelFactor * delta;
      const along = this.vx * nx + this.vy * ny;
      const lateralX = this.vx - nx * along;
      const lateralY = this.vy - ny * along;
      const lateralCorrection = Math.min(1, this.activeControl * delta);
      this.vx -= lateralX * lateralCorrection;
      this.vy -= lateralY * lateralCorrection;
      const targetAngle = Math.atan2(ny, nx);
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
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = '#d98642';
      ctx.shadowColor = '#d98642';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(-25, 0);
      ctx.lineTo(-45 - Math.random() * 5, -7);
      ctx.lineTo(-37, 0);
      ctx.lineTo(-45 - Math.random() * 5, 7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.fillStyle = flashing ? '#ece7d8' : '#dce6ec';
    ctx.strokeStyle = 'rgba(8, 17, 26, 0.62)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(30, 0);
    ctx.lineTo(-20, -18);
    ctx.lineTo(-9, 0);
    ctx.lineTo(-20, 18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(102, 216, 232, 0.82)';
    ctx.strokeStyle = 'rgba(8, 17, 26, 0.42)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(6, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#d98642';
    ctx.fillRect(-32, -7, 11, 14);
    ctx.restore();
  }
}
