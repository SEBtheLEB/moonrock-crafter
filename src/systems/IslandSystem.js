import { islands } from '../data/islands.js?v=115';
import { TerrainGrid } from './TerrainGrid.js?v=115';
import { gameBalance } from '../data/gameBalance.js?v=115';

const ISLAND_LAYOUT_VERSION = 7;
const PLANET_TAG_PREFIX = 'P';

export class IslandSystem {
  constructor(game) {
    this.game = game;
    this.islands = this.ensureIslandLayout();
  }

  getAllIslands() {
    return this.islands;
  }

  getIsland(id) {
    return this.islands.find((island) => island.id === id) || this.islands[0];
  }

  getIslandByTag(tagOrId) {
    const normalized = this.normalizePlanetTag(tagOrId);
    return this.islands.find((island) => (
      island.id === tagOrId
      || this.normalizePlanetTag(island.tag || island.planetTag) === normalized
    )) || null;
  }

  getPlanetTag(islandOrId) {
    const island = typeof islandOrId === 'string' ? this.getIslandByTag(islandOrId) || this.getIsland(islandOrId) : islandOrId;
    return island?.tag || island?.planetTag || '';
  }

  createRuntime() {
    return { nodes: [], animals: [] };
  }

  createTerrain(island, world) {
    return TerrainGrid.createForIsland(island, world, this.getSavedTerrain(island.id));
  }

  getSavedTerrain(islandId) {
    return this.game.state.islands?.terrain?.[islandId] || null;
  }

  getSavedFlags(islandId) {
    const flags = this.game.state.islands?.flags?.[islandId];
    return Array.isArray(flags) ? flags : [];
  }

  getSavedTorches(islandId) {
    const torches = this.game.state.islands?.torches?.[islandId];
    return Array.isArray(torches) ? torches : [];
  }

  getSavedShipAnchor(islandId) {
    return this.game.state.islands?.shipAnchors?.[islandId] || null;
  }

  saveFlags(islandId, flags = []) {
    this.game.state.islands ||= { visited: {} };
    this.game.state.islands.flags ||= {};
    this.game.state.islands.flags[islandId] = flags
      .filter(Boolean)
      .map((flag) => (typeof flag.serialize === 'function' ? flag.serialize() : flag));
    this.game.saveGame();
  }

  saveTorches(islandId, torches = []) {
    this.game.state.islands ||= { visited: {} };
    this.game.state.islands.torches ||= {};
    this.game.state.islands.torches[islandId] = torches
      .filter(Boolean)
      .map((torch) => (typeof torch.serialize === 'function' ? torch.serialize() : torch));
    this.game.saveGame();
  }

  saveShipAnchor(islandId, anchor = null, { skipSave = false } = {}) {
    if (!islandId) return;
    this.game.state.islands ||= { visited: {} };
    this.game.state.islands.shipAnchors ||= {};
    if (!anchor) delete this.game.state.islands.shipAnchors[islandId];
    else {
      this.game.state.islands.shipAnchors[islandId] = {
        landingAngle: Number(anchor.landingAngle) || 0,
        landingSurfaceLocal: anchor.landingSurfaceLocal
          ? {
            x: Math.round(anchor.landingSurfaceLocal.x * 10) / 10,
            y: Math.round(anchor.landingSurfaceLocal.y * 10) / 10,
          }
          : null,
      };
    }
    if (!skipSave) this.game.saveGame();
  }

  saveTerrain(islandId, terrain) {
    if (!terrain) return;
    this.game.state.islands ||= { visited: {} };
    this.game.state.islands.terrain ||= {};
    this.game.state.islands.terrain[islandId] = terrain.serialize();
    this.game.saveGame();
  }

  ensureIslandLayout() {
    this.game.state.islands ||= { visited: {}, terrain: {} };
    if (
      this.game.state.islands.layoutVersion === ISLAND_LAYOUT_VERSION
      && Array.isArray(this.game.state.islands.layout)
      && this.game.state.islands.layout.length
    ) {
      const layout = this.game.state.islands.layout;
      if (this.assignPlanetTags(layout)) this.game.saveGame();
      return layout;
    }
    this.game.state.islands.terrain = {};
    this.game.state.islands.flags = {};
    this.game.state.islands.torches = {};
    this.game.state.islands.shipAnchors = {};
    const layout = this.createProceduralPois();
    this.assignPlanetTags(layout);
    this.game.state.islands.layout = layout;
    this.game.state.islands.layoutVersion = ISLAND_LAYOUT_VERSION;
    return layout;
  }

