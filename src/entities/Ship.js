export class Ship {
  constructor(stats = {}) {
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.angle = 0;
    this.sizeScale = stats.sizeScale || 1.22;
    this.radius = 30 * this.sizeScale;
    this.acceleration = 326 + (stats.acceleration || 1) * 36;
    this.drag = 0.34;
    this.activeControl = 2.9 + (stats.handling || 1) * 0.35;
    this.maxSpeed = 176 + (stats.speed || 1) * 21;
    this.turnSpeed = 9.5 + (stats.handling || 1) * 1.2;
    this.hitCooldown = 0;
    this.steerX = 0;
    this.steerY = 0;
    this.boostCarry = 0;
    this.lastBoostStrength = 0;
  }

  update(delta, input, fuelRatio = 1, { boost = false, boostPower = boost ? 1 : 0 } = {}) {
    const boostStrength = boost ? Math.max(0.1, boostPower || 1) : 0;
    if (boost) {
      this.boostCarry = 1;
      this.lastBoostStrength = boostStrength;
    } else {
      this.boostCarry = Math.max(0, this.boostCarry - delta / 1.65);
    }
    const rawMove = input.moveVector || { x: 0, y: 0 };
    const inputMode = input.inputMode
      || (typeof document !== 'undefined' ? document.documentElement.dataset.inputMode : 'keyboard')
      || 'keyboard';
    const keyboardMoveHeld = input.keys
      ? ['w', 'W', 'a', 'A', 's', 'S', 'd', 'D', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
        .some((key) => input.keys.has(key))
      : inputMode === 'keyboard';
    const hasKeyboardMove = keyboardMoveHeld && Math.hypot(rawMove.x, rawMove.y) > 0.05;
    const response = hasKeyboardMove ? 6.6 : 13.5;
    const releaseResponse = hasKeyboardMove ? 5.4 : 11;
    const blend = 1 - Math.exp(-delta * (Math.hypot(rawMove.x, rawMove.y) > 0.05 ? response : releaseResponse));
    this.steerX += (rawMove.x - this.steerX) * blend;
    this.steerY += (rawMove.y - this.steerY) * blend;

    const move = { x: this.steerX, y: this.steerY };
    let thrust = Math.hypot(move.x, move.y);
    const fuelFactor = fuelRatio > 0 ? 1 : 0.28;

    if (boost && thrust <= 0.05) thrust = 1;

    if (thrust > 0.05) {
      const moveLength = Math.hypot(move.x, move.y);
      const nx = moveLength > 0.05 ? move.x / moveLength : Math.cos(this.angle);
      const ny = moveLength > 0.05 ? move.y / moveLength : Math.sin(this.angle);
      const boostAcceleration = 1 + boostStrength;
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

    const carryEase = this.boostCarry * this.boostCarry * (3 - 2 * this.boostCarry);
    const dragScale = boost ? 0.72 : (carryEase > 0 ? 0.54 : 1);
    this.vx *= Math.max(0, 1 - this.drag * dragScale * delta);
    this.vy *= Math.max(0, 1 - this.drag * dragScale * delta);

    const speed = Math.hypot(this.vx, this.vy);
    const carriedBoostStrength = boostStrength || this.lastBoostStrength * carryEase;
    const maxSpeed = this.maxSpeed * fuelFactor * (1 + carriedBoostStrength * 1.4);
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
