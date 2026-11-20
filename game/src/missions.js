// Five story missions from Mara, the fixer. Each mission is a small state machine:
// a step advances when its objective is met, and finishing pays cash and starts the next.
import { addWanted, spawnGang } from './entities.js';
import { dist } from './rng.js';

export const MISSIONS = [
  {
    title: '1 · FIRST WHEELS',
    briefing: 'Mara: "Jax, you need wheels. Steal any car on the street, then bring it to Rico\u2019s Chop Shop."',
    reward: 400,
  },
  {
    title: '2 · THE PICKUP',
    briefing: 'Mara: "A package is waiting at Palm Court Marina. Get it on foot — press E to grab it — then take it to Downtown Plaza."',
    reward: 700,
  },
  {
    title: '3 · HOT PURSUIT',
    briefing: 'Mara: "The pickup was hot. The cops are on you — lose them! Survive 45 seconds or reach your Safehouse."',
    reward: 900,
  },
  {
    title: '4 · STREET WAR',
    briefing: 'Mara: "The Red Vipers took Warehouse 9. Clear them out — all six — and the row is ours."',
    reward: 1500,
  },
  {
    title: '5 · THE BIG SCORE',
    briefing: 'Mara: "Last one, Jax. Hit the Neon Bay Bank, grab the cash, and bring it home. The whole city will be looking for you."',
    reward: 5000,
  },
];

export function startMission(state, index) {
  const loc = state.city.locations;
  state.mission = { index, step: 0, timer: 0, target: null, text: '' };
  const m = state.mission;
  if (index === 0) {
    m.text = 'Steal a car (walk up to one, press E)';
    m.target = { x: loc.chopshop.x, y: loc.chopshop.y, label: 'Chop Shop' };
  } else if (index === 1) {
    m.text = 'Go to the Marina and grab the package (E)';
    m.target = { x: loc.marina.x, y: loc.marina.y, label: 'Package' };
  } else if (index === 2) {
    addWanted(state, 2);
    m.timer = 45;
    m.text = 'Lose the cops! Survive 45s or reach the Safehouse';
    m.target = { x: loc.safehouse.x, y: loc.safehouse.y, label: 'Safehouse' };
  } else if (index === 3) {
    spawnGang(state, loc.warehouse.x, loc.warehouse.y, 6);
    m.text = 'Eliminate the Red Vipers at Warehouse 9';
    m.target = { x: loc.warehouse.x, y: loc.warehouse.y, label: 'Warehouse 9' };
  } else if (index === 4) {
    m.text = 'Rob the Neon Bay Bank — grab the cash (E)';
    m.target = { x: loc.bank.x, y: loc.bank.y, label: 'Bank' };
  }
  state.toast(MISSIONS[index].title, 2.2);
  state.audio.mission();
}

function completeMission(state) {
  const idx = state.mission.index;
  const reward = MISSIONS[idx].reward;
  state.cash += reward;
  state.missionsDone = idx + 1;
  state.audio.mission();
  state.toast(`MISSION COMPLETE! +$${reward}`, 2.4);
  state.mission = null;
  if (idx + 1 >= MISSIONS.length) {
    state.won = true;
    state.toast('DEBT PAID — NEON BAY IS YOURS!', 4);
    state.audio.mission();
  } else {
    startMission(state, idx + 1);
  }
}

// E-key interactions that belong to a mission (grab the package / the bank cash).
export function missionInteract(state) {
  const m = state.mission;
  if (!m) return false;
  const p = state.player;
  const loc = state.city.locations;
  if (m.index === 1 && m.step === 0 && !p.inCar && dist(p.x, p.y, loc.marina.x, loc.marina.y) < 70) {
    m.step = 1;
    m.text = 'Package grabbed! Deliver it to Downtown Plaza';
    m.target = { x: loc.plaza.x, y: loc.plaza.y, label: 'Drop-off' };
    state.audio.pickup();
    state.toast('PACKAGE SECURED', 1.4);
    return true;
  }
  if (m.index === 4 && m.step === 0 && !p.inCar && dist(p.x, p.y, loc.bank.x, loc.bank.y) < 70) {
    m.step = 1;
    m.text = 'Cash grabbed! Get to the Safehouse — the city is on you';
    m.target = { x: state.city.locations.safehouse.x, y: state.city.locations.safehouse.y, label: 'Safehouse' };
    addWanted(state, 3);
    state.audio.pickup();
    state.toast('BANK ROBBED! +3 WANTED', 2);
    return true;
  }
  return false;
}

export function updateMissions(state, dt) {
  const m = state.mission;
  if (!m) return;
  const p = state.player;
  const loc = state.city.locations;
  if (m.index === 0) {
    if (m.step === 0 && p.inCar) {
      m.step = 1;
      m.text = 'Nice wheels. Now drive to Rico\u2019s Chop Shop';
    } else if (m.step === 1 && p.inCar && dist(p.inCar.x, p.inCar.y, loc.chopshop.x, loc.chopshop.y) < 80) {
      completeMission(state);
    }
  } else if (m.index === 1) {
    if (m.step === 1 && dist(p.x, p.y, loc.plaza.x, loc.plaza.y) < 80) {
      completeMission(state);
    }
  } else if (m.index === 2) {
    m.timer -= dt;
    if (m.timer <= 0 || state.wanted === 0) {
      state.wanted = 0;
      state.audio.stopSiren();
      completeMission(state);
    } else if (dist(p.x, p.y, loc.safehouse.x, loc.safehouse.y) < 80) {
      state.wanted = 0;
      state.audio.stopSiren();
      completeMission(state);
    }
  } else if (m.index === 3) {
    const left = state.peds.filter((pd) => pd.gang && !pd.dead).length;
    m.text = `Eliminate the Red Vipers at Warehouse 9 — ${left} left`;
    if (left === 0) completeMission(state);
  } else if (m.index === 4) {
    if (m.step === 1 && dist(p.x, p.y, loc.safehouse.x, loc.safehouse.y) < 80) {
      completeMission(state);
    }
  }
}
