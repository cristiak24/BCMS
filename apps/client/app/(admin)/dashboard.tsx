import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useRouter } from '@/src/web/expoRouter';
import { useSession } from '../../context/AuthContext';
import PageContainer from '../../components/ui/PageContainer';
import PageHeader from '../../components/ui/PageHeader';
import StatCard from '../../components/ui/StatCard';
import Button from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/ScreenState';
import { getEventTypeMeta } from '../../components/schedule/scheduleShared';
import { dashboardApi, type DashboardSummary } from '../../services/dashboardApi';
import { eventsApi, type CalendarEvent } from '../../services/eventsApi';
import { l12Api, type L12Overview } from '../../services/l12Api';
import { manageAccessApi } from '../../services/manageAccessApi';
import { familyRequestsApi } from '../../services/familyRequestsApi';
import { basketballApi, type Match } from '../../services/basketballApi';
import { teamsApi, type Team as SavedTeam } from '../../services/teamsApi';

/**
 * Admin home: the club at a glance.
 *
 * It used to open on an FRB league explorer that auto-picked the first league,
 * season and team in FRB's list — often another club's team — under an English
 * "Basketball Operations · Live / Dashboard Admin" banner. FRB fixtures and
 * standings live on each team's page (Competiție FRB); home now answers "what
 * needs me today": KPIs, things to fix, the next 7 days, recent results.
 */

const DAY = 86400000;

type RecentResult = Match & { savedTeamName: string };

type AttentionItem = {
  key: string;
  icon: string;
  tone: 'danger' | 'warning' | 'brand';
  title: string;
  detail?: string;
  href: string;
};

const TONE = {
  danger: { bg: 'var(--c-danger-bg)', fg: 'var(--c-danger-fg)' },
  warning: { bg: 'var(--c-warning-bg)', fg: 'var(--c-warning-fg)' },
  brand: { bg: 'var(--c-surface-tint)', fg: 'var(--c-brand-fg)' },
} as const;

function parseFrbDate(match: Match) {
  const [d, m, y] = (match.date || '').split('.').map(Number);
  if (!d || !m || !y) return 0;
  const [hh, mm] = /^\d{1,2}:\d{2}$/.test(match.time) ? match.time.split(':').map(Number) : [0, 0];
  return new Date(y, m - 1, d, hh, mm).getTime();
}

function dayLabel(date: Date) {
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (date.toDateString() === today.toDateString()) return 'Azi';
  if (date.toDateString() === tomorrow.toDateString()) return 'Mâine';
  const label = date.toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const time = (iso: string) => new Date(iso).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });

const money = (amount: number) => new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 }).format(amount);

