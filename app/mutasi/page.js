import { q } from '../../lib/db';
import { requireUser } from '../../lib/auth';
import { thisMonth, validMonth, monthRange } from '../../lib/util';
import Grid from './Grid';
import PeriodPicker from '../PeriodPicker';
import LockForm from './LockForm';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Input Mutasi' };
const ST = { PENDING: 'Menunggu', APPROVED: 'Disetujui', REJECTED: 'Ditolak' };
const nf = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });

export default async function Mutasi({ searchParams: sp }) {
  const u = requireUser('gudang');
  const m = validMonth(sp.m) ? sp.m : thisMonth();
  const [start, end] = monthRange(m);
  const [y, mo] = m.split('-').map(Number);
  const prev = new Date(Date.UTC(y, mo - 2, 1)).toISOString().slice(0, 7);
  const [lock] = await q('SELECT * FROM period_locks WHERE warehouse_id=$1 AND month=$2', [u.wh, m]);
  const rows = (await q(`
    SELECT i.id, i.group_name "group", i.code, i.name, i.spec, i.stock_sep + COALESCE(p.pre,0) AS open,
      COALESCE(c.inn,0) AS inn, COALESCE(c.outt,0) AS outt, (pr.item_id IS NOT NULL) AS pend
    FROM items i
    LEFT JOIN (SELECT item_id, SUM(CASE type WHEN 'IN' THEN qty ELSE -qty END) pre FROM movements WHERE date<$2 GROUP BY item_id) p ON p.item_id=i.id
    LEFT JOIN (SELECT item_id, SUM(CASE WHEN type='IN' THEN qty ELSE 0 END) inn, SUM(CASE WHEN type='OUT' THEN qty ELSE 0 END) outt
               FROM movements WHERE date>=$2 AND date<=$3 GROUP BY item_id) c ON c.item_id=i.id
    LEFT JOIN (SELECT DISTINCT item_id FROM change_requests WHERE status='PENDING' AND action='SET' AND month=$4) pr ON pr.item_id=i.id
    WHERE i.warehouse_id=$1 ORDER BY i.group_name, i.id`, [u.wh, start, end, m]));
  const key = `${m}-${!!lock}-${rows.reduce((a, r) => a + r.inn * 3 + r.outt * 7 + (r.pend ? 1000 : 0), 0)}`;
  const reqs = await q('SELECT r.*, i.code, i.name FROM change_requests r LEFT JOIN items i ON i.id=r.item_id WHERE r.warehouse_id=$1 ORDER BY r.id DESC LIMIT 30', [u.wh]);
  const usul = (r) => r.action === 'SET' ? `Masuk ${nf.format(r.new_in)} / Keluar ${nf.format(r.new_out)}` : r.action === 'DELETE' ? 'Hapus' : `${r.type === 'IN' ? 'Masuk' : 'Keluar'} ${r.qty} · ${r.date}`;
  return (
    <>
      <h1>Input Mutasi — {u.name}</h1>
      <form className="bar"><PeriodPicker defaultValue={m} min="2026-10" max={thisMonth()} /><button>Tampilkan</button></form>
      {lock
        ? <div className="card"><b>Bulan {m} terkunci</b> <span className="muted">oleh {lock.locked_by} pada {new Date(lock.locked_at).toLocaleString('id-ID')}. Ubah angka Masuk/Keluar yang perlu dikoreksi, isi alasan, lalu ajukan ke Accounting.</span></div>
        : <div className="card"><span className="muted">Bulan {m} terbuka. Stok akhir {prev} terisi otomatis; ketik jumlah <b>Masuk</b> dan/atau <b>Keluar</b> bulan ini (kosong = 0), saldo terhitung otomatis. Klik <b>Simpan</b>, dan setelah semuanya benar klik kunci bulan di bawah tabel.</span></div>}
      <Grid key={key} rows={rows} month={m} prev={prev} locked={!!lock} />
      {!lock && <div className="card bar" style={{ justifyContent: 'space-between', marginTop: 12 }}><span className="muted">Pastikan perubahan sudah disimpan sebelum mengunci.</span><LockForm month={m} /></div>}
      <h3>Permintaan perubahan saya</h3>
      <div className="wrap"><table>
        <thead><tr><th>#</th><th>Bulan</th><th>Barang</th><th>Usulan</th><th>Alasan</th><th>Status</th><th>Catatan Accounting</th></tr></thead>
        <tbody>{reqs.map((r) => (
          <tr key={r.id}><td>{r.id}</td><td>{r.month}</td><td>{r.snapshot?.code || r.code} {r.snapshot?.name || r.name}</td><td>{usul(r)}</td><td>{r.reason}</td><td>{ST[r.status]}</td><td>{r.decision_note}</td></tr>))}
          {!reqs.length && <tr><td colSpan={7} className="muted">Belum ada permintaan.</td></tr>}</tbody>
      </table></div>
    </>
  );
}
