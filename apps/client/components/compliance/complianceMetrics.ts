import { medicalStatus } from '../myclub/teamDisplay';

/**
 * Compliance KPIs derived from the real roster.
 *
 * The stat strips above and below the compliance table used to be hardcoded
 * literals ("84%", "04", "12", "48", "102", "100%") sitting on top of a table of
 * real players. An admin reading that page saw a club-health figure that had
 * nothing to do with their club.
 */

export type CompliancePlayerLike = {
  medicalCheckExpiry?: string | null;
};

export type ComplianceMetrics = {
  total: number;
  /** Visa/medical check already past its expiry date. */
  expired: number;
  /** Expires within the next 30 days. */
  dueSoon: number;
  /** Valid for more than 30 days. */
  valid: number;
  /** No medical check on file at all. */
  missing: number;
  /** Percentage of the roster that is currently valid (0–100). */
  securePercent: number;
  /** Rows an admin still has to act on: expired, expiring soon, or missing. */
  pendingReviews: number;
};

export function computeComplianceMetrics(players: CompliancePlayerLike[]): ComplianceMetrics {
  const total = players.length;

  let expired = 0;
  let dueSoon = 0;
  let valid = 0;
  let missing = 0;

  for (const player of players) {
    switch (medicalStatus(player.medicalCheckExpiry)) {
      case 'expired':
        expired += 1;
        break;
      case 'soon':
        dueSoon += 1;
        break;
      case 'valid':
        valid += 1;
        break;
      default:
        missing += 1;
    }
  }

  return {
    total,
    expired,
    dueSoon,
    valid,
    missing,
    // An empty roster is reported as 0%, not 100% — "nothing to check" must not
    // read as "everything is fine".
    securePercent: total === 0 ? 0 : Math.round((valid / total) * 100),
    pendingReviews: expired + dueSoon + missing,
  };
}
