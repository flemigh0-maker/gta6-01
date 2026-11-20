// Entities: the player, traffic cars, police, pedestrians, bullets and particles,
// plus the wanted-level system that ties crime to the police response.
import { angleLerp, clamp, dist, pick, range, rangeInt } from './rng.js';
import { ROAD_LINES, ROAD_W, WORLD } from './city.js';

export const CAR_COLORS = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6', '#e67e22', '#ecf0f1', '#1abc9c', '#fd79a8', '#636e72'];
export const PLAYER_COLOR = '#ffd319';
export const POLICE_COLOR = '#1e3799';

export function createPlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, speed: 0, health: 100, radius: 14,
    inCar: null, shootCd: 0, regenTimer: 0, invuln: 0, aimAngle: 0, moving: false,
  };
}

export function createCar(x, y, angle, color, kind) {
  return {
    x, y, angle, speed: 0, len: 46, wid: 22, color, kind: kind || 'traffic',
    // traffic AI state
    axis: 'h', road: 0, dir: 1, laneOff: 16, targetSpeed: rangeInt, cruise: 150,
    turnCd: 0, stuck: 0, dead: false, siren: 0,
  };
}

export function makeBullet(x, y, angle, from, dmg) {
  return { x, y, angle, speed: 900, life: 0.6, from, dmg: dmg || 34, dead: false };
}

export function makeParticle(x, y, vx, vy, life, color, size) {
  return { x, y, vx, vy, life, maxLife: life, color, size: size || 3 };
}

export function spawnTrafficCars(state, count) {
  const { rng, city } = state;
  for (let i = 0; i < count; i += 1) {
    const horizontal = rng() < 0.5;
    const road = pick(rng, ROAD_LINES);
    const along = range(rng, 100, WORLD - 100);
    const dir = rng() < 0.5 ? 1 : -1;
    const laneOff = dir === 1 ? 16 : -16;
    const car = createCar(
      horizontal ? along : road + laneOff,
      horizontal ? road + laneOff : along,
      horizontal ? (dir === 1 ? 0 : Math.PI) : (dir === 1 ? Math.PI / 2 : -Math.PI / 2),
      pick(rng, CAR_COLORS), 'traffic',
    );
    car.axis = horizontal ? 'h' : 'v';
    car.road = road;
    car.dir = dir;
    car.laneOff = laneOff;
    car.cruise = range(rng, 120, 190);
    car.speed = car.cruise;
    state.cars.push(car);
  }
}

export function spawnPeds(state, count) {
  const { rng } = state;
  for (let i = 0; i < count; i += 1) {
    const road = pick(rng, ROAD_LINES);
    const along = range(rng, 80, WORLD - 80);
    const side = rng() < 0.5 ? 1 : -1;
    const horizontal = rng() < 0.5;
    state.peds.push({
      x: horizontal ? along : road + side * (ROAD_W / 2 + 14),
      y: horizontal ? road + side * (ROAD_W / 2 + 14) : along,
      angle: rng() * Math.PI * 2, speed: range(rng, 35, 65),
      color: pick(rng, ['#ff7675', '#74b9ff', '#55efc4', '#fdcb6e', '#a29bfe', '#e17055', '#dfe6e9']),
      hp: 50, flee: 0, fleeX: 0, fleeY: 0, dead: false, kind: 'ped',
      walkPhase: rng() * Math.PI * 2, gang: false, cop: false, shootCd: range(rng, 0.5, 1.5),
    });
  }
}

export function spawnGang(state, x, y, count) {
  const { rng } = state;
  for (let i = 0; i < count; i += 1) {
    state.peds.push({
      x: x + range(rng, -90, 90), y: y + range(rng, -90, 90),
      angle: rng() * Math.PI * 2, speed: range(rng, 45, 70),
      color: '#c0392b', hp: 100, flee: 0, fleeX: 0, fleeY: 0, dead: false,
      kind: 'ped', walkPhase: 0, gang: true, cop: false, shootCd: range(rng, 0.3, 1.2),
    });
  }
}

