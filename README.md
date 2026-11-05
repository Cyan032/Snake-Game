# Snake

Snake im Browser im Stil von Google Snake: Rasen im Schachbrettmuster, eine runde Schlange mit Augen und flüssige Bewegung.
Dazu gibt es 16 Spielmodi, ein Parkour-Training mit 16 Leveln, 6 Welten, 7 Karten und viele Einstellungen.

## Spielmodi

| Modus | Regel |
| --- | --- |
| 🍎 Klassisch | Wand oder eigener Schwanz – dann ist Schluss. |
| ♾️ Ohne Wände | Durch den Rand kommst du auf der anderen Seite wieder raus. |
| 🧱 Hindernisse | Jeder Apfel lässt irgendwo einen Stein wachsen. |
| 🌀 Portale | Zwei Portale verbinden das Feld. |
| ☠️ Gift | Lila Äpfel sind giftig und springen bei jedem Bissen woanders hin. |
| ⚡ Turbo | Mit jedem Apfel wird die Schlange schneller. |
| ⏱️ Zeitrennen | 60 Sekunden – so viele Äpfel wie möglich. |
| 🕊️ Friedlich | Kein Game Over: keine Wände, durch dich selbst hindurch. |
| 👥 2 Spieler | WASD gegen Pfeiltasten an einer Tastatur. Wer crasht, verliert. |
| 🤖 Gegen KI | Eine Computer-Schlange frisst mit (leicht, mittel oder schwer). |
| 🪞 Spiegel | Du lenkst zwei Schlangen gleichzeitig, die rechte spiegelverkehrt. |
| 🔦 Dunkel | Stockdunkel, nur rund um deinen Kopf ist es hell. |
| 🏃 Fluchtäpfel | Die Äpfel laufen vor dir weg. |
| 🍗 Hunger | Ohne Futter schrumpfst du. Wirst du zu kurz, ist Schluss. |
| 🔥 Zone | Alle 15 Sekunden rückt eine Feuerwand ein Feld näher. |
| 🎲 Chaos | Alle paar Sekunden ein Zufallseffekt: Turbo, Zeitlupe, Licht aus, verdrehte Steuerung, Geist, doppelte Punkte, Apfelregen … |

## Parkour (Training)

Im Reiter **Parkour** lenkst du die Schlange durch einen Parcours bis zur Zielflagge 🏁.
Es gibt vier Schwierigkeitsstufen (Leicht, Mittel, Schwer, Profi) mit je vier Leveln.
Pro Level sind drei Sterne zu holen, und die Bestzeit wird gespeichert.
Nach einem Crash geht es am letzten Checkpoint 🚩 weiter.

Folgende Elemente kommen in den Leveln vor:
- Türen, die im Takt auf- und zugehen (blau und lila wechseln sich ab)
- Schlüssel 🔑, der goldene Schlösser öffnet
- Portale
- Kreissägen, die auf sichtbaren Schienen hin und her fahren
- Checkpoints

Die Level stehen in `levels.js`. Am Anfang der Datei steht eine Zeichen-Legende, damit lassen sich auch eigene Level bauen.

## Einstellungen

- **Spiel:** Tempo, Spielfeld (Klein bis Riesig), Anzahl der Äpfel (1–10), Goldäpfel (3 Punkte, verschwinden nach kurzer Zeit), Stärke der KI
- **Welt:** Wiese, Wüste, Schnee, Nacht, Vulkan, Weltraum
- **Karte:** Offen, Kreuz, Ecken, Säulen, Räume, Tunnel, Zufall
- **Schlange:** 7 Farben, Muster (Uni, Streifen, Punkte, Regenbogen) und Extras (Sonnenbrille, Krone, Schleife)

Jeder Modus speichert seinen eigenen Rekord im Browser.

## Steuerung

- **Lenken:** Pfeiltasten oder W A S D
- **Pause:** Leertaste, P oder Esc
- **Neustart:** R
- **Ton an/aus:** M
- **Handy:** wischen oder das Steuerkreuz unter dem Spielfeld

Kurz nach dem Erreichen eines Feldes zählt ein Tastendruck noch für dieses Feld. Vor einer Wand bleibt ein kurzer Moment zum Ausweichen.

## Dateien

- `index.html` – Seite und Menü
- `style.css` – Aussehen
- `game.js` – Spiellogik und Grafik
- `levels.js` – Parkour-Level

## Lokal starten

```
npm run dev
```

Dann http://localhost:3000 öffnen. Alternativ geht auch `python -m http.server 8000`.

## Veröffentlichen

Das Projekt ist eine statische Seite für Vercel. Jeder Push auf `main` wird automatisch neu veröffentlicht.
