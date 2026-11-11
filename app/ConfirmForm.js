'use client';
import { useRef, useState } from 'react';
import ConfirmDialog from './ConfirmDialog';
// build(formData, submitterValue) -> {title, intro, rows:[{label,from,to}], tone, confirmText} atau null (kirim langsung / biarkan server memvalidasi)
export default function ConfirmForm({ action, build, children, ...rest }) {
  const form = useRef(null), sub = useRef(null), go = useRef(false);
  const [dlg, setDlg] = useState(null);
  function onSubmit(e) {
    if (go.current) { go.current = false; return; }
    const s = e.nativeEvent.submitter || null;
    const d = build(new FormData(e.currentTarget), s?.value);
    if (!d) return;
    e.preventDefault(); sub.current = s; setDlg(d);
  }
  const confirm = () => { go.current = true; setDlg(null); form.current.requestSubmit(sub.current || undefined); };
  return (
    <>
      <form ref={form} action={action} onSubmit={onSubmit} {...rest}>{children}</form>
      <ConfirmDialog open={!!dlg} {...(dlg || {})} onConfirm={confirm} onCancel={() => setDlg(null)} />
    </>
  );
}
