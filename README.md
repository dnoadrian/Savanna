# SHOWDOWN BAY 🌊🤠

## ▶️ [JETZT SPIELEN – hier klicken](https://dnoadrian.github.io/Savanna/docs/)

> Direkt im Browser, ohne Installation: **https://dnoadrian.github.io/Savanna/docs/**

Ein Low-Poly-Battle-Royale für den Browser. **20 Spieler** – allein (**Solo**) oder zu zweit (**Duo**) – landen auf der **Frostfeste**, einer verschneiten Insel mitten im Meer: eine Festung mit großer Freitreppe, runder Torscheibe, verhüllten Statuen und Kuppeltürmen, dahinter ein spitzer Felsgipfel und eine Bergkette, dazu gefrorener Fluss und See, Gletscherstufen, Dorf und Hafen. Truhen öffnen, Waffen sammeln, Schilde trinken – wer als Letzter (bzw. als letztes Team) steht, gewinnt.

- **Client:** Three.js (lokal über npm, kein CDN), reines JavaScript mit ES-Modulen, Web Audio API
- **Server:** Node.js + `ws` auf Port **4242** (Spiel ausliefern, Namen, Lobby, Freunde, Party, Warteschlange, server-autoritative Matches)
- **Assets:** Alle Modelle, Texturen, Sounds und Musik entstehen im Code – einzige Ausnahme ist der mitgelieferte SCAR-Schuss (`client/sounds/scar-shot.mp3`). Die Schrift *Barlow Condensed* (SIL OFL) ist lokal über `@fontsource` eingebunden.

---

## 🎮 So spielt man

1. **Neu hier:** Namen wählen (🎲 = Zufallsname) und **Geburtsdatum** angeben. **Anmelden:** Mit Name + Geburtsdatum meldet man sich auf jedem Gerät wieder an – Coins, Skins, Messer, Rang und Statistik kommen mit (liegen als Kopie auf dem Server; das Geburtsdatum selbst wird nie gespeichert, nur ein gesalzener Schlüssel daraus). *Einstellungen → Konto → Abmelden* meldet nur dieses Gerät ab. Am Anfang hat man nur **„Kein Skin“** – weitere Skins gibt es im **Shop**.
2. In der Lobby auf die **Karte über BEREIT** klicken, um zwischen **Solo** und **Duo** zu wechseln (in einer Party wählt der Leader). Dann **BEREIT** drücken. Die Warteschlange wartet auf echte Spieler – **Standard 15 Sekunden**, einstellbar in *Einstellungen → Konto → Warteschlange* von **10 bis 120 Sekunden**. Danach startet das Match, freie Plätze füllen Bots (immer 20 Spieler, im Duo 10 Zweierteams).
3. Ins Bild klicken (Mausfang), am besten **Vollbild** nutzen.

| Taste | Aktion |
|---|---|
| **W A S D** | Laufen |
| **Leertaste** | Springen |
| **STRG** | Sprinten (weißer Ausdauerbalken über der Hotbar) |
| **SHIFT** | Ducken / beim Sprinten: Slide |
| **Linke Maus** | Schießen / Schild oder Medikit benutzen (wirkt sofort) |
| **Rechte Maus** | Zielen (Waffe bleibt seitlich wie in Valorant, leichter Zoom; Scharfschützengewehr: Zielfernrohr) |
| **R** | Nachladen (nur manuell) |
| **F** | Truhe öffnen / Gegenstand aufheben · **Duo: gedrückt halten = Partner wiederbeleben** |
| **1 – 5**, Mausrad | Inventarplatz wählen |
| **Q** | Messer (Nahkampf, eigener Platz links neben der Hotbar) |
| **V** | Ego- / Schulterperspektive |
| **TAB** | Inventar (durchsichtiges Panel links, Maus frei): **Ziehen = sortieren**, **aus dem Menü ziehen = fallen lassen** (auch Munition), Doppelklick = in die Hand; Tasten: Platznummer, dann Zielnummer |
| **M** | Große Karte · **ESC** Pause |

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
| Mini-Schild | +25 Schild (nur bis 50) | **sofort** | 6 |
| Schildtrank | +50 Schild (bis 100) | **sofort** | 3 |
| Medikit | Leben auf 100 | **sofort** | 3 |

Hat man schon einen Stapel davon im Inventar, werden weitere beim Drüberlaufen automatisch eingesammelt.

