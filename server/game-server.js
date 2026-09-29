// Lobby-Server: Benutzernamen, Freunde, Party, Einladungen, Matchmaking (15 s Warteschlange,
// dann mit Bots auf 20 auffüllen; Solo oder Duo), jede Runde eine zufällige Insel,
// server-autoritative Matches und Online-Hosting-Steuerung.
import crypto from 'crypto';
import { Store } from './store.js';
import { ServerMatch } from './match.js';
import { TunnelManager } from './tunnel.js';
import { Beacon } from './beacon.js';
import { AdminAuth } from './admin.js';
import { validateName, suggestAlternatives } from '../shared/names.js';
import { mapSteps, randomMapId } from '../shared/map/mapgen.js';
import { NavGrid } from '../shared/sim/nav.js';
import { Simulation } from '../shared/sim/simulation.js';
import { RNG } from '../shared/rng.js';
import { MATCH_SIZE, PARTY_MAX, INVITE_TTL, SERVER_PORT, ADMIN_USER, ADMIN_PASS, ADMIN_MAX_COINS, SIM_DT, clampQueueWait } from '../shared/constants.js';

const WARMUP_STEPS = 900; // 30 s Spielzeit
// Lobby-Nachrichten: höchstens 5 gleichzeitig, 160 Zeichen, längstens 30 Tage (0 = dauerhaft)
const ANN_MAX = 5;
const ANN_MAX_LEN = 160;
const ANN_MAX_MINS = 30 * 24 * 60;

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const PROXY_HEADERS = ['x-forwarded-for', 'cf-connecting-ip', 'x-real-ip', 'forwarded', 'cf-ray'];

let nextInvite = 1;
let nextParty = 1;

export class GameServer {
  constructor(port = SERVER_PORT) {
    this.port = port;
    this.store = new Store();
    this.clients = new Set();
    this.byPid = new Map(); // Spieler-ID -> Client
    this.invites = new Map();
    this.queue = []; // Tickets
    this.matches = new Map();
    // Karten: jede Runde eine zufällige Insel; die nächste wird im Hintergrund vorbereitet
    this.maps = new Map(); // id -> { id, ready, world, gen, waiters }
    this.nextMap = randomMapId();
    this.prepareMap(this.nextMap, (world) => {
      // JIT aufwärmen: kurze Bot-Runde im Hintergrund, damit das erste echte Match nicht ruckelt
      if (process.env.SHOWDOWN_WARMUP !== '0') setTimeout(() => this.warmup(world), 300);
    });
    this.tunnel = new TunnelManager(port);
    this.tunnel.on('change', (st) => this.broadcastHost(st));
    this.beacon = new Beacon(this.tunnel);
    this.admin = new AdminAuth(this.store);
    this.loginFails = new Map(); // Konto-ID -> Zeitpunkte falscher Anmeldungen
    this.kicked = new Map(); // Spieler-ID -> gesperrt bis (Admin-Kick, 10 min)
    this.startedAt = Date.now();
    // Angaben für die Lobby-Anzeige „Server“ (Name, Standort, Spieler online)
    this.info = {
      name: process.env.SHOWDOWN_SERVER_NAME || process.env.RENDER_SERVICE_NAME || null,
      region: process.env.SHOWDOWN_REGION || (process.env.RENDER ? 'Render' : null),
      cloud: !!process.env.RENDER || !!process.env.SHOWDOWN_REGION,
    };
    setInterval(() => this.broadcastServerInfo(), 5000);
    setInterval(() => this.tickQueue(), 250);
    setInterval(() => this.tickInvites(), 1000);
    // Partys ohne Mitglieder aufräumen
    for (const [pid, party] of Object.entries(this.store.parties)) {
      party.members = party.members.filter((id) => this.store.player(id));
      if (party.members.length < 2) this.dissolveParty(pid, true);
    }
  }

  // ---------------- Verbindungen ----------------
  onConnection(ws, req) {
    const addr = req.socket.remoteAddress || '';
    const proxied = PROXY_HEADERS.some((h) => req.headers[h]);
    const c = { ws, pid: null, isHost: LOOPBACK.has(addr) && !proxied, matchId: null, ping: 0, msgBudget: 60, lastBudget: Date.now() };
    this.clients.add(c);
    ws.on('message', (data) => {
      // einfache Flutbegrenzung
      const now = Date.now();
      c.msgBudget = Math.min(120, c.msgBudget + ((now - c.lastBudget) / 1000) * 90);
      c.lastBudget = now;
      if (c.msgBudget < 1) return;
      c.msgBudget--;
      let m;
      try {
        m = JSON.parse(data);
      } catch {
        return;
      }
      if (!m || typeof m.t !== 'string') return;
      try {
        this.onMessage(c, m);
      } catch (e) {
        console.error('Fehler bei Nachricht', m.t, e);
      }
    });
    ws.on('close', () => this.onClose(c));
    ws.on('error', () => {});
  }

  send(c, obj) {
    if (c.ws && c.ws.readyState === 1) c.ws.send(JSON.stringify(obj));
  }

  sendRaw(c, data) {
    if (c.ws && c.ws.readyState === 1) c.ws.send(data);
  }

  sendTo(pid, obj) {
    const c = this.byPid.get(pid);
    if (c) this.send(c, obj);
  }

  notice(pid, key, vars = {}, kind = '', sound = '') {
    this.sendTo(pid, { t: 'notice', key, vars, kind, sound });
  }

  err(c, key, rid) {
    if (rid) this.send(c, { t: 'result', rid, ok: false, key });
    else this.send(c, { t: 'err', key });
  }

  onClose(c) {
    this.clients.delete(c);
    if (c.pid && this.byPid.get(c.pid) === c) {
      this.byPid.delete(c.pid);
      const p = this.store.player(c.pid);
      if (p) p.lastSeen = Date.now();
      // Match verlassen
      if (c.matchId) {
        const m = this.matches.get(c.matchId);
        if (m) m.leave(c);
      }
      this.removeFromQueue(c.pid, true);
      this.pushPresence(c.pid);
      const party = this.partyOf(c.pid);
      if (party) this.sendParty(party.id);
      this.store.save();
    }
  }

