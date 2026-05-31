export const MACHINE_SHAPE_STATES = [
  { id: 'full', label: 'Full Block' },
  { id: 'diagonalSlope', label: 'Diagonal Slope' },
  { id: 'invertedDiagonal', label: 'Inverted Cut' },
  { id: 'halfBlock', label: 'Half Block' },
  { id: 'quarterBlock', label: 'Quarter Block' },
  { id: 'roundedCorner', label: 'Rounded Corner' },
  { id: 'concaveCorner', label: 'Concave Corner' },
  { id: 'pipeCorner', label: 'Pipe Corner' },
  { id: 'cracked', label: 'Cracked Plate' },
  { id: 'boltedPlate', label: 'Bolted Plate' },
];

export const MACHINE_DETAIL_STATES = [
  { id: null, label: 'No Detail' },
  { id: 'bolts', label: 'Bolts' },
  { id: 'scratches', label: 'Scratches' },
  { id: 'warningStripes', label: 'Warning Stripes' },
  { id: 'glowingLines', label: 'Glowing Lines' },
  { id: 'pipe', label: 'Surface Pipe' },
  { id: 'handle', label: 'Handle' },
  { id: 'window', label: 'Small Window' },
  { id: 'rust', label: 'Rust Marks' },
  { id: 'heatBurn', label: 'Heat Burn' },
];

const NUMERIC_SHAPE_MAP = {
  0: 'full',
  1: 'diagonalSlope',
  2: 'invertedDiagonal',
  3: 'halfBlock',
  4: 'roundedCorner',
};

export function getShapeState(id = 'full') {
  if (Number.isFinite(id)) return NUMERIC_SHAPE_MAP[id] || 'full';
  return MACHINE_SHAPE_STATES.some((shape) => shape.id === id) ? id : 'full';
}

export function getShapeStateLabel(id = 'full') {
  return MACHINE_SHAPE_STATES.find((shape) => shape.id === getShapeState(id))?.label || 'Full Block';
}

export function getNextShapeState(id = 'full') {
  const current = getShapeState(id);
  const index = MACHINE_SHAPE_STATES.findIndex((shape) => shape.id === current);
  return MACHINE_SHAPE_STATES[(index + 1 + MACHINE_SHAPE_STATES.length) % MACHINE_SHAPE_STATES.length].id;
}

export function normalizeMachineVoxel(cell) {
  if (!cell) return null;
  if (typeof cell === 'string') {
    return {
      materialId: cell,
      layers: [cell],
      shapeState: 'full',
      detailId: null,
      moduleHint: null,
    };
  }
  const layers = Array.isArray(cell.layers)
    ? cell.layers.filter(Boolean)
    : (cell.materialId || cell.itemId ? [cell.materialId || cell.itemId] : []);
  if (!layers.length) return null;
  return {
    ...cell,
    materialId: cell.materialId || cell.itemId || layers[layers.length - 1],
    itemId: cell.itemId || cell.materialId || layers[layers.length - 1],
    layers,
    shapeState: getShapeState(cell.shapeState ?? cell.shape ?? 'full'),
    detailId: cell.detailId ?? null,
    moduleHint: cell.moduleHint ?? null,
  };
}

export function getCellLayers(cell) {
  return normalizeMachineVoxel(cell)?.layers || [];
}

export function getTopMaterialId(cell) {
  const layers = getCellLayers(cell);
  return layers[layers.length - 1] || null;
}

export function gridIndex(x, y, size) {
  return y * size + x;
}

export function isOccupied(grid = [], x, y, size) {
  if (x < 0 || x >= size || y < 0 || y >= size) return false;
  return getCellLayers(grid[gridIndex(x, y, size)]).length > 0;
}

export function getNeighbors(x, y, grid = [], size = 16) {
  const neighbor = (dx, dy) => {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= size || ny < 0 || ny >= size) return null;
    return normalizeMachineVoxel(grid[gridIndex(nx, ny, size)]);
  };
  return {
    n: neighbor(0, -1),
    e: neighbor(1, 0),
    s: neighbor(0, 1),
    w: neighbor(-1, 0),
    ne: neighbor(1, -1),
    se: neighbor(1, 1),
    sw: neighbor(-1, 1),
    nw: neighbor(-1, -1),
  };
}

