import './globals.css';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { getUser } from '../lib/auth';
import { q } from '../lib/db';
import { SITE } from '../lib/site';
import Nav from './Nav';
import UserMenu from './UserMenu';
const font = Plus_Jakarta_Sans({ subsets: ['latin'], display: 'swap' });
const desc = 'Pantau stok sparepart per gudang, input mutasi bulanan, approval koreksi, dan nilai persediaan dalam satu dashboard.';
export const metadata = {
  metadataBase: new URL(SITE),
  title: { default: 'Inventory Sparepart — Stok & Mutasi Gudang', template: '%s · Inventory Sparepart' },
  description: desc, applicationName: 'Inventory Sparepart',
  keywords: ['inventory sparepart', 'stok gudang', 'mutasi stok', 'nilai persediaan', 'price master'],
  openGraph: { type: 'website', locale: 'id_ID', siteName: 'Inventory Sparepart', title: 'Inventory Sparepart — Stok & Mutasi Gudang', description: desc },
  robots: { index: true, follow: true },
};
export const viewport = { themeColor: '#22c5cd', width: 'device-width', initialScale: 1 };
export default async function RootLayout({ children }) {
  const u = getUser();
  let pending = 0;
  if (u?.role === 'accounting') { try { pending = (await q("SELECT count(*)::int n FROM change_requests WHERE status='PENDING'"))[0].n; } catch {} }
  const items = u ? [
    { href: '/dashboard', label: 'Dashboard' }, { href: '/', label: 'Stok' },
    ...(u.role === 'gudang' ? [{ href: '/mutasi', label: 'Input Mutasi' }] : []),
    ...(u.role === 'accounting' ? [{ href: '/approval', label: 'Approval', badge: pending }, { href: '/rekon', label: 'Rekonsiliasi' }, { href: '/price', label: 'Price Master' }] : []),
  ] : [];
  return (
    <html lang="id"><body className={font.className}>
      <a className="skip" href="#isi">Lewati ke konten</a>
      <div className={u ? 'shell' : ''}>
        {u && (
          <aside>
            <header><b className="logo" role="img" aria-label="Inventory Sparepart">IS</b></header>
            <Nav items={items} />
          </aside>)}
        {u && <header className="topbar"><b className="tb-logo">Inventory Sparepart</b><UserMenu name={u.name} role={u.role === 'accounting' ? 'Accounting' : 'Gudang'} /></header>}
        <main id="isi">{children}</main>
      </div>
    </body></html>
  );
}
