import { q } from './db';
import { monthRange, thisMonth, validMonth } from './util';

// Laporan stok: kind 'bulanan' (satu bulan) atau 'semua' (stok awal Sep s/d hari ini).
// Harga: price master PERIODE m (bulanan) atau periode m untuk stok awal/saldo (keseluruhan); rekap per bulan memakai price master bulan masing-masing.
// wh = id gudang (null = semua gudang, hanya Accounting). Nilai (IDR) = qty x harga x kurs, dipakai bila harga & kurs ada.
export const reportMonth = (m) => (validMonth(m) ? m : thisMonth());

export async function getReport(kind, m, wh) {
  const bulanan = kind !== 'semua';
  const [start, end] = bulanan ? monthRange(m) : ['0001-01-01', '9999-12-31'];
  const items = await q(`
    SELECT w.id wid, w.plant, w.name wname, i.id, i.group_name, i.code, i.name, i.spec,
      i.stock_sep + COALESCE(x.pre,0) open, COALESCE(x.inn,0) inn, COALESCE(x.outt,0) outt, p.price, cr.rate
    FROM items i JOIN warehouses w ON w.id=i.warehouse_id
    LEFT JOIN (SELECT item_id,
        SUM(CASE WHEN date<$2 THEN (CASE type WHEN 'IN' THEN qty ELSE -qty END) ELSE 0 END) pre,
        SUM(CASE WHEN date>=$2 AND date<=$3 AND type='IN' THEN qty ELSE 0 END) inn,
        SUM(CASE WHEN date>=$2 AND date<=$3 AND type='OUT' THEN qty ELSE 0 END) outt
      FROM movements WHERE date<=$3 GROUP BY item_id) x ON x.item_id=i.id
    LEFT JOIN price_effective p ON p.item_code=i.code AND p.month=$4
    LEFT JOIN currency_rates cr ON cr.code=COALESCE(p.currency_code,'03')
    WHERE ($1::int IS NULL OR i.warehouse_id=$1) ORDER BY w.id, i.group_name, i.id`, [wh, start, end, m]);

  const v = (r, qty) => (r.price != null && r.rate != null ? qty * r.price * r.rate : null);
  const by = new Map(); let noPrice = 0;
  const T = { rows: items.length, open: 0, inn: 0, outt: 0, bal: 0, openV: 0, innV: 0, outV: 0, balV: 0 };
  const rowsDetail = items.map((r) => {
    const bal = r.open + r.inn - r.outt, d = { ...r, bal, balV: v(r, bal) };
    const k = r.wid, g = by.get(k) || { name: `${r.plant} · ${r.wname.replace('Gudang ', '')}`, rows: 0, open: 0, inn: 0, outt: 0, bal: 0, openV: 0, innV: 0, outV: 0, balV: 0 };
    if (r.price == null) noPrice++;
    for (const [t, o] of [[g, 1], [T, 0]]) {
      t.open += r.open; t.inn += r.inn; t.outt += r.outt; t.bal += bal; if (o) t.rows++;
      t.openV += v(r, r.open) ?? 0; t.innV += v(r, r.inn) ?? 0; t.outV += v(r, r.outt) ?? 0; t.balV += v(r, bal) ?? 0;
    }
    by.set(k, g); return d;
  });

  // Rekap per bulan (hanya laporan keseluruhan): saldo berjalan dari stok awal
  let months = [];
  if (!bulanan) {
    const mv = await q(`SELECT to_char(mv.date,'YYYY-MM') m,
        SUM(CASE WHEN mv.type='IN' THEN mv.qty ELSE 0 END) inn, SUM(CASE WHEN mv.type='OUT' THEN mv.qty ELSE 0 END) outt,
        SUM(CASE WHEN mv.type='IN' THEN mv.qty*p.price*cr.rate ELSE 0 END) "innV", SUM(CASE WHEN mv.type='OUT' THEN mv.qty*p.price*cr.rate ELSE 0 END) "outV"
      FROM movements mv JOIN items i ON i.id=mv.item_id
      LEFT JOIN price_effective p ON p.item_code=i.code AND p.month=to_char(mv.date,'YYYY-MM') LEFT JOIN currency_rates cr ON cr.code=COALESCE(p.currency_code,'03')
      WHERE ($1::int IS NULL OR i.warehouse_id=$1) GROUP BY 1 ORDER BY 1`, [wh]);
    let run = items.reduce((a, r) => a + r.open, 0), runV = T.openV;
    months = mv.map((x) => { const open = run, openV = runV; run += x.inn - x.outt; runV += x.innV - x.outV; return { ...x, open, bal: run, openV, balV: runV }; });
  }
  return { kind: bulanan ? 'bulanan' : 'semua', m, start: bulanan ? start : null, end: bulanan ? end : null, items: rowsDetail, warehouses: [...by.values()], total: T, months, noPrice };
}