export function spawnFootCop(state, x, y) {
  state.peds.push({
    x, y, angle: 0, speed: 95, color: '#1e3799', hp: 100,
    flee: 0, fleeX: 0, fleeY: 0, dead: false, kind: 'ped',
    walkPhase: 0, gang: false, cop: true, shootCd: 1,
  });
}

export function addWanted(state, n) {
  state.wanted = clamp(state.wanted + n, 0, 5);
  state.crimeTimer = 0;
  if (state.wanted >= 1) state.audio.startSiren();
}

function policeTargetCount(wanted) {
  return wanted <= 0 ? 0 : wanted <= 2 ? 1 : wanted === 3 ? 2 : wanted === 4 ? 3 : 4;
}

export function updateWanted(state, dt) {
  state.crimeTimer += dt;
  // Quiet for 25 seconds and the heat cools off (one star at a time, low levels only).
  if (state.wanted > 0 && state.crimeTimer > 25) {
    if (state.wanted <= 2) {
      state.wanted -= 1;
      state.crimeTimer = 0;
      if (state.wanted === 0) state.audio.stopSiren();
    } else {
      state.crimeTimer = 0;
    }
  }
  // Spawn / remove police cars to match the wanted level.
  const want = policeTargetCount(state.wanted);
  const cops = state.cars.filter((c) => c.kind === 'police' && !c.dead);
  if (cops.length < want) {
    const p = state.player;
    const road = pick(state.rng, ROAD_LINES);
    const ang = state.rng() * Math.PI * 2;
    const sx = clamp(p.x + Math.cos(ang) * range(state.rng, 500, 700), 60, WORLD - 60);
    const sy = clamp(p.y + Math.sin(ang) * range(state.rng, 500, 700), 60, WORLD - 60);
    const car = createCar(sx, sy, 0, POLICE_COLOR, 'police');
    car.cruise = 430;
    state.cars.push(car);
  } else if (cops.length > want) {
    cops[cops.length - 1].dead = true;
  }
  // Foot cops join the chase at 3 stars and up.
  const footCops = state.peds.filter((p) => p.cop && !p.dead);
  const wantFoot = state.wanted >= 3 ? Math.min(2, state.wanted - 2) : 0;
  if (footCops.length < wantFoot && state.player.inCar === null) {
    const a = state.rng() * Math.PI * 2;
    spawnFootCop(state,
      clamp(state.player.x + Math.cos(a) * 420, 40, WORLD - 40),
      clamp(state.player.y + Math.sin(a) * 420, 40, WORLD - 40));
  }
}

export function damagePlayer(state, n) {
  const p = state.player;
  if (p.invuln > 0) return;
  p.health -= n;
  p.regenTimer = 0;
  p.invuln = 0.35;
  state.audio.hit();
  if (p.health <= 0) {
    p.health = 0;
    state.over = 'busted';
  }
}

export function playerShoot(state) {
  const p = state.player;
  if (p.shootCd > 0 || p.inCar) return;
  p.shootCd = 0.22;
  const a = p.aimAngle;
  const bx = p.x + Math.cos(a) * 20;
  const by = p.y + Math.sin(a) * 20;
  state.bullets.push(makeBullet(bx, by, a, 'player', 34));
  state.particles.push(makeParticle(bx, by, Math.cos(a) * 60, Math.sin(a) * 60, 0.08, '#ffe066', 5));
  state.audio.shoot();
  // Shots are heard: witnesses call it in.
  addWanted(state, 0.4);
}

function enemyShootAt(state, from, tx, ty) {
  const a = Math.atan2(ty - from.y, tx - from.x) + range(state.rng, -0.12, 0.12);
  state.bullets.push(makeBullet(from.x, from.y, a, 'enemy', 9));
  state.audio.enemyShoot();
}

