// Admin-Zugänge: Haupt-Admin (ADMIN_USER/ADMIN_PASS) plus Zugänge, die der Haupt-Admin für
// andere anlegt – jeweils mit wählbarer Anzahl an Anmeldungen (oder unbegrenzt). Nach der
// Anmeldung bekommt der Browser ein Token, mit dem er sich nach Verbindungsabbrüchen wieder
// meldet, ohne eine weitere Anmeldung zu verbrauchen.
import crypto from 'crypto';
import { ADMIN_USER, ADMIN_PASS } from '../shared/constants.js';

const TOKEN_TTL = 24 * 3600 * 1000;
export const USES_UNLIMITED = -1;

const clean = (s, n = 24) => String(s ?? '').trim().slice(0, n);

export class AdminAuth {
  constructor(store) {
    this.store = store;
    const d = store.data;
    if (!d.adminAccounts || typeof d.adminAccounts !== 'object') d.adminAccounts = {};
    if (!d.adminTokens || typeof d.adminTokens !== 'object') d.adminTokens = {};
  }

  get accounts() { return this.store.data.adminAccounts; }
  get tokens() { return this.store.data.adminTokens; }

  // Anmeldung: { ok, role, token, uses } oder { ok: false, key }
  login(user, pass) {
    const u = clean(user).toLowerCase();
    const p = String(pass ?? '');
    if (u === ADMIN_USER && p === ADMIN_PASS) return { ok: true, role: 'master', token: this.issue(u, 'master'), uses: USES_UNLIMITED };
    const acc = this.accounts[u];
    if (!acc || acc.pass !== p) return { ok: false, key: 'adminWrong' };
    if (acc.uses === 0) return { ok: false, key: 'adminNoUses' };
    if (acc.uses > 0) acc.uses--;
    acc.lastLogin = Date.now();
    this.store.save();
    return { ok: true, role: 'guest', token: this.issue(u, 'guest'), uses: acc.uses };
  }

  issue(user, role) {
    this.prune();
    const token = crypto.randomBytes(18).toString('base64url');
    this.tokens[token] = { user, role, exp: Date.now() + TOKEN_TTL };
    this.store.save();
    return token;
  }

  // Token prüfen: { user, role } oder null (gelöschte Zugänge verlieren ihre Tokens)
  check(token) {
    const t = typeof token === 'string' ? this.tokens[token] : null;
    if (!t || t.exp < Date.now()) return null;
    if (t.role === 'guest' && !this.accounts[t.user]) return null;
    return { user: t.user, role: t.role };
  }

  prune() {
    const now = Date.now();
    for (const [k, t] of Object.entries(this.tokens)) if (t.exp < now) delete this.tokens[k];
  }

  list() {
    return Object.entries(this.accounts).map(([user, a]) => ({ user, pass: a.pass, uses: a.uses, created: a.created, lastLogin: a.lastLogin || 0 }))
      .sort((a, b) => a.created - b.created);
  }

  add(user, pass, uses) {
    const u = clean(user).toLowerCase();
    const p = clean(pass, 32);
    if (u.length < 2 || p.length < 2 || u === ADMIN_USER) return { ok: false, key: 'adminAccBad' };
    const n = Number(uses);
    const left = n === USES_UNLIMITED ? USES_UNLIMITED : Math.max(1, Math.min(999, Math.round(n) || 1));
    this.accounts[u] = { pass: p, uses: left, created: Date.now() };
    this.store.save();
    return { ok: true };
  }

  remove(user) {
    const u = clean(user).toLowerCase();
    delete this.accounts[u];
    for (const [k, t] of Object.entries(this.tokens)) if (t.user === u && t.role === 'guest') delete this.tokens[k];
    this.store.save();
    return { ok: true };
  }
}
