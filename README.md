# Snake

Snake im Browser: Rasen im Schachbrettmuster, eine runde Schlange mit Augen, flüssige Bewegung und 9 Spielmodi.
Das ganze Spiel steckt in einer einzigen `index.html` und braucht keinen Build-Schritt.

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

Im Menü lassen sich außerdem Tempo, Spielfeldgröße, Anzahl der Äpfel und die Farbe der Schlange wählen.
Der Rekord jedes Modus wird im Browser gespeichert.

## Steuerung

- **Lenken:** Pfeiltasten oder W A S D
- **Pause:** Leertaste, P oder Esc
- **Ton an/aus:** M
- **Handy:** wischen oder das Steuerkreuz unter dem Spielfeld

## Lokal starten

```
npm run dev
```

Dann http://localhost:3000 öffnen. Alternativ geht auch `python -m http.server 8000`.

## Veröffentlichen

Das Projekt ist eine statische Seite für Vercel. Jeder Push auf `main` wird automatisch neu veröffentlicht.
