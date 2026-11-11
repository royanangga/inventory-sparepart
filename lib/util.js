const jkt = () => new Date(Date.now() + 7 * 3600e3); // waktu Jakarta
export const today = () => jkt().toISOString().slice(0, 10);
export const thisMonth = () => today().slice(0, 7);
export const validMonth = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m || '') && m >= '2026-10' && m <= thisMonth();
export const monthRange = (m) => { const [y, mo] = m.split('-').map(Number); return [`${m}-01`, new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10)]; };
