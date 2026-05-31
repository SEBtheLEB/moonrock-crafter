export class Ship {
  constructor(stats = {}) {
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.angle = 0;
    this.sizeScale = stats.sizeScale || 1;
    this.radius = 22 * this.sizeScale;
    this.acceleration = 326 + (stats.acceleration || 1) * 36;
    this.drag = 0.68;
    this.activeControl = 2.9 + (stats.handling || 1) * 0.35;
    this.maxSpeed = 176 + (stats.speed || 1) * 21;
    this.turnSpeed = 9.5 + (stats.handling || 1) * 1.2;
    this.hitCooldown = 0;
  }

  update(delta, input, fuelRatio = 1, { boost = false } = {}) {
    const move = input.moveVector;
    let thrust = Math.hypot(move.x, move.y);
    const fuelFactor = fuelRatio > 0 ? 1 : 0.28;

    if (boost && thrust <= 0.05) thrust = 1;

    if (thrust > 0.05) {
      const moveLength = Math.hypot(move.x, move.y);
      const nx = moveLength > 0.05 ? move.x / moveLength : Math.cos(this.angle);
      const ny = moveLength > 0.05 ? move.y / moveLength : Math.sin(this.angle);
      const boostAcceleration = boost ? 4.2 : 1;
      this.vx += nx * this.acceleration * boostAcceleration * fuelFactor * delta;
      this.vy += ny * this.acceleration * boostAcceleration * fuelFactor * delta;
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
    const maxSpeed = this.maxSpeed * fuelFactor * (boost ? 5.4 : 1);
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

  isThrusting(input, { boost = false } = {}) {
    return boost || Math.hypot(input.moveVector.x, input.moveVector.y) > 0.08;
  }

  rotateToward(current, target, maxStep) {
    let delta = target - current;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const step = Math.max(-maxStep, Math.min(maxStep, delta));
    return current + step;
  }

  draw(ctx, camera, input, { boost = false } = {}) {
    const screen = camera.worldToScreen(this.x, this.y);
    this.drawAt(ctx, screen.x, screen.y, this.angle, input, { boost });
  }

  drawAt(ctx, x, y, angle = this.angle, input = { moveVector: { x: 0, y: 0 } }, { boost = false } = {}) {
    const flashing = this.hitCooldown > 0 && Math.floor(this.hitCooldown * 16) % 2 === 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(this.sizeScale, this.sizeScale);

    if (this.isThrusting(input, { boost })) {
      ctx.save();
      ctx.globalAlpha = boost ? 0.9 : 0.72;
      ctx.fillStyle = '#d98642';
      ctx.shadowColor = '#d98642';
      ctx.shadowBlur = boost ? 18 : 10;
      ctx.beginPath();
      ctx.moveTo(-25, 0);
      ctx.lineTo(-45 - Math.random() * (boost ? 18 : 5), boost ? -10 : -7);
      ctx.lineTo(-37, 0);
      ctx.lineTo(-45 - Math.random() * (boost ? 18 : 5), boost ? 10 : 7);
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
