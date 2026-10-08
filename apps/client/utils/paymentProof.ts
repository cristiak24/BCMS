/**
 * "Dovadă de plată": a printable confirmation for one successful payment,
 * which the browser can print or save as PDF. Explicitly not a fiscal
 * receipt — the club issues those. Card payments with a Stripe receipt open
 * that instead.
 */
type ProofInput = {
  clubName: string | null;
  playerName: string;
  transaction: { id: string; label: string; description: string; amount: number; currency: string; date: string };
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string));
}

export function paymentProofHtml({ clubName, playerName, transaction }: ProofInput) {
  const amount = new Intl.NumberFormat('ro-RO', { style: 'currency', currency: transaction.currency.toUpperCase() }).format(transaction.amount);
  const date = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(transaction.date));
  const rows: Array<[string, string]> = [
    ['Club', clubName || '—'],
    ['Jucător', playerName],
    ['Pentru', transaction.label],
    ['Detalii', transaction.description],
    ['Data plății', date],
    ['Nr. înregistrare', `BCMS-${transaction.id}`],
  ];
  return `<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>Dovadă de plată BCMS-${escapeHtml(transaction.id)}</title>
<style>body{font-family:Inter,Arial,sans-serif;color:#111827;margin:40px;max-width:640px}h1{font-size:22px;margin:0 0 4px}
.muted{color:#64748b;font-size:13px}.amount{font-size:32px;font-weight:800;margin:24px 0}table{border-collapse:collapse;width:100%}
td{padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:14px}td:first-child{color:#64748b;width:40%}
.note{margin-top:28px;font-size:12px;color:#64748b}@media print{body{margin:16mm}}</style></head>
<body><h1>Dovadă de plată</h1><div class="muted">Generată din BCMS pe ${escapeHtml(new Intl.DateTimeFormat('ro-RO').format(new Date()))}</div>
<div class="amount">${escapeHtml(amount)}</div><table>${rows.map(([key, value]) => `<tr><td>${escapeHtml(key)}</td><td>${escapeHtml(value)}</td></tr>`).join('')}</table>
<p class="note">Acest document confirmă înregistrarea plății în aplicație. Nu este un document fiscal; chitanța sau factura se emit de club.</p>
<script>window.addEventListener('load',function(){window.print();});</script></body></html>`;
}

export function openPaymentProof(input: ProofInput) {
  if (typeof window === 'undefined') return;
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.open();
  win.document.write(paymentProofHtml(input));
  win.document.close();
}
