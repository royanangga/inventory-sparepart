'use client';
import { lockMonth } from '../../lib/actions';
export default function LockForm({ month }) {
  return (
    <form action={lockMonth} onSubmit={(e) => { if (!confirm(`Kunci data ${month}? Setelah dikunci, perubahan harus disetujui Accounting.`)) e.preventDefault(); }}>
      <input type="hidden" name="month" value={month} />
      <button>Selesai input &amp; kunci bulan {month}</button>
    </form>
  );
}
