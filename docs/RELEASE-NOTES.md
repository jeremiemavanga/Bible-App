# Version 1.0 implementation — validation report

Validated in the cloud workspace on October 29, 2026. The app is implemented and the local development/production workflows run. This is **not** a claim of physical Apple-device certification, a deployed website, or cleared distribution of third-party translations.

## Automatic first-letter practice revision

Implemented the user's preferred first-letter typing as the default daily flow, with automatic passage/exercise selection, decreasing cues, transactional saving, offline step/queue recovery, and optional full-word/manual methods. The existing visual style, content, histories and privacy/licensing rules remain. Guided lessons preserve prior independent mastery and accuracy; self-assessed initials and verified word scores are clearly distinguished. See `AUTOMATIC-PRACTICE.md`.

Local validation: **46 unit/domain/backup checks and 75 browser scenarios passed** across desktop, phone and tablet Chromium. Targeted automatic-practice scenarios were rerun after focus and scheduling refinements. Source-integrity verification, root and `/Bible-App/` production builds pass. The Pages-path smoke test verifies offline provisioning, one-tap first-letter entry and saved-input recovery after reload. Native WebKit and physical Apple-device verification remain pending; GitHub verification is still required before publishing.

## Scripture experience revision

Implemented the agreed reading, daily-rhythm and retention improvements. See `SCRIPTURE-EXPERIENCE.md` for behavior, history compatibility, self-assessed oral evidence and scheduling policy. Local validation: **36 unit/domain/backup checks and 57 browser scenarios passed** across desktop, phone and tablet Chromium. Strengthened multi-chapter context and session-completion accessibility checks were rerun on all three layouts after their final refinements. Production root and `/Bible-App/` builds pass; the Pages-path smoke test confirms offline reload, continuous reading, alias search and surrounding-chapter navigation. Native WebKit and physical Apple-device checks remain pending. GitHub workflow status could not be read here because the GitHub API returned Forbidden; the existing CI verification gate remains required before publishing.

## Previous learning and reading update

Local verification passed: **28 unit/domain/backup checks and 42 browser scenarios** on desktop, iPhone-size and iPad-size Chromium. The targeted 18-scenario improvements subset was rerun after the final save/reader safeguards. Production build and YAML formatting validation pass. Native WebKit remains pending GitHub Actions because its browser download is denied in this cloud instance. Pages deployment now calls full verification and will not publish until it passes.

Guided reviews-first daily sessions, bounded new material, per-verse word alignment independent of line breaks, actual hiding/reveal tracking, draft recovery, resumed chapter/text size, faster alias-aware reference search, and contextual passage-to-project/reflection actions are implemented. The phone home now surfaces Scripture before the calendar. See `LEARNING-UPDATE.md`.

The user-supplied GitHub snapshots confirmed native WebKit Blob/File preparation failures for both media imports. New storage and restores use typed bytes; existing Blob records remain readable. Original image/audio assertions are retained and an additional simulated storage-restriction regression covers media import, encrypted export and clean restoration. Local native WebKit remains unrun because download domains are denied; GitHub Actions must verify it.

Backup version 2 includes drafts and portable media, retains the same authenticated encryption/KDF strengths, and the app continues to import version 1. Existing local data is preserved; update other devices before transferring new-format backups.

## Previous paper-and-ink revision

The October 30 image reference supersedes the earlier forest/sage palette. Added a warm paper-and-ink system, oversized live local date, orange-today circular full-month calendar, and matching typography, controls and installation icons. Only actual review attempts mark practiced days. Five destinations, local records and all functional workflows are preserved. Calendar accessibility uses semantic labels instead of color-only status. Validation: 19 unit checks and 24 browser checks passed across desktop, phone and tablet Chromium layouts, including leap-year month layout and real-history-only markers. Accessibility and 160% text checks pass across all screens; physical Apple/Safari validation is still outstanding. The production build passes. See `PAPER-VISUAL-DIRECTION.md`.

## Previous visual-design revision

Applied the supplied `VISUAL-SPECIFICATION.md`: exact forest/ivory/sage tokens, five primary destinations, iPhone bottom navigation, adaptive iPad sidebar, a Scripture-led Today screen, separate Progress dashboard, locally bundled Lucide icons, system serif/sans fonts, 44px controls, reader sizing, sequential memory atlas, persistent visible audio controls, labelled word-by-word recall feedback, and explicit native confirmation for item removal. All original data identifiers and local-storage schemas are preserved.

Validation for this revision: **19 unit tests and 21 browser scenarios passed** across desktop, iPhone-size and iPad-size Chromium. Accessibility checks cover WCAG 2.2 rule tags, keyboard access and 160% text scaling across all destinations/tools. Browser tests also verify the exact five destinations, sage primary action, statistics removed from Today, reader sizing, quiet mode, and continuing visible audio after navigation. Production dependencies still report zero audit vulnerabilities. WebKit and physical Apple-device verification remain outstanding as described below.

