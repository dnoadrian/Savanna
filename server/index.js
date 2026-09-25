// SAVANNA ROYALE – Server: liefert das Spiel aus (Port 4242) und betreibt Lobby, Freunde,
// Party, Matchmaking und server-autoritative Matches über WebSocket.
import http from 'http';
import os from 'os';
import { WebSocketServer } from 'ws';
import { serveStatic } from './static.js';
import { SERVER_PORT } from '../shared/constants.js';
import { GameServer } from './game-server.js';

const port = Number(process.env.PORT) || SERVER_PORT;

const server = http.createServer((req, res) => {
  if (req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  serveStatic(req, res);
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
const game = new GameServer(port);
wss.on('connection', (ws, req) => game.onConnection(ws, req));

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) out.push(a.address);
    }
  }
  return out;
}

server.listen(port, '0.0.0.0', () => {
  console.log('');
  console.log('  ███ SAVANNA ROYALE ███');
  console.log('');
  console.log(`  Spiel läuft:   http://localhost:${port}`);
  for (const ip of lanAddresses()) console.log(`  Im WLAN/LAN:   http://${ip}:${port}`);
  console.log('');
  console.log('  Andere Geräte im selben Netzwerk können über die LAN-Adresse mitspielen.');
  console.log('  Freunde aus aller Welt: in der Lobby ≡ → „Online hosten“ (oder npm run online).');
  console.log('  Beenden mit STRG+C.');
  console.log('');
  if (process.argv.includes('--online') || process.env.SAVANNA_ONLINE === '1') {
    console.log('  Starte Online-Tunnel …');
    game.tunnel.start();
  }
});

function shutdown() {
  game.saveNow();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
