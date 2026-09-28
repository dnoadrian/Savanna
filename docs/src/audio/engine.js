// Prozedurale Sound-Engine (Web Audio API): Busse für Master/Effekte/Musik/UI,
// 3D-Positionierung (HRTF), Hall, Entfernungs-Tiefpass und alle Spiel-, UI- und Musiksounds.
// Bewusst ohne Hintergrundrauschen (kein Wind/Meer/Sturm-Ambiente).

const A4 = 440;
const noteHz = (n) => A4 * Math.pow(2, (n - 69) / 12);

// Klangprofile der Waffen (Knall, Körper, Wumms)
const GUN_SOUNDS = {
  pistol: { vol: 0.8, ref: 5, verb: 0.8, crack: 0.05, crackF: 2200, crackG: 1, body: 0.12, bodyF: 1800, bodyG: 0.6, thump: 170, thumpD: 0.1, thumpG: 0.6, mech: 2800 },
  ar: { vol: 1, ref: 6, verb: 1, crack: 0.07, crackF: 1500, crackG: 1, body: 0.22, bodyF: 1300, bodyG: 0.85, thump: 140, thumpD: 0.16, thumpG: 1, mech: 2400 },
  drum: { vol: 0.85, ref: 5, verb: 0.8, crack: 0.05, crackF: 1900, crackG: 0.9, body: 0.14, bodyF: 1500, bodyG: 0.7, thump: 150, thumpD: 0.1, thumpG: 0.7, mech: 3000 },
  tac: { vol: 1.15, ref: 7, verb: 1.1, crack: 0.09, crackF: 1100, crackG: 1, body: 0.38, bodyF: 900, bodyG: 1, thump: 105, thumpD: 0.26, thumpG: 1.2, mech: 1800 },
  pump: { vol: 1.25, ref: 8, verb: 1.2, crack: 0.1, crackF: 1000, crackG: 1.1, body: 0.45, bodyF: 850, bodyG: 1.1, thump: 90, thumpD: 0.3, thumpG: 1.35, mech: 1600 },
  hammer: { vol: 1.2, ref: 8, verb: 1.15, crack: 0.1, crackF: 1250, crackG: 1.15, body: 0.4, bodyF: 950, bodyG: 1.05, thump: 100, thumpD: 0.27, thumpG: 1.3, mech: 1900 },
  sniper: { vol: 1.4, ref: 10, verb: 1.6, crack: 0.12, crackF: 2400, crackG: 1.2, body: 0.7, bodyF: 1100, bodyG: 1, thump: 80, thumpD: 0.4, thumpG: 1.4, mech: 2000 },
};

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
    this.samples = {};
    this.loadSample('scar', 'sounds/scar-shot.mp3');
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
  // type: pistol | ar | drum | tac | pump | sniper
  // Aufgenommene Samples (z. B. SCAR-Schuss) laden – bis sie da sind, klingt alles prozedural
  loadSample(name, url) {
    fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
      .then((buf) => this.ctx.decodeAudioData(buf))
      .then((ab) => { this.samples[name] = ab; })
      .catch(() => { /* ohne Sample: prozeduraler Klang */ });
  }

  playSample(name, dest, t, rate = 1, gain = 1) {
    const buf = this.samples && this.samples[name];
    if (!buf) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(dest);
    src.start(t);
    return true;
  }

  // type: pistol | ar | drum | tac | pump | sniper
  // Messer: scharfes Wusch durch die Luft (leicht zufällige Tonhöhe)
  knifeSwing(pos = null) {
    if (!this.ready) return;
    const d = this.out('sfx', pos, { gain: pos ? 1 : 0.8, ref: 3 });
    const t = this.now;
    const f = 2200 + Math.random() * 900;
    this.noiseHit(d, t, { dur: 0.16, type: 'bandpass', freq: f * 0.6, freqEnd: f * 1.6, q: 2.2, gain: 0.35, attack: 0.03 });
    this.noiseHit(d, t + 0.05, { dur: 0.08, type: 'highpass', freq: 5000, gain: 0.08 });
  }

  // Messer trifft: dumpfer Einschlag + kurzes metallisches Klingen
  knifeHit() {
    if (!this.ready) return;
    const d = this.out('sfx');
    const t = this.now;
    this.tone(d, t, { type: 'sine', freq: 180, freqEnd: 70, dur: 0.12, gain: 0.45 });
    this.noiseHit(d, t, { dur: 0.07, type: 'lowpass', freq: 1400, gain: 0.35 });
    this.tone(d, t + 0.01, { type: 'triangle', freq: 2600, freqEnd: 2300, dur: 0.18, gain: 0.07 });
  }

  gunshot(pos = null, dist = 0, type = 'ar') {
    if (type === 'knife') { this.knifeSwing(pos); return; }
    if (!this.ready) return;
    const own = !pos;
    const delay = own ? 0 : Math.min(0.6, dist / 343);
    const t = this.now + delay;
    const far = Math.min(1, dist / 180);
    const P = GUN_SOUNDS[type] || GUN_SOUNDS.ar;
    const d = this.out('sfx', pos, { gain: (own ? 0.85 : 1.6) * P.vol, ref: P.ref, dist: own ? undefined : dist, reverb: (own ? 0.25 : 0.5 + far * 0.4) * P.verb, rolloff: 0.9 });
    const jitter = 0.97 + Math.random() * 0.06;
    // SCAR: echtes Sample (leicht variiert), Pistole/Trommel nutzen es höher gestimmt als Schicht
    const sample = type === 'ar' ? this.playSample('scar', d, t, jitter, own ? 1.15 : 1.4)
      : type === 'drum' ? this.playSample('scar', d, t, 1.2 * jitter, 0.55)
        : type === 'pistol' ? this.playSample('scar', d, t, 1.4 * jitter, 0.45) : false;
    if (!sample || type !== 'ar') {
      const k = sample ? 0.55 : 1;
      // Knall (hoher Anteil)
      this.noiseHit(d, t, { dur: P.crack, type: 'highpass', freq: P.crackF - far * 1100, gain: (own ? 0.9 : 0.7) * P.crackG * k });
      // Körper
      this.noiseHit(d, t, { dur: P.body + far * 0.3, type: 'lowpass', freq: P.bodyF - far * 600, freqEnd: 160, gain: P.bodyG * k });
      // Wumms
      this.tone(d, t, { type: 'sine', freq: P.thump, freqEnd: P.thump * 0.3, dur: P.thumpD, gain: (own ? 0.95 : 0.5) * P.thumpG });
      // Schrot/Sniper: zusätzlicher tiefer Druck + Hallfahne
      if (type === 'pump' || type === 'tac' || type === 'hammer' || type === 'sniper') {
        this.tone(d, t, { type: 'triangle', freq: 70, freqEnd: 38, dur: 0.35, gain: own ? 0.6 : 0.35 });
        this.noiseHit(d, t + 0.02, { dur: 0.5 + far * 0.4, type: 'lowpass', freq: 700, freqEnd: 120, gain: 0.35 });
      }
    }
    if (own) {
      // mechanisches Klicken des Verschlusses
      this.tone(d, t, { type: 'square', freq: P.mech, freqEnd: P.mech * 0.4, dur: 0.02, gain: 0.06 });
      this.noiseHit(d, t + 0.045, { dur: 0.04, type: 'bandpass', freq: 3200, q: 3, gain: 0.06 });
      if (type === 'pump') this.pumpAction(d, t + 0.42);
      if (type === 'hammer') this.pumpAction(d, t + 0.3);
      if (type === 'sniper') this.boltAction(d, t + 0.62);
    }
  }

  pumpAction(d, t) {
    this.noiseHit(d, t, { dur: 0.08, type: 'bandpass', freq: 1300, freqEnd: 2600, q: 2, gain: 0.45 });
    this.tone(d, t, { type: 'square', freq: 420, freqEnd: 260, dur: 0.05, gain: 0.1 });
    this.noiseHit(d, t + 0.14, { dur: 0.07, type: 'bandpass', freq: 2400, freqEnd: 1200, q: 2, gain: 0.5 });
    this.tone(d, t + 0.14, { type: 'square', freq: 520, freqEnd: 300, dur: 0.05, gain: 0.12 });
  }

  boltAction(d, t) {
    this.noiseHit(d, t, { dur: 0.06, type: 'bandpass', freq: 2800, q: 4, gain: 0.35 });
    this.noiseHit(d, t + 0.16, { dur: 0.1, type: 'bandpass', freq: 1600, freqEnd: 3200, q: 2, gain: 0.35 });
    this.noiseHit(d, t + 0.34, { dur: 0.08, type: 'bandpass', freq: 3000, freqEnd: 1500, q: 3, gain: 0.4 });
    this.tone(d, t + 0.34, { type: 'square', freq: 700, freqEnd: 350, dur: 0.04, gain: 0.08 });
  }

  dryFire() {
    if (!this.ready) return;
    const d = this.out('sfx');
    const t = this.now;
    this.noiseHit(d, t, { dur: 0.03, type: 'bandpass', freq: 3500, q: 4, gain: 0.35 });
    this.tone(d, t, { type: 'square', freq: 1800, freqEnd: 1200, dur: 0.02, gain: 0.08 });
  }

  // Magazin-Nachladen (Schrotflinten laden Patrone für Patrone → shellInsert)
  reloadSounds(type, duration, empty) {
    if (!this.ready) return;
    const d = this.out('sfx');
    const t = this.now;
    if (type === 'tac' || type === 'pump' || type === 'hammer') {
      this.noiseHit(d, t + 0.05, { dur: 0.05, type: 'bandpass', freq: 1800, q: 3, gain: 0.25 });
      return;
    }
    // Magazin raus (Klick)
    this.noiseHit(d, t + duration * 0.14, { dur: 0.05, type: 'bandpass', freq: 2600, q: 5, gain: 0.35 });
    this.tone(d, t + duration * 0.14, { type: 'triangle', freq: 900, freqEnd: 600, dur: 0.05, gain: 0.12 });
    if (type === 'drum') this.noiseHit(d, t + duration * 0.3, { dur: 0.25, type: 'bandpass', freq: 2200, q: 2, gain: 0.12 });
    // Magazin rein (Klack)
    this.noiseHit(d, t + duration * 0.55, { dur: 0.07, type: 'bandpass', freq: 1400, q: 3, gain: 0.5 });
    this.tone(d, t + duration * 0.55, { type: 'square', freq: 320, freqEnd: 180, dur: 0.06, gain: 0.12 });
    // Durchladen (Ratsch)
    if (type === 'sniper') {
      this.boltAction(d, t + duration * 0.7);
      return;
    }
    const r = t + duration * (empty ? 0.8 : 0.78);
    this.noiseHit(d, r, { dur: 0.09, type: 'bandpass', freq: 2000, freqEnd: 4200, q: 2, gain: 0.35 });
    this.noiseHit(d, r + 0.12, { dur: 0.06, type: 'bandpass', freq: 3000, freqEnd: 1500, q: 3, gain: 0.4 });
    this.tone(d, r + 0.12, { type: 'square', freq: 600, freqEnd: 300, dur: 0.04, gain: 0.08 });
  }

  // eine Schrotpatrone eingeschoben
  shellInsert() {
    if (!this.ready) return;
    const d = this.out('sfx');
    const t = this.now;
    this.noiseHit(d, t, { dur: 0.05, type: 'bandpass', freq: 1500, q: 3, gain: 0.45 });
    this.tone(d, t, { type: 'triangle', freq: 520, freqEnd: 360, dur: 0.05, gain: 0.14 });
    this.noiseHit(d, t + 0.05, { dur: 0.03, type: 'highpass', freq: 3500, gain: 0.12 });
  }

  // Gegenstand fallen lassen: kurzes Wusch + dumpfes Aufkommen
  dropItem() {
    if (!this.ready) return;
    const d = this.out('sfx');
    const t = this.now;
    this.noiseHit(d, t, { dur: 0.12, type: 'bandpass', freq: 1400, freqEnd: 500, q: 1.2, gain: 0.2 });
    this.tone(d, t + 0.14, { type: 'sine', freq: 160, freqEnd: 90, dur: 0.08, gain: 0.25 });
  }

  // Waffe/Gegenstand in die Hand nehmen
  equip(item) {
    if (!this.ready || !item) return;
    const d = this.out('sfx');
    const t = this.now;
    if (item.k === 'w') {
      this.noiseHit(d, t, { dur: 0.06, type: 'bandpass', freq: 1800, q: 2, gain: 0.3 });
      this.tone(d, t + 0.02, { type: 'square', freq: 380, freqEnd: 240, dur: 0.04, gain: 0.08 });
      if (item.w === 'pump' || item.w === 'hammer') this.pumpAction(d, t + 0.12);
      else if (item.w === 'tac') this.noiseHit(d, t + 0.1, { dur: 0.05, type: 'bandpass', freq: 2600, q: 3, gain: 0.3 });
      else this.noiseHit(d, t + 0.1, { dur: 0.05, type: 'bandpass', freq: 3000, freqEnd: 2000, q: 3, gain: 0.25 });
    } else {
      this.noiseHit(d, t, { dur: 0.08, type: 'bandpass', freq: 1200, q: 1.5, gain: 0.2 });
    }
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
  // Körper: kurzes „Tick“, Kopf: helles „Ding“, Schild: gläsernes Klirren
  // Treffer wie im Original: Körper = kurzes „Tick“, Schild = gläsernes „Tink“, Kopf = heller „Ding“
  hitmarker(head, shield = false) {
    if (!this.ready) return;
    const now = this.now;
    if (now - (this.lastHitT || 0) < 0.035 && !head) return; // Schrot: nicht 10x
    this.lastHitT = now;
    const d = this.out('sfx');
    const t = now;
    if (head) {
      for (const [f, g, dur] of [[2350, 0.34, 0.45], [4700, 0.14, 0.3], [7050, 0.05, 0.18]]) this.tone(d, t, { type: 'sine', freq: f, dur, gain: g, attack: 0.002 });
      this.noiseHit(d, t, { dur: 0.02, type: 'highpass', freq: 6000, gain: 0.18 });
    } else if (shield) {
      this.tone(d, t, { type: 'sine', freq: 2900, freqEnd: 2600, dur: 0.1, gain: 0.2 });
      this.tone(d, t, { type: 'sine', freq: 4350, dur: 0.07, gain: 0.1 });
      this.noiseHit(d, t, { dur: 0.035, type: 'bandpass', freq: 7000, q: 2, gain: 0.2 });
    } else {
      this.tone(d, t, { type: 'triangle', freq: 1650, freqEnd: 1250, dur: 0.05, gain: 0.32 });
      this.noiseHit(d, t, { dur: 0.018, type: 'highpass', freq: 3500, gain: 0.2 });
    }
  }

  // Schild eines Gegners (oder der eigene) bricht
  // Schild bricht: scharfer Glas-Crack, klirrende Splitter (unharmonische Obertöne), Sog nach unten
  shieldBreak(pos, own = false) {
    if (!this.ready) return;
    const d = this.out('sfx', pos, { gain: pos ? 1.4 : own ? 1.15 : 0.9, ref: 6, reverb: 0.35 });
    const t = this.now;
    // eigener Schildbruch beim Gegner: zusätzlicher heller Bestätigungs-Klang
    if (own) [88, 95].forEach((n, i) => this.tone(d, t + 0.06 + i * 0.05, { type: 'triangle', freq: noteHz(n), dur: 0.3, gain: 0.12 }));
    this.noiseHit(d, t, { dur: 0.06, type: 'highpass', freq: 2500, gain: 0.7 });
    this.noiseHit(d, t, { dur: 0.25, type: 'bandpass', freq: 5200, freqEnd: 2600, q: 1.5, gain: 0.35 });
    for (const [f, g, dt] of [[2110, 0.22, 0], [3340, 0.16, 0.012], [4720, 0.12, 0.02], [6180, 0.08, 0.03], [8050, 0.05, 0.04]]) {
      this.tone(d, t + dt, { type: 'sine', freq: f, freqEnd: f * 0.93, dur: 0.45, gain: g, attack: 0.001 });
    }
    for (let i = 0; i < 8; i++) this.noiseHit(d, t + 0.05 + i * 0.03 + Math.random() * 0.02, { dur: 0.03, type: 'bandpass', freq: 3500 + Math.random() * 5000, q: 6, gain: 0.12 });
    this.tone(d, t, { type: 'sine', freq: 420, freqEnd: 90, dur: 0.3, gain: 0.3 });
  }

  // Eliminierung: satter Schlag + aufsteigender Chime
  killConfirm() {
    if (!this.ready) return;
    const d = this.out('sfx', null, { reverb: 0.35 });
    const t = this.now;
    this.tone(d, t, { type: 'sine', freq: 110, freqEnd: 45, dur: 0.25, gain: 0.55 });
    this.noiseHit(d, t, { dur: 0.08, type: 'lowpass', freq: 1200, gain: 0.35 });
    this.tone(d, t + 0.02, { type: 'sine', freq: 700, freqEnd: 1400, dur: 0.12, gain: 0.25 });
    for (const [f, g] of [[1397, 0.28], [2093, 0.18], [2794, 0.1]]) this.tone(d, t + 0.1, { type: 'sine', freq: f, dur: 1.0, gain: g });
  }

  elimination() {
    if (!this.ready) return;
    const d = this.out('sfx', null, { reverb: 0.4 });
    const t = this.now;
    this.noiseHit(d, t, { dur: 0.4, type: 'bandpass', freq: 600, freqEnd: 3000, q: 1, gain: 0.25, attack: 0.1 });
    [72, 76, 79, 84].forEach((n, i) => this.tone(d, t + 0.05 + i * 0.07, { type: 'triangle', freq: noteHz(n), dur: 0.5, gain: 0.18 }));
  }

  // Siphon nach einem Kill: aufsteigendes Funkeln
  siphon() {
    if (!this.ready) return;
    const d = this.out('sfx', null, { reverb: 0.35 });
    const t = this.now + 0.35;
    [79, 83, 86, 91, 95].forEach((n, i) => this.tone(d, t + i * 0.05, { type: 'sine', freq: noteHz(n), dur: 0.4, gain: 0.12 }));
    this.noiseHit(d, t, { dur: 0.5, type: 'bandpass', freq: 3000, freqEnd: 8000, q: 2, gain: 0.1, attack: 0.1 });
  }

  hurt(vol = 1) {
    if (!this.ready) return;
    const d = this.out('sfx', null, { gain: vol });
    const t = this.now;
    this.tone(d, t, { type: 'sine', freq: 95, freqEnd: 50, dur: 0.18, gain: 0.7 });
    this.noiseHit(d, t, { dur: 0.1, type: 'lowpass', freq: 700, gain: 0.4 });
    if (vol >= 1 && Math.random() < 0.5) {
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

  // eigener Schild wird getroffen
  shieldHurt() {
    if (!this.ready) return;
    const d = this.out('sfx');
    const t = this.now;
    this.tone(d, t, { type: 'sine', freq: 130, freqEnd: 70, dur: 0.14, gain: 0.5 });
    this.tone(d, t, { type: 'triangle', freq: 1320, freqEnd: 990, dur: 0.1, gain: 0.12 });
    this.noiseHit(d, t, { dur: 0.06, type: 'highpass', freq: 4500, gain: 0.14 });
  }

  // ---------- Truhen & Beute ----------
  chestOpen(pos = null) {
    if (!this.ready) return;
    const d = this.out('sfx', pos, { gain: pos ? 1.2 : 0.85, ref: 5, reverb: 0.45 });
    const t = this.now;
    // Holz knarrt, Deckel springt auf
    this.noiseHit(d, t, { dur: 0.16, type: 'bandpass', freq: 480, freqEnd: 950, q: 7, gain: 0.35 });
    this.tone(d, t, { type: 'sawtooth', freq: 105, freqEnd: 150, dur: 0.15, gain: 0.07 });
    this.noiseHit(d, t + 0.15, { dur: 0.07, type: 'bandpass', freq: 1300, q: 2, gain: 0.5 });
    this.tone(d, t + 0.15, { type: 'sine', freq: 190, freqEnd: 80, dur: 0.14, gain: 0.45 });
    // magischer Ausbruch: Glitzer-Arpeggio + Glanz
    [76, 81, 84, 88, 93, 96].forEach((n, i) => this.tone(d, t + 0.18 + i * 0.05, { type: 'sine', freq: noteHz(n), dur: 0.6, gain: 0.12 }));
    [88, 93].forEach((n, i) => this.tone(d, t + 0.2 + i * 0.07, { type: 'triangle', freq: noteHz(n + 12), dur: 0.3, gain: 0.05 }));
    this.noiseHit(d, t + 0.18, { dur: 0.8, type: 'bandpass', freq: 6500, freqEnd: 10000, q: 3, gain: 0.1, attack: 0.08 });
  }

  // leises, schimmerndes Summen der nächsten geschlossenen Truhe (pos=null → aus)
  // Truhen-Klang in der Nähe: schimmernder Chor-Ton + zufälliges Glitzern (pos=null → aus)
  chestHum(pos, dist = 0) {
    if (!this.ready) return;
    const ctx = this.ctx;
    if (!this.hum) {
      const g = ctx.createGain();
      g.gain.value = 0;
      const p = ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 2;
      p.rolloffFactor = 1.2;
      g.connect(p);
      p.connect(this.bus.sfx);
      const trem = ctx.createGain();
      trem.gain.value = 0.7;
      trem.connect(g);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 4.6;
      const lfoG = ctx.createGain();
      lfoG.gain.value = 0.3;
      lfo.connect(lfoG);
      lfoG.connect(trem.gain);
      lfo.start();
      for (const [n, det] of [[69, -6], [76, 5], [81, -3], [88, 4]]) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = noteHz(n);
        o.detune.value = det;
        const og = ctx.createGain();
        og.gain.value = n > 80 ? 0.03 : 0.05;
        o.connect(og);
        og.connect(trem);
        o.start();
      }
      this.hum = { g, p, next: 0 };
    }
    const t = ctx.currentTime;
    const near = pos ? Math.max(0, 1 - dist / 16) : 0;
    this.hum.g.gain.setTargetAtTime(near * 0.55, t, 0.15);
    if (pos) {
      this.hum.p.positionX.setTargetAtTime(pos.x, t, 0.05);
      this.hum.p.positionY.setTargetAtTime(pos.y, t, 0.05);
      this.hum.p.positionZ.setTargetAtTime(pos.z, t, 0.05);
      // Glitzern: kleine Glöckchen-Töne in unregelmäßigen Abständen
      if (near > 0.05 && t > this.hum.next) {
        this.hum.next = t + 0.25 + Math.random() * 0.45;
        const d = this.out('sfx', pos, { gain: near * 0.7, ref: 2, rolloff: 1.3 });
        const notes = [88, 91, 93, 96, 100];
        const n = notes[Math.floor(Math.random() * notes.length)];
        this.tone(d, t, { type: 'sine', freq: noteHz(n), dur: 0.35, gain: 0.08, attack: 0.004 });
        if (Math.random() < 0.4) this.tone(d, t + 0.06, { type: 'sine', freq: noteHz(n + 5), dur: 0.3, gain: 0.05 });
      }
    }
  }

  // Aufheben: Munition = Kisten-Klack + Patronen-Klimpern, Waffe = metallisches Durchladen,
  // Schild/Medikit = weiches „Plopp“
  pickup(item) {
    if (!this.ready || !item) return;
    const d = this.out('sfx', null, { reverb: 0.1 });
    const t = this.now;
    if (item.k === 'a') {
      this.noiseHit(d, t, { dur: 0.05, type: 'bandpass', freq: 900, q: 2, gain: 0.45 });
      this.tone(d, t, { type: 'triangle', freq: 260, freqEnd: 180, dur: 0.06, gain: 0.2 });
      for (let i = 0; i < 4; i++) {
        const tt = t + 0.05 + i * 0.035 + Math.random() * 0.015;
        this.tone(d, tt, { type: 'triangle', freq: 3200 + Math.random() * 1600, freqEnd: 2600, dur: 0.05, gain: 0.08 });
        this.noiseHit(d, tt, { dur: 0.02, type: 'highpass', freq: 5000, gain: 0.08 });
      }
    } else if (item.k === 'w') {
      this.noiseHit(d, t, { dur: 0.09, type: 'bandpass', freq: 1400, freqEnd: 2600, q: 2, gain: 0.45 });
      this.tone(d, t, { type: 'square', freq: 380, freqEnd: 220, dur: 0.05, gain: 0.1 });
      this.noiseHit(d, t + 0.12, { dur: 0.06, type: 'bandpass', freq: 2800, freqEnd: 1600, q: 3, gain: 0.5 });
      this.tone(d, t + 0.12, { type: 'square', freq: 620, freqEnd: 340, dur: 0.04, gain: 0.12 });
      this.tone(d, t + 0.02, { type: 'sine', freq: 520, freqEnd: 1040, dur: 0.14, gain: 0.08 });
    } else {
      this.tone(d, t, { type: 'sine', freq: 480, freqEnd: 1100, dur: 0.1, gain: 0.22 });
      this.noiseHit(d, t, { dur: 0.05, type: 'bandpass', freq: 2200, q: 2, gain: 0.12 });
      this.tone(d, t + 0.06, { type: 'sine', freq: 1320, dur: 0.18, gain: 0.08 });
    }
  }

  // ---------- Heilen / Schild ----------
  useStart(c, pos = null) {
    if (!this.ready) return;
    const d = this.out('sfx', pos, { gain: pos ? 0.9 : 0.8, ref: 3 });
    const t = this.now;
    if (c === 'medkit') {
      // Klettverschluss
      for (let i = 0; i < 7; i++) this.noiseHit(d, t + i * 0.12 + Math.random() * 0.04, { dur: 0.09, type: 'bandpass', freq: 2500 + Math.random() * 1500, q: 1.5, gain: 0.18 });
      this.noiseHit(d, t + 0.35, { dur: 0.45, type: 'highpass', freq: 5000, gain: 0.12, attack: 0.05 });
    } else {
      // Deckel auf, Trinken (Gluckern)
      this.noiseHit(d, t, { dur: 0.05, type: 'bandpass', freq: 2200, q: 3, gain: 0.3 });
      const n = c === 'mini' ? 5 : 10;
      for (let i = 0; i < n; i++) this.tone(d, t + 0.3 + i * 0.16, { type: 'sine', freq: 260 + Math.random() * 120, freqEnd: 520, dur: 0.07, gain: 0.12 });
    }
  }

  useDone(c, instant = false) {
    if (!this.ready) return;
    const d = this.out('sfx', null, { reverb: 0.3 });
    const t = this.now;
    if (instant) {
      // Sofort-Benutzung: kurzes „Plopp“ (Deckel/Klett) direkt vor dem Heil-/Schildklang
      if (c === 'medkit') this.noiseHit(d, t, { dur: 0.12, type: 'bandpass', freq: 2800, freqEnd: 1600, q: 1.4, gain: 0.3 });
      else {
        this.noiseHit(d, t, { dur: 0.04, type: 'bandpass', freq: 2400, q: 3, gain: 0.35 });
        this.tone(d, t + 0.02, { type: 'sine', freq: 300, freqEnd: 620, dur: 0.08, gain: 0.18 });
      }
    }
    if (c === 'medkit') {
      [84, 88, 91, 96].forEach((n, i) => this.tone(d, t + i * 0.07, { type: 'triangle', freq: noteHz(n), dur: 0.35, gain: 0.2 }));
      this.tone(d, t + 0.3, { type: 'sine', freq: noteHz(100), dur: 0.5, gain: 0.08 });
    } else {
      // Schild lädt: aufsteigendes „Schwing“
      this.tone(d, t, { type: 'sine', freq: 400, freqEnd: 1600, dur: 0.35, gain: 0.18 });
      [81, 88, 93].forEach((n, i) => this.tone(d, t + 0.15 + i * 0.06, { type: 'triangle', freq: noteHz(n), dur: 0.4, gain: 0.14 }));
      this.noiseHit(d, t, { dur: 0.4, type: 'bandpass', freq: 3000, freqEnd: 7000, q: 2, gain: 0.1, attack: 0.1 });
    }
  }

  denied() {
    if (!this.ready) return;
    const d = this.out('ui');
    this.tone(d, this.now, { type: 'square', freq: 200, dur: 0.14, gain: 0.12 });
    this.tone(d, this.now + 0.08, { type: 'square', freq: 160, dur: 0.14, gain: 0.1 });
  }

  // ---------- Bewegung ----------
  // Schritte: weiche, dumpfe Tritte ohne harte Klick-Anteile (eigene Schritte leiser, damit
  // Sprinten nicht „klackert“; fremde Schritte bleiben gut ortbar)
  footstep(surface, vol = 1, pos = null) {
    if (!this.ready) return;
    const d = this.out('sfx', pos, { gain: vol * (pos ? 1.3 : 0.5), ref: 3, rolloff: 1.4 });
    const t = this.now;
    const r = Math.random();
    switch (surface) {
      case 'grass':
        this.noiseHit(d, t, { dur: 0.1, type: 'bandpass', freq: 1200 + r * 600, q: 0.7, gain: 0.3 });
        break;
      case 'sand':
        this.noiseHit(d, t, { dur: 0.12, type: 'bandpass', freq: 700 + r * 400, q: 1, gain: 0.34 });
        break;
      case 'snow':
        // Knirschen: zwei kurze, raue Stöße
        this.noiseHit(d, t, { dur: 0.07, type: 'bandpass', freq: 1700 + r * 700, q: 2.2, gain: 0.3 });
        this.noiseHit(d, t + 0.045, { dur: 0.09, type: 'bandpass', freq: 1100 + r * 500, q: 1.6, gain: 0.26 });
        break;
      case 'ice':
        this.noiseHit(d, t, { dur: 0.05, type: 'highpass', freq: 2400, gain: 0.22 });
        this.tone(d, t, { type: 'sine', freq: 520 + r * 120, freqEnd: 380, dur: 0.06, gain: 0.08 });
        break;
      case 'wood':
        this.tone(d, t, { type: 'sine', freq: 120 + r * 30, freqEnd: 80, dur: 0.08, gain: 0.3 });
        this.noiseHit(d, t, { dur: 0.06, type: 'lowpass', freq: 900, gain: 0.25 });
        break;
      case 'stone':
      case 'metal':
        this.noiseHit(d, t, { dur: 0.06, type: 'bandpass', freq: surface === 'metal' ? 1400 : 1000, q: 1.2, gain: 0.25 });
        this.tone(d, t, { type: 'sine', freq: 140, freqEnd: 90, dur: 0.05, gain: 0.15 });
        break;
      case 'water':
        this.noiseHit(d, t, { dur: 0.18, type: 'bandpass', freq: 500, freqEnd: 1300, q: 1.5, gain: 0.4 });
        break;
      default:
        this.noiseHit(d, t, { dur: 0.08, type: 'bandpass', freq: 1000, q: 1, gain: 0.3 });
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