**Waffen** (Werte orientieren sich an den bekannten Originalen)

| Waffe | Munition | Magazin | Schuss/s | Nachladen | Schaden (grau → gold) |
|---|---|---|---|---|---|
| Pistole | leicht | 20 | 8,75 | 0,8 s | 24–28 |
| Sturmgewehr (SCAR) | mittel | 30 | **7,2** | 1,15 s | 30 / 31 / 33 / 35 / 36 |
| Trommelgewehr | leicht | 40 | 13 | 1,5 s | 19–23 |
| Taktische Schrotflinte | Schrot | 8 | 1,95 | 0,3 s/Patrone | 70–85 |
| Pump-Schrotflinte | Schrot | 5 | 1,1 | 0,45 s/Patrone | **100–125** |
| **Hammer-Pump** (neu) | Schrot | 6 | 1,5 | 0,4 s/Patrone | 84–104 |
| Schweres Scharfschützengewehr | schwer | 1 | 0,45 | 2,4 s | 150 / 157, Kopf ×2,5 |

- Seltenheiten: **Grau, Grün, Blau, Lila, Gold** (Farbe am Modell, Lichtsäule und Inventar)
- **Hitscan & kein Rückstoß:** Kugeln treffen immer genau das Fadenkreuz – im Stehen, Laufen und Springen. Nur Schrotflinten haben einen festen Streukegel; der runde Kreis im Fadenkreuz zeigt ihn exakt (Pump eng, Taktische weit).
- Schrotflinten verschießen 10 Kugeln, der Schaden fällt mit der Entfernung ab. Die Pump ist bis etwa 12 m tödlich.
- Spieler-Hitboxen sind 25 % größer. Kugeln fliegen durch Zäune und Geländer und streifen knapp an Felskanten vorbei.
- **Keine unendliche Munition:** Start mit grauer Pistole **20 + 60 = 80 Schuss**. Waffen aus Truhen bringen das **Dreifache ihres Magazins** an Munition mit (SCAR: 30 + 90 = 120).
- **Jede Eliminierung** lässt zusätzlich **ein volles Magazin jeder Munitionsart** fallen (Leicht 40, Mittel 30, Schrot 8, Schwer 3). Die Munitionsarten haben eigene Modelle: graublaue Schachtel, grüne Munitionskiste, dunkelrote schwere Kiste, rote Schrotpatronen.

**Messer** – jeder hat es immer dabei (Taste **Q**): 40 Schaden, Kopf ×1,5, 2,4 Hiebe/s, Reichweite 2,8 m, keine Munition. Mit dem Messer in der Hand läuft man 8 % schneller. Messer-Skins (Taktisch, Neon, Goldklinge, Drachenzahn) gibt es im Shop, auswählen im Spind.

**Truhen** (rund 60 auf der Insel) – goldenes Leuchten, Summen und Funkeln in der Nähe. Mit **F** öffnen: **1 Waffe + 1 Heil-/Schild-Gegenstand + passende Munition**.

**Inventar** – 5 Plätze (1–5) mit Kurznamen und Seltenheitsfarbe. Ist alles voll, tauscht **F** den Gegenstand in der Hand. Sortieren im TAB-Menü.

**Bewegung** – schneller Sprint mit Ausdauer (ca. 7 s, erholt sich in 3 s), kräftiger Slide. Wer unter einen Steg rutscht, kriecht heraus.

**Karte: Frostfeste** – eine Schneeinsel mit 25 % mehr Fläche als die alten Inseln. Orte:
- **Frostfeste** (Mitte): Terrasse mit Eiskante, 27-stufige Freitreppe mit Brüstungen, achteckiger Statuenplatz mit eingravierten Ringen und drei verhüllten Statuen, Vorplatz mit Statuen und dunklen Kugeln, Haupthalle mit runder Bronze-Torscheibe, Säulen, Galerie und Pilzkuppel, Seitenflügel mit Durchgängen, zwei begehbare Kuppeltürme (Treppen bis in die offene Säulenhalle), zwei Wachtürme. Seitliche Schneerampen führen ebenfalls auf die Terrasse.
- **Hornspitze** und Bergkette im Norden (bis über 75 m), steile Felsflanken mit Schneebändern.
- **Spiegelsee** mit Eisfischer-Hütten und dem gefrorenen Fluss, der vom Gebirge herunterkommt und ins Meer mündet (man läuft auf dem Eis).
- **Gletscherstation** auf blauen Eisterrassen mit Container-Laboren, Funkmast und Radarschüssel.
- **Frosttal** (Dorf mit Blockhütten, Gasthaus und Brunnen), **Eishafen** (Stege, Bootshaus, Container, eingefrorener Kutter) und vier Außenposten (Kuppeltürme).
- Überall verschneite Fichten, Felsbrocken mit Schneehaube, Eisbrocken und im Meer treibende Eisschollen.

