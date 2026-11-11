import * as XLSX from 'xlsx';
import { getUser } from '../../../lib/auth';
import { getReport, reportMonth } from '../../../lib/report';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const u = getUser();
  if (!u) return new Response('Unauthorized', { status: 401 });
  const sp = new URL(req.url).searchParams, acc = u.role === 'accounting';
  const kind = sp.get('r') === 'semua' ? 'semua' : 'bulanan', m = reportMonth(sp.get('m'));
  const R = await getReport(kind, m, acc ? null : u.wh);
  const val = (x) => (x == null ? '' : Math.round(x));
  const sumRow = (g) => ({ Gudang: g.name, 'Baris barang': g.rows ?? '', 'Stok awal': g.open, Masuk: g.inn, Keluar: g.outt, 'Saldo akhir': g.bal,
    ...(acc ? { 'Nilai akhir (IDR)': val(g.balV) } : {}) });
  const wb = XLSX.utils.book_new();
  const add = (name, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
  add('Ringkasan Gudang', [...R.warehouses.map(sumRow), sumRow({ ...R.total, name: 'TOTAL' })]);
  if (kind === 'semua') add('Per Bulan', R.months.map((x) => ({ Bulan: x.m, 'Saldo awal': x.open, Masuk: x.inn, Keluar: x.outt, 'Saldo akhir': x.bal, ...(acc ? { 'Nilai akhir (IDR)': val(x.balV) } : {}) })));
  add('Detail Barang', R.items.map((r) => ({ Gudang: `${r.plant} · ${r.wname.replace('Gudang ', '')}`, Kelompok: r.group_name, Kode: r.code, Item: r.name, Spesifikasi: r.spec,
    'Stok awal': r.open, Masuk: r.inn, Keluar: r.outt, 'Saldo akhir': r.bal, ...(acc ? { Harga: r.price ?? '', 'Nilai akhir (IDR)': val(r.balV) } : {}) })));
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const name = kind === 'semua' ? 'laporan-keseluruhan' : `laporan-bulanan-${m}`;
  return new Response(buf, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${name}.xlsx"`, 'Cache-Control': 'no-store' } });
}
