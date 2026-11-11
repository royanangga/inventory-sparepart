import * as XLSX from 'xlsx';
import { getUser } from '../../../lib/auth';
import { q } from '../../../lib/db';
import { getRecon, reconJournal } from '../../../lib/recon';
import { thisMonth, validMonth } from '../../../lib/util';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const u = getUser();
  if (!u || u.role !== 'accounting') return new Response('Unauthorized', { status: 401 });
  const p = new URL(req.url).searchParams.get('m'), m = validMonth(p) ? p : thisMonth();
  const { list, total: T, start, end } = await getRecon(m);
  const R = Math.round;
  const wb = XLSX.utils.book_new(), add = (n, r) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r), n);
  const line = (w) => ({ Plant: w.label, 'IN aplikasi': R(w.in_v), 'IN di GL Persediaan': R(w.glIn), 'Reclass IN': w.adjIn, 'OUT aplikasi (→ Beban)': w.adjOut,
    'Penyesuaian bersih (+ Dr Persediaan / Cr Beban)': w.net, 'No. jurnal': w.je_ref || '', Diposting: w.posted ? 'Ya' : 'Belum' });
  add('Rekonsiliasi', [...list.map(line), { Plant: 'TOTAL', 'IN aplikasi': R(T.in_v), 'IN di GL Persediaan': R(T.glIn), 'Reclass IN': T.adjIn, 'OUT aplikasi (→ Beban)': T.adjOut,
    'Penyesuaian bersih (+ Dr Persediaan / Cr Beban)': T.net }]);
  add('Draft Jurnal', list.flatMap((w) => reconJournal(w).flatMap((j) => [
    { Plant: j.plant, Keterangan: j.ket, Akun: j.dr, Debit: j.amt, Kredit: '' }, { Plant: j.plant, Keterangan: j.ket, Akun: j.cr, Debit: '', Kredit: j.amt }])));
  const det = await q(`SELECT w.plant gudang, i.group_name kelompok, i.code kode, i.name item, i.spec spesifikasi,
      SUM(CASE WHEN mv.type='IN' THEN mv.qty ELSE 0 END) qty_in, SUM(CASE WHEN mv.type='OUT' THEN mv.qty ELSE 0 END) qty_out, p.price harga, cr.rate kurs
    FROM movements mv JOIN items i ON i.id=mv.item_id JOIN warehouses w ON w.id=i.warehouse_id
    LEFT JOIN price_master p ON p.item_code=i.code AND p.month=$3 LEFT JOIN currency_rates cr ON cr.code=COALESCE(p.currency_code,'03')
    WHERE mv.date>=$1 AND mv.date<=$2 GROUP BY w.id, w.plant, w.name, i.id, p.price, cr.rate ORDER BY w.id, i.group_name, i.id`, [start, end, m]);
  const val = (r, k) => (r.harga != null && r.kurs != null ? R(r[k] * r.harga * r.kurs) : '');
  const d = (r, k) => ({ Plant: r.gudang, Kelompok: r.kelompok, Kode: r.kode, Item: r.item, Spesifikasi: r.spesifikasi, Qty: r[k], Harga: r.harga ?? '', 'Nilai (IDR)': val(r, k) });
  add('Detail IN (Persediaan)', det.filter((r) => r.qty_in > 0).map((r) => d(r, 'qty_in')));
  add('Detail OUT (Beban)', det.filter((r) => r.qty_out > 0).map((r) => d(r, 'qty_out')));
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return new Response(buf, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="rekonsiliasi-${m}.xlsx"`, 'Cache-Control': 'no-store' } });
}
