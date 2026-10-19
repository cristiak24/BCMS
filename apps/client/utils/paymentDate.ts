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
