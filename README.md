# SNOWDOWN

Ein Battle-Royale im Low-Poly-Stil, das direkt im Browser läuft.

**Spielen:** https://snowdown.onrender.com

20 Spieler landen auf der Frostfeste, einer verschneiten Insel mit Festung, Bergen, gefrorenem See, Dorf und Hafen. Man öffnet Truhen, sammelt Waffen und Schilde, und wer am Ende noch steht, gewinnt. Gespielt wird allein (Solo) oder zu zweit (Duo). Freie Plätze werden mit Bots aufgefüllt.

Dazu gibt es 1v1 und 2v2 in der Holzarena. Den Modus wählt man in der Lobby auf der Modus-Karte (SOLO, DUO, 1V1, 2V2).

## Die Karte

Die Berge im Norden sind begehbar. Hinter der Feste beginnt der Gipfelweg, der in Kehren auf die Hornspitze führt (52 m). Unterwegs liegt die Bergstation, oben stehen eine Steinhütte und ein Aussichtsturm mit Truhen. Man kann auch auf dem Berg landen, und der Sturm kann dort enden.

## Als App installieren

In der Lobby oben rechts auf **App** klicken. Unter Chrome und Edge erscheint direkt der Installations-Dialog, auf dem iPhone geht es über Safari mit „Teilen“ und dann „Zum Home-Bildschirm“. Die App startet im Vollbild, und Solo gegen Bots funktioniert nach dem ersten Start auch offline.

## Steuerung

| Taste | Aktion |
|---|---|
| W A S D | Laufen |
| Leertaste | Springen |
| Strg | Sprinten |
| Shift | Ducken, beim Sprinten Slide |
| Linke Maus | Schießen, Schild oder Medikit benutzen |
| Rechte Maus | Zielen, bei der Sniper Zielfernrohr |
| R | Nachladen |
| F | Truhe öffnen, aufheben. Gedrückt halten: Waffe in der Hand gegen die am Boden tauschen, im Duo Partner wiederbeleben |
| 1 bis 5, Mausrad | Inventarplatz wählen |
| Q | Messer |
| V | Ego- oder Schulterperspektive |
| Tab | Inventar (sortieren und fallen lassen per Maus) |
| M | Karte |
| Esc | Pause |

Alle Tasten lassen sich unter Einstellungen, Steuerung neu belegen.

## Arena (1v1 und 2v2)

- Jedes Team startet in einer eigenen Holzbox. Die ersten 12 Sekunden steht man still und wählt seine Ausrüstung.
- Platz 1 bis 3: je eine Waffe in der höchsten Seltenheit. Platz 4 und 5: Heilung (Mini-Schild, Schildtrank oder Medikit).
- Die letzte Wahl wird gespeichert und beim nächsten Mal gleich wieder benutzt.
- Fehlende Spieler werden mit Bots aufgefüllt. Es gibt keine Truhen, dafür Holzwände, Kisten und zwei Plattformen als Deckung.
- Ein kleiner Sturm in 3 Phasen sorgt dafür, dass die Runde nicht ewig dauert. Arena-Runden zählen nicht für den Rang.

## Spielregeln

- 100 Leben und 100 Schild. Zum Start gibt es 50 Überschild, der nicht wieder aufgeladen wird.
- Jede Eliminierung gibt 50 zurück, zuerst aufs Leben, der Rest als Schild.
- Der Sturm zieht sich in 5 Phasen zusammen (in der Arena 3) und trifft nur das Leben.
- Im Duo wird man bei 0 Leben erst niedergeschlagen und kann vom Partner wiederbelebt werden.
- Pro Kill gibt es 50 Coins, für einen Sieg 250. Im Shop gibt es Skins und Messer.
- Ranked-Stufen von Bronze bis Unreal.

### Waffen

| Waffe | Magazin | Schaden (grau bis gold) |
|---|---|---|
| Pistole | 20 | 24 bis 28 |
| Sturmgewehr (SCAR) | 30 | 30 bis 36 |
| Trommelgewehr | 40 | 19 bis 23 |
| Taktische Schrotflinte | 8 | 70 bis 85 |
| Pump-Schrotflinte | 5 | 110 bis 138 |
| Hammer-Pump | 6 | 92 bis 114 |
| Schweres Scharfschützengewehr | 1 | 150 bis 157, Kopf mal 2,5 |
| Messer | – | 40, Kopf 60 |

Kugeln fliegen genau aufs Fadenkreuz, nur Schrotflinten streuen. Mit der Sniper zählt im Zielfernrohr der Treffer, den man auf dem Bildschirm sieht. Ohne Zielfernrohr streut sie.

### Heilung

| Gegenstand | Wirkung |
|---|---|
| Mini-Schild | +25 Schild, bis 50 |
| Schildtrank | +50 Schild, bis 100 |
| Medikit | Leben auf 100 |

Alles wirkt sofort.

## Server für Mehrspieler

Das Spiel läuft auf [Render](https://render.com) unter https://snowdown.onrender.com. Der Server liefert die Webseite aus und verbindet alle Spieler miteinander.

**Eigenen Render-Server einrichten (kostenlos):**

1. Auf render.com mit dem GitHub-Konto anmelden.
2. Unter „New“, „Blueprint“ dieses Repository wählen und bestätigen. Die Datei `render.yaml` ist schon eingerichtet (Name `snowdown`, Region Frankfurt).

Der kostenlose Tarif hat keinen festen Speicher. Nach einem Neustart sind Konten und Freundeslisten auf dem Server weg, Coins und Skins bleiben im Browser erhalten. Der Workflow „Server wach halten“ sorgt dafür, dass der Server nicht einschläft.

**Eigener PC:**

```bash
npm install
npm start          # nur lokal und im WLAN
npm run online     # zusätzlich ein Link für Freunde über das Internet
```

Danach http://localhost:4242 öffnen. Unter Windows reicht ein Doppelklick auf `Starten.bat`.

**Docker:**

```bash
docker build -t snowdown .
docker run -d -p 4242:4242 -v snowdown-data:/app/server/data snowdown
```

## Admin-Panel

Mit der Taste 0 öffnen (nur mit Admin-Zugang). Es gibt die Bereiche Kampf, Bewegung, Server und Zugänge. Unter Server lassen sich Spieler rauswerfen, Coins verschenken, Lobby-Nachrichten senden und alle Spielstände zurücksetzen.

## Entwicklung

- Client: Three.js und JavaScript ohne Build-Schritt
- Server: Node.js mit WebSocket (`ws`), Port 4242, berechnet Treffer, Schaden und Beute selbst
- Modelle, Texturen, Sounds und Musik werden im Code erzeugt

```bash
npm test               # Tests
npm run build:pages    # statische Version nach docs/ bauen
```

```
server/    Spielserver, Konten, Freunde, Party, Warteschlange
shared/    Simulation, Karte, Waffen, Bots (läuft auf Server und im Browser)
client/    Browser-Spiel (Darstellung, Steuerung, Oberfläche)
tests/     automatische Tests
docs/      statische Version der Webseite
```

## Lizenzen

- Code: MIT
- [three.js](https://threejs.org) und [ws](https://github.com/websockets/ws): MIT
- Schrift Barlow Condensed: SIL Open Font License
- `client/sounds/scar-shot.mp3` wurde vom Projektinhaber bereitgestellt
