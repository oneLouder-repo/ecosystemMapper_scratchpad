# Running Dashi

The platform is one Node app with no dependencies to install. Its database is a single SQLite file, and uploads are files on disk, both in the `data/` folder. It needs **Node 22.13 or newer**.

## On your own computer

```
git clone https://github.com/oneLouder-repo/ecosystemMapper_scratchpad.git
cd ecosystemMapper_scratchpad
npm start
```

The first start creates `data/` and adds a test platform of six made-up organisations, one or more on each plan, each with people and portraits, a logo, ecosystem maps, strategic plans, dashboards, podcasts, public sites and a document library (lorem ipsum PDFs, Word, OpenDocument, Excel and CSV files, Dashi docs, references and annotated bibliographies). Then open these:

| Address | What it is |
| --- | --- |
| http://localhost:5173 | The platform's own site: the sales pages, sign-up, and (signed in as the platform admin) the organisations, plans and requests. |
| http://example.localhost:5173 | Example STEM Outreach Network (Custom, 55 people) |
| http://northshore.localhost:5173 | Northshore Housing Coalition (Custom, 40 people, a custom domain waiting for DNS) |
| http://coastal.localhost:5173 | Coastal Climate Research Alliance (Custom, 28 people, three bibliographies) |
| http://riverbend.localhost:5173 | Riverbend Community Food Hub (Standard, 18 people) |
| http://prairie.localhost:5173 | Prairie Youth Arts Collective (Basic, 12 people) |
| http://lakeside.localhost:5173 | Lakeside Seniors Network (Free, 5 people) |

Visitors to an org's address see its public site; members who sign in get its dashboard.

Browsers send any `*.localhost` address to your own computer, so subdomains work with no setup. Chrome, Edge and Firefox do this; Safari may not, so use one of the others for testing.

**Test sign-in.** Locally, the sign-in page lists everyone, so you can be the platform admin or any staff member with one click. Once you're signed in as the platform admin, the menu under your picture has **View as**, which shows the platform exactly as that person sees it.

To start again from scratch, stop the server and delete the `data/` folder. `npm run dev` restarts the server whenever server code changes.

## Settings

Copy `.env.example` to `.env` and change what you need. The ones that matter on a live server:

- `BASE_DOMAIN`: your platform's domain, for example `orgtoolbox.ca`. Orgs then live at `riverbend.orgtoolbox.ca`.
- `NODE_ENV=production`: secure cookies, no test sign-in, and no example orgs.
- `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD`: you. If you set no password, the first start prints one, once.
- `GOOGLE_CLIENT_ID`, `FACEBOOK_APP_ID` and the like: sign-in with other accounts (see below).
- `TRUST_PROXY=true`: when a host's proxy or Caddy sits in front (set for you in the Docker image).
- `DATA_DIR`: where the database, backups and uploads live. Put it on a disk that is backed up.
- `OPEN_SIGNUP`: whether anyone can sign up for a Free org on the platform's site (on unless set to `false`).
- `DNS_TARGET`: the name orgs on the Custom plan point their own domain at with a CNAME, such as `sites.dashi.ca`. Without it, they point at `BASE_DOMAIN`.
- `FLY_API_TOKEN` and `FLY_APP_NAME`: on Fly.io, the platform asks for a certificate for each custom domain as soon as its DNS checks out.

## Going live

Two ways, both with the files in this repository. Either way, you need a domain (say `dashi.ca`) where orgs get addresses like `riverbend.dashi.ca`.

### Option A: Fly.io (recommended, least to look after)

Fly runs the container for you in Toronto (`yyz`). It also:
- gives the app a disk, and takes daily snapshots of it;
- restarts the app if it stops;
- issues the HTTPS certificates.

Expect roughly US$5 to $10 a month for one small machine and a 10 GB disk. Check their current prices.