  // ---------------- Nachrichten ----------------
  onMessage(c, m) {
    if (m.t === 'ping') {
      this.send(c, { t: 'pong', c: m.c });
      return;
    }
    if (m.t === 'checkName') return this.onCheckName(c, m);
    if (m.t === 'hello') return this.onHello(c, m);
    if (m.t === 'login') return this.onLogin(c, m);
    // Admin-Werkzeuge prüfen ihre Rechte selbst (gehen auch ohne Spielerkonto, z. B. nach dem Reset)
    switch (m.t) {
      case 'adminCoins': return this.onAdminCoins(c, m);
      case 'adminLogin': return this.onAdminLogin(c, m);
      case 'adminResume': return this.onAdminResume(c, m);
      case 'adminLogout': c.admin = null; return;
      case 'adminAccounts': return this.onAdminAccounts(c, m);
      case 'adminAnnounce': return this.onAdminAnnounce(c, m);
      case 'adminStats': return this.onAdminStats(c, m);
      case 'adminKick': return this.onAdminKick(c, m);
      case 'adminWipe': return this.onAdminWipe(c, m);
      default: break;
    }
    if (!c.pid) return;
    // Match-Nachrichten
    if (c.matchId) {
      const match = this.matches.get(c.matchId);
      if (match && ['st', 'fire', 'reload', 'reloadCancel', 'sel', 'swap', 'drop', 'dropAmmo', 'cheat', 'int', 'use', 'useCancel', 'rev', 'leaveMatch', 'loaded'].includes(m.t)) {
        match.onMessage(c, m);
        return;
      }
    }
    switch (m.t) {
      case 'setName': return this.onSetName(c, m);
      case 'profile': return this.onProfile(c, m);
      case 'resetAccount': return this.onResetAccount(c);
      case 'logout': return this.onLogout(c);
      case 'friendRequest': return this.onFriendRequest(c, m);
      case 'friendAccept': return this.onFriendAccept(c, m.id);
      case 'friendDecline': return this.onFriendDecline(c, m.id);
      case 'friendCancel': return this.onFriendCancel(c, m.id);
      case 'friendRemove': return this.onFriendRemove(c, m.id);
      case 'block': return this.onBlock(c, m.id);
      case 'unblock': return this.onUnblock(c, m.id);
      case 'partyInvite': return this.onPartyInvite(c, m.id);
      case 'inviteAccept': return this.onInviteAccept(c, m.inviteId);
      case 'inviteDecline': return this.onInviteDecline(c, m.inviteId);
      case 'partyJoin': return this.onPartyJoin(c, m.id);
      case 'partyLeave': return this.leaveParty(c.pid);
      case 'partyKick': return this.onPartyKick(c, m.id);
      case 'partyPromote': return this.onPartyPromote(c, m.id);
      case 'partyReady': return this.onPartyReady(c, !!m.ready);
      case 'partyChat': return this.onPartyChat(c, m.text);
      case 'partyMode': return this.onPartyMode(c, m.mode);
      case 'queue': return this.onQueue(c, m);
      case 'queueCancel': return this.onQueueCancel(c);
      case 'cheat': c.cheats = { ia: !!m.ia, gm: !!m.gm }; return;
      case 'hostStatus': return this.sendHost(c);
      case 'hostStart':
        if (!c.isHost) return this.err(c, 'err_not_host');
        this.tunnel.start();
        return;
      case 'hostStop':
        if (!c.isHost) return this.err(c, 'err_not_host');
        this.tunnel.stop();
        return;
      default:
        return;
    }
  }

  // ---------------- Konto / Namen ----------------
  nameResult(name, exceptId) {
    const err = validateName(name);
    if (err) return { ok: false, err };
    if (this.store.nameTaken(name, exceptId)) {
      return { ok: false, err: 'taken', suggestions: suggestAlternatives(name, (n) => this.store.nameTaken(n, exceptId)) };
    }
    return { ok: true };
  }

  onCheckName(c, m) {
    const r = this.nameResult(String(m.name || ''), c.pid);
    this.send(c, { t: 'nameCheck', rid: m.rid, ...r });
  }

  onHello(c, m) {
    const id = String(m.id || '').slice(0, 64);
    const name = String(m.name || '');
    if (!id || !/^[a-zA-Z0-9-]+$/.test(id)) return;
    let p = this.store.player(id);
    // Admin hat alle Spieler zurückgesetzt: Spielstände von vorher werden auch im Browser gelöscht
    const resetAt = this.store.data.resetAt || 0;
    if (!p && resetAt && !(Number(m.save && m.save.createdAt) > resetAt)) {
      this.send(c, { t: 'wiped', at: resetAt });
      return;
    }
    const kick = this.kicked.get(id);
    if (kick && kick > Date.now()) {
      this.send(c, { t: 'kicked', left: Math.ceil((kick - Date.now()) / 60000) });
      return;
    }
    const r = this.nameResult(name, id);
    if (!r.ok) {
      this.send(c, { t: 'nameTaken', err: r.err, suggestions: r.suggestions || suggestAlternatives(name || 'Spieler', (n) => this.store.nameTaken(n, id)) });
      return;
    }
    const auth = AUTH_RE.test(String(m.auth || '')) ? m.auth : null;
    // Konto mit Geburtsdatum: nur mit passendem Schlüssel (sonst neu anmelden lassen)
    if (p && p.auth && (!auth || hashAuth(p.authSalt, auth) !== p.auth)) {
      this.send(c, { t: 'authFail' });
      return;
    }
    if (!p) {
      p = { id, name, nameKey: name.toLowerCase(), friends: [], incoming: [], outgoing: [], blocked: [], profile: {}, createdAt: Date.now(), lastSeen: Date.now() };
      this.store.players[id] = p;
      console.log(`Neuer Spieler registriert: ${name}`);
    } else if (p.name !== name) {
      p.name = name;
      p.nameKey = name.toLowerCase();
    }
    if (auth && !p.auth) {
      p.authSalt = crypto.randomBytes(8).toString('hex');
      p.auth = hashAuth(p.authSalt, auth);
    }
    p.profile = sanitizeProfile(m.profile);
    const save = sanitizeSave(m.save);
    if (save) p.save = save;
    // alte Verbindung desselben Spielers ersetzen
    const old = this.byPid.get(id);
    if (old && old !== c) {
      this.send(old, { t: 'notice', key: 'err_generic', kind: 'error' });
      old.pid = null;
      try { old.ws.close(); } catch { /* ignorieren */ }
    }
    c.pid = id;
    this.byPid.set(id, c);
    this.store.save();
    this.send(c, { t: 'welcome', name: p.name, isHost: c.isHost, srv: this.serverInfo(), ann: this.announcements() });
    this.sendSocial(id);
    const party = this.partyOf(id);
    this.send(c, { t: 'party', party: party ? this.partyView(party) : null });
    if (party) this.sendParty(party.id);
    this.pushPresence(id);
    if (c.isHost) this.sendHost(c);
    // offene Einladungen erneut zustellen
    for (const inv of this.invites.values()) {
      if (inv.to === id) this.send(c, { t: 'invite', inviteId: inv.id, from: { id: inv.from, name: this.nameOf(inv.from) }, ttl: Math.max(1, (inv.expires - Date.now()) / 1000) });
    }
  }

