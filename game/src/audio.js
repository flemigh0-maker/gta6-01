// All sound is synthesized with WebAudio — no audio files, no network.
// Engine hum, gunshots, sirens, pickups and a small bass loop.
export function createAudio() {
  let ctx = null;
  let muted = false;
  let musicTimer = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    return ctx;
  }

  function start() {
    ensure();
    if (!ctx || ctx.state === 'running') return;
    ctx.resume().catch(() => {});
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol || 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, lowpass) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    let node = src;
    if (lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      src.connect(f);
      node = f;
    }
    node.connect(g).connect(ctx.destination);
    src.start(t);
  }

  return {
    start,
    toggleMute() { muted = !muted; if (muted) this.stopEngine(); return muted; },
    get muted() { return muted; },
    shoot() { noise(0.12, 0.25, 1800); tone(180, 0.08, 'square', 0.1, 60); },
    enemyShoot() { noise(0.1, 0.12, 1200); },
    hit() { tone(220, 0.1, 'sawtooth', 0.12, 90); },
    pickup() { tone(660, 0.09, 'sine', 0.14); setTimeout(() => tone(990, 0.12, 'sine', 0.14), 90); },
    mission() {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'triangle', 0.16), i * 110));
    },
    crash() { noise(0.3, 0.3, 500); },
    door() { tone(300, 0.07, 'square', 0.08, 180); },
    startEngine(speed01) {
      if (!ctx || muted) return;
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineGain = ctx.createGain();
        engineOsc.type = 'sawtooth';
        engineOsc.frequency.value = 55;
        engineGain.gain.value = 0;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 420;
        engineOsc.connect(f).connect(engineGain).connect(ctx.destination);
        engineOsc.start();
      }
      engineOsc.frequency.value = 50 + speed01 * 130;
      engineGain.gain.value = 0.035 + speed01 * 0.03;
    },
    stopEngine() {
      if (engineGain) engineGain.gain.value = 0;
    },
    startSiren() {
      if (!ctx || muted || sirenOsc) return;
      sirenOsc = ctx.createOscillator();
      sirenGain = ctx.createGain();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 700;
      sirenGain.gain.value = 0.05;
      sirenOsc.connect(sirenGain).connect(ctx.destination);
      sirenOsc.start();
      let hi = false;
      sirenOsc._flip = setInterval(() => {
        if (!sirenOsc) return;
        hi = !hi;
        sirenOsc.frequency.value = hi ? 950 : 700;
      }, 380);
    },
    stopSiren() {
      if (!sirenOsc) return;
      clearInterval(sirenOsc._flip);
      try { sirenOsc.stop(); } catch { /* already stopped */ }
      sirenOsc = null;
      sirenGain = null;
    },
    startMusic() {
      if (!ctx || musicTimer) return;
      // Simple funk bassline loop, scheduled every eighth note.
      const bass = [55, 0, 55, 65.4, 0, 55, 0, 82.4, 55, 0, 55, 65.4, 73.4, 0, 98, 0];
      let step = 0;
      musicTimer = setInterval(() => {
        if (muted || !ctx) { step += 1; return; }
        const f = bass[step % bass.length];
        if (f) tone(f, 0.22, 'triangle', 0.1);
        if (step % 4 === 2) noise(0.03, 0.03, 6000);
        step += 1;
      }, 190);
    },
  };
}
