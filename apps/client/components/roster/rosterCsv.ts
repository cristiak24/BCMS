import { Player } from '../../services/teamsApi';
import { getAttendanceRate, getCategoryLabel, getPaymentLabel, getTeamLabel, isPlayerActive } from './rosterHelpers';
import { toCsv } from '../../utils/csv';

const CSV_HEADER = ['Nume', 'Prenume', 'Număr', 'Poziție', 'Echipă', 'Categorie', 'Prezență %', 'Status plată', 'Status'];

export function buildRosterCsvRows(players: Player[]): string[][] {
  const rows = players.map((player) => [
    player.lastName || '',
    player.firstName || '',
    player.number != null ? String(player.number) : '',
    player.position || '',
    getTeamLabel(player),
    getCategoryLabel(player),
    String(getAttendanceRate(player)),
    getPaymentLabel(player.paymentStatus),
    isPlayerActive(player) ? 'Activ' : 'Inactiv',
  ]);

  return [CSV_HEADER, ...rows];
}

export function downloadRosterCsv(players: Player[], filename = 'lot-jucatori.csv') {
  const rows = buildRosterCsvRows(players);
  const csvContent = toCsv(rows);
  const blob = new Blob([`﻿${csvContent}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
