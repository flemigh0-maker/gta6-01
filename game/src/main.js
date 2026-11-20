// Boot and the one loop: Neon Bay. Screens: menu / play / paused / busted.
// ?shot=start|drive|chase|mission (with &seed=N) stages that scene, paints it twice
// and sets window.__shotReady for a screenshot.
import { createCity, WORLD } from './city.js';
import { createAudio } from './audio.js';
import { initInput, keys, mouse, moveVector, consumeClick } from './input.js';
import { loadSave, writeSave, clearSave } from './save.js';
import { createRenderer } from './render.js';
import { MISSIONS, startMission, updateMissions, missionInteract } from './missions.js';
import {
  createPlayer, createCar, spawnTrafficCars, spawnPeds, spawnGang,
  updateCars, updatePeds, updateBullets, updateParticles, updateWanted,
  playerShoot, enterCar, exitCar, damagePlayer, addWanted, nearestCar,
} from './entities.js';
import { makeRng, clamp, dist, pick } from './rng.js';
import { ROAD_LINES } from './city.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 7;

const canvas = document.getElementById('game');
const minimap = document.getElementById('minimap');
const hud = {
  cash: document.getElementById('cash'),
  healthBar: document.getElementById('healthBar'),
  stars: document.getElementById('stars'),
  objective: document.getElementById('objective'),
  hint: document.getElementById('hint'),
  speed: document.getElementById('speed'),
  toast: document.getElementById('toast'),
};
const menuEl = document.getElementById('menu');
const hudEl = document.getElementById('hud');
const pausedEl = document.getElementById('paused');
const overEl = document.getElementById('over');
const overText = document.getElementById('overText');
const wastedEl = document.getElementById('wasted');

const audio = createAudio();
const city = createCity(seed);
const rng = makeRng(seed);
const renderer = createRenderer(canvas, minimap, hud);
initInput(canvas);

let state = null;
let screen = 'menu';
let toastTimer = 0;
let saveTimer = 0;
let prevE = false;
let prevP = false;
let prevM = false;

function showToast(text, seconds) {
  hud.toast.textContent = text;
  hud.toast.style.opacity = '1';
  toastTimer = seconds || 1.6;
}

function newState(fromSave) {
  const s = {
    time: 0, cash: 0, wanted: 0, crimeTimer: 0, missionIndex: 0, missionsDone: 0,
    won: false, over: null, mission: null, missionDefTitle: '',
    player: createPlayer(city.locations.safehouse.x, city.locations.safehouse.y),
    cars: [], peds: [], bullets: [], particles: [], pickups: [],
    city, rng, audio, mouse, toast: showToast,
  };
  if (fromSave) {
    s.cash = fromSave.cash || 0;
    s.missionsDone = fromSave.missionsDone || 0;
    s.missionIndex = fromSave.missionIndex || 0;
    s.player.x = fromSave.x || s.player.x;
    s.player.y = fromSave.y || s.player.y;
    s.player.health = fromSave.health || 100;
  }
  spawnTrafficCars(s, 14);
  spawnPeds(s, 24);
  return s;
}

function startGame(fromSave) {
  state = newState(fromSave);
  screen = 'play';
  menuEl.classList.add('hidden');
  overEl.classList.add('hidden');
  pausedEl.classList.add('hidden');
  hudEl.classList.remove('hidden');
  audio.start();
  audio.startMusic();
  const idx = state.missionsDone >= MISSIONS.length ? MISSIONS.length - 1 : state.missionsDone;
  state.missionIndex = idx;
  startMission(state, idx);
  state.missionDefTitle = MISSIONS[idx].title;
  state.toast(MISSIONS[idx].briefing, 4);
}

function toMenu() {
  screen = 'menu';
  menuEl.classList.remove('hidden');
  hudEl.classList.add('hidden');
  pausedEl.classList.add('hidden');
  overEl.classList.add('hidden');
  audio.stopEngine();
  audio.stopSiren();
  const save = loadSave();
  document.getElementById('btnContinue').classList.toggle('hidden', !save);
}

