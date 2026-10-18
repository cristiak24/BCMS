import { useEffect, useState } from 'react';
import { Pressable, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useRouter } from '@/src/web/expoRouter';
import { privacyRequestsApi } from '../../services/privacyApi';
import { deadlineLabel } from '../../utils/privacyDeadline';
import { plural } from '../../utils/plural';

/**
 * Admin home: open GDPR requests have a legal deadline, so they are flagged
 * here as well as in the notification and the email (audit R3-13). Renders
 * nothing when there is none (or the list cannot be read).
 */
export default function PrivacyRequestsBanner({ path = '/admin/privacy' }: { path?: string }) {
  const router = useRouter();
  const [state, setState] = useState<{ count: number; nearest: number | null } | null>(null);

  useEffect(() => {
    let active = true;
    privacyRequestsApi.list('open')
      .then((rows) => {
        if (!active) return;
        const days = rows.map((row) => row.daysLeft).filter((d): d is number => d != null);
        setState({ count: rows.length, nearest: days.length ? Math.min(...days) : null });
      })
      .catch(() => { if (active) setState(null); });
    return () => { active = false; };
  }, []);

  if (!state?.count) return null;
  const deadline = deadlineLabel(state.nearest);

  return (
    <Pressable
      onPress={() => router.push(path as any)}
      accessibilityRole="button"
      accessibilityLabel={`${plural(state.count, 'cerere deschisă', 'cereri deschise')} de ștergere a datelor`}
      className="ui-press rounded-[14px] border px-4 py-3 flex-row items-center gap-3 text-left"
      style={{ backgroundColor: 'var(--c-danger-bg)', borderColor: 'var(--c-danger-border)' } as any}
    >
      <MaterialIcons name="verified-user" size={18} color="var(--c-danger-fg)" />
      <View className="flex-1 min-w-0">
        <Text className="text-[13.5px] font-bold" style={{ color: 'var(--c-danger-fg)' }}>
          {state.count === 1 ? 'O cerere de ștergere a datelor așteaptă răspuns' : `${plural(state.count, 'cerere', 'cereri')} de ștergere a datelor așteaptă răspuns`}
        </Text>
        <Text className="text-[12.5px] font-medium mt-0.5" style={{ color: 'var(--c-danger-fg)' }}>
          {state.count === 1 ? deadline.label : `Cea mai apropiată: ${deadline.label.toLowerCase()}`}
        </Text>
      </View>
      <MaterialIcons name="chevron-right" size={20} color="var(--c-danger-fg)" />
    </Pressable>
  );
}
