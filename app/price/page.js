import { q } from '../../lib/db';
import { requireUser } from '../../lib/auth';
import { thisMonth, validMonth } from '../../lib/util';
import PeriodPicker from '../PeriodPicker';
import PriceImport from './PriceImport';
import RateForm from './RateForm';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Price Master' };
export default async function Price({ searchParams: sp = {} }) {
  requireUser('accounting');
  const m = validMonth(sp.m) ? sp.m : thisMonth();
  const periods = await q('SELECT month, count(*)::int n, max(start_date) latest FROM price_master GROUP BY month ORDER BY month DESC');
  const counts = Object.fromEntries(periods.map((p) => [p.month, p.n]));
  const cnt = periods.find((p) => p.month === m) || { n: 0, latest: null };
  const imports = await q('SELECT * FROM price_imports WHERE month=$1 ORDER BY id DESC LIMIT 5', [m]);
  const rates = await q('SELECT cr.code, cr.rate, (SELECT count(*)::int FROM price_master p WHERE p.month=$1 AND COALESCE(p.currency_code,\'03\')=cr.code) n FROM currency_rates cr ORDER BY cr.code', [m]);
  const missing = await q(`SELECT w.name wh, i.code, i.name FROM items i JOIN warehouses w ON w.id=i.warehouse_id
    LEFT JOIN price_master p ON p.item_code=i.code AND p.month=$1 WHERE p.item_code IS NULL ORDER BY (i.code IS NULL), w.id, i.code LIMIT 100`, [m]);
  const [{ total }] = await q('SELECT count(*)::int total FROM items i LEFT JOIN price_master p ON p.item_code=i.code AND p.month=$1 WHERE p.item_code IS NULL', [m]);
  return (
    <>
      <h1>Price Master — {m}</h1>
      <PriceImport counts={counts} defaultMonth={m} maxMonth={thisMonth()} />
      <form className="bar"><b>Lihat periode</b> <PeriodPicker defaultValue={m} min="2026-10" max={thisMonth()} /><button>Tampilkan</button></form>
      {cnt.n === 0 && <p className="warn">Price master periode {m} belum diupload — jurnal adjustment dan laporan periode ini belum bernilai.</p>}
      <div className="card"><b>{cnt.n.toLocaleString('id-ID')} item</b> berharga di periode {m}{cnt.latest ? ` (Start_Date terbaru ${cnt.latest})` : ''}.
        {periods.length > 0 && <div className="muted">Periode yang sudah diupload: {periods.map((p) => `${p.month} (${p.n.toLocaleString('id-ID')} item)`).join(', ')}.</div>}
        {imports.length > 0 && <ul>{imports.map((i) => <li key={i.id}>{new Date(i.at).toLocaleString('id-ID')} — {i.filename}: {i.items_loaded} item, {i.conflicts} konflik, oleh {i.imported_by}</li>)}</ul>}</div>
      <div className="card">
        <b>Kurs ke IDR</b> <span className="muted">— Currency_Code selain 03 perlu kurs agar nilai persediaan dihitung (kosong = nilai tidak dihitung). Kurs berlaku sama untuk semua periode.</span>
        {rates.map((r) => <RateForm key={r.code} code={r.code} rate={r.rate} n={r.n} />)}
      </div>
      <div className="card"><b>{total} baris barang belum punya harga di periode {m}</b> <span className="muted">(menampilkan 100 pertama; filter lengkap ada di halaman Stok)</span>
        <div className="wrap" style={{ marginTop: 8, maxHeight: 320 }}><table><thead><tr><th>Gudang</th><th>Kode</th><th>Item</th></tr></thead>
          <tbody>{missing.map((r, i) => <tr key={i}><td>{r.wh}</td><td>{r.code || <span className="warn">tanpa kode</span>}</td><td>{r.name}</td></tr>)}</tbody></table></div></div>
    </>
  );
}
