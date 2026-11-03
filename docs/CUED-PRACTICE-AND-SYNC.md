# Meaningful cued practice and optional device sync — 1.3.0

3 November 2026. These changes extend the original local-only v1 specification in response to the user's requests. Existing installations and local histories are retained.

## Recall the words, not the displayed initials

The supported learning sequence is now:

1. Read the full passage.
2. Rehearse by typing initials while reading the full wording. This is explicitly guided rehearsal.
3. With only initial cues visible, type the **full words**. Correct completed words appear in the flowing verse. Copying the displayed initials cannot complete the exercise.
4. Recall by typing first letters with upcoming words and initials hidden. Correct initials still reveal complete words. This preserves the user's preferred fast recall interaction.
5. Recall the book, chapter and verse with the address hidden, as in 1.2.0.

The full-word cue step accepts harmless case/punctuation differences. Space or Enter completes a word; a correct final word completes the passage without an extra space. Partial words are not graded as mistakes. Incorrect completed words and requested Help remain visible through subtle word difficulty colours and are recorded as assistance. Optional insights describe these as practice-word results rather than claiming all results came from initials.

Supported lessons do not certify full independent recall or increase memorized counts. Independent first-letter reviews retain the separate self-assessment of full wording. Optional full-word testing from memory remains available under Pause → More options. Reference reviews remain independent from wording reviews.

An older unfinished cue draft is upgraded by expanding its already accepted initials into the corresponding completed-word prefix. The remaining exercise requires full words. New drafts retain partially typed words, cue format and remaining queue across offline reload and encrypted backup transfer. Older backups remain importable; backups with the new cue format require 1.3.0 or newer.

## Optional encrypted progress sharing

GitHub Pages hosts the app; it cannot provide a personal progress database. The optional service in [sync-server](../sync-server/README.md) stores encrypted snapshots. **It is not activated merely by updating the app.** An operator needs to deploy the service to a Cloudflare account and configure its creation secret first. No service was provisioned or paid for by this code change.

After service setup, open Settings on the device that already has your progress. Export a backup, then choose **Sync across devices → Start syncing** and enter the service address and owner setup key. Keep the generated private connection code. On another updated device, choose **Connect this device**, paste that code, and choose **Connect and sync**.

The connection code grants read/write access and contains the encryption key. Treat it like a password and store it privately. There is no reset or recovery service. The owner setup key is only needed to create a space; it is excluded from connection codes and frontend builds. Connection credentials live in a separate device-local database table and are not included in ordinary backups.

Connected devices sync while the app is open and online, after local record changes and on reconnection. Offline practice always writes locally first. Closing the app may interrupt an upload; reopen it online and check Settings for **Up to date** before expecting another device to receive the latest change. Routine sync messages do not interrupt focused practice.

Foreground automatic pulls wait while you are typing or in focused practice, then resume when you leave the editor or pause practice. Switching away from the app attempts a final sync. Incoming drafts refresh mounted editors before later typing, while preserving newer or unsaved local edits.

Sync includes projects, attempts, schedules, manual marks, word difficulty evidence, reference progress, reflections, associations, collections, settings and practice drafts. Imported recordings, images and Bible translations remain local, preserving their licensing and explicit-transfer requirements. A receiving device may need those assets imported separately.

## Combining progress safely

The sync document uses causal versions and deletion tombstones. Devices pull, combine and conditionally upload against the server revision. A stale upload retries after merging rather than overwriting the other device. Review attempts retain stable IDs; combined histories rebuild wording and reference schedules independently. Existing manual marks and legacy summaries are preserved conservatively. Concurrent saved note/project edits retain saved-edit copies rather than silently discarding one version. Competing practice drafts choose one deterministic active draft; saved review attempts remain preserved.

**Disconnect this device** removes its sync connection while retaining local data and the cloud copy. **Delete synced copy** requires explicit confirmation and removes cloud ciphertext while retaining local data. Other connected devices cannot recreate that deleted space automatically. Sync propagates intentional record deletions, so keep independent encrypted backups as well.

A backup restore that replaces all device records requires disconnecting first, preventing a device-only replacement from deleting shared progress. Merge restore remains available while connected.

Local IndexedDB data is not encrypted at rest by the app. The sync payload uses AES-256-GCM with a fresh nonce, and authentication is bound to its random sync-space identifier. The service receives ciphertext and a separate bearer credential, never the decryption key. Hosting still exposes normal network metadata to its operator. The static app has no analytics, advertising, remote fonts or bundled third-party recordings.

The initial service bounds request bodies to 5 MiB; encrypted document plaintext is bounded to 3 MiB. Exceeding limits stops sync with a visible error and preserves local data. No history is truncated automatically. See the service instructions for deployment, exact allowed origins, costs/quotas and real-device acceptance checks.

## Verification

Validation results are recorded in [RELEASE-NOTES.md](RELEASE-NOTES.md). The service and app require a real deployed two-device acceptance check before relying on hosted sync. Native WebKit remains a GitHub verification gate, and physical Apple installation/keyboard checks remain separate from Chromium viewport tests.
