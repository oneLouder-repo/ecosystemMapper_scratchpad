# Running Org Toolbox

The platform is one Node app with no dependencies to install. Its database is a single SQLite file, and uploads are files on disk, both in the `data/` folder. It needs **Node 22.13 or newer**.

## On your own computer

```
git clone https://github.com/oneLouder-repo/ecosystemMapper_scratchpad.git
cd ecosystemMapper_scratchpad
npm start
```

The first start creates `data/` and adds the two example organisations. Then open these:

| Address | What it is |
| --- | --- |
| http://localhost:5173 | The platform's own site. Sign in as the platform admin to add and manage organisations. |
| http://example.localhost:5173 | The Example STEM Outreach Network. Visitors see its public site; members who sign in get its dashboard. |
| http://riverbend.localhost:5173 | Riverbend Community Food Hub |

Browsers send any `*.localhost` address to your own computer, so subdomains work with no setup. Chrome, Edge and Firefox do this; Safari may not, so use one of the others for testing.

**Test sign-in.** Locally, the sign-in page lists everyone, so you can be the platform admin or any staff member with one click. Once you're signed in as the platform admin, the menu under your picture has **View as**, which shows the platform exactly as that person sees it.

To start again from scratch, stop the server and delete the `data/` folder. `npm run dev` restarts the server whenever server code changes.

## Settings

Copy `.env.example` to `.env` and change what you need. The ones that matter on a live server:

- `BASE_DOMAIN`: your platform's domain, for example `orgtoolbox.ca`. Orgs then live at `riverbend.orgtoolbox.ca`.
- `NODE_ENV=production`: secure cookies, no test sign-in, and no example orgs.
- `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD`: you. If you set no password, the first start prints one, once.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: Google sign-in (see below).
- `DATA_DIR`: where the database and uploads live. Put it on a disk that is backed up.

## On a host

Any host that runs a long-lived Node process and keeps files on disk will work. Steps:

1. **Domain and DNS.** Point both `orgtoolbox.ca` and the wildcard `*.orgtoolbox.ca` at the server.
2. **HTTPS.** You need a certificate that covers the wildcard. The simplest way is [Caddy](https://caddyserver.com) in front of Node. It gets free certificates on its own; a wildcard needs its DNS-challenge plugin for your DNS provider. Platforms like Fly.io and Render can issue wildcard certificates for you instead.
3. **Run it.** Set the environment variables, then `npm start`, kept running by systemd, pm2, or the platform itself.
4. **Back up** the `data/` folder every day. Copying it while the server runs is safe enough at this size, or use `sqlite3 data/toolbox.db ".backup backup.db"`.

Example Caddyfile, if you run your own server:

```
orgtoolbox.ca, *.orgtoolbox.ca {
  tls { dns <your-dns-provider> {env.DNS_API_TOKEN} }
  reverse_proxy localhost:5173
}
```

### Google sign-in

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an **OAuth client ID** of type "Web application".
2. Add the authorised redirect URI `https://orgtoolbox.ca/auth/google/callback`. For local testing, also add `http://localhost:5173/auth/google/callback`.
3. Put the ID and secret in `.env`.

Google only ever returns to the root domain. The server then passes the sign-in to the org's own address with a one-time token. A person can sign in with Google once their email is on an org's staff list, which an org admin sets in Organisation → People. You can also set a password for anyone on the platform admin page.

### Hosts in Canada

These are a starting point; check current prices and terms before you choose:

- [Koumbit](https://www.koumbit.org) (Montréal): a nonprofit that hosts for community groups, and offers virtual servers.
- [CanTrust Hosting Co-op](https://bcca.coop/member-highlight-cantrust-hosting-co-op/) (BC): a hosting co-operative. Ask whether they offer a VPS that can run Node.
- [DigitalOcean](https://www.digitalocean.com/impact/nonprofits): a mainstream host with a Toronto data centre and a nonprofit credit programme. A $6 to $12 a month droplet plus Caddy is plenty to start.
- [Fly.io](https://fly.io/docs/reference/regions/): runs the app for you, with a Toronto region (`yyz`). Give it a volume for `data/`.
- In the EU, [Greenhost](https://greenhost.net) (Amsterdam) focuses on civil society.

## Later

- **Custom domains** (`riverbend.org`): the server already looks up any host name in its `domains` table before trying subdomains. Adding one means a row in that table plus a certificate for that name; nothing else in the code changes.
- **Billing**: each org has a `plan` (free, basic, standard, custom), set on the platform admin page. Payments, for example through Stripe, can hook in there.
- **More than one server**: SQLite suits one server, which covers many small orgs. If the platform outgrows it, the database layer in `server/db.js` and `server/app.js` is the part to move to Postgres.
