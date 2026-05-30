export const gpsUnlockCost = {
  credits: 250,
  materials: {
    copperShards: 3,
    ironDust: 2,
  },
};

export const scannerUpgrades = [
  {
    level: 1,
    name: 'Basic GPS',
    description: 'Tracks the station and discovered locations.',
    cost: gpsUnlockCost,
    unlocks: ['Station beacon', 'Known location tracking'],
  },
  {
    level: 2,
    name: 'Resource Sweep',
    description: 'Finds nearby common ore clusters.',
    cost: { credits: 120, materials: { copperShards: 2 } },
    unlocks: ['Iron Dust search', 'Copper Shards search', 'Stone Ore search'],
  },
  {
    level: 3,
    name: 'Island Finder',
    description: 'Highlights nearby islands and uncommon resource drifts.',
    cost: { credits: 190, materials: { glassCrystal: 1, sap: 1 } },
    unlocks: ['Island search', 'Glass Crystal search'],
  },
  {
    level: 4,
    name: 'Deep Signal Scanner',
    description: 'Finds rare resources, wrecks, and relic traces.',
    cost: { credits: 320, materials: { moonsteel: 1, ancientFragment: 1 } },
    unlocks: ['Wreck signals', 'Rare resource echoes'],
  },
  {
    level: 5,
    name: 'Advanced Star Map',
    description: 'Unlocks hidden filters and story signal triangulation.',
    cost: { credits: 520, researchPoints: 5, materials: { voidQuartz: 1 } },
    unlocks: ['Hidden signals', 'Advanced filters'],
  },
];