  formatPlanetTag(index) {
    return `${PLANET_TAG_PREFIX}${String(index + 1).padStart(2, '0')}`;
  }

  normalizePlanetTag(value = '') {
    const text = String(value || '').trim().toUpperCase();
    const match = text.match(/^P?(\d+)$/);
    if (!match) return text;
    return `${PLANET_TAG_PREFIX}${String(Number(match[1])).padStart(2, '0')}`;
  }

  assignPlanetTags(layout = []) {
    const used = new Set();
    let changed = false;
    layout.forEach((island, index) => {
      if (!island) return;
      let tag = this.normalizePlanetTag(island.tag || island.planetTag);
      if (!/^P\d{2,}$/.test(tag) || used.has(tag)) {
        tag = this.formatPlanetTag(index);
        while (used.has(tag)) tag = this.formatPlanetTag(used.size);
      }
      used.add(tag);
      if (island.tag !== tag || island.planetTag !== tag) {
        island.tag = tag;
        island.planetTag = tag;
        changed = true;
      }
    });
    return changed;
  }

  regenerateIsland(tagOrId, { clearFlags = true, clearTorches = true } = {}) {
    const island = this.getIslandByTag(tagOrId);
    if (!island) return null;
    const terrainSeed = Math.floor(Date.now() % 1_000_000_000);
    island.terrainRevision = (island.terrainRevision || 0) + 1;
    island.terrainSeed = terrainSeed;
    this.game.state.islands ||= { visited: {}, terrain: {} };
    if (this.game.state.islands.terrain) delete this.game.state.islands.terrain[island.id];
    if (clearFlags && this.game.state.islands.flags) delete this.game.state.islands.flags[island.id];
    if (clearTorches && this.game.state.islands.torches) delete this.game.state.islands.torches[island.id];
    if (this.game.state.islands.shipAnchors) delete this.game.state.islands.shipAnchors[island.id];
    if (this.game.state.base?.islandId === island.id) {
      this.game.state.base = { established: false, islandId: null, flagId: null, local: null };
    }
    if (this.game.state.story?.starterPlanetId === island.id) {
      this.game.state.story.baseLab = null;
      this.game.state.story.craftingStationPlaced = false;
      this.game.state.story.craftingStation = null;
      this.game.state.story.researchStationPlaced = false;
      this.game.state.story.researchStation = null;
      this.game.systems.inventory?.add?.('craftingStationKit', 1, { skipSave: true });
      this.game.systems.inventory?.add?.('researchStationKit', 1, { skipSave: true });
    }
    this.game.saveGame();
    this.game.systems.navigation?.refreshLocations?.();
    return island;
  }

