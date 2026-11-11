import Link from 'next/link';
import { q } from '../../lib/db';
import { requireUser } from '../../lib/auth';
import { thisMonth } from '../../lib/util';
import { getReport, reportMonth } from '../../lib/report';
import PeriodPicker from '../PeriodPicker';
import { Bars, Donut, Flow, COL } from './Charts';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dashboard', description: 'Ringkasan stok, nilai persediaan, dan arus barang masuk-keluar per gudang, bulanan atau keseluruhan.' };
const nf = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const cmp = new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 2 });

export default async function Dashboard({ searchParams: sp = {} }) {
  const u = requireUser(), acc = u.role === 'accounting', wh = acc ? null : u.wh, now = thisMonth();
  const kind = sp.r === 'semua' ? 'semua' : 'bulanan', m = reportMonth(sp.m), bulanan = kind === 'bulanan';
  const R = await getReport(kind, m, wh), T = R.total;
  const lockM = bulanan ? m : now;
  const locks = await q('SELECT w.name, l.locked_by FROM warehouses w LEFT JOIN period_locks l ON l.warehouse_id=w.id AND l.month=$2 WHERE ($1::int IS NULL OR w.id=$1) ORDER BY w.id', [wh, lockM]);
  const pending = acc ? (await q("SELECT count(*)::int n FROM change_requests WHERE status='PENDING'"))[0].n : 0;

  const href = (o) => '?' + new URLSearchParams({ r: kind, m, ...o }).toString();
  const periode = bulanan ? `bulan ${m}` : 'keseluruhan (stok awal September 2026 s/d hari ini)';
  const priced = R.items.filter((r) => r.price != null).length;
  const whBars = R.warehouses.map((g) => ({ label: g.name, value: acc ? g.balV : g.bal }));
  const top = R.items.map((r) => ({ label: `${r.code || '-'} ${r.name || ''}`.trim(), value: acc ? r.balV ?? 0 : r.bal })).sort((a, b) => b.value - a.value).slice(0, 8);
  const flow = bulanan ? R.warehouses.map((g) => ({ m: g.name.split(' · ')[1] || g.name, inn: g.inn, outt: g.outt })) : R.months;

  return (
    <>
      <h1>Dashboard</h1>
      <div className="slicer" role="group" aria-label="Periode dashboard">
        <div className="tabs">
          <Link href={href({ r: 'bulanan' })} className={bulanan ? 'on' : ''} aria-current={bulanan ? 'page' : undefined}>Bulanan</Link>
          <Link href={href({ r: 'semua' })} className={!bulanan ? 'on' : ''} aria-current={!bulanan ? 'page' : undefined}>Keseluruhan</Link>
        </div>
        {bulanan && <form className="bar" action="/dashboard"><input type="hidden" name="r" value="bulanan" /><PeriodPicker defaultValue={m} min="2026-10" max={now} /><button>Tampilkan</button></form>}
        <a className="pbtn" href={`/api/laporan${href({})}`} download>Unduh laporan Excel</a>
      </div>
      <p className="muted lead">Menampilkan {periode}.</p>
      <div className="kpis">
        <div className="card kpi"><small>Baris barang</small><b>{nf.format(T.rows)}</b></div>
        <div className="card kpi"><small>Stok awal</small><b>{nf.format(T.open)}</b></div>
        <div className="card kpi"><small>Masuk</small><b>{nf.format(T.inn)}</b></div>
        <div className="card kpi"><small>Keluar</small><b>{nf.format(T.outt)}</b></div>
        <div className="card kpi"><small>Saldo akhir (qty)</small><b>{nf.format(T.bal)}</b></div>
        {acc && <div className="card kpi hero"><small>Nilai persediaan akhir (IDR)</small><b>{cmp.format(T.balV)}</b><small>{nf.format(T.balV)}</small></div>}
        {acc ? <div className="card kpi"><small>Menunggu approval</small><b>{pending}</b></div>
          : <div className="card kpi"><small>Status bulan {lockM}</small><b>{locks[0]?.locked_by ? 'Terkunci' : 'Terbuka'}</b></div>}
      </div>
      <div className="grid2">
        <section className="card"><h2>{acc ? 'Nilai persediaan akhir per gudang (IDR)' : 'Saldo akhir per gudang'}</h2><Bars data={whBars} label="Perbandingan antar gudang" /></section>
        <section className="card"><h2>{bulanan ? `Arus barang per gudang — ${m}` : 'Arus barang per bulan'}</h2>
          <Flow data={flow} label="Total masuk dan keluar" />
          <p className="legend"><i style={{ background: COL[0] }} />Masuk <i style={{ background: COL[1] }} />Keluar</p></section>
        <section className="card"><h2>{acc ? '8 barang bernilai tertinggi' : '8 barang saldo terbanyak'}</h2><Bars data={top} label="Barang teratas" /></section>
        {acc && <section className="card"><h2>Kelengkapan harga</h2>
          <Donut label="Barang berharga dan belum berharga" center={`${T.rows ? Math.round((priced / T.rows) * 100) : 0}%`} sub="berharga"
            parts={[{ label: 'Sudah ada harga', value: priced, color: COL[0] }, { label: 'Belum ada harga', value: T.rows - priced, color: COL[1] }]} /></section>}
        <section className="card"><h2>Kunci bulan {lockM}</h2>
          <ul className="locks">{locks.map((l) => <li key={l.name}>{l.name}<span className={l.locked_by ? 'tag ok' : 'tag'}>{l.locked_by ? 'Terkunci' : 'Terbuka'}</span></li>)}</ul></section>
      </div>
      <section className="card" style={{ marginTop: 16 }}>
        <h2>Rekap per gudang — {bulanan ? m : 'keseluruhan'}</h2>
        <div className="wrap"><table>
          <thead><tr><th>Gudang</th><th className="n">Baris</th><th className="n">Stok awal</th><th className="n">Masuk</th><th className="n">Keluar</th><th className="n">Saldo akhir</th>{acc && <th className="n">Nilai akhir (IDR)</th>}</tr></thead>
          <tbody>{R.warehouses.map((g) => <tr key={g.name}><td>{g.name}</td><td className="n">{nf.format(g.rows)}</td><td className="n">{nf.format(g.open)}</td><td className="n">{nf.format(g.inn)}</td><td className="n">{nf.format(g.outt)}</td><td className="n"><b>{nf.format(g.bal)}</b></td>{acc && <td className="n">{nf.format(g.balV)}</td>}</tr>)}</tbody>
          <tfoot><tr><td>Total</td><td className="n">{nf.format(T.rows)}</td><td className="n">{nf.format(T.open)}</td><td className="n">{nf.format(T.inn)}</td><td className="n">{nf.format(T.outt)}</td><td className="n">{nf.format(T.bal)}</td>{acc && <td className="n">{nf.format(T.balV)}</td>}</tr></tfoot>
        </table></div>
        {acc && R.noPrice > 0 && <p className="muted" style={{ marginBottom: 0 }}>Nilai belum mencakup {nf.format(R.noPrice)} baris tanpa harga.</p>}
      </section>
    </>
  );
}
