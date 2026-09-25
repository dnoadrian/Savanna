# SAVANNA ROYALE 👑🌵

## ▶️ [JETZT SPIELEN – hier klicken](https://dnoadrian.github.io/Savanna/docs/)

> Direkt im Browser, ohne Installation: **https://dnoadrian.github.io/Savanna/docs/**

Ein bunter Low-Poly-Battle-Royale-Egoshooter für den Browser. Bis zu **12 Spieler** kämpfen auf einer kleinen Savanneninsel rund um die **Old Ranch**. Wer als Letzter übrig bleibt, gewinnt die **Victory Royale** und trägt in der nächsten Runde die goldene Krone.

- **Client:** Three.js (lokal über npm, kein CDN), reines JavaScript mit ES-Modulen, Web Audio API
- **Server:** Node.js + `ws` auf Port **4242**. Er liefert das Spiel aus und stellt Benutzernamen, Lobby, Freunde, Party, Matchmaking und server-autoritative Matches bereit.
- **Keine externen Assets:** Alle Modelle, Texturen, Sounds und Musik werden prozedural im Code erzeugt. Die Schriften *Luckiest Guy* und *Lilita One* (SIL OFL) sind lokal über `@fontsource` eingebunden. Das Spiel läuft komplett offline.

---

## 🌐 Sofort im Browser spielen (ohne Installation)

**👉 https://dnoadrian.github.io/Savanna/**

Seite öffnen, Namen wählen, **SPIELEN**. Die Webseite läuft komplett im Browser: **Offline gegen 11 Bots** funktioniert sofort.

Für **Online mit Freunden** braucht es einen laufenden Spielserver, denn GitHub Pages liefert nur Dateien aus. Dafür gibt es zwei Wege:
1. **Einer hostet:** `npm install` und `npm run online` (siehe unten). Das Hosting-Panel zeigt dann einen *„Link über die Webseite“* wie
   `https://dnoadrian.github.io/Savanna/?server=https://xyz.trycloudflare.com`. Wer diesen Link öffnet, spielt über die Webseite auf dem Server des Hosts. Auf der Webseite kann man den Server auch über **≡ → „Server / Online spielen“** eintragen.
2. **Dauerhaft online (optional):** den Server kostenlos bei Render starten:
   [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/dnoadrian/Savanna)
   Das nutzt `render.yaml` und braucht ein kostenloses Render-Konto. Danach ist die Render-Adresse eine komplette Spiel-Webseite mit Freunden, Party und Mehrspieler. Hinweise: Der Gratis-Server schläft nach 15 Minuten ohne Besucher ein (erster Aufruf dauert dann ca. 1 Minute) und vergisst gespeicherte Freundeslisten bei Neustarts. Soll die GitHub-Seite automatisch mit diesem Server verbinden, trägt man die Adresse in `package.json` unter `"savanna": { "server": "https://…onrender.com" }` ein und führt `npm run build:pages` aus.

**Veröffentlichung auf GitHub Pages:** Die fertige Webseite liegt im Ordner `docs/` (erzeugt mit `npm run build:pages`). Im Repository unter *Settings → Pages* funktionieren alle Varianten:
- *Deploy from a branch* → Branch `claude/savanna-royale-game-tuxwbn` → Ordner **`/docs`** (oder `/ (root)`, dort leitet `index.html` auf `docs/` weiter)
- *GitHub Actions*: Der Workflow `.github/workflows/pages.yml` baut und veröffentlicht bei jedem Push automatisch.

Nach Änderungen am Client `npm run build:pages` ausführen und `docs/` mit committen. `npm test` prüft, ob `docs/` aktuell ist.

---

## 🚀 Schnellstart (eigener Server mit allen Funktionen)

