// Prozedurale Sound-Engine (Web Audio API): Busse für Master/Effekte/Musik/UI,
// 3D-Positionierung (HRTF), Hall, Entfernungs-Tiefpass und alle Spiel-, UI- und Musiksounds.
// Bewusst ohne Hintergrundrauschen (kein Wind/Meer/Sturm-Ambiente).

const A4 = 440;
const noteHz = (n) => A4 * Math.pow(2, (n - 69) / 12);

export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.ready = false;
    this.musicOn = false;
    this.lastStep = 0;
    settings.onChange((k) => {
      if (k.startsWith('vol')) this.applyVolumes();
      if (k === 'lobbyMusic' && !settings.get('lobbyMusic')) this.stopLobbyMusic();
      if (k === 'lobbyMusic' && settings.get('lobbyMusic') && this.wantLobbyMusic) this.startLobbyMusic();
    });
  }

  // Muss nach einer Nutzergeste aufgerufen werden
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.connect(this.comp);
    this.comp.connect(ctx.destination);
    this.bus = {};
    for (const b of ['sfx', 'music', 'ui']) {
      const g = ctx.createGain();
      g.connect(this.master);
      this.bus[b] = g;
    }
    // Hall
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(1.6, 2.6);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.35;
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.bus.sfx);
    // Rausch-Puffer
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    this.ready = true;
    if (this.wantLobbyMusic) this.startLobbyMusic();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings;
    const v = (k) => Math.max(0, Math.min(1, s.get(k) / 100));
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(v('volMaster'), t, 0.05);
    this.bus.sfx.gain.setTargetAtTime(v('volSfx'), t, 0.05);
    this.bus.music.gain.setTargetAtTime(v('volMusic') * 0.8, t, 0.05);
    this.bus.ui.gain.setTargetAtTime(v('volUi') * 0.7, t, 0.05);
  }

  makeImpulse(dur, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  // ---------- Bausteine ----------
  // Ausgabe-Knoten: optional 3D-Panner + Entfernungs-Tiefpass
  out(bus = 'sfx', pos = null, opts = {}) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = opts.gain ?? 1;
    let head = g;
    if (pos) {
      const p = ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = opts.ref ?? 4;
      p.maxDistance = 10000;
      p.rolloffFactor = opts.rolloff ?? 1;
      p.positionX.value = pos.x;
      p.positionY.value = pos.y;
      p.positionZ.value = pos.z;
      if (opts.dist !== undefined) {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = Math.max(500, 12000 / (1 + opts.dist / 25));
        g.connect(lp);
        lp.connect(p);
      } else {
        g.connect(p);
      }
      p.connect(this.bus[bus]);
      if (opts.reverb) {
        const s = ctx.createGain();
        s.gain.value = opts.reverb;
        p.connect(s);
        s.connect(this.reverb);
      }
    } else {
      g.connect(this.bus[bus]);
      if (opts.reverb) {
        const s = ctx.createGain();
        s.gain.value = opts.reverb;
        g.connect(s);
        s.connect(this.reverb);
      }
    }
    return head;
  }

  noiseHit(dest, t, { dur = 0.1, type = 'bandpass', freq = 1000, freqEnd = null, q = 1, gain = 0.5, attack = 0.002 } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = dur > 1.5;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(t, Math.random() * 1.2);
    src.stop(t + dur + 0.05);
    return g;
  }

  tone(dest, t, { type = 'sine', freq = 440, freqEnd = null, dur = 0.2, gain = 0.3, attack = 0.005, release = null } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(10, freqEnd), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (release ?? dur));
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + (release ?? dur) + 0.05);
    return o;
  }

  setListener(pos, fwd, up) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(pos.x, t, 0.02);
      l.positionY.setTargetAtTime(pos.y, t, 0.02);
      l.positionZ.setTargetAtTime(pos.z, t, 0.02);
      l.forwardX.setTargetAtTime(fwd.x, t, 0.02);
      l.forwardY.setTargetAtTime(fwd.y, t, 0.02);
      l.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
      l.upX.setTargetAtTime(up.x, t, 0.02);
      l.upY.setTargetAtTime(up.y, t, 0.02);
      l.upZ.setTargetAtTime(up.z, t, 0.02);
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }
    this.listenerPos = pos;
  }

  // ---------- Waffe ----------
  gunshot(pos = null, dist = 0) {
    if (!this.ready) return;
    const own = !pos;
    const delay = own ? 0 : Math.min(0.6, dist / 343);
    const t = this.now + delay;
    const far = Math.min(1, dist / 180);
    const d = this.out('sfx', pos, { gain: own ? 0.9 : 1.6, ref: 6, dist: own ? undefined : dist, reverb: own ? 0.35 : 0.5 + far * 0.4, rolloff: 0.9 });
    // Knall
    this.noiseHit(d, t, { dur: 0.07, type: 'highpass', freq: 1500 - far * 1100, gain: own ? 0.9 : 0.7 });
    // Körper
    this.noiseHit(d, t, { dur: 0.22 + far * 0.3, type: 'lowpass', freq: 1300 - far * 700, freqEnd: 180, gain: 0.8 });
    // Wumms
    this.tone(d, t, { type: 'sine', freq: 140, freqEnd: 42, dur: 0.16, gain: own ? 0.9 : 0.5 });
    if (own) {
      this.tone(d, t, { type: 'square', freq: 2400, freqEnd: 900, dur: 0.02, gain: 0.08 });
      this.noiseHit(d, t + 0.05, { dur: 0.05, type: 'bandpass', freq: 3200, q: 3, gain: 0.08 });
    }
  }

  dryFire() {
    if (!this.ready) return;
    const d = this.out('sfx');
    const t = this.now;
    this.noiseHit(d, t, { dur: 0.03, type: 'bandpass', freq: 3500, q: 4, gain: 0.35 });
    this.tone(d, t, { type: 'square', freq: 1800, freqEnd: 1200, dur: 0.02, gain: 0.08 });
  }

  reloadSounds(duration, empty) {
    if (!this.ready) return;
    const d = this.out('sfx');
    const t = this.now;
    // Magazin raus (Klick)
    this.noiseHit(d, t + duration * 0.14, { dur: 0.05, type: 'bandpass', freq: 2600, q: 5, gain: 0.35 });
    this.tone(d, t + duration * 0.14, { type: 'triangle', freq: 900, freqEnd: 600, dur: 0.05, gain: 0.12 });
    // Magazin rein (Klack)
    this.noiseHit(d, t + duration * 0.55, { dur: 0.07, type: 'bandpass', freq: 1400, q: 3, gain: 0.5 });
    this.tone(d, t + duration * 0.55, { type: 'square', freq: 320, freqEnd: 180, dur: 0.06, gain: 0.12 });
    // Durchladen (Ratsch)
    const r = t + duration * (empty ? 0.8 : 0.78);
    this.noiseHit(d, r, { dur: 0.09, type: 'bandpass', freq: 2000, freqEnd: 4200, q: 2, gain: 0.35 });
    this.noiseHit(d, r + 0.12, { dur: 0.06, type: 'bandpass', freq: 3000, freqEnd: 1500, q: 3, gain: 0.4 });
    this.tone(d, r + 0.12, { type: 'square', freq: 600, freqEnd: 300, dur: 0.04, gain: 0.08 });
  }

  otherReload(pos) {
    if (!this.ready) return;
    const d = this.out('sfx', pos, { gain: 0.6, ref: 3 });
    this.noiseHit(d, this.now + 0.3, { dur: 0.06, type: 'bandpass', freq: 1500, q: 3, gain: 0.4 });
    this.noiseHit(d, this.now + 1.2, { dur: 0.08, type: 'bandpass', freq: 2200, q: 2, gain: 0.35 });
  }

  impact(pos, mat) {
    if (!this.ready) return;
    const d = this.out('sfx', pos, { gain: 0.5, ref: 3 });
    const t = this.now;
    if (mat === 2) this.tone(d, t, { type: 'triangle', freq: 2200 + Math.random() * 800, freqEnd: 1600, dur: 0.12, gain: 0.25 });
    else if (mat === 1) this.noiseHit(d, t, { dur: 0.06, type: 'bandpass', freq: 900, q: 2, gain: 0.4 });
    else if (mat === 6) this.noiseHit(d, t, { dur: 0.15, type: 'bandpass', freq: 1200, freqEnd: 500, q: 1, gain: 0.35 });
    else this.noiseHit(d, t, { dur: 0.05, type: 'highpass', freq: 1800, gain: 0.3 });
  }

  bulletWhiz(pos) {
    if (!this.ready) return;
    const d = this.out('sfx', pos, { gain: 0.5, ref: 2 });
    this.noiseHit(d, this.now, { dur: 0.14, type: 'bandpass', freq: 4000, freqEnd: 1500, q: 6, gain: 0.35, attack: 0.03 });
  }

  // ---------- Treffer ----------
  hitmarker(head) {
    if (!this.ready) return;
    const d = this.out('sfx');
    const t = this.now;
    if (head) {
      this.tone(d, t, { type: 'sine', freq: 2093, dur: 0.35, gain: 0.35 });
      this.tone(d, t, { type: 'sine', freq: 3136, dur: 0.25, gain: 0.18 });
      this.tone(d, t, { type: 'triangle', freq: 4186, dur: 0.12, gain: 0.08 });
    } else {
      this.tone(d, t, { type: 'triangle', freq: 1500, freqEnd: 1100, dur: 0.06, gain: 0.3 });
      this.noiseHit(d, t, { dur: 0.03, type: 'highpass', freq: 3000, gain: 0.15 });
    }
  }

  killConfirm() {
    if (!this.ready) return;
    const d = this.out('sfx', null, { reverb: 0.3 });
    const t = this.now;
    this.tone(d, t, { type: 'sine', freq: 600, freqEnd: 1250, dur: 0.14, gain: 0.3 });
    for (const [f, g] of [[1318, 0.3], [1976, 0.18], [2637, 0.1]]) this.tone(d, t + 0.1, { type: 'sine', freq: f, dur: 0.9, gain: g });
  }

  elimination() {
    if (!this.ready) return;
    const d = this.out('sfx', null, { reverb: 0.4 });
    const t = this.now;
    this.noiseHit(d, t, { dur: 0.4, type: 'bandpass', freq: 600, freqEnd: 3000, q: 1, gain: 0.25, attack: 0.1 });
    [72, 76, 79, 84].forEach((n, i) => this.tone(d, t + 0.05 + i * 0.07, { type: 'triangle', freq: noteHz(n), dur: 0.5, gain: 0.18 }));
  }

  hurt() {
    if (!this.ready) return;
    const d = this.out('sfx');
    const t = this.now;
    this.tone(d, t, { type: 'sine', freq: 95, freqEnd: 50, dur: 0.18, gain: 0.7 });
    this.noiseHit(d, t, { dur: 0.1, type: 'lowpass', freq: 700, gain: 0.4 });
    if (Math.random() < 0.55) {
      // Stöhnen: Sägezahn durch Formantfilter
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const base = 150 + Math.random() * 40;
      o.frequency.setValueAtTime(base, t + 0.03);
      o.frequency.exponentialRampToValueAtTime(base * 0.7, t + 0.35);
      const f1 = ctx.createBiquadFilter();
      f1.type = 'bandpass'; f1.frequency.value = 650; f1.Q.value = 5;
      const f2 = ctx.createBiquadFilter();
      f2.type = 'bandpass'; f2.frequency.value = 1100; f2.Q.value = 6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.07);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
      o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(d);
      o.start(t + 0.03); o.stop(t + 0.42);
    }
  }

  // ---------- Heilen ----------
  healStart() {
    if (!this.ready) return;
    const d = this.out('sfx');
    const t = this.now;
    for (let i = 0; i < 7; i++) this.noiseHit(d, t + i * 0.12 + Math.random() * 0.04, { dur: 0.09, type: 'bandpass', freq: 2500 + Math.random() * 1500, q: 1.5, gain: 0.18 });
    this.noiseHit(d, t + 0.35, { dur: 0.45, type: 'highpass', freq: 5000, gain: 0.12, attack: 0.05 });
  }

  healDone() {
    if (!this.ready) return;
    const d = this.out('sfx', null, { reverb: 0.3 });
    const t = this.now;
    [84, 88, 91, 96].forEach((n, i) => this.tone(d, t + i * 0.07, { type: 'triangle', freq: noteHz(n), dur: 0.35, gain: 0.2 }));
    this.tone(d, t + 0.3, { type: 'sine', freq: noteHz(100), dur: 0.5, gain: 0.08 });
  }

  denied() {
    if (!this.ready) return;
    const d = this.out('ui');
    this.tone(d, this.now, { type: 'square', freq: 200, dur: 0.14, gain: 0.12 });
    this.tone(d, this.now + 0.08, { type: 'square', freq: 160, dur: 0.14, gain: 0.1 });
  }

  // ---------- Bewegung ----------
  footstep(surface, vol = 1, pos = null) {
    if (!this.ready) return;
    const d = this.out('sfx', pos, { gain: vol * (pos ? 1.3 : 0.55), ref: 3, rolloff: 1.4 });
    const t = this.now;
    const r = Math.random();
    switch (surface) {
      case 'grass':
        this.noiseHit(d, t, { dur: 0.09, type: 'bandpass', freq: 1800 + r * 900, q: 0.8, gain: 0.35 });
        this.noiseHit(d, t + 0.03, { dur: 0.06, type: 'highpass', freq: 4000, gain: 0.12 });
        break;
      case 'sand':
        this.noiseHit(d, t, { dur: 0.11, type: 'bandpass', freq: 900 + r * 500, q: 1.2, gain: 0.4 });
        this.noiseHit(d, t + 0.02, { dur: 0.05, type: 'highpass', freq: 3000, gain: 0.15 });
        break;
      case 'wood':
        this.tone(d, t, { type: 'sine', freq: 170 + r * 40, freqEnd: 110, dur: 0.09, gain: 0.45 });
        this.noiseHit(d, t, { dur: 0.05, type: 'bandpass', freq: 700, q: 2, gain: 0.3 });
        break;
      case 'stone':
      case 'metal':
        this.noiseHit(d, t, { dur: 0.04, type: 'highpass', freq: 2500, gain: 0.35 });
        this.tone(d, t, { type: surface === 'metal' ? 'square' : 'triangle', freq: surface === 'metal' ? 700 : 400, freqEnd: 250, dur: 0.05, gain: 0.12 });
        break;
      case 'water':
        this.noiseHit(d, t, { dur: 0.18, type: 'bandpass', freq: 500, freqEnd: 1500, q: 1.5, gain: 0.45 });
        this.noiseHit(d, t + 0.05, { dur: 0.12, type: 'highpass', freq: 3500, gain: 0.15 });
        break;
      default:
        this.noiseHit(d, t, { dur: 0.08, type: 'bandpass', freq: 1200, q: 1, gain: 0.35 });
    }
  }

  jump() {
    if (!this.ready) return;
    const d = this.out('sfx');
    this.noiseHit(d, this.now, { dur: 0.16, type: 'bandpass', freq: 500, freqEnd: 1400, q: 1, gain: 0.18, attack: 0.03 });
  }

  land(intensity = 1) {
    if (!this.ready) return;
    const d = this.out('sfx');
    const t = this.now;
    this.tone(d, t, { type: 'sine', freq: 90, freqEnd: 45, dur: 0.14, gain: 0.35 * intensity });
    this.noiseHit(d, t, { dur: 0.1, type: 'lowpass', freq: 500, gain: 0.35 * intensity });
  }

  slide() {
    if (!this.ready) return;
    const d = this.out('sfx');
    const t = this.now;
    this.noiseHit(d, t, { dur: 0.95, type: 'lowpass', freq: 1400, freqEnd: 400, gain: 0.35, attack: 0.04 });
    this.noiseHit(d, t, { dur: 0.8, type: 'bandpass', freq: 3200, freqEnd: 1800, q: 2, gain: 0.12, attack: 0.05 });
  }

  breath() {
    if (!this.ready) return;
    const d = this.out('sfx', null, { gain: 0.5 });
    const t = this.now;
    this.noiseHit(d, t, { dur: 0.45, type: 'bandpass', freq: 1000, q: 1.2, gain: 0.12, attack: 0.18 });
    this.noiseHit(d, t + 0.55, { dur: 0.5, type: 'bandpass', freq: 750, q: 1.2, gain: 0.14, attack: 0.1 });
  }

  // ---------- Countdown / Sieg / Niederlage ----------
  beep(final = false) {
    if (!this.ready) return;
    const d = this.out('sfx');
    if (final) {
      this.tone(d, this.now, { type: 'square', freq: 1320, dur: 0.4, gain: 0.18 });
      this.tone(d, this.now, { type: 'square', freq: 1760, dur: 0.4, gain: 0.1 });
    } else this.tone(d, this.now, { type: 'square', freq: 880, dur: 0.14, gain: 0.16 });
  }

  brass(dest, t, midi, dur, gain = 0.18) {
    const ctx = this.ctx;
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = noteHz(midi);
      o.detune.value = det;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(400, t);
      f.frequency.exponentialRampToValueAtTime(3200, t + 0.06);
      f.frequency.exponentialRampToValueAtTime(1400, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.03);
      g.gain.setValueAtTime(gain * 0.8, t + dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f); f.connect(g); g.connect(dest);
      o.start(t); o.stop(t + dur + 0.05);
    }
  }

  drum(dest, t, kind) {
    if (kind === 'kick') this.tone(dest, t, { type: 'sine', freq: 150, freqEnd: 40, dur: 0.25, gain: 0.6 });
    else if (kind === 'snare') {
      this.noiseHit(dest, t, { dur: 0.18, type: 'highpass', freq: 1500, gain: 0.35 });
      this.tone(dest, t, { type: 'triangle', freq: 220, freqEnd: 150, dur: 0.1, gain: 0.25 });
    } else this.noiseHit(dest, t, { dur: 0.05, type: 'highpass', freq: 7000, gain: 0.12 });
  }

  victory() {
    if (!this.ready) return;
    const d = this.out('music', null, { reverb: 0.4, gain: 1.2 });
    const t = this.now + 0.05;
    const b = 0.16;
    const seq = [[67, 0, 1], [67, 1, 1], [67, 2, 1], [72, 3, 3], [76, 6, 3], [79, 9, 2], [76, 11, 1], [79, 12, 6]];
    for (const [n, s, l] of seq) this.brass(d, t + s * b, n, l * b + 0.05, 0.16);
    for (const n of [60, 64, 67, 72]) this.brass(d, t + 12 * b, n, 6 * b + 0.6, 0.08);
    for (let i = 0; i < 12; i += 3) this.drum(d, t + i * b, 'snare');
    this.drum(d, t + 12 * b, 'kick');
    this.drum(d, t + 12 * b, 'snare');
    for (let i = 0; i < 8; i++) this.drum(d, t + (12 + i * 0.5) * b, 'hat');
  }

  defeat() {
    if (!this.ready) return;
    const d = this.out('music', null, { reverb: 0.5 });
    const t = this.now + 0.05;
    [64, 63, 62, 61].forEach((n, i) => {
      this.tone(d, t + i * 0.35, { type: 'triangle', freq: noteHz(n), dur: 0.5, gain: 0.2 });
      this.tone(d, t + i * 0.35, { type: 'sine', freq: noteHz(n - 12), dur: 0.5, gain: 0.12 });
    });
    this.tone(d, t + 1.4, { type: 'sine', freq: noteHz(45), dur: 1.4, gain: 0.25 });
  }

  // ---------- UI ----------
  uiHover() {
    if (!this.ready) return;
    this.tone(this.out('ui'), this.now, { type: 'sine', freq: 2300, dur: 0.03, gain: 0.08 });
  }
  uiClick() {
    if (!this.ready) return;
    const d = this.out('ui');
    this.tone(d, this.now, { type: 'sine', freq: 900, freqEnd: 450, dur: 0.07, gain: 0.3 });
    this.noiseHit(d, this.now, { dur: 0.02, type: 'highpass', freq: 5000, gain: 0.08 });
  }
  uiType() {
    if (!this.ready) return;
    this.noiseHit(this.out('ui'), this.now, { dur: 0.018, type: 'bandpass', freq: 3500 + Math.random() * 1500, q: 3, gain: 0.25 });
  }
  uiError() { this.denied(); }
  uiConfirm() {
    if (!this.ready) return;
    const d = this.out('ui', null, { reverb: 0.3 });
    [72, 76, 79, 84].forEach((n, i) => this.tone(d, this.now + i * 0.06, { type: 'triangle', freq: noteHz(n), dur: 0.3, gain: 0.22 }));
  }
  friendRequest() {
    if (!this.ready) return;
    const d = this.out('ui', null, { reverb: 0.2 });
    this.tone(d, this.now, { type: 'sine', freq: noteHz(79), dur: 0.25, gain: 0.25 });
    this.tone(d, this.now + 0.14, { type: 'sine', freq: noteHz(84), dur: 0.35, gain: 0.25 });
  }
  inviteSound() {
    if (!this.ready) return;
    const d = this.out('ui', null, { reverb: 0.3 });
    [[76, 0], [72, 0.16], [79, 0.32]].forEach(([n, dt]) => this.tone(d, this.now + dt, { type: 'triangle', freq: noteHz(n), dur: 0.35, gain: 0.28 }));
  }
  notify() {
    if (!this.ready) return;
    this.tone(this.out('ui'), this.now, { type: 'sine', freq: noteHz(81), dur: 0.2, gain: 0.18 });
  }

  // ---------- Lobby-Musik (ruhiger Loop) ----------
  startLobbyMusic() {
    this.wantLobbyMusic = true;
    if (!this.ready || this.musicOn || !this.settings.get('lobbyMusic')) return;
    this.musicOn = true;
    const ctx = this.ctx;
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0;
    this.musicGain.gain.setTargetAtTime(0.9, ctx.currentTime, 1.0);
    this.musicGain.connect(this.bus.music);
    this.musicRev = ctx.createGain();
    this.musicRev.gain.value = 0.4;
    this.musicGain.connect(this.musicRev);
    this.musicRev.connect(this.reverb);
    const bpm = 84;
    this.beat = 60 / bpm;
    this.musicStep = 0;
    this.musicNext = ctx.currentTime + 0.1;
    // Am7 - Dm7 - G7 - Cmaj7 (je 1 Takt), Pentatonik-Arpeggien
    this.chords = [[57, 60, 64, 67], [50, 57, 60, 65], [55, 59, 62, 65], [48, 55, 59, 64]];
    this.musicTimer = setInterval(() => this.scheduleMusic(), 80);
  }

  scheduleMusic() {
    if (!this.musicOn) return;
    const ctx = this.ctx;
    while (this.musicNext < ctx.currentTime + 0.3) {
      const step = this.musicStep;
      const t = this.musicNext;
      const bar = Math.floor(step / 8) % 4;
      const chord = this.chords[bar];
      const d = this.musicGain;
      if (step % 8 === 0) {
        // Pad
        for (const n of chord) {
          const o = ctx.createOscillator();
          o.type = 'triangle';
          o.frequency.value = noteHz(n);
          const f = ctx.createBiquadFilter();
          f.type = 'lowpass';
          f.frequency.value = 900;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.045, t + 0.8);
          g.gain.exponentialRampToValueAtTime(0.0001, t + this.beat * 4.2);
          o.connect(f); f.connect(g); g.connect(d);
          o.start(t); o.stop(t + this.beat * 4.3);
        }
        this.tone(d, t, { type: 'sine', freq: noteHz(chord[0] - 12), dur: this.beat * 3.8, gain: 0.12, attack: 0.05 });
      }
      // Marimba-Arpeggio (Achtel)
      const pattern = [0, 2, 1, 3, 2, 1, 3, 2];
      if ((step * 7) % 5 !== 4) {
        const n = chord[pattern[step % 8]] + 12 + (step % 16 >= 12 ? 12 : 0);
        this.tone(d, t, { type: 'sine', freq: noteHz(n), dur: 0.35, gain: 0.07, attack: 0.003 });
        this.tone(d, t, { type: 'sine', freq: noteHz(n) * 4, dur: 0.08, gain: 0.012, attack: 0.002 });
      }
      // Shaker
      this.noiseHit(d, t, { dur: 0.05, type: 'highpass', freq: 7000, gain: step % 2 ? 0.025 : 0.045 });
      if (step % 8 === 4) this.noiseHit(d, t, { dur: 0.1, type: 'bandpass', freq: 1800, q: 1, gain: 0.05 });
      this.musicStep++;
      this.musicNext += this.beat / 2;
    }
  }

  stopLobbyMusic() {
    this.wantLobbyMusic = false;
    if (!this.musicOn) return;
    this.musicOn = false;
    clearInterval(this.musicTimer);
    const g = this.musicGain;
    g.gain.setTargetAtTime(0, this.now, 0.4);
    setTimeout(() => g.disconnect(), 2000);
  }
}