  onSetName(c, m) {
    const name = String(m.name || '');
    const r = this.nameResult(name, c.pid);
    if (!r.ok) {
      this.send(c, { t: 'setNameResult', rid: m.rid, ...r });
      return;
    }
    const p = this.store.player(c.pid);
    p.name = name;
    p.nameKey = name.toLowerCase();
    this.store.save();
    this.send(c, { t: 'setNameResult', rid: m.rid, ok: true, name });
    // Freunde sehen den neuen Namen automatisch (Verknüpfung über ID)
    for (const f of p.friends) this.sendSocial(f);
    for (const f of p.incoming) this.sendSocial(f);
    for (const f of p.outgoing) this.sendSocial(f);
    const party = this.partyOf(c.pid);
    if (party) this.sendParty(party.id);
  }

  // Anmelden auf einem anderen Gerät: Name + Schlüssel aus dem Geburtsdatum
  onLogin(c, m) {
    const reply = (r) => this.send(c, { t: 'result', rid: m.rid, ...r });
    const now = Date.now();
    // Bremse gegen Durchprobieren: 5 Fehlversuche pro Minute je Verbindung, 10 in 10 min je Konto
    c.loginFails = (c.loginFails || []).filter((t) => now - t < 60000);
    if (c.loginFails.length >= 5) return reply({ ok: false, key: 'loginSlow' });
    const p = this.store.byName(String(m.name || '').trim());
    if (!p) {
      c.loginFails.push(now);
      return reply({ ok: false, key: 'loginUnknown' });
    }
    const fails = (this.loginFails.get(p.id) || []).filter((t) => now - t < 600000);
    this.loginFails.set(p.id, fails);
    if (fails.length >= 10) return reply({ ok: false, key: 'loginSlow' });
    const auth = String(m.auth || '');
    if (!p.auth || !AUTH_RE.test(auth) || hashAuth(p.authSalt, auth) !== p.auth) {
      c.loginFails.push(now);
      fails.push(now);
      return reply({ ok: false, key: p.auth ? 'loginWrong' : 'loginNoBirth' });
    }
    this.loginFails.delete(p.id);
    console.log(`Anmeldung: ${p.name}`);
    return reply({ ok: true, id: p.id, name: p.name, save: p.save || null });
  }

  // Abmelden (Konto bleibt bestehen): Verbindung wieder „anonym“
  onLogout(c) {
    const id = c.pid;
    if (!id || c.matchId) return;
    this.removeFromQueue(id, true);
    this.leaveParty(id);
    if (this.byPid.get(id) === c) this.byPid.delete(id);
    c.pid = null;
    const p = this.store.player(id);
    if (p) p.lastSeen = Date.now();
    this.pushPresence(id);
    this.store.save();
  }

  onProfile(c, m) {
    const p = this.store.player(c.pid);
    if (!p) return;
    p.profile = sanitizeProfile(m.profile);
    const save = sanitizeSave(m.save);
    if (save) p.save = save;
    this.store.save();
    const party = this.partyOf(c.pid);
    if (party) this.sendParty(party.id);
    for (const f of p.friends) this.sendSocial(f);
  }

  onResetAccount(c) {
    const id = c.pid;
    const p = this.store.player(id);
    if (!p) return;
    this.leaveParty(id);
    this.removeFromQueue(id, true);
    for (const other of Object.values(this.store.players)) {
      for (const k of ['friends', 'incoming', 'outgoing', 'blocked']) {
        const i = other[k].indexOf(id);
        if (i >= 0) {
          other[k].splice(i, 1);
          this.sendSocial(other.id);
        }
      }
    }
    delete this.store.players[id];
    this.byPid.delete(id);
    c.pid = null;
    this.store.save();
  }

  publicProfile(pid) {
    const p = this.store.player(pid);
    const pr = (p && p.profile) || {};
    return { id: pid, name: p ? p.name : '?', outfit: pr.outfit || 'cowboy', color: pr.color || 0, crownStyle: pr.crownStyle || 'gold', streak: pr.streak || 0, rank: pr.rank || 0, knife: pr.knife || 'standard' };
  }

  nameOf(pid) {
    const p = this.store.player(pid);
    return p ? p.name : '?';
  }

  // ---------------- Freunde ----------------
  status(pid) {
    const c = this.byPid.get(pid);
    if (!c) return 'offline';
    return c.matchId ? 'game' : 'lobby';
  }

  sendSocial(pid) {
    const c = this.byPid.get(pid);
    const p = this.store.player(pid);
    if (!c || !p) return;
    const view = (id) => {
      const o = this.store.player(id);
      if (!o) return null;
      const party = this.partyOf(id);
      return {
        id, name: o.name, status: this.status(id), streak: (o.profile && o.profile.streak) || 0,
        partyOpen: this.status(id) === 'lobby' && (!party || (party.open && party.members.length < PARTY_MAX)),
      };
    };
    this.send(c, {
      t: 'social',
      social: {
        friends: p.friends.map(view).filter(Boolean),
        incoming: p.incoming.map(view).filter(Boolean),
        outgoing: p.outgoing.map(view).filter(Boolean),
        blocked: p.blocked.map(view).filter(Boolean),
      },
    });
  }