function SectionCard({ title, action, children }: { title: string; action?: { label: string; onPress: () => void }; children: React.ReactNode }) {
  return (
    <View className="rounded-[16px] border overflow-hidden" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-xs)' } as any}>
      <View className="flex-row items-center justify-between px-4 pt-3.5 pb-2.5">
        <Text className="text-[15px] font-bold" style={{ color: 'var(--c-ink)' }}>{title}</Text>
        {action ? (
          <Pressable onPress={action.onPress} accessibilityRole="link" className="ui-press flex-row items-center gap-0.5">
            <Text className="text-[12.5px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>{action.label}</Text>
            <MaterialIcons name="chevron-right" size={16} color="var(--c-brand-fg)" />
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const { session } = useSession() as any;

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [summaryFailed, setSummaryFailed] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [l12, setL12] = useState<L12Overview | null>(null);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [results, setResults] = useState<RecentResult[] | null>(null);

  const loadResults = useCallback(async () => {
    try {
      const saved = await teamsApi.getTeams();
      const frbTeams = saved.filter((t: SavedTeam) => t.frbTeamId && t.frbLeagueId && t.frbSeasonId);
      const perTeam = await Promise.all(frbTeams.map(async (team) => {
        try {
          const matches = await basketballApi.getMatches(team.frbLeagueId, team.frbSeasonId, team.frbTeamId, 'all');
          return matches.filter((m) => m.status === 'finished').map((m) => ({ ...m, savedTeamName: team.name }));
        } catch {
          return [];
        }
      }));
      const seen = new Set<string>();
      const flat = perTeam.flat().filter((m) => {
        const key = `${m.savedTeamName}|${m.date}|${m.homeTeam}|${m.awayTeam}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setResults(flat.sort((a, b) => parseFrbDate(b) - parseFrbDate(a)).slice(0, 6));
    } catch {
      setResults([]);
    }
  }, []);

  useEffect(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 8 * DAY);

    dashboardApi.getSummary().then(setSummary).catch(() => setSummaryFailed(true));
    eventsApi.getEvents({ start: start.toISOString(), end: end.toISOString() })
      .then((rows) => setEvents(rows.filter((e) => e.status !== 'cancelled')))
      .catch(() => setEvents([]));
    // Staff/accountant roles get 403 on these — the home just leaves them out.
    l12Api.overview().then(setL12).catch(() => setL12(null));
    Promise.allSettled([manageAccessApi.listRequests(), familyRequestsApi.list()]).then(([access, family]) => {
      const a = access.status === 'fulfilled' ? access.value.filter((r) => r.status === 'pending').length : 0;
      const f = family.status === 'fulfilled' ? family.value.length : 0;
      setPendingRequests(a + f);
    });
    loadResults();
  }, [loadResults]);

  const upcoming = useMemo(() => {
    if (!events) return null;
    const now = Date.now();
    const horizon = now + 7 * DAY;
    const rows = events
      .filter((e) => new Date(e.endTime || e.startTime).getTime() >= now && new Date(e.startTime).getTime() <= horizon)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    const groups: { key: string; label: string; items: CalendarEvent[] }[] = [];
    for (const event of rows) {
      const date = new Date(event.startTime);
      const key = date.toDateString();
      const last = groups[groups.length - 1];
      if (last?.key === key) last.items.push(event);
      else groups.push({ key, label: dayLabel(date), items: [event] });
    }
    return groups;
  }, [events]);

  const attention = useMemo<AttentionItem[]>(() => {
    const items: AttentionItem[] = [];
    if (summary?.expiredVisasCount) {
      items.push({ key: 'visas', icon: 'medical-services', tone: 'danger', title: `${summary.expiredVisasCount} ${summary.expiredVisasCount === 1 ? 'viză medicală expirată' : 'vize medicale expirate'}`, detail: 'Sportivii nu pot juca până la reînnoire', href: '/admin/compliance' });
    }
    const soon = summary?.expiringItems?.filter((i) => !i.expired && i.urgent).length ?? 0;
    if (soon > 0) {
      items.push({ key: 'soon', icon: 'schedule', tone: 'warning', title: `${soon} ${soon === 1 ? 'viză expiră' : 'vize expiră'} în 7 zile`, href: '/admin/compliance' });
    }
    if (l12) {
      const weekAhead = Date.now() + 7 * DAY;
      const unset = l12.matches.filter((m) => !m.hasLineup && new Date(m.startTime).getTime() <= weekAhead);
      if (unset.length > 0) {
        items.push({ key: 'l12', icon: 'assignment', tone: 'warning', title: `${unset.length} ${unset.length === 1 ? 'meci fără L12' : 'meciuri fără L12'} săptămâna asta`, detail: unset.slice(0, 2).map((m) => m.title).join(' · '), href: '/admin/l12' });
      }
    }
    if (summary?.pendingPaymentsCount) {
      items.push({ key: 'payments', icon: 'payments', tone: 'warning', title: `${summary.pendingPaymentsCount} ${summary.pendingPaymentsCount === 1 ? 'plată restantă' : 'plăți restante'}`, href: '/admin/roster' });
    }
    if (pendingRequests > 0) {
      items.push({ key: 'requests', icon: 'person-add', tone: 'brand', title: `${pendingRequests} ${pendingRequests === 1 ? 'cerere de acces' : 'cereri de acces'} de aprobat`, href: '/admin/manage-access' });
    }
    return items;
  }, [summary, l12, pendingRequests]);

  const firstName = session?.firstName || session?.name?.split(' ')[0] || '';
  const today = new Date().toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long' });
  const loadingSummary = !summary && !summaryFailed;
  const attendanceDelta = summary?.attendanceChangePoints;

  const attentionCard = (
    <SectionCard title="Necesită atenție">
      {loadingSummary ? (
        <View className="px-4 pb-4 gap-2">
          {[0, 1].map((i) => <Skeleton key={i} className="h-[48px] w-full rounded-[10px]" />)}
        </View>
      ) : attention.length === 0 ? (
        <View className="flex-row items-center gap-3 px-4 pb-4">
          <View className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: 'var(--c-success-bg)' }}>
            <MaterialIcons name="check" size={18} color="var(--c-success-fg)" />
          </View>
          <Text className="flex-1 text-[13.5px] font-medium" style={{ color: 'var(--c-ink-soft)' }}>Totul e în regulă. Nimic urgent azi.</Text>
        </View>
      ) : (
        <View className="pb-1.5">
          {attention.map((item) => (
            <Pressable
              key={item.key}
              onPress={() => router.push(item.href as any)}
              accessibilityRole="link"
              className="ui-press flex-row items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--c-surface-2)]"
              style={{ borderTopWidth: 1, borderTopColor: 'var(--c-border)' } as any}
            >
              <View className="w-9 h-9 rounded-[10px] items-center justify-center shrink-0" style={{ backgroundColor: TONE[item.tone].bg }}>
                <MaterialIcons name={item.icon} size={18} color={TONE[item.tone].fg} />
              </View>
              <View className="flex-1 min-w-0">
                <Text className="text-[13.5px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{item.title}</Text>
                {item.detail ? <Text className="t-meta" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{item.detail}</Text> : null}
              </View>
              <MaterialIcons name="chevron-right" size={18} color="var(--c-faint)" />
            </Pressable>
          ))}
        </View>
      )}
    </SectionCard>
  );

  return (
    <View className="flex-1" style={{ backgroundColor: 'var(--c-bg)' }}>
      <ScrollView className="flex-1" contentContainerClassName="pb-36" showsVerticalScrollIndicator={false}>
        <PageContainer>
          <PageHeader
            title={firstName ? `Bună, ${firstName}` : 'Acasă'}
            subtitle={today.charAt(0).toUpperCase() + today.slice(1)}
            actionsOnMobile={false}
            actions={<Button icon="calendar-month" label="Program" onPress={() => router.push('/admin/schedule' as any)} />}
          />

          <View className="gap-5">
            {/* KPIs */}
            {loadingSummary ? (
              <View className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[112px] w-full rounded-[16px]" />)}
              </View>
            ) : summary ? (
              <View className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard
                  icon="groups"
                  tone="brand"
                  label="Jucători activi"
                  value={summary.activePlayerCount}
                  hint={`${summary.teamCount} ${summary.teamCount === 1 ? 'echipă' : 'echipe'}${summary.playerCountChange ? ` · ${summary.playerCountChange > 0 ? '+' : ''}${summary.playerCountChange} noi` : ''}`}
                />
                <StatCard
                  icon="fact-check"
                  tone={summary.attendanceRate == null ? 'neutral' : summary.attendanceRate >= 75 ? 'success' : summary.attendanceRate >= 60 ? 'warning' : 'danger'}
                  label="Prezență"
                  value={summary.attendanceRate == null ? '—' : Math.round(summary.attendanceRate)}
                  suffix={summary.attendanceRate == null ? undefined : '%'}
                  hint={summary.attendanceRate == null ? 'Fără date încă' : attendanceDelta == null ? 'Luna asta' : `${attendanceDelta > 0 ? '+' : ''}${attendanceDelta} pp față de luna trecută`}
                />
                <StatCard
                  icon="account-balance-wallet"
                  tone="success"
                  label="Încasări"
                  value={money(summary.monthlyIncome)}
                  suffix=" RON"
                  hint={`Luna asta · profit ${money(summary.monthlyProfit)} RON`}
                />
                <StatCard
                  icon="payments"
                  tone={summary.pendingPaymentsCount > 0 ? 'warning' : 'neutral'}
                  label="Plăți restante"
                  value={summary.pendingPaymentsCount}
                  hint={summary.pendingPaymentsCount > 0 ? 'Vezi în Lot' : 'Toți sunt la zi'}
                />
              </View>
            ) : null}

            {/* Phones: what needs fixing comes before the schedule. */}
            <View className="lg:hidden">{attentionCard}</View>

            <View className="flex-col lg:flex-row lg:items-start gap-5">
              {/* Left: next 7 days */}
              <View className="flex-1 min-w-0 gap-5">
                <SectionCard title="Următoarele 7 zile" action={{ label: 'Program', onPress: () => router.push('/admin/schedule' as any) }}>
                  {!upcoming ? (
                    <View className="px-4 pb-4 gap-2">
                      {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[52px] w-full rounded-[10px]" />)}
                    </View>
                  ) : upcoming.length === 0 ? (
                    <View className="px-4 pb-4">
                      <EmptyState compact icon="event-available" title="Nimic programat" message="Nu sunt antrenamente sau meciuri în următoarele 7 zile." />
                    </View>
                  ) : (
                    <View className="pb-1.5">
                      {upcoming.map((group) => (
                        <View key={group.key}>
                          <Text className="t-eyebrow px-4 pt-2.5 pb-1.5" style={{ color: 'var(--c-muted)', backgroundColor: 'var(--c-surface-2)' } as any}>{group.label}</Text>
                          {group.items.map((event) => {
                            const meta = getEventTypeMeta(event.type);
                            return (
                              <Pressable
                                key={event.id}
                                onPress={() => router.push(`/admin/event/${event.id}` as any)}
                                accessibilityRole="link"
                                className="ui-press flex-row items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--c-surface-2)]"
                                style={{ borderTopWidth: 1, borderTopColor: 'var(--c-border)' } as any}
                              >
                                <Text className="t-num text-[13px] font-bold w-[42px] shrink-0" style={{ color: 'var(--c-ink-soft)' }}>{time(event.startTime)}</Text>
                                <View className="w-1 self-stretch rounded-full shrink-0" style={{ backgroundColor: meta.solid }} />
                                <View className="flex-1 min-w-0">
                                  <Text className="text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{event.title}</Text>
                                  <Text className="t-meta" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
                                    {[meta.label, event.teamName, event.location].filter(Boolean).join(' · ')}
                                  </Text>
                                </View>
                                <MaterialIcons name="chevron-right" size={18} color="var(--c-faint)" />
                              </Pressable>
                            );
                          })}
                        </View>
                      ))}
                    </View>
                  )}
                </SectionCard>
              </View>

              {/* Right: attention + results */}
              <View className="w-full lg:w-[380px] xl:w-[420px] shrink-0 gap-5">
                <View className="hidden lg:flex">{attentionCard}</View>

                <SectionCard title="Rezultate recente">
                  {!results ? (
                    <View className="px-4 pb-4 gap-2">
                      {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[44px] w-full rounded-[10px]" />)}
                    </View>
                  ) : results.length === 0 ? (
                    <View className="px-4 pb-4">
                      <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>Niciun rezultat FRB pentru echipele clubului încă.</Text>
                    </View>
                  ) : (
                    <View className="pb-1.5">
                      {results.map((m, index) => {
                        const tone = m.result === 'W' ? { bg: 'var(--c-success-bg)', fg: 'var(--c-success-fg)', label: 'V' }
                          : m.result === 'L' ? { bg: 'var(--c-danger-bg)', fg: 'var(--c-danger-fg)', label: 'Î' }
                          : { bg: 'var(--c-surface-3)', fg: 'var(--c-muted)', label: '–' };
                        return (
                          <View key={`${m.savedTeamName}-${m.date}-${index}`} className="flex-row items-center gap-3 px-4 py-2.5" style={{ borderTopWidth: 1, borderTopColor: 'var(--c-border)' } as any}>
                            <View className="w-7 h-7 rounded-[8px] items-center justify-center shrink-0" style={{ backgroundColor: tone.bg }} accessibilityLabel={m.result === 'W' ? 'Victorie' : m.result === 'L' ? 'Înfrângere' : 'Rezultat'}>
                              <Text className="text-[12px] font-bold" style={{ color: tone.fg }}>{tone.label}</Text>
                            </View>
                            <View className="flex-1 min-w-0">
                              <Text className="text-[13px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{m.homeTeam}</Text>
                              <Text className="text-[13px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{m.awayTeam}</Text>
                            </View>
                            <View className="items-end shrink-0">
                              <Text className="t-num text-[13px] font-bold" style={{ color: 'var(--c-ink)' }}>{m.homeScore}</Text>
                              <Text className="t-num text-[13px] font-bold" style={{ color: 'var(--c-ink)' }}>{m.awayScore}</Text>
                            </View>
                            <Text className="t-meta w-[44px] text-right shrink-0" style={{ color: 'var(--c-faint)' }}>{m.date.slice(0, 5)}</Text>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </SectionCard>
              </View>
            </View>
          </View>
        </PageContainer>
      </ScrollView>
    </View>
  );
}
