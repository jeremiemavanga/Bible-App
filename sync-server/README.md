# Private sync service

This optional Cloudflare Worker stores encrypted progress snapshots for The Word Within. GitHub Pages continues to host the app. Devices keep their offline database and share a private connection code to use the same sync space.

Nothing in this directory has been deployed automatically. An operator must set up a Cloudflare account and deploy the service once. An enterprise account is not required. Cloudflare's available plans and service limits determine hosting cost; this code does not purchase a plan or configure billing.

## Set up the service once

Use a terminal with Node.js 22.12 or newer and this repository checked out. Run these commands from `Bible-App/sync-server`:

```sh
npx wrangler@4 login
npx wrangler@4 deploy
```

Follow Cloudflare's account and Workers subdomain prompts if this is your first Worker. The configuration creates the `VAULTS` Durable Object binding using SQLite storage. The initial deployment fails closed for sync-space creation until the setup secret is configured.

Generate a random setup key:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Save that 43-character value in your password manager. Then run:

```sh
npx wrangler@4 secret put SYNC_SETUP_KEY
```

Paste the generated value when Wrangler prompts for the secret. The setup key allows creation of new sync spaces. It is only needed when setting up the first device; devices joining an existing space use their private connection code instead.

Keep the Worker address shown by Wrangler, for example `https://word-within-sync.your-subdomain.workers.dev`. Use that address without an added `/v1` or `/Bible-App` path.

Never put the setup key in source files, GitHub repository variables, a `VITE_` variable, or the app's connection code. Only the public service address may be included in a frontend build.

## Connect your devices

On the device that already has your progress, export an encrypted backup first. In the updated app, open **More → Settings → Sync across devices** and start syncing. Enter the service address and setup key, then choose **Create sync space**.

Keep the resulting private connection code safely. On each other device, use **Connect this device**, paste that code, and choose **Connect and sync**. The code contains the encryption key and read/write credential, so anyone who has it can access that sync space. The server cannot recover a lost connection code.

Connected devices sync while the app is open and online. Offline changes stay on the device until it reconnects. Imported audio, visual files and translated Bible packages remain local; their licensing and file-transfer requirements are unchanged.

Disconnecting a device retains its local progress and the cloud copy. **Delete synced copy** removes the service's current encrypted snapshot and disconnects the requesting device while retaining its local progress. Other devices can no longer access that deleted space. A minimal `retired: true` marker remains for that random space identifier; it contains no ciphertext, credential hash or personal records and prevents a stale device from recreating a space you deleted. Creating another space uses a fresh random identifier.

## App configuration

The normal production origin is configured in `wrangler.jsonc`:

```json
{ "ALLOWED_ORIGINS": "https://jeremiemavanga.github.io" }
```

This is an origin, so it has no `/Bible-App/` path. If hosting the app elsewhere, replace or extend the comma-separated exact-origin list and deploy again. Do not use `*`. Requests without an allowed `Origin`, including command-line requests that omit the header, are rejected.

The app can accept the address during setup. A frontend build may alternatively supply the public default address:

```sh
VITE_SYNC_URL=https://word-within-sync.your-subdomain.workers.dev npm run build -- --base=/Bible-App/
```

Run that build command from the repository root. Do not define a `VITE_SYNC_SETUP_KEY` or another frontend secret. The application Content Security Policy must allow connections to the configured service origin; verify this when changing hosting domains.

## Local development

Copy `.dev.vars.example` to `.dev.vars` inside this directory and replace its placeholder with a generated setup key. Both local secret files and Wrangler state are ignored by Git. Run:

```sh
npx wrangler@4 dev --port 8787
```

The example allows the explicit local app origins used by Vite. Use `http://127.0.0.1:8787` as the local service address. Local development data is separate from production.

## Protocol and privacy

The API is `/v1/vaults/:id`, where `id` is a random 43-character base64url identifier. Every operation requires the space's independent bearer credential. Creation also requires the owner setup key.

| Request  | Input                                            | Result                                                                    |
| -------- | ------------------------------------------------ | ------------------------------------------------------------------------- |
| `POST`   | `Authorization`, `X-Setup-Key`, JSON `{payload}` | Creates revision 1; existing spaces return 409; retired spaces return 410 |
| `GET`    | `Authorization`                                  | Returns `{revision,payload}` and an `ETag`                                |
| `PUT`    | `Authorization`, `If-Match`, JSON `{payload}`    | Writes the next revision only if the expected revision matches            |
| `DELETE` | `Authorization`, `If-Match`                      | Removes the matching encrypted snapshot                                   |

The payload is encrypted on the device. The service stores ciphertext, a SHA-256 credential digest, and bounded snapshot metadata; it receives no decryption key. HTTP requests still carry the authentication credential and normal connection metadata to the hosting provider. Worker observability is disabled, and code does not log requests, URLs, secrets or payloads.

Bodies are limited to 5 MiB while being streamed. Storage uses 60 KiB chunks inside one transaction to respect Durable Object value limits. Matching revisions prevent one device from silently overwriting another device's newer upload; clients must merge and retry after a 409 response. A failed multi-chunk write rolls back atomically.

The setup key prevents unauthenticated users from creating stored spaces. Keep it private and protect the hosting account. It can be changed using the same `wrangler secret put` command without changing credentials for existing spaces.

## Verify before activating

From the repository root:

```sh
npx vitest run tests/sync-server.test.ts
npx tsc -p sync-server/tsconfig.json
```

These tests cover origin checks, creation secret, authentication, revision conflicts, chunk limits and rollback, request bounds, and cloud-copy deletion. They use an in-memory transactional storage implementation. A successful local test run does not certify a deployed Cloudflare service; verify a real two-device connection after deployment.