  // Admin schenkt einem Spieler Coins (Coins liegen im Profil des Browsers)
  // ---------------- Admin ----------------
  onAdminLogin(c, m) {
    const r = this.admin.login(m.user, m.pass);
    if (r.ok) {
      c.admin = { user: String(m.user).trim().toLowerCase(), role: r.role };
      console.log(`[admin] Anmeldung ${c.admin.user} (${r.role})${r.role === 'guest' ? `, übrig: ${r.uses < 0 ? '∞' : r.uses}` : ''}`);
    }
    this.send(c, { t: 'result', rid: m.rid, ...r });
  }

  onAdminResume(c, m) {
    const a = this.admin.check(m.token);
    c.admin = a;
    this.send(c, { t: 'result', rid: m.rid, ok: !!a, role: a ? a.role : null, key: a ? null : 'adminExpired' });
  }

  onAdminAccounts(c, m) {
    const reply = (r) => this.send(c, { t: 'result', rid: m.rid, ...r });
    if (!c.admin || c.admin.role !== 'master') return reply({ ok: false, key: 'adminNoRight' });
    let r = { ok: true };
    if (m.op === 'add') r = this.admin.add(m.user, m.pass, m.uses);
    else if (m.op === 'remove') r = this.admin.remove(m.user);
    reply({ ...r, accounts: this.admin.list() });
  }

  // ---------------- Lobby-Nachrichten (Haupt-Admin) ----------------
  // Werden oben in der Mitte der Lobby angezeigt: dauerhaft (until = 0) oder bis zu einem Zeitpunkt
  announcements() {
    const now = Date.now();
    const all = this.store.data.announcements || [];
    const live = all.filter((a) => !a.until || a.until > now);
    if (live.length !== all.length) {
      this.store.data.announcements = live;
      this.store.save();
    }
    return live.map((a) => ({ id: a.id, text: a.text, left: a.until ? a.until - now : 0 }));
  }

  onAdminAnnounce(c, m) {
    const reply = (r) => this.send(c, { t: 'result', rid: m.rid, ...r, ann: this.announcements() });
    if (!c.admin || c.admin.role !== 'master') return reply({ ok: false, key: 'adminNoRight' });
    this.announcements(); // Abgelaufene entfernen
    const list = (this.store.data.announcements = this.store.data.announcements || []);
    if (m.op === 'add') {
      const text = String(m.text || '').replace(/\s+/g, ' ').trim().slice(0, ANN_MAX_LEN);
      if (!text) return reply({ ok: false, key: 'adminAnnEmpty' });
      const mins = Math.round(Number(m.mins) || 0);
      if (mins < 0 || mins > ANN_MAX_MINS) return reply({ ok: false, key: 'err_generic' });
      if (list.length >= ANN_MAX) return reply({ ok: false, key: 'adminAnnFull' });
      const id = (this.store.data.annId = (this.store.data.annId || 0) + 1);
      list.push({ id, text, until: mins ? Date.now() + mins * 60000 : 0 });
      console.log(`[admin] Lobby-Nachricht ${mins ? `für ${mins} min` : 'dauerhaft'}: ${text}`);
    } else if (m.op === 'remove') {
      this.store.data.announcements = list.filter((a) => a.id !== Number(m.id));
    }
    this.store.save();
    this.broadcastAnnouncements();
    return reply({ ok: true });
  }

  broadcastAnnouncements() {
    const ann = this.announcements();
    for (const c of this.clients) if (c.pid) this.send(c, { t: 'ann', ann });
  }

  isMaster(c) {
    return !!(c.admin && c.admin.role === 'master');
  }

  // Übersicht für das Admin-Panel: Spieler online, laufende Runden, Warteschlange, Server
  onAdminStats(c, m) {
    const reply = (r) => this.send(c, { t: 'result', rid: m.rid, ...r });
    if (!this.isMaster(c)) return reply({ ok: false, key: 'adminNoRight' });
    const online = [];
    for (const [id, cc] of this.byPid) {
      const p = this.store.player(id);
      online.push({ id, name: p ? p.name : '?', status: cc.matchId ? 'game' : this.queue.some((tk) => tk.members.includes(id)) ? 'queue' : 'lobby', admin: !!cc.admin, rank: p && p.profile ? p.profile.rank : 0 });
    }
    online.sort((a, b) => a.name.localeCompare(b.name));
    const matches = [...this.matches.values()].map((mt) => ({
      id: mt.id, mode: mt.mode, humans: mt.humanCount(), alive: mt.sim.players.filter((p) => p.alive).length, time: Math.round(mt.sim.matchTime || 0),
    }));
    reply({
      ok: true, online, matches,
      stats: {
        accounts: Object.keys(this.store.players).length,
        online: online.length,
        queue: this.queue.reduce((n, tk) => n + tk.members.length, 0),
        matches: matches.length,
        uptime: Math.round((Date.now() - this.startedAt) / 1000),
        mem: Math.round(process.memoryUsage().rss / 1048576),
        resetAt: this.store.data.resetAt || 0,
      },
    });
  }

  // Spieler rauswerfen: Verbindung trennen und 10 Minuten sperren
  onAdminKick(c, m) {
    const reply = (r) => this.send(c, { t: 'result', rid: m.rid, ...r });
    if (!this.isMaster(c)) return reply({ ok: false, key: 'adminNoRight' });
    const id = String(m.id || '');
    const tc = this.byPid.get(id);
    if (!tc || tc === c) return reply({ ok: false, key: 'err_not_found' });
    const name = this.nameOf(id);
    this.kicked.set(id, Date.now() + 10 * 60000);
    this.send(tc, { t: 'kicked', left: 10 });
    this.onClose(tc);
    tc.pid = null;
    setTimeout(() => { try { tc.ws.close(); } catch { /* ignorieren */ } }, 200);
    console.log(`[admin] ${name} wurde rausgeworfen`);
    reply({ ok: true, name });
  }

