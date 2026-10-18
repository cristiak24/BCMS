import { plural } from './plural';

/**
 * The 30-day GDPR answer deadline, as a short Romanian label and a tone
 * (components/privacy/PrivacyRequestsScreen.tsx). Pure, see privacyDeadline.test.ts.
 */
export function deadlineLabel(daysLeft: number | null) {
  if (daysLeft == null) return { label: 'Fără termen', tone: 'neutral' as const };
  if (daysLeft < 0) {
    const late = -daysLeft;
    return { label: `Termen depășit cu ${plural(late, 'zi', 'zile')}`, tone: 'danger' as const };
  }
  if (daysLeft === 0) return { label: 'Termenul e azi', tone: 'danger' as const };
  if (daysLeft === 1) return { label: 'O zi rămasă', tone: 'danger' as const };
  return {
    label: `${daysLeft} ${daysLeft < 20 ? 'zile rămase' : 'de zile rămase'}`,
    tone: daysLeft <= 7 ? ('warning' as const) : ('neutral' as const),
  };
}
