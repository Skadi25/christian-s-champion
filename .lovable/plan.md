## Phase 2: Discovery, Claim-Erkennung & Opportunity Score

Ziel: Nach dem Login sieht Chris in wenigen Sekunden echte YouTube-Videos zu seinen Claims, priorisiert nach einem transparenten Opportunity Score.

---

### 1. YouTube API-Zugang

Für YouTube Data API v3 brauchen wir einen API-Key (kostenlos, 10.000 Requests/Tag).

**Was du tun musst (dauert ~3 Minuten):**
1. Auf https://console.cloud.google.com ein Projekt erstellen
2. "YouTube Data API v3" aktivieren
3. Unter "Credentials" → "API Key" erstellen
4. Ich frage dich den Key danach über ein sicheres Formular ab und speichere ihn als `YOUTUBE_API_KEY`.

Für die KI-Analyse (Claim-Matching) nutzen wir Lovable AI — kein zusätzlicher Key nötig.

---

### 2. Plattform-agnostische Architektur

```text
src/lib/platforms/
├── types.ts              → gemeinsame Interfaces (Video, SearchQuery, PlatformAdapter)
├── youtube.server.ts     → YouTube-Implementierung
└── registry.server.ts    → mapt "youtube" → Adapter, später "tiktok", "instagram"
```

Alle folgenden Server-Funktionen arbeiten nur mit dem generischen Interface. TikTok/Instagram später = neuer Adapter, keine UI-Änderung.

---

### 3. Datenbank-Erweiterung (Migration)

- `videos`: `transcript` (text, nullable), `raw_metadata` (jsonb)
- `video_matches`: `matched_at`, `ai_summary` (text), `ai_reasoning` (text)
- Neue Tabelle `discovery_runs` — Log pro Discovery-Lauf (welcher User, wann, wie viele Videos gefunden), für Transparenz und Debugging
- Grants + RLS wie bisher

---

### 4. Discovery-Pipeline (Server Functions)

**`runDiscovery(userId)`** — der Kern:

```text
1. Lade alle aktiven Themen + Claims des Users
2. Für jeden Claim → generiere Suchqueries per KI (2-3 pro Claim, deutsch)
   Beispiel: "Kreatin schädigt die Nieren" →
     ["kreatin nieren", "kreatin nebenwirkungen niere", "creatin gefahr"]
3. Für jede Query → YouTube-Suche (letzte 7 Tage, DE, sortiert nach Views)
4. Videos + Metadaten in videos-Tabelle upserten (unique auf platform+external_id)
5. Für jedes neue Video → KI prüft: enthält Titel/Beschreibung diesen Claim?
   Strukturierter Output: { matches: bool, confidence: 0-1, summary, reasoning }
6. Bei match=true → video_matches-Eintrag + Opportunity Score berechnen
7. discovery_runs-Eintrag schreiben
```

**Opportunity Score (0-100), transparent aufschlüsselbar:**

```text
score = reach(35) + growth(25) + recency(15) + engagement(15) + confidence(10)

reach       = log-normalisiert auf view_count
growth      = views / (Stunden seit Upload) — virale Videos
recency     = 100 bei <24h, linear fallend auf 0 bei 7 Tagen
engagement  = (likes + comments) / views
confidence  = KI-Confidence des Claim-Matches
```

score_breakdown wird als JSON gespeichert → im UI später aufklappbar ("Warum diese Priorität?").

**KI-Modell:** `google/gemini-3-flash-preview` mit strukturiertem Output (Zod-Schema). Schnell + günstig für Klassifizierung.

---

### 5. Auslösen der Discovery

Für die Demo: manueller Button "Jetzt aktualisieren" im Dashboard, der `runDiscovery` per `useServerFn` triggert. Loading-State mit Progress-Text ("Suche Videos zu 12 Claims…").

Später (nicht Phase 2): `pg_cron`-Job der jede Nacht automatisch für alle User läuft. Architektur ist bereits vorbereitet.

---

### 6. Discovery-UI (Dashboard erweitern)

Das aktuelle Übersichts-Layout bleibt, wird aber mit echten Daten gefüllt:

- **Header:** "Jetzt aktualisieren"-Button + "Zuletzt aktualisiert vor 3 Min"
- **Stat-Karten:** echte Zahlen (neue Videos heute, Ø Score, höchste Wachstumsrate)
- **Video-Feed** (neue Sektion, nach den Übersichtskarten):
  - Karten sortiert nach Opportunity Score, absteigend
  - Pro Karte: Thumbnail · Titel · Kanal · 🔥 Score (groß, farbig) · 👁 Views · 📈 Wachstum/h · ⏱ Alter · Themen-Tag
  - Erkannter Claim + KI-Summary ("Behauptet ab 2:14, dass Kreatin die Nieren schädigt")
  - Aufklappbar: Score-Breakdown (welcher Faktor wie beigetragen hat)
  - Buttons: "Auf YouTube öffnen" · "Reaktion vorbereiten" (Placeholder für Phase 3)
- **Filter:** nach Thema, nach Score-Schwelle, nach Alter
- **Leerer Zustand:** "Noch keine Videos gefunden. Starte deinen ersten Discovery-Lauf."

---

### 7. Fehlerbehandlung

- Fehlender/ungültiger YouTube-Key → klare Meldung im UI mit Link zum Setup
- YouTube-Quota erreicht (403) → verständliche Fehlermeldung, Retry morgen
- Lovable AI Rate Limit (429) → einzelne Videos werden übersprungen, Rest läuft weiter
- Lovable AI Credits erschöpft (402) → Toast mit Hinweis auf Settings → Plans & credits

---

### Nach Phase 2

Chris kann in der App:
- Themen + Claims verwalten (fertig)
- Auf einen Knopf drücken und echte YouTube-Videos zu seinen Claims sehen
- Sofort erkennen, welche am wichtigsten sind (Score + Aufschlüsselung)
- Direkt zu YouTube springen

Phase 3 baut dann darauf auf: Video-Detailseite mit KI-generiertem Reaktionsentwurf + wissenschaftlichen Quellen.

---

### Frage an dich

Bist du bereit, den YouTube-API-Key zu besorgen (Anleitung in Punkt 1)? Sobald du bestätigst, starte ich mit der Implementierung — Reihenfolge: Architektur & DB → YouTube-Adapter → Discovery-Pipeline → UI. Sag mir am Ende einfach Bescheid, wenn du den Key hast, dann öffne ich das Formular zum sicheren Speichern.