  createProceduralPois() {
    const types = [
      { type: 'smallAsteroid', name: 'Loose Ore Island', biome: 'scrap', layoutId: 'tinyScrap', size: { width: 1900, height: 1900 }, radius: 520, kind: 'loose' },
      { type: 'largeMineral', name: 'Mineral Shelf', biome: 'forest', layoutId: 'forestRock', size: { width: 2300, height: 2300 }, radius: 620, kind: 'loose' },
      { type: 'wreckage', name: 'Wreckage Island', biome: 'scrap', layoutId: 'tinyScrap', size: { width: 2150, height: 2150 }, radius: 580, kind: 'poi' },
      { type: 'crystalCluster', name: 'Crystal Drift Island', biome: 'crystal', layoutId: 'crystalIsland', size: { width: 2200, height: 2200 }, radius: 600, kind: 'poi' },
      { type: 'cave', name: 'Ember Cave Island', biome: 'ember', layoutId: 'emberIsland', size: { width: 2400, height: 2400 }, radius: 640, kind: 'poi' },
    ];
    const layoutSeed = this.game.state.islands.seed ?? Math.floor(Date.now() % 1_000_000_000);
    this.game.state.islands.seed = layoutSeed;
    const random = this.createSeededRandom(layoutSeed);
    const layout = [];
    const ringSize = gameBalance.mining?.ringSize || 20000;
    layout.push({
      id: 'crashPlanet',
      name: 'Menderfall',
      type: 'crashPlanet',
      biome: 'scrap',
      kind: 'story',
      worldPosition: this.positionInRing(random, 0, ringSize, 5200, Math.min(9800, ringSize - 7200), layout),
      size: { width: 3400, height: 3400 },
      discovered: true,
      dangerLevel: 1,
      landingZoneRadius: 720,
      baseCamp: true,
      resources: ['stoneOre', 'ironDust', 'copperShards', 'moonCrystal', 'crystallizedStone', 'redCrystal'],
      animals: [],
      layoutId: 'crashPlanet',
      requiredScannerLevel: 1,
      description: 'The chunky starter planet where the ship crashed. Stone, iron, copper, and sealed crystal rooms are buried under the surface.',
    });

    const starter = islands[0];
    layout.push({
      ...starter,
      kind: 'poi',
      size: { width: 2050, height: 2050 },
      worldPosition: this.positionInRing(random, 0, ringSize, 5600, ringSize - 5200, layout),
      landingZoneRadius: 560,
      discovered: true,
    });

    for (let ring = 0; ring < 5; ring += 1) {
      const count = ring === 0 ? 3 : 4;
      for (let index = 0; index < count; index += 1) {
        const type = types[(ring * 3 + index) % types.length];
        const id = `spaceIsland-r${ring}-${index}-${type.type}`;
        const min = ring === 0 ? 7600 : ring * ringSize + 5200;
        const max = ring === 0 ? ringSize - 3600 : (ring + 1) * ringSize - 5200;
        layout.push({
          id,
          name: `${type.name} ${ring + 1}-${index + 1}`,
          type: type.type,
          biome: type.biome,
          kind: index === 0 ? 'poi' : type.kind,
          worldPosition: this.positionInRing(random, ring, ringSize, min, max, layout),
          size: type.size,
          discovered: ring === 0 && index < 1,
          dangerLevel: Math.max(1, ring + 1),
          landingZoneRadius: type.radius,
          resources: [],
          animals: [],
          layoutId: type.layoutId,
          requiredScannerLevel: Math.max(1, Math.min(5, ring + 1)),
          description: `${type.kind === 'loose' ? 'A loose ore island' : 'A point of interest'} floating in ring ${ring + 1}.`,
        });
      }
    }
    return layout;
  }

  createSeededRandom(seedValue) {
    let seed = Math.floor(seedValue) >>> 0;
    return () => {
      seed += 0x6D2B79F5;
      let value = seed;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  positionInRing(random, ring, ringSize, minDistance, maxDistance, existing) {
    let best = null;
    const targetClearance = Math.max(6800, ringSize * 0.34);
    for (let attempt = 0; attempt < 96; attempt += 1) {
      const angle = random() * Math.PI * 2;
      const distance = minDistance + random() * Math.max(1, maxDistance - minDistance);
      const point = {
        x: Math.round(Math.cos(angle) * distance),
        y: Math.round(Math.sin(angle) * distance),
      };
      const clearance = existing.reduce((nearest, island) => {
        const dx = point.x - island.worldPosition.x;
        const dy = point.y - island.worldPosition.y;
        return Math.min(nearest, Math.hypot(dx, dy));
      }, Infinity);
      if (!best || clearance > best.clearance) best = { ...point, clearance };
      if (clearance > targetClearance) break;
    }
    return { x: best?.x || minDistance, y: best?.y || 0 };
  }

  addDropsToCargo(drops = {}, capacity, scene) {
    const collected = [];
    for (const [materialId, amount] of Object.entries(drops)) {
      const result = this.game.systems.inventory.addToRunCargo(materialId, amount, { capacity });
      if (!result.ok) {
        this.game.ui.showToast('Cargo Full', 'danger');
        this.game.audio.playCargoFull();
        return { ok: false, collected };
      }
      collected.push({ materialId, amount, result });
      this.game.systems.objectives.record('materialCollected', { materialId, amount });
      const material = this.game.systems.materials.getMaterial(materialId);
      scene?.addFloatingText?.(`+${amount} ${this.game.systems.materials.getDisplayName(materialId)}`, material?.color);
      this.game.audio.playIslandPickup?.();
    }
    return { ok: true, collected };
  }
}
