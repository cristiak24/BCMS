import type { PlayerBalance } from '../../services/financeApi';
import { toCsv, type CsvValue } from '../../utils/csv';

/** CSV files for the accountant (Excel-friendly: BOM, semicolon-separated — utils/csv.ts). */

export function downloadCsv(rows: CsvValue[][], filename: string) {
  const content = toCsv(rows);
  const blob = new Blob([`﻿${content}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

const STATE_LABEL = { overdue: 'Restanță', due: 'De plată', paid: 'La zi' } as const;

export function balancesCsvRows(balances: PlayerBalance[]) {
  return [
    ['Jucător', 'Echipă', 'Status', 'De plată (RON)', 'Restant (RON)', 'Taxe restante', 'Cea mai veche scadență', 'Taxe'],
    ...balances.map((balance) => [
      balance.playerName,
      balance.teamName ?? '',
      STATE_LABEL[balance.state],
      balance.outstanding,
      balance.overdue,
      balance.overdueCount,
      balance.oldestOverdue ? balance.oldestOverdue.slice(0, 10) : '',
      balance.fees.map((fee) => `${fee.label} (${fee.amount})`).join('; '),
    ]),
  ];
}

const PAYMENT_STATUS_LABEL: Record<string, string> = { paid: 'Încasată', failed: 'Eșuată', void: 'Înlocuită', pending: 'Cerere' };
const METHOD_LABEL: Record<string, string> = { cash: 'Numerar', transfer: 'Transfer bancar', card: 'Card (POS)', other: 'Altă metodă', 'card online': 'Card online' };

export type ExportedPayment = {
  id: number;
  date: string | null;
  playerName: string;
  teamName: string | null;
  amount: number;
  status: string;
  method: string | null;
  description: string | null;
  feeIds: string[];
};

export function paymentsCsvRows(payments: ExportedPayment[]) {
  return [
    ['Nr.', 'Data', 'Jucător', 'Echipă', 'Suma (RON)', 'Status', 'Metodă', 'Descriere', 'Taxe acoperite'],
    ...payments.map((payment) => [
      payment.id,
      payment.date ? payment.date.slice(0, 10) : '',
      payment.playerName,
      payment.teamName ?? '',
      payment.amount,
      PAYMENT_STATUS_LABEL[payment.status] ?? payment.status,
      payment.method ? METHOD_LABEL[payment.method] ?? payment.method : '',
      payment.description ?? '',
      payment.feeIds.join(' '),
    ]),
  ];
}
