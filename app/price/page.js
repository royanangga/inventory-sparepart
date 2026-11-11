import { q } from '../../lib/db';
import { requireUser } from '../../lib/auth';
import { saveRate } from '../../lib/actions';
import PriceImport from './PriceImport';
export const dynamic = 'force-dynamic';
export default async function Price() {
  requireUser('accounting');
  const [cnt] = await q('SELECT count(*)::int n, max(start_date) latest FROM price_master');
  const imports = await q('SELECT * FROM price_imports ORDER BY id DESC LIMIT 5');
  const rates = await q('SELECT cr.code, cr.rate, (SELECT count(*)::int FROM price_master p WHERE COALESCE(p.currency_code,\'03\')=cr.code) n FROM currency_rates cr ORDER BY cr.code');
  const missing = await q(`SELECT w.name wh, i.code, i.name FROM items i JOIN warehouses w ON w.id=i.warehouse_id
    LEFT JOIN price_master p ON p.item_code=i.code WHERE p.item_code IS NULL ORDER BY (i.code IS NULL), w.id, i.code LIMIT 100`);
  const [{ total }] = await q('SELECT count(*)::int total FROM items i LEFT JOIN price_master p ON p.item_code=i.code WHERE p.item_code IS NULL');
  return (
    <>
      <h1>Price Master</h1>
      <PriceImport />
      <div className="card"><b>{cnt.n.toLocaleString('id-ID')} item</b> berharga di database{cnt.latest ? ` (Start_Date terbaru ${cnt.latest})` : ''}.
        {imports.length > 0 && <ul>{imports.map((i) => <li key={i.id}>{new Date(i.at).toLocaleString('id-ID')} — {i.filename}: {i.items_loaded} item, {i.conflicts} konflik, oleh {i.imported_by}</li>)}</ul>}</div>
      <div className="card">
        <b>Kurs ke IDR</b> <span className="muted">— Currency_Code selain 03 perlu kurs agar nilai persediaan dihitung (kosong = nilai tidak dihitung).</span>
        {rates.map((r) => (
          <form key={r.code} action={saveRate} className="bar" style={{ margin: '8px 0 0' }}>
            <input type="hidden" name="code" value={r.code} /><span style={{ width: 90 }}>Kode {r.code}</span>
            <input name="rate" type="number" step="any" defaultValue={r.rate ?? ''} placeholder="kurs" /><span className="muted">{r.n} item</span><button>Simpan</button>
          </form>))}
      </div>
      <div className="card"><b>{total} baris barang belum punya harga</b> <span className="muted">(menampilkan 100 pertama; filter lengkap ada di halaman Stok)</span>
        <div className="wrap" style={{ marginTop: 8, maxHeight: 320 }}><table><thead><tr><th>Gudang</th><th>Kode</th><th>Item</th></tr></thead>
          <tbody>{missing.map((r, i) => <tr key={i}><td>{r.wh}</td><td>{r.code || <span className="warn">tanpa kode</span>}</td><td>{r.name}</td></tr>)}</tbody></table></div></div>
    </>
  );
}
