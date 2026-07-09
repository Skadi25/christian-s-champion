
# Discovery v2 — Professionelle SaaS-Struktur

Ziel: bestehende Discovery nicht ersetzen, sondern modular ausbauen. Grundlage für YouTube, TikTok, Instagram, Facebook, X, Threads. Jede Plattform = ein Adapter. Discovery, Neueste, Trends und Watchlist teilen sich einen gemeinsamen Kandidaten-Pool.

## 1. Navigation & neue Routen

Die App-Shell bekommt vier Bereiche (Sidebar/Tabs):

- `/_authenticated/dashboard` → 🔥 **Discovery** (bleibt, aber aufgeräumt)
- `/_authenticated/latest` → 🆕 **Neueste Videos** (24h / 7d / 30d)
- `/_authenticated/trends` → 📈 **Trends** (Wachstums-Ranking)
- `/_authenticated/watchlist` → ❤️ **Watchlist** (Kanäle & Videos)

Alle vier Seiten lesen aus derselben Datenbasis (`videos` + `video_matches`), nur mit unterschiedlichen Queries/Sortierung. Keine parallele Discovery-Logik pro Seite.

## 2. Plattform-Architektur (multi-platform ready)

Ausbau der bestehenden `PlatformAdapter`-Schnittstelle, damit später TikTok/Instagram/… nur neue Dateien sind:

```text
src/lib/platforms/
  types.ts                 // PlatformAdapter, PlatformVideo, SearchQuery, TrendingQuery
  registry.server.ts       // getPlatformAdapter(id), getEnabledPlatforms()
  youtube.server.ts        // implementiert search + fetchLatest + fetchTrending + fetchChannel
  tiktok.server.ts         // (Stub, throws "not implemented" — Adapter-Slot vorbereitet)
  instagram.server.ts      // (Stub)
```

Neu im Interface: `fetchLatest`, `fetchChannelVideos`, `fetchVideoStats` (für Watchlist-Refresh & Trend-Wachstum). Discovery/Latest/Trends rufen NUR das Adapter-Interface auf.

## 3. Discovery-Pipeline (modular, mit Debug-Trace)

Zerlegung der monolithischen `pipeline.server.ts` in klar benannte Stages unter `src/lib/discovery/`:

```text
src/lib/discovery/
  pipeline.server.ts       // Orchestrator: ruft die Stages in Reihenfolge auf
  stages/
    generateQueries.server.ts   // Claim → mehrere Suchanfragen (Synonyme, Umformulierungen, Hashtags)
    fetchCandidates.server.ts   // Adapter.search paginiert (12 Monate, 3 Sort-Orders)
    dedupe.ts                   // nach platform+external_id + Fuzzy-Title
    filterLanguage.ts           // DE bevorzugt, EN abgewertet (nicht gestrichen)
    filterTimeframe.ts          // published_at innerhalb LOOKBACK
    prefilter.ts                // Heuristik-Score → Top-K für KI
    classify.server.ts          // KI: stance + confidence + summary + reasoning
    score.ts                    // Opportunity Score (Stance-dominiert)
    persist.server.ts           // Upsert videos + video_matches + run_stages
  scoring.ts               // (bleibt, wird verfeinert)
  queries.ts               // Synonym-/Umformulierungsregeln
```

Jede Stage erhält den Kandidatenstrom **und** einen `RunTrace`, in dem sie eintragen kann:
- Stage-Name
- Input-Count / Output-Count
- verwendete Queries (bei fetchCandidates)
- Verworfen-Gründe (bei dedupe/filter/prefilter)

Der `RunTrace` wird pro Run in einer neuen Tabelle `discovery_run_stages` persistiert, damit UI und Debug-Ansicht die Pipeline nachvollziehbar zeigen.

### Query-Generierung (Claim → viele Anfragen)
Für jeden Claim werden mehrere Queries erzeugt:
- Original-Claim
- KI-generierte 3–5 Umformulierungen inkl. Synonyme (einmal pro Claim, gecached in `claims.query_variants`)
- Hashtag-Varianten für spätere Plattformen

Pro Query mehrere Sort-Orders (`relevance`, `date`, `viewCount`) und Pagination bis LOOKBACK 12 Monate — begrenzt durch Adapter-Quota, nicht durch feste "150 Videos".

### KI-Kostenkontrolle
- Wide Sweep sammelt **beliebig viele** Kandidaten (mehrere Tausend möglich)
- Dedupe + Prefilter reduzieren auf `MAX_CLASSIFICATIONS` (Default 200, konfigurierbar pro User)
- Nur diese Shortlist wird an das KI-Gateway geschickt
- Alle anderen Kandidaten bleiben mit Status `prefiltered_out` sichtbar im Debug-Trace

## 4. Stance-Erkennung (Kernbewertung)

Bleibt bei den vier Kategorien:
- 🔴 `promotes` (Verbreitet)
- 🟡 `mentions` (Erwähnt)
- 🟢 `debunks` (Widerlegt)
- ⚪ `unrelated` (Neutral / geht nicht darum)

Stance ist mit ~45 % der dominanteste Score-Faktor; Debunk-Videos sind bei 25 gedeckelt (bereits vorhanden — bleibt).

