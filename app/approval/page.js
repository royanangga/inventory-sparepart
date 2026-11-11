import { q } from '../../lib/db';
import { requireUser } from '../../lib/auth';
import { thisMonth, validMonth } from '../../lib/util';
import Decision from './Decision';
import PeriodPicker from '../PeriodPicker';
import UnlockForm from './UnlockForm';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Approval Perubahan' };
const AC = { ADD: 'Tambah', EDIT: 'Ubah', DELETE: 'Hapus', SET: 'Koreksi bulanan' };
const nf = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
const T = (t) => (t === 'IN' ? 'Masuk' : 'Keluar');
const SELECT = `SELECT r.*, w.name wh, i.code icode, i.name iname FROM change_requests r JOIN warehouses w ON w.id=r.warehouse_id LEFT JOIN items i ON i.id=r.item_id`;

export default async function Approval({ searchParams: sp }) {
  requireUser('accounting');
  const m = validMonth(sp.m) ? sp.m : thisMonth();
  const pending = await q(`${SELECT} WHERE r.status='PENDING' ORDER BY r.id`);
  const done = await q(`${SELECT} WHERE r.status<>'PENDING' ORDER BY r.decided_at DESC LIMIT 20`);
  const locks = await q('SELECT w.id, w.name, l.locked_by, l.locked_at FROM warehouses w LEFT JOIN period_locks l ON l.warehouse_id=w.id AND l.month=$1 ORDER BY w.id', [m]);
  const events = await q('SELECT e.*, w.name FROM period_events e JOIN warehouses w ON w.id=e.warehouse_id ORDER BY e.id DESC LIMIT 15');
  const label = (r) => `${r.snapshot?.code || r.icode || '-'} ${r.snapshot?.name || r.iname || ''}`;
  const before = (r) => (r.action === 'SET' ? `Masuk ${nf.format(r.snapshot.old_in)} / Keluar ${nf.format(r.snapshot.old_out)}` : r.action === 'ADD' ? '—' : `${T(r.snapshot.type)} ${r.snapshot.qty} · ${r.snapshot.date}`);
  const after = (r) => (r.action === 'SET' ? `Masuk ${nf.format(r.new_in)} / Keluar ${nf.format(r.new_out)}` : r.action === 'DELETE' ? <b className="warn">dihapus</b> : `${T(r.type)} ${r.qty} · ${r.date}${r.note ? ' · ' + r.note : ''}`);
  const afterT = (r) => (r.action === 'DELETE' ? 'Dihapus' : r.action === 'SET' ? `Masuk ${nf.format(r.new_in)} / Keluar ${nf.format(r.new_out)}` : `${T(r.type)} ${r.qty} · ${r.date}`);
  return (
    <>
      <h1>Approval Perubahan</h1>
      <div className="wrap" style={{ marginBottom: 16 }}><table>
        <thead><tr><th>#</th><th>Gudang</th><th>Bulan</th><th>Jenis</th><th>Barang</th><th>Semula</th><th>Usulan</th><th>Alasan</th><th>Oleh</th><th>Keputusan</th></tr></thead>
        <tbody>{pending.map((r) => (
          <tr key={r.id}><td>{r.id}</td><td>{r.wh}</td><td>{r.month}</td><td>{AC[r.action]}</td><td>{label(r)}</td><td>{before(r)}</td><td>{after(r)}</td><td>{r.reason}</td>
            <td>{r.requested_by}<div className="muted">{new Date(r.requested_at).toLocaleString('id-ID')}</div></td><td><Decision id={r.id} info={{ label: label(r), kind: AC[r.action], before: before(r), after: afterT(r) }} /></td></tr>))}
          {!pending.length && <tr><td colSpan={10} className="muted">Tidak ada permintaan yang menunggu.</td></tr>}</tbody></table></div>
      <h3>Status kunci bulan</h3>
      <form className="bar"><PeriodPicker defaultValue={m} min="2026-10" max={thisMonth()} /><button>Tampilkan</button></form>
      <div className="wrap" style={{ marginBottom: 16 }}><table><thead><tr><th>Gudang</th><th>Status {m}</th><th>Aksi</th></tr></thead>
        <tbody>{locks.map((l) => <tr key={l.id}><td>{l.name}</td><td>{l.locked_by ? `Terkunci oleh ${l.locked_by} (${new Date(l.locked_at).toLocaleString('id-ID')})` : <span className="warn">Terbuka (belum dikunci)</span>}</td><td>{l.locked_by && <UnlockForm wh={l.id} whName={l.name} month={m} />}</td></tr>)}</tbody></table></div>
      <h3>Riwayat kunci bulan</h3>
      <div className="wrap" style={{ marginBottom: 16 }}><table><thead><tr><th>Waktu</th><th>Gudang</th><th>Bulan</th><th>Kejadian</th><th>Oleh</th><th>Alasan</th></tr></thead>
        <tbody>{events.map((e) => <tr key={e.id}><td>{new Date(e.at).toLocaleString('id-ID')}</td><td>{e.name}</td><td>{e.month}</td><td>{e.event === 'LOCK' ? 'Dikunci' : 'Dibuka kuncinya'}</td><td>{e.by_user}</td><td>{e.note}</td></tr>)}
          {!events.length && <tr><td colSpan={6} className="muted">Belum ada riwayat.</td></tr>}</tbody></table></div>
      <h3>Riwayat keputusan</h3>
      <div className="wrap"><table>
        <thead><tr><th>#</th><th>Gudang</th><th>Jenis</th><th>Barang</th><th>Semula</th><th>Usulan</th><th>Status</th><th>Oleh / catatan</th></tr></thead>
        <tbody>{done.map((r) => (
          <tr key={r.id}><td>{r.id}</td><td>{r.wh}</td><td>{AC[r.action]}</td><td>{label(r)}</td><td>{before(r)}</td><td>{after(r)}</td>
            <td>{r.status === 'APPROVED' ? 'Disetujui' : 'Ditolak'}</td><td>{r.decided_by}<div className="muted">{r.decision_note}</div></td></tr>))}</tbody></table></div>
    </>
  );
}
