import { parseApiDate } from './dates';

/**
 * When a payment happened, as a list shows it. A payment recorded by hand
 * (cash, transfer) only has a day — it is stored as midnight UTC, which read
 * "03:00" in Romania (audit WP7-E7). Only a card payment carries a real time.
 */
export function formatPaymentWhen(value: string, provider?: string | null) {
  const date = parseApiDate(value);
  if (Number.isNaN(date.getTime())) return value;
  const withTime = String(provider ?? '').toLowerCase() === 'stripe';
  return new Intl.DateTimeFormat('ro-RO', {
    timeZone: 'Europe/Bucharest',
    day: '2-digit',
    month: 'short',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}

/** How a payment came in, as the desk dialog names it; card payments online are „card online”. */
export function paymentMethodLabel(provider: string | null | undefined) {
  switch (provider) {
    case 'cash': return 'numerar';
    case 'transfer': return 'transfer bancar';
    case 'card': return 'card (POS)';
    case 'stripe': return 'card online';
    case 'other': return 'altă metodă';
    default: return null;
  }
}

/** The server's text for a desk payment recorded without a note (apps/server finance.ts, MANUAL_PAYMENT_DEFAULT_DESCRIPTION). */
const DEFAULT_DESK_DESCRIPTIONS = new Set(['Plată numerar', 'Transfer bancar', 'Plată card (POS)', 'Plată la club']);

export function isDefaultDeskDescription(description: string) {
  return DEFAULT_DESK_DESCRIPTIONS.has(description.trim());
}