function bustPlayer() {
  state.over = null;
  const fine = Math.min(500, state.cash);
  state.cash -= fine;
  state.wanted = 0;
  audio.stopSiren();
  audio.stopEngine();
  const loc = city.locations.hospital;
  state.player.x = loc.x;
  state.player.y = loc.y;
  state.player.health = 100;
  state.player.inCar = null;
  state.player.invuln = 2;
  writeSave(state);
  wastedEl.textContent = 'BUSTED';
  overText.textContent = `The Neon Bay PD caught up with you. Hospital bill and fine: $${fine}. Mara kept your job open — get back out there.`;
  overEl.classList.remove('hidden');
  screen = 'over';
}

function updatePlayer(dt) {
  const p = state.player;
  p.shootCd = Math.max(0, p.shootCd - dt);
  p.invuln = Math.max(0, p.invuln - dt);
  p.regenTimer += dt;
  if (p.regenTimer > 8 && p.health > 0 && p.health < 100) p.health = Math.min(100, p.health + 6 * dt);

  // Aim from the mouse: screen centre is the player (camera follows).
  const rect = canvas.getBoundingClientRect();
  const sx = mouse.x * (1280 / Math.max(1, rect.width));
  const sy = mouse.y * (720 / Math.max(1, rect.height));
  const cam = renderer.cam;
  const wx = cam.x - 640 + sx;
  const wy = cam.y - 360 + sy;
  p.aimAngle = Math.atan2(wy - p.y, wx - p.x);

  if (p.inCar) {
    const car = p.inCar;
    // The player's position is the car's position while driving.
    p.x = car.x;
    p.y = car.y;
    const mv = moveVector();
    if (mv.y < 0) car.speed = Math.min(car.speed + 340 * dt, 430);
    else if (mv.y > 0) car.speed = Math.max(car.speed - (car.speed > 0 ? 520 : 200) * dt, -140);
    else car.speed -= car.speed * 0.35 * dt;
    if (keys.Space) car.speed -= car.speed * 2.2 * dt;
    const steer = mv.x * clamp(Math.abs(car.speed) / 200, 0, 1) * 2.4 * (car.speed < 0 ? -1 : 1);
    car.angle += steer * dt;
    audio.startEngine(Math.abs(car.speed) / 430);
    // Skid smoke when handbraking hard.
    if (keys.Space && Math.abs(car.speed) > 200 && Math.random() < 0.5) {
      state.particles.push({
        x: car.x - Math.cos(car.angle) * 20, y: car.y - Math.sin(car.angle) * 20,
        vx: 0, vy: 0, life: 0.5, maxLife: 0.5, color: '#b2bec3', size: 6,
      });
    }
    // Pickups are only grabbed on foot.
  } else {
    audio.stopEngine();
    const mv = moveVector();
    p.moving = mv.x !== 0 || mv.y !== 0;
    const sp = 175;
    const pos = city.collide(p.x, p.y, 13, mv.x * sp * dt, mv.y * sp * dt);
    p.x = pos.x;
    p.y = pos.y;
    if (p.moving) p.angle = Math.atan2(mv.y, mv.x);
    // Do not walk through cars.
    for (const car of state.cars) {
      if (car.dead) continue;
      const d = dist(p.x, p.y, car.x, car.y);
      if (d < 32 && d > 0.01) {
        const push = (32 - d) / d;
        p.x += (p.x - car.x) * push;
        p.y += (p.y - car.y) * push;
      }
    }
    if (mouse.down) playerShoot(state);
    // Cash pickups.
    for (const pk of state.pickups) {
      if (dist(p.x, p.y, pk.x, pk.y) < 30) {
        pk.dead = true;
        state.cash += pk.amount;
        audio.pickup();
        showToast(`+$${pk.amount}`, 1);
      }
    }
    state.pickups = state.pickups.filter((pk) => !pk.dead);
  }
}

