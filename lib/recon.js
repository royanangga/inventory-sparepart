import { q } from './db';
import { monthRange } from './util';

// Harga memakai price master PERIODE m saja (tidak ada fallback ke periode lain).
// Rekonsiliasi bulanan: sub-ledger aplikasi (nilai IN / OUT = qty x harga x kurs) vs. nilai yang sudah ada di akun Persediaan GL.
//  IN  -> seharusnya masuk Persediaan : Adj IN  = IN aplikasi  - IN di GL Persediaan  (+ = Dr Persediaan / Cr Beban)
//  OUT -> seharusnya masuk Beban      : Adj OUT = OUT aplikasi - OUT di GL Persediaan (+ = Dr Beban / Cr Persediaan)
export async function getRecon(m) {
  const [start, end] = monthRange(m);
  const rows = await q(`
    WITH x AS (
      SELECT i.warehouse_id wid, i.stock_sep + COALESCE(s.pre,0) op, COALESCE(s.inn,0) inn, COALESCE(s.outt,0) outt, p.price*cr.rate pr
      FROM items i
      LEFT JOIN (SELECT item_id,
          SUM(CASE WHEN date<$1 THEN (CASE type WHEN 'IN' THEN qty ELSE -qty END) ELSE 0 END) pre,
          SUM(CASE WHEN date>=$1 AND type='IN' THEN qty ELSE 0 END) inn,
          SUM(CASE WHEN date>=$1 AND type='OUT' THEN qty ELSE 0 END) outt
        FROM movements WHERE date<=$2 GROUP BY item_id) s ON s.item_id=i.id
      LEFT JOIN price_master p ON p.item_code=i.code AND p.month=$3
      LEFT JOIN currency_rates cr ON cr.code=COALESCE(p.currency_code,'03'))
    SELECT w.id, w.plant, w.name, COALESCE(SUM(op),0) open_q, COALESCE(SUM(inn),0) in_q, COALESCE(SUM(outt),0) out_q,
      COALESCE(SUM(op*pr),0) open_v, COALESCE(SUM(inn*pr),0) in_v, COALESCE(SUM(outt*pr),0) out_v,
      COUNT(*) FILTER (WHERE pr IS NULL AND (inn<>0 OR outt<>0)) nop,
      l.locked_by, r.gl_in, r.gl_out, r.je_ref, r.note, r.posted, r.updated_by, r.updated_at
    FROM warehouses w LEFT JOIN x ON x.wid=w.id
    LEFT JOIN period_locks l ON l.warehouse_id=w.id AND l.month=$3
    LEFT JOIN recon r ON r.warehouse_id=w.id AND r.month=$3
    GROUP BY w.id, l.locked_by, r.gl_in, r.gl_out, r.je_ref, r.note, r.posted, r.updated_by, r.updated_at ORDER BY w.id`, [start, end, m]);
  const R = (v) => Math.round(v);
  const list = rows.map((r) => {
    const glIn = r.gl_in ?? 0, glOut = r.gl_out ?? 0;
    const adjIn = R(r.in_v) - R(glIn), adjOut = R(r.out_v) - R(glOut), net = adjIn - adjOut; // net + = Dr Persediaan / Cr Beban
    return { ...r, label: `${r.plant} · ${r.name.replace('Gudang ', '')}`, glIn, glOut, adjIn, adjOut, net, saved: r.updated_at != null };
  });
  const sum = (k) => list.reduce((a, r) => a + (r[k] || 0), 0);
  const total = Object.fromEntries(['in_v', 'out_v', 'glIn', 'glOut', 'adjIn', 'adjOut', 'net', 'nop'].map((k) => [k, sum(k)]));
  return { list, total, start, end };
}
