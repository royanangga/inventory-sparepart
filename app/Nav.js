'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
export default function Nav({ items }) {
  const p = usePathname();
  return (
    <nav aria-label="Menu utama">
      {items.map((i) => <Link key={i.href} href={i.href} className={p === i.href ? 'on' : ''} aria-current={p === i.href ? 'page' : undefined}>{i.label}{i.badge > 0 && <span className="pill">{i.badge}</span>}</Link>)}
    </nav>
  );
}