function updateHint() {
  const p = state.player;
  if (!p.inCar) {
    const car = nearestCar(state, p.x, p.y, 78);
    const m = state.mission;
    if (m && ((m.index === 1 && m.step === 0) || (m.index === 4 && m.step === 0))) {
      const loc = m.index === 1 ? city.locations.marina : city.locations.bank;
      if (dist(p.x, p.y, loc.x, loc.y) < 70) {
        hud.hint.textContent = 'Press E to grab it';
        return;
      }
    }
    hud.hint.textContent = car ? 'Press E to enter the car' : 'WASD move · Mouse aim · Click to shoot · E enter car';
  } else {
    hud.hint.textContent = 'W/S drive · A/D steer · Space handbrake · E exit car';
  }
}

function update(dt) {
  state.time += dt;
  updatePlayer(dt);
  updateCars(state, dt);
  updatePeds(state, dt);
  updateBullets(state, dt);
  updateParticles(state, dt);
  updateWanted(state, dt);
  updateMissions(state, dt);
  if (state.mission) state.missionDefTitle = MISSIONS[state.mission.index].title;
  updateHint();
  // Keep the city alive: traffic and pedestrians near the player.
  const p = state.player;
  const focus = p.inCar ? p.inCar : p;
  let traffic = state.cars.filter((c) => c.kind === 'traffic');
  for (const car of traffic) {
    if (dist(car.x, car.y, focus.x, focus.y) > 1600) {
      const road = pick(rng, ROAD_LINES);
      const horizontal = rng() < 0.5;
      const along = clamp(focus.x + (rng() - 0.5) * 900, 100, WORLD - 100);
      if (horizontal) { car.axis = 'h'; car.road = road; car.y = road + car.laneOff; car.x = along; }
      else { car.axis = 'v'; car.road = road; car.x = road + car.laneOff; car.y = along; }
    }
  }
  traffic = state.cars.filter((c) => c.kind === 'traffic');
  if (traffic.length < 12) spawnTrafficCars(state, 12 - traffic.length);
  const walkers = state.peds.filter((pd) => !pd.gang && !pd.cop);
  if (walkers.length < 20) spawnPeds(state, 20 - walkers.length);
  // Toast fade.
  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) hud.toast.style.opacity = '0';
  }
  // Autosave.
  saveTimer += dt;
  if (saveTimer > 5) {
    saveTimer = 0;
    writeSave(state);
  }
  if (state.over === 'busted') bustPlayer();
}

function frame(now) {
  requestAnimationFrame(frame);
  if (screen !== 'play' || !state) return;
  // Edge-triggered keys.
  const eDown = !!keys.KeyE && !prevE;
  const pDown = !!keys.KeyP && !prevP;
  const mDown = !!keys.KeyM && !prevM;
  prevE = !!keys.KeyE;
  prevP = !!keys.KeyP;
  prevM = !!keys.KeyM;
  if (mDown) audio.toggleMute();
  if (pDown) {
    pausedEl.classList.remove('hidden');
    screen = 'paused';
    writeSave(state);
    return;
  }
  if (eDown) {
    if (!missionInteract(state)) {
      if (state.player.inCar) exitCar(state);
      else enterCar(state);
    }
  }
  update(1 / 60);
  renderer.draw(state);
  consumeClick();
}

// --- menus -------------------------------------------------------------------

document.getElementById('btnStart').addEventListener('click', () => {
  clearSave();
  startGame(null);
});
document.getElementById('btnContinue').addEventListener('click', () => {
  startGame(loadSave());
});
document.getElementById('btnResume').addEventListener('click', () => {
  pausedEl.classList.add('hidden');
  screen = 'play';
});
document.getElementById('btnQuit').addEventListener('click', () => {
  writeSave(state);
  toMenu();
});
document.getElementById('btnRetry').addEventListener('click', () => {
  overEl.classList.add('hidden');
  state.player.health = 100;
  screen = 'play';
});
document.getElementById('btnOverMenu').addEventListener('click', () => toMenu());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && screen === 'play') {
    pausedEl.classList.remove('hidden');
    screen = 'paused';
    if (state) writeSave(state);
  }
});

// --- screenshot staging ------------------------------------------------------

