/* ============================================================
   sound.js — lightweight WebAudio synthesized SFX (no assets)
   ============================================================ */
const Sfx = {
  ctx: null,
  master: null,
  enabled: true,
  volume: 0.5,

  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    } catch (e) { this.enabled = false; }
  },

  resume() { if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },

  setVol(v) { this.volume = v; if (this.master) this.master.gain.value = v; },

  _tone(freq, dur, type, vol, slide) {
    if (!this.enabled || !this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || "square";
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t0 + dur);
    g.gain.setValueAtTime(Math.min(1, vol || 0.2), t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  },

  _noise(dur, vol, filterFreq, type) {
    if (!this.enabled || !this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = type || "lowpass"; f.frequency.value = filterFreq || 800;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(Math.min(1, vol || 0.2), t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0);
  },

  swing() { this._noise(0.08, 0.08, 2500, "bandpass"); },
  hit() { this._tone(150, 0.1, "square", 0.14, 60); this._noise(0.06, 0.1, 1200); },
  crit() { this._tone(420, 0.16, "sawtooth", 0.16, 120); this._tone(90, 0.18, "square", 0.12, 50); },
  hurt() { this._tone(200, 0.15, "sawtooth", 0.15, 90); },
  dash() { this._noise(0.18, 0.14, 900); },
  jump() { this._tone(260, 0.1, "sine", 0.1, 420); },
  shoot() { this._noise(0.12, 0.1, 2600, "highpass"); },
  fireball() { this._tone(120, 0.28, "sawtooth", 0.14, 400); this._noise(0.2, 0.1, 700); },
  explode() { this._tone(70, 0.35, "triangle", 0.25, 30); this._noise(0.3, 0.18, 500); },
  freeze() { this._tone(900, 0.25, "sine", 0.12, 200); },
  lightning() { this._noise(0.3, 0.2, 3000, "highpass"); this._tone(120, 0.2, "square", 0.12, 300); },
  block() { this._tone(500, 0.08, "square", 0.12, 300); this._noise(0.05, 0.1, 1500); },
  pickup() { this._tone(520, 0.07, "sine", 0.14); setTimeout(() => { this._tone(780, 0.09, "sine", 0.14); }, 70); },
  coin() { this._tone(1180, 0.06, "square", 0.1); setTimeout(() => { this._tone(1568, 0.09, "square", 0.1); }, 60); },
  levelup() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this._tone(f, 0.25, "triangle", 0.18), i * 90)); },
  error() { this._tone(160, 0.2, "square", 0.15, 120); },
  open() { this._tone(300, 0.1, "triangle", 0.12); this._tone(450, 0.1, "triangle", 0.1); },
  chest() { [440, 550, 660, 880].forEach((f, i) => setTimeout(() => this._tone(f, 0.12, "triangle", 0.15), i * 70)); },
  boss() { this._tone(80, 0.8, "sawtooth", 0.2, 45); setTimeout(() => this._tone(65, 0.9, "sawtooth", 0.18, 40), 250); },
  dashback() { this._noise(0.15, 0.12, 600); },
  roar() { this._tone(90, 0.6, "sawtooth", 0.2, 55); this._noise(0.5, 0.15, 400); },
  click() { this._tone(700, 0.04, "square", 0.08); },
  spell() { this._tone(640, 0.18, "sine", 0.12, 320); },
};