  // Alle Spieler zurücksetzen: Konten, Freunde, Partys, Kronen-Bot und Spielstände (auch im Browser)
  onAdminWipe(c, m) {
    const reply = (r) => this.send(c, { t: 'result', rid: m.rid, ...r });
    if (!this.isMaster(c)) return reply({ ok: false, key: 'adminNoRight' });
    if (m.confirm !== 'RESET') return reply({ ok: false, key: 'adminWipeConfirm' });
    const n = Object.keys(this.store.players).length;
    const at = Date.now();
    for (const cc of this.clients) {
      if (cc.matchId) {
        const mt = this.matches.get(cc.matchId);
        if (mt) mt.leave(cc);
      }
      cc.pid = null;
    }
    this.byPid.clear();
    this.queue = [];
    this.invites.clear();
    this.loginFails.clear();
    const d = this.store.data;
    d.players = {};
    d.parties = {};
    d.champion = null;
    d.resetAt = at;
    this.store.saveNow();
    for (const cc of this.clients) this.send(cc, { t: 'wiped', at });
    console.log(`[admin] Alle Spieler zurückgesetzt (${n} Konten gelöscht)`);
    reply({ ok: true, n });
  }

  onAdminCoins(c, m) {
    const reply = (ok, key, extra = {}) => this.send(c, { t: 'result', rid: m.rid, ok, key, ...extra });
    const master = (c.admin && c.admin.role === 'master') || (String(m.user || '').toLowerCase() === ADMIN_USER && m.pass === ADMIN_PASS);
    if (!master) return reply(false, 'adminWrong');
    const amount = Math.round(Number(m.amount));
    if (!Number.isFinite(amount) || amount < 1 || amount > ADMIN_MAX_COINS) return reply(false, 'err_generic');
    const target = this.store.byName(String(m.name || '').trim());
    if (!target) return reply(false, 'err_not_found');
    const tc = this.byPid.get(target.id);
    if (!tc) return reply(false, 'adminCoinsOffline', { name: target.name });
    this.send(tc, { t: 'coins', amount });
    console.log(`[admin] ${amount} Coins an ${target.name}`);
    return reply(true, 'adminCoinsSent', { name: target.name, n: amount });
  }

  pushPresence(pid) {
    const p = this.store.player(pid);
    if (!p) return;
    for (const f of p.friends) this.sendSocial(f);
  }

  onFriendRequest(c, m) {
    const me = this.store.player(c.pid);
    const target = this.store.byName(String(m.name || '').trim());
    const reply = (ok, key, extra = {}) => this.send(c, { t: 'result', rid: m.rid, ok, key, ...extra });
    if (!target) return reply(false, 'err_not_found');
    if (target.id === me.id) return reply(false, 'err_self');
    if (me.friends.includes(target.id)) return reply(false, 'err_already');
    if (me.blocked.includes(target.id) || target.blocked.includes(me.id)) return reply(false, 'err_blocked');
    if (me.outgoing.includes(target.id)) return reply(false, 'err_pending');
    if (me.incoming.includes(target.id)) {
      // beidseitig: direkt befreunden
      this.makeFriends(me, target);
      return reply(true, 'friendAdded', { name: target.name });
    }
    me.outgoing.push(target.id);
    target.incoming.push(me.id);
    this.store.save();
    this.sendSocial(me.id);
    this.sendSocial(target.id);
    this.notice(target.id, 'friendRequestFrom', { name: me.name }, '', 'friend');
    reply(true, 'requestSent', { name: target.name });
  }

  makeFriends(a, b) {
    remove(a.incoming, b.id); remove(a.outgoing, b.id);
    remove(b.incoming, a.id); remove(b.outgoing, a.id);
    if (!a.friends.includes(b.id)) a.friends.push(b.id);
    if (!b.friends.includes(a.id)) b.friends.push(a.id);
    this.store.save();
    this.sendSocial(a.id);
    this.sendSocial(b.id);
    this.notice(a.id, 'friendAdded', { name: b.name }, 'ok', 'friend');
    this.notice(b.id, 'friendAdded', { name: a.name }, 'ok', 'friend');
  }

  onFriendAccept(c, id) {
    const me = this.store.player(c.pid);
    const o = this.store.player(id);
    if (!o || !me.incoming.includes(id)) return;
    this.makeFriends(me, o);
  }

  onFriendDecline(c, id) {
    const me = this.store.player(c.pid);
    const o = this.store.player(id);
    remove(me.incoming, id);
    if (o) remove(o.outgoing, me.id);
    this.store.save();
    this.sendSocial(me.id);
    if (o) this.sendSocial(o.id);
  }

  onFriendCancel(c, id) {
    const me = this.store.player(c.pid);
    const o = this.store.player(id);
    remove(me.outgoing, id);
    if (o) remove(o.incoming, me.id);
    this.store.save();
    this.sendSocial(me.id);
    if (o) this.sendSocial(o.id);
  }

  onFriendRemove(c, id) {
    const me = this.store.player(c.pid);
    const o = this.store.player(id);
    remove(me.friends, id);
    if (o) remove(o.friends, me.id);
    this.store.save();
    this.sendSocial(me.id);
    if (o) this.sendSocial(o.id);
  }

  onBlock(c, id) {
    const me = this.store.player(c.pid);
    const o = this.store.player(id);
    if (!o || id === me.id) return;
    for (const k of ['friends', 'incoming', 'outgoing']) {
      remove(me[k], id);
      remove(o[k], me.id);
    }
    if (!me.blocked.includes(id)) me.blocked.push(id);
    this.store.save();
    this.sendSocial(me.id);
    this.sendSocial(o.id);
  }

  onUnblock(c, id) {
    const me = this.store.player(c.pid);
    remove(me.blocked, id);
    this.store.save();
    this.sendSocial(me.id);
  }

  // ---------------- Party ----------------
  partyOf(pid) {
    for (const p of Object.values(this.store.parties)) if (p.members.includes(pid)) return p;
    return null;
  }