A manual GitHub Pages workflow is included. The `/Bible-App/` production build has been checked locally for loading, service-worker provisioning, offline reload and KJV reference search. It has **not** been published to a public website by these local tests. Follow `GITHUB-PAGES.md` to select the GitHub Actions Pages source and run the deployment workflow.

## Original functional baseline checks

- Frozen `npm ci` installation replay, source-corpus SHA-256 verification and production TypeScript/Vite/PWA build. The precache contains the complete KJV corpus and app shell. Production dependencies: `npm audit --omit=dev` reported zero vulnerabilities.
- **18 Vitest checks**: all 66 books / 1,189 chapters / 31,102 verses, references/ranges, word-error normalization and order, fixed-clock six-stage lifelong scheduling, hint regressions, missed days, adaptive introductions, authenticated backups, fresh salt/nonce, wrong passwords, corruption, schema rejection, clean IndexedDB restoration and duplicate prevention.
- **18 Playwright checks**: six scenarios in each of desktop, iPhone-size and iPad-size **Chromium** configurations. These are emulated layouts, not Apple hardware or Safari.
- Browser checks include actual offline reload and navigation through every book; reference and topic search; typed recall and durable scheduled reviews; all six method selectors/cues; whole-chapter recall with hints and independently stored chapter/verse reviews, transition and reference scores; persisted visual cards; projects; journal export/clean-context encrypted restore; imported playable WAV audio, rate and repeat; authorized synthetic comparison-package import without changing the KJV practice target; keyboard navigation, absence of horizontal document overflow and automated WCAG A/AA checks across all eight screens.
- Browser request inspection found only same-origin app traffic in the checked workflows. No personal-data backend exists.

The comparison fixture is explicitly synthetic test text, **not** RVR1960 content. The silent test WAV is generated by the tests. No unauthorized third-party translation or narration is used to make tests pass.

Screenshots of the production UI are saved as `validated-chromium.png`, `validated-iphone-chromium.png` and `validated-ipad-chromium.png`. Test traces are retained on failures; final successful results are under the ignored `test-results/` directory.

## Remaining release prerequisites and limitations

- **WebKit not run**: Playwright browser installation was denied with `403 Domain forbidden` by the cloud egress policy. Chromium was already installed and used for local validation. Browser download-domain additions were saved in the environment draft: `cdn.playwright.dev`, `cdn.playwright.microsoft.com`, `playwright.download.prss.microsoft.com`, `storage.googleapis.com`. Saving the draft did not itself apply them. Apply the environment settings and install WebKit (plus required OS libraries) before running the WebKit project. CI is configured to install Chromium/WebKit and run all projects, but this CI workflow has not run remotely in this task.
- **Physical iPhone, iPad and Mac tests not run**. Installation, Safari codecs, background/lock-screen audio, OS storage eviction, VoiceOver, touch keyboard and system text scaling require the physical checklist in `APPLE-INSTALL.md`. Automated checks do not certify a screen reader or every device behavior.
- **No public HTTPS deployment**. `dist/` and the supplied ZIP are static hosting artifacts, not an installation URL. Host `dist/` at the origin root over HTTPS, then install through Safari. Cloud environment publication and app hosting are separate actions.
- **Copyrighted comparison packages not supplied**: RVR1960 and HSV need appropriate permissions. A Louis Segond digital source remains unbundled pending source verification. Local import UI is available for authorized packages. KJV core works independently. UK KJV distribution requires territorial clearance; see `DATA-LICENSES.md`.
- **No bundled narration**. The complete player works with locally imported, authorized recordings. Audio text/narration rights remain separate. No synthetic-voice rights are assumed.
- **Closed-app scheduled notifications are unavailable** in this offline/no-server architecture. Foreground prompts and user-imported Apple Calendar reminders are provided. Hourly file backup is conditional on File System Access support and runs only while the app is open with user permission; most Apple browsers require manual exports. These platform APIs have not been verified on physical devices here.
- **No account or automatic sync**. Transfer encrypted exports manually. Local IndexedDB is not encrypted at rest; device protection and verified backups are necessary. Download initiation is not proof of a retained backup. Password loss is unrecoverable.
- Very large mismatched recitations have a memory-safety bound. Book projects progress through chapter sections; a single comparison exceeding the bound asks for a smaller section instead of freezing the browser. Retention percentages are heuristics, not calibrated predictions.

## Reusable cloud setup

Saved `install_script` and `start_skill`, plus the additive browser-download domains, in the cloud environment draft. The installation commands were executed successfully in this instance. To activate the saved configuration/snapshot, review and save it in environment settings, then publish the environment. Publication and validation in a newly restored task have not been performed here.
