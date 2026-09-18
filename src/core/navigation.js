// Shared walkability service. Modules register obstacles through ctx.navigation;
// crowd never reads garden internals. The cached grid is rebuilt after edits.
const STEP = 0.2, LIMIT = 10.6, SIZE = Math.floor(LIMIT * 2 / STEP) + 1;
function pointIn(x, z, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
function nearEdge(x, z, polygon, clearance) {
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    if ((x - a.x - t * dx) ** 2 + (z - a.z - t * dz) ** 2 < clearance * clearance) return true;
  }
  return false;
}
export function createNavigation() {
  const obstacles = new Map(), destinations = new Map();
  let grid = null;
  function isWalkable(x, z) {
    if (!Number.isFinite(x + z) || Math.hypot(x, z) > LIMIT) return false;
    for (const list of obstacles.values()) for (const obstacle of list) {
      const { bounds } = obstacle;
      if (x < bounds.minX - 0.23 || x > bounds.maxX + 0.23 || z < bounds.minZ - 0.23 || z > bounds.maxZ + 0.23) continue;
      if (nearEdge(x, z, obstacle.contour, 0.23)) return false;
      if (pointIn(x, z, obstacle.contour) && !obstacle.holes.some(hole => pointIn(x, z, hole))) return false;
      for (const hole of obstacle.holes) if (nearEdge(x, z, hole, 0.23)) return false;
    }
    return true;
  }
  function segmentClear(ax, az, bx, bz) {
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.10));
    for (let i = 0; i <= steps; i++) if (!isWalkable(ax + (bx - ax) * i / steps, az + (bz - az) * i / steps)) return false;
    return true;
  }
  const point = index => ({ x: index % SIZE * STEP - LIMIT, z: Math.floor(index / SIZE) * STEP - LIMIT });
  function nearest(x, z, walkGrid = grid, clear = segmentClear) {
    const col = Math.round((x + LIMIT) / STEP), row = Math.round((z + LIMIT) / STEP);
    let best = -1, distance = Infinity;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const cx = col + dx, cy = row + dy, id = cy * SIZE + cx;
      if (cx < 0 || cy < 0 || cx >= SIZE || cy >= SIZE || !walkGrid[id]) continue;
      const p = point(id), d = Math.hypot(p.x - x, p.z - z);
      if (d < distance && clear(x, z, p.x, p.z)) { distance = d; best = id; }
    }
    return best;
  }
  return {
    register(owner, definitions, places = []) {
      const list = definitions.map(definition => {
        const contour = definition.contour.map(p => ({ x: p.x, z: p.z }));
        const holes = (definition.holes ?? []).map(hole => hole.map(p => ({ x: p.x, z: p.z })));
        return { contour, holes, bounds: { minX: Math.min(...contour.map(p => p.x)), maxX: Math.max(...contour.map(p => p.x)), minZ: Math.min(...contour.map(p => p.z)), maxZ: Math.max(...contour.map(p => p.z)) } };
      });
      obstacles.set(owner, list); destinations.set(owner, places.map(p => ({ x: p.x, z: p.z }))); grid = null;
      return () => { if (obstacles.get(owner) === list) { obstacles.delete(owner); destinations.delete(owner); grid = null; } };
    },
    isWalkable, segmentClear,
    getDestinations() { return [...destinations.values()].flat(); },
    findPath(start, end, avoid = []) {
      const crowded = (x,z) => avoid.some(p => Math.hypot(p.x-x,p.z-z) < 0.75);
      const clear = (ax,az,bx,bz) => {
        if (!segmentClear(ax,az,bx,bz)) return false;
        const dx=bx-ax,dz=bz-az;
        for(const p of avoid) {
          const t=Math.max(0,Math.min(1,((p.x-ax)*dx+(p.z-az)*dz)/(dx*dx+dz*dz||1)));
          if(Math.hypot(p.x-ax-t*dx,p.z-az-t*dz)<0.75)return false;
        }
        return true;
      };
      if (!isWalkable(start.x, start.z) || !isWalkable(end.x, end.z)) return null;
      if (clear(start.x, start.z, end.x, end.z)) return [{ x: end.x, z: end.z }];
      if (!grid) {
        grid = new Uint8Array(SIZE * SIZE);
        for (let i = 0; i < grid.length; i++) { const p = point(i); grid[i] = isWalkable(p.x, p.z) ? 1 : 0; }
      }
      const walkGrid = avoid.length ? grid.slice() : grid;
      if (avoid.length) for (let i=0;i<walkGrid.length;i++) { const p=point(i); if(crowded(p.x,p.z))walkGrid[i]=0; }
      const from = nearest(start.x, start.z, walkGrid, clear), goal = nearest(end.x, end.z, walkGrid, clear);
      if (from < 0 || goal < 0) return null;
      const parent = new Int32Array(grid.length).fill(-1), queue = new Int32Array(grid.length);
      queue[0] = from; parent[from] = from;
      let head = 0, tail = 1;
      while (head < tail && parent[goal] < 0) {
        const id = queue[head++], col = id % SIZE, row = Math.floor(id / SIZE);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const x = col + dx, z = row + dz, next = z * SIZE + x;
          if (x < 0 || z < 0 || x >= SIZE || z >= SIZE || !walkGrid[next] || parent[next] >= 0) continue;
          // Neighbour clearance avoids clipping corners of thin SVG beds.
          const a = point(id), b = point(next);
          if (!clear(a.x, a.z, b.x, b.z)) continue;
          parent[next] = id; queue[tail++] = next;
        }
      }
      if (parent[goal] < 0) return null;
      const route = [{ x: end.x, z: end.z }];
      for (let i = goal; i !== from; i = parent[i]) route.push(point(i));
      route.push(point(from)); route.reverse();
      const smooth = [];
      let current = start, index = 0;
      while (index < route.length) {
        let farthest = index;
        for (let i = index + 1; i < route.length; i++) {
          if (!clear(current.x, current.z, route[i].x, route[i].z)) break;
          farthest = i;
        }
        smooth.push(route[farthest]); current = route[farthest]; index = farthest + 1;
      }
      return smooth;
    },
  };
}