1. Install the [flyctl](https://fly.io/docs/flyctl/install/) tool and sign in with `fly auth login`.
2. From this folder:
   ```
   fly launch --no-deploy --copy-config --name dashi-yourname
   fly volumes create dashi_data --region yyz --size 10
   fly secrets set BASE_DOMAIN=dashi.ca SUPER_ADMIN_EMAIL=you@dashi.ca SUPER_ADMIN_PASSWORD='a long passphrase'
   fly deploy
   ```
3. **Domain.** Run `fly ips list`. At your domain registrar, add `A` and `AAAA` records for both `dashi.ca` and `*.dashi.ca`, all pointing at those addresses.
4. **Certificates.** Run `fly certs add dashi.ca` and `fly certs add "*.dashi.ca"`. For the wildcard, Fly shows a `CNAME` record for `_acme-challenge.dashi.ca`; add it at your registrar. `fly certs show "*.dashi.ca"` says when the certificate is ready.
5. Open `https://dashi.ca`, sign in, and add your first organisation.

To update after that, run `fly deploy`. The server finishes the requests it is handling before it stops, and the disk keeps everything.

### Option B: your own server, with Docker

On any VPS with Docker installed (DigitalOcean Toronto, Koumbit and so on):

1. Point `dashi.ca` and `*.dashi.ca` at the server's IP address (two `A` records).
2. `cp .env.example .env`, then set `NODE_ENV=production`, `BASE_DOMAIN`, `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD`.
3. `docker compose -f deploy/compose.yaml up -d`

[Caddy](https://caddyserver.com) sits in front and gets a free certificate for each org's address the first time someone visits it. Before it does, it checks with Dashi that the address belongs to one of its orgs. So you don't need a wildcard certificate or a DNS plugin. To update, run `git pull`, then `docker compose -f deploy/compose.yaml up -d --build`.

Without Docker, the steps are the same as on your own computer:
- run `npm start` with the settings in `.env`;
- keep it running with systemd or pm2;
- put Caddy or nginx in front for HTTPS, and set `TRUST_PROXY=true`.

### Backups

- **Database.** The server takes a snapshot of the database every day and keeps two weeks of them in `data/backups/` (set `BACKUP_DAYS` to change that). The platform admin can also take one at any time from **Platform admin → Security audit → Back up now**, or with `npm run backup`.
- **Audio and the disk.** On Fly, volume snapshots cover everything, including uploaded audio. On your own server, copy `data/` somewhere else every night, for example with `rclone` to an object store.
- **Restore.** Stop the server, copy a snapshot over `data/toolbox.db`, and start it again.

### The security audit

**Platform admin → Security audit** runs a set of checks on the live platform:
- **Settings:** production mode, HTTPS, and test sign-in turned off.
- **Stored data:** how passwords and sign-in tokens are stored, and that no account tokens are kept.
- **Documents:** any document holding something like a password, an API key, a card number or a social insurance number. It names the document, never the value.
- **Public content:** what visitors can load, and that no staff email addresses leak into it.
- **Running:** backups, disk space, and the Node version.

For the same checks in the terminal, run `npm run audit`, or on Fly, `fly ssh console -C "node server/audit-cli.js"`. It exits with an error when something fails, so a deploy script can stop on it.

What is protected, and how:
- **Passwords** are salted scrypt hashes.
- **Session cookies** are HttpOnly, SameSite=Lax, and Secure on HTTPS. The database holds only a SHA-256 of each session and one-time token, so a copy of it can't be used to sign in.
- **Sign-in guessing** is limited to 20 tries per address and 10 per account every 15 minutes.
- **Pages** are sent with a Content Security Policy (scripts only from Dashi itself), HSTS, and frame and referrer protection.
- **Other sites' forms** can't save anything, because every change needs a header that only Dashi's own pages send.
- **Visitors** get only what each org has published. Drafts, maps and staff details stay on the server.

### Sign-in with Google, Facebook or Microsoft

Each provider is switched on by setting its two keys. Signing in doesn't create an account: the person's email has to be on an org's staff list (Organisation → People) first. Each provider sends people back to the root domain, and the server then passes the sign-in to the org's own address with a one-time token. You can also give anyone a password on the platform admin page.

**Google.**
1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an **OAuth client ID** of type "Web application".
2. Add the redirect URI `https://dashi.ca/auth/google/callback`.
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

**Facebook.**
1. At [developers.facebook.com](https://developers.facebook.com/apps), create an app that uses Facebook Login.
2. In the Facebook Login settings, add the valid OAuth redirect URI `https://dashi.ca/auth/facebook/callback`.
3. Under App settings → Basic, fill in the privacy policy URL and the app domain (`dashi.ca`). Then switch the app to **Live**.
4. Set `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` (on Fly, with `fly secrets set`).

Facebook only shares an email address the person has confirmed. Someone who signed up to Facebook with only a phone number can't sign in this way, so give them a password instead.

**Microsoft (ready when you want it).**
1. In the [Azure portal](https://portal.azure.com), go to App registrations and register an app for "Accounts in any organizational directory and personal Microsoft accounts".
2. Add the web redirect URI `https://dashi.ca/auth/microsoft/callback`, and create a client secret.
3. Set `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET`. The button then appears on the sign-in page.

For local testing, add the same paths on `http://localhost:5173` as extra redirect URIs.

### Hosts in Canada

These are a starting point; check current prices and terms before you choose:

- [Koumbit](https://www.koumbit.org) (Montréal): a nonprofit that hosts for community groups, and offers virtual servers.
- [CanTrust Hosting Co-op](https://bcca.coop/member-highlight-cantrust-hosting-co-op/) (BC): a hosting co-operative. Ask whether they offer a VPS that can run Node.
- [DigitalOcean](https://www.digitalocean.com/impact/nonprofits): a mainstream host with a Toronto data centre and a nonprofit credit programme. A $6 to $12 a month droplet plus Caddy is plenty to start.
- [Fly.io](https://fly.io/docs/reference/regions/): runs the app for you, with a Toronto region (`yyz`). Give it a volume for `data/`.
- In the EU, [Greenhost](https://greenhost.net) (Amsterdam) focuses on civil society.

### Custom domains

Orgs on the Custom plan can use their own address, such as `www.northshorehousing.org`, and manage its DNS themselves:

1. An org admin adds the domain under **Organisation → Domain**. Dashi shows two records to add at their DNS provider: a TXT record (`_dashi.<domain>`) that proves they own it, and a CNAME to `DNS_TARGET`. A bare domain with no `www` uses an A record instead, and the page says so.
2. They press **Check now**. Dashi looks the records up itself and says which one is missing or wrong. Once both are right, the domain is live and can be made the main address; the subdomain keeps working.
3. The certificate: on Fly.io with `FLY_API_TOKEN` set, Dashi asks for it. With Caddy (Option B), the Caddyfile's on-demand TLS asks `/tls-ask` first, and only verified domains get one.

The platform admin sees each org's domains and their state on the admin page, and can switch one on without the DNS check.

### Document library

Uploaded documents are checked by their first bytes as well as their name, so a web page renamed `.pdf` is refused. PDFs, images, audio and plain text open in the browser; everything else downloads. The doc editor is [Toast UI Editor](https://ui.toast.com/tui-editor) 3.2.2 (MIT), kept in `vendor/toastui/` so the site loads no scripts from elsewhere. Exports to PDF, Word, OpenDocument, HTML and Markdown are made in the browser by `src/core/`.

## Later

- **Billing**: each org has a `plan` (free, basic, standard, custom), set on the platform admin page. Payments, for example through Stripe, can hook in there.
- **More than one server**: SQLite suits one server, which covers many small orgs. If the platform outgrows it, the database layer in `server/db.js` and `server/app.js` is the part to move to Postgres.
