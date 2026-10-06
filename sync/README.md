# Clanki sync worker

A Cloudflare Worker with a D1 database that the app syncs with (Settings → Sync). One endpoint,
`POST /sync`, protected by a shared key. The protocol and merge rule are in `src/protocol.ts`.

Deploying is manual, from this folder (not part of the GitHub Pages workflow):

```sh
npx wrangler@4 deploy
```

## First-time setup

```sh
npx wrangler@4 login
npx wrangler@4 d1 create clanki-sync              # put the database_id into wrangler.toml
npx wrangler@4 d1 execute clanki-sync --remote --file schema.sql
npx wrangler@4 secret put SYNC_KEY                 # a long random key; the same key links each device
npx wrangler@4 deploy                              # prints the URL; SYNC_URL in src/lib/syncRunner.svelte.ts
```

## Local testing

```sh
printf 'SYNC_KEY=local-test-key\n' > .dev.vars
npx wrangler@4 d1 execute clanki-sync --local --file schema.sql
npx wrangler@4 dev --local --port 8787
# in the repo root, point a dev build at it:
VITE_SYNC_URL=http://127.0.0.1:8787/sync npx vite
```

`localhost` and `127.0.0.1` keep separate browser databases, so two tabs act as two devices.
