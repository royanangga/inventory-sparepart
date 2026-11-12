import { q } from './db';
import { monthRange } from './util';

// Harga memakai price master PERIODE m saja (tidak ada fallback ke periode lain).
// Rekonsiliasi bulanan PER PLANT (Sunter / KIIC / SC1 / SC2) - gudang/divisi dalam satu plant digabung.
// Sub-ledger aplikasi (nilai IN / OUT = qty x harga x kurs) vs. nilai yang sudah ada di akun Persediaan GL.
//  IN  -> seharusnya masuk Persediaan : Reclass IN = IN aplikasi - IN di GL Persediaan (+ = Dr Persediaan / Cr Beban)
//  OUT -> nilai di GL tidak diketahui, jadi seluruh OUT aplikasi diambil dari sistem dan dibebankan (Dr Beban / Cr Persediaan)
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
      LEFT JOIN price_effective p ON p.item_code=i.code AND p.month=$3
      LEFT JOIN currency_rates cr ON cr.code=COALESCE(p.currency_code,'03')),
    a AS (
      SELECT w.plant, MIN(w.id) first_id, COUNT(DISTINCT w.id) wh_n, COUNT(DISTINCT l.warehouse_id) lock_n,
        COALESCE(SUM(op),0) open_q, COALESCE(SUM(inn),0) in_q, COALESCE(SUM(outt),0) out_q,
        COALESCE(SUM(op*pr),0) open_v, COALESCE(SUM(inn*pr),0) in_v, COALESCE(SUM(outt*pr),0) out_v,
        COUNT(*) FILTER (WHERE pr IS NULL AND (inn<>0 OR outt<>0)) nop
      FROM warehouses w LEFT JOIN x ON x.wid=w.id
      LEFT JOIN period_locks l ON l.warehouse_id=w.id AND l.month=$3
      GROUP BY w.plant)
    SELECT a.*, r.gl_in, r.je_ref, r.note, r.posted, r.updated_by, r.updated_at
    FROM a LEFT JOIN recon_plant r ON r.plant=a.plant AND r.month=$3 ORDER BY a.first_id`, [start, end, m]);
  const R = (v) => Math.round(v);
  const list = rows.map((r) => {
    const glIn = r.gl_in ?? 0;
    const adjIn = R(r.in_v) - R(glIn), adjOut = R(r.out_v), net = adjIn - adjOut; // net + = Dr Persediaan / Cr Beban
    const locked = r.wh_n > 0 && r.lock_n >= r.wh_n, partial = r.lock_n > 0 && !locked;
    return { ...r, id: r.plant, label: r.plant, locked, partial, glIn, adjIn, adjOut, net, saved: r.updated_at != null };
  });
  const sum = (k) => list.reduce((a, r) => a + (r[k] || 0), 0);
  const total = Object.fromEntries(['in_v', 'out_v', 'glIn', 'adjIn', 'adjOut', 'net', 'nop'].map((k) => [k, sum(k)]));
  return { list, total, start, end };
}

// Satu jurnal penyesuaian per plant = nominal bersih (Reclass IN − OUT sistem). net + = Dr Persediaan / Cr Beban.
const nf = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const fm = (v) => (v < 0 ? `(${nf.format(-v)})` : nf.format(v));
export function reconJournal(w) {
  if (w.net === 0) return [];
  const up = w.net > 0;
  return [{ plant: w.label, ket: `Reclass IN ${fm(w.adjIn)} − OUT ${fm(w.adjOut)}`, dr: up ? 'Persediaan Sparepart' : 'Beban Sparepart', cr: up ? 'Beban Sparepart' : 'Persediaan Sparepart', amt: Math.abs(w.net) }];
}
