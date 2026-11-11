import Link from 'next/link';
import { q } from '../lib/db';
import { requireUser } from '../lib/auth';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Stok Gudang' };
const nf = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
const fmt = (v) => (v == null ? '—' : nf.format(v));

export default async function Home({ searchParams: sp }) {
  const u = requireUser();
  const acc = u.role === 'accounting';
  const whs = (await q('SELECT * FROM warehouses ORDER BY id')).filter((w) => acc || w.id === u.wh);
  const w = whs.find((x) => x.code === sp.w) || whs[0];
  const m = /^\d{4}-\d{2}$/.test(sp.m || '') && sp.m >= '2026-10' ? sp.m : '2026-10';
  const [y, mo] = m.split('-').map(Number);
  const start = `${m}-01`, next = new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 10);

  const params = [w.id, start, next];
  let where = 'i.warehouse_id=$1';
  if (sp.q) { params.push(`%${sp.q}%`); const n = params.length; where += ` AND (i.code ILIKE $${n} OR i.name ILIKE $${n} OR i.spec ILIKE $${n} OR i.machine ILIKE $${n} OR i.group_name ILIKE $${n})`; }
  if (acc && sp.nop === '1') where += ' AND p.item_code IS NULL';
  const rows = await q(`
    SELECT i.id, i.group_name, i.part_no, i.code, i.name, i.spec, i.machine, i.stock_sep,
      COALESCE(m.pre,0) pre, COALESCE(m.inn,0) inn, COALESCE(m.outt,0) outt,
      p.price, p.trade_name, p.start_date, p.conflict, COALESCE(p.currency_code,'03') cur, cr.rate
    FROM items i
    LEFT JOIN (SELECT item_id,
        SUM(CASE WHEN date<$2 THEN (CASE type WHEN 'IN' THEN qty ELSE -qty END) ELSE 0 END) pre,
        SUM(CASE WHEN date>=$2 AND type='IN' THEN qty ELSE 0 END) inn,
        SUM(CASE WHEN date>=$2 AND type='OUT' THEN qty ELSE 0 END) outt
      FROM movements WHERE date<$3 GROUP BY item_id) m ON m.item_id=i.id
    LEFT JOIN price_master p ON p.item_code=i.code
    LEFT JOIN currency_rates cr ON cr.code=COALESCE(p.currency_code,'03')
    WHERE ${where} ORDER BY i.group_name, i.id`, params);

  let totalVal = 0, noPrice = 0, noRate = 0;
  const data = rows.map((r) => {
    const open = r.stock_sep + r.pre, bal = open + r.inn - r.outt;
    const val = r.price != null && r.rate != null ? bal * r.price * r.rate : null;
    if (r.price == null) noPrice++; else if (r.rate == null) noRate++; else totalVal += val;
    return { ...r, open, bal, val };
  });
  const qs = (o) => '?' + new URLSearchParams({ w: w.code, m, ...(sp.q ? { q: sp.q } : {}), ...o }).toString();

  return (
    <>
      <h1>Stok {w.name} — {m}</h1>
      <div className="tabs">{whs.map((x) => <Link key={x.code} href={`/?w=${x.code}&m=${m}`} className={x.id === w.id ? 'on' : ''}>{x.plant} · {x.name.replace('Gudang ', '')}</Link>)}</div>
      <form className="bar">
        <input type="hidden" name="w" value={w.code} />
        <input type="month" name="m" defaultValue={m} min="2026-10" />
        <input name="q" defaultValue={sp.q || ''} placeholder="Cari kode / item / spesifikasi / mesin" size={38} />
        {acc && <label><input type="checkbox" name="nop" value="1" defaultChecked={sp.nop === '1'} /> hanya tanpa harga</label>}
        <button>Tampilkan</button>
      </form>
      <div className="cards" style={{ marginBottom: 12 }}>
        <div className="card"><small>Jumlah baris</small><b>{rows.length}</b></div>
        <div className="card"><small>Total saldo (qty)</small><b>{fmt(data.reduce((a, r) => a + r.bal, 0))}</b></div>
        {acc && <div className="card"><small>Nilai persediaan (IDR)</small><b>{fmt(totalVal)}</b>
          <small>{noPrice} baris tanpa harga{noRate ? `, ${noRate} baris kurs belum diisi` : ''}</small></div>}
      </div>
      <div className="wrap"><table>
        <thead><tr><th>Kelompok</th><th>Kode</th><th>Item</th><th>Spesifikasi</th><th className="n">Stok awal</th><th className="n">Masuk</th><th className="n">Keluar</th><th className="n">Saldo</th>
          {acc && <><th className="n">Harga</th><th>Supplier / tgl harga</th><th className="n">Nilai (IDR)</th></>}</tr></thead>
        <tbody>{data.map((r) => (
          <tr key={r.id}>
            <td>{r.group_name}{r.part_no ? <div className="muted">{r.part_no}</div> : null}</td>
            <td>{r.code || <span className="warn">—</span>}</td><td>{r.name}</td><td>{r.spec}</td>
            <td className="n">{fmt(r.open)}</td><td className="n">{fmt(r.inn)}</td><td className="n">{fmt(r.outt)}</td><td className="n"><b>{fmt(r.bal)}</b></td>
            {acc && <>
              <td className="n">{r.price == null ? <span className="warn">belum ada</span> : <>{fmt(r.price)}{r.cur !== '03' && <div className="muted">kurs {r.cur}</div>}</>}</td>
              <td>{r.price != null && <>{r.trade_name}<div className="muted">{r.start_date}{r.conflict && <> <span className="badge">harga beda antar supplier</span></>}</div></>}</td>
              <td className="n">{r.val == null && r.price != null ? <span className="warn">kurs?</span> : fmt(r.val)}</td></>}
          </tr>))}
        </tbody></table></div>
    </>
  );
}
