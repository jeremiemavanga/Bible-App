# Daily learning, reading and recovery update

This update keeps the approved paper-and-ink direction and all local-first privacy/content restrictions.

## Memorization

Today and project Adaptive Practice now launch an ordered session: due verse/passage/chapter reviews first, followed by previously unseen material within the daily introduction budget. Mastered chapters remain independent review items. Saving a review leads to Next Passage / Finish Session and a quiet completion screen. Reopening the daily plan rebuilds from durable history rather than counting the same new introductions twice.

Practice has Study, Recall and Review states. Hide Scripture actually removes the target text; showing it again records assistance. Whole-passage word alignment assigns errors to individual verses even if the learner types a paragraph, wraps lines, or omits an entire verse. Transition checks use the same alignment, not a loose phrase search. Feedback shows each verse's accuracy and offers targeted practice of weak verses. A saved attempt cannot be submitted again accidentally through Compare.

## Local recovery

Practice drafts save on edits to IndexedDB, including passage, method, recall text, reference input, hint count, cumulative step/section, hiding percentage and study/recall state. Reflection drafts are private, separate from published journal entries, and recoverable from Today. The Saved message appears after the database write completes. As with all browser storage, abrupt interruption before a pending write commits, quota failures, deletion and OS eviction are possible; copy writing if a draft error appears and keep verified backups.

The IndexedDB database and existing record identifiers are unchanged. New drafts use a new record kind in the existing typed record store; existing notes, reviews, projects and media are not reset or migrated destructively.

## Reader and interface

Previous/Next chapter crosses canonical book boundaries and stops at Genesis/Revelation. Chapter and reading size resume locally. Search has a memoized text index, common aliases (e.g. `Jn3:16`, `Psalm119:11`) and cross-chapter ranges. Verse selections have a contextual practice/reflection bar, and selected references can become a memory project directly from the reader. A focused native dialog keeps project creation concise. The phone home places Scripture and Continue Practice before the calendar while retaining the reference's oversized date, ink typography, paper background and orange marker.

## WebKit media failure

The supplied GitHub error snapshots confirmed `UnknownError: Error preparing Blob/File data to be stored in object store` for image and audio imports. Both previously stored uploaded File objects directly. New media stores `{bytes: Uint8Array, type: MIME}` in IndexedDB and creates temporary Blob URLs for display/playback. Existing Blob records remain readable. Encrypted restore uses the same byte representation so it does not reintroduce file-backed Blob storage. Native audio retains rate, repeat, scrubbing and a persistent player, with an explicit user-initiated Play control and a visible decoding error.

The original media assertions remain. A regression scenario rejects any Blob/File written to IndexedDB, then imports real image/audio files, exports an encrypted backup and restores both into a clean browser context. This tests the failing storage restriction; it does not substitute for a native WebKit run. Local WebKit installation is still blocked by cloud egress policy. GitHub Actions must verify native WebKit after the push.

## Backup compatibility

New exports use backup/encryption envelope version 2 with authenticated data `word-within:2`. Encryption remains AES-256-GCM with PBKDF2-SHA256 (600,000 iterations), fresh 16-byte salts and fresh 12-byte nonces. Version 2 includes unfinished drafts and portable media. The app still decrypts and validates version 1 using its original `word-within:1` authenticated data. Tests exercise the exact old cryptographic format, corruption/wrong-password rejection and clean restoration.

Update the app on the receiving device before restoring a version 2 export; older releases correctly reject newer formats. Keep older backups until a new backup has been verified. Manual transfer is still not synchronization. No account, personal-data backend, analytics or additional translation/narration content is added.
