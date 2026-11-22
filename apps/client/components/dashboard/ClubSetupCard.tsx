import { useEffect, useState } from 'react';
import { Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import Button from '../ui/Button';
import { clubAdminApi } from '../../services/clubAdminApi';
import { manageAccessApi } from '../../services/manageAccessApi';
import { financeApi } from '../../services/financeApi';
import { eventsApi } from '../../services/eventsApi';

/**
 * „Pornește clubul”: the five things a new club needs before the home page means
 * anything. Each step ticks itself from the club's data; the card goes away for
 * good once all five are done. Clubs that already had teams and players when the
 * card first loaded never see it (a club that chose a 0 RON fee isn't "unfinished").
 */

type StepKey = 'team' | 'coach' | 'players' | 'fee' | 'training';

type Step = { key: StepKey; title: string; detail: string; action: string; href: string };

const STEPS: Step[] = [
  { key: 'team', title: 'Creează prima echipă', detail: 'Manual sau importată din FRB.', action: 'Creează echipa', href: '/admin/my-club-admin' },
  { key: 'coach', title: 'Invită un antrenor', detail: 'Primește un link sau un cod pentru echipa lui.', action: 'Invită', href: '/admin/manage-access?invita=1' },
  { key: 'players', title: 'Adaugă jucători', detail: 'Îi adaugi tu sau le trimiți codul echipei.', action: 'Adaugă jucători', href: '/admin/roster' },
  { key: 'fee', title: 'Stabilește cotizația', detail: 'Suma lunară și ziua scadenței.', action: 'Deschide setările', href: '/admin/finance?tab=setari' },
  { key: 'training', title: 'Programează primul antrenament', detail: 'Apare în calendarul echipei și al părinților.', action: 'Deschide Program', href: '/admin/schedule' },
];

const storage = () => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};
const read = (key: string) => {
  try { return storage()?.getItem(key) ?? null; } catch { return null; }
};
const write = (key: string, value: string) => {
  try { storage()?.setItem(key, value); } catch { /* private mode: the card simply re-checks */ }
};

export default function ClubSetupCard({
  clubKey,
  teamCount,
  playerCount,
  onNavigate,
}: {
  /** Club id (or name) — the done/started flags are per club. */
  clubKey: string;
  teamCount: number;
  playerCount: number;
  onNavigate: (href: string) => void;
}) {
  const doneKey = `bcms.setup.done.${clubKey}`;
  const startedKey = `bcms.setup.started.${clubKey}`;
  const [done, setDone] = useState<Partial<Record<StepKey, boolean>> | null>(null);
  const [hidden, setHidden] = useState(() => read(doneKey) === '1');

  // Only a club that is new when the card first looks gets the checklist.
  const active = !hidden && (read(startedKey) === '1' || teamCount === 0 || playerCount === 0);

  useEffect(() => {
    if (!active) return;
    write(startedKey, '1');
    let cancelled = false;
    const now = new Date();
    const from = new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString();
    const to = new Date(now.getFullYear() + 1, now.getMonth(), 1).toISOString();
    Promise.allSettled([
      clubAdminApi.listAccounts(),
      manageAccessApi.listInviteCodes(),
      financeApi.getSettings(),
      eventsApi.getEvents({ start: from, end: to }),
    ]).then(([accounts, codes, settings, events]) => {
      if (cancelled) return;
      const liveCodes = codes.status === 'fulfilled' ? codes.value.filter((c) => !c.revokedAt) : [];
      const coach = (accounts.status === 'fulfilled' && accounts.value.users.some((u) => u.role === 'coach' && u.status !== 'inactive' && u.status !== 'deactivated'))
        || liveCodes.some((c) => c.role === 'coach');
      const players = playerCount > 0 || liveCodes.some((c) => c.role === 'player' || c.role === 'parent');
      const fee = settings.status === 'fulfilled' && Number(settings.value.monthlyPlayerFee) > 0;
      const training = events.status === 'fulfilled' && events.value.some((e) => e.status !== 'cancelled' && e.type === 'training');
      const next = { team: teamCount > 0, coach, players, fee, training };
      setDone(next);
      if (Object.values(next).every(Boolean)) {
        write(doneKey, '1');
        setHidden(true);
      }
    });
    return () => { cancelled = true; };
  }, [active, teamCount, playerCount, doneKey, startedKey]);

  if (!active || !done) return null;
  const count = STEPS.filter((s) => done[s.key]).length;
  const nextStep = STEPS.find((s) => !done[s.key]);

  return (
    <View className="ui-rise rounded-[14px] border overflow-hidden" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}>
      <View className="flex-row items-center gap-3 px-4 md:px-5 py-3" style={{ borderBottomWidth: 1, borderBottomColor: 'var(--c-border-soft)' } as any}>
        <MaterialIcons name="flag" size={18} color="var(--c-muted)" />
        <View className="flex-1 min-w-0">
          <Text accessibilityRole="header" aria-level={2} className="f-display text-[15px] font-bold" style={{ color: 'var(--c-ink)', letterSpacing: '-0.015em' } as any}>Pornește clubul</Text>
          <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>{count} din 5 pași · lista dispare când sunt gata toți</Text>
        </View>
      </View>
      <View className="h-1" style={{ backgroundColor: 'var(--c-surface-3)' }}>
        <View className="ui-bar h-full" style={{ width: `${(count / 5) * 100}%`, backgroundColor: 'var(--c-success-fg)' }} />
      </View>
      <View accessibilityRole={'list' as never}>
        {STEPS.map((step, index) => {
          const ok = Boolean(done[step.key]);
          const isNext = step === nextStep;
          return (
            <View
              key={step.key}
              accessibilityRole={'listitem' as never}
              className={`flex-row flex-wrap items-center gap-x-3 gap-y-2 px-4 md:px-5 py-3 ${index > 0 ? 'border-t' : ''}`}
              style={{ borderColor: 'var(--c-border-soft)' } as any}
            >
              <View
                className="w-6 h-6 rounded-full items-center justify-center shrink-0"
                style={ok ? { backgroundColor: 'var(--c-success-bg)' } : { borderWidth: 1.5, borderColor: 'var(--c-border)' } as any}
              >
                {ok ? <MaterialIcons name="check" size={15} color="var(--c-success-fg)" /> : <Text className="t-num text-[11px] font-bold" style={{ color: 'var(--c-muted)' }}>{index + 1}</Text>}
              </View>
              <View className="flex-1 min-w-[180px]">
                <Text className="text-[14px] font-semibold" style={{ color: ok ? 'var(--c-muted)' : 'var(--c-ink)', textDecorationLine: ok ? 'line-through' : 'none' } as any}>
                  {step.title}
                  {ok ? <Text style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' } as any}> (făcut)</Text> : null}
                </Text>
                {!ok ? <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>{step.detail}</Text> : null}
              </View>
              {!ok ? (
                <Button size="sm" variant={isNext ? 'primary' : 'secondary'} label={step.action} onPress={() => onNavigate(step.href)} />
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}