Zusätzlich: KI-Prompt bekommt konkrete Debunk-Signale (z.B. „Studie zeigt …", „Faktencheck", „falsch, weil …") als Beispiele, um Clickbait-Titel korrekt einzuordnen.

## 5. Learning System (dauerhaft)

Bestehende Tabellen `channel_preferences` und `stance_preferences` bleiben. Ergänzt um:
- `claim_stance_preferences` (user × claim × stance): merkt sich, dass Nutzer X für Claim Y „debunks" konsequent ablehnt
- Feedback wirkt direkt auf zukünftige Runs (KI-Prompt-Kontext + Score-Modifier), nicht nur global

## 6. Verbesserter Opportunity Score

`scoring.ts` wird um zwei Faktoren erweitert:
- **Viralität**: `views / hoursSinceUpload` normalisiert gegen Kanal-Median → belohnt kleine, schnell wachsende Videos
- **Kanalgröße**: Subscriber-Bucket (klein/mittel/groß) — leicht positiv für kleine Kanäle mit Wachstum, damit sie nicht von Mega-Kanälen erdrückt werden

Debunk/Unrelated-Caps bleiben hart.

## 7. Neueste-Videos-Seite

Query: `videos` join `video_matches` per user, sortiert nach `published_at DESC`, Filter 24h / 7d / 30d. Kein Score, nur Chronologie. Nutzt denselben Kandidatenpool.

## 8. Trends-Seite

Zeigt Videos mit höchstem `growth_score` (views/h, ggf. Delta zwischen zwei Fetches). Damit Deltas möglich werden: neue Tabelle `video_stats_snapshots` (video_id, captured_at, views, likes, comments). Snapshot pro Discovery-Run, zusätzlich täglicher Refresh für Watchlist-Videos.

## 9. Watchlist

Neue Tabelle `watchlist_items`:
- `user_id`, `kind` (`channel` | `video`), `platform`, `external_id`, `label`, `created_at`
- Cron/refresh-Server-Fn ruft Adapter.fetchChannelVideos / fetchVideoStats
- Neue Uploads dieser Kanäle landen als Kandidaten im nächsten Discovery-Lauf

UI: Kanal per YouTube-URL hinzufügen, Video-Karten mit „Watchen"-Button überall.

## 10. Debug-Panel

Auf `/dashboard` ein aufklappbares Panel „Pipeline-Details des letzten Runs":
- Tabelle der Stages mit In → Out
- Liste aller verwendeten Suchanfragen und deren Trefferzahl
- Aussortierte Videos mit Grund (`language`, `too_old`, `duplicate`, `prefiltered`, `ai_debunks`, `ai_unrelated`, …)

Nie mehr „Pool 0" ohne Kontext.

## 11. Datenbank-Migrationen

Eine neue Migration mit:
- `claims.query_variants` (jsonb, cache der KI-Umformulierungen)
- `discovery_run_stages` (run_id, stage, input_count, output_count, meta jsonb)
- `video_stats_snapshots`
- `watchlist_items`
- `claim_stance_preferences`
- Grants + RLS pro Tabelle nach Standardmuster

## 12. Umsetzungsschritte (in dieser Reihenfolge)

1. Migration (alle neuen Tabellen + Grants + RLS)
2. `platforms/types.ts` & `youtube.server.ts` um `fetchLatest`, `fetchChannelVideos`, `fetchVideoStats` erweitern; Stubs für TikTok/Instagram
3. Pipeline in Stages zerlegen, `RunTrace` einführen, in DB persistieren
4. Query-Generator (`queries.ts` + KI-Cache in `claims.query_variants`)
5. Scoring um Viralität + Kanalgröße erweitern
6. Server-Fns: `runDiscovery` (bleibt), `getLatestVideos`, `getTrendingVideos`, `getWatchlist`, `addToWatchlist`, `removeFromWatchlist`, `refreshWatchlist`, `getRunTrace`
7. UI: Sidebar/Navigation (App-Shell), vier Route-Dateien, gemeinsame Video-Card-Komponente extrahieren
8. Debug-Panel im Dashboard
9. `AGENTS.md`-artige Kurzdoku unter `src/lib/discovery/README.md`, wie ein neuer Plattform-Adapter registriert wird

## Technische Hinweise

- Alles Server-only läuft in `createServerFn` mit `requireSupabaseAuth`; kein Edge-Function-Umweg.
- YouTube-Adapter erhält Rate-Limit-Backoff (bei 403 quota → sauber abbrechen, Trace zeigt Quota-Ende).
- KI-Aufrufe bleiben Concurrency-limited (8 parallel) — nur die Shortlist wird klassifiziert.
- Kein Breaking Change an bestehenden Tabellen; nur additiv.

## Frage vor Umsetzung

Der Umbau ist groß (Migration + ~15 Dateien). Soll ich in **einem Schritt** die komplette v2 ausliefern, oder lieber in **zwei Phasen**:

- **Phase A** (jetzt): Pipeline-Refactor + Debug-Trace + Query-Generator + verbessertes Scoring (Discovery wird sofort deutlich besser & nachvollziehbar)
- **Phase B** (danach): Neueste-, Trends-, Watchlist-Seiten + Multi-Plattform-Stubs

Bitte kurz bestätigen: „alles auf einmal" oder „Phase A zuerst".
