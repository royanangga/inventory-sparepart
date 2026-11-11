import { requireUser } from '../../lib/auth';
import PasswordForm from './PasswordForm';
export const metadata = { title: 'Ganti Password' };
export default function Akun() {
  const u = requireUser();
  return (
    <>
      <h1>Ganti password</h1>
      <p className="muted lead">Akun <b>{u.u}</b> · {u.name}</p>
      <PasswordForm username={u.u} />
    </>
  );
}
