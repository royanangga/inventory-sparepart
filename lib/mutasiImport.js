// Import mutasi stok bulanan dari Excel: template + pembacaan file. Fungsi murni (XLSX dikirim dari luar) supaya mudah diuji.
// Hasil import TIDAK langsung disimpan: nilainya diisikan ke tabel Input Mutasi, lalu user menyimpan / mengajukan lewat tombol yang ada
// (sehingga validasi saldo negatif, kunci bulan, dan approval Accounting tetap berlaku).
const norm = (v) => String(v ?? '').toLowerCase().replace(/[^a-z]/g, '');
const ck = (v) => String(v ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
const blank = (v) => v == null || String(v).trim() === '';
const H_ID = ['id', 'idbarang', 'iditem'], H_CODE = ['kode', 'kodebarang', 'kodeitem', 'code', 'itemcode'], H_IN = ['masuk', 'in', 'qtyin', 'qtymasuk'], H_OUT = ['keluar', 'out', 'qtyout', 'qtykeluar'];
const R6 = (x) => Math.round(x * 1e6) / 1e6;
const fmt = (x) => (x ? String(R6(x)) : '');
const gridNum = (s) => { const t = String(s ?? '').trim().replace(',', '.'); return t === '' ? 0 : Number(t); }; // sama dengan tabel Input Mutasi
// Sel Excel -> angka. Kosong = 0; "1,5" = 1.5; "1.234,5" = 1234.5; selain itu NaN
const num = (v) => {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  let t = String(v).trim(); if (t === '' || t === '-') return 0;
  t = t.includes(',') && t.includes('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
};

export function buildTemplate(XLSX, { rows, vals, month, prev, wh }) {
  const head = ['ID', 'Kelompok', 'Kode', 'Item', 'Spesifikasi', `Stok akhir ${prev}`, 'Masuk', 'Keluar'];
  const data = rows.map((r) => { const v = vals[r.id] || {}, i = gridNum(v.in), o = gridNum(v.out); return [r.id, r.group ?? '', r.code ?? '', r.name ?? '', r.spec ?? '', r.open, i || null, o || null]; });
  const ws = XLSX.utils.aoa_to_sheet([head, ...data]);
  ws['!cols'] = [{ wch: 8 }, { wch: 18 }, { wch: 16 }, { wch: 38 }, { wch: 28 }, { wch: 16 }, { wch: 10 }, { wch: 10 }];
  const guide = XLSX.utils.aoa_to_sheet([
    ['Petunjuk import mutasi'],
    ['1. Isi kolom Masuk dan Keluar pada sheet Mutasi (kosong = 0). Jangan ubah kolom ID dan sheet Info.'],
    ['2. Barang yang tidak ada di file tidak diubah. Satu barang yang muncul beberapa kali: angkanya dijumlahkan.'],
    ['3. Tanpa template: file cukup punya kolom Kode dan Masuk dan/atau Keluar. Kolom Masuk/Keluar yang tidak ada di file tidak diubah.'],
    ['4. Kode yang dipakai lebih dari satu baris barang di gudang (mis. sisi R/L) wajib memakai kolom ID dari template.'],
    ['5. Import hanya mengisi tabel Input Mutasi. Periksa hasilnya, lalu klik Simpan (atau Ajukan perubahan bila bulan terkunci).'],
  ]);
  guide['!cols'] = [{ wch: 120 }];
  const info = XLSX.utils.aoa_to_sheet([['Periode', month], ['Gudang', wh.code], ['Nama gudang', wh.name]]);
  info['!cols'] = [{ wch: 14 }, { wch: 28 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Mutasi'); XLSX.utils.book_append_sheet(wb, guide, 'Petunjuk'); XLSX.utils.book_append_sheet(wb, info, 'Info');
  return wb;
}

function readInfo(XLSX, wb) {
  const name = wb.SheetNames.find((n) => n.toLowerCase() === 'info'); if (!name) return {};
  const o = {};
  for (const r of XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null })) if (r[0] != null) o[norm(r[0])] = r[1] == null ? '' : String(r[1]).trim();
  return { month: o.periode, wh: o.gudang };
}

// rows: baris tabel Input Mutasi [{id, code, name, open, inn, outt, pend}], vals: isian tabel saat ini {id: {in, out}}
export function parseMutasi(XLSX, wb, { rows, vals, month, whCode }) {
  const info = readInfo(XLSX, wb);
  if (/^\d{4}-\d{2}$/.test(info.month || '') && info.month !== month) return { error: `File ini dibuat untuk periode ${info.month}, sedangkan periode yang dibuka ${month}. Ganti periode di atas atau unduh template yang sesuai.` };
  if (info.wh && whCode && info.wh.toLowerCase() !== whCode.toLowerCase()) return { error: `File ini dibuat untuk gudang ${info.wh}, bukan gudang Anda (${whCode}).` };
  const sn = wb.SheetNames.find((n) => n.toLowerCase() === 'mutasi') || wb.SheetNames.find((n) => !['info', 'petunjuk'].includes(n.toLowerCase()));
  if (!sn) return { error: 'Sheet data tidak ditemukan di file ini.' };
  const grid = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: null });
  let hi = -1, c = null;
  for (let i = 0; i < Math.min(grid.length, 30) && hi < 0; i++) {
    const h = grid[i].map(norm), f = (names) => h.findIndex((x) => names.includes(x));
    const t = { id: f(H_ID), code: f(H_CODE), in: f(H_IN), out: f(H_OUT) };
    if ((t.id >= 0 || t.code >= 0) && (t.in >= 0 || t.out >= 0)) { hi = i; c = t; }
  }
  if (hi < 0) return { error: 'Header tidak dikenali. File wajib punya kolom Kode (atau ID) dan Masuk dan/atau Keluar. Gunakan tombol Unduh template untuk contoh format.' };

  const byId = new Map(rows.map((r) => [r.id, r])), byCode = new Map();
  for (const r of rows) if (!blank(r.code)) { const k = ck(r.code); byCode.set(k, [...(byCode.get(k) || []), r]); }
  const label = (r) => `${r.code || '-'} ${r.name || ''}`.trim();
  const acc = new Map(), issues = []; let lines = 0;
  for (let i = hi + 1; i < grid.length; i++) {
    const g = grid[i], n = i + 1;
    const idv = c.id >= 0 ? g[c.id] : null, cv = c.code >= 0 ? g[c.code] : null, iv = c.in >= 0 ? g[c.in] : null, ov = c.out >= 0 ? g[c.out] : null;
    if ([idv, cv, iv, ov].every(blank)) continue;
    lines++;
    let r;
    if (!blank(idv)) {
      r = byId.get(parseInt(idv, 10));
      if (!r) { issues.push(`Baris ${n}: ID ${idv} tidak ditemukan di gudang Anda`); continue; }
      if (!blank(cv) && !blank(r.code) && ck(cv) !== ck(r.code)) { issues.push(`Baris ${n}: Kode "${cv}" berbeda dengan kode barang ber-ID ${idv} ("${r.code}")`); continue; }
    } else if (!blank(cv)) {
      const l = byCode.get(ck(cv));
      if (!l) { issues.push(`Baris ${n}: Kode ${cv} tidak ditemukan di gudang Anda`); continue; }
      if (l.length > 1) { issues.push(`Baris ${n}: Kode ${cv} dipakai ${l.length} baris barang, gunakan kolom ID dari template`); continue; }
      r = l[0];
    } else { issues.push(`Baris ${n}: tidak ada ID / Kode`); continue; }
    if (r.pend) { issues.push(`Baris ${n}: ${label(r)} masih menunggu approval, dilewati`); continue; }
    const a = c.in >= 0 ? num(iv) : null, b = c.out >= 0 ? num(ov) : null;
    if (Number.isNaN(a) || Number.isNaN(b) || a < 0 || b < 0) { issues.push(`Baris ${n}: angka Masuk/Keluar pada ${label(r)} tidak valid`); continue; }
    const e = acc.get(r.id) || { in: c.in >= 0 ? 0 : null, out: c.out >= 0 ? 0 : null, n: 0 };
    if (a != null) e.in += a;
    if (b != null) e.out += b;
    e.n++; acc.set(r.id, e);
  }
  const updates = {}; let changed = 0, same = 0, neg = 0, dup = 0;
  for (const [id, e] of acc) {
    const r = byId.get(id), cur = vals[id] || { in: '', out: '' };
    const u = { in: e.in == null ? cur.in : fmt(e.in), out: e.out == null ? cur.out : fmt(e.out) };
    updates[id] = u;
    const ni = gridNum(u.in), no = gridNum(u.out);
    if (ni !== r.inn || no !== r.outt) changed++; else same++;
    if (r.open + ni - no < 0) neg++;
    if (e.n > 1) dup++;
  }
  return { updates, report: { lines, matched: acc.size, changed, same, dup, neg, issues } };
}
