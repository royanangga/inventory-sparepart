'use client';
import { useState } from 'react';
import { buildTemplate, parseMutasi } from '../../lib/mutasiImport';

// Unduh template & import mutasi bulanan dari Excel. Berada di LUAR form simpan (file tidak ikut terkirim ke server);
// hasil import hanya mengisi tabel, penyimpanan tetap lewat tombol Simpan / Ajukan perubahan.
export default function ImportMutasi({ rows, vals, month, prev, wh, locked, dirty, onApply, onReset }) {
  const [busy, setBusy] = useState(false), [res, setRes] = useState(null);
  async function download() {
    const XLSX = await import('xlsx');
    XLSX.writeFile(buildTemplate(XLSX, { rows, vals, month, prev, wh }), `Mutasi-${wh.code}-${month}.xlsx`);
  }
  async function onFile(e) {
    const f = e.target.files[0]; if (!f) return;
    setBusy(true); setRes(null);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      const r = parseMutasi(XLSX, wb, { rows, vals, month, whCode: wh.code });
      if (r.error) setRes({ error: r.error });
      else { onApply(r.updates); setRes({ ...r.report, file: f.name }); }
    } catch { setRes({ error: 'File tidak bisa dibaca. Pastikan formatnya .xlsx, .xls, atau .csv.' }); }
    setBusy(false); e.target.value = '';
  }
  const R = res, shown = R?.issues?.slice(0, 30) || [];
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="bar" style={{ marginBottom: 0 }}>
        <b>Import dari Excel</b>
        <button type="button" className="ghost" onClick={download}>Unduh template Excel</button>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} disabled={busy} aria-label="Pilih file Excel mutasi" />
        {dirty && <button type="button" className="ghost" onClick={() => { onReset(); setRes(null); }}>Batalkan semua isian</button>}
      </div>
      <p className="muted" style={{ margin: '8px 0 0' }}>Template berisi semua barang gudang ini beserta angka Masuk/Keluar saat ini; isi atau ubah angkanya lalu upload lagi. File sendiri juga bisa, asalkan ada kolom <b>Kode</b> dan <b>Masuk</b> / <b>Keluar</b>. Hasil import hanya mengisi tabel di bawah, belum tersimpan sampai Anda klik {locked ? 'Ajukan perubahan' : 'Simpan'}.</p>
      {busy && <p>Membaca file…</p>}
      {R?.error && <div className="err">{R.error}</div>}
      {R && !R.error && <>
        <div className={R.matched ? 'ok' : 'err'}>{R.file}: {R.lines} baris dibaca, <b>{R.matched} barang cocok</b> ({R.changed} berubah dari data tersimpan, {R.same} sama).
          {R.matched > 0 && <> Isian sudah masuk ke tabel (baris kuning = berubah). Periksa lalu klik {locked ? 'Ajukan perubahan' : 'Simpan'}.</>}</div>
        {R.dup > 0 && <p className="muted" style={{ margin: '6px 0 0' }}>{R.dup} barang muncul lebih dari sekali di file, angkanya dijumlahkan.</p>}
        {R.neg > 0 && <div className="err">{R.neg} barang jadi bersaldo negatif (merah di tabel). Perbaiki dulu sebelum menyimpan.</div>}
        {R.issues.length > 0 && <details open style={{ marginTop: 8 }}><summary><b className="warn">{R.issues.length} baris tidak diproses</b></summary>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{shown.map((t, i) => <li key={i}>{t}</li>)}{R.issues.length > shown.length && <li className="muted">dan {R.issues.length - shown.length} lainnya</li>}</ul></details>}
      </>}
    </div>);
}
