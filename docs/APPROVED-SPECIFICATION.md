# The Word Within — Approved Implementation Specification

Version 1.0 · October 29, 2026 · Engineering handoff

Project: The Word Within\
Scriptural foundation: Psalm 119:11 (KJV)\
Repository state: Empty; no application has been built or tested.\
Product decisions: Eight design stages approved, plus offline-only hosting for the initial release.

This is the authoritative implementation specification. The developer should use it to build the application without inventing product requirements or silently removing approved features.

## 1. Product objectives and non-negotiable requirements

The Word Within is a personal Scripture memorization application designed for accurate, lifelong retention of the Bible, biblical meditation, and everyday application.

The application must:

- Work on iPhone, iPad and Mac.
- Be an installable, responsive Progressive Web App (PWA), with a possible native Apple application later.
- Use the KJV as the primary memorization translation.
- Support full chapters, books, individual verses, verse ranges and topical collections.
- Work offline for all core functionality after installation and initial data provisioning.
- Store personal information locally, without a cloud account or automatic synchronization in v1.
- Support encrypted manual backup, export, import and restoration.
- Implement the complete approved feature scope, rather than delivering a visual-only prototype.

The developer may implement features in milestones, but the target deliverable is the complete integrated application.

## 2. Eight approved feature stages

### Stage 1 — Scripture memorization goals

Support eight core goals: memorizing complete chapters and books; memorizing Scripture by topic; remembering Scripture for life; meditating on and applying Scripture; testing recall; using the Chapter Code visual memory method; listening to Scripture anywhere; and following personalized memory plans.

The highest priority is lifelong accurate retention, not the number of verses learned.

### Stage 2 — Memorization methods

Implement six methods:

| Method                  | Required behavior                                             |
| ----------------------- | ------------------------------------------------------------- |
| Read and repeat         | Repeatedly display and rehearse a passage                     |
| Cumulative memorization | Learn verses sequentially and combine them                    |
| Progressive word hiding | Gradually hide more words until independent recall            |
| First-letter method     | Show first letters as recall cues                             |
| Chapter Code            | Associate Scripture with locations, images and memory anchors |
| Type from memory        | Compare typed recall against the selected KJV text            |

The engine must support exact-word checking, adaptive introduction of new material and targeted practice on weak verses. Listening is a separate audio feature, not a required listen-and-repeat memorization method.

### Stage 3 — Daily routine

Default to approximately 20 minutes per day, adjustable according to due reviews and available time. Support morning and evening sessions, reviews before new material, gentle carry-forward recovery after missed days, morning/evening reminders, optional occasional prompts and an extended Saturday session.

Meditation must be available within memorization practice and as a separate optional activity. Avoid punitive streaks or guilt-inducing language.

### Stage 4 — Lifelong retention engine

Combine adaptive spaced repetition with cumulative recitation. Track individual verses and complete passages/chapters separately, including verse-to-verse transitions.

Use these six mastery stages:

1. New
2. Familiar
3. Learning
4. Memorized
5. Established
6. Long-term retained

Grading combines automatic text comparison with user self-assessment. Track hint usage and difficulty, not merely whether the final answer was correct.

The dashboard must include long-term retention estimates, chapter/book completion, recitation accuracy, practice calendar, verses memorized and weakest passages. Time-spent metrics and achievement milestones are not required dashboard priorities.

Mastered chapters must remain in the lifelong review rotation.

### Stage 5 — Scripture library and translations

Implement hybrid traditional Bible navigation and memory-project navigation, covering the complete 66-book Protestant Bible.

Support a primary project alongside multiple secondary projects, adaptive sequential chapter progression, curated and custom topical collections, a minimal distraction-free reader, flexible passage selection including noncontiguous topical passages, and search by reference, words/phrases, biblical topic and memorization status.

Include all sixteen curated topics: holiness and sanctification; temptation and resisting sin; prayer and communion with God; faith and trusting God; obedience and God's commandments; wisdom and discernment; evangelism and the Great Commission; Christian character and humility; the Holy Spirit and spiritual life; Christology; trials and perseverance; worship and thanksgiving; ministry, preaching and leadership; apologetics; God's promises and faithfulness; and eternity and resurrection.

Translation requirements:

| Translation              | Role                                                            |
| ------------------------ | --------------------------------------------------------------- |
| King James Version       | Primary reading, memorization and exact-word grading            |
| Reina-Valera 1960        | High-priority one-tap Spanish comparison for bilingual ministry |
| Louis Segond             | Optional French comparison, using a legally suitable edition    |
| Herziene Statenvertaling | Optional Dutch comparison if licensed                           |

On iPhone, provide a simple translation switcher. On iPad and Mac, support side-by-side English/Spanish comparison. Changing the comparison translation must not silently change the KJV memorization target.

### Stage 6 — Chapter Code and whole-chapter recitation

Implement guided memory building with real or imaginary locations, organized into chapter sections containing verse anchors.

Support all six association types: mental images, location anchors, keywords and word cues, verse-to-verse connections, chapter outlines and themes, and verse-number associations.

Allow optional visual memory cards. Support progressive cumulative recitation, gradually combining sections into full chapters. When the learner gets stuck, provide progressive hints and record how much assistance was needed.

Test both verse order/transitions and references/verse numbers. Visual associations must aid recall without being presented as replacements for the biblical meaning.

### Stage 7 — Meditation and everyday recall

Meditation is free and unstructured. Provide these seven optional, not mandatory, prompts:

- What is the context?
- What does this reveal about God?
- What does the passage mean?
- How should I respond in obedience?
- How can I pray through this Scripture?
- How does this connect to other Scripture?
- How does this relate to Christ?

