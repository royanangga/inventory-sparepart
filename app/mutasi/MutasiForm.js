'use client';
import { useFormState } from 'react-dom';
import { addMovement } from '../../lib/actions';
export default function MutasiForm({ items }) {
  const [st, action] = useFormState(addMovement, {});
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form action={action} className="card">
      <div className="bar">
        <input name="item" list="items" placeholder="Ketik kode / nama barang lalu pilih dari daftar" size={50} required />
        <datalist id="items">{items.map((i) => <option key={i.id} value={`${i.id} | ${i.code || '-'} | ${i.name || ''} ${i.spec || ''}`.trim()} />)}</datalist>
        <select name="type"><option value="IN">Masuk</option><option value="OUT">Keluar</option></select>
        <input name="qty" type="number" step="any" min="0.01" placeholder="Qty" style={{ width: 90 }} required />
        <input name="date" type="date" defaultValue={today} required />
        <input name="note" placeholder="Catatan / no. dokumen" />
        <button>Simpan</button>
      </div>
      {st?.error && <div className="err">{st.error}</div>}
      {st?.ok && <div className="ok">{st.ok}</div>}
    </form>
  );
}
