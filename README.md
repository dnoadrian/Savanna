# SHOWDOWN BAY 🌊🤠

## ▶️ [JETZT SPIELEN – hier klicken](https://dnoadrian.github.io/Savanna/docs/)

> Direkt im Browser, ohne Installation: **https://dnoadrian.github.io/Savanna/docs/**

Ein Low-Poly-Battle-Royale für den Browser. **12 Spieler** landen in einer Hafenbucht mitten in einem roten Canyon: türkises Wasser, Holzstege, ein Saloon auf Stelzen, ein rot-weißer Leuchtturm, ein blaues Blechdachhaus mit rauchendem Kamin, Wachtürme, Felsnadeln und Palmen. Truhen öffnen, Waffen sammeln, Schilde trinken – wer als Letzter steht, gewinnt.

- **Client:** Three.js (lokal über npm, kein CDN), reines JavaScript mit ES-Modulen, Web Audio API
- **Server:** Node.js + `ws` auf Port **4242** (Spiel ausliefern, Namen, Lobby, Freunde, Party, Warteschlange, server-autoritative Matches)
- **Keine fremden Assets:** Alle Modelle, Texturen, Sounds und Musik entstehen im Code. Die Schrift *Barlow Condensed* (SIL OFL) ist lokal über `@fontsource` eingebunden.

---

## 🎮 So spielt man

1. Namen wählen (🎲 = Zufallsname), optional Outfit.
2. In der Lobby **BEREIT** drücken. Die Warteschlange wartet auf echte Spieler – **Standard 15 Sekunden**, einstellbar in *Einstellungen → Konto → Warteschlange* von **10 bis 120 Sekunden**. Die Zeit läuft immer voll ab, auch wenn jemand dazukommt. Danach startet das Match, freie Plätze füllen Bots (immer 12 Spieler).
3. Ins Bild klicken (Mausfang), am besten **Vollbild** nutzen.

| Taste | Aktion |
|---|---|
| **W A S D** | Laufen |
| **Leertaste** | Springen |
| **STRG** | Sprinten |
| **SHIFT** | Ducken / beim Sprinten: Slide |
| **Linke Maus** | Schießen / Schild oder Medikit benutzen |
| **Rechte Maus** | Zielen (Kimme und Korn, Scharfschützengewehr: Zielfernrohr) |
| **R** | Nachladen (nur manuell) |
| **F** | Truhe öffnen / Gegenstand aufheben |
| **1 – 5**, Mausrad | Inventarplatz wählen |
| **V** | Ego- / Schulterperspektive |
| **M** | Große Karte · **TAB** Scoreboard · **ESC** Pause |

Alle Tasten lassen sich in *Einstellungen → Steuerung* neu belegen.

> 💡 Im **Vollbild** kann der Browser die Tastatur sperren, damit **STRG+W** beim Sprinten nicht den Tab schließt.

---

## ⚔️ Regeln

**Leben & Schild**
- **100 Leben** (grün) + **100 Schild** (blau)
- Start: 100 Leben + **50 Überschild**. Ist der Überschild weg, ist er für immer weg.
- Schaden trifft zuerst den Überschild, dann den Schild, dann das Leben. Der Sturm trifft nur das Leben.
- **Siphon:** Jede Eliminierung gibt **+50** – zuerst Leben, der Rest wird Schild.

**Heil- und Schild-Gegenstände**

| Gegenstand | Wirkung | Dauer | Stapel |
|---|---|---|---|
| Mini-Schild | +25 Schild (nur bis 50) | 2 s | 6 |
| Schildtrank | +50 Schild (bis 100) | 5 s | 3 |
| Medikit | Leben auf 100 | 10 s | 3 |

**Waffen** (Werte orientieren sich an den bekannten Originalen)

| Waffe | Munition | Magazin | Schuss/s | Schaden (grau → gold) |
|---|---|---|---|---|
| Pistole | leicht | 20 | 6,75 | 24–28 |
| Sturmgewehr (SCAR) | mittel | 30 | **5,5** | 30 / 31 / 33 / 35 / 36 |
| Trommelgewehr | leicht | 40 | 10 | 19–23 |
| Taktische Schrotflinte (rot) | Schrot | 8 | 1,5 | 67–82 |
| Pump-Schrotflinte | Schrot | 5 | 0,7 | 85–105 |
| Schweres Scharfschützengewehr | schwer | 1 | 0,33 | 150 / 157, Kopf ×2,5 |

