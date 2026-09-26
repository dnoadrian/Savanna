// Lobby-Server: Benutzernamen, Freunde, Party, Einladungen, Matchmaking (15 s Warteschlange,
// dann mit Bots auf 12 auffüllen),
// server-autoritative Matches und Online-Hosting-Steuerung.
import { Store } from './store.js';
import { ServerMatch } from './match.js';
import { TunnelManager } from './tunnel.js';
import { Beacon } from './beacon.js';
import { AdminAuth } from './admin.js';
import { validateName, suggestAlternatives } from '../shared/names.js';
import { generateMap } from '../shared/map/mapgen.js';
import { NavGrid } from '../shared/sim/nav.js';
import { MAP_SEED, MATCH_SIZE, PARTY_MAX, INVITE_TTL, SERVER_PORT, ADMIN_USER, ADMIN_PASS, ADMIN_MAX_COINS, clampQueueWait } from '../shared/constants.js';

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
    const t0 = Date.now();
    const map = generateMap(MAP_SEED);
    const nav = new NavGrid(map.terrain, map.collision);
    this.world = { terrain: map.terrain, collision: map.collision, nav, pois: map.pois, chests: map.chests, floorLoot: map.floorLoot };
    console.log(`Karte generiert in ${Date.now() - t0} ms (${map.collision.cols.length} Collider).`);
    this.tunnel = new TunnelManager(port);
    this.tunnel.on('change', (st) => this.broadcastHost(st));
    this.beacon = new Beacon(this.tunnel);
    this.admin = new AdminAuth(this.store);
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
    if (!c.pid) return;
    // Match-Nachrichten
    if (c.matchId) {
      const match = this.matches.get(c.matchId);
      if (match && ['st', 'fire', 'reload', 'reloadCancel', 'sel', 'swap', 'drop', 'dropAmmo', 'cheat', 'int', 'use', 'useCancel', 'leaveMatch', 'loaded'].includes(m.t)) {
        match.onMessage(c, m);
        return;
      }
    }
    switch (m.t) {
      case 'setName': return this.onSetName(c, m);
      case 'profile': return this.onProfile(c, m);
      case 'resetAccount': return this.onResetAccount(c);
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
      case 'queue': return this.onQueue(c, m);
      case 'queueCancel': return this.onQueueCancel(c);
      case 'adminCoins': return this.onAdminCoins(c, m);
      case 'adminLogin': return this.onAdminLogin(c, m);
      case 'adminResume': return this.onAdminResume(c, m);
      case 'adminLogout': c.admin = null; return;
      case 'adminAccounts': return this.onAdminAccounts(c, m);
      case 'cheat': c.cheats = { ia: !!m.ia }; return;
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
    const r = this.nameResult(name, id);
    if (!r.ok) {
      this.send(c, { t: 'nameTaken', err: r.err, suggestions: r.suggestions || suggestAlternatives(name || 'Spieler', (n) => this.store.nameTaken(n, id)) });
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
    p.profile = sanitizeProfile(m.profile);
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
    this.send(c, { t: 'welcome', name: p.name, isHost: c.isHost });
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

  onProfile(c, m) {
    const p = this.store.player(c.pid);
    if (!p) return;
    p.profile = sanitizeProfile(m.profile);
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
    return { id: pid, name: p ? p.name : '?', outfit: pr.outfit || 'cowboy', color: pr.color || 0, crownStyle: pr.crownStyle || 'gold', streak: pr.streak || 0, level: pr.level || 1 };
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

  partyView(party) {
    return {
      id: party.id,
      leader: party.leader,
      open: party.open,
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
    const ticket = { leader: c.pid, members, created: Date.now(), wait: clampQueueWait(m.wait) };
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
    // Parties nie trennen: FIFO auffüllen bis max. 12 Menschen
    const pick = [];
    let humans = 0;
    for (const tk of this.queue) {
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
      this.startMatch(pick);
      return;
    }
    const secs = Math.max(0, first.wait - waited);
    for (const tk of this.queue) {
      const n = pick.includes(tk) ? humans : tk.members.length;
      for (const id of tk.members) this.sendTo(id, { t: 'queue', state: 'waiting', secs, wait: first.wait, humans: n, bots: MATCH_SIZE - n });
    }
  }

  startMatch(tickets) {
    const clients = [];
    for (const tk of tickets) for (const id of tk.members) {
      const c = this.byPid.get(id);
      if (c && !c.matchId) clients.push(c);
    }
    if (!clients.length) return;
    const match = new ServerMatch(this, clients);
    this.matches.set(match.id, match);
    for (const c of clients) {
      this.send(c, { t: 'queue', state: 'idle' });
      this.pushPresence(c.pid);
    }
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

function sanitizeProfile(p) {
  p = p || {};
  const str = (v, d, max = 16) => (typeof v === 'string' ? v.slice(0, max) : d);
  const num = (v, d, lo, hi) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d);
  return {
    outfit: str(p.outfit, 'cowboy'),
    color: num(p.color, 0, 0, 7),
    crownStyle: str(p.crownStyle, 'gold'),
    streak: num(p.streak, 0, 0, 999),
    level: num(p.level, 1, 1, 9999),
  };
}
