'use client';
import { useFormState } from 'react-dom';
import { decideRequest } from '../../lib/actions';
export default function Decision({ id }) {
  const [st, action] = useFormState(decideRequest, {});
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input name="note" placeholder="Catatan (wajib jika menolak)" style={{ width: 210 }} />
      <div className="bar" style={{ margin: '6px 0 0' }}>
        <button name="decision" value="APPROVE">Setujui</button>
        <button name="decision" value="REJECT" style={{ background: '#b3261e', borderColor: '#b3261e' }}>Tolak</button>
      </div>
      {st?.error && <div className="err">{st.error}</div>}
    </form>
  );
}