- Seltenheiten: **Grau, Grün, Blau, Lila, Gold** (Farbe am Modell, Lichtsäule und Inventar)
- Schrotflinten verschießen 10 Kugeln, der Schaden fällt mit der Entfernung ab.
- **Keine unendliche Munition:** Start mit grauer Pistole **20/40**. Munition gibt es aus Truhen, am Boden und von Eliminierten.

**Truhen** – goldenes Leuchten und leises Summen. Mit **F** öffnen: **1 Waffe + 1 Heil-/Schild-Gegenstand + passende Munition**.

**Inventar** – 5 Plätze (1–5). Ist alles voll, tauscht **F** den Gegenstand in der Hand.

**Sturm** – 5 Phasen, der letzte Kreis schließt sich nach etwa 4 Minuten.

**Bots** – looten zuerst, öffnen Truhen, wählen die passende Waffe für die Entfernung, trinken Schilde und fliehen vor dem Sturm. Die Lobby ist gemischt (leicht, normal, wenige starke).

---

## ⚙️ Einstellungen

- **Grafik wie in Fortnite:** Rendermodus *Qualität* oder *Leistung*, Stufen *Niedrig / Mittel / Hoch / Episch / Auto*. **Alle Stufen rendern mit 100 % 3D-Auflösung.**
- **Aim-Assist: An / Aus.** „An“ bremst das Fadenkreuz am Gegner leicht ab und zieht ein wenig mit, wenn du dich bewegst oder zielst – es ist bewusst kein Aimbot.
- **Wartezeit auf echte Spieler:** 10–120 s (Standard 15 s)
- Maus-, ADS- und Zielfernrohr-Empfindlichkeit, FOV, FPS-Limit, V-Sync, HUD-Größe, Fadenkreuz, Farbenblind-Modus, Lautstärken, Sprache (Deutsch/English)

## 🛠️ Admin-Panel

In der Lobby (oder im Spiel) die Taste **0** drücken. Die Taste steht absichtlich nicht in den Tastenbelegungen.
- Benutzer **adrian**, Passwort **1234**
- Schalter: **Hitboxen** (Kopf/Körper/Beine aller Gegner, auch durch Wände), **Aimbot** (rastet beim Schießen/Zielen auf den Kopf ein), **Fliegen** (Springen = hoch, Ducken = runter)

---

## 🌐 Sofort im Browser spielen (ohne Installation)

**👉 https://dnoadrian.github.io/Savanna/**

Die Webseite läuft komplett im Browser: **BEREIT** → 15 s Warteschlange → Match gegen 11 Bots.

Für **Mehrspieler mit Freunden** braucht es einen laufenden Spielserver (GitHub Pages liefert nur Dateien aus):
1. **Einer hostet:** `npm install` und `npm run online`. Das Hosting-Panel zeigt dann einen *„Link über die Webseite“* wie `https://dnoadrian.github.io/Savanna/?server=https://xyz.trycloudflare.com`. Auf der Webseite kann man den Server auch über **≡ → „Server / Online spielen“** eintragen.
2. **Dauerhaft online (optional):** [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/dnoadrian/Savanna) – nutzt `render.yaml`. Soll die GitHub-Seite automatisch mit diesem Server verbinden, die Adresse in `package.json` unter `"showdown": { "server": "https://…onrender.com" }` eintragen und `npm run build:pages` ausführen.

**Veröffentlichung auf GitHub Pages:** Die fertige Webseite liegt in `docs/` (`npm run build:pages`). Unter *Settings → Pages* entweder *Deploy from a branch* → Ordner **`/docs`** oder *GitHub Actions* (`.github/workflows/pages.yml`). `npm test` prüft, ob `docs/` aktuell ist.

---

## 🚀 Eigener Server (alle Funktionen)