**Texturen** – alle Oberflächen haben prozedurale Muster direkt im Shader (ohne Bilddateien): Pulverschnee mit Verwehungen und Glitzern, Eis mit Schlieren und Rissen, Fels mit Gesteinsschichten, Mauerwerk, Bodenplatten mit Reif, große Betonplatten, Holzbretter, Blech und Bronzekuppeln mit Patina. Schnee und Eis sind weich schattiert, Fels bleibt kantig. Schritte klingen auf Schnee knirschend und auf Eis hart.

**Sturm** – 5 Phasen, der letzte Kreis schließt sich nach etwa 5 Minuten.

**Duo** – Teams aus 2 Spielern (Party-Partner zusammen, sonst ein zufälliger Partner oder ein Bot). Kein Eigenbeschuss. Wer mit 0 Leben umfällt, während der Partner noch steht, ist **niedergeschlagen**: kriechen, nicht schießen, 100 Leben, die langsam ausbluten. Der Partner belebt mit **F gedrückt halten** (5 s) wieder – danach 30 Leben. Liegen beide am Boden oder ist der Partner schon raus, ist das Team eliminiert. Partner sind blau markiert (Name, Leben, Minimap); unten links steht ihr Zustand. Siegt der Partner, hat das ganze Team gewonnen.

**Bots** – looten zuerst, öffnen Truhen, wählen die passende Waffe für die Entfernung, heilen sofort im Kampf, wechseln bei leerem Magazin auf die Zweitwaffe, nutzen die Pump-Kombo, sprinten/sliden/schleichen passend und gehen rechtzeitig vor dem Sturm los. Im Duo bleiben sie bei ihrem Partner, kriechen am Boden zu ihm und beleben ihn wieder. Die Lobby ist gemischt (leicht, normal, wenige starke).

**Ranked** – statt Level gibt es Ränge wie im Original: **Bronze → Silber → Gold → Diamant** (je I–III) **→ Elite → Champion → Unreal**. Punkte gibt es für die Platzierung und Kills; ab Diamant kostet ein frühes Ausscheiden Punkte.

**Coins & Shop** – **50 Coins pro Kill, 250 pro Sieg.** Im **Shop** (oben in der Lobby) gibt es 8 Skins von 600 bis 2.500 Coins und 4 Messer-Skins von 500 bis 2.500 Coins; gekaufte Skins erscheinen im Spind.

**Lobby** – die eigene Figur steht in der Mitte, Party-Mitglieder daneben. Wer aus der Party noch im Spiel ist, erscheint als **blaues Hologramm**.

**Sieg** – Siegerkamera um die jubelnde Figur, Lichtstrahlen, Konfetti und eine große, leuchtende Krone für die Siegesserie. Wer Zweiter wird, geht direkt zurück zur Lobby.

---

## ⚙️ Einstellungen

- **Grafik wie in Fortnite:** Rendermodus *Qualität* oder *Leistung*, Stufen *Niedrig / Mittel / Hoch / Episch / Auto*. **Alle Stufen rendern mit 100 % 3D-Auflösung.**
- **Aim-Assist: An / Aus.** „An“ bremst das Fadenkreuz am Gegner leicht ab und zieht mit, wenn du dich bewegst oder zielst – es ist bewusst kein Aimbot.
- **Wartezeit auf echte Spieler:** 10–120 s (Standard 15 s)
- Maus-, ADS- und Zielfernrohr-Empfindlichkeit, FOV, FPS-Limit, V-Sync, HUD-Größe, Fadenkreuz, Farbenblind-Modus, Lautstärken, Sprache (Deutsch/English)

## 🛠️ Admin-Panel