**Windows, ganz einfach:** Projekt als ZIP herunterladen und entpacken, dann **`Starten.bat` doppelklicken**. Beim ersten Start richtet sie alles ein (`npm install`). Danach startet sie den Server mit Online-Link für Freunde und öffnet das Spiel im Browser. Das schwarze Fenster offen lassen, solange gespielt wird. Voraussetzung ist Node.js von [nodejs.org](https://nodejs.org), die Datei weist darauf hin, falls es fehlt.

Oder per Befehl:

Voraussetzung: [Node.js](https://nodejs.org) ab Version 18 (empfohlen 20 oder 22).

```bash
npm install
npm start
```

Dann im Browser öffnen: **http://localhost:4242**

1. Beim ersten Start wählst du deinen **Benutzernamen** (🎲 gibt einen Zufallsnamen) und optional dein Outfit.
2. In der **Lobby** wählst du rechts unten den Modus:
   - **Offline**: im Browser, immer mit Bots, du + 11 Bots
   - **Online**: mit Freunden über den Server. Beim Start fragt das Spiel **„Mit Bots“** (freie Plätze bis 12 mit Bots auffüllen) oder **„Ohne Bots“** (nur echte Spieler, mindestens 2)
3. **SPIELEN** drücken, ins Bild klicken (Pointer Lock) und am besten den **Vollbild**-Knopf nutzen.

> 💡 Spiele im **Vollbild**. Nur dort kann der Browser die Tastatur sperren (`navigator.keyboard.lock()`), damit **STRG+W** beim Sprinten nicht den Tab schließt.

Tests: `npm test` (Spielregeln, Namensregeln, 12 Spieler mit Bots, Online ohne Bots, kein Auto-Nachladen, Determinismus der Insel, komplettes Bot-Match, Server).

---

## 👫 Mit Freunden spielen

### Im selben WLAN / LAN
Beim Start zeigt der Server seine LAN-Adresse an, z. B.:

```
Spiel läuft:   http://localhost:4242
Im WLAN/LAN:   http://192.168.178.23:4242
```

Andere Geräte öffnen die LAN-Adresse. Jedes Gerät ohne gespeicherten Namen sieht zuerst den Erststart-Screen.

**Zwei Tabs im selben Browser:** Ist ein Profil schon in einem anderen Tab aktiv, bekommt ein neuer Tab automatisch ein eigenes Profil (Profil-Slots pro Tab). So kannst du Freunde, Einladungen und Party mit zwei Tabs testen. Der zweite Tab startet mit dem Erststart-Screen.

### 🌍 Online hosten: Freunde aus aller Welt
Du kannst deinen Server direkt über die Webseite weltweit erreichbar machen:

1. Starte den Server auf deinem PC (`npm start`) und öffne **http://localhost:4242**.
2. Lobby → **≡ Menü → „Online hosten“** → **„Online-Zugang starten“**.
3. Nach wenigen Sekunden erscheint ein **Einladungslink** wie `https://irgendwas.trycloudflare.com`. Kopieren und an Freunde schicken.
4. Deine Freunde öffnen den Link im Browser, wählen einen Namen und können sich mit dir befreunden, in deine Party kommen und mitspielen.

Technik dahinter: Ein kostenloser **Cloudflare Quick Tunnel** (kein Konto nötig). Das Programm `cloudflared` wird automatisch gefunden (PATH, `server/bin/`, Umgebungsvariable `CLOUDFLARED_PATH`) oder beim ersten Klick von den offiziellen GitHub-Releases in `server/bin/` heruntergeladen. Der Link ändert sich bei jedem Start. Die Steuerung ist nur am Host-Rechner selbst möglich (Zugriff über `localhost`), Gäste über den Link können den Tunnel nicht beenden. Über HTTPS nutzt das Spiel automatisch `wss://`.

Ohne Browser: `npm run online` startet Server und Tunnel zusammen und gibt den Link in der Konsole aus.

**Alternativen:**
- **Portweiterleitung:** Am Router TCP-Port `4242` an deinen PC weiterleiten. Das Spiel ist dann unter `http://DEINE-ÖFFENTLICHE-IP:4242` erreichbar (die öffentliche IP steht im Hosting-Panel).
- **Eigener Server / VPS mit Docker:**
  ```bash
  docker build -t savanna-royale .
  docker run -d -p 4242:4242 -v savanna-data:/app/server/data savanna-royale
  ```
  Hinter einem Reverse-Proxy mit HTTPS (z. B. Caddy/nginx) funktioniert WebSocket automatisch über `wss://`. Port über `PORT=…` änderbar, Datenordner über `SAVANNA_DATA_DIR=…`.

---

## 🎮 Steuerung (alles in Einstellungen → Steuerung neu belegbar)

| Aktion | Taste |
|---|---|
| Zielen | Maus |
| Schießen (Vollautomatik) | Linksklick |
| Zielen über Kimme und Korn (ADS, leichter Zoom, kein Zielfernrohr) | Rechtsklick |
| Bewegen | W A S D |
| Springen | Leertaste |
| Sprinten (1,5×, Halten oder Umschalten) | STRG |
| Schleichen / Ducken (0,5×, leiser, genauer) | SHIFT |
| **Slide** | SHIFT während des Sprints |
| Nachladen (nur manuell, kein Auto-Nachladen) | R |
| Medkit benutzen | F (oder Slot 2) |
| Sturmgewehr | 1 |
| Scoreboard | TAB (halten) |
| Große Karte | M |
| Ego- / Schulterperspektive | V |
| Pausemenü (Offline pausiert) | ESC |
| Zuschauen: Spieler wechseln | Links-/Rechtsklick oder ← → |

---

## ✨ Features

### Spielmodi Offline und Online
- **Offline**: im Browser, **immer mit Bots**, du + 11 Bots = 12 Spieler. Funktioniert auch auf der Webseite ohne Server.
- **Online**: mit Freunden über den Server. Beim Klick auf SPIELEN fragt das Spiel **„Mit Bots“ oder „Ohne Bots“**:
  - *Mit Bots*: alle Menschen + Bots bis 12, Anzeige z. B. „12 Spieler · 3 Menschen + 9 Bots“.
  - *Ohne Bots*: nur echte Spieler (mindestens 2, höchstens 12). Allein wartet man, bis jemand dazukommt.
- Mehr als 12 Menschen in der Warteschlange: Die ersten 12 spielen, der Rest kommt ins nächste Match. **Parties werden nie getrennt.** Mit und ohne Bots sind getrennte Warteschlangen.
- Matchmaking: bis zu **10 s Wartezeit** auf weitere Menschen (Countdown sichtbar), danach geht es los.
- Spawn verteilt über die Insel (Mindestabstand 16 m), Countdown **3-2-1-LOS!** ohne Bewegung.
- **Sturm-Zone** in 5 schnellen Phasen (Start nach 35 s, eine Runde dauert höchstens ca. 3 Minuten): 1 HP/s, ab Phase 3 dann 2, 5 und 10 HP/s. Lila Sturmwand, lila Bildschirmtönung, Timer, Kreise auf Minimap und Karte, Warnansage 10 s vorher.
- Tod: **Todeskamera** mit Killer-Namen, „Du bist #5 von 12“, dann **Zuschauen** (Killer oder andere Spieler) oder zurück zur Lobby.
- Sieg: animiertes **„VICTORY ROYALE!“**-Banner, Konfetti, Siegesfanfare, Statistik (Kills, Schaden, Kopfschüsse, Überlebenszeit, Platz).
- **Krone**: Der Sieger trägt in der nächsten Runde eine goldene, leuchtende Krone, im Spiel über der Figur, in der Lobby am Charakter und in Killfeed und Scoreboard als Symbol, mit Zähler für Siege in Folge. Gewinnt ein Bot, trägt dieser Bot die Krone in der nächsten Runde.
- Killfeed oben rechts mit Waffen-Icon und Kopfschuss-Symbol, lebende Spieler (z. B. 7/12) und eigene Kills.

### Waffe, Leben, Medkits
- 200 HP (grüne Leiste „+ 200“), kein Schild.
- Sturmgewehr (eigenes kantiges Low-Poly-Modell **ohne Zielfernrohr**, offene Visierung mit Kimme und Korn, Skins Grau/Grün/Blau/Lila/Gold): 30 Schuss, unendlich Reservemunition, **9 Schuss/s**.
- Schaden: **Körper 19, Kopf 26, Arme/Beine 16**, echte Kopf- und Körper-Hitboxen, Abfall ab 50 m linear auf 70 % bei 100 m.
- Nachladen **nur manuell mit R** (auch bei leerem Magazin kein automatisches Nachladen): taktisch 1,9 s, leer 2,4 s, Animation (Magazin raus/rein, Durchladen), Abbruch durch Sprinten. Anzeige: ein **kleiner Kreis ums Fadenkreuz, der sich langsam schließt, ohne Text**. Leeres Magazin: Munitionsanzeige blinkt rot, Abzug klickt.
- Beherrschbarer Rückstoß mit Erholung (für die höhere Feuerrate abgeschwächt), Streuung (Laufen/Springen/Dauerfeuer öffnen das Fadenkreuz, erster Schuss im Stand sitzt genau, Ducken/ADS sehr genau).
- Effekte: Mündungsfeuer mit Licht, Leuchtspur, Patronenhülsen, Einschlagpartikel je Material (Staub, Holzsplitter, Funken bei Metall, Wasserspritzer), max. 100 Einschusslöcher, Kamera-Kick.
- Hitscan mit echter Kollision gegen die Map (kein Schießen durch Wände).
- **Medkits (F):** Start mit 1, +1 pro Kill (max. 5), 1,0 s Benutzung mit demselben kleinen Kreis (grün, ohne Text), Heil-Animation und Sound, +75 HP (max. 200), grüne Partikel und „+75“, bei voller HP „Leben voll“. Schießen bricht ab, man ist verlangsamt.
- Treffer-Feedback: Hitmarker (weiß/gelb bei Kopf, eigener Sound), Kill-Bestätigung mit Totenkopf, rote Richtungsanzeige und Bildschirmrand bei eigenem Schaden, Schadenszahlen (Kopfschuss gelb und größer), Namen und Lebensleiste über getroffenen Gegnern.

### Aim-Assist (Aus / Schwach / Mittel / Stark, Standard Stark) – deutlich spürbar
- Verlangsamung der Mausempfindlichkeit um 35–60 % im Kegel von 5–9°
- Mitziehen: 45–90 % der Gegnerbewegung (auch beim eigenen Strafen)
- **Magnetismus**: beim Schießen oder Zielen zieht das Fadenkreuz mit 5–16 °/s zum Oberkörper, liegt es schon auf dem Körper nur noch schwach (Kopfschüsse bleiben möglich)
- Snap beim Anvisieren (ADS): 3,5–9°
- Nur auf sichtbare Gegner (Sichtlinie), rotes Fadenkreuz über Gegnern

### Bewegung
Beschleunigung und Abbremsen, Kopfwippen (abschaltbar), Landungs-Stauchung, Luftkontrolle, Treppen und Stufen, Hänge (zu steile Felsen lassen einen abrutschen), Waten im flachen Wasser (langsamer), tiefes Wasser treibt zurück. **Slide**: ca. 1 s, Start mit 1,8×, bremst ab, bergab länger, 0,8 s Abklingzeit, Kamera tiefer und geneigt, Staub und Rutsch-Sound, Schießen möglich.

### Map „Savanne“
- **Kleine Insel, ca. 120 m breit** (rund 10× kleiner als früher), komplett von animiertem Low-Poly-Meer umgeben (Wellen, Schaumkante, Sandstrand mit nassem Rand). Am Horizont liegen kleine Deko-Inseln mit Palmen.
- **Ein einziger Ort: Old Ranch** in der Inselmitte: Farmhaus mit Veranda, rote Scheune mit Heuboden, Geräteschuppen, Windrad, Wassertank, Koppel mit Tränke, Traktor, Planwagen, Heuballen-Deckung, Steinmauern, Kisten und Fässer, Sandwege über den Hof bis zum Strand.
- Sanfte Hügel mit kleinen Felskuppen am Rand, goldgelbes Gras (instanziert), rote Erde.
- Deko: Akazien, Baobabs, tote Bäume, Büsche, Termitenhügel, Felsen in allen Größen, Saguaro- und Feigenkakteen, Kisten, Fässer, Tierschädel, Palmen am Strand, hohes Gras, Blumen.
- Große Objekte haben Kollision und bieten Deckung, kleine Deko nicht. Gebäude sind begehbar (Türen, Fenster).
- **Deterministisch per Seed** generiert, identisch auf Server und Client (per Test geprüft).

### Bots (KI)
- Lustige Namen, mit `[BOT]` gekennzeichnet, verschiedene Outfits
- Schwierigkeit Leicht / Normal / Schwer / Profi (Reaktionszeit, Zielgenauigkeit, Kopfschussquote, Strafen)
- Zustandsmaschine: Umherstreifen → Gegner gesehen → Kampf (Deckung suchen, strafen, ducken, springen, sliden, in Deckung nachladen) → Heilen unter 80 HP hinter Deckung → Flucht vor dem Sturm → Verfolgen / Nachsehen bei Schüssen
- A*-Wegfindung auf einem 1-m-Navigationsgitter, Steckenbleib-Erkennung mit Sprung, Umweg und neuem Ziel
- Wahrnehmung: Sichtfeld 120°, Sichtweite 140 m, hören Schüsse im Umkreis von 90 m
- Menschliches Zielen: Reaktionszeit, verzögertes Nachführen, Fehler, der bei längerem Tracking kleiner wird, Rückstoßkompensation. Bots bekämpfen sich auch gegenseitig.

### Grafik
Fortnite-inspirierter Low-Poly-Stil: Flat-Shading mit leichten Farbverläufen, kräftige Farben, hellblauer Himmel mit weichen Wolken, Sonnenlicht mit scharfen, weichgezeichneten Schatten (einstellbar), leichter Nebel. Terrain im 1-m-Raster mit feinen Farbvariationen und Kontaktschatten an Wänden, Felsen und Stämmen, dichtes Gras mit Farbverlauf und Windböen. Figuren mit 8 Outfits (Cowboy, Safari-Ranger, Ninja, Soldat, Tänzer, Pirat, Koch, Astronaut) und Animationen für Idle, Laufen, Sprinten, Schleichen, Sliden, Schießen, Nachladen, Heilen und Tod (ragdoll-artiges Umkippen). Egoperspektive mit sichtbaren Armen oder Schulterperspektive (V).

**Performance:** kleine Insel (Insel, Kollision und Navigation werden in unter 0,1 s erzeugt), zusammengeführte Geometrie pro Chunk mit 2 LOD-Stufen, Frustum Culling pro Chunk, instanziertes Gras (gecachte Kacheln), instanzierte Partikel/Hülsen/Einschusslöcher/Leuchtspuren, enger Schattenbereich um den Spieler, dynamische Qualität „Auto“ (wirkt auch auf Sichtweite und Schatten im Match).

### HUD
Rotierende Minimap mit Ortsnamen, Sturmkreisen und Position (darunter FPS und Ping), HP-Leiste unten links, Hotbar (Sturmgewehr mit Munition, Medkits mit Anzahl), anpassbares Fadenkreuz, Zähler und Sturm-Timer oben rechts, Killfeed, Meldungen, kleiner Nachlade- und Heil-Kreis ohne Text, Scoreboard (TAB), große Karte (M) mit Dächern, Bäumen und Felsen. Schriften: *Luckiest Guy* und *Lilita One* (lokal).

### Sound (alles prozedural, Web Audio)
3D-positionierte Schüsse (HRTF, Hall, entfernt leiser und dumpfer mit Schallverzögerung), Nachladen (Klick, Klack, Ratsch), leeres Magazin, Hitmarker, Kopfschuss-„Ding“, Kill-Glocke, Eliminierung, Treffer mit Stöhnen, Heilen mit Jingle, Schritte je Untergrund (Gras, Sand, Holz, Stein, Metall, Wasser; Schleichen fast lautlos), Atmen nach langem Sprint, Slide, Sprung und Landung, Countdown-Piepen, Siegesfanfare, Niederlage, Lobby-Musik (abschaltbar), UI-Sounds (Hover, Klick, Tippen, Freundschaftsanfrage, Einladung). **Kein Hintergrundrauschen**: kein Wind, kein Meeresrauschen, keine Sturmgeräusche. Eigene Lautstärkeregler für Gesamt, Effekte, Musik und UI.

### Erststart, Lobby, Freunde, Party
- **Erststart-Screen** mit animiertem Sonnenuntergang und Kamerafahrt, Logo, Namensfeld mit Live-Prüfung (✓/✗, Fehlertext), Würfel, gelber WEITER-Button (auch Enter). Vergebene Namen zeigen 3 freie Vorschläge. Danach optional Outfit- und Farbauswahl mit 3D-Vorschau.
- Namensregeln: 3–16 Zeichen, Buchstaben (inkl. Umlaute), Zahlen, `_` und `-`, keine Leerzeichen, Filter für Beleidigungen, kein „Bot“, **serverweit eindeutig** (Groß-/Kleinschreibung egal). Offline wird lokal geprüft und beim Verbinden nachgeprüft.
- **Lobby** im Fortnite-Stil: 3D-Figur auf runder Plattform vor Savannen-Sonnenuntergang, Party-Mitglieder daneben (bis 4) mit Namen und Bereit-Status, Name (klickbar zum Ändern), Level/XP, Siege, Kronen, Kills, Spind (Outfit, Farbe, Waffen-Skin, Kronen-Stil), ≡-Menü (Freunde, Einstellungen, Statistiken, Online hosten, Credits, Spiel verlassen), Modus-Auswahl, SPIELEN-Button, Party-Chat.
- **Freunde-Panel** (Slide-in): Freunde mit Status (online/Lobby = grün, im Spiel = gelb, offline = grau), Anfragen (Annehmen/Ablehnen/Zurückziehen), Hinzufügen per Name. Pro Freund: In Party einladen, Party beitreten, Entfernen, Blockieren.
- **Einladungen** als Pop-up mit Sound und 60-s-Ablauf. **Party** bis 4 Spieler: Leader (Stern) kann entfernen, Leitung übergeben und starten, jeder kann „Bereit“ klicken und verlassen.
- Freundeslisten, Konten und Party-Status werden in `server/data/db.json` gespeichert und überstehen Neustarts.
- Ergebnisbildschirm mit Statistik, XP und Level-Up.

### Einstellungen (sofort wirksam, im localStorage gespeichert)
- **Konto:** Name ändern, Spieler-ID, Sprache (Deutsch/Englisch), Konto zurücksetzen (mit Sicherheitsabfrage)
- **Grafik:** Preset (Niedrig/Mittel/Hoch/Episch/Auto), Render-Auflösung 50–100 %, Schatten, Sichtweite, Grasdichte, Anti-Aliasing, Nachbearbeitung (Bloom, Farbkorrektur), FPS-Limit (30–240/Unbegrenzt), V-Sync, FOV 70–110, Vollbild
- **Anzeige/HUD:** FPS, Ping, Schadenszahlen, Minimap, HUD-Größe, Fadenkreuz-Editor (Farbe, Form, Größe, Punkt), Kopfwippen, Farbenblind-Modus
- **Steuerung:** jede Aktion neu belegbar (inkl. Maustasten), Warnung bei Doppelbelegung, Standard wiederherstellen
- **Maus:** Empfindlichkeit X/Y, ADS-Empfindlichkeit, Y invertieren, Sprinten/Ducken Halten oder Umschalten, Aim-Assist
- **Audio:** Gesamt, Effekte, Musik, UI, Lobby-Musik
- Einen Tab „Spiel“ gibt es nicht mehr: Sturm ist immer an, Bots spielen auf „Normal“, Reservemunition ist unendlich, man startet in der Egoperspektive (V wechselt im Spiel).

### Lokaler Mehrspieler (Netzwerk)
- Server-autoritativ für Schaden, Kills, Zone, Heilen und Bots (gemeinsames Simulationsmodul)
- Clients senden Position und Eingaben mit 30 Hz, Server schickt Snapshots mit 20 Hz
- Interpolation anderer Spieler mit 100 ms Puffer, **Lag-Kompensation** (serverseitiges Zurückspulen der Hitboxen, max. 300 ms)
- Wer das Match verlässt, scheidet aus. Das Match läuft weiter, ohne Nachfüllen. Verlassen alle Menschen das Match, simuliert der Server die Runde zu Ende (für den Kronen-Sieger).
- Ping im HUD und im Scoreboard

---

## 🗂️ Projektstruktur

```
├── server/
│   ├── index.js          HTTP + WebSocket auf Port 4242, LAN-Adressen, --online
│   ├── static.js         Auslieferung von Client, Shared-Modulen, Three.js und Schriften
│   ├── game-server.js    Konten/Namen, Freunde, Party, Einladungen, Matchmaking, Hosting
│   ├── match.js          server-autoritatives Match (30 Hz Simulation, 20 Hz Snapshots)
│   ├── store.js          JSON-Persistenz (server/data/db.json)
│   └── tunnel.js         Online-Hosting per Cloudflare Quick Tunnel
├── shared/               läuft auf Server UND im Browser
│   ├── constants.js      alle Spielwerte (12 Spieler, 200 HP, Schaden, Sturm …)
│   ├── names.js          Namensregeln, Filter, Zufallsnamen, Bot-Namen
│   ├── rng.js, noise.js  deterministischer Zufall + Simplex-Rauschen
│   ├── map/              Insel-Generator, Terrain, Old Ranch, Baukasten, Deko-Typen
│   ├── physics/          Kollisionswelt (Boxen, Zylinder, Raycasts)
│   └── sim/              Simulation, Bewegung, Waffe, Treffer, Sturm, A*-Navigation, Bot-KI
├── client/
│   ├── index.html, style.css, favicon.svg
│   └── src/
│       ├── main.js       App-Zustände (Erststart → Lobby → Laden → Match → Ergebnis)
│       ├── settings.js, profile.js, i18n.js
│       ├── game/         Match, Spielersteuerung, Eingabe, Aim-Assist
│       ├── render/       Renderer, Terrain, Wasser, Himmel, Welt/LOD, Gras, Figuren,
│       │                 Waffe, Egoperspektive, Effekte, Sturmwand, Lobby-Szene, Karte
│       ├── ui/           HUD, Erststart, Lobby, Einstellungen, Freunde, Hosting, Dialoge
│       ├── audio/        prozedurale Sound- und Musik-Engine
│       └── net/          WebSocket-Client, Offline- und Netzwerk-Session
├── tests/                npm test (Regeln, Determinismus, Bot-Match, Server, Webseite aktuell)
├── scripts/build-pages.js baut die statische Webseiten-Version nach docs/
├── docs/                 fertige Webseite für GitHub Pages (Offline im Browser, optional Server)
├── index.html            Weiterleitung auf docs/ (falls Pages aus dem Hauptverzeichnis liefert)
├── .github/workflows/    automatische Veröffentlichung auf GitHub Pages
├── render.yaml           optional: kompletter Server bei Render
├── Dockerfile            eigener Server / VPS
└── package.json
```

---

## 🧠 Entscheidungen und Annahmen

- **Bot-KI im Shared-Ordner:** Die Spezifikation nennt `client/src/bots`. Weil dieselbe KI im Offline-Modus im Browser und im Mehrspieler auf dem Server laufen muss, liegt sie in `shared/sim/bots.js`.
- **Feste Insel:** Die Insel nutzt immer denselben Seed, damit man die Karte lernen kann. Pro Match zufällig sind Spawns, Sturmkreise und Bots.
- **Bewegung im Mehrspieler:** Die Clients berechnen ihre Bewegung selbst (flüssig, ohne Eingabeverzögerung) und senden die Position. Der Server ist autoritativ für Treffer, Schaden, Kills, Heilen, Munition (tolerant) und Zone.
- **Online mit oder ohne Bots:** Die Frage stellt das Spiel dem Leader beim Start. Ohne Bots braucht es mindestens 2 Menschen, damit eine Runde Sinn ergibt.
- **Kleine Karte:** Mit 12 Spielern auf rund 120 m Insel geht es sofort zur Sache. Deshalb schrumpft auch der Sturm schneller (Start nach 35 s).
- **„Bot“ im Namen:** Namen, die „bot“ in beliebiger Schreibweise enthalten, werden abgelehnt (auch „Robotnik“), damit man nie mit Bots verwechselt wird.
- **Krone im Offline-Modus:** Verlässt man ein Offline-Match vorzeitig, wird die Runde im Hintergrund zu Ende simuliert, damit der Kronen-Sieger feststeht.
- **Kronen-Zähler in der Lobby:** „Siege“ zählt alle Siege, „Kronen“ zählt Siege, die man mit der Krone auf dem Kopf geholt hat (Titel verteidigt). Dazu kommt der Zähler der Siege in Folge.
- **Online starten:** Der Leader kann starten, sobald alle anderen Mitglieder „Bereit“ sind.
- **V-Sync / FPS-Limit:** Browser zeigen Bilder immer im Takt des Monitors an. Mit V-Sync aus läuft die Spielschleife ohne `requestAnimationFrame`, das FPS-Limit begrenzt sie. „Auto“-Qualität passt die Stufe an die gemessenen FPS an.
- **Tastatursperre:** `navigator.keyboard.lock()` funktioniert nur im Vollbild und in sicheren Kontexten (`localhost` oder `https`, also auch über den Online-Link).
- **Farbenblind-Modus:** passt die HUD-Farben an (Leben, Gegnermarkierung, Schaden, Kopfschuss).
- **Keine Original-Assets:** Alles ist selbst modelliert. Namen, Logos und Grafiken bekannter Spiele werden nicht verwendet, der Stil ist nur „inspiriert von“.

---

## 📜 Lizenzen / Credits

- Code: MIT
- [three.js](https://threejs.org) (MIT), [ws](https://github.com/websockets/ws) (MIT)
- Schriften: *Luckiest Guy* (Astigmatic) und *Lilita One* (Juan Montoreano), SIL Open Font License, über [@fontsource](https://fontsource.org)
- Online-Hosting: [cloudflared](https://github.com/cloudflare/cloudflared) (Apache 2.0), wird bei Bedarf heruntergeladen
- Alle Modelle, Texturen, Sounds und Musik: prozedural im Code erzeugt