**Windows, ganz einfach:** Projekt als ZIP herunterladen, entpacken und **`Starten.bat` doppelklicken**. Beim ersten Start wird alles eingerichtet, danach öffnet sich das Spiel im Browser und im Fenster erscheint der Online-Link für Freunde. Das Fenster offen lassen, solange ihr spielt. Voraussetzung: [Node.js](https://nodejs.org) (LTS).

Oder per Befehl (Node.js ab Version 18):

```bash
npm install
npm start          # nur lokal / im WLAN
npm run online     # zusätzlich Online-Link für Freunde
```

Dann **http://localhost:4242** öffnen.

### Mit Freunden spielen
- **Im selben WLAN:** Der Server zeigt beim Start seine LAN-Adresse (z. B. `http://192.168.178.23:4242`).
- **Aus aller Welt:** Lobby → **≡ → „Online hosten“** → **„Online-Zugang starten“**. Nach wenigen Sekunden erscheint ein Link wie `https://irgendwas.trycloudflare.com` (kostenloser Cloudflare-Tunnel, kein Konto nötig).
- Freunde hinzufügen, in die Party einladen, alle drücken **BEREIT** – der Party-Leader startet die Warteschlange.
- **Docker / VPS:**
  ```bash
  docker build -t showdown-bay .
  docker run -d -p 4242:4242 -v showdown-data:/app/server/data showdown-bay
  ```
  Port über `PORT=…`, Datenordner über `SHOWDOWN_DATA_DIR=…`.

**Mehrspieler-Technik:** Server-autoritativ für Treffer, Schaden, Beute, Truhen, Inventar, Munition und Sturm. Clients senden 30×/s, der Server schickt 20 Snapshots/s, andere Spieler werden mit 100 ms Puffer interpoliert, Treffer mit Lag-Kompensation (bis 300 ms).

Tests: `npm test` (Leben/Schild/Überschild, Siphon, Waffenwerte inkl. SCAR 5,5/s, keine unendliche Munition, Inventar, Truhen, Heilung, 12 Spieler, Karte mit 3 Orten, komplettes Bot-Match, Server mit 15-s-Warteschlange, Webseite aktuell).

---

## 🗂️ Projektstruktur

```
├── server/               HTTP + WebSocket (Port 4242), Konten, Freunde, Party, Warteschlange, Matches, Tunnel
├── shared/               läuft auf Server UND im Browser
│   ├── constants.js      Spielwerte (12 Spieler, Leben/Schild, Sturm, Warteschlange …)
│   ├── items.js          Waffen, Seltenheiten, Munition, Schilde/Medikits, Beutetabellen
│   ├── map/              Hafenbucht-Generator, 3 Orte, Baukasten, Deko
│   ├── physics/          Kollisionswelt (Boxen, Zylinder, Raycasts)
│   └── sim/              Simulation, Bewegung, Waffen, Inventar, Beute/Truhen, Sturm, Navigation, Bot-KI
├── client/
│   ├── index.html, style.css, favicon.svg
│   └── src/
│       ├── main.js       Anmeldung → Lobby → Warteschlange → Match → Ergebnis
│       ├── game/         Match, Spielersteuerung, Eingabe, Aim-Assist
│       ├── render/       Renderer, Terrain, Wasser, Himmel, Welt, Figuren, Waffenmodelle,
│       │                 Egoperspektive, Beute/Truhen, Effekte, Sturm, Lobby-Szene, Karte
│       ├── ui/           HUD, Anmeldung, Lobby, Einstellungen, Admin-Panel, Freunde, Hosting
│       ├── audio/        prozedurale Sounds und Musik
│       └── net/          WebSocket-Client, Browser- und Netzwerk-Session
├── tests/                npm test
├── scripts/build-pages.js baut die Webseite nach docs/
└── docs/                 fertige Webseite für GitHub Pages
```

---

## 📜 Lizenzen / Credits

- Code: MIT
- [three.js](https://threejs.org) (MIT), [ws](https://github.com/websockets/ws) (MIT)
- Schrift: *Barlow Condensed* (Jeremy Tribby), SIL Open Font License, über [@fontsource](https://fontsource.org)
- Online-Hosting: [cloudflared](https://github.com/cloudflare/cloudflared) (Apache 2.0), wird bei Bedarf heruntergeladen
- Alle Modelle, Texturen, Sounds und Musik: prozedural im Code erzeugt. Waffenwerte sind an bekannte Vorbilder angelehnt; es werden keine fremden Assets, Logos oder Namen verwendet.