In der Lobby (oder im Spiel) die Taste **0** drücken. Die Taste steht absichtlich nicht in den Tastenbelegungen.
- Haupt-Admin: Benutzer **adrian**, Passwort **1234**
- **Zugänge für andere:** Der Haupt-Admin legt Name + Passwort an und wählt, **wie oft** man sich damit anmelden kann (1×, 3×, 5×, 10×, 25× oder unbegrenzt). Mit Server gelten die Zugänge überall und werden dort gezählt; ohne Server nur auf diesem Gerät. Zugänge lassen sich jederzeit löschen.
- Cheats, die der Server ausführt (unendliche Munition, OP-Loot, durch Wände schießen), gelten online nur für angemeldete Admins.
- **Unendlich Munition** (Magazin wird nie leer), **OP-Loot** (goldene SCAR auf Platz 1, goldenes Scharfschützengewehr auf Platz 2, Rest leer – sofort und in jedem Match),
- **Skelett-ESP** (rotes Skelett aller Gegner, durch Wände), **Aimbot** (zielt auf den Kopf; mit **Radius**: ein einstellbarer Kreis ums Fadenkreuz – der Aimbot wirkt nur auf Gegner im Kreis, ohne Radius überall), **Durch Wände schießen**, **Spinbot**, **Fliegen** (Tempo einstellbar), **Tempo** (Laufgeschwindigkeit frei einstellbar)
- **Lobby-Nachrichten** (nur Haupt-Admin): Text + Dauer (10 min bis 1 Woche oder dauerhaft) – erscheint bei allen Spielern oben in der Mitte der Lobby. Höchstens 5 gleichzeitig, jederzeit löschbar.
- **Coins geben** (nur Haupt-Admin): Spielername + Menge – der Spieler muss mit dem Server verbunden sein (eigener Name geht auch offline)

---

## 🌐 Sofort im Browser spielen (ohne Installation)

**👉 https://dnoadrian.github.io/Savanna/**

Die Webseite läuft komplett im Browser: **BEREIT** → 15 s Warteschlange → Match gegen 19 Bots (im Duo mit einem Bot als Partner).

