import { q } from '../../lib/db';
import { requireUser } from '../../lib/auth';
import { thisMonth } from '../../lib/util';
import Link from 'next/link';
import PeriodPicker from '../PeriodPicker';
import { getReport, reportMonth } from '../../lib/report';
import { Bars, Donut, Flow, COL } from './Charts';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dashboard', description: 'Ringkasan stok, nilai persediaan, dan arus barang masuk-keluar per gudang.' };
const nf = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const cmp = new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 2 });

export default async function Dashboard({ searchParams: sp = {} }) {
  const u = requireUser(), acc = u.role === 'accounting', wh = acc ? null : u.wh, m = thisMonth();
  const items = await q(`SELECT i.code, i.name, w.plant, w.name wname, i.stock_sep + COALESCE(n.net,0) bal, p.price, cr.rate
    FROM items i JOIN warehouses w ON w.id=i.warehouse_id
    LEFT JOIN (SELECT item_id, SUM(CASE type WHEN 'IN' THEN qty ELSE -qty END) net FROM movements GROUP BY item_id) n ON n.item_id=i.id
    LEFT JOIN price_master p ON p.item_code=i.code LEFT JOIN currency_rates cr ON cr.code=COALESCE(p.currency_code,'03')
    WHERE ($1::int IS NULL OR i.warehouse_id=$1)`, [wh]);
  const flow = await q(`SELECT to_char(mv.date,'YYYY-MM') m, SUM(CASE WHEN mv.type='IN' THEN mv.qty ELSE 0 END) inn, SUM(CASE WHEN mv.type='OUT' THEN mv.qty ELSE 0 END) outt
    FROM movements mv JOIN items i ON i.id=mv.item_id WHERE ($1::int IS NULL OR i.warehouse_id=$1) GROUP BY 1 ORDER BY 1`, [wh]);
  const locks = await q('SELECT w.name, l.locked_by FROM warehouses w LEFT JOIN period_locks l ON l.warehouse_id=w.id AND l.month=$2 WHERE ($1::int IS NULL OR w.id=$1) ORDER BY w.id', [wh, m]);
  const pending = acc ? (await q("SELECT count(*)::int n FROM change_requests WHERE status='PENDING'"))[0].n : 0;

  const kind = sp.r === 'semua' ? 'semua' : 'bulanan', rm = reportMonth(sp.m), R = await getReport(kind, rm, wh);
  const rq = (o) => '?' + new URLSearchParams({ r: kind, m: rm, ...o }).toString() + '#laporan';
  const by = {}; let totQty = 0, totVal = 0, priced = 0;
  const val = (r) => (r.price != null && r.rate != null ? r.bal * r.price * r.rate : null);
  for (const r of items) {
    const k = `${r.plant} · ${r.wname.replace('Gudang ', '')}`, v = val(r); by[k] ||= { qty: 0, val: 0 };
    by[k].qty += r.bal; totQty += r.bal; if (r.price != null) priced++; if (v != null) { by[k].val += v; totVal += v; }
  }
  const whBars = Object.entries(by).map(([label, x]) => ({ label, value: acc ? x.val : x.qty }));
  const top = [...items].map((r) => ({ label: `${r.code || '-'} ${r.name || ''}`.trim(), value: acc ? val(r) ?? 0 : r.bal })).sort((a, b) => b.value - a.value).slice(0, 8);
  return (
    <>
      <h1>Dashboard</h1>
      <p className="muted lead">Ringkasan data per hari ini, bulan berjalan {m}.</p>
      <div className="kpis">
        <div className="card kpi"><small>Baris barang</small><b>{nf.format(items.length)}</b></div>
        <div className="card kpi"><small>Total saldo (qty)</small><b>{nf.format(totQty)}</b></div>
        {acc && <div className="card kpi hero"><small>Nilai persediaan (IDR)</small><b>{cmp.format(totVal)}</b><small>{nf.format(totVal)}</small></div>}
        {acc ? <div className="card kpi"><small>Menunggu approval</small><b>{pending}</b></div>
          : <div className="card kpi"><small>Status bulan {m}</small><b>{locks[0]?.locked_by ? 'Terkunci' : 'Terbuka'}</b></div>}
      </div>
      <div className="grid2">
        <section className="card"><h2>{acc ? 'Nilai persediaan per gudang (IDR)' : 'Saldo per gudang'}</h2><Bars data={whBars} label="Perbandingan antar gudang" /></section>
        <section className="card"><h2>Arus barang per bulan</h2>
          <Flow data={flow} label="Total masuk dan keluar per bulan" />
          <p className="legend"><i style={{ background: COL[0] }} />Masuk <i style={{ background: COL[1] }} />Keluar</p></section>
        <section className="card"><h2>{acc ? '8 barang bernilai tertinggi' : '8 barang saldo terbanyak'}</h2><Bars data={top} label="Barang teratas" /></section>
        {acc && <section className="card"><h2>Kelengkapan harga</h2>
          <Donut label="Barang berharga dan belum berharga" center={`${items.length ? Math.round((priced / items.length) * 100) : 0}%`} sub="berharga"
            parts={[{ label: 'Sudah ada harga', value: priced, color: COL[0] }, { label: 'Belum ada harga', value: items.length - priced, color: COL[1] }]} /></section>}
        <section className="card"><h2>Kunci bulan {m}</h2>
          <ul className="locks">{locks.map((l) => <li key={l.name}>{l.name}<span className={l.locked_by ? 'tag ok' : 'tag'}>{l.locked_by ? 'Terkunci' : 'Terbuka'}</span></li>)}</ul></section>
      </div>

      <section className="card report" id="laporan">
        <div className="rhead">
          <h2>Laporan stok</h2>
          <a className="pbtn" href={`/api/laporan${rq({}).replace('#laporan', '')}`} download>Unduh Excel</a>
        </div>
        <div className="tabs" role="tablist" aria-label="Jenis laporan">
          <Link href={rq({ r: 'bulanan' })} className={kind === 'bulanan' ? 'on' : ''} aria-current={kind === 'bulanan' ? 'page' : undefined}>Bulanan</Link>
          <Link href={rq({ r: 'semua' })} className={kind === 'semua' ? 'on' : ''} aria-current={kind === 'semua' ? 'page' : undefined}>Keseluruhan</Link>
        </div>
        {kind === 'bulanan'
          ? <form className="bar" action="/dashboard#laporan"><input type="hidden" name="r" value="bulanan" /><PeriodPicker defaultValue={rm} min="2026-10" max={m} /><button>Tampilkan</button></form>
          : <p className="muted">Stok awal (September 2026) sampai hari ini, dengan rekap per bulan.</p>}
        <div className="kpis rk">
          <div className="card kpi"><small>Stok awal</small><b>{nf.format(R.total.open)}</b></div>
          <div className="card kpi"><small>Masuk</small><b>{nf.format(R.total.inn)}</b></div>
          <div className="card kpi"><small>Keluar</small><b>{nf.format(R.total.outt)}</b></div>
          <div className="card kpi"><small>Saldo akhir</small><b>{nf.format(R.total.bal)}</b>{acc && <small>Rp {cmp.format(R.total.balV)}</small>}</div>
        </div>
        <h3>Ringkasan per gudang{kind === 'bulanan' ? ` — ${rm}` : ''}</h3>
        <div className="wrap"><table>
          <thead><tr><th>Gudang</th><th className="n">Baris</th><th className="n">Stok awal</th><th className="n">Masuk</th><th className="n">Keluar</th><th className="n">Saldo akhir</th>{acc && <th className="n">Nilai akhir (IDR)</th>}</tr></thead>
          <tbody>{R.warehouses.map((g) => <tr key={g.name}><td>{g.name}</td><td className="n">{nf.format(g.rows)}</td><td className="n">{nf.format(g.open)}</td><td className="n">{nf.format(g.inn)}</td><td className="n">{nf.format(g.outt)}</td><td className="n"><b>{nf.format(g.bal)}</b></td>{acc && <td className="n">{nf.format(g.balV)}</td>}</tr>)}</tbody>
          <tfoot><tr><td>Total</td><td className="n">{nf.format(R.total.rows)}</td><td className="n">{nf.format(R.total.open)}</td><td className="n">{nf.format(R.total.inn)}</td><td className="n">{nf.format(R.total.outt)}</td><td className="n">{nf.format(R.total.bal)}</td>{acc && <td className="n">{nf.format(R.total.balV)}</td>}</tr></tfoot>
        </table></div>
        {kind === 'semua' && <>
          <h3>Rekap per bulan</h3>
          <div className="wrap"><table>
            <thead><tr><th>Bulan</th><th className="n">Saldo awal</th><th className="n">Masuk</th><th className="n">Keluar</th><th className="n">Saldo akhir</th>{acc && <th className="n">Nilai akhir (IDR)</th>}</tr></thead>
            <tbody>{R.months.map((x) => <tr key={x.m}><td><Link href={rq({ r: 'bulanan', m: x.m })}>{x.m}</Link></td><td className="n">{nf.format(x.open)}</td><td className="n">{nf.format(x.inn)}</td><td className="n">{nf.format(x.outt)}</td><td className="n"><b>{nf.format(x.bal)}</b></td>{acc && <td className="n">{nf.format(x.balV)}</td>}</tr>)}
              {!R.months.length && <tr><td colSpan={acc ? 6 : 5} className="muted">Belum ada mutasi.</td></tr>}</tbody>
          </table></div></>}
        <p className="muted" style={{ marginBottom: 0 }}>Rincian per barang tersedia di file Excel{acc && R.noPrice ? `. Nilai belum mencakup ${nf.format(R.noPrice)} baris tanpa harga.` : '.'}</p>
      </section>
    </>
  );
}
