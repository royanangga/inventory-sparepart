'use client';
import { useState } from 'react';
const BLN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
// Bulan dipilih dari daftar Jan-Des, tahun diketik manual; nilai dikirim sebagai name="m" format YYYY-MM
export default function PeriodPicker({ name = 'm', defaultValue, min, max }) {
  const [y0, m0] = defaultValue.split('-');
  const [y, setY] = useState(y0), [m, setM] = useState(m0);
  const v = /^\d{4}$/.test(y) ? `${y}-${m}` : '';
  const hint = !v ? 'Tahun harus 4 angka, mis. 2026' : (min && v < min) || (max && v > max) ? `Periode tersedia ${min || '…'} s/d ${max || '…'}` : '';
  return (
    <span className="period">
      <select aria-label="Bulan periode" value={m} onChange={(e) => setM(e.target.value)}>
        {BLN.map((b, i) => <option key={b} value={String(i + 1).padStart(2, '0')}>{b}</option>)}
      </select>
      <input inputMode="numeric" maxLength={4} size={4} placeholder="2026" aria-label="Tahun periode" aria-invalid={!v} value={y} onChange={(e) => setY(e.target.value.replace(/\D/g, '').slice(0, 4))} />
      <input type="hidden" name={name} value={v} />
      {hint && <small className="warn" role="status">{hint}</small>}
    </span>
  );
}
