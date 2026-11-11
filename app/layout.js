import './globals.css';
import Link from 'next/link';
import { getUser } from '../lib/auth';
import { logout } from '../lib/actions';
import { q } from '../lib/db';
export const metadata = { title: 'Inventory Sparepart' };
export default async function RootLayout({ children }) {
  const u = getUser();
  let pending = 0;
  if (u?.role === 'accounting') { try { pending = (await q("SELECT count(*)::int n FROM change_requests WHERE status='PENDING'"))[0].n; } catch {} }
  return (
    <html lang="id"><body>
      {u && (
        <header>
          <b>Inventory Sparepart</b>
          <nav>
            <Link href="/">Stok</Link>
            {u.role === 'gudang' && <Link href="/mutasi">Input Mutasi</Link>}
            {u.role === 'accounting' && <Link href="/approval">Approval{pending > 0 ? ` (${pending})` : ''}</Link>}
            {u.role === 'accounting' && <Link href="/price">Price Master</Link>}
          </nav>
          <form action={logout}><span>{u.name}</span><button>Keluar</button></form>
        </header>
      )}
      <main>{children}</main>
    </body></html>
  );
}