export function getAutoShapeType(x, y, grid = [], size = 16) {
  const neighbors = getNeighbors(x, y, grid, size);
  const n = Boolean(neighbors.n);
  const e = Boolean(neighbors.e);
  const s = Boolean(neighbors.s);
  const w = Boolean(neighbors.w);
  const count = [n, e, s, w].filter(Boolean).length;
  if (count === 0) return 'standalone';
  if (count === 4) return 'interior';
  if (n && s && !e && !w) return 'verticalColumn';
  if (e && w && !n && !s) return 'horizontalBeam';
  if (count === 3) return 'tJunction';
  if (count === 2 && ((n && e) || (e && s) || (s && w) || (w && n))) return 'corner';
  if (count === 1) return 'cap';
  return 'edge';
}

export function getVoxelEntries(grid = [], size = 16) {
  const entries = [];
  for (let index = 0; index < grid.length; index += 1) {
    const voxel = normalizeMachineVoxel(grid[index]);
    if (!voxel) continue;
    const x = index % size;
    const y = Math.floor(index / size);
    entries.push({
      ...voxel,
      x,
      y,
      index,
      autoShapeType: getAutoShapeType(x, y, grid, size),
      neighbors: getNeighbors(x, y, grid, size),
    });
  }
  return entries;
}

export function isConnectedShape(grid = [], size = 16) {
  const entries = getVoxelEntries(grid, size);
  if (!entries.length) return false;
  const occupied = new Set(entries.map((entry) => `${entry.x},${entry.y}`));
  const queue = [entries[0]];
  const visited = new Set([`${entries[0].x},${entries[0].y}`]);
  while (queue.length) {
    const entry = queue.shift();
    [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].forEach(([dx, dy]) => {
      const key = `${entry.x + dx},${entry.y + dy}`;
      if (!occupied.has(key) || visited.has(key)) return;
      visited.add(key);
      queue.push({ x: entry.x + dx, y: entry.y + dy });
    });
  }
  return visited.size === occupied.size;
}

export function detectInternalChambers(grid = [], size = 16) {
  const outside = new Set();
  const queue = [];
  const addOutside = (x, y) => {
    if (x < 0 || x >= size || y < 0 || y >= size || isOccupied(grid, x, y, size)) return;
    const key = `${x},${y}`;
    if (outside.has(key)) return;
    outside.add(key);
    queue.push({ x, y });
  };
  for (let index = 0; index < size; index += 1) {
    addOutside(index, 0);
    addOutside(index, size - 1);
    addOutside(0, index);
    addOutside(size - 1, index);
  }
  while (queue.length) {
    const cell = queue.shift();
    addOutside(cell.x + 1, cell.y);
    addOutside(cell.x - 1, cell.y);
    addOutside(cell.x, cell.y + 1);
    addOutside(cell.x, cell.y - 1);
  }

  const chambers = [];
  const visited = new Set(outside);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const startKey = `${x},${y}`;
      if (visited.has(startKey) || isOccupied(grid, x, y, size)) continue;
      const cells = [];
      const chamberQueue = [{ x, y }];
      visited.add(startKey);
      while (chamberQueue.length) {
        const cell = chamberQueue.shift();
        cells.push(cell);
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].forEach(([dx, dy]) => {
          const nx = cell.x + dx;
          const ny = cell.y + dy;
          const key = `${nx},${ny}`;
          if (nx < 0 || nx >= size || ny < 0 || ny >= size || visited.has(key) || isOccupied(grid, nx, ny, size)) return;
          visited.add(key);
          chamberQueue.push({ x: nx, y: ny });
        });
      }
      const adjacentMaterials = new Set();
      let closedSides = 0;
      let sideCount = 0;
      cells.forEach((cell) => {
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].forEach(([dx, dy]) => {
          sideCount += 1;
          const nx = cell.x + dx;
          const ny = cell.y + dy;
          if (isOccupied(grid, nx, ny, size)) {
            closedSides += 1;
            getCellLayers(grid[gridIndex(nx, ny, size)]).forEach((materialId) => adjacentMaterials.add(materialId));
          }
        });
      });
      chambers.push({
        cells,
        adjacentMaterials,
        surroundedRatio: sideCount ? closedSides / sideCount : 0,
      });
    }
  }
  return chambers;
}

