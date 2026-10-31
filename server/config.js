/**
 * Settings, from environment variables (or a .env file next to
 * package.json; see .env.example). Everything has a default that works
 * on localhost, so `npm start` runs with no setup.
 */
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { enabledProviders } from './oauth.js';

const env = process.env;
const root = fileURLToPath(new URL('..', import.meta.url));
const production = env.NODE_ENV === 'production';

export const config = {
  root,
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
  devLogin: env.DEV_LOGIN ? env.DEV_LOGIN === 'true' : !production,
  /** Create the example orgs on first start. */
  seedExamples: env.SEED_EXAMPLES ? env.SEED_EXAMPLES === 'true' : !production,
  superAdmin: {
    email: (env.SUPER_ADMIN_EMAIL || 'admin@localhost').toLowerCase(),
    name: env.SUPER_ADMIN_NAME || 'Platform admin',
    password: env.SUPER_ADMIN_PASSWORD || '',
  },
  /** Sign-in with Google, Facebook, Microsoft…: each switched on by its keys (see server/oauth.js). */
  providers: enabledProviders(env),
  sessionDays: Number(env.SESSION_DAYS) || 30,
  maxJsonMb: 15,
  /** The largest single upload (podcast audio), sent in 8 MB chunks. */
  maxUploadMb: Number(env.MAX_UPLOAD_MB) || 700,
  /** How much media each org can keep. */
  orgStorageMb: Number(env.ORG_STORAGE_MB) || 20480,
};

const portPart = (scheme) => ((scheme === 'https' && config.port === 443) || (scheme === 'http' && config.port === 80) || config.production ? '' : `:${config.port}`);
const scheme = () => (config.https ? 'https' : 'http');

/** The address of the platform's root site, or of a host on it. */
export const urlFor = (host = config.baseDomain, path = '/') => `${scheme()}://${host}${portPart(scheme())}${path}`;
export const orgHost = (slug) => `${slug}.${config.baseDomain}`;
