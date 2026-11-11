import { SITE } from '../lib/site';
export default function robots() {
  return { rules: [{ userAgent: '*', allow: ['/login'], disallow: ['/dashboard', '/mutasi', '/approval', '/price', '/api/'] }], sitemap: `${SITE}/sitemap.xml` };
}
