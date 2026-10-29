# The Word Within

A private, offline-first Scripture memorization PWA built against the approved eight-stage specification. React + TypeScript + Vite, Dexie/IndexedDB, a precaching service worker, Web Crypto encrypted exports, and Vitest/Playwright checks. No accounts or automatic sync.

## Develop and verify

Requires Node.js 22.12+ (validated here with Node 24) and npm.

```sh
npm ci --cache /tmp/word-within-npm
node scripts/verify-data.mjs
npm run dev                  # interactive development, port 5173
npm test                     # domain, scheduler, backup and persistence checks
npm run build                # type-check + production PWA, output dist/
npm run preview -- --port 4173
```

Offline service-worker behavior must be checked against the production build, not the Vite dev server. In a second terminal:

```sh
# Use installed Playwright browsers by default, or the system executable:
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e -- --project=chromium
# To install/test WebKit when its download domains and Linux libraries are available:
PLAYWRIGHT_BROWSERS_PATH=/tmp/word-within-browsers npx playwright install webkit
PLAYWRIGHT_BROWSERS_PATH=/tmp/word-within-browsers npm run test:e2e -- --project=webkit
```

The test runner starts its own production preview. Unit tests also verify 66 books, 1,189 chapters and 31,102 verses. Browser tests exercise offline reload, actual recall grading and durable review state, anchors, journal, clean-context encrypted restoration, six methods, projects, audio, responsive layout and accessibility. See [release notes](docs/RELEASE-NOTES.md) for actual outcomes and outstanding device checks.

## Workflows

- **Today:** current Scripture, due reviews, retention estimate, verse/chapter/book progress, weak passages and a non-punitive practice calendar.
- **Bible:** all 66 KJV books, references/ranges, phrase and topic search, memorization-status filters, noncontiguous selection, quiet reading and local licensed comparison packages.
- **Projects:** primary and secondary chapter/book/passage/topic projects, sequential adaptive practice and whole-project recitation sections.
- **Practice:** read/repeat, cumulative memorization, progressive hiding, first letters, Chapter Code and typed recall; word errors, reference recall, transition scores, hints/self-assessment/difficulty and lifelong reviews.
- **Chapter Code:** chapter sections, locations, mental images, keywords, connections, themes, number cues and local image cards.
- **Meditation:** seven optional prompts, journal and exports, 16 curated topics plus work/discipline, custom collections and personal cross-references.
- **Listen:** authorized local recording imports, verse/chapter/book filters, playlists, rate/repeat and native audio / Media Session support.
- **Settings:** adjustable daily routine, foreground reminders and calendar export, persistent-storage request, encrypted backup preview/merge/replace, conditional open-app file automation and Apple installation guidance.

Read the [data and license register](docs/DATA-LICENSES.md), [backup format](docs/BACKUP.md), [Apple installation guide](docs/APPLE-INSTALL.md) and [engineering notes](docs/README.md). RVR1960/HSV, a verified Segond digital package, physical-device verification, and an HTTPS deployment remain external release prerequisites as applicable. KJV territorial rights require clearance for UK distribution.
