// Integrationstest des Lobby-/Match-Servers mit simulierten WebSocket-Clients (ohne Netzwerk).
import assert from 'assert';
import os from 'os';
import path from 'path';
import fs from 'fs';

export async function runServerTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'savanna-test-'));
  process.env.SAVANNA_DATA_DIR = dir;
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
  A.msg({ t: 'queue', opts: { storm: true, botDifficulty: 'hard' } });
  assert.equal(A.last('queue').state, 'waiting');
  assert.equal(A.last('queue').humans, 2);
  // nach max. 10 s startet das Match mit 2 Menschen + 10 Bots
  const t0 = Date.now();
  while (!A.last('matchStart') && Date.now() - t0 < 12000) await wait(100);
  const ms = A.last('matchStart');
  assert.ok(ms, 'Match nicht gestartet');
  assert.equal(ms.players.length, 12);
  assert.equal(ms.players.filter((p) => !p.isBot).length, 2);
  assert.ok(B.last('matchStart'));
  const match = gs.matches.get(ms.matchId);
  A.msg({ t: 'loaded', mid: ms.matchId });
  B.msg({ t: 'loaded', mid: ms.matchId });
  await wait(600);
  assert.ok(A.all('snap').length > 3, 'keine Snapshots');
  // Status im Spiel
  assert.equal(gs.status('aaaa-1'), 'game');
  // B verlässt das Match -> Figur scheidet aus, Match läuft weiter
  B.msg({ t: 'leaveMatch' });
  await wait(100);
  const kill = A.all('ev').flatMap((m) => m.e).find((e) => e.t === 'kill' && e.v === 'bbbb-2');
  assert.ok(kill, 'kein Kill-Event für Verlassen');
  assert.equal(kill.w, 'leave');
  // Match beenden: alle Bots eliminieren
  while (match.sim.phase === 'countdown') await wait(50);
  const sim = match.sim;
  for (const p of sim.players) if (p.isBot && p.alive) sim.applyDamage(p, 999, 'aaaa-1', 'b', null);
  const t1 = Date.now();
  while (!A.last('matchEnd') && Date.now() - t1 < 4000) await wait(100);
  const end = A.last('matchEnd');
  assert.ok(end, 'kein matchEnd');
  assert.equal(end.winner, 'aaaa-1');
  assert.equal(end.results.length, 12);
  assert.equal(end.results.find((r) => r.id === 'aaaa-1').placement, 1);
  assert.equal(gs.status('aaaa-1'), 'lobby');
  // Persistenz
  gs.saveNow();
  const db = JSON.parse(fs.readFileSync(path.join(dir, 'db.json'), 'utf8'));
  assert.equal(Object.keys(db.players).length, 2);
  assert.equal(db.players['aaaa-1'].friends[0], 'bbbb-2');
  assert.equal(Object.keys(db.parties).length, 1);
  fs.rmSync(dir, { recursive: true, force: true });
}
