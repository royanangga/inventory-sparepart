import crypto from 'crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
const sign = (p) => crypto.createHmac('sha256', process.env.AUTH_SECRET || 'dev-secret').update(p).digest('base64url');
export const makeToken = (u) => { const p = Buffer.from(JSON.stringify({ ...u, exp: Date.now() + 12 * 3600e3 })).toString('base64url'); return p + '.' + sign(p); };
export function getUser() {
  const t = cookies().get('sess')?.value; if (!t) return null;
  const [p, s] = t.split('.'); if (!p || !s) return null;
  const a = Buffer.from(s), b = Buffer.from(sign(p));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const u = JSON.parse(Buffer.from(p, 'base64url').toString());
  return u.exp > Date.now() ? u : null;
}
export function requireUser(role) { const u = getUser(); if (!u) redirect('/login'); if (role && u.role !== role) redirect('/'); return u; }
export const hash = (pw) => { const s = crypto.randomBytes(16).toString('hex'); return s + ':' + crypto.scryptSync(pw, s, 32).toString('hex'); };
export function verify(pw, h) {
  const [s, x] = h.split(':'); const y = crypto.scryptSync(pw, s, 32); const xb = Buffer.from(x, 'hex');
  return xb.length === y.length && crypto.timingSafeEqual(xb, y);
}
