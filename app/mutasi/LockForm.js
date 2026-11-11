'use client';
import ConfirmForm from '../ConfirmForm';
import { lockMonth } from '../../lib/actions';
export default function LockForm({ month }) {
  const build = () => ({ title: `Kunci data ${month}?`, intro: 'Setelah dikunci, perubahan harus diajukan dan disetujui Accounting.', confirmText: 'Kunci bulan',
    rows: [{ label: `Status ${month}`, from: 'Terbuka (bisa diedit langsung)', to: 'Terkunci (perlu approval)' }] });
  return (
    <ConfirmForm action={lockMonth} build={build}>
      <input type="hidden" name="month" value={month} />
      <button>Selesai input &amp; kunci bulan {month}</button>
    </ConfirmForm>);
}
