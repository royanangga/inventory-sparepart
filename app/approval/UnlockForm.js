'use client';
import { unlockMonth } from '../../lib/actions';
export default function UnlockForm({ wh, month }) {
  return (
    <form action={unlockMonth} className="bar" style={{ margin: 0 }}
      onSubmit={(e) => { if (!confirm(`Buka kunci ${month}? Permintaan perubahan yang masih menunggu untuk bulan ini akan otomatis ditolak.`)) e.preventDefault(); }}>
      <input type="hidden" name="wh" value={wh} /><input type="hidden" name="month" value={month} />
      <input name="reason" placeholder="Alasan buka kunci (wajib)" required minLength={3} size={30} />
      <button>Buka kunci</button>
    </form>
  );
}
