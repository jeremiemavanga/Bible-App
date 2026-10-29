# Data-source and license register

## Bundled KJV digital edition

- Source: https://github.com/aruljohn/Bible-kjv
- Pinned commit: `a9aa4e55afbb3e095f57e4b14cd1f22c5ee8d7c9`
- Digital collection: source README identifies all 66 Old and New Testament books, with each book provided as a JSON file.
- Source license: MIT, copyright © 2019 Arul John. Retained verbatim in `public/data/KJV-LICENSE.txt`, shipped and accessible from Settings. The complete text is converted only to compact canonical arrays; words are not rewritten. Source acquisition used HTTPS, and the packaged corpus has its SHA-256 and expected counts in `kjv-integrity.json`. Run `node scripts/verify-data.mjs` to verify.
- KJV textual rights: generally public domain outside the United Kingdom. The UK retains Crown rights / Royal Prerogative; the upstream MIT license does not waive these territorial rights. Consult Cambridge's official Bible permissions guidance before UK distribution: https://www.cambridge.org/bibles/about/rights-and-permissions. UK distribution is not represented as cleared by this project. Edition provenance and digital-source licensing are distinct from theological/textual certification; inspect source discrepancies before making critical textual changes.

The initially investigated Scrollmapper source was **not used**: its KJV package declared GPL despite the repository's MIT umbrella. No data from that package ships here.

## Not bundled / permission required

- Reina-Valera 1960: copyrighted. No scraped text, unauthorized package or remote API is included. Requires rights-holder permission or an authorized integration, which is not supplied in this task.
- Herziene Statenvertaling: copyrighted. No text bundled; appropriate license required.
- Louis Segond: the 1910 historical text may be public domain, but no particular digital source was verified for bundling in this task. Only authorized locally imported packages are accepted. Later editions are not assumed to be public domain.
- Narration: no audio is distributed. Users import authorized recordings and document narration rights separately from text rights. Test audio is a generated silent WAV containing no third-party recording.

## Other assets and dependencies

App installation icons are original geometric book artwork created for this project. Interface icons use Lucide React (ISC license, retained in the generated notices). System fonts only; no remote font or image services. Curated topic labels and reference mappings are original application data; verse text comes from the KJV package. Dependencies are recorded exactly in `package-lock.json`; `npm ci` respects package integrity checks. React/MIT, Dexie/Apache-2.0, Vite/MIT and Workbox/MIT licenses remain in their distributed packages. An aggregate dependency-license report is generated into `public/THIRD-PARTY-NOTICES.txt` and included in the offline build. No license for the user's proprietary application source is invented by this task.
