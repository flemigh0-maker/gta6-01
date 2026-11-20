// Save / load through localStorage. Stores cash, mission progress and position.
const KEY = 'neonbay-save-v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      cash: state.cash,
      missionIndex: state.missionIndex,
      missionsDone: state.missionsDone,
      x: state.player.x,
      y: state.player.y,
      health: state.player.health,
      savedAt: Date.now(),
    }));
  } catch {
    // Storage unavailable (private mode, etc.) — the game still plays.
  }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
