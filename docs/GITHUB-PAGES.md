# Publish a test installation on GitHub Pages

The manual workflow `.github/workflows/deploy-pages.yml` builds the app at `/Bible-App/`, matching the GitHub project-site path. A root-path build will not work at that address. The workflow uploads **only** the static `dist/` directory. It never uploads IndexedDB, journal entries, projects, imported recordings, or backups. Hosting makes the app files available according to GitHub Pages visibility settings; personal data remains on each browser/device.

## First publication

1. Open https://github.com/jeremiemavanga/Bible-App and sign in as an administrator of the repository.
2. Open **Settings → Pages**. Under **Build and deployment**, set **Source** to **GitHub Actions**. Do not select a branch or a `/docs` folder. If Pages is unavailable, GitHub may require a different account plan for a private repository. Do not change repository visibility merely to bypass this; check your preferred hosting option first.
3. Open **Actions**. Enable workflows if GitHub asks. In the sidebar choose **Deploy app to GitHub Pages**.
4. Click **Run workflow**, select **main**, then confirm **Run workflow**.
5. Open the new run. Wait until **build** and **deploy** are green. An approval may appear if your repository has a protected `github-pages` environment; an authorized repository owner must approve it.
6. Open the URL shown in the deploy job/environment. For this repository's default Pages configuration it is https://jeremiemavanga.github.io/Bible-App/ . This address is expected, not proof of publication before the workflow succeeds. A custom domain, if configured, can change the address.
7. Open the site in Safari, wait for **Offline ready**, then install as described in `APPLE-INSTALL.md`. The very first load on each installed browser context requires connectivity.

## Quick test

- Bible: Genesis 1, then Revelation 22; search John 3:16.
- Practice: select a verse, choose Type from memory, enter an intentional omission and compare.
- Meditation: save a test reflection. Reload and confirm it remains.
- Settings: export an encrypted backup using a strong passphrase; save it in Files. Preview it and restore into a separate clean browser context/device.
- Install via Safari. Open the installed app once online, wait for Offline ready, disconnect from the network, close/reopen, and confirm reading/practice still work.

No background audio or device-notification result should be assumed until tested on the actual device. See `RELEASE-NOTES.md` for remaining checks and content restrictions.

## Subsequent updates

After pushing an update to `main`, repeat **Actions → Deploy app to GitHub Pages → Run workflow**. Deployment is intentionally manual. Existing installed apps show an update prompt after the new service worker is downloaded. Finish and save work before reloading. Keep a verified encrypted backup before testing updates.

## If publication fails

- No Pages settings: confirm repository administrator access and plan eligibility.
- “Get Pages site failed” or “Not Found”: confirm Source = GitHub Actions, then rerun the workflow.
- Permission/approval error: inspect the deploy job and the repository's Actions/environment restrictions; do not enter tokens or passwords into app source.
- Blank page/asset 404: use the workflow's `/Bible-App/` build and the trailing-slash URL, not a root-path ZIP build.
- The app works but personal notes are absent: each browser/installed-app context and device has separate local data. Transfer an encrypted backup manually; there is no automatic sync.
