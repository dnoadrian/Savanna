// Eingabe: frei belegbare Tasten (inkl. Maustasten), Pointer Lock, Mausbewegung, Flanken.

export class Input {
  constructor(settings) {
    this.settings = settings;
    this.down = new Set();
    this.pressedSet = new Set();
    this.releasedSet = new Set();
    this.dx = 0;
    this.dy = 0;
    this.gameActive = false;
    this.captureCb = null;
    this.locked = false;
    this.onLockChange = null;
    this.onAnyKey = null;

    window.addEventListener('keydown', (e) => this.onKey(e, true), { capture: true });
    window.addEventListener('keyup', (e) => this.onKey(e, false), { capture: true });
    window.addEventListener('mousedown', (e) => this.onMouse(e, true));
    window.addEventListener('mouseup', (e) => this.onMouse(e, false));
    window.addEventListener('contextmenu', (e) => {
      if (this.gameActive) e.preventDefault();
    });
    window.addEventListener('wheel', (e) => {
      if (this.captureCb) {
        e.preventDefault();
        this.finishCapture(e.deltaY < 0 ? 'WheelUp' : 'WheelDown');
        return;
      }
      if (!this.gameActive) return;
      const code = e.deltaY < 0 ? 'WheelUp' : 'WheelDown';
      this.pressedSet.add(code);
    }, { passive: false });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // Ausreißer (Browser-Bug beim Lock) verwerfen
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = !!document.pointerLockElement;
      if (!this.locked) this.down.clear();
      this.onLockChange && this.onLockChange(this.locked);
    });
    window.addEventListener('blur', () => this.down.clear());
  }

  get keys() {
    return this.settings.get('keys');
  }

  onKey(e, isDown) {
    if (this.captureCb) {
      if (!isDown) return;
      e.preventDefault();
      e.stopPropagation();
      this.finishCapture(e.code === 'Escape' ? null : e.code, e.code === 'Escape');
      return;
    }
    const tag = (e.target && e.target.tagName) || '';
    const typing = tag === 'INPUT' || tag === 'TEXTAREA';
    if (typing && !this.locked) return;
    if (this.gameActive) {
      // Browser-Shortcuts im Spiel unterdrücken (STRG+S, TAB, Leertaste …)
      const k = this.keys;
      const bound = Object.values(k).includes(e.code);
      if (bound || e.ctrlKey || e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) {
        if (e.code !== 'F11' && e.code !== 'F12' && e.code !== 'F5') e.preventDefault();
      }
    }
    if (isDown) {
      if (!e.repeat) {
        if (!this.down.has(e.code)) this.pressedSet.add(e.code);
        this.down.add(e.code);
        this.onAnyKey && this.onAnyKey(e.code);
      }
    } else {
      this.down.delete(e.code);
      this.releasedSet.add(e.code);
    }
  }

  onMouse(e, isDown) {
    const code = 'Mouse' + e.button;
    if (this.captureCb) {
      if (!isDown) return;
      e.preventDefault();
      this.finishCapture(code);
      return;
    }
    if (!this.locked && isDown) return;
    if (isDown) {
      if (!this.down.has(code)) this.pressedSet.add(code);
      this.down.add(code);
    } else {
      this.down.delete(code);
      this.releasedSet.add(code);
    }
  }

  isDown(action) {
    const c = this.keys[action];
    return !!c && this.down.has(c);
  }

  pressed(action) {
    const c = this.keys[action];
    return !!c && this.pressedSet.has(c);
  }

  released(action) {
    const c = this.keys[action];
    return !!c && this.releasedSet.has(c);
  }

  consumeMouse() {
    const r = { dx: this.dx, dy: this.dy };
    this.dx = 0;
    this.dy = 0;
    return r;
  }

  endFrame() {
    this.pressedSet.clear();
    this.releasedSet.clear();
  }

  // Tastenbelegung: nächste Taste abfangen
  captureNext(cb) {
    this.captureCb = cb;
  }

  finishCapture(code, cancelled = false) {
    const cb = this.captureCb;
    this.captureCb = null;
    cb && cb(cancelled ? null : code);
  }

  lock(el) {
    if (document.pointerLockElement === el) return;
    try {
      const p = el.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { el.requestPointerLock(); } catch { /* ignorieren */ } });
    } catch {
      try { el.requestPointerLock(); } catch { /* ignorieren */ }
    }
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  clear() {
    this.down.clear();
    this.pressedSet.clear();
    this.releasedSet.clear();
    this.dx = this.dy = 0;
  }
}

// Vollbild + Keyboard-Lock (damit STRG+W den Tab nicht schließt)
export async function enterFullscreen() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch {
    /* nicht erlaubt */
  }
  lockKeyboard();
}

export async function lockKeyboard() {
  try {
    if (document.fullscreenElement && navigator.keyboard && navigator.keyboard.lock) {
      await navigator.keyboard.lock();
    }
  } catch {
    /* nicht unterstützt */
  }
}

export function exitFullscreen() {
  try {
    if (navigator.keyboard && navigator.keyboard.unlock) navigator.keyboard.unlock();
    if (document.fullscreenElement) document.exitFullscreen();
  } catch {
    /* ignorieren */
  }
}

export function toggleFullscreen() {
  if (document.fullscreenElement) exitFullscreen();
  else enterFullscreen();
}