export function isCoreEmbedded(grid = [], size = 16, coreId = 'fireCore') {
  return getVoxelEntries(grid, size).some((entry) => {
    if (!entry.layers.includes(coreId)) return false;
    const sideNeighbors = ['n', 'e', 's', 'w'].filter((direction) => entry.neighbors[direction]).length;
    const onOuterFrame = entry.x === 0 || entry.y === 0 || entry.x === size - 1 || entry.y === size - 1;
    return sideNeighbors >= 3 && !onOuterFrame;
  });
}

export function doesCopperTouchChamber(grid = [], size = 16, chambers = detectInternalChambers(grid, size), copperId = 'copperShards') {
  return chambers.some((chamber) => chamber.cells.some((cell) => [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ].some(([dx, dy]) => getCellLayers(grid[gridIndex(cell.x + dx, cell.y + dy, size)]).includes(copperId))));
}

export function getMaterialBounds(grid = [], size = 16, itemId) {
  const cells = getVoxelEntries(grid, size).filter((entry) => entry.layers.includes(itemId));
  if (!cells.length) return null;
  const xs = cells.map((cell) => cell.x);
  const ys = cells.map((cell) => cell.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    width: Math.max(...xs) - Math.min(...xs) + 1,
    height: Math.max(...ys) - Math.min(...ys) + 1,
  };
}

export function validateRecipe(grid = [], recipe = {}, {
  getOwnedAmount = () => Infinity,
  getDisplayName = (id) => id,
} = {}) {
  const size = recipe.gridSize || Math.sqrt(grid.length) || 16;
  const usage = {};
  getVoxelEntries(grid, size).forEach((entry) => {
    entry.layers.forEach((materialId) => {
      usage[materialId] = (usage[materialId] || 0) + 1;
    });
  });

  const messages = [];
  let ok = true;
  Object.entries(recipe.requirements || {}).forEach(([itemId, needed]) => {
    const used = usage[itemId] || 0;
    const owned = getOwnedAmount(itemId);
    const met = used === needed && owned >= needed;
    if (!met) ok = false;
    const shortage = needed - used;
    messages.push({
      ok: met,
      text: shortage > 0
        ? `Needs ${shortage} more ${getDisplayName(itemId)}.`
        : `${getDisplayName(itemId)}: use exactly ${needed} (${used}/${needed}, owned ${owned}).`,
    });
  });

  const rules = recipe.shapeRules || {};
  const mustBeConnected = rules.mustBeConnected ?? rules.connected;
  if (mustBeConnected) {
    const connected = isConnectedShape(grid, size);
    if (!connected) ok = false;
    messages.push({ ok: connected, text: 'Machine body must be connected.' });
  }

  const chambers = detectInternalChambers(grid, size);
  if (rules.requiresInternalChamber) {
    const hasChamber = chambers.some((chamber) => chamber.cells.length >= (rules.minChamberCells || 2) && chamber.surroundedRatio >= 0.52);
    if (!hasChamber) ok = false;
    messages.push({ ok: hasChamber, text: `${recipe.name || 'Machine'} needs an internal chamber.` });
  }

  if (rules.coreMustBeEmbedded) {
    const embedded = isCoreEmbedded(grid, size, rules.coreMaterialId || 'fireCore');
    if (!embedded) ok = false;
    messages.push({ ok: embedded, text: 'Fire Core must be inside the machine body.' });
  }

  if (rules.copperShouldTouchChamber) {
    const copperTouches = doesCopperTouchChamber(grid, size, chambers, rules.copperMaterialId || 'copperShards');
    if (!copperTouches) ok = false;
    messages.push({ ok: copperTouches, text: 'Copper path should touch the furnace chamber.' });
  }

  Object.entries(rules.materialBounds || {}).forEach(([itemId, rule]) => {
    const bounds = getMaterialBounds(grid, size, itemId);
    const met = Boolean(bounds)
      && bounds.width <= rule.maxWidth
      && bounds.height <= rule.maxHeight;
    if (!met) ok = false;
    messages.push({ ok: met, text: rule.label || `${getDisplayName(itemId)} must fit in ${rule.maxWidth}x${rule.maxHeight}.` });
  });

  return { ok, messages, usage, chambers };
}