  // Spielmodus der Party (Solo/Duo) – nur der Leader wählt
  onPartyMode(c, mode) {
    const party = this.partyOf(c.pid);
    if (!party || party.leader !== c.pid) return;
    party.mode = mode === 'duo' ? 'duo' : 'solo';
    this.store.save();
    this.sendParty(party.id);
  }

  partyView(party) {
    return {
      id: party.id,
      leader: party.leader,
      open: party.open,
      mode: party.mode || 'solo',
      members: party.members.map((id) => ({ ...this.publicProfile(id), ready: !!(party.ready && party.ready[id]), online: this.byPid.has(id), status: this.status(id) })),
    };
  }

  sendParty(partyId) {
    const party = this.store.parties[partyId];
    if (!party) return;
    const view = this.partyView(party);
    for (const id of party.members) this.sendTo(id, { t: 'party', party: view });
    for (const id of party.members) this.pushPresence(id);
  }

  createParty(leaderId) {
    const id = 'p' + nextParty++ + '_' + Date.now().toString(36);
    const party = { id, leader: leaderId, members: [leaderId], open: true, ready: {} };
    this.store.parties[id] = party;
    return party;
  }

  dissolveParty(partyId, silent = false) {
    const party = this.store.parties[partyId];
    if (!party) return;
    delete this.store.parties[partyId];
    if (!silent) for (const id of party.members) this.sendTo(id, { t: 'party', party: null });
    this.store.save();
  }

  joinParty(pid, party) {
    const cur = this.partyOf(pid);
    if (cur && cur.id === party.id) return true;
    if (party.members.length >= PARTY_MAX) return false;
    if (cur) this.leaveParty(pid);
    this.removeFromQueue(pid, true);
    // laufende Warteschlange der Party abbrechen
    this.cancelTicketOf(party.leader);
    party.members.push(pid);
    party.ready = party.ready || {};
    party.ready[pid] = false;
    this.store.save();
    this.sendParty(party.id);
    for (const id of party.members) if (id !== pid) this.notice(id, 'partyJoined', { name: this.nameOf(pid) }, 'ok', 'notify');
    return true;
  }

  leaveParty(pid) {
    const party = this.partyOf(pid);
    if (!party) return;
    this.cancelTicketOf(party.leader);
    remove(party.members, pid);
    if (party.ready) delete party.ready[pid];
    this.sendTo(pid, { t: 'party', party: null });
    if (party.members.length < 2) {
      this.dissolveParty(party.id);
    } else {
      if (party.leader === pid) {
        party.leader = party.members[0];
        for (const id of party.members) this.notice(id, 'newLeader', { name: this.nameOf(party.leader) });
      }
      for (const id of party.members) this.notice(id, 'partyLeft', { name: this.nameOf(pid) });
      this.sendParty(party.id);
    }
    this.store.save();
    this.pushPresence(pid);
  }

  onPartyInvite(c, targetId) {
    const me = this.store.player(c.pid);
    const target = this.store.player(targetId);
    if (!target || !me.friends.includes(targetId)) return this.err(c, 'err_not_found');
    const st = this.status(targetId);
    if (st === 'offline') return this.err(c, 'err_offline');
    if (st === 'game') return this.err(c, 'err_in_game');
    let party = this.partyOf(c.pid);
    if (party && party.members.includes(targetId)) return;
    if (party && party.members.length >= PARTY_MAX) return this.err(c, 'err_party_full');
    for (const inv of this.invites.values()) {
      if (inv.from === c.pid && inv.to === targetId) return this.notice(c.pid, 'inviteSent', { name: target.name });
    }
    const inv = { id: 'i' + nextInvite++, from: c.pid, to: targetId, expires: Date.now() + INVITE_TTL * 1000 };
    this.invites.set(inv.id, inv);
    this.sendTo(targetId, { t: 'invite', inviteId: inv.id, from: { id: c.pid, name: me.name }, ttl: INVITE_TTL });
    this.notice(c.pid, 'inviteSent', { name: target.name }, 'ok');
  }

  onInviteAccept(c, inviteId) {
    const inv = this.invites.get(inviteId);
    if (!inv || inv.to !== c.pid) return this.err(c, 'err_expired');
    this.invites.delete(inviteId);
    if (Date.now() > inv.expires) return this.err(c, 'err_expired');
    if (!this.byPid.has(inv.from)) return this.err(c, 'err_offline');
    if (this.status(inv.from) === 'game') return this.err(c, 'err_in_game');
    let party = this.partyOf(inv.from);
    if (!party) {
      party = this.createParty(inv.from);
      this.removeFromQueue(inv.from, true);
    }
    if (!this.joinParty(c.pid, party)) return this.err(c, 'err_party_full');
  }

  onInviteDecline(c, inviteId) {
    const inv = this.invites.get(inviteId);
    if (!inv || inv.to !== c.pid) return;
    this.invites.delete(inviteId);
  }

  onPartyJoin(c, friendId) {
    const me = this.store.player(c.pid);
    if (!me.friends.includes(friendId)) return this.err(c, 'err_not_found');
    if (this.status(friendId) !== 'lobby') return this.err(c, this.status(friendId) === 'game' ? 'err_in_game' : 'err_offline');
    let party = this.partyOf(friendId);
    if (party && !party.open) return this.err(c, 'err_party_closed');
    if (!party) {
      party = this.createParty(friendId);
      this.removeFromQueue(friendId, true);
    }
    if (!this.joinParty(c.pid, party)) this.err(c, 'err_party_full');
  }

  onPartyKick(c, id) {
    const party = this.partyOf(c.pid);
    if (!party || party.leader !== c.pid) return this.err(c, 'err_not_leader');
    if (!party.members.includes(id) || id === c.pid) return;
    this.notice(id, 'youWereKicked', {}, 'error');
    this.leaveParty(id);
  }

  onPartyPromote(c, id) {
    const party = this.partyOf(c.pid);
    if (!party || party.leader !== c.pid) return this.err(c, 'err_not_leader');
    if (!party.members.includes(id)) return;
    this.cancelTicketOf(c.pid);
    party.leader = id;
    party.ready = {};
    this.store.save();
    for (const m of party.members) this.notice(m, 'newLeader', { name: this.nameOf(id) });
    this.sendParty(party.id);
  }

