import { q } from '../../lib/db';
import { requireUser } from '../../lib/auth';
import MutasiForm from './MutasiForm';
export const dynamic = 'force-dynamic';
export default async function Mutasi() {
  const u = requireUser('gudang');
  const items = await q('SELECT id, code, name, spec FROM items WHERE warehouse_id=$1 ORDER BY group_name, id', [u.wh]);
  const last = await q(`SELECT m.date, m.type, m.qty, m.note, m.created_by, i.code, i.name FROM movements m JOIN items i ON i.id=m.item_id
    WHERE i.warehouse_id=$1 AND m.created_by<>'setup' ORDER BY m.id DESC LIMIT 30`, [u.wh]);
  return (
    <>
      <h1>Input Mutasi — {u.name}</h1>
      <MutasiForm items={items} />
      <h3>30 mutasi terakhir</h3>
      <div className="wrap"><table>
        <thead><tr><th>Tanggal</th><th>Jenis</th><th className="n">Qty</th><th>Kode</th><th>Item</th><th>Catatan</th><th>Oleh</th></tr></thead>
        <tbody>{last.map((r, i) => <tr key={i}><td>{r.date}</td><td>{r.type === 'IN' ? 'Masuk' : 'Keluar'}</td><td className="n">{r.qty}</td><td>{r.code}</td><td>{r.name}</td><td>{r.note}</td><td>{r.created_by}</td></tr>)}</tbody>
      </table></div>
    </>
  );
}
