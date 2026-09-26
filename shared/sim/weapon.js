// Laufzeitzustand der gerade gehaltenen Waffe (Feuerrate, Streuung, Ausrüsten, Nachladen).
// Das Magazin steckt im Gegenstand selbst (item.mag), die Reserve im Munitionsbeutel (ammo).
// Wird identisch vom Server, den Bots und der Vorhersage des lokalen Spielers benutzt.
import { F } from '../constants.js';
import { WEAPONS } from '../items.js';

export function createWeaponRuntime() {
  return { cooldown: 0, bloom: 0, sinceShot: 10, burst: 0, reloading: false, reloadT: 0, reloadDur: 0, equipT: 0 };
}

// Waffe ziehen: kurze Ausrüstzeit, laufendes Nachladen endet
export function equipWeapon(rt, item) {
  rt.reloading = false;
  rt.reloadT = 0;
  rt.bloom = 0;
  rt.burst = 0;
  rt.equipT = item && item.k === 'w' ? WEAPONS[item.w].equip : 0.2;
}

export function canFire(rt, item) {
  if (!item || item.k !== 'w' || item.mag <= 0 || rt.equipT > 0 || rt.cooldown > 0) return false;
  // Schrotflinten dürfen das Nachladen (Schuss für Schuss) unterbrechen
  return !rt.reloading || !!WEAPONS[item.w].shellReload;
}

// registriert einen Schuss; ignoreCooldown: Server prüft die Feuerrate separat (Token-Bucket)
export function fireWeapon(rt, item, ignoreCooldown = false) {
  if (!item || item.k !== 'w' || item.mag <= 0) return false;
  const def = WEAPONS[item.w];
  if (rt.reloading) {
    if (!def.shellReload) return false;
    rt.reloading = false;
  }
  if (!ignoreCooldown && (rt.cooldown > 0 || rt.equipT > 0)) return false;
  item.mag--;
  const interval = 1 / def.fireRate;
  // negativen Rest übernehmen, damit die Feuerrate unabhängig von der Framerate stimmt
  rt.cooldown = rt.cooldown > 0 ? interval : rt.cooldown + interval;
  if (rt.sinceShot > 0.45) rt.burst = 0;
  rt.burst++;
  rt.sinceShot = 0;
  rt.bloom = Math.min(def.spread.maxBloom, rt.bloom + def.spread.perShot);
  return true;
}

export function canReload(rt, item, ammo) {
  if (!item || item.k !== 'w' || rt.reloading) return false;
  const def = WEAPONS[item.w];
  return item.mag < def.mag && ammo[def.ammo] > 0;
}

export function startReload(rt, item, ammo) {
  if (!canReload(rt, item, ammo)) return false;
  const def = WEAPONS[item.w];
  rt.reloading = true;
  rt.reloadT = 0;
  rt.reloadDur = def.reload[item.r] * (def.shellReload ? 1 : item.mag === 0 ? 1.12 : 1);
  return true;
}

export function cancelReload(rt) {
  rt.reloading = false;
  rt.reloadT = 0;
}

// Fortschritt; gibt 'done' (Magazin voll/fertig), 'shell' (eine Patrone eingelegt) oder null zurück
export function updateWeapon(rt, item, ammo, dt) {
  rt.cooldown = Math.max(-0.05, rt.cooldown - dt);
  rt.equipT = Math.max(0, rt.equipT - dt);
  rt.sinceShot += dt;
  if (!item || item.k !== 'w') {
    rt.reloading = false;
    return null;
  }
  const def = WEAPONS[item.w];
  if (rt.sinceShot > 0.12) rt.bloom = Math.max(0, rt.bloom - def.spread.recover * dt * (rt.sinceShot > 0.3 ? 1.6 : 1));
  if (!rt.reloading) return null;
  rt.reloadT += dt;
  if (rt.reloadT < rt.reloadDur) return null;
  if (def.shellReload) {
    if (ammo[def.ammo] > 0 && item.mag < def.mag) {
      item.mag++;
      ammo[def.ammo]--;
    }
    rt.reloadT = 0;
    if (item.mag >= def.mag || ammo[def.ammo] <= 0) {
      rt.reloading = false;
      return 'done';
    }
    return 'shell';
  }
  const take = Math.min(def.mag - item.mag, ammo[def.ammo]);
  item.mag += take;
  ammo[def.ammo] -= take;
  rt.reloading = false;
  rt.reloadT = 0;
  return 'done';
}

// Fortschritt 0..1 für die Anzeige (Schrotflinten: ganzes Magazin)
export function reloadProgress(rt, item) {
  if (!rt.reloading || !item || item.k !== 'w') return -1;
  const def = WEAPONS[item.w];
  if (!def.shellReload) return rt.reloadT / rt.reloadDur;
  return Math.min(1, (item.mag + rt.reloadT / rt.reloadDur) / def.mag);
}

// Streuung in Grad für den nächsten Schuss (bei Schrotflinten: Kegel der Kugeln)
// Spieler: reiner Hitscan – Kugeln fliegen immer genau aufs Fadenkreuz, egal ob man steht,
// läuft oder springt. Nur Schrotflinten haben ihren festen Streukegel (Pump eng, Taktische weit).
export function weaponSpread(rt, item, flags) {
  if (!item || item.k !== 'w') return 0;
  const def = WEAPONS[item.w];
  if (def.pellets <= 1) return 0;
  let s = def.spread.base;
  if (flags & (F.CROUCH | F.SLIDE)) s *= def.spread.crouch;
  if (flags & F.ADS) s *= def.spread.ads;
  return s;
}

// Bots behalten die klassische Streuung (Bewegung, Sprung, Dauerfeuer), damit sie schlagbar bleiben
export function botWeaponSpread(rt, item, flags, speed) {
  if (!item || item.k !== 'w') return 0;
  const def = WEAPONS[item.w];
  const s0 = def.spread;
  const air = flags & F.AIR;
  const moving = speed > 0.8;
  if (def.pellets > 1) {
    let s = s0.base + (moving ? s0.move : 0) + (air ? s0.air : 0);
    if (flags & (F.CROUCH | F.SLIDE)) s *= s0.crouch;
    if (flags & F.ADS) s *= s0.ads;
    return s;
  }
  // Scharfschützengewehr im Zielfernrohr: ruhig = exakt
  if (def.scope && (flags & F.ADS)) return air ? 2 : moving ? 0.4 : 0;
  // Erster Schuss im Stand sitzt genau
  if (!air && !moving && rt.bloom <= 0.05 && rt.sinceShot > 0.35 && !def.scope) return 0;
  let s = s0.base + rt.bloom;
  if (moving) s += s0.move * Math.min(1, speed / 5.5);
  if (air) s += s0.air;
  if (flags & (F.CROUCH | F.SLIDE)) s *= s0.crouch;
  if (flags & F.ADS) s *= s0.ads;
  return s;
}