  onPartyReady(c, ready) {
    const party = this.partyOf(c.pid);
    if (!party) return;
    party.ready = party.ready || {};
    party.ready[c.pid] = ready;
    if (!ready) this.cancelTicketOf(party.leader);
    this.sendParty(party.id);
  }

  onPartyChat(c, text) {
    const party = this.partyOf(c.pid);
    if (!party) return;
    const txt = String(text || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 140);
    if (!txt) return;
    const now = Date.now();
    if (c.lastChat && now - c.lastChat < 400) return;
    c.lastChat = now;
    for (const id of party.members) this.sendTo(id, { t: 'chat', from: c.pid, name: this.nameOf(c.pid), text: txt, ts: now });
  }

  // ---------------- Einladungen ablaufen lassen ----------------
  tickInvites() {
    const now = Date.now();
    for (const inv of this.invites.values()) {
      if (now > inv.expires) {
        this.invites.delete(inv.id);
        this.sendTo(inv.to, { t: 'inviteGone', inviteId: inv.id });
      }
    }
  }

  // ---------------- Matchmaking ----------------
  // m.wait: gewünschte Wartezeit auf echte Spieler (10–120 s, Standard 15)
  onQueue(c, m = {}) {
    if (c.matchId) return;
    const party = this.partyOf(c.pid);
    let members = [c.pid];
    if (party) {
      if (party.leader !== c.pid) return this.err(c, 'err_not_leader');
      const notReady = party.members.filter((id) => id !== party.leader && !(party.ready && party.ready[id]));
      if (notReady.length) return this.err(c, 'waitReady');
      members = party.members.filter((id) => this.byPid.has(id) && !this.byPid.get(id).matchId);
    }
    if (this.queue.some((tk) => tk.members.includes(c.pid))) return;
    const mode = m.mode === 'duo' ? 'duo' : 'solo';
    if (mode === 'duo' && members.length > 2) return this.err(c, 'duoTooMany');
    const ticket = { leader: c.pid, members, created: Date.now(), wait: clampQueueWait(m.wait), mode };
    this.queue.push(ticket);
    this.tickQueue();
  }

  onQueueCancel(c) {
    this.cancelTicketOf(c.pid);
  }

  cancelTicketOf(pid) {
    const i = this.queue.findIndex((tk) => tk.leader === pid);
    if (i < 0) return;
    const tk = this.queue[i];
    this.queue.splice(i, 1);
    for (const id of tk.members) this.sendTo(id, { t: 'queue', state: 'idle' });
  }

  removeFromQueue(pid, notify) {
    const i = this.queue.findIndex((tk) => tk.members.includes(pid));
    if (i < 0) return;
    const tk = this.queue[i];
    this.queue.splice(i, 1);
    if (notify) for (const id of tk.members) this.sendTo(id, { t: 'queue', state: 'idle' });
  }

  tickQueue() {
    if (!this.queue.length) return;
    // Tickets mit getrennten Spielern entfernen
    this.queue = this.queue.filter((tk) => {
      const ok = tk.members.every((id) => this.byPid.has(id) && !this.byPid.get(id).matchId);
      if (!ok) for (const id of tk.members) this.sendTo(id, { t: 'queue', state: 'idle' });
      return ok;
    });
    if (!this.queue.length) return;
    // Parties nie trennen: FIFO auffüllen bis max. 20 Menschen (nur Tickets mit demselben Modus)
    const pick = [];
    let humans = 0;
    const mode = this.queue[0].mode;
    for (const tk of this.queue) {
      if (tk.mode !== mode) continue;
      if (humans + tk.members.length <= MATCH_SIZE) {
        pick.push(tk);
        humans += tk.members.length;
      }
    }
    // immer die volle Wartezeit des ältesten Tickets abwarten (auch wenn jemand dazukommt),
    // dann mit Bots auffüllen
    const first = this.queue[0];
    const waited = (Date.now() - first.created) / 1000;
    if (humans >= MATCH_SIZE || waited >= first.wait) {
      this.queue = this.queue.filter((tk) => !pick.includes(tk));
      this.startMatch(pick, mode);
      return;
    }
    const secs = Math.max(0, first.wait - waited);
    for (const tk of this.queue) {
      const n = pick.includes(tk) ? humans : tk.members.length;
      for (const id of tk.members) this.sendTo(id, { t: 'queue', state: 'waiting', secs: pick.includes(tk) ? secs : Math.max(secs, tk.wait - (Date.now() - tk.created) / 1000), wait: pick.includes(tk) ? first.wait : tk.wait, humans: n, bots: MATCH_SIZE - n, map: this.nextMap, mode: tk.mode });
    }
  }

  startMatch(tickets, mode = 'solo') {
    const clients = [];
    for (const tk of tickets) for (const id of tk.members) {
      const c = this.byPid.get(id);
      if (c && !c.matchId) clients.push(c);
    }
    if (!clients.length) return;
    const mapId = this.nextMap;
    const world = this.mapNow(mapId);
    const match = new ServerMatch(this, clients, world, mode);
    this.matches.set(match.id, match);
    // nächste Runde: andere zufällige Karte, im Hintergrund vorbereiten
    this.nextMap = randomMapId(Math.random, mapId);
    this.pruneMaps();
    this.prepareMap(this.nextMap);
    const parties = new Set();
    for (const c of clients) {
      this.send(c, { t: 'queue', state: 'idle' });
      this.pushPresence(c.pid);
      const party = this.partyOf(c.pid);
      if (party) parties.add(party.id);
    }
    // Party-Mitglieder sehen, wer im Spiel ist (blaue Figur in der Lobby)
    for (const id of parties) this.sendParty(id);
  }

  onClientLeftMatch(c) {
    if (c.pid) {
      this.pushPresence(c.pid);
      const party = this.partyOf(c.pid);
      if (party) this.sendParty(party.id);
    }
  }