Für **Mehrspieler mit Freunden** braucht es einen laufenden Spielserver (GitHub Pages liefert nur Dateien aus):
1. **Einer hostet:** `npm install` und `npm run online` (oder in der Lobby **≡ → „Online hosten“**). **Wer danach einfach die normale Webseite öffnet, wird automatisch mit diesem Host verbunden** – der Server meldet seine Tunnel-Adresse jede Minute über [ntfy.sh](https://ntfy.sh) (Thema `showdownbay-dnoadrian-savanna`), die Webseite fragt dort nach. Abschalten: `SHOWDOWN_BEACON=0` oder `"showdown": { "beacon": false }` in `package.json`; eigenes Thema über `"beaconTopic"`. Das Hosting-Panel zeigt dann einen *„Link über die Webseite“* wie `https://dnoadrian.github.io/Savanna/?server=https://xyz.trycloudflare.com`. Auf der Webseite kann man den Server auch über **≡ → „Server / Online spielen“** eintragen.
2. **Dauerhaft online (24/7):** siehe nächster Abschnitt.

**Veröffentlichung auf GitHub Pages:** Die fertige Webseite liegt in `docs/` (`npm run build:pages`). Unter *Settings → Pages* entweder *Deploy from a branch* → Ordner **`/docs`** oder *GitHub Actions* (`.github/workflows/pages.yml`). `npm test` prüft, ob `docs/` aktuell ist.

---

## 🌍 24/7-Server: Jeder auf der Webseite spielt mit jedem

Ziel: Wer **https://dnoadrian.github.io/Savanna/** öffnet (nicht die Code-Seite github.com/dnoadrian/Savanna) und **BEREIT** drückt, landet mit allen anderen auf demselben Server – rund um die Uhr, ohne dass dein PC läuft.

**Weg A – Render (gratis, empfohlen)**
1. Auf [render.com](https://render.com) mit dem GitHub-Konto anmelden.
2. [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/dnoadrian/Savanna) klicken (oder *New → Blueprint* → Repository `dnoadrian/Savanna`) → **Apply**. Nach ein paar Minuten läuft der Server unter einer Adresse wie `https://showdown-bay-eu.onrender.com` (die Datei `render.yaml` ist schon fertig, Region **Frankfurt** für kurzen Ping in Europa).
3. **Adresse eintragen**, damit die Webseite sich automatisch verbindet – eine der beiden Möglichkeiten:
   - GitHub → Repository → *Settings → Secrets and variables → Actions → Variables* → **New repository variable** `SHOWDOWN_SERVER_URL` = deine Render-Adresse (wirkt, wenn *Settings → Pages → Source* auf **GitHub Actions** steht), **oder**
   - in `package.json` eintragen: `"showdown": { "server": "https://showdown-bay-eu.onrender.com" }`, dann `npm run build:pages` und committen (für *Deploy from a branch → /docs*).
4. **Wach halten:** Der Workflow *„Server wach halten“* (`.github/workflows/keepalive.yml`) ruft den Server alle 10 Minuten auf, damit er im Gratis-Tarif nicht einschläft. Unter *Actions* ggf. einmal aktivieren.

Gut zu wissen beim Gratis-Tarif von Render:
- 750 Stunden pro Monat – reicht für **einen** Server rund um die Uhr.
- Ohne Aufrufe schläft er nach 15 Minuten ein. Dann zeigt die Webseite **„Server startet … (bis zu 1 Minute)“** und verbindet sich automatisch, sobald er wach ist.
- **Kein dauerhafter Speicher:** Nach einem Neustart/Update sind Spielernamen, Freundeslisten und Admin-Zugänge auf dem Server weg. Coins, Skins und Statistiken liegen im Browser und bleiben erhalten. Für dauerhaften Speicher: bezahlter Tarif mit *Disk* (Mount-Pfad z. B. `/data`, dazu Umgebungsvariable `SHOWDOWN_DATA_DIR=/data`).
- GitHub pausiert zeitgesteuerte Workflows nach 60 Tagen ohne Commits – dann unter *Actions* wieder aktivieren.

**Weg B – eigener PC oder Raspberry Pi, der durchläuft:** `Starten.bat` bzw. `npm run online`. Die Webseite findet den Host automatisch (Leuchtfeuer über ntfy.sh), solange der Rechner an ist.

**Weg C – eigener VPS** (z. B. ein Gratis-Server bei Oracle Cloud „Always Free“): mit Docker starten (siehe unten), Port 4242 freigeben oder `npm run online` für einen HTTPS-Link, Adresse wie in Schritt 3 eintragen.

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

Tests: `npm test` (Leben/Schild/Überschild, Siphon, Kill-Munition, Auto-Aufsammeln, Ausdauer, Slide-Befreiung, Objekt-Hitboxen, Waffenwerte, Messer, keine unendliche Munition, Inventar + Sortieren + Fallenlassen, Admin-Zugänge, unendliche Munition + OP-Loot, Truhen, Sofort-Heilung, 20 Spieler, Duo-Teams + Niederschlagen + Wiederbeleben, Karte Frostfeste (Orte, Gipfel, Eis, alles zu Fuß erreichbar, deterministisch), komplettes Solo- und Duo-Bot-Match, Leuchtfeuer, Syntax aller Dateien, Server mit Warteschlange, Duo-Party, Anmeldung mit Geburtsdatum, Webseite aktuell).

Die Karte entsteht deterministisch aus Code (Server und Client bauen dieselbe Insel). Der Server berechnet sie im Hintergrund in kleinen Häppchen, damit laufende Matches nicht ruckeln; der Browser baut sie schon in der Lobby vor (Kartenvorschau auf der Moduskarte).

---

## 🗂️ Projektstruktur

```
├── server/               HTTP + WebSocket (Port 4242), Konten, Freunde, Party, Warteschlange, Matches, Tunnel
├── shared/               läuft auf Server UND im Browser
│   ├── constants.js      Spielwerte (20 Spieler, Leben/Schild, Sturm, Duo, Warteschlange …)
│   ├── items.js          Waffen, Messer, Seltenheiten, Munition, Schilde/Medikits, Beutetabellen
│   ├── ranks.js          Ranked (Bronze bis Unreal)
│   ├── sha256.js         Anmeldeschlüssel aus dem Geburtsdatum
│   ├── map/              Insel-Generator (island.js), Karte Frostfeste (frostfeste.js), Baukasten (structures.js), Deko
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
- Alle Modelle, Texturen, Sounds und Musik: prozedural im Code erzeugt. Ausnahme: `client/sounds/scar-shot.mp3` (vom Projektinhaber bereitgestellt – vor einer öffentlichen Veröffentlichung die Nutzungsrechte prüfen). Waffenwerte sind an bekannte Vorbilder angelehnt.
- Server-Suche der Webseite: [ntfy.sh](https://ntfy.sh) (öffentlicher Dienst; jeder kann in ein Thema schreiben – es werden nur `*.trycloudflare.com`-Adressen angenommen)
