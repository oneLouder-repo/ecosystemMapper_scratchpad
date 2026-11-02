/** Dashi's version. The server reads package.json; the local prototype reads this. Keep them the same (a test checks). */
export const VERSION = '0.1.0-alpha.1';
export const STAGE = VERSION.includes('alpha') ? 'alpha' : VERSION.includes('beta') ? 'beta' : '';
