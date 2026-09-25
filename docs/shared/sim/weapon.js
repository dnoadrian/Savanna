// Waffenzustand des Sturmgewehrs (Magazin, Feuerrate, Nachladen, Streuung).
import { WEAPON, F } from '../constants.js';

export class WeaponState {
  constructor(infiniteAmmo = true) {
    this.mag = WEAPON.magSize;
    this.reserve = infiniteAmmo ? Infinity : WEAPON.reserve;
    this.reloading = false;
    this.reloadT = 0;
    this.reloadDur = 0;
    this.cooldown = 0;
    this.bloom = 0;
    this.sinceShot = 10;
    this.burst = 0;
  }

  get interval() {
    return 1 / WEAPON.fireRate;
  }

  canFire() {
    return !this.reloading && this.mag > 0 && this.cooldown <= 0;
  }

  // registriert einen Schuss; gibt true zurück wenn erlaubt.
  // ignoreCooldown: Server prüft die Feuerrate menschlicher Spieler separat (Token-Bucket).
  fire(ignoreCooldown = false) {
    if (this.reloading || this.mag <= 0) return false;
    if (!ignoreCooldown && this.cooldown > 0) return false;
    this.mag--;
    // negativen Rest übernehmen, damit die Feuerrate unabhängig von der Framerate stimmt
    this.cooldown = this.cooldown > 0 ? this.interval : this.cooldown + this.interval;
    if (this.sinceShot > 0.45) this.burst = 0;
    this.burst++;
    this.sinceShot = 0;
    this.bloom = Math.min(WEAPON.spreadMaxBloom, this.bloom + WEAPON.spreadPerShot);
    return true;
  }

  canReload() {
    return !this.reloading && this.mag < WEAPON.magSize && this.reserve > 0;
  }

  startReload() {
    if (!this.canReload()) return false;
    this.reloading = true;
    this.reloadT = 0;
    this.reloadDur = this.mag === 0 ? WEAPON.reloadEmpty : WEAPON.reloadTactical;
    return true;
  }

  cancelReload() {
    this.reloading = false;
    this.reloadT = 0;
  }

  finishReload() {
    const need = WEAPON.magSize - this.mag;
    const take = Math.min(need, this.reserve);
    this.mag += take;
    if (this.reserve !== Infinity) this.reserve -= take;
    this.reloading = false;
    this.reloadT = 0;
  }

  // gibt true zurück wenn das Nachladen in diesem Schritt fertig wurde
  update(dt) {
    this.cooldown = Math.max(-0.05, this.cooldown - dt);
    this.sinceShot += dt;
    if (this.sinceShot > 0.12) this.bloom = Math.max(0, this.bloom - WEAPON.spreadRecover * dt * (this.sinceShot > 0.3 ? 1.6 : 1));
    if (this.reloading) {
      this.reloadT += dt;
      if (this.reloadT >= this.reloadDur) {
        this.finishReload();
        return true;
      }
    }
    return false;
  }

  // Streuung in Grad für den nächsten Schuss
  spread(flags, speed) {
    const air = flags & F.AIR;
    const moving = speed > 0.8;
    // Erster Schuss im Stand sitzt genau
    if (!air && !moving && this.bloom <= 0.05 && this.sinceShot > 0.35) return 0;
    let s = WEAPON.spreadBase + this.bloom;
    if (moving) s += WEAPON.spreadMove * Math.min(1, speed / 5.5);
    if (air) s += WEAPON.spreadAir;
    if (flags & (F.CROUCH | F.SLIDE)) s *= WEAPON.crouchMult;
    if (flags & F.ADS) s *= WEAPON.adsMult;
    return s;
  }
}