  onMatchFinished(match, winnerId) {
    const sim = match.sim;
    const w = winnerId ? sim.byId.get(winnerId) : null;
    if (w && w.isBot) {
      const prev = this.store.data.champion;
      const streak = prev && prev.name === w.name ? (prev.streak || 1) + 1 : 1;
      this.store.data.champion = { name: w.name, outfit: w.outfit, color: w.color, streak };
    } else if (w) {
      this.store.data.champion = null;
    }
    this.store.save();
    this.matches.delete(match.id);
    this.pruneMaps();
    for (const c of match.clients.values()) {
      if (c.matchId === match.id) c.matchId = null;
      if (c.pid) {
        const party = this.partyOf(c.pid);
        if (party) {
          party.ready = {};
          this.sendParty(party.id);
        }
        this.pushPresence(c.pid);
      }
    }
    match.destroy();
    console.log(`Match ${match.id} beendet. Sieger: ${w ? w.name : '-'}`);
  }

  // ---------------- Hosting ----------------
  hostStatus() {
    return { ...this.tunnel.status(), players: this.byPid.size };
  }

  sendHost(c) {
    this.send(c, { t: 'host', status: { ...this.hostStatus(), isHostClient: c.isHost } });
  }

  // Probe-Simulation in kleinen Häppchen (blockiert den Server nicht)
  warmup(world) {
    const t0 = Date.now();
    const rng = new RNG(99);
    const sim = new Simulation(world, { seed: 99, players: Simulation.fillWithBots([], rng), storm: true });
    let steps = 0;
    const slice = () => {
      for (let i = 0; i < 15 && steps < WARMUP_STEPS && sim.phase !== 'ended'; i++, steps++) {
        sim.step(SIM_DT);
        sim.drainEvents();
      }
      if (steps < WARMUP_STEPS && sim.phase !== 'ended') setImmediate(slice);
      else console.log(`Server aufgewärmt (${Math.round(steps * SIM_DT)} s Probe-Runde in ${Date.now() - t0} ms).`);
    };
    slice();
  }

  // ---------------- Karten ----------------
  // Karte in kleinen Häppchen erzeugen (laufende Matches ruckeln nicht); cb(world), wenn fertig
  prepareMap(id, cb = null) {
    let e = this.maps.get(id);
    if (e) {
      if (cb) (e.ready ? cb(e.world) : e.waiters.push(cb));
      return e;
    }
    const t0 = Date.now();
    e = { id, ready: false, world: null, waiters: cb ? [cb] : [], map: null, nav: null };
    const mapGen = mapSteps(id);
    let navGen = null;
    // ein Arbeitsschritt; true = fertig
    e.step = () => {
      if (e.ready) return true;
      if (!e.map) {
        const r = mapGen.next();
        if (r.done) {
          e.map = r.value;
          e.nav = new NavGrid(e.map.terrain, e.map.collision, true);
          navGen = e.nav.steps();
        }
        return false;
      }
      if (!navGen.next().done) return false;
      const m = e.map;
      e.world = { id, name: m.name, terrain: m.terrain, collision: m.collision, nav: e.nav, pois: m.pois, chests: m.chests, floorLoot: m.floorLoot };
      e.ready = true;
      console.log(`Karte ${m.name} bereit in ${Date.now() - t0} ms (${m.collision.cols.length} Collider).`);
      for (const w of e.waiters.splice(0)) w(e.world);
      return true;
    };
    const slice = () => {
      if (!this.maps.has(id) || e.ready) return;
      const t = Date.now();
      while (Date.now() - t < 10) if (e.step()) return;
      setImmediate(slice);
    };
    this.maps.set(id, e);
    setImmediate(slice);
    return e;
  }

  // Karte sofort fertigstellen (nur falls die Vorbereitung noch läuft)
  mapNow(id) {
    const e = this.prepareMap(id);
    while (!e.step()) { /* Rest synchron */ }
    return e.world;
  }

  // nicht mehr gebrauchte Karten freigeben (laufende Matches behalten ihre Welt)
  pruneMaps() {
    const used = new Set([this.nextMap]);
    for (const m of this.matches.values()) used.add(m.mapId);
    for (const id of [...this.maps.keys()]) if (!used.has(id)) this.maps.delete(id);
  }

  serverInfo() {
    return { ...this.info, online: this.byPid.size, matches: this.matches.size };
  }

  // Spielerzahl für die Lobby-Anzeige (nur an Spieler in der Lobby)
  broadcastServerInfo() {
    const info = this.serverInfo();
    if (this.lastInfo && this.lastInfo.online === info.online && this.lastInfo.matches === info.matches) return;
    this.lastInfo = info;
    for (const c of this.clients) if (c.pid && !c.matchId) this.send(c, { t: 'srv', srv: info });
  }

  broadcastHost() {
    for (const c of this.clients) if (c.isHost || this.tunnel.url) this.sendHost(c);
  }

  saveNow() {
    this.tunnel.stop();
    this.store.saveNow();
  }
}

function remove(arr, v) {
  const i = arr.indexOf(v);
  if (i >= 0) arr.splice(i, 1);
}

// Anmeldeschlüssel (SHA-256 des Geburtsdatums, vom Client) mit Salz noch einmal gehasht speichern
const AUTH_RE = /^[0-9a-f]{64}$/;
function hashAuth(salt, auth) {
  return crypto.createHash('sha256').update(String(salt) + ':' + auth).digest('hex');
}

// Spielstand (Coins, Skins, Rang, Statistik …) als Kopie für die Anmeldung auf anderen Geräten
function sanitizeSave(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  let json;
  try { json = JSON.stringify(v); } catch { return null; }
  if (json.length > 20000) return null;
  return JSON.parse(json);
}

function sanitizeProfile(p) {
  p = p || {};
  const str = (v, d, max = 16) => (typeof v === 'string' ? v.slice(0, max) : d);
  const num = (v, d, lo, hi) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d);
  return {
    outfit: str(p.outfit, 'cowboy'),
    color: num(p.color, 0, 0, 7),
    crownStyle: str(p.crownStyle, 'gold'),
    streak: num(p.streak, 0, 0, 999),
    rank: num(p.rank, 0, 0, 14),
    knife: str(p.knife, 'standard'),
  };
}
