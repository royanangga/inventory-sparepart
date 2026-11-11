'use client';
import { useFormState } from 'react-dom';
import { login } from '../../lib/actions';
export default function Login() {
  const [st, action] = useFormState(login, {});
  return (
    <form action={action} className="card login">
      <h1>Masuk</h1>
      <input name="username" placeholder="Username" autoFocus required />
      <input name="password" type="password" placeholder="Password" required />
      {st?.error && <div className="err">{st.error}</div>}
      <button style={{ width: '100%' }}>Masuk</button>
    </form>
  );
}