export function nearestCar(state, x, y, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const c of state.cars) {
    if (c.dead) continue;
    const d = dist(x, y, c.x, c.y);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

export function enterCar(state) {
  const p = state.player;
  if (p.inCar) return;
  const car = nearestCar(state, p.x, p.y, 78);
  if (!car) return;
  if (car.kind === 'traffic') {
    // Stealing a stranger's car is a crime — unless it is already yours (parked).
    if (!car.stolenByPlayer) {
      car.stolenByPlayer = true;
      addWanted(state, 1);
      state.toast('CAR STOLEN! +1 WANTED', 1.6);
      // The owner runs off.
      state.peds.push({
        x: car.x + 30, y: car.y + 30, angle: 0, speed: 120, color: '#dfe6e9',
        hp: 50, flee: 2, fleeX: car.x, fleeY: car.y, dead: false, kind: 'ped',
        walkPhase: 0, gang: false, cop: false, shootCd: 1,
      });
    }
  } else if (car.kind === 'police') {
    addWanted(state, 1);
    state.toast('YOU STOLE A POLICE CAR!', 1.8);
  }
  p.inCar = car;
  car.kind = 'player';
  state.audio.door();
  state.audio.startEngine(0);
}

export function exitCar(state) {
  const p = state.player;
  if (!p.inCar) return;
  const car = p.inCar;
  car.speed = 0;
  car.kind = car.stolenByPlayer || car.wasPolice ? 'traffic' : 'traffic';
  if (car.wasPolice) car.kind = 'police';
  p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
  p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
  p.inCar = null;
  state.audio.door();
  state.audio.stopEngine();
}

// --- per-frame updates -------------------------------------------------------

function driveCar(state, car, dt) {
  const city = state.city;
  const prevX = car.x;
  const prevY = car.y;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  if (city.hitsBuilding(car.x, car.y, 20)) {
    car.x = prevX;
    car.y = prevY;
    if (Math.abs(car.speed) > 180) {
      state.audio.crash();
      for (let i = 0; i < 8; i += 1) {
        state.particles.push(makeParticle(car.x, car.y, range(state.rng, -90, 90), range(state.rng, -90, 90), 0.5, '#ffb142', 3));
      }
      if (car.kind === 'player') damagePlayer(state, 6);
    }
    car.speed *= -0.35;
  }
  car.x = clamp(car.x, 30, WORLD - 30);
  car.y = clamp(car.y, 30, WORLD - 30);
}

export function updateCars(state, dt) {
  const p = state.player;
  for (const car of state.cars) {
    if (car.dead) continue;
    if (car.kind === 'player') {
      // Player driving: handled in main.js (input), physics applied here.
      driveCar(state, car, dt);
      continue;
    }
    if (car.kind === 'police') {
      // Pursuit: steer toward the player, faster than traffic.
      const target = p.inCar ? p.inCar : p;
      const wantAngle = Math.atan2(target.y - car.y, target.x - car.x);
      car.angle = angleLerp(car.angle, wantAngle, Math.min(1, dt * 3.2));
      const d = dist(car.x, car.y, target.x, target.y);
      car.speed = d > 90 ? Math.min(car.speed + 420 * dt, 445) : Math.max(car.speed - 300 * dt, 60);
      car.siren += dt;
      driveCar(state, car, dt);
      // Ram the player.
      if (d < 46) {
        if (p.inCar && Math.abs(car.speed) > 120) {
          damagePlayer(state, 5);
          car.speed *= 0.5;
          state.audio.crash();
        } else if (!p.inCar) {
          damagePlayer(state, 12);
          car.speed *= 0.4;
        }
      }
      continue;
    }
    // Traffic: cruise along its road; turn at intersections sometimes; brake for cars ahead.
    car.turnCd -= dt;
    let ahead = false;
    for (const other of state.cars) {
      if (other === car || other.dead) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const along = car.axis === 'h' ? dx * car.dir : dy * car.dir;
      const side = car.axis === 'h' ? Math.abs(dy) : Math.abs(dx);
      if (along > 0 && along < 64 && side < 30) { ahead = true; break; }
    }
    const want = ahead ? 0 : car.cruise;
    car.speed += clamp(want - car.speed, -260 * dt, 170 * dt);
    const alongPos = car.axis === 'h' ? car.x : car.y;
    if (car.turnCd <= 0) {
      for (const line of ROAD_LINES) {
        if (Math.abs(alongPos - line) < 16 && state.rng() < 0.35) {
          // Turn onto the crossing road.
          const newDir = state.rng() < 0.5 ? 1 : -1;
          if (car.axis === 'h') {
            car.axis = 'v'; car.road = line; car.laneOff = newDir === 1 ? 16 : -16;
            car.x = line + car.laneOff;
            car.angle = newDir === 1 ? Math.PI / 2 : -Math.PI / 2;
          } else {
            car.axis = 'h'; car.road = line; car.laneOff = newDir === 1 ? 16 : -16;
            car.y = line + car.laneOff;
            car.angle = newDir === 1 ? 0 : Math.PI;
          }
          car.dir = newDir;
          car.turnCd = 1.2;
          break;
        }
      }
    }
    // Keep on its road lane; U-turn at the world edge.
    if (car.axis === 'h') {
      car.y = car.road + car.laneOff;
      car.angle = car.dir === 1 ? 0 : Math.PI;
      car.x += car.dir * car.speed * dt;
      if (car.x < 60 || car.x > WORLD - 60) { car.dir *= -1; car.laneOff *= -1; car.x = clamp(car.x, 60, WORLD - 60); }
    } else {
      car.x = car.road + car.laneOff;
      car.angle = car.dir === 1 ? Math.PI / 2 : -Math.PI / 2;
      car.y += car.dir * car.speed * dt;
      if (car.y < 60 || car.y > WORLD - 60) { car.dir *= -1; car.laneOff *= -1; car.y = clamp(car.y, 60, WORLD - 60); }
    }
    // Scrape a building if the lane clips one (should not happen on roads).
    if (state.city.hitsBuilding(car.x, car.y, 18)) car.speed *= 0.9;
  }
  state.cars = state.cars.filter((c) => !c.dead);
}

export function updatePeds(state, dt) {
  const p = state.player;
  for (const ped of state.peds) {
    if (ped.dead) continue;
    ped.walkPhase += dt * 6;
    ped.shootCd -= dt;
    const dPlayer = dist(ped.x, ped.y, p.x, p.y);
    if (ped.gang) {
      // Gang members hold their ground and shoot at the player when close.
      if (dPlayer < 460) {
        ped.angle = Math.atan2(p.y - ped.y, p.x - ped.x);
        if (ped.shootCd <= 0 && dPlayer < 420) {
          ped.shootCd = range(state.rng, 0.9, 1.6);
          enemyShootAt(state, ped, p.x, p.y);
        }
        // Strafe a little so they are not sitting ducks.
        ped.x += Math.cos(ped.angle + Math.PI / 2) * Math.sin(state.time * 1.7 + ped.walkPhase) * 22 * dt;
        ped.y += Math.sin(ped.angle + Math.PI / 2) * Math.sin(state.time * 1.7 + ped.walkPhase) * 22 * dt;
      }
      continue;
    }
    if (ped.cop) {
      // Foot cop chases the player on foot and shoots.
      ped.angle = Math.atan2(p.y - ped.y, p.x - ped.x);
      ped.x += Math.cos(ped.angle) * ped.speed * dt;
      ped.y += Math.sin(ped.angle) * ped.speed * dt;
      if (ped.shootCd <= 0 && dPlayer < 380 && dPlayer > 40) {
        ped.shootCd = range(state.rng, 1.0, 1.8);
        enemyShootAt(state, ped, p.x, p.y);
      }
      if (dPlayer < 34) damagePlayer(state, 10);
      continue;
    }
    if (ped.flee > 0) {
      ped.flee -= dt;
      const a = Math.atan2(ped.y - ped.fleeY, ped.x - ped.fleeX);
      ped.angle = a;
      ped.x += Math.cos(a) * 130 * dt;
      ped.y += Math.sin(a) * 130 * dt;
    } else {
      // Stroll along the sidewalk; turn at intersections sometimes.
      ped.x += Math.cos(ped.angle) * ped.speed * dt;
      ped.y += Math.sin(ped.angle) * ped.speed * dt;
      if (state.rng() < dt * 0.08) ped.angle = pick(state.rng, [0, Math.PI / 2, Math.PI, -Math.PI / 2]);
      ped.x = clamp(ped.x, 30, WORLD - 30);
      ped.y = clamp(ped.y, 30, WORLD - 30);
    }
    // Player car running over a pedestrian is a crime.
    if (p.inCar && dist(ped.x, ped.y, p.inCar.x, p.inCar.y) < 30) {
      ped.dead = true;
      addWanted(state, 1);
      state.audio.crash();
      for (let i = 0; i < 10; i += 1) {
        state.particles.push(makeParticle(ped.x, ped.y, range(state.rng, -120, 120), range(state.rng, -120, 120), 0.6, '#ff4757', 4));
      }
    }
  }
  state.peds = state.peds.filter((pd) => !pd.dead);
}

export function updateBullets(state, dt) {
  const p = state.player;
  for (const b of state.bullets) {
    if (b.dead) continue;
    b.life -= dt;
    if (b.life <= 0) { b.dead = true; continue; }
    b.x += Math.cos(b.angle) * b.speed * dt;
    b.y += Math.sin(b.angle) * b.speed * dt;
    if (state.city.hitsBuilding(b.x, b.y, 2) || b.x < 0 || b.y < 0 || b.x > WORLD || b.y > WORLD) {
      b.dead = true;
      state.particles.push(makeParticle(b.x, b.y, 0, 0, 0.25, '#ffd32a', 4));
      continue;
    }
    if (b.from === 'player') {
      for (const ped of state.peds) {
        if (ped.dead) continue;
        if (dist(b.x, b.y, ped.x, ped.y) < 16) {
          b.dead = true;
          ped.hp -= b.dmg;
          state.particles.push(makeParticle(ped.x, ped.y, 0, 0, 0.3, '#ff4757', 5));
          if (ped.hp <= 0) {
            ped.dead = true;
            if (ped.gang) {
              state.cash += 150;
              state.toast('+$150', 1);
              state.audio.pickup();
              if (state.rng() < 0.5) state.pickups.push({ x: ped.x, y: ped.y, kind: 'cash', amount: 100 });
            } else if (ped.cop) {
              addWanted(state, 2);
              state.toast('COP DOWN! +2 WANTED', 1.6);
            } else {
              addWanted(state, 1);
            }
          }
          break;
        }
      }
      if (b.dead) continue;
      // Shooting a police car damages the player indirectly: it just adds heat.
      for (const car of state.cars) {
        if (car.dead || car.kind === 'player') continue;
        if (Math.abs(b.x - car.x) < 26 && Math.abs(b.y - car.y) < 16) {
          b.dead = true;
          if (car.kind === 'police') addWanted(state, 1);
          break;
        }
      }
    } else {
      const tx = p.inCar ? p.inCar.x : p.x;
      const ty = p.inCar ? p.inCar.y : p.y;
      if (dist(b.x, b.y, tx, ty) < (p.inCar ? 26 : 15)) {
        b.dead = true;
        damagePlayer(state, b.dmg);
      }
    }
  }
  state.bullets = state.bullets.filter((b) => !b.dead);
}

export function updateParticles(state, dt) {
  for (const pt of state.particles) {
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.92;
    pt.vy *= 0.92;
  }
  state.particles = state.particles.filter((pt) => pt.life > 0);
  for (const pk of state.pickups) {
    pk.bob = (pk.bob || 0) + dt;
  }
}
