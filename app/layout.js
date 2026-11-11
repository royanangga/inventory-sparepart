import './globals.css';
import Link from 'next/link';
import { getUser } from '../lib/auth';
import { logout } from '../lib/actions';
export const metadata = { title: 'Inventory Sparepart' };
export default function RootLayout({ children }) {
  const u = getUser();
  return (
    <html lang="id"><body>
      {u && (
        <header>
          <b>Inventory Sparepart</b>
          <nav>
            <Link href="/">Stok</Link>
            {u.role === 'gudang' && <Link href="/mutasi">Input Mutasi</Link>}
            {u.role === 'accounting' && <Link href="/price">Price Master</Link>}
          </nav>
          <form action={logout}><span>{u.name}</span><button>Keluar</button></form>
        </header>
      )}
      <main>{children}</main>
    </body></html>
  );
}
