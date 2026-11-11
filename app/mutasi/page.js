import { q } from '../../lib/db';
import { requireUser } from '../../lib/auth';
import { deleteMovement } from '../../lib/actions';
import { today, thisMonth, validMonth, monthRange } from '../../lib/util';
import MutasiForm from './MutasiForm';
import LockForm from './LockForm';
import RequestForm from './RequestForm';
export const dynamic = 'force-dynamic';
const ST = { PENDING: 'Menunggu', APPROVED: 'Disetujui', REJECTED: 'Ditolak' };
const AC = { ADD: 'Tambah', EDIT: 'Ubah', DELETE: 'Hapus' };

export default async function Mutasi({ searchParams: sp }) {
  const u = requireUser('gudang');
  const m = validMonth(sp.m) ? sp.m : thisMonth();
  const [min, max] = monthRange(m), def = m === thisMonth() ? today() : max;
  const [lock] = await q('SELECT * FROM period_locks WHERE warehouse_id=$1 AND month=$2', [u.wh, m]);
  const items = await q('SELECT id, code, name, spec FROM items WHERE warehouse_id=$1 ORDER BY group_name, id', [u.wh]);
  const movs = await q(`SELECT m.id, m.date, m.type, m.qty, m.note, m.created_by, i.code, i.name FROM movements m JOIN items i ON i.id=m.item_id
    WHERE i.warehouse_id=$1 AND m.date>=$2 AND m.date<=$3 ORDER BY m.date DESC, m.id DESC`, [u.wh, min, max]);
  const reqs = await q(`SELECT r.*, i.code, i.name FROM change_requests r LEFT JOIN items i ON i.id=r.item_id WHERE r.warehouse_id=$1 ORDER BY r.id DESC LIMIT 20`, [u.wh]);
  return (
    <>
      <h1>Input Mutasi — {u.name}</h1>
      <form className="bar"><input type="month" name="m" defaultValue={m} min="2026-10" max={thisMonth()} /><button>Tampilkan</button></form>
      {lock ? (
        <>
          <div className="card"><b>Bulan {m} terkunci</b> <span className="muted">oleh {lock.locked_by} pada {new Date(lock.locked_at).toLocaleString('id-ID')}. Perubahan harus disetujui Accounting.</span></div>
          <h3>Ajukan perubahan</h3>
          <RequestForm items={items} movs={movs} min={min} max={max} def={def} />
        </>
      ) : (
        <>
          <MutasiForm items={items} min={min} max={max} def={def} />
          <div className="card bar" style={{ justifyContent: 'space-between' }}>
            <span className="muted">Bulan {m} masih terbuka: data boleh ditambah atau dihapus. Setelah selesai, kunci bulan ini.</span>
            <LockForm month={m} />
          </div>
        </>)}
      <h3>Mutasi {m}</h3>
      <div className="wrap"><table>
        <thead><tr><th>Tanggal</th><th>Jenis</th><th className="n">Qty</th><th>Kode</th><th>Item</th><th>Catatan</th><th>Oleh</th><th></th></tr></thead>
        <tbody>{movs.map((r) => (
          <tr key={r.id}><td>{r.date}</td><td>{r.type === 'IN' ? 'Masuk' : 'Keluar'}</td><td className="n">{r.qty}</td><td>{r.code}</td><td>{r.name}</td><td>{r.note}</td><td>{r.created_by}</td>
            <td>{!lock && <form action={deleteMovement}><input type="hidden" name="id" value={r.id} /><button>Hapus</button></form>}</td></tr>))}
          {!movs.length && <tr><td colSpan={8} className="muted">Belum ada mutasi di bulan ini.</td></tr>}</tbody>
      </table></div>
      <h3>Permintaan perubahan saya</h3>
      <div className="wrap"><table>
        <thead><tr><th>#</th><th>Bulan</th><th>Jenis</th><th>Barang</th><th>Usulan</th><th>Alasan</th><th>Status</th><th>Catatan Accounting</th></tr></thead>
        <tbody>{reqs.map((r) => (
          <tr key={r.id}><td>{r.id}</td><td>{r.month}</td><td>{AC[r.action]}</td><td>{r.snapshot?.code || r.code} {r.snapshot?.name || r.name}</td>
            <td>{r.action === 'DELETE' ? 'Hapus' : `${r.type === 'IN' ? 'Masuk' : 'Keluar'} ${r.qty} · ${r.date}`}</td><td>{r.reason}</td><td>{ST[r.status]}</td><td>{r.decision_note}</td></tr>))}
          {!reqs.length && <tr><td colSpan={8} className="muted">Belum ada permintaan.</td></tr>}</tbody>
      </table></div>
    </>
  );
}
