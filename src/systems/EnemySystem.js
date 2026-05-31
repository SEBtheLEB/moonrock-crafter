import { enemies, enemySpawnProfiles } from '../data/enemies.js?v=112';
import { AlienGoo } from '../entities/enemies/AlienGoo.js?v=112';
import { GooSpitter } from '../entities/enemies/GooSpitter.js?v=112';
import { BurrowWorm } from '../entities/enemies/BurrowWorm.js?v=112';

const TAU = Math.PI * 2;

function hashString(value = '') {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRandom(seedValue) {
  let seed = seedValue >>> 0;
  return () => {
    seed += 0x6D2B79F5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export class EnemySystem {
  constructor(scene) {
    this.scene = scene;
    this.activeIslandId = '';
    this.enemies = [];
  }

  clear() {
    this.activeIslandId = '';
    this.enemies.length = 0;
  }

  setActiveIsland(island) {
    if (!island) {
      this.clear();
      return;
    }
    if (this.activeIslandId === island.id) return;
    this.activeIslandId = island.id;
    this.enemies = this.createEnemiesForIsland(island);
  }

  createEnemiesForIsland(island) {
    const profile = enemySpawnProfiles[island.id] || enemySpawnProfiles[island.biome] || enemySpawnProfiles.scrap;
    const random = createRandom(hashString(`enemies:${island.id}:${island.biome}`));
    const items = [];
    Object.entries(profile).forEach(([enemyId, count]) => {
      const data = enemies[enemyId];
      if (!data) return;
      const cappedCount = Math.min(count, data.maxPerIsland || count);
      for (let index = 0; index < cappedCount; index += 1) {
        const safeGap = TAU / Math.max(1, cappedCount + 1);
        const baseAngle = -Math.PI / 2 + safeGap * (index + 1);
        const angle = baseAngle + (random() - 0.5) * 0.55 + (enemyId === 'gooSpitter' ? Math.PI * 0.72 : 0);
        items.push(this.createEnemy(enemyId, island, angle, random));
      }
    });
    return items.filter(Boolean);
  }

  createEnemy(enemyId, island, angle, random = Math.random) {
    const data = enemies[enemyId];
    if (!data) return null;
    const options = {
      data,
      island,
      angle,
      seed: hashString(`${island.id}:${enemyId}:${Math.round(angle * 1000)}:${Math.round(random() * 100000)}`),
    };
    if (data.type === 'worm') return new BurrowWorm(options);
    if (data.type === 'spitter') return new GooSpitter(options);
    return new AlienGoo(options);
  }

  update(delta, { island, player, viewRotation = 0, toWorld, onPlayerDamage } = {}) {
    if (!island || !player) return;
    this.setActiveIsland(island);
    const converter = toWorld || ((x, y) => island.localToWorldRotated(x, y, viewRotation));
    for (const enemy of this.enemies) {
      enemy.update(delta, {
        island,
        player,
        viewRotation,
        toWorld: converter,
        onPlayerDamage,
      });
    }
    this.enemies = this.enemies.filter((enemy) => enemy.isActive());
  }

  syncWorldPositions(island, viewRotation = 0, toWorld = null) {
    if (!island) return;
    const converter = toWorld || ((x, y) => island.localToWorldRotated(x, y, viewRotation));
    for (const enemy of this.enemies) {
      enemy.updateWorldPosition({ toWorld: converter });
    }
  }

  getThreats() {
    return this.enemies.filter((enemy) => (enemy.isTargetable ? enemy.isTargetable() : enemy.isActive()));
  }

  getDrawableEnemies() {
    return this.enemies.filter((enemy) => enemy.isActive());
  }
}