Support on-demand Scripture access and gentle reminders.

Provide quick-access situational collections for resisting temptation, prayer, wisdom and decisions, work and discipline, evangelism, preaching/teaching/ministry, and thanksgiving/worship.

Include an optional private reflection journal with easy export, curated and personal cross-references, and everyday recall testing in the Bible reference → recite Scripture direction.

### Stage 8 — Interface, devices and technical experience

The visual direction is contemplative dark: deep forest tones, warm light typography, quiet spacing and restrained accents. The home screen opens to Today's Scripture, showing the current passage, due reviews and Continue Practice.

Prioritize iPhone, iPad and Mac together. Build an installable PWA first, retaining the option for a native Apple application later.

Require local-first data storage, full core offline functionality, gentle intelligent notifications, a complete Scripture audio player and both backup automation where technically supported and manual encrypted exports.

The audio player should support verses, chapters, books, repeat, speed adjustment, background playback where supported and offline playback for lawfully available audio assets.

## 3. Final hosting and privacy decision

V1 is offline-only for personal data. There is no account, personal cloud database or automatic cross-device synchronization.

Use IndexedDB for local persistence. Static hosting over HTTPS is permissible for app installation and updates, but it must not receive personal notes, review histories or memory projects.

Implement password-protected encrypted backups using authenticated encryption, such as AES-256-GCM, with a suitable password-based key derivation method, unique salts and nonces, integrity validation and documented recovery limitations.

Provide safe import/restore with schema validation, backup preview and protection against accidental replacement. Users must be able to transfer an encrypted backup manually among their Apple devices. Do not describe this as automatic synchronization.

Design stable record identifiers and versioned schemas so encrypted sync can be added later without requiring a complete data migration.

Browser storage is not guaranteed to survive user deletion or operating-system eviction. Clearly warn users about backup status and verify restoration on clean installations. Do not promise unattended filesystem backups where browser restrictions prevent them.

## 4. Recommended architecture and data models

Use TypeScript, React, Vite, IndexedDB with Dexie, a service worker, modular domain logic, and Vitest/Playwright for automated testing. These are recommendations; any alternative must meet the same requirements.

Core entities should include `BibleBook`, `BibleVerse`, `Translation`, `MemoryProject`, `MemoryUnit`, `ReviewState`, `ReviewAttempt`, `MemoryAnchor`, `VisualAsset`, `Collection`, `CrossReference`, `Reflection`, `PracticeSession`, `NotificationPreference`, `AudioAsset` and `BackupManifest`.

Use canonical book/chapter/verse references plus translation identifiers. Keep review attempts as durable history. Track verse-level and chapter-level mastery independently. Ensure exports preserve identifiers and prevent duplicate reviews on restore.

The review scheduler must be deterministic under a fixed clock, independently testable and capable of handling missed days, hint-assisted recalls, regressions and lifelong chapter reviews.

For KJV accuracy grading, ignore harmless capitalization and punctuation differences while detecting genuine word omissions, substitutions, insertions and incorrect order. Test normalization against representative edge cases.

## 5. Licensing and intellectual-property requirements

Do not assume all Bible translations are public domain.

KJV: Select a verified digital edition and confirm applicable usage rights, including relevant territorial considerations.

RVR1960: Treat as copyrighted. Obtain appropriate permission or use an authorized integration before distributing the full text. Do not scrape or bundle an unlicensed copy.

Louis Segond: Prefer the historically public-domain 1910 edition, after verifying the specific digital source and applicable rights. Do not assume every edition bearing the Louis Segond name has the same licensing status.

HSV: Treat as copyrighted. Obtain permission or a suitable licensed integration before bundling or displaying the full text.

Audio: Text rights and narration rights are separate. Only distribute recordings or synthesized audio for which the necessary rights exist.

Implement translation and audio packages modularly. Missing third-party licenses must be documented, not circumvented with unauthorized content. Keep KJV core functionality independently operable.

## 6. Development and testing sequence

Implement in this order while preserving the full approved release scope: project foundation and KJV database; memorization and review engine; daily practice and dashboard; Chapter Code and whole-chapter recitation; meditation, topics and translation comparison; audio, encrypted backups and exports; then integrated offline, accessibility and Apple-device testing.

The release must pass acceptance tests demonstrating that:

- All 66 KJV books can be navigated and searched offline.
- All six memorization methods operate on actual Scripture.
- Exact-word grading detects genuine recall errors.
- Adaptive reviews, mastery stages and missed-day recovery behave correctly.
- Complete chapters can be tested with progressive hints.
- Chapter Code anchors and visual assets persist.
- Meditation notes and collections can be saved and exported.
- Audio controls work for available licensed content.
- Encrypted backup and clean-device restoration preserve personal data.
- Core features work with the network disconnected.
- Responsive navigation, input, installation and storage work on physical iPhone, iPad and Mac devices.
- Accessibility, keyboard interaction, text scaling and screen-reader labels are checked.

Platform limitation to verify: Offline-only PWAs may not reliably issue scheduled notifications while closed, and background audio/storage behavior differs across Apple platforms. Implement supported functionality, test it, and document any remaining limitation rather than claiming unsupported behavior.

## 7. Delivery requirements

The repository should contain actual application source code, dependency manifests, documented setup/build/test commands, a data-source and license register, automated tests, backup format documentation, and Apple-device installation instructions.

A feature is complete only when implemented, tested and usable—not merely represented by a button or mockup. Any blocked licensed content or platform-dependent behavior must be explicitly listed in the release notes.

Proceed with implementation using this specification as the approved baseline. No additional feature-selection rounds are required.