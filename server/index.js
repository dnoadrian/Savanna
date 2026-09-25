// SAVANNA ROYALE – Server: liefert das Spiel aus (Port 4242) und betreibt Lobby, Freunde,
// Party, Matchmaking und server-autoritative Matches über WebSocket.
import http from 'http';
import os from 'os';
import { spawn } from 'child_process';
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
wss.on('error', () => {}); // Fehler des HTTP-Servers werden unten behandelt

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) out.push(a.address);
    }
  }
  return out;
}

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log('');
    console.log(`  Das Spiel läuft bereits (Port ${port} ist belegt) – ist noch ein anderes Fenster offen?`);
    console.log(`  Einfach im Browser öffnen: http://localhost:${port}`);
    console.log('');
    if (process.argv.includes('--open')) openBrowser(`http://localhost:${port}`);
    setTimeout(() => process.exit(1), 500);
    return;
  }
  throw e;
});

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
    console.log('  Starte Online-Tunnel … (der Link für Freunde erscheint gleich hier)');
    game.tunnel.start();
  }
  if (process.argv.includes('--open')) openBrowser(`http://localhost:${port}`);
});

// Standardbrowser öffnen (für den Doppelklick-Start)
function openBrowser(url) {
  let cmd;
  let args;
  if (process.platform === 'win32') {
    cmd = 'rundll32';
    args = ['url.dll,FileProtocolHandler', url];
  } else if (process.platform === 'darwin') {
    cmd = 'open';
    args = [url];
  } else {
    cmd = 'xdg-open';
    args = [url];
  }
  try {
    const p = spawn(cmd, args, { stdio: 'ignore', detached: true });
    p.on('error', () => {});
    p.unref();
  } catch {
    /* kein Browser verfügbar */
  }
}

function shutdown() {
  game.saveNow();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
