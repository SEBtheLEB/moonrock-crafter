export class FurnaceMiniGame {
  constructor({ game, item, difficulty = 1 }) {
    this.game = game;
    this.item = item;
    this.difficulty = difficulty;
    this.name = 'Furnace Heating';
    this.instructions = 'Hold Heat to keep the marker in the perfect melt zone.';
    this.duration = 12;
    this.timer = this.duration;
    this.temperature = 34;
    this.progress = 0;
    this.stabilityScore = 0;
    this.samples = 0;
    this.impurity = 0;
    this.heatSoundTick = 0;
    this.perfectTickTimer = 0;
    this.complete = false;
    const furnaceAssist = game.state.crafting?.furnaceAssist || 0;
    this.zoneMin = 56 + difficulty - furnaceAssist * 2;
    this.zoneMax = 74 - difficulty * 0.5 + furnaceAssist * 2;
  }

  update(delta, input) {
    if (this.complete) return;
    const heating = input.actions.heat || input.actions.mine || input.actions.confirm || input.primaryPointer.down;
    this.timer = Math.max(0, this.timer - delta);
    this.temperature += (heating ? 43 : -26) * delta;
    this.temperature = Math.max(0, Math.min(110, this.temperature));
    const inPerfectZone = this.temperature >= this.zoneMin && this.temperature <= this.zoneMax;
    const inSafeZone = this.temperature >= this.zoneMin - 12 && this.temperature <= this.zoneMax + 12;

    if (inPerfectZone) this.progress += delta * (0.22 + this.difficulty * 0.015);
    else if (inSafeZone) this.progress += delta * 0.055;
    if (this.temperature > this.zoneMax + 13) this.impurity += delta * 9;
    if (this.temperature < this.zoneMin - 14) this.impurity += delta * 2.5;

    this.samples += 1;
    this.stabilityScore += inPerfectZone ? 1 : inSafeZone ? 0.45 : 0;

    this.perfectTickTimer -= delta;
    if (inPerfectZone && this.perfectTickTimer <= 0) {
      this.perfectTickTimer = 0.34;
      this.game.audio.playPerfectZoneTick();
    }

    this.heatSoundTick -= delta;
    if (heating && this.heatSoundTick <= 0) {
      this.heatSoundTick = this.temperature > this.zoneMax + 13 ? 0.28 : 0.42;
      if (this.temperature > this.zoneMax + 13) this.game.audio.playOverheatWarning();
      else this.game.audio.playHeatIncrease();
    }

    if (this.progress >= 1 || this.timer <= 0) this.complete = true;
  }

  draw(ctx, bounds, time) {
    const furnaceX = bounds.x + bounds.width * 0.5;
    const furnaceY = bounds.y + bounds.height * 0.55;
    const furnaceW = bounds.width * 0.44;
    const furnaceH = bounds.height * 0.48;
    const glow = 16 + this.temperature * 0.35 + Math.sin(time * 8) * 5;

    ctx.save();
    ctx.shadowColor = '#ff8f3d';
    ctx.shadowBlur = glow;
    this.roundRect(ctx, furnaceX - furnaceW / 2, furnaceY - furnaceH / 2, furnaceW, furnaceH, 22);
    ctx.fillStyle = '#3b2631';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#081626';
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#ff8f3d';
    ctx.beginPath();
    ctx.ellipse(furnaceX, furnaceY + 10, 58 + this.temperature * 0.18, 44 + this.temperature * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd36b';
    ctx.beginPath();
    ctx.ellipse(furnaceX, furnaceY + 16, 30 + this.temperature * 0.08, 24, 0, 0, Math.PI * 2);
    ctx.fill();

    this.drawGauge(ctx, bounds);
    this.drawProgress(ctx, bounds);
    ctx.restore();
  }

  drawGauge(ctx, bounds) {
    const x = bounds.x + bounds.width * 0.12;
    const y = bounds.y + bounds.height * 0.18;
    const w = bounds.width * 0.12;
    const h = bounds.height * 0.62;
    ctx.fillStyle = '#081626';
    this.roundRect(ctx, x, y, w, h, 12);
    ctx.fill();
    const zoneY = y + h * (1 - this.zoneMax / 110);
    const zoneH = h * ((this.zoneMax - this.zoneMin) / 110);
    ctx.fillStyle = '#8df0a4';
    ctx.fillRect(x + 8, zoneY, w - 16, zoneH);
    const markerY = y + h * (1 - this.temperature / 110);
    ctx.fillStyle = this.temperature > this.zoneMax + 13 ? '#ff756f' : '#ffd36b';
    ctx.fillRect(x - 8, markerY - 4, w + 16, 8);
  }

  drawProgress(ctx, bounds) {
    const x = bounds.x + bounds.width * 0.28;
    const y = bounds.y + bounds.height - 30;
    const w = bounds.width * 0.58;
    ctx.fillStyle = '#081626';
    ctx.fillRect(x, y, w, 12);
    ctx.fillStyle = '#8df0a4';
    ctx.fillRect(x, y, w * Math.min(1, this.progress), 12);
  }

  roundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }

  getResult() {
    const stability = this.samples ? this.stabilityScore / this.samples : 0;
    const completion = Math.min(1, this.progress);
    const impurityPenalty = Math.min(35, this.impurity);
    const score = Math.max(0, Math.min(100, completion * 45 + stability * 55 - impurityPenalty));
    return {
      id: 'furnaceHeating',
      name: this.name,
      score: Math.round(score),
      stats: { stability: Math.round(stability * 100), impurity: Math.round(this.impurity), completion: Math.round(completion * 100) },
    };
  }
}
