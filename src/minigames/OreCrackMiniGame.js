export class OreCrackMiniGame {
  constructor({ game, item, difficulty = 1 }) {
    this.game = game;
    this.item = item;
    this.difficulty = difficulty;
    this.name = 'Ore Cracking';
    this.instructions = 'Tap the glowing weak points before the ore cools.';
    this.duration = Math.max(6, 10 - difficulty * 0.5);
    this.timer = this.duration;
    this.weakPoints = this.createWeakPoints();
    this.hits = 0;
    this.wrongHits = 0;
    this.particles = [];
    this.complete = false;
  }

  createWeakPoints() {
    const count = Math.max(3, Math.min(6, 3 + this.difficulty));
    return Array.from({ length: count }, (_, index) => {
      const angle = (Math.PI * 2 * index) / count + 0.4;
      const distance = 0.16 + (index % 3) * 0.09;
      return {
        x: 0.5 + Math.cos(angle) * distance,
        y: 0.52 + Math.sin(angle) * distance * 0.72,
        radius: 20,
        hit: false,
        pulse: index * 0.7,
      };
    });
  }

  update(delta, input, bounds) {
    if (this.complete) return;
    this.timer = Math.max(0, this.timer - delta);
    this.particles.forEach((particle) => {
      particle.age += delta;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
    });
    this.particles = this.particles.filter((particle) => particle.age < 0.45);

    input.consumePointerDowns({ source: 'canvas' }).forEach((pointer) => this.handleTap(pointer, bounds));
    if (this.timer <= 0 || this.weakPoints.every((point) => point.hit)) this.complete = true;
  }

  handleTap(pointer, bounds) {
    const hitPoint = this.weakPoints.find((point) => {
      if (point.hit) return false;
      const px = bounds.x + point.x * bounds.width;
      const py = bounds.y + point.y * bounds.height;
      return Math.hypot(pointer.canvasX - px, pointer.canvasY - py) < point.radius + 12;
    });

    if (hitPoint) {
      hitPoint.hit = true;
      this.hits += 1;
      this.spawnCrackParticles(bounds.x + hitPoint.x * bounds.width, bounds.y + hitPoint.y * bounds.height, '#ffd36b');
      this.game.audio.playRockCrack();
    } else if (this.isInsideBounds(pointer, bounds)) {
      this.wrongHits += 1;
      this.spawnCrackParticles(pointer.canvasX, pointer.canvasY, '#ff756f');
      this.game.audio.playRockTap();
    }
  }

  isInsideBounds(pointer, bounds) {
    return pointer.canvasX >= bounds.x
      && pointer.canvasX <= bounds.x + bounds.width
      && pointer.canvasY >= bounds.y
      && pointer.canvasY <= bounds.y + bounds.height;
  }

  spawnCrackParticles(x, y, color) {
    for (let i = 0; i < 9; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * (40 + Math.random() * 90),
        vy: Math.sin(angle) * (40 + Math.random() * 90),
        color,
        age: 0,
      });
    }
  }

  draw(ctx, bounds, time) {
    const rockX = bounds.x + bounds.width * 0.5;
    const rockY = bounds.y + bounds.height * 0.54;
    const rockRadius = Math.min(bounds.width, bounds.height) * 0.26;

    ctx.save();
    ctx.fillStyle = '#775f55';
    ctx.strokeStyle = '#081626';
    ctx.lineWidth = 6;
    ctx.beginPath();
    for (let i = 0; i < 12; i += 1) {
      const angle = (Math.PI * 2 * i) / 12;
      const radius = rockRadius * (0.82 + (i % 4) * 0.05);
      const x = rockX + Math.cos(angle) * radius;
      const y = rockY + Math.sin(angle) * radius * 0.78;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    this.weakPoints.forEach((point) => {
      const x = bounds.x + point.x * bounds.width;
      const y = bounds.y + point.y * bounds.height;
      if (point.hit) {
        ctx.strokeStyle = '#081626';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x - 28, y);
        ctx.lineTo(x + 24, y + 15);
        ctx.moveTo(x - 6, y - 24);
        ctx.lineTo(x + 10, y + 24);
        ctx.stroke();
        return;
      }
      const pulse = 1 + Math.sin(time * 5 + point.pulse) * 0.12;
      ctx.fillStyle = '#ffd36b';
      ctx.shadowColor = '#ff8f3d';
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(x, y, point.radius * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#081626';
      ctx.lineWidth = 3;
      ctx.stroke();
    });

    this.particles.forEach((particle) => {
      ctx.globalAlpha = 1 - particle.age / 0.45;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    this.drawTimer(ctx, bounds);
    ctx.restore();
  }

  drawTimer(ctx, bounds) {
    const percent = this.timer / this.duration;
    ctx.fillStyle = '#081626';
    ctx.fillRect(bounds.x + 24, bounds.y + bounds.height - 28, bounds.width - 48, 12);
    ctx.fillStyle = percent > 0.28 ? '#ffd36b' : '#ff756f';
    ctx.fillRect(bounds.x + 24, bounds.y + bounds.height - 28, (bounds.width - 48) * percent, 12);
  }

  getResult() {
    const accuracy = this.hits / this.weakPoints.length;
    const speedBonus = this.timer / this.duration;
    const penalty = this.wrongHits * 8;
    const score = Math.max(0, Math.min(100, accuracy * 78 + speedBonus * 22 - penalty));
    return {
      id: 'oreCracking',
      name: this.name,
      score: Math.round(score),
      stats: { hits: this.hits, total: this.weakPoints.length, wrongHits: this.wrongHits },
    };
  }
}