function simulate(steps) {
  for (let i = 0; i < steps; i += 1) update(1 / 60);
  renderer.draw(state);
}

function stageShot(name) {
  if (name === 'start') {
    state = newState(null);
    screen = 'menu';
    // Park the camera over Downtown so the title sits on the city.
    state.player.x = 1600;
    state.player.y = 1600;
    renderer.draw(state);
    menuEl.classList.remove('hidden');
    hudEl.classList.add('hidden');
  } else if (name === 'drive') {
    startGame(null);
    const car = createCar(1400, 1400, 0, '#e74c3c', 'traffic');
    car.stolenByPlayer = true;
    state.cars.push(car);
    state.player.inCar = car;
    car.kind = 'player';
    car.speed = 280;
    state.mission.step = 1;
    state.mission.text = 'Nice wheels. Now drive to Rico\u2019s Chop Shop';
    // Extra traffic on the same avenue so the shot reads as a living city.
    const extra = [
      [1000, 1400, 0, '#3498db'], [1750, 1416, Math.PI, '#f1c40f'],
      [1400, 1000, Math.PI / 2, '#2ecc71'], [1400, 1800, -Math.PI / 2, '#9b59b6'],
    ];
    for (const [x, y, a, c] of extra) {
      const tc = createCar(x, y, a, c, 'traffic');
      tc.axis = a === 0 || a === Math.PI ? 'h' : 'v';
      tc.road = tc.axis === 'h' ? 1400 : 1400;
      tc.dir = a === 0 || a === Math.PI / 2 ? 1 : -1;
      tc.laneOff = 16;
      tc.speed = 150;
      state.cars.push(tc);
    }
    simulate(50);
    hud.toast.style.opacity = '0';
    toastTimer = 0;
  } else if (name === 'chase') {
    startGame(null);
    const car = createCar(1400, 1400, 0, '#e74c3c', 'traffic');
    car.stolenByPlayer = true;
    state.cars.push(car);
    state.player.inCar = car;
    car.kind = 'player';
    car.speed = 320;
    addWanted(state, 3);
    // Three police cars in pursuit, close behind.
    for (let i = 0; i < 3; i += 1) {
      const pc = createCar(1400 - 140 - i * 70, 1400 + (i - 1) * 60, 0, '#1e3799', 'police');
      pc.speed = 380;
      state.cars.push(pc);
    }
    state.mission = { index: 2, step: 0, timer: 45, target: { x: city.locations.safehouse.x, y: city.locations.safehouse.y, label: 'Safehouse' }, text: 'Lose the cops! Survive 45s or reach the Safehouse' };
    state.missionDefTitle = '3 · HOT PURSUIT';
    state.toast('WANTED ★★★ — LOSE THE COPS!', 3);
    simulate(45);
  } else if (name === 'mission') {
    startGame(null);
    startMission(state, 3);
    state.missionDefTitle = MISSIONS[3].title;
    const loc = city.locations.warehouse;
    state.player.x = loc.x - 160;
    state.player.y = loc.y + 40;
    state.player.aimAngle = Math.atan2(loc.y - state.player.y, loc.x - state.player.x);
    // A couple of tracers already in the air.
    state.bullets.push({
      x: state.player.x + 60, y: state.player.y - 10, angle: state.player.aimAngle,
      speed: 900, life: 0.4, from: 'player', dmg: 34, dead: false,
    });
    simulate(25);
  } else {
    startGame(null);
  }
  let painted = 0;
  (function paint() {
    renderer.draw(state);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  })();
}

if (shot) {
  stageShot(shot);
} else {
  toMenu();
  requestAnimationFrame(frame);
  // Idle attract mode behind the menu: a slow camera drift over the city.
  state = newState(null);
  state.player.x = 1600;
  state.player.y = 1600;
  (function attract() {
    if (screen === 'menu' && state) {
      state.time += 1 / 60;
      state.player.x = 1600 + Math.sin(state.time * 0.05) * 300;
      renderer.draw(state);
    }
    requestAnimationFrame(attract);
  })();
}
