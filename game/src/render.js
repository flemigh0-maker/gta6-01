// Drawing only: the city, the entities, the HUD and the minimap. Top-down, flat colours
// with shadows and neon accents, painted on a 1280x720 canvas with a following camera.
import { ROAD_LINES, ROAD_W, WORLD } from './city.js';
import { clamp, dist } from './rng.js';

const VIEW_W = 1280;
const VIEW_H = 720;

export function createRenderer(canvas, minimapCanvas, hud) {
  const ctx = canvas.getContext('2d');
  const mctx = minimapCanvas.getContext('2d');
  const cam = { x: 0, y: 0 };

  function worldToScreen(x, y) {
    return { x: x - cam.x + VIEW_W / 2, y: y - cam.y + VIEW_H / 2 };
  }

  function drawRoads(state) {
    const city = state.city;
    // Ground: concrete base.
    ctx.fillStyle = '#262c38';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // Grass blocks between roads (drawn as the city floor first).
    ctx.fillStyle = '#2c4636';
    const x0 = Math.max(0, cam.x - VIEW_W / 2 - 100);
    const y0 = Math.max(0, cam.y - VIEW_H / 2 - 100);
    const x1 = Math.min(WORLD, cam.x + VIEW_W / 2 + 100);
    const y1 = Math.min(WORLD, cam.y + VIEW_H / 2 + 100);
    for (let ix = 0; ix < ROAD_LINES.length - 1; ix += 1) {
      for (let iy = 0; iy < ROAD_LINES.length - 1; iy += 1) {
        const bx0 = ROAD_LINES[ix] + ROAD_W / 2;
        const by0 = ROAD_LINES[iy] + ROAD_W / 2;
        const bx1 = ROAD_LINES[ix + 1] - ROAD_W / 2;
        const by1 = ROAD_LINES[iy + 1] - ROAD_W / 2;
        if (bx1 < x0 || bx0 > x1 || by1 < y0 || by0 > y1) continue;
        const s = worldToScreen(bx0, by0);
        ctx.fillStyle = city.isBeach(bx0) ? '#c9a86a' : '#2c4636';
        ctx.fillRect(s.x, s.y, bx1 - bx0, by1 - by0);
      }
    }
    // Beach + water on the east edge.
    const beach = worldToScreen(3052, 0);
    ctx.fillStyle = '#c9a86a';
    ctx.fillRect(beach.x, 0, VIEW_W - beach.x, VIEW_H);
    const water = worldToScreen(3152, 0);
    ctx.fillStyle = '#1e7f9e';
    ctx.fillRect(water.x, 0, VIEW_W - water.x, VIEW_H);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (let wy = 0; wy < VIEW_H; wy += 46) {
      ctx.fillRect(water.x, wy + ((state.time * 22) % 46), 26, 3);
    }
    // Parks.
    for (const park of city.parks) {
      const s = worldToScreen(park.x0, park.y0);
      ctx.fillStyle = '#2f6b3f';
      ctx.fillRect(s.x, s.y, park.x1 - park.x0, park.y1 - park.y0);
      const pond = worldToScreen(park.pond.x, park.pond.y);
      ctx.fillStyle = '#2e86c1';
      ctx.beginPath();
      ctx.arc(pond.x, pond.y, park.pond.r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Roads: asphalt, then sidewalk edge, then dashed centre line.
    for (const line of ROAD_LINES) {
      const v = worldToScreen(line, 0);
      ctx.fillStyle = '#3d4454';
      ctx.fillRect(v.x - ROAD_W / 2, 0, ROAD_W, VIEW_H);
      ctx.fillStyle = '#181c24';
      ctx.fillRect(v.x - ROAD_W / 2 + 8, 0, ROAD_W - 16, VIEW_H);
      const h = worldToScreen(0, line);
      ctx.fillStyle = '#3d4454';
      ctx.fillRect(0, h.y - ROAD_W / 2, VIEW_W, ROAD_W);
      ctx.fillStyle = '#181c24';
      ctx.fillRect(0, h.y - ROAD_W / 2 + 8, VIEW_W, ROAD_W - 16);
    }
    // Centre dashes.
    ctx.fillStyle = '#f7dc6f';
    for (const line of ROAD_LINES) {
      const v = worldToScreen(line, 0);
      for (let y = -40; y < VIEW_H + 40; y += 44) {
        const wy = cam.y - VIEW_H / 2 + y;
        if (Math.abs(wy % 400) > 60) ctx.fillRect(v.x - 2, y, 4, 22);
      }
      const h = worldToScreen(0, line);
      for (let x = -40; x < VIEW_W + 40; x += 44) {
        const wx = cam.x - VIEW_W / 2 + x;
        if (Math.abs(wx % 400) > 60) ctx.fillRect(x, h.y - 2, 22, 4);
      }
    }
    // Crosswalks at intersections.
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (const lx of ROAD_LINES) {
      for (const ly of ROAD_LINES) {
        const s = worldToScreen(lx, ly);
        for (let i = -3; i <= 3; i += 1) {
          ctx.fillRect(s.x + i * 12 - 3, s.y - ROAD_W / 2 + 12, 6, 18);
          ctx.fillRect(s.x + i * 12 - 3, s.y + ROAD_W / 2 - 30, 6, 18);
        }
      }
    }
  }

  function drawBuildings(state) {
    for (const b of state.city.buildings) {
      const s = worldToScreen(b.x, b.y);
      if (s.x > VIEW_W + 60 || s.y > VIEW_H + 60 || s.x + b.w < -60 || s.y + b.h < -60) continue;
      // Fake height: shadow offset down-right.
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(s.x + b.hgt * 0.45, s.y + b.hgt * 0.45, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(s.x, s.y, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(s.x + 8, s.y + 8, b.w - 16, b.h - 16);
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      const cols = Math.max(2, Math.floor(b.w / 46));
      const rows = Math.max(2, Math.floor(b.h / 46));
      for (let cx = 0; cx < cols; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          if ((cx + cy) % 2 === 0) ctx.fillRect(s.x + 14 + cx * ((b.w - 28) / cols), s.y + 14 + cy * ((b.h - 28) / rows), 10, 8);
        }
      }
    }
    // Trees.
    for (const t of state.city.trees) {
      const s = worldToScreen(t.x, t.y);
      if (s.x < -30 || s.x > VIEW_W + 30 || s.y < -30 || s.y > VIEW_H + 30) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.arc(s.x + 4, s.y + 5, t.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = t.palm ? '#27ae60' : '#1e8449';
      ctx.beginPath(); ctx.arc(s.x, s.y, t.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2ecc71';
      ctx.beginPath(); ctx.arc(s.x - 3, s.y - 3, t.r * 0.55, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawCarShape(car, time) {
    const s = worldToScreen(car.x, car.y);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(-car.len / 2 + 3, -car.wid / 2 + 4, car.len, car.wid);
    ctx.fillStyle = car.color;
    ctx.beginPath();
    ctx.roundRect(-car.len / 2, -car.wid / 2, car.len, car.wid, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(20,24,36,0.9)';
    ctx.fillRect(-6, -car.wid / 2 + 3, 16, car.wid - 6);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(-car.len / 2 + 4, -car.wid / 2 + 3, 8, 4);
    ctx.fillRect(-car.len / 2 + 4, car.wid / 2 - 7, 8, 4);
    // Headlights.
    ctx.fillStyle = '#fff8b0';
    ctx.fillRect(car.len / 2 - 2, -car.wid / 2 + 2, 3, 5);
    ctx.fillRect(car.len / 2 - 2, car.wid / 2 - 7, 3, 5);
    if (car.kind === 'police') {
      ctx.fillStyle = '#ecf0f1';
      ctx.fillRect(-car.len / 2 + 2, -car.wid / 2, 10, car.wid);
      const flash = Math.floor(time * 4) % 2 === 0;
      ctx.fillStyle = flash ? '#ff2e4d' : '#2e86ff';
      ctx.fillRect(-4, -car.wid / 2 + 2, 8, 5);
      ctx.fillStyle = flash ? '#2e86ff' : '#ff2e4d';
      ctx.fillRect(-4, car.wid / 2 - 7, 8, 5);
    }
    if (car.kind === 'player') {
      ctx.strokeStyle = '#ffd319';
      ctx.lineWidth = 2;
      ctx.strokeRect(-car.len / 2 - 2, -car.wid / 2 - 2, car.len + 4, car.wid + 4);
    }
    ctx.restore();
  }

  function drawPedShape(ped, isPlayer, aimAngle) {
    const s = worldToScreen(ped.x, ped.y);
    const bob = Math.sin(ped.walkPhase) * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(s.x + 3, s.y + 5, 11, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ped.color;
    ctx.beginPath(); ctx.arc(s.x, s.y + bob * 0.4, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f5c99b';
    ctx.beginPath(); ctx.arc(s.x, s.y + bob * 0.4, 6, 0, Math.PI * 2); ctx.fill();
    if (isPlayer) {
      ctx.strokeStyle = '#ffd319';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.x, s.y + bob * 0.4, 15, 0, Math.PI * 2); ctx.stroke();
      // Aim direction.
      ctx.strokeStyle = 'rgba(255,211,25,0.7)';
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x + Math.cos(aimAngle) * 30, s.y + Math.sin(aimAngle) * 30);
      ctx.stroke();
    }
    if (ped.gang) {
      ctx.fillStyle = '#ff2e4d';
      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('VIPER', s.x, s.y - 20);
    }
  }

  function drawMarkers(state) {
    const m = state.mission;
    if (!m || !m.target) return;
    const s = worldToScreen(m.target.x, m.target.y);
    const pulse = 1 + Math.sin(state.time * 4) * 0.18;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(pulse, pulse);
    ctx.strokeStyle = '#ffd319';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,211,25,0.25)';
    ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd319';
    ctx.beginPath(); ctx.moveTo(0, -34); ctx.lineTo(10, -14); ctx.lineTo(-10, -14); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#ffd319';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(m.target.label, s.x, s.y - 44);
    // Off-screen direction arrow.
    if (s.x < 30 || s.x > VIEW_W - 30 || s.y < 30 || s.y > VIEW_H - 30) {
      const cx = clamp(s.x, 40, VIEW_W - 40);
      const cy = clamp(s.y, 40, VIEW_H - 40);
      const a = Math.atan2(s.y - cy, s.x - cx);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a);
      ctx.fillStyle = '#ffd319';
      ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-8, -10); ctx.lineTo(-8, 10); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  function drawWorld(state) {
    const p = state.player;
    const focus = p.inCar ? p.inCar : p;
    cam.x = clamp(focus.x, VIEW_W / 2 - 200, WORLD - VIEW_W / 2 + 200);
    cam.y = clamp(focus.y, VIEW_H / 2 - 200, WORLD - VIEW_H / 2 + 200);
    drawRoads(state);
    drawBuildings(state);
    drawMarkers(state);
    // Cash pickups.
    for (const pk of state.pickups) {
      const s = worldToScreen(pk.x, pk.y);
      const bob = Math.sin((pk.bob || 0) * 3) * 3;
      ctx.fillStyle = '#7dff6a';
      ctx.fillRect(s.x - 10, s.y - 6 + bob, 20, 12);
      ctx.fillStyle = '#1e8449';
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('$', s.x, s.y + 3 + bob);
    }
    // Cars, sorted so lower ones draw later (fake depth).
    const cars = [...state.cars].sort((a, b) => a.y - b.y);
    for (const car of cars) {
      if (car.dead) continue;
      const s = worldToScreen(car.x, car.y);
      if (s.x < -80 || s.x > VIEW_W + 80 || s.y < -80 || s.y > VIEW_H + 80) continue;
      drawCarShape(car, state.time);
    }
    for (const ped of state.peds) {
      if (ped.dead) continue;
      const s = worldToScreen(ped.x, ped.y);
      if (s.x < -40 || s.x > VIEW_W + 40 || s.y < -40 || s.y > VIEW_H + 40) continue;
      drawPedShape(ped, false, 0);
    }
    if (!p.inCar) drawPedShape({ ...p, color: '#ffd319', walkPhase: p.moving ? state.time * 10 : 0 }, true, p.aimAngle);
    // Bullets as tracers.
    ctx.strokeStyle = '#ffe066';
    ctx.lineWidth = 3;
    for (const b of state.bullets) {
      const s = worldToScreen(b.x, b.y);
      ctx.beginPath();
      ctx.moveTo(s.x - Math.cos(b.angle) * 14, s.y - Math.sin(b.angle) * 14);
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
    }
    // Particles.
    for (const pt of state.particles) {
      const s = worldToScreen(pt.x, pt.y);
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.fillRect(s.x - pt.size / 2, s.y - pt.size / 2, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;
    // Damage vignette.
    if (p.health < 45) {
      const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.75);
      g.addColorStop(0, 'rgba(255,0,0,0)');
      g.addColorStop(1, `rgba(255,0,0,${0.35 * (1 - p.health / 45)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    // Crosshair at the mouse when on foot.
    if (!p.inCar) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2;
      const mx = state.mouse.x;
      const my = state.mouse.y;
      ctx.beginPath();
      ctx.arc(mx, my, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mx - 14, my); ctx.lineTo(mx - 6, my);
      ctx.moveTo(mx + 6, my); ctx.lineTo(mx + 14, my);
      ctx.moveTo(mx, my - 14); ctx.lineTo(mx, my - 6);
      ctx.moveTo(mx, my + 6); ctx.lineTo(mx, my + 14);
      ctx.stroke();
    }
  }

  function drawMinimap(state) {
    const scale = 180 / WORLD;
    mctx.fillStyle = '#0a0e1a';
    mctx.fillRect(0, 0, 180, 180);
    mctx.fillStyle = '#2c4636';
    mctx.fillRect(0, 0, 180, 180);
    mctx.fillStyle = '#c9a86a';
    mctx.fillRect(3052 * scale, 0, 180 - 3052 * scale, 180);
    mctx.fillStyle = '#1e7f9e';
    mctx.fillRect(3152 * scale, 0, 180 - 3152 * scale, 180);
    mctx.strokeStyle = '#8b93a7';
    mctx.lineWidth = 2;
    for (const line of ROAD_LINES) {
      mctx.beginPath(); mctx.moveTo(line * scale, 0); mctx.lineTo(line * scale, 180); mctx.stroke();
      mctx.beginPath(); mctx.moveTo(0, line * scale); mctx.lineTo(180, line * scale); mctx.stroke();
    }
    mctx.fillStyle = '#3d4a6b';
    for (const b of state.city.buildings) {
      mctx.fillRect(b.x * scale, b.y * scale, Math.max(1.5, b.w * scale), Math.max(1.5, b.h * scale));
    }
    // Mission target.
    const m = state.mission;
    if (m && m.target) {
      const pulse = 3 + Math.sin(state.time * 4) * 1.5;
      mctx.fillStyle = '#ffd319';
      mctx.beginPath(); mctx.arc(m.target.x * scale, m.target.y * scale, pulse + 2, 0, Math.PI * 2); mctx.fill();
    }
    // Police (blue), gang (red).
    mctx.fillStyle = '#2e86ff';
    for (const car of state.cars) {
      if (car.kind === 'police' && !car.dead) {
        mctx.beginPath(); mctx.arc(car.x * scale, car.y * scale, 3, 0, Math.PI * 2); mctx.fill();
      }
    }
    mctx.fillStyle = '#ff2e4d';
    for (const ped of state.peds) {
      if (ped.gang && !ped.dead) {
        mctx.beginPath(); mctx.arc(ped.x * scale, ped.y * scale, 2.5, 0, Math.PI * 2); mctx.fill();
      }
    }
    // Player arrow.
    const p = state.player;
    const focus = p.inCar ? p.inCar : p;
    mctx.save();
    mctx.translate(focus.x * scale, focus.y * scale);
    mctx.rotate(focus.angle);
    mctx.fillStyle = '#ffffff';
    mctx.beginPath(); mctx.moveTo(7, 0); mctx.lineTo(-5, -5); mctx.lineTo(-5, 5); mctx.closePath(); mctx.fill();
    mctx.restore();
  }

  function updateHud(state) {
    hud.cash.textContent = `$${state.cash.toLocaleString('en-US')}`;
    hud.healthBar.style.width = `${Math.max(0, state.player.health)}%`;
    let stars = '';
    for (let i = 0; i < 5; i += 1) stars += i < Math.floor(state.wanted) ? '★' : '☆';
    hud.stars.textContent = state.wanted > 0 ? stars : '';
    const m = state.mission;
    if (state.won) {
      hud.objective.innerHTML = '<b>DEBT PAID!</b> Free roam Neon Bay — the city is yours.';
    } else if (m) {
      const target = m.target;
      const p = state.player;
      const focus = p.inCar ? p.inCar : p;
      const d = target ? Math.round(dist(focus.x, focus.y, target.x, target.y)) : 0;
      const timer = m.index === 2 ? ` · ${Math.max(0, Math.ceil(m.timer))}s` : '';
      hud.objective.innerHTML = `<b>${m.title || ''}</b> ${m.text}${target ? ` · ${d}m` : ''}${timer}`;
      // Mission title line comes from the mission def; keep it simple.
      const defTitle = state.missionDefTitle;
      if (defTitle) hud.objective.innerHTML = `<b>${defTitle}</b> ${m.text}${target ? ` · ${d}m` : ''}${timer}`;
    } else {
      hud.objective.innerHTML = '<b>FREE ROAM</b> Explore Neon Bay. Press E near a car to drive.';
    }
    hud.speed.textContent = state.player.inCar ? `${Math.round(Math.abs(state.player.inCar.speed) * 0.24)} mph` : '';
  }

  function draw(state) {
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    drawWorld(state);
    drawMinimap(state);
    updateHud(state);
  }

  return { draw, updateHud, worldToScreen, cam };
}
