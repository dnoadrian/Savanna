// Integrationstest des Lobby-/Match-Servers mit simulierten WebSocket-Clients (ohne Netzwerk).
import assert from 'assert';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { QUEUE_WAIT, ADMIN_USER, ADMIN_PASS } from '../shared/constants.js';
import { birthKey } from '../shared/sha256.js';

export async function runServerTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'showdown-test-'));
  process.env.SHOWDOWN_DATA_DIR = dir;
  const { GameServer } = await import('../server/game-server.js');
  const gs = new GameServer(0);

  class FakeWS {
    constructor() {
      this.readyState = 1;
      this.inbox = [];
      this.handlers = {};
    }
    send(data) { this.inbox.push(JSON.parse(data)); }
    on(ev, fn) { this.handlers[ev] = fn; }
    close() { this.readyState = 3; this.handlers.close && this.handlers.close(); }
    msg(obj) { this.handlers.message(JSON.stringify(obj)); }
    last(t) { return [...this.inbox].reverse().find((m) => m.t === t); }
    all(t) { return this.inbox.filter((m) => m.t === t); }
  }
  const connect = (host = false) => {
    const ws = new FakeWS();
    gs.onConnection(ws, { socket: { remoteAddress: host ? '127.0.0.1' : '10.0.0.5' }, headers: {} });
    return ws;
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const A = connect(true);
  const B = connect();
  A.msg({ t: 'hello', id: 'aaaa-1', name: 'Alpha', profile: { outfit: 'ninja', streak: 1 } });
  assert.equal(A.last('welcome').isHost, true);
  // gleicher Name, andere Schreibweise -> vergeben
  B.msg({ t: 'checkName', rid: 1, name: 'ALPHA' });
  const nc = B.last('nameCheck');
  assert.equal(nc.ok, false);
  assert.equal(nc.err, 'taken');
  assert.equal(nc.suggestions.length, 3);
  B.msg({ t: 'hello', id: 'bbbb-2', name: 'alpha' });
  assert.ok(B.last('nameTaken'));
  B.msg({ t: 'hello', id: 'bbbb-2', name: 'Bravo' });
  assert.equal(B.last('welcome').isHost, false);
  // Gäste dürfen den Tunnel nicht steuern
  B.msg({ t: 'hostStart' });
  assert.equal(B.last('err').key, 'err_not_host');

  // Freundschaft
  A.msg({ t: 'friendRequest', rid: 2, name: 'bravo' });
  assert.equal(A.last('result').ok, true);
  assert.equal(B.last('social').social.incoming[0].name, 'Alpha');
  B.msg({ t: 'friendAccept', id: 'aaaa-1' });
  assert.equal(A.last('social').social.friends[0].name, 'Bravo');
  assert.equal(A.last('social').social.friends[0].status, 'lobby');

  // Namensänderung: Freund sieht den neuen Namen
  B.msg({ t: 'setName', rid: 3, name: 'BravoNeu' });
  assert.equal(B.last('setNameResult').ok, true);
  assert.equal(A.last('social').social.friends[0].name, 'BravoNeu');

  // Einladung + Party
  A.msg({ t: 'partyInvite', id: 'bbbb-2' });
  const inv = B.last('invite');
  assert.ok(inv);
  B.msg({ t: 'inviteAccept', inviteId: inv.inviteId });
  const party = A.last('party').party;
  assert.equal(party.members.length, 2);
  assert.equal(party.leader, 'aaaa-1');
  // Start ohne Bereit -> Fehler
  A.msg({ t: 'queue', opts: {} });
  assert.equal(A.last('err').key, 'waitReady');
  B.msg({ t: 'partyReady', ready: true });
  B.msg({ t: 'partyChat', text: 'Hallo!' });
  assert.equal(A.last('chat').text, 'Hallo!');
  const ageQueue = () => {
    for (const tk of gs.queue) tk.created -= (tk.wait + 1) * 1000;
    gs.tickQueue();
  };
  A.msg({ t: 'queue' });
  assert.equal(A.last('queue').state, 'waiting');
  assert.equal(A.last('queue').humans, 2);
  assert.equal(A.last('queue').bots, 18);
  assert.equal(A.last('queue').wait, QUEUE_WAIT, 'Standard-Wartezeit 15 s');
  // ein weiterer Spieler kommt dazu: trotzdem die vollen 15 s warten
  const C = connect();
  C.msg({ t: 'hello', id: 'cccc-3', name: 'Charlie' });
  C.msg({ t: 'queue', wait: 500 });
  assert.equal(gs.queue.find((tk) => tk.leader === 'cccc-3').wait, 120, 'Wartezeit max. 120 s');
  assert.equal(C.last('queue').wait, QUEUE_WAIT, 'es gilt die Wartezeit des ältesten Tickets');
  gs.tickQueue();
  assert.ok(!A.last('matchStart'), 'Match darf erst nach 15 s starten');
  assert.equal(C.last('queue').humans, 3);
  ageQueue();
  const ms = A.last('matchStart');
  assert.ok(ms, 'Match nicht gestartet');
  assert.equal(ms.players.length, 20);
  assert.ok(ms.map, 'Karte fehlt');
  assert.equal(ms.mode, 'solo');
  assert.equal(ms.players.filter((p) => !p.isBot).length, 3);
  assert.ok(B.last('matchStart'));
  assert.ok(C.last('matchStart'));
  const match = gs.matches.get(ms.matchId);
  for (const X of [A, B, C]) X.msg({ t: 'loaded', mid: ms.matchId });
  await wait(600);
  assert.ok(A.all('snap').length > 3, 'keine Snapshots');
  // Inventar kommt mit dem Snapshot: graue Pistole 20 + 60
  const startInv = A.all('snap').map((m) => m.me && m.me.inv).find(Boolean);
  assert.ok(startInv, 'kein Inventar');
  assert.deepEqual(startInv.s[0], ['w', 'pistol', 0, 20]);
  assert.equal(startInv.a.light, 60);
  assert.equal(gs.status('aaaa-1'), 'game');
  // B verlässt das Match -> Figur scheidet aus, Match läuft weiter
  B.msg({ t: 'leaveMatch' });
  C.msg({ t: 'leaveMatch' });
  await wait(100);
  const kill = A.all('ev').flatMap((m) => m.e).find((e) => e.t === 'kill' && e.v === 'bbbb-2');
  assert.ok(kill, 'kein Kill-Event für Verlassen');
  assert.equal(kill.w, 'leave');
  while (match.sim.phase === 'countdown') await wait(50);
  const sim = match.sim;
  // Schuss über das Netzwerkformat: Pistole trifft einen Bot
  const me = sim.byId.get('aaaa-1');
  const bot = sim.players.find((p) => p.isBot && p.alive);
  // beide hoch in die Luft: kein Haus/Baum dazwischen (Startplätze liegen überall auf der Insel)
  me.body.y = 150;
  bot.body.x = me.body.x; bot.body.z = me.body.z - 5; bot.body.y = me.body.y; bot.flags = 0;
  bot.brain.update = () => bot.brain.input;
  A.msg({ t: 'fire', s: 0, o: [me.body.x, me.body.y + 1.62, me.body.z], d: [[0, -0.05, -1]], rw: 0 });
  await wait(120);
  const hitEv = A.all('ev').flatMap((m) => m.e).find((e) => e.t === 'hit' && e.v === bot.id && e.a === 'aaaa-1');
  assert.ok(hitEv, 'Treffer fehlt');
  assert.equal(me.inv.slots[0].mag, 19);
  // Match beenden: alle Bots eliminieren
  for (const p of sim.players) if (p.isBot && p.alive) sim.applyDamage(p, 999, 'aaaa-1', 'b', null, 'ar');
  const t1 = Date.now();
  while (!A.last('matchEnd') && Date.now() - t1 < 4000) await wait(100);
  const end = A.last('matchEnd');
  assert.ok(end, 'kein matchEnd');
  assert.equal(end.winner, 'aaaa-1');
  assert.equal(end.results.length, 20);
  assert.equal(end.results.find((r) => r.id === 'aaaa-1').placement, 1);
  assert.equal(gs.status('aaaa-1'), 'lobby');

  // Duo: Party (A + B) wählt Duo → beide im selben Team, Rest mit Bots aufgefüllt
  A.msg({ t: 'partyMode', mode: 'duo' });
  assert.equal(B.last('party').party.mode, 'duo');
  B.msg({ t: 'partyReady', ready: true });
  const mc = gs.matches.size;
  A.msg({ t: 'queue', mode: 'duo' });
  assert.equal(A.last('queue').mode, 'duo');
  ageQueue();
  const ds = A.all('matchStart').pop();
  assert.equal(ds.mode, 'duo');
  assert.equal(gs.matches.size, mc + 1);
  const ta = ds.players.find((p) => p.id === 'aaaa-1').team, tb = ds.players.find((p) => p.id === 'bbbb-2').team;
  assert.equal(ta, tb, 'Party-Partner im selben Team');
  const dm = gs.matches.get(ds.matchId);
  assert.equal(dm.sim.mode, 'duo');
  for (const X of [A, B]) X.msg({ t: 'loaded', mid: ds.matchId });
  await wait(200);
  while (dm.sim.phase === 'countdown') await wait(50);
  const pa = dm.sim.byId.get('aaaa-1'), pb = dm.sim.byId.get('bbbb-2');
  dm.sim.applyDamage(pa, 500, 'bot_3', 'b', null, 'ar');
  assert.ok(pa.knocked, 'A am Boden');
  pb.body.x = pa.body.x + 1; pb.body.z = pa.body.z; pb.body.y = pa.body.y;
  B.msg({ t: 'rev', v: 'aaaa-1' });
  assert.equal(pb.reviving, 'aaaa-1');
  A.msg({ t: 'leaveMatch' });
  B.msg({ t: 'leaveMatch' });
  await wait(100);
  B.msg({ t: 'partyMode', mode: 'solo' });

  // Anmelden mit Name + Geburtsdatum auf einem anderen Gerät
  const key = birthKey('2011-04-03');
  const D = connect();
  D.msg({ t: 'hello', id: 'dddd-4', name: 'Delta', auth: key, save: { coins: 1234, rank: { i: 3, p: 40 } } });
  assert.ok(D.last('welcome'));
  const E = connect();
  E.msg({ t: 'login', rid: 9, name: 'delta', auth: birthKey('2011-04-04') });
  assert.equal(E.last('result').key, 'loginWrong');
  E.msg({ t: 'login', rid: 10, name: 'DELTA', auth: key });
  const lr = E.last('result');
  assert.ok(lr.ok, 'Anmeldung fehlgeschlagen');
  assert.equal(lr.id, 'dddd-4');
  assert.equal(lr.save.coins, 1234);
  assert.equal(lr.save.rank.i, 3);
  // wer nur die ID kennt (ohne Geburtsdatum), übernimmt das Konto nicht
  const F2 = connect();
  F2.msg({ t: 'hello', id: 'dddd-4', name: 'Delta' });
  assert.ok(F2.last('authFail'));
  E.msg({ t: 'hello', id: 'dddd-4', name: 'Delta', auth: key, save: { ...lr.save, coins: 1500 } });
  assert.ok(E.last('welcome'));
  assert.equal(gs.store.player('dddd-4').save.coins, 1500);
  // Bremse gegen Durchprobieren
  for (let i = 0; i < 6; i++) F2.msg({ t: 'login', rid: 20 + i, name: 'Delta', auth: birthKey('2000-01-0' + (i + 1)) });
  assert.equal(F2.last('result').key, 'loginSlow');

  // Persistenz
  gs.saveNow();
  const db = JSON.parse(fs.readFileSync(path.join(dir, 'showdownbay.json'), 'utf8'));
  assert.equal(Object.keys(db.players).length, 4);
  assert.ok(!JSON.stringify(db).includes('2011-04-03'), 'Geburtsdatum darf nicht gespeichert werden');
  assert.notEqual(db.players['dddd-4'].auth, key, 'Schlüssel nur gesalzen gespeichert');
  assert.equal(db.players['aaaa-1'].friends[0], 'bbbb-2');
  assert.equal(Object.keys(db.parties).length, 1);

  // Arena 1v1: eigener Match-Typ auf der Holzarena, Bot als Gegner, Ausrüstung über das Netz wählen
  const HT = connect();
  HT.msg({ t: 'hello', id: 'hhhh-8', name: 'Hotel' });
  assert.ok(HT.last('welcome'));
  gs.startMatch([{ members: ['hhhh-8'] }], '1v1');
  const am = HT.last('matchStart');
  assert.equal(am.mode, '1v1');
  assert.equal(am.map, 'arena');
  assert.equal(am.players.length, 2);
  const amatch = gs.matches.get(am.matchId);
  HT.msg({ t: 'loaded', mid: am.matchId });
  HT.msg({ t: 'loadout', s: { w: ['sniper', 'pump', 'ar'], c: ['medkit', 'big'] } });
  const hp = amatch.sim.byId.get('hhhh-8');
  assert.deepEqual(hp.inv.slots.map((it) => it.w || it.c), ['sniper', 'pump', 'ar', 'medkit', 'big']);
  HT.msg({ t: 'leaveMatch' });

  // Admin: Übersicht, Rauswerfen, alle Spieler zurücksetzen
  const ADM = connect();
  ADM.msg({ t: 'adminStats', rid: 40 });
  assert.equal(ADM.last('result').key, 'adminNoRight');
  ADM.msg({ t: 'adminLogin', rid: 41, user: ADMIN_USER, pass: ADMIN_PASS });
  assert.ok(ADM.last('result').ok);
  ADM.msg({ t: 'adminStats', rid: 42 });
  const sr = ADM.last('result');
  assert.ok(sr.ok);
  assert.equal(sr.stats.accounts, 5);
  assert.ok(sr.online.some((p) => p.name === 'Delta'));
  ADM.msg({ t: 'adminKick', rid: 43, id: 'dddd-4' });
  assert.ok(ADM.last('result').ok);
  assert.ok(E.last('kicked'));
  const E2 = connect();
  E2.msg({ t: 'hello', id: 'dddd-4', name: 'Delta', auth: key });
  assert.ok(E2.last('kicked'), 'rausgeworfen: 10 Minuten gesperrt');
  assert.ok(!E2.last('welcome'));
  ADM.msg({ t: 'adminWipe', rid: 44 });
  assert.equal(ADM.last('result').key, 'adminWipeConfirm');
  B.msg({ t: 'adminWipe', rid: 45, confirm: 'RESET' });
  assert.equal(B.last('result').key, 'adminNoRight');
  ADM.msg({ t: 'adminWipe', rid: 46, confirm: 'RESET' });
  const wr = ADM.last('result');
  assert.ok(wr.ok);
  assert.equal(wr.n, 5);
  assert.ok(A.last('wiped') && B.last('wiped'), 'alle Verbundenen werden benachrichtigt');
  assert.equal(Object.keys(gs.store.players).length, 0);
  assert.equal(Object.keys(gs.store.parties).length, 0);
  // Browser mit altem Spielstand (vor dem Reset angelegt): wird gelöscht statt neu registriert
  const G = connect();
  G.msg({ t: 'hello', id: 'aaaa-1', name: 'Alpha', save: { coins: 900, createdAt: 1000 } });
  assert.ok(G.last('wiped'));
  assert.ok(!G.last('welcome'));
  assert.equal(Object.keys(gs.store.players).length, 0);
  // neues Profil nach dem Reset: normal registrieren
  G.msg({ t: 'hello', id: 'aaaa-9', name: 'Alpha', save: { coins: 0, createdAt: gs.store.data.resetAt + 5 } });
  assert.ok(G.last('welcome'));
  assert.equal(Object.keys(gs.store.players).length, 1);
  gs.saveNow();
  assert.ok(JSON.parse(fs.readFileSync(path.join(dir, 'showdownbay.json'), 'utf8')).resetAt > 0);
  await wait(250);
  fs.rmSync(dir, { recursive: true, force: true });
}
