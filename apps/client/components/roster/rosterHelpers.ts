import { Player, RosterSummary } from '../../services/teamsApi';

export function normalizePaymentStatus(paymentStatus?: string | null) {
  return (paymentStatus || '').trim().toLowerCase();
}

export function getCategoryLabel(player: Player) {
  return player.category || 'Neasignat';
}

export function getAttendanceRate(player: Player) {
  if (typeof player.attendanceRate !== 'number') {
    return 0;
  }

  return Math.max(0, Math.min(Math.round(player.attendanceRate), 100));
}

export type PaymentBucket = 'paid' | 'pending' | 'overdue';

export function getPaymentBucket(paymentStatus?: string | null): PaymentBucket {
  const normalized = normalizePaymentStatus(paymentStatus);
  if (normalized === 'paid' || normalized === 'processed') {
    return 'paid';
  }

  if (normalized === 'overdue') {
    return 'overdue';
  }

  return 'pending';
}

export function getPaymentLabel(paymentStatus?: string | null) {
  const bucket = getPaymentBucket(paymentStatus);
  if (bucket === 'paid') return 'Plătit';
  if (bucket === 'overdue') return 'Restanță';
  return 'În așteptare';
}

export function isPaymentPaid(paymentStatus?: string | null) {
  return getPaymentBucket(paymentStatus) === 'paid';
}

export function getPaymentBucketRank(paymentStatus?: string | null) {
  const bucket = getPaymentBucket(paymentStatus);
  if (bucket === 'paid') return 0;
  if (bucket === 'pending') return 1;
  return 2;
}

export function getTeamLabel(player: Player) {
  return player.teamName || player.teamNames?.[0] || 'Neasignat';
}

export function isPlayerUnassigned(player: Player) {
  return (
    player.isUnassigned === true ||
    (!player.teamName && (!player.teamNames || player.teamNames.length === 0)) ||
    getTeamLabel(player) === 'Neasignat'
  );
}

export function isPlayerActive(player: Player) {
  return (player.status || 'active').trim().toLowerCase() !== 'inactive';
}

export function matchesAttendanceFilter(attendanceRate: number, filterValue: 'all' | 'high' | 'medium' | 'low') {
  if (filterValue === 'all') return true;
  if (filterValue === 'high') return attendanceRate >= 90;
  if (filterValue === 'medium') return attendanceRate >= 75 && attendanceRate < 90;
  return attendanceRate < 75;
}

export function buildAttendanceHelperText(summary: RosterSummary | null) {
  if (!summary) {
    return 'Nu există încă o tendință de prezență recentă.';
  }

  if (typeof summary.attendanceDelta === 'number') {
    const direction = summary.attendanceDelta >= 0 ? '+' : '';
    return `Ultimele 30 de zile: ${direction}${summary.attendanceDelta.toFixed(1)}% față de perioada anterioară`;
  }

  if (typeof summary.currentPeriodAttendance === 'number') {
    return `Media pe ultimele 30 de zile: ${summary.currentPeriodAttendance.toFixed(1)}%`;
  }

  return 'Nu există încă o tendință de prezență recentă.';
}
