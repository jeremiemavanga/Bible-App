# Apple installation and physical-device acceptance

1. Build with `npm ci --cache /tmp/word-within-npm` and `npm run build`.
2. Serve only `dist/` at the root of a trusted HTTPS static site, with normal JavaScript, JSON and web-manifest MIME types. Never upload user backups, notes or IndexedDB exports as site assets. `npm run preview` is a local test server, not production hosting.
3. Open the HTTPS address in Safari. Wait for **Offline ready**. First provisioning includes the entire 66-book KJV corpus (approximately 4 MB). Imported personal media add storage separately.
4. iPhone/iPad: Share → Add to Home Screen → enable Open as Web App if shown → Add. Open the installed icon once online; installed Safari contexts may have separate storage. Import an encrypted backup into the installed context, not just the Safari tab.
5. Mac, Safari 17+: File → Add to Dock. Open the installed app and provision/import there.
6. Transfer `.wwbackup` files manually via Files/AirDrop or a destination you choose. The application itself does not synchronize devices.

## Required checks on each physical device (not completed in Linux)

- Open all 66 book selectors, search and read passages after Airplane Mode/network disconnection; close and reopen the installed app offline.
- Use all six practice methods, type an intentional omission, verify grading, save reviews and reopen to verify persistence.
- Complete a whole chapter with progressive hints and verify separate verse/chapter records and next due dates.
- Save a visual memory card, a collection and a journal reflection; restore an encrypted backup into a fresh installed context and compare them.
- Import authorized audio; test play/pause, rate, playlist/repeat, lock-screen controls and background playback. Codec, silent-mode and OS suspension behavior can differ.
- Test portrait/landscape, iPad split view, Mac resizing and keyboard-only operation; confirm large text and VoiceOver labels/focus order.
- Test foreground reminders, deny permission gracefully, and import `.ics` calendar reminders. No push subscription or server exists; scheduled closed-app notifications are not promised.
- Verify storage persistence and communicate eviction risks. Repeat restore after intentionally deleting app data in a safe test context.

No public HTTPS site has been deployed by this task. Choose your static host for installation; environment publication and PWA web hosting are separate actions. UK distribution also needs territorial KJV rights clearance.
