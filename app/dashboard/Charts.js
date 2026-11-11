const cmp = new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 });
export const COL = ['#0f766e', '#f2a900', '#64748b', '#c2410c'];
export function Bars({ data, label }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <ul className="bars" aria-label={label}>
      {data.map((d, i) => (
        <li key={d.label}><span className="bl" title={d.label}>{d.label}</span>
          <span className="bt"><span className="bf" style={{ '--w': `${Math.max((d.value / max) * 100, 1)}%`, '--d': `${i * 70}ms` }} /></span>
          <b>{cmp.format(d.value)}</b></li>))}
    </ul>);
}
export function Donut({ parts, center, sub, label }) {
  const R = 52, C = 2 * Math.PI * R, tot = parts.reduce((a, p) => a + p.value, 0) || 1; let acc = 0;
  return (
    <div className="donut">
      <svg viewBox="0 0 140 140" role="img" aria-label={label}>
        <circle cx="70" cy="70" r={R} fill="none" stroke="#e6ecef" strokeWidth="16" />
        {parts.map((p, i) => { const len = (p.value / tot) * C, off = -acc; acc += len;
          return <circle key={i} className="seg" cx="70" cy="70" r={R} fill="none" stroke={p.color} strokeWidth="16" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={off} transform="rotate(-90 70 70)" style={{ '--len': len, '--c': C, animationDelay: `${i * 150}ms` }} />; })}
        <text x="70" y="68" textAnchor="middle" className="dn">{center}</text><text x="70" y="86" textAnchor="middle" className="ds">{sub}</text>
      </svg>
      <ul>{parts.map((p) => <li key={p.label}><i style={{ background: p.color }} />{p.label} <b>{cmp.format(p.value)}</b></li>)}</ul>
    </div>);
}
export function Flow({ data, label }) {
  const max = Math.max(...data.flatMap((d) => [d.inn, d.outt]), 1), H = 150;
  return (
    <div className="flow" role="img" aria-label={label}>
      {data.map((d, i) => (
        <div key={d.m} className="fc"><div className="fb">
          <span className="in" style={{ height: (d.inn / max) * H, animationDelay: `${i * 90}ms` }} title={`Masuk ${d.inn}`} />
          <span className="out" style={{ height: (d.outt / max) * H, animationDelay: `${i * 90 + 60}ms` }} title={`Keluar ${d.outt}`} /></div>
          <small>{d.m}</small></div>))}
      {!data.length && <p className="muted">Belum ada mutasi.</p>}
    </div>);
}
