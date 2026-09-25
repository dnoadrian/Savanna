# SAVANNA ROYALE 👑🌵

Ein bunter Low-Poly-Battle-Royale-Egoshooter für den Browser. **12 Spieler** landen auf einer Savanneninsel. Wer als Letzter übrig bleibt, gewinnt die **Victory Royale** und trägt in der nächsten Runde die goldene Krone.

- **Client:** Three.js (lokal über npm, kein CDN), reines JavaScript mit ES-Modulen, Web Audio API
- **Server:** Node.js + `ws` auf Port **4242**. Er liefert das Spiel aus und stellt Benutzernamen, Lobby, Freunde, Party, Matchmaking und server-autoritative Matches bereit.
- **Keine externen Assets:** Alle Modelle, Texturen, Sounds und Musik werden prozedural im Code erzeugt. Die Schriften *Luckiest Guy* und *Lilita One* (SIL OFL) sind lokal über `@fontsource` eingebunden. Das Spiel läuft komplett offline.

---

## 🚀 Schnellstart

Voraussetzung: [Node.js](https://nodejs.org) ab Version 18 (empfohlen 20 oder 22).

```bash
npm install
npm start
```

Dann im Browser öffnen: **http://localhost:4242**

1. Beim ersten Start wählst du deinen **Benutzernamen** (🎲 gibt einen Zufallsnamen) und optional dein Outfit.
2. In der **Lobby** wählst du rechts unten den Modus:
   - **Solo gegen Bots**: offline im Browser, du + 11 Bots
   - **Lokal / Party**: über den Server, freie Plätze werden mit Bots auf 12 aufgefüllt
3. **SPIELEN** drücken, ins Bild klicken (Pointer Lock) und am besten den **Vollbild**-Knopf nutzen.

> 💡 Spiele im **Vollbild**. Nur dort kann der Browser die Tastatur sperren (`navigator.keyboard.lock()`), damit **STRG+W** beim Sprinten nicht den Tab schließt.

Tests: `npm test` (Spielregeln, Namensregeln, 12-Spieler-Garantie, Determinismus der Insel, komplettes Bot-Match).

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
| Zielen über Kimme (ADS, −25 % FOV) | Rechtsklick |
| Bewegen | W A S D |
| Springen | Leertaste |
| Sprinten (1,5×, Halten oder Umschalten) | STRG |
| Schleichen / Ducken (0,5×, leiser, genauer) | SHIFT |
| **Slide** | SHIFT während des Sprints |
| Nachladen | R |
| Medkit benutzen | F (oder Slot 2) |
| Sturmgewehr | 1 |
| Scoreboard | TAB (halten) |
| Große Karte | M |
| Ego- / Schulterperspektive | V |
| Pausemenü (Solo pausiert) | ESC |
| Zuschauen: Spieler wechseln | Links-/Rechtsklick oder ← → |

---

## ✨ Features

### Spielmodus Battle Royale
- **Immer genau 12 Spieler**: Solo = 1 + 11 Bots, Party = alle Menschen + Bots bis 12. Anzeige z. B. „12 Spieler · 3 Menschen + 9 Bots“.
- Mehr als 12 Menschen in der Warteschlange: Die ersten 12 spielen, der Rest kommt ins nächste Match. **Parties werden nie getrennt.**
- Matchmaking: bis zu **10 s Wartezeit** auf weitere Menschen (Countdown sichtbar), danach füllen Bots auf.
- Spawn verteilt über die Insel (Mindestabstand 60 m), Countdown **3-2-1-LOS!** ohne Bewegung.
- **Sturm-Zone** in 5 Phasen (Start nach 60 s): 1 HP/s, ab Phase 3 dann 2, 5 und 10 HP/s. Lila Sturmwand, lila Bildschirmtönung, Timer, Kreise auf Minimap und Karte, Warnansagen. In den Einstellungen abschaltbar.
- Tod: **Todeskamera** mit Killer-Namen, „Du bist #5 von 12“, dann **Zuschauen** (Killer oder andere Spieler) oder zurück zur Lobby.
- Sieg: animiertes **„VICTORY ROYALE!“**-Banner, Konfetti, Siegesfanfare, Statistik (Kills, Schaden, Kopfschüsse, Überlebenszeit, Platz).
- **Krone**: Der Sieger trägt in der nächsten Runde eine goldene, leuchtende Krone, im Spiel über der Figur, in der Lobby am Charakter und in Killfeed und Scoreboard als Symbol, mit Zähler für Siege in Folge. Gewinnt ein Bot, trägt dieser Bot die Krone in der nächsten Runde.
- Killfeed oben rechts mit Waffen-Icon und Kopfschuss-Symbol, lebende Spieler x/12 und eigene Kills.

### Waffe, Leben, Medkits
- 200 HP (grüne Leiste „+ 200“), kein Schild.
- Sturmgewehr (eigenes kantiges Low-Poly-Modell mit Rotpunktvisier, Skins Grau/Grün/Blau/Lila/Gold): 30 Schuss, **∞ oder 180 Reserve** (Einstellung), 5,5 Schuss/s.
- Schaden: **Körper 19, Kopf 26, Arme/Beine 16**, echte Kopf- und Körper-Hitboxen, Abfall ab 50 m linear auf 70 % bei 100 m.
- Nachladen: taktisch 1,9 s, leer 2,4 s, Animation (Magazin raus/rein, Durchladen), automatisches Nachladen, Abbruch durch Sprinten.
- Beherrschbarer Rückstoß mit Erholung, Streuung (Laufen/Springen/Dauerfeuer öffnen das Fadenkreuz, erster Schuss im Stand sitzt genau, Ducken/ADS sehr genau).
- Effekte: Mündungsfeuer mit Licht, Leuchtspur, Patronenhülsen, Einschlagpartikel je Material (Staub, Holzsplitter, Funken bei Metall, Wasserspritzer), max. 100 Einschusslöcher, Kamera-Kick.
- Hitscan mit echter Kollision gegen die Map (kein Schießen durch Wände).
- **Medkits (F):** Start mit 1, +1 pro Kill (max. 5), 1,0 s Benutzung mit Kreisanzeige, Heil-Animation und Sound, +75 HP (max. 200), grüne Partikel und „+75“, bei voller HP „Leben voll“. Schießen bricht ab, man ist verlangsamt.
- Treffer-Feedback: Hitmarker (weiß/gelb bei Kopf, eigener Sound), Kill-Bestätigung mit Totenkopf, rote Richtungsanzeige und Bildschirmrand bei eigenem Schaden, Schadenszahlen (Kopfschuss gelb und größer), Namen und Lebensleiste über getroffenen Gegnern.

### Aim-Assist (Aus / Schwach / Mittel / Stark, Standard Mittel)
- Verlangsamung der Mausempfindlichkeit um 30–50 % im Kegel von ca. 4°
- Mitziehen: 10–25 % der Gegnerbewegung
- Beim ADS nur ein kleiner Snap (max. 1,5–3°)
- Nur auf sichtbare Gegner (Sichtlinie), bevorzugt Oberkörper, rotes Fadenkreuz über Gegnern

### Bewegung
Beschleunigung und Abbremsen, Kopfwippen (abschaltbar), Landungs-Stauchung, Luftkontrolle, Treppen und Stufen, Hänge (zu steile Felsen lassen einen abrutschen), Waten im flachen Wasser (langsamer), tiefes Wasser treibt zurück. **Slide**: ca. 1 s, Start mit 1,8×, bremst ab, bergab länger, 0,8 s Abklingzeit, Kamera tiefer und geneigt, Staub und Rutsch-Sound, Schießen möglich.

### Map „Savanne“
- Insel mit ca. 1000 × 1000 m Spielfläche, komplett von animiertem Low-Poly-Meer umgeben (Wellen, Schaumkante, Sandstrand).
- Sanfte Hügel, goldgelbes Gras (instanziert), rote Erde, Sandwege, Felsplateaus, Canyon, trockenes Flussbett mit Oase, Bahntrasse quer über die Insel.
- **9 POIs** (feste Positionen, Namen auf Minimap und Karte):
  **Dusty Mine** (Förderturm mit drehendem Seilrad, begehbarer Stollen, Loren auf Schienen) · **Cactus Canyon** (Schlucht mit Kakteen und Felsbögen) · **Oasis** (Wasserloch, Palmen, Schilf, Zelte, Brunnen) · **Safari Camp** (Jeeps, Safari-Zelte, Hochsitze mit Treppen, Lagerfeuer) · **Old Ranch** (Farmhaus, Scheune, Windrad, Wassertank, Heuballen, Koppel, Traktor) · **Railway Station** (Bahnhof, verlassener Zug mit begehbarem Güterwagen, Gleise) · **Bone Valley** (riesiges Dino-Skelett, Elefantenschädel, Grabungsstelle) · **Lookout Rock** (Tafelberg mit Rampe und Aussichtsturm, Sniper-Spot) · **Fishing Docks** (Stege, Boote, Fischerhütten, Leuchtturm).
- Deko: Akazien, Baobabs, tote Bäume, Büsche, Termitenhügel, Felsen in allen Größen, Saguaro- und Feigenkakteen, Kisten, Fässer, Wegweiser, Tierschädel, Windräder, Wassertürme, hohes Gras, Blumen.
- Große Objekte haben Kollision und bieten Deckung, kleine Deko nicht. Gebäude sind begehbar (Türen, Fenster).
- **Deterministisch per Seed** generiert, identisch auf Server und Client (per Test geprüft).

### Bots (KI)
- Lustige Namen, mit `[BOT]` gekennzeichnet, verschiedene Outfits
- Schwierigkeit Leicht / Normal / Schwer / Profi (Reaktionszeit, Zielgenauigkeit, Kopfschussquote, Strafen)
- Zustandsmaschine: Umherstreifen → Gegner gesehen → Kampf (Deckung suchen, strafen, ducken, springen, sliden, in Deckung nachladen) → Heilen unter 80 HP hinter Deckung → Flucht vor dem Sturm → Verfolgen / Nachsehen bei Schüssen
- A*-Wegfindung auf einem 2-m-Navigationsgitter, Steckenbleib-Erkennung mit Sprung, Umweg und neuem Ziel
- Wahrnehmung: Sichtfeld 120°, Sichtweite 150 m, hören Schüsse im Umkreis von 100 m
- Menschliches Zielen: Reaktionszeit, verzögertes Nachführen, Fehler, der bei längerem Tracking kleiner wird, Rückstoßkompensation. Bots bekämpfen sich auch gegenseitig.

### Grafik
Fortnite-inspirierter Low-Poly-Stil: Flat-Shading mit leichten Farbverläufen, kräftige Farben, hellblauer Himmel mit weichen Wolken, Sonnenlicht mit Schatten (einstellbar), leichter Nebel. Figuren mit 8 Outfits (Cowboy, Safari-Ranger, Ninja, Soldat, Tänzer, Pirat, Koch, Astronaut) und Animationen für Idle, Laufen, Sprinten, Schleichen, Sliden, Schießen, Nachladen, Heilen und Tod (ragdoll-artiges Umkippen). Egoperspektive mit sichtbaren Armen oder Schulterperspektive (V).

**Performance:** zusammengeführte Geometrie pro Chunk mit 2 LOD-Stufen, Frustum Culling pro Chunk, instanziertes Gras (gecachte Kacheln), instanzierte Partikel/Hülsen/Einschusslöcher/Leuchtspuren, Schatten nur im Umkreis des Spielers, dynamische Qualität „Auto“.

### HUD
Rotierende Minimap mit POIs, Sturmkreisen und Position (darunter FPS und Ping), HP-Leiste unten links, Hotbar (Sturmgewehr mit Munition, Medkits mit Anzahl), anpassbares Fadenkreuz, Zähler und Sturm-Timer oben rechts, Killfeed, Meldungen, Nachlade- und Heil-Ring, Scoreboard (TAB), große Karte (M). Schriften: *Luckiest Guy* und *Lilita One* (lokal).

### Sound (alles prozedural, Web Audio)
3D-positionierte Schüsse (HRTF, Hall, entfernt leiser und dumpfer mit Schallverzögerung), Nachladen (Klick, Klack, Ratsch), leeres Magazin, Hitmarker, Kopfschuss-„Ding“, Kill-Glocke, Eliminierung, Treffer mit Stöhnen, Heilen mit Jingle, Schritte je Untergrund (Gras, Sand, Holz, Stein, Metall, Wasser; Schleichen fast lautlos), Atmen nach langem Sprint, Slide, Sprung und Landung, Sturm-Brummen und Warnsignal, Countdown-Piepen, Siegesfanfare, Niederlage, Lobby-Musik (abschaltbar), UI-Sounds (Hover, Klick, Tippen, Freundschaftsanfrage, Einladung), Ambiente (Wind, Vögel, Grillen, Meeresrauschen am Strand). Eigene Lautstärkeregler für Gesamt, Effekte, Musik, UI und Ambiente.

### Erststart, Lobby, Freunde, Party
- **Erststart-Screen** mit animiertem Sonnenuntergang und Kamerafahrt, Logo, Namensfeld mit Live-Prüfung (✓/✗, Fehlertext), Würfel, gelber WEITER-Button (auch Enter). Vergebene Namen zeigen 3 freie Vorschläge. Danach optional Outfit- und Farbauswahl mit 3D-Vorschau.
- Namensregeln: 3–16 Zeichen, Buchstaben (inkl. Umlaute), Zahlen, `_` und `-`, keine Leerzeichen, Filter für Beleidigungen, kein „Bot“, **serverweit eindeutig** (Groß-/Kleinschreibung egal). Offline wird lokal geprüft und beim Verbinden nachgeprüft.
- **Lobby** im Fortnite-Stil: 3D-Figur auf runder Plattform vor Savannen-Sonnenuntergang, Party-Mitglieder daneben (bis 4) mit Namen und Bereit-Status, Name (klickbar zum Ändern), Level/XP, Siege, Kronen, Kills, Spind (Outfit, Farbe, Waffen-Skin, Kronen-Stil), ≡-Menü (Freunde, Einstellungen, Statistiken, Online hosten, Credits, Spiel verlassen), Modus-Auswahl, SPIELEN-Button, Party-Chat.
- **Freunde-Panel** (Slide-in): Freunde mit Status (online/Lobby = grün, im Spiel = gelb, offline = grau), Anfragen (Annehmen/Ablehnen/Zurückziehen), Hinzufügen per Name. Pro Freund: In Party einladen, Party beitreten, Entfernen, Blockieren.
- **Einladungen** als Pop-up mit Sound und 60-s-Ablauf. **Party** bis 4 Spieler: Leader (Stern) kann entfernen, Leitung übergeben und starten, jeder kann „Bereit“ klicken und verlassen.
- Freundeslisten, Konten und Party-Status werden in `server/data/db.json` gespeichert und überstehen Neustarts.
- Ergebnisbildschirm mit Statistik, XP und Level-Up.

### Einstellungen (sofort wirksam, im localStorage gespeichert)
- **Konto:** Name ändern, Spieler-ID, Konto zurücksetzen (mit Sicherheitsabfrage)
- **Grafik:** Preset (Niedrig/Mittel/Hoch/Episch/Auto), Render-Auflösung 50–100 %, Schatten, Sichtweite, Grasdichte, Anti-Aliasing, Nachbearbeitung (Bloom, Farbkorrektur), FPS-Limit (30–240/Unbegrenzt), V-Sync, FOV 70–110, Vollbild
- **Anzeige/HUD:** FPS, Ping, Schadenszahlen, Minimap, HUD-Größe, Fadenkreuz-Editor (Farbe, Form, Größe, Punkt), Kopfwippen, Farbenblind-Modus
- **Steuerung:** jede Aktion neu belegbar (inkl. Maustasten), Warnung bei Doppelbelegung, Standard wiederherstellen
- **Maus:** Empfindlichkeit X/Y, ADS-Empfindlichkeit, Y invertieren, Sprinten/Ducken Halten oder Umschalten, Aim-Assist
- **Audio:** Gesamt, Effekte, Musik, UI, Ambiente, Lobby-Musik
- **Spiel:** Bot-Schwierigkeit, Sturm an/aus, Reservemunition, Sprache (Deutsch/Englisch), Start in Schulterperspektive. Die Spielerzahl ist fest 12.

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
│   ├── map/              Insel-Generator, Terrain, POIs, Baukasten, Deko-Typen
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
│       └── net/          WebSocket-Client, Solo- und Netzwerk-Session
├── tests/                npm test (Regeln, Determinismus, komplettes Bot-Match)
├── Dockerfile            eigener Server / VPS
└── package.json
```

---

## 🧠 Entscheidungen und Annahmen

- **Bot-KI im Shared-Ordner:** Die Spezifikation nennt `client/src/bots`. Weil dieselbe KI im Solo-Modus im Browser und im Mehrspieler auf dem Server laufen muss, liegt sie in `shared/sim/bots.js`.
- **Feste Insel:** Die Insel nutzt immer denselben Seed, damit man die Karte lernen kann. Pro Match zufällig sind Spawns, Sturmkreise und Bots.
- **Bewegung im Mehrspieler:** Die Clients berechnen ihre Bewegung selbst (flüssig, ohne Eingabeverzögerung) und senden die Position. Der Server ist autoritativ für Treffer, Schaden, Kills, Heilen, Munition (tolerant) und Zone.
- **Party-Optionen:** Sturm, Bot-Schwierigkeit und Reservemunition kommen im Party-Modus aus den Einstellungen des startenden Leaders.
- **„Bot“ im Namen:** Namen, die „bot“ in beliebiger Schreibweise enthalten, werden abgelehnt (auch „Robotnik“), damit man nie mit Bots verwechselt wird.
- **Krone im Solo-Modus:** Verlässt man ein Solo-Match vorzeitig, wird die Runde im Hintergrund zu Ende simuliert, damit der Kronen-Sieger feststeht.
- **Kronen-Zähler in der Lobby:** „Siege“ zählt alle Siege, „Kronen“ zählt Siege, die man mit der Krone auf dem Kopf geholt hat (Titel verteidigt). Dazu kommt der Zähler der Siege in Folge.
- **Party starten:** Der Leader kann starten, sobald alle anderen Mitglieder „Bereit“ sind.
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
