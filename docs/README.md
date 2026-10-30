# The Word Within engineering notes

The authoritative baseline is [APPROVED-SPECIFICATION.md](APPROVED-SPECIFICATION.md). This application implements a local-first PWA for KJV reading, six memory methods, project planning, durable review histories, Chapter Code, reflections, topics, licensed-package imports, audio playback, and encrypted manual transfer. See the repository README for commands and release limitations.

## Data and review design

IndexedDB (`word-within`, schema 1) contains a canonical KJV corpus table and a typed personal-record table indexed by stable `id` and `kind`. UUIDs identify user records and immutable attempts. Deterministic memory-unit identifiers distinguish `verse:book:chapter:verse`, `chapter:book:chapter` and noncontiguous passage scopes. A separate review record references each unit. No network service is involved in personal persistence.

The scheduler has six stages with 1, 3, 7, 30, 90-day promotion intervals and a 365-day maximum lifelong interval. Only near-exact, confident, unassisted recall promotes. Hints and difficulty slow scheduling; inaccurate recall regresses. Missed reviews retain their original due date until practiced; the next interval begins with the actual attempt. The retention estimate is a transparent exponential heuristic, not a clinical or scientifically calibrated prediction. Reviews come first and adaptive plans introduce previously unintroduced verses in canonical project order. Complete chapter recitations have independent review state, never graduate out of review, and test transitions as well as words. Book projects progress through verses/chapters; choose recitation sections for very long projects.

Word grading normalizes Unicode, case, punctuation and apostrophes. It performs ordered word edit-distance alignment and reports omissions, additions and substitutions. Whole-recitation alignment produces independent verse scores regardless of line wrapping; transitions are checked against aligned word positions. Reference recall is separately recorded. A 16-million-cell comparison safety bound prevents browser memory exhaustion; choose a chapter section for large mismatched recitations. Study text and cues count as assistance; independent attempts require hidden Scripture or Type from memory.

## Privacy and security

The app has no accounts, server database, telemetry, remote fonts, third-party content calls, or automatic sync. Personal data and imported files remain in IndexedDB. Only same-origin static-file requests are made. Hosting providers can keep their normal access logs. Content Security Policy restricts connections and scripts to the same origin. Notes render as text, never HTML. Local data is not encrypted at rest; rely on device security and encrypted backups. OS eviction and user deletion remain possible even after requesting persistent storage.

Manual journal and collection JSON exports are deliberately unencrypted and labelled accordingly. Encrypted backups protect transfer of all personal records and imported media. See [BACKUP.md](BACKUP.md). Import preview and explicit confirmation precede an atomic restore transaction.

## Package interfaces

A translation package is JSON with `license` (a substantive permission/source statement) and `books`. The books array must contain 66 canonical entries `{id:1..66,name,chapters:string[][]}`, matching the canonical chapter/verse dimensions. In-app import chooses RVR1960, LS1910 or HSV, requires an authorization acknowledgement and stores the package locally. This interface does not confer copyright permission. KJV memorization remains fixed when the reader comparison changes. On large viewports comparison is side by side; on phones it stacks beneath KJV with a simple switcher.

Audio imports accept locally selected browser-supported audio files below 100 MB, with passage references and a narration-rights statement. No text-to-speech or narration ships with the app. Playlists filter by verse/chapter/book, support repeat and rate selection, and use native audio plus Media Session where available. Player state remains mounted when navigating. Imported media are included in encrypted backups.

## Updating and hosting

`npm run build` produces a static `dist/` with an installable manifest, Apple touch icon and generated service worker. The entire core and KJV package are precached. First provisioning requires connectivity. The offline indicator verifies the versioned precache rather than relying on a port or service-worker registration alone. An update prompt lets the user finish work before reloading. Use HTTPS; serve the app at the origin root. Do not configure a backend for notes. See [APPLE-INSTALL.md](APPLE-INSTALL.md).

## Approved visual design

`PAPER-VISUAL-DIRECTION.md` defines the current appearance and supersedes the earlier color/typography choices in `VISUAL-SPECIFICATION.md`. The earlier implementation below remains documented as history. CSS exposes the exact forest/ivory/sage palette, spacing and radius tokens. Georgia is the offline system-serif alternative and the interface uses system sans-serif; no fonts are downloaded. Lucide icons are locally bundled with retained ISC notices. The app uses five primary destinations, a 240px desktop sidebar, adaptive iPad navigation and a safe-area-aware iPhone bottom bar. Projects/Practice/Chapter Code share Memory; Settings and Listen are in More. Today foregrounds Scripture while Progress holds statistics. Reader text size, quiet mode, accessible per-word feedback, a sequential memory atlas, a persistent portalled audio player, native destructive-action confirmations and reduced-motion support carry the same design across existing features.

For GitHub Pages, build and preview with the same base: `npm run build -- --base=/Bible-App/` and `npm run preview -- --base=/Bible-App/ --port 4175`. Root development/testing commands remain unchanged.

## Current learning/storage update

See `LEARNING-UPDATE.md` for current workflows and the confirmed WebKit storage fix. `learning.ts` owns recitation alignment, independent verse/transition scoring, daily session planning and canonical chapter movement. `drafts.ts` serializes local draft writes and exposes save/error state. `media.ts` separates portable IndexedDB byte records from transient playback/display Blobs. New encrypted exports are version 2; the v1 cryptographic format remains importable. Reader preferences merge transactionally to avoid losing routine settings or reading position.
