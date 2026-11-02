/**
 * Settings, from environment variables (or a .env file next to
 * package.json; see .env.example). Everything has a default that works
 * on localhost, so `npm start` runs with no setup.
 */
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { enabledProviders } from './oauth.js';

const env = process.env;
const root = fileURLToPath(new URL('..', import.meta.url));
const production = env.NODE_ENV === 'production';

export const config = {
  root,
  /** Dashi's version, from package.json: shown in the app and sent with support tickets. */
  version: JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version,
  production,
  port: Number(env.PORT) || 5173,
  /**
   * The platform's own domain. Orgs live on its subdomains:
   * riverbend.<baseDomain>. On localhost, browsers send *.localhost to
   * this machine, so riverbend.localhost:5173 works with no setup.
   */
  baseDomain: (env.BASE_DOMAIN || 'localhost').toLowerCase(),
  /** http on localhost; https everywhere else (behind the host's TLS). */
  https: env.HTTPS ? env.HTTPS === 'true' : production,
  dataDir: resolve(root, env.DATA_DIR || 'data'),
  /** Sign in as anyone from the sign-in page. Never on in production unless asked for. */
  devLogin: env.DEV_LOGIN ? env.DEV_LOGIN === 'true' : !production || env.STAGING === 'true',
  /** Create the example orgs on first start. */
  seedExamples: env.SEED_EXAMPLES ? env.SEED_EXAMPLES === 'true' : !production || env.STAGING === 'true',
  superAdmin: {
    email: (env.SUPER_ADMIN_EMAIL || 'admin@localhost').toLowerCase(),
    name: env.SUPER_ADMIN_NAME || 'Platform admin',
    password: env.SUPER_ADMIN_PASSWORD || '',
  },
  /** Sign-in with Google, Facebook, Microsoft…: each switched on by its keys (see server/oauth.js). */
  providers: enabledProviders(env),
  /** Where orgs' own domains should point (a CNAME); the platform's domain if not set. */
  dnsTarget: (env.DNS_TARGET || '').toLowerCase(),
  /** Anyone can sign up for a Free org from the platform's site. */
  openSignup: env.OPEN_SIGNUP ? env.OPEN_SIGNUP === 'true' : true,
  /** Behind a host's proxy (Fly.io, Render…): read the visitor's address from X-Forwarded-For. */
  trustProxy: env.TRUST_PROXY === 'true',
  /** Daily database snapshots kept in data/backups. */
  backupDays: Number(env.BACKUP_DAYS) || 14,
  sessionDays: Number(env.SESSION_DAYS) || 30,
  maxJsonMb: 15,
  /** The largest single upload (podcast audio), sent in 8 MB chunks. */
  maxUploadMb: Number(env.MAX_UPLOAD_MB) || 700,
  /** Email (server/mail.js). Without a key, messages go to the server log. */
  mail: {
    provider: (env.MAIL_PROVIDER || (env.MAIL_API_KEY ? 'postmark' : '')).toLowerCase(),
    apiKey: env.MAIL_API_KEY || '',
    from: env.MAIL_FROM || `Dashi <hello@${(env.BASE_DOMAIN || 'localhost').toLowerCase()}>`,
  },
  /** Where new support tickets are announced; the platform admin's email if not set. */
  supportEmail: (env.SUPPORT_EMAIL || env.SUPER_ADMIN_EMAIL || 'admin@localhost').toLowerCase(),
  quietMail: env.NODE_ENV === 'test',
  /**
   * A test server for people trying Dashi out: a banner on every page, test
   * sign-in allowed even in production mode, and (with STAGING_ACCESS_CODE)
   * a code to type before anything loads, so the public can't wander in.
   */
  staging: env.STAGING === 'true',
  stagingCode: env.STAGING_ACCESS_CODE || '',
  /** How much media each org can keep. */
  orgStorageMb: Number(env.ORG_STORAGE_MB) || 20480,
};

const portPart = (scheme) => ((scheme === 'https' && config.port === 443) || (scheme === 'http' && config.port === 80) || config.production ? '' : `:${config.port}`);
const scheme = () => (config.https ? 'https' : 'http');

/** The address of the platform's root site, or of a host on it. */
export const urlFor = (host = config.baseDomain, path = '/') => `${scheme()}://${host}${portPart(scheme())}${path}`;
export const orgHost = (slug) => `${slug}.${config.baseDomain}`;
