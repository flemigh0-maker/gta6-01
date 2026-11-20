// Neon Bay: a fictional coastal city, 3200x3200. Grid roads, blocks of buildings,
// two parks, a beach strip on the east edge, and named story locations.
import { makeRng, pick, range, rangeInt } from './rng.js';

export const WORLD = 3200;
export const ROAD_W = 96;
export const ROAD_LINES = [200, 600, 1000, 1400, 1800, 2200, 2600, 3000];

const BUILDING_COLORS = [
  '#3d4a6b', '#4a3d5e', '#5e3d4a', '#2f4a4a', '#54423a', '#46536e',
  '#6b4a3d', '#3a5e4a', '#5b5b6e', '#704a5e', '#3d5e6b', '#5e5e3d',
];
const ROOF_COLORS = ['#2a3350', '#332a44', '#44303a', '#243838', '#3d2f28'];

export function createCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const trees = [];
  const lamps = [];

  // Named districts, for flavour text on the HUD.
  const districts = [
    { name: 'Old Town', x0: 0, y0: 0, x1: 1000, y1: 1000 },
    { name: 'Downtown', x0: 1000, y0: 1000, x1: 2200, y1: 2200 },
    { name: 'Harbor South', x0: 0, y0: 2200, x1: 1800, y1: 3200 },
    { name: 'Warehouse Row', x0: 1800, y0: 2200, x1: 3000, y1: 3200 },
    { name: 'Palm Court', x0: 3000, y0: 0, x1: 3200, y1: 3200 },
  ];

  // Parks sit in two whole blocks; no buildings there, just trees and a pond.
  const parks = [
    { x0: 648, y0: 1048, x1: 952, y1: 1352, pond: { x: 800, y: 1200, r: 90 } },
    { x0: 2248, y0: 648, x1: 2552, y1: 952, pond: { x: 2400, y: 800, r: 70 } },
  ];

  function inPark(x, y) {
    return parks.some((p) => x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1);
  }

  // One building (or a pair) per block, inset from the roads.
  for (let ix = 0; ix < ROAD_LINES.length - 1; ix += 1) {
    for (let iy = 0; iy < ROAD_LINES.length - 1; iy += 1) {
      const x0 = ROAD_LINES[ix] + ROAD_W / 2 + 14;
      const x1 = ROAD_LINES[ix + 1] - ROAD_W / 2 - 14;
      const y0 = ROAD_LINES[iy] + ROAD_W / 2 + 14;
      const y1 = ROAD_LINES[iy + 1] - ROAD_W / 2 - 14;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      if (inPark(cx, cy)) {
        for (let t = 0; t < 14; t += 1) {
          trees.push({ x: range(rng, x0 + 20, x1 - 20), y: range(rng, y0 + 20, y1 - 20), r: range(rng, 10, 18) });
        }
        continue;
      }
      // Beach strip: the block east of the last road is sand, no buildings.
      if (ix === ROAD_LINES.length - 2 && ROAD_LINES[ix + 1] === 3000) {
        for (let t = 0; t < 8; t += 1) {
          trees.push({ x: range(rng, x0 + 10, x1 - 10), y: range(rng, y0 + 10, y1 - 10), r: range(rng, 9, 14), palm: true });
        }
        continue;
      }
      const downtown = cx > 1000 && cx < 2200 && cy > 1000 && cy < 2200;
      const count = rng() < 0.45 ? 2 : 1;
      for (let b = 0; b < count; b += 1) {
        const bw = count === 1 ? range(rng, 150, 240) : range(rng, 110, 160);
        const bh = count === 1 ? range(rng, 150, 240) : range(rng, 110, 160);
        const bx = count === 1 ? cx : (b === 0 ? x0 + bw / 2 + 8 : x1 - bw / 2 - 8);
        const by = count === 1 ? cy : (b === 0 ? y0 + bh / 2 + 8 : y1 - bh / 2 - 8);
        buildings.push({
          x: bx - bw / 2, y: by - bh / 2, w: bw, h: bh,
          color: pick(rng, BUILDING_COLORS),
          roof: pick(rng, ROOF_COLORS),
          hgt: downtown ? rangeInt(rng, 14, 34) : rangeInt(rng, 6, 16),
          windows: rangeInt(rng, 2, 5),
        });
      }
      if (rng() < 0.5) trees.push({ x: range(rng, x0 + 20, x1 - 20), y: range(rng, y0 + 20, y1 - 20), r: range(rng, 9, 15) });
    }
  }

  // Street lamps along the roads, for the night-time glow.
  for (const lx of ROAD_LINES) {
    for (let y = 120; y < WORLD; y += 400) lamps.push({ x: lx + ROAD_W / 2 - 6, y });
  }
  for (const ly of ROAD_LINES) {
    for (let x = 120; x < WORLD; x += 400) lamps.push({ x, y: ly + ROAD_W / 2 - 6 });
  }

  // Story locations (all on or beside roads so missions can reach them).
  const locations = {
    safehouse: { x: 420, y: 420, label: 'Jax\u2019s Safehouse' },
    chopshop: { x: 2580, y: 2580, label: 'Rico\u2019s Chop Shop' },
    bank: { x: 1600, y: 1420, label: 'Neon Bay Bank' },
    hospital: { x: 620, y: 2620, label: 'St. Mercy Hospital' },
    warehouse: { x: 2420, y: 2760, label: 'Warehouse 9' },
    marina: { x: 2980, y: 620, label: 'Palm Court Marina' },
    park: { x: 800, y: 1200, label: 'Crescent Park' },
    plaza: { x: 1600, y: 1600, label: 'Downtown Plaza' },
  };

  function isRoad(x, y) {
    for (const l of ROAD_LINES) {
      if (Math.abs(x - l) <= ROAD_W / 2 || Math.abs(y - l) <= ROAD_W / 2) return true;
    }
    return false;
  }

  function isBeach(x) { return x >= 3052; }

  function districtAt(x, y) {
    for (const d of districts) {
      if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d.name;
    }
    return 'Neon Bay';
  }

  // Axis-separated building collision: returns a corrected position for a circle of radius r.
  function collide(x, y, r, dx, dy) {
    let nx = x + dx;
    let ny = y + dy;
    for (const b of buildings) {
      if (nx + r > b.x && nx - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) {
        nx = dx > 0 ? b.x - r : dx < 0 ? b.x + b.w + r : nx;
      }
      if (x + r > b.x && x - r < b.x + b.w && ny + r > b.y && ny - r < b.y + b.h) {
        ny = dy > 0 ? b.y - r : dy < 0 ? b.y + b.h + r : ny;
      }
    }
    nx = Math.max(r, Math.min(WORLD - r, nx));
    ny = Math.max(r, Math.min(WORLD - r, ny));
    return { x: nx, y: ny };
  }

  function hitsBuilding(x, y, r) {
    for (const b of buildings) {
      if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
    }
    return null;
  }

  return {
    buildings, trees, lamps, parks, locations, districts,
    isRoad, isBeach, districtAt, collide, hitsBuilding,
  };
}
