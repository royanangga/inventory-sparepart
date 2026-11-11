'use client';
import { useState } from 'react';
import { useFormState } from 'react-dom';
import { requestChange } from '../../lib/actions';
export default function RequestForm({ items, movs, min, max, def }) {
  const [st, action] = useFormState(requestChange, {});
  const [a, setA] = useState('EDIT');
  return (
    <form action={action} className="card">
      <div className="bar">
        <select name="action" value={a} onChange={(e) => setA(e.target.value)}>
          <option value="EDIT">Ubah mutasi</option><option value="DELETE">Hapus mutasi</option><option value="ADD">Tambah mutasi</option>
        </select>
        {a === 'ADD'
          ? <><input name="item" list="ritems" placeholder="Ketik kode / nama barang lalu pilih" size={44} required />
              <datalist id="ritems">{items.map((i) => <option key={i.id} value={`${i.id} | ${i.code || '-'} | ${i.name || ''} ${i.spec || ''}`.trim()} />)}</datalist></>
          : <select name="movement" required defaultValue=""><option value="" disabled>Pilih mutasi yang diubah…</option>
              {movs.map((m) => <option key={m.id} value={`${m.id} | ${m.date} ${m.type} ${m.qty} ${m.code || ''}`}>{m.date} · {m.type === 'IN' ? 'Masuk' : 'Keluar'} {m.qty} · {m.code || '-'} {m.name}</option>)}</select>}
      </div>
      {a !== 'DELETE' && (
        <div className="bar">
          <select name="type"><option value="IN">Masuk</option><option value="OUT">Keluar</option></select>
          <input name="qty" type="number" step="any" min="0.01" placeholder="Qty baru" style={{ width: 100 }} required />
          <input name="date" type="date" min={min} max={max} defaultValue={def} required />
          <input name="note" placeholder="Catatan" />
        </div>)}
      <div className="bar">
        <input name="reason" placeholder="Alasan perubahan (wajib)" size={60} required />
        <button>Kirim ke Accounting</button>
      </div>
      {st?.error && <div className="err">{st.error}</div>}
      {st?.ok && <div className="ok">{st.ok}</div>}
    </form>
  );
}
