'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ConfirmDialog from '../ConfirmDialog';
import PeriodPicker from '../PeriodPicker';

const pad = (n) => String(n).padStart(2, '0');
function iso(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  const s = String(v).trim(), m = s.match(/^(\d{4})(\d{2})(\d{2})$/) || s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
const txt = (v) => (v == null ? null : String(v).trim() || null);

const lastDay = (m) => { const [y, mo] = m.split('-').map(Number); return `${m}-${pad(new Date(y, mo, 0).getDate())}`; };

export default function PriceImport({ counts = {}, defaultMonth, maxMonth }) {
  const router = useRouter();
  const [info, setInfo] = useState('');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState('');
  const [dlg, setDlg] = useState(false);
  const [month, setMonth] = useState(defaultMonth);

  async function onFile(e) {
    const f = e.target.files[0]; if (!f) return;
    if (!month) { setInfo('Pilih periode yang valid dulu.'); e.target.value = ''; return; }
    setBusy(true); setRes(null); setFile(f.name); setInfo('Membaca file (file besar, tunggu sebentar)…');
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: true, dense: true });
      let rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
      const hi = rows.findIndex((r) => r.some((c) => String(c).trim().toLowerCase() === 'item_code'));
      if (hi < 0) throw new Error('Kolom Item_Code tidak ditemukan');
      const H = rows[hi].map((c) => String(c ?? '').trim().toLowerCase());
      const ix = (n) => H.indexOf(n);
      const [cc, cp, cd, cl, cu, ct, cn, cr] = ['item_code', 'price', 'start_date', 'last_update', 'unit_cls', 'trade_code', 'trade_name', 'currency_code'].map(ix);
      if (cc < 0 || cp < 0 || cd < 0) throw new Error('Kolom Item_Code / Price / Start_Date wajib ada');
      const td = lastDay(month); // harga yang berlaku s/d akhir periode
      const best = new Map(); let read = 0, ignored = 0;
      for (let i = hi + 1; i < rows.length; i++) {
        const r = rows[i]; const code = txt(r[cc]); if (!code) continue; read++;
        const price = Number(r[cp]), d = iso(r[cd]);
        if (!(price > 0) || !d || d > td) { ignored++; continue; } // harga 0 / tanggal kosong / Start_Date setelah akhir periode (mis. 9999) diabaikan
        const lu = r[cl] ? String(r[cl]) : '';
        const cand = { c: code, p: price, cur: txt(r[cr]), u: txt(r[cu]), t: txt(r[ct]), tn: txt(r[cn]), d, f: false, lu };
        const b = best.get(code);
        if (!b || d > b.d) best.set(code, cand);
        else if (d === b.d) { const f = b.f || b.p !== price; if (lu > b.lu) best.set(code, { ...cand, f }); else b.f = f; }
      }
      rows = null;
      const list = [...best.values()];
      setRes({ month, list, read, ignored, conflicts: list.filter((x) => x.f).length });
      setInfo('');
    } catch (err) { setInfo('Gagal: ' + err.message); }
    setBusy(false);
  }

  async function save() {
    setBusy(true);
    try {
      const { list } = res, size = 2000;
      for (let i = 0; i < list.length; i += size) {
        setInfo(`Menyimpan ${Math.min(i + size, list.length)} / ${list.length}…`);
        const r = await fetch('/api/price', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month: res.month, first: i === 0, rows: list.slice(i, i + size) }) });
        if (!r.ok) throw new Error('Server menolak data (' + r.status + ')');
      }
      await fetch('/api/price', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ done: 1, month: res.month, filename: file, rowsRead: res.read, items: list.length, conflicts: res.conflicts }) });
      setInfo(`Selesai: ${list.length} item tersimpan untuk periode ${res.month}.`); setRes(null); router.refresh();
    } catch (err) { setInfo('Gagal: ' + err.message); }
    setBusy(false);
  }

  return (
    <div className="card">
      <p>Pilih <b>periode</b> lalu file price master (.xlsx). Harga yang diupload berlaku untuk <b>jurnal adjustment dan laporan periode tersebut</b>. Sistem mengambil <b>harga dengan Start_Date terbaru per Item_Code</b> (paling lambat akhir periode); file dibaca di browser, lalu hasil ringkasnya saja yang dikirim ke server.</p>
      <div className="bar"><b>Periode</b> <PeriodPicker name="month" defaultValue={defaultMonth} min="2026-10" max={maxMonth} onChange={(v) => { setMonth(v); setRes(null); }} /></div>
      <input type="file" accept=".xlsx,.xls" onChange={onFile} disabled={busy || !month} />
      {info && <p>{info}</p>}
      {res && (
        <div>
          <p>{res.read.toLocaleString('id-ID')} baris dibaca → <b>{res.list.length.toLocaleString('id-ID')} item</b> unik. {res.ignored} baris diabaikan (harga ≤ 0 / tanggal kosong / Start_Date setelah akhir periode {res.month}).
            {res.conflicts > 0 && <> <b className="warn">{res.conflicts} item</b> punya beberapa supplier dengan Start_Date sama tetapi harga berbeda (dipilih yang Last_Update terbaru, ditandai di halaman stok).</>}</p>
          <button onClick={() => setDlg(true)} disabled={busy}>Simpan ke database</button>
          <ConfirmDialog open={dlg} title={`Simpan price master periode ${res.month}?`} intro={`Berkas ${file}. Seluruh harga periode ${res.month} akan diganti dengan isi berkas ini (periode lain tidak berubah).`} confirmText="Simpan ke database"
            rows={[{ label: `Item berharga periode ${res.month}`, from: (counts[res.month] || 0).toLocaleString('id-ID'), to: res.list.length.toLocaleString('id-ID') }, { label: 'Item dengan harga beda antar supplier', from: '—', to: String(res.conflicts) }]}
            onConfirm={() => { setDlg(false); save(); }} onCancel={() => setDlg(false)} />
        </div>
      )}
    </div>
  );
}
