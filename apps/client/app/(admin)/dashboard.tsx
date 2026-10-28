import { parseApiDate } from '@/utils/dates';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useCachedState } from '../../hooks/useCachedState';
import { Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useRouter } from '@/src/web/expoRouter';
import { useFocusEffect } from '@/src/web/reactNavigationNative';
import { useSession } from '../../context/AuthContext';
import PageContainer from '../../components/ui/PageContainer';
import { formatToday, getGreeting } from '../../components/ui/HeroBanner';
import Button from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/ScreenState';
import { getEventTypeMeta, type EventType } from '../../components/schedule/scheduleShared';
import { useCountUp } from '../../hooks/useCountUp';
import { dashboardApi, type DashboardSummary } from '../../services/dashboardApi';
import { eventsApi, type CalendarEvent } from '../../services/eventsApi';
import { l12Api, type L12Overview } from '../../services/l12Api';
import { manageAccessApi } from '../../services/manageAccessApi';
import { familyRequestsApi } from '../../services/familyRequestsApi';
import { basketballApi, type Match } from '../../services/basketballApi';
import { teamsApi, type Team as SavedTeam } from '../../services/teamsApi';
import PrivacyRequestsBanner from '../../components/privacy/PrivacyRequestsBanner';
import { ATTENDANCE_PERIOD_LABEL } from '../../utils/attendanceRate';
import { plural } from '../../utils/plural';

/**
 * Admin home: the club at a glance.
 *
 * It used to open on an FRB league explorer that auto-picked the first league,
 * season and team in FRB's list — often another club's team. FRB fixtures and
 * standings live on each team's page (Competiție FRB); home answers "what
 * needs me today": KPIs, things to fix, the next 7 days, recent results.
 * League tables stay on each team's page in Clubul meu (TeamFrbPanel).
 *
 * Visual language: quiet, editorial. Neutral surfaces with hairline borders and
 * soft elevation; colour appears only as small accents (a tick, an icon chip,
 * a meter) so the numbers carry the page. Hover lifts a card with a neutral
 * shadow (`.home-card` in global.css). Every colour is a theme token.
 */

const DAY = 86400000;

/** "octombrie" (or "oct." short) for offset 0, "septembrie" for -1 (local calendar month). */
function monthName(offset: number, width: 'long' | 'short' = 'long') {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + offset, 1).toLocaleDateString('ro-RO', { month: width });
}

/** „31 oct.”: the last day of the current month. */
function lastDayOfMonthLabel() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' });
}

type RecentResult = Match & { savedTeamName: string; frbSeasonId: string };

type Tone = 'danger' | 'warning' | 'brand' | 'success' | 'sky' | 'purple';

/** Accent per tone: solid token for ticks/meters, soft pair for chips. */
const ACCENT: Record<Tone, { solid: string; bg: string; fg: string }> = {
  brand: { solid: 'var(--c-blue)', bg: 'var(--c-surface-tint)', fg: 'var(--c-brand-fg)' },
  sky: { solid: 'var(--c-sky)', bg: 'var(--c-sky-bg)', fg: 'var(--c-sky-fg)' },
  purple: { solid: 'var(--c-purple)', bg: 'var(--c-purple-bg)', fg: 'var(--c-purple-fg)' },
  success: { solid: 'var(--c-success)', bg: 'var(--c-success-bg)', fg: 'var(--c-success-fg)' },
  warning: { solid: 'var(--c-warning)', bg: 'var(--c-warning-bg)', fg: 'var(--c-warning-fg)' },
  danger: { solid: 'var(--c-danger)', bg: 'var(--c-danger-bg)', fg: 'var(--c-danger-fg)' },
};

const EVENT_ICON: Record<EventType, string> = {
  match: 'sports-basketball',
  training: 'fitness-center',
  camp: 'terrain',
  medical: 'medical-services',
  admin: 'event',
};

type AttentionItem = {
  key: string;
  icon: string;
  tone: Tone;
  title: string;
  detail?: string;
  href: string;
};

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

/** "azi" / "mâine" / "pe sâmbătă, 10 octombrie" — for running text. */
function dayPhrase(date: Date) {
  const label = dayLabel(date);
  if (label === 'Azi') return 'azi';
  if (label === 'Mâine') return 'mâine';
  return `pe ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
}

/** "în 2 zile" / "în 5 h" / "în 40 min" / "acum". */
function countdown(iso: string) {
  const diff = parseApiDate(iso).getTime() - Date.now();
  if (diff <= 0) return 'acum';
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return `în ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `în ${hours} h`;
  const days = Math.round(hours / 24);
  return `în ${plural(days, 'zi', 'zile')}`;
}

const time = (iso: string) => parseApiDate(iso).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });

const money = (amount: number) => new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 }).format(amount);

/** Neutral resting elevation for every card on the page; hover is `.home-card`. */
const CARD = { backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' };

type Delta = { label: string; direction: 'up' | 'down' | 'flat' };

const DELTA_TONE = {
  up: { bg: 'var(--c-success-bg)', fg: 'var(--c-success-fg)', icon: 'arrow-upward' },
  down: { bg: 'var(--c-danger-bg)', fg: 'var(--c-danger-fg)', icon: 'arrow-downward' },
  flat: { bg: 'var(--c-surface-3)', fg: 'var(--c-muted)', icon: 'show-chart' },
} as const;

function KpiCard({
  icon,
  tone,
  label,
  value,
  suffix,
  hint,
  delta,
  progress,
  onPress,
}: {
  icon: string;
  tone: Tone;
  label: string;
  value: number | string | null;
  suffix?: string;
  hint?: string;
  delta?: Delta | null;
  /** 0–100; draws a thin meter under the figure (attendance). */
  progress?: number | null;
  onPress?: () => void;
}) {
  const accent = ACCENT[tone];
  const numeric = typeof value === 'number' ? value : null;
  const animated = useCountUp(numeric);
  const shown = numeric != null ? (animated ?? 0) : value;
  // A disabled Pressable renders at 0.65 opacity, so cards without a link are plain Views.
  const Shell: any = onPress ? Pressable : View;

  return (
    <Shell
      {...(onPress ? { onPress, accessibilityRole: 'link' } : {})}
      className="home-card relative overflow-hidden rounded-[14px] border p-3.5 md:p-4 min-w-0 h-full flex flex-col text-left"
      style={CARD as any}
    >
      <View className="flex-row items-center justify-between gap-2 min-w-0">
        <View className="flex-row items-center gap-2 min-w-0 flex-1">
          {/* A tick only when the figure needs attention: colour carries a state, it doesn't decorate. */}
          {tone === 'warning' || tone === 'danger' ? (
            <View className="w-[3px] h-3 rounded-full shrink-0" style={{ backgroundColor: accent.solid }} />
          ) : null}
          <Text className="t-eyebrow flex-1 min-w-0" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{label}</Text>
        </View>
        <View className="hidden sm:flex w-7 h-7 rounded-[9px] items-center justify-center shrink-0" style={{ backgroundColor: 'var(--c-surface-3)' }}>
          <MaterialIcons name={icon} size={15} color="var(--c-muted)" />
        </View>
      </View>

      <View className="flex-row items-baseline gap-1 mt-2.5 min-w-0">
        <Text className="f-display t-num text-[24px] md:text-[28px] font-extrabold leading-none" style={{ color: 'var(--c-ink-strong)', letterSpacing: '-0.03em' } as any} numberOfLines={1}>
          {shown == null || shown === '' ? '—' : shown}
        </Text>
        {suffix && shown != null ? (
          <Text className="text-[13px] md:text-[14px] font-semibold" style={{ color: 'var(--c-muted)' }}>{suffix}</Text>
        ) : null}
      </View>

      {progress != null ? (
        <View className="h-1 rounded-full overflow-hidden mt-2.5" style={{ backgroundColor: 'var(--c-surface-3)' }}>
          <View className="ui-bar h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, progress))}%`, backgroundColor: accent.solid }} />
        </View>
      ) : null}

      {/* Spacer pins the footer to the bottom so footers line up across a row. */}
      <View className="flex-1 min-h-2" />
      <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1 pt-2.5 min-w-0" style={{ borderTopWidth: 1, borderTopColor: 'var(--c-border-soft)' } as any}>
        {delta ? (
          <View className="flex-row items-center gap-0.5 rounded-full px-1.5 py-0.5 shrink-0" style={{ backgroundColor: DELTA_TONE[delta.direction].bg }}>
            <MaterialIcons name={DELTA_TONE[delta.direction].icon} size={11} color={DELTA_TONE[delta.direction].fg} />
            <Text className="t-num text-[11px] font-bold" style={{ color: DELTA_TONE[delta.direction].fg }}>{delta.label}</Text>
          </View>
        ) : null}
        {/* On a phone's half-width card the hint was cut ("Profit −1.134 RON lun…"):
            it now wraps under the delta chip when the row is too narrow. */}
        {hint ? <Text className="t-meta flex-1" style={{ color: 'var(--c-muted)', minWidth: 112 } as any} numberOfLines={2}>{hint}</Text> : null}
      </View>
    </Shell>
  );
}

/** Shortcut card. One accent for all of them — they used to be four hues for four links. */
function QuickAction({ icon, label, detail, onPress }: { icon: string; label: string; detail: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      className="home-card rounded-[14px] border px-3 py-2.5 flex-row items-center gap-2.5 min-w-0 text-left"
      style={CARD as any}
    >
      <View className="w-8 h-8 rounded-[10px] items-center justify-center shrink-0" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
        <MaterialIcons name={icon} size={17} color="var(--c-brand-fg)" />
      </View>
      <View className="flex-1 min-w-0">
        <Text className="f-display text-[13.5px] font-bold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{label}</Text>
        <Text className="t-meta hidden sm:flex" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{detail}</Text>
      </View>
      <View className="home-arrow hidden sm:flex">
        <MaterialIcons name="arrow-forward" size={16} color="var(--c-faint)" />
      </View>
    </Pressable>
  );
}

function SectionCard({
  title,
  subtitle,
  icon,
  tone,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: string;
  tone: Tone;
  action?: { label: string; onPress: () => void };
  children: ReactNode;
}) {
  const accent = ACCENT[tone];
  return (
    <View className="rounded-[14px] border overflow-hidden" style={CARD as any}>
      <View className="flex-row items-center gap-3 px-4 md:px-5 py-3 mb-3" style={{ borderBottomWidth: 1, borderBottomColor: 'var(--c-border-soft)' } as any}>
        <View className="w-8 h-8 rounded-[9px] items-center justify-center shrink-0" style={{ backgroundColor: accent.bg }}>
          <MaterialIcons name={icon} size={16} color={accent.fg} />
        </View>
        <View className="flex-1 min-w-0">
          <Text accessibilityRole="header" className="f-display text-[15px] font-bold" style={{ color: 'var(--c-ink)', letterSpacing: '-0.015em' } as any} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text className="t-meta" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        {action ? (
          <Pressable
            onPress={action.onPress}
            accessibilityRole="link"
            className="home-row ui-press tap-40 flex-row items-center gap-1 rounded-[8px] border px-2.5 h-8 shrink-0 hover:bg-[var(--c-surface-2)]"
            style={{ borderColor: 'var(--c-border)' } as any}
          >
            <Text className="text-[12.5px] font-semibold" style={{ color: 'var(--c-ink-soft)' }}>{action.label}</Text>
            <View className="home-arrow"><MaterialIcons name="arrow-forward" size={14} color="var(--c-muted)" /></View>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** Half-court line drawing in the welcome panel — hairline ink, no animation. */
function CourtLines() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 320 200"
      width="320"
      height="200"
      style={{ position: 'absolute', right: -40, bottom: -60, pointerEvents: 'none', opacity: 0.55 }}
    >
      <g fill="none" stroke="var(--c-border)" strokeWidth="1.5">
        <rect x="10" y="10" width="300" height="240" rx="2" />
        <rect x="110" y="10" width="100" height="110" />
        <circle cx="160" cy="120" r="40" />
        <path d="M40 10v50a120 120 0 0 0 240 0V10" />
        <circle cx="160" cy="34" r="8" />
      </g>
    </svg>
  );
}

function HeaderChip({ icon, label, tone }: { icon: string; label: string; tone?: Tone }) {
  const accent = tone ? ACCENT[tone] : null;
  return (
    <View
      className="flex-row items-center gap-1.5 rounded-full border px-2.5 h-7"
      style={{ backgroundColor: accent ? accent.bg : 'var(--c-surface-2)', borderColor: accent ? 'transparent' : 'var(--c-border-soft)' } as any}
    >
      <MaterialIcons name={icon} size={13} color={accent ? accent.fg : 'var(--c-muted)'} />
      <Text className="text-[12px] font-semibold" style={{ color: accent ? accent.fg : 'var(--c-ink-soft)' }} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/**
 * A section whose request failed and that has nothing remembered to show: says
 * so, with a retry — never an empty list or „Totul la zi”, which read as an
 * all-clear the page never checked.
 */
function LoadFailed({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <View className="flex-row items-center gap-3 px-4 md:px-5 pb-4" accessibilityRole="alert">
      <View className="w-9 h-9 rounded-full items-center justify-center shrink-0" style={{ backgroundColor: 'var(--c-warning-bg)' }}>
        <MaterialIcons name="cloud-off" size={18} color="var(--c-warning-fg)" />
      </View>
      <View className="flex-1 min-w-0">
        <Text className="text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }}>{title}</Text>
        <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>{message}</Text>
      </View>
      <Button size="sm" icon="refresh" label="Reîncearcă" onPress={onRetry} />
    </View>
  );
}

/** Header aside: the very next event, with a live dot and a countdown. */
function NextEventPanel({ event, failed, onPress }: { event: CalendarEvent | null | undefined; failed?: boolean; onPress: (id: CalendarEvent['id']) => void }) {
  const panel = { boxShadow: 'var(--e-md)' } as any;
  if (!event) {
    return (
      <View className="glass rounded-[14px] px-4 py-3.5 md:w-[300px]" style={panel}>
        <Text className="t-eyebrow" style={{ color: 'var(--c-muted)' }}>Următorul eveniment</Text>
        <Text className="text-[14px] font-medium mt-2" style={{ color: 'var(--c-ink-soft)' }}>
          {failed ? 'Programul nu s-a încărcat.' : event === undefined ? 'Se încarcă…' : 'Nimic programat în 7 zile.'}
        </Text>
      </View>
    );
  }
  const meta = getEventTypeMeta(event.type);
  return (
    <Pressable
      onPress={() => onPress(event.id)}
      accessibilityRole="link"
      accessibilityLabel={`Următorul eveniment: ${event.title}`}
      className="glass home-row ui-press ui-lift relative overflow-hidden rounded-[14px] pl-4 pr-3.5 py-3 md:w-[300px] text-left"
      style={panel}
    >
      <View pointerEvents="none" className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: meta.solid }} />
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-row items-center gap-2">
          <View className="ui-ping w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--c-success)' }} />
          <Text className="t-eyebrow" style={{ color: 'var(--c-muted)' }}>Următorul eveniment</Text>
        </View>
        <Text className="t-num text-[12px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>{countdown(event.startTime)}</Text>
      </View>
      <Text className="f-display text-[16px] font-bold mt-1.5 leading-snug" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{event.title}</Text>
      <Text className="t-meta mt-1" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
        {[`${dayLabel(parseApiDate(event.startTime))}, ${time(event.startTime)}`, meta.label, event.teamName].filter(Boolean).join(' · ')}
      </Text>
      {event.location ? (
        <View className="flex-row items-center gap-1 mt-1">
          <MaterialIcons name="location-on" size={13} color="var(--c-faint)" />
          <Text className="t-meta flex-1 min-w-0" style={{ color: 'var(--c-faint)' }} numberOfLines={1}>{event.location}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * Seven day columns with one dot per event — "how busy is the week". Tapping
 * a day narrows the list below to it; tapping it again shows the whole week.
 */
function WeekStrip({ events, selected, onSelect }: { events: CalendarEvent[]; selected: string | null; onSelect: (key: string | null) => void }) {
  const days = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      // Calendar days, not 24h steps: across the clock change (last Sunday of
      // October / March) `+ i * DAY` landed on the same date twice and skipped one.
      const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const next = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i + 1).getTime();
      return {
        key: day.toDateString(),
        weekday: day.toLocaleDateString('ro-RO', { weekday: 'short' }).replace('.', ''),
        date: day.getDate(),
        isToday: i === 0,
        events: events.filter((e) => {
          const t = parseApiDate(e.startTime).getTime();
          return t >= day.getTime() && t < next;
        }),
      };
    });
  }, [events]);

  return (
    <View className="grid grid-cols-7 gap-1.5 sm:gap-2 px-4 md:px-5 pb-3.5 ui-stagger">
      {days.map((day) => {
        const active = selected === day.key;
        return (
          <Pressable
            key={day.key}
            onPress={() => onSelect(active ? null : day.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${day.weekday} ${day.date}: ${plural(day.events.length, 'eveniment', 'evenimente')}`}
            className="ui-press items-center rounded-[10px] border py-2.5 gap-1.5 hover:bg-[var(--c-surface-3)]"
            style={{
              backgroundColor: active ? 'var(--c-brand-surface)' : day.events.length ? 'var(--c-surface-2)' : 'transparent',
              borderColor: active ? 'var(--c-brand-surface)' : day.isToday ? 'var(--c-brand-fg)' : 'var(--c-border-soft)',
            } as any}
          >
            <Text className="text-[11px] font-semibold capitalize" style={{ color: active ? 'var(--c-on-brand)' : day.isToday ? 'var(--c-brand-fg)' : 'var(--c-muted)', opacity: active ? 0.8 : 1 }}>{day.weekday}</Text>
            <Text className="t-num text-[17px] font-bold leading-none" style={{ color: active ? 'var(--c-on-brand)' : day.isToday ? 'var(--c-brand-fg)' : 'var(--c-ink)' }}>{day.date}</Text>
            <View className="flex-row gap-1 h-1.5 items-center">
              {day.events.slice(0, 3).map((event) => (
                <View key={event.id} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: active ? 'var(--c-on-brand)' : getEventTypeMeta(event.type).solid }} />
              ))}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const { session } = useSession() as any;

  // Remembered per account (hooks/useCachedState): a revisit or a reopened
  // app paints last time's figures at once while the requests below refresh them.
  const [summary, setSummary] = useCachedState<DashboardSummary | null>('admin-home.summary', null);
  const [summaryFailed, setSummaryFailed] = useState(false);
  const [events, setEvents] = useCachedState<CalendarEvent[] | null>('admin-home.events', null);
  const [eventsFailed, setEventsFailed] = useState(false);
  const [l12, setL12] = useCachedState<L12Overview | null>('admin-home.l12', null);
  const [pendingRequests, setPendingRequests] = useCachedState('admin-home.requests', 0);
  const [results, setResults, , resultsFallback] = useCachedState<RecentResult[] | null>('admin-home.results', null);

  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const go = useCallback((href: string) => router.push(href as any), [router]);

  const loadResults = useCallback(async () => {
    try {
      const saved = await teamsApi.getTeams();
      const linked = saved.filter((t: SavedTeam) => t.frbTeamId && t.frbLeagueId && t.frbSeasonId);
      const perTeam = await Promise.all(linked.map(async (team) => {
        try {
          return { team, matches: await basketballApi.getMatches(team.frbLeagueId, team.frbSeasonId, team.frbTeamId, 'all') };
        } catch {
          return { team, matches: [] as Match[] };
        }
      }));
      const seen = new Set<string>();
      const flat = perTeam
        .flatMap(({ team, matches }) => matches.filter((m) => m.status === 'finished').map((m) => ({ ...m, savedTeamName: team.name, frbSeasonId: team.frbSeasonId })))
        .filter((m) => {
          const key = `${m.savedTeamName}|${m.date}|${m.homeTeam}|${m.awayTeam}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      setResults(flat.sort((a, b) => parseFrbDate(b) - parseFrbDate(a)).slice(0, 6));
    } catch {
      resultsFallback([]);
    }
  }, [setResults, resultsFallback]);

  const loadDashboard = useCallback(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 8);

    setSummaryFailed(false);
    setEventsFailed(false);
    dashboardApi.getSummary().then(setSummary).catch(() => setSummaryFailed(true));
    // A failure keeps last time's events if there are any; with none it shows
    // an error, not „Nimic programat” (an empty week the page never loaded).
    eventsApi.getEvents({ start: start.toISOString(), end: end.toISOString() })
      .then((rows) => setEvents(rows.filter((e) => e.status !== 'cancelled')))
      .catch(() => setEventsFailed(true));
    // Staff/accountant roles get 403 on these — the home just leaves them out.
    l12Api.overview().then(setL12).catch(() => setL12(null));
    Promise.allSettled([manageAccessApi.listRequests(), familyRequestsApi.list()]).then(([access, family]) => {
      const a = access.status === 'fulfilled' ? access.value.filter((r) => r.status === 'pending').length : 0;
      const f = family.status === 'fulfilled' ? family.value.length : 0;
      setPendingRequests(a + f);
    });
    loadResults();
  }, [loadResults, setSummary, setEvents, setL12, setPendingRequests]);

  // Refetches on mount AND when the app/tab resumes after a while in the
  // background — otherwise a phone left backgrounded for a day reopens to
  // whatever (or nothing) loaded on the last successful mount.
  useFocusEffect(loadDashboard);

  const weekEvents = useMemo(() => {
    if (!events) return null;
    const now = Date.now();
    const horizon = now + 7 * DAY;
    return events
      .filter((e) => parseApiDate(e.endTime || e.startTime).getTime() >= now && parseApiDate(e.startTime).getTime() <= horizon)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [events]);

  const upcoming = useMemo(() => {
    if (!weekEvents) return null;
    const groups: { key: string; label: string; items: CalendarEvent[] }[] = [];
    const shown = selectedDay ? weekEvents.filter((e) => parseApiDate(e.startTime).toDateString() === selectedDay) : weekEvents;
    for (const event of shown) {
      const date = parseApiDate(event.startTime);
      const key = date.toDateString();
      const last = groups[groups.length - 1];
      if (last?.key === key) last.items.push(event);
      else groups.push({ key, label: dayLabel(date), items: [event] });
    }
    return groups;
  }, [weekEvents, selectedDay]);

  const attention = useMemo<AttentionItem[]>(() => {
    const items: AttentionItem[] = [];
    if (summary?.expiredVisasCount) {
      items.push({ key: 'visas', icon: 'medical-services', tone: 'danger', title: `${plural(summary.expiredVisasCount, 'viză medicală expirată', 'vize medicale expirate')}`, detail: 'Cu viza expirată nu se poate juca', href: '/admin/compliance' });
    }
    // Visas only: expiringItems also carries the monthly fee („COTIZAȚIE LUNARĂ”), which
    // showed up here as "1 viză expiră în 7 zile" with no clearance due that week.
    const soon = summary?.expiringItems?.filter((i) => i.type === 'VIZĂ MEDICALĂ' && !i.expired && i.urgent).length ?? 0;
    if (soon > 0) {
      items.push({ key: 'soon', icon: 'schedule', tone: 'warning', title: `${plural(soon, 'viză expiră', 'vize expiră')} în 7 zile`, href: '/admin/compliance' });
    }
    if (l12) {
      // The overview also returns ~4 months of past matches (for the L12 page's
      // month filter); only today's and the coming week's need a sheet now.
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const weekAhead = Date.now() + 7 * DAY;
      const unset = l12.matches.filter((m) => {
        const at = parseApiDate(m.startTime).getTime();
        return !m.hasLineup && m.status !== 'cancelled' && at >= today.getTime() && at <= weekAhead;
      });
      if (unset.length > 0) {
        items.push({ key: 'l12', icon: 'assignment', tone: 'warning', title: `${plural(unset.length, 'meci fără L12', 'meciuri fără L12')} săptămâna asta`, detail: unset.slice(0, 2).map((m) => m.title).join(' · '), href: '/admin/l12' });
      }
    }
    if (summary?.pendingPaymentsCount) {
      items.push({ key: 'payments', icon: 'payments', tone: 'warning', title: `${plural(summary.pendingPaymentsCount, 'jucător cu restanțe', 'jucători cu restanțe')}`, href: '/admin/finance' });
    }
    if (pendingRequests > 0) {
      items.push({ key: 'requests', icon: 'person-add', tone: 'brand', title: `${plural(pendingRequests, 'cerere de acces', 'cereri de acces')} de aprobat`, href: '/admin/manage-access' });
    }
    return items;
  }, [summary, l12, pendingRequests]);

  const record = useMemo(() => {
    if (!results?.length) return null;
    const wins = results.filter((m) => m.result === 'W').length;
    const losses = results.filter((m) => m.result === 'L').length;
    return { wins, losses, total: results.length };
  }, [results]);

  const firstName = session?.firstName || session?.name?.split(' ')[0] || '';
  const role = String(session?.role ?? '').toLowerCase();
  const canSeeFinance = role === 'admin' || role === 'superadmin' || role === 'accountant';
  const loadingSummary = !summary && !summaryFailed;
  // Failed with nothing remembered: the checks behind „Necesită atenție” never ran.
  const summaryUnavailable = !summary && summaryFailed;
  const eventsUnavailable = !events && eventsFailed;
  const attendanceDelta = summary?.attendanceChangePoints;
  const attendanceRate = summary?.attendanceRate == null ? null : Math.round(summary.attendanceRate);
  const attendanceTone: Tone = attendanceRate == null ? 'sky' : attendanceRate >= 75 ? 'success' : attendanceRate >= 60 ? 'warning' : 'danger';
  const matchesThisWeek = weekEvents?.filter((e) => e.type === 'match').length ?? 0;
  const nextEvent = weekEvents === null ? undefined : weekEvents[0] ?? null;

  const attentionCard = (
    <SectionCard
      title="Necesită atenție"
      subtitle={loadingSummary ? 'Se verifică…' : summaryUnavailable ? 'Nu am putut verifica tot' : attention.length ? `${plural(attention.length, 'lucru de rezolvat', 'lucruri de rezolvat')}` : 'Totul la zi'}
      icon="notifications-active"
      tone={attention.some((a) => a.tone === 'danger') ? 'danger' : attention.length || summaryUnavailable ? 'warning' : 'success'}
    >
      {summaryUnavailable ? (
        <LoadFailed
          title="Nu am putut verifica"
          message="Vizele, restanțele și cererile nu s-au încărcat."
          onRetry={loadDashboard}
        />
      ) : null}
      {loadingSummary ? (
        <View className="px-4 md:px-5 pb-4 gap-2">
          {[0, 1].map((i) => <Skeleton key={i} className="h-[56px] w-full rounded-[14px]" />)}
        </View>
      ) : attention.length === 0 ? (summaryUnavailable ? null : (
        <View className="flex-row items-center gap-3 px-4 md:px-5 pb-4">
          <View className="w-9 h-9 rounded-full items-center justify-center shrink-0" style={{ backgroundColor: 'var(--c-success-bg)' }}>
            <MaterialIcons name="check" size={18} color="var(--c-success-fg)" />
          </View>
          <View className="flex-1 min-w-0">
            <Text className="text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }}>Totul e în regulă</Text>
            <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>Nimic urgent azi.</Text>
          </View>
        </View>
      )) : (
        // One list with dividers, flush under the card header (it was a bordered card per row).
        <View className="-mt-3 ui-stagger">
          {attention.map((item, index) => {
            const tone = ACCENT[item.tone];
            return (
              <Pressable
                key={item.key}
                onPress={() => go(item.href)}
                accessibilityRole="link"
                className={`home-row ui-press flex-row items-center gap-3 px-4 md:px-5 py-3 text-left hover:bg-[var(--c-surface-2)] ${index > 0 ? 'border-t' : ''}`}
                style={{ borderColor: 'var(--c-border-soft)' } as any}
              >
                <View className="w-8 h-8 rounded-[9px] items-center justify-center shrink-0" style={{ backgroundColor: tone.bg }}>
                  <MaterialIcons name={item.icon} size={16} color={tone.fg} />
                </View>
                <View className="flex-1 min-w-0">
                  <Text className="text-[13.5px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{item.title}</Text>
                  {item.detail ? <Text className="t-meta" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{item.detail}</Text> : null}
                </View>
                <View className="home-arrow"><MaterialIcons name="chevron-right" size={18} color="var(--c-faint)" /></View>
              </Pressable>
            );
          })}
        </View>
      )}
    </SectionCard>
  );

  return (
    <View className="flex-1" style={{ backgroundColor: 'var(--c-bg)' }}>
      <ScrollView className="flex-1" contentContainerClassName="pb-36" showsVerticalScrollIndicator={false}>
        <View>
          <PageContainer>
            <View className="gap-4">
              {role === 'admin' ? <PrivacyRequestsBanner /> : null}
              {/* Welcome panel */}
              <View className="ui-rise relative overflow-hidden rounded-[16px] border" style={CARD as any}>
                <View pointerEvents="none" className="absolute rounded-full" style={{ width: 300, height: 300, right: -70, top: -130, backgroundColor: 'var(--c-surface-tint)', opacity: 0.85 }} />
                <CourtLines />
                <View className="relative flex-col md:flex-row md:items-center gap-4 p-4 md:p-5">
                  <View className="flex-1 min-w-0">
                    <Text className="t-eyebrow" style={{ color: 'var(--c-muted)' }}>{formatToday()}</Text>
                    <Text
                      accessibilityRole="header"
                      aria-level={1}
                      className="f-display text-[22px] md:text-[28px] font-extrabold mt-1 leading-tight"
                      style={{ color: 'var(--c-ink-strong)', letterSpacing: '-0.035em' } as any}
                      numberOfLines={2}
                    >
                      {firstName ? `${getGreeting()}, ${firstName}` : getGreeting()}
                    </Text>
                    <Text className="text-[14px] mt-1" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
                      {session?.clubName ?? 'Clubul tău'}
                    </Text>
                    <View className="flex-row flex-wrap gap-1.5 mt-3">
                      {eventsUnavailable
                        ? <HeaderChip icon="cloud-off" tone="warning" label="Programul nu s-a încărcat" />
                        : <HeaderChip icon="event" label={weekEvents ? `${plural(weekEvents.length, 'eveniment', 'evenimente')} în 7 zile` : 'Se încarcă…'} />}
                      {matchesThisWeek ? <HeaderChip icon="sports-basketball" label={`${plural(matchesThisWeek, 'meci', 'meciuri')}`} /> : null}
                      {/* A count from a partial check would read as the whole picture. */}
                      {!loadingSummary ? (
                        summaryUnavailable
                          ? <HeaderChip icon="cloud-off" tone="warning" label="Nu am putut verifica" />
                          : attention.length
                            ? <HeaderChip icon="warning-amber" tone="warning" label={`${attention.length} de rezolvat`} />
                            : <HeaderChip icon="verified" tone="success" label="Totul la zi" />
                      ) : null}
                    </View>
                    <View className="flex-row flex-wrap gap-2 mt-3">
                      <Button variant="primary" icon="calendar-month" label="Program" onPress={() => go('/admin/schedule')} />
                      <Button icon="groups" label="Lot" onPress={() => go('/admin/roster')} className="hidden sm:flex" />
                    </View>
                  </View>
                  <NextEventPanel event={nextEvent} failed={eventsUnavailable} onPress={(id) => go(`/admin/event/${id}`)} />
                </View>
              </View>

              {/* KPIs */}
              {loadingSummary ? (
                <View className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                  {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[120px] w-full rounded-[14px]" />)}
                </View>
              ) : summary ? (
                <View className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3 ui-stagger">
                  <KpiCard
                    icon="groups"
                    tone="brand"
                    label="Jucători activi"
                    value={summary.activePlayerCount}
                    // A plain fact instead of a "+7" chip that compared nothing the card said
                    // (it was this month's sign-ups minus last month's).
                    hint={[
                      `în ${plural(summary.teamCount, 'echipă', 'echipe')}`,
                      summary.newPlayersThisMonth ? `${plural(summary.newPlayersThisMonth, 'jucător nou', 'jucători noi')} în ${monthName(0)}` : null,
                    ].filter(Boolean).join(' · ')}
                    onPress={() => go('/admin/roster')}
                  />
                  <KpiCard
                    icon="fact-check"
                    tone={attendanceTone}
                    label="Prezență"
                    value={attendanceRate}
                    suffix={attendanceRate == null ? undefined : '%'}
                    progress={attendanceRate}
                    hint={attendanceRate == null ? `Nimic marcat · ${ATTENDANCE_PERIOD_LABEL.toLowerCase()}` : attendanceDelta == null ? ATTENDANCE_PERIOD_LABEL : `${ATTENDANCE_PERIOD_LABEL} · față de cele 30 anterioare`}
                    delta={attendanceRate != null && attendanceDelta != null ? { label: `${attendanceDelta > 0 ? '+' : ''}${attendanceDelta} pp`, direction: attendanceDelta > 0 ? 'up' : attendanceDelta < 0 ? 'down' : 'flat' } : null}
                  />
                  <KpiCard
                    icon="account-balance"
                    tone="success"
                    // Collected against what is due by month-end — not a red „-100%” against last
                    // month and a negative „profit” on the 27th, before the month has closed.
                    label={`Încasat ${monthName(0, 'short')}`}
                    value={money(summary.feesCollectedThisMonth ?? summary.monthlyIncome)}
                    suffix=" RON"
                    hint={summary.feesDueByMonthEnd != null
                      ? `din ${money(summary.feesDueByMonthEnd)} RON scadent până la ${lastDayOfMonthLabel()}`
                      : `cotizații și taxe încasate în ${monthName(0)}`}
                    progress={summary.feesDueByMonthEnd ? Math.min(100, Math.round(((summary.feesCollectedThisMonth ?? 0) / summary.feesDueByMonthEnd) * 100)) : undefined}
                    delta={null}
                    onPress={canSeeFinance ? () => go('/admin/finance') : undefined}
                  />
                  <KpiCard
                    icon="receipt-long"
                    tone={summary.pendingPaymentsCount > 0 ? 'warning' : 'success'}
                    label="Cu restanțe"
                    value={summary.pendingPaymentsCount}
                    hint={summary.pendingPaymentsCount > 0 ? (canSeeFinance ? 'Vezi în Finanțe' : 'Vezi în Lot') : summary.owingPlayersCount ? `${summary.owingPlayersCount} cu plăți nescadente` : 'Toți sunt la zi'}
                    // Arrears are worked in Finanțe (it opens on "Cu restanțe"), not in Lot.
                    onPress={() => go(canSeeFinance ? '/admin/finance' : '/admin/roster')}
                  />
                </View>
              ) : null}

              {/* Quick actions */}
              <View className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3 ui-stagger">
                <QuickAction icon="calendar-month" label="Program" detail="Antrenamente, meciuri" onPress={() => go('/admin/schedule')} />
                <QuickAction icon="assignment" label="Liste L12" detail="Loturile pentru meciuri" onPress={() => go('/admin/l12')} />
                <QuickAction icon="verified-user" label="Conformitate" detail="Vize și documente" onPress={() => go('/admin/compliance')} />
                {canSeeFinance ? (
                  <QuickAction icon="insights" label="Finanțe" detail="Încasări și cheltuieli" onPress={() => go('/admin/finance')} />
                ) : (
                  <QuickAction icon="contacts" label="Contacte" detail="Telefoanele clubului" onPress={() => go('/admin/contacts')} />
                )}
              </View>

              {/* Phones: what needs fixing comes before the schedule. */}
              <View className="lg:hidden ui-rise">{attentionCard}</View>

              <View className="flex-col lg:flex-row lg:items-start gap-4">
                {/* Left: next 7 days */}
                <View className="flex-1 min-w-0 gap-5 ui-rise">
                  <SectionCard
                    title="Următoarele 7 zile"
                    subtitle={weekEvents ? `${plural(weekEvents.length, 'eveniment programat', 'evenimente programate')}` : undefined}
                    icon="date-range"
                    tone="brand"
                    action={{ label: 'Program', onPress: () => go('/admin/schedule') }}
                  >
                    {weekEvents ? <WeekStrip events={weekEvents} selected={selectedDay} onSelect={setSelectedDay} /> : null}
                    {eventsUnavailable ? (
                      <LoadFailed title="Programul nu s-a încărcat" message="Antrenamentele și meciurile din 7 zile nu sunt afișate." onRetry={loadDashboard} />
                    ) : !upcoming ? (
                      <View className="px-4 md:px-5 pb-4 gap-2">
                        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[60px] w-full rounded-[14px]" />)}
                      </View>
                    ) : upcoming.length === 0 ? (
                      <View className="px-4 pb-4">
                        {selectedDay ? (
                          <EmptyState
                            compact
                            icon="event-available"
                            title="Nimic programat"
                            message={`Nu sunt antrenamente sau meciuri ${dayPhrase(new Date(selectedDay))}.`}
                            actionLabel="Toată săptămâna"
                            onAction={() => setSelectedDay(null)}
                          />
                        ) : (
                          <EmptyState compact icon="event-available" title="Nimic programat" message="Nu sunt antrenamente sau meciuri în următoarele 7 zile." />
                        )}
                      </View>
                    ) : (
                      // Day groups of rows with dividers, flush in the card (it was a bordered card per event).
                      <View className="pb-1">
                        {upcoming.map((group) => (
                          <View key={group.key}>
                            <View className="px-4 md:px-5 pt-3 pb-1.5">
                              <Text className="t-eyebrow" style={{ color: group.label === 'Azi' ? 'var(--c-brand-fg)' : 'var(--c-muted)' }}>{group.label}</Text>
                            </View>
                            <View className="ui-stagger">
                              {group.items.map((event) => {
                                const meta = getEventTypeMeta(event.type);
                                return (
                                  <Pressable
                                    key={event.id}
                                    onPress={() => go(`/admin/event/${event.id}`)}
                                    accessibilityRole="link"
                                    className="home-row ui-press flex-row items-center gap-3 border-t px-4 md:px-5 py-2.5 text-left hover:bg-[var(--c-surface-2)]"
                                    style={{ borderColor: 'var(--c-border-soft)' } as any}
                                  >
                                    <View className="w-[54px] h-[46px] rounded-[12px] items-center justify-center shrink-0" style={{ backgroundColor: meta.soft }}>
                                      <MaterialIcons name={EVENT_ICON[event.type] ?? 'event'} size={15} color={meta.onSoft} />
                                      <Text className="t-num text-[13px] font-bold mt-0.5" style={{ color: meta.onSoft }}>{time(event.startTime)}</Text>
                                    </View>
                                    <View className="flex-1 min-w-0">
                                      <Text className="text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{event.title}</Text>
                                      <Text className="t-meta" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
                                        {[meta.label, event.teamName, event.location].filter(Boolean).join(' · ')}
                                      </Text>
                                    </View>
                                    <View className="home-arrow"><MaterialIcons name="chevron-right" size={20} color="var(--c-faint)" /></View>
                                  </Pressable>
                                );
                              })}
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </SectionCard>

                </View>

                {/* Right: attention + results */}
                <View className="w-full lg:w-[380px] xl:w-[420px] shrink-0 gap-5 ui-rise">
                  <View className="hidden lg:flex">{attentionCard}</View>

                  <SectionCard
                    title="Rezultate recente"
                    subtitle={record ? `${record.wins} victorii · ${record.losses} înfrângeri` : 'Echipele clubului în FRB'}
                    icon="emoji-events"
                    tone="warning"
                  >
                    {!results ? (
                      <View className="px-4 md:px-5 pb-4 gap-2">
                        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[56px] w-full rounded-[14px]" />)}
                      </View>
                    ) : results.length === 0 ? (
                      <View className="px-4 md:px-5 pb-4">
                        <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>Niciun rezultat FRB pentru echipele clubului încă.</Text>
                      </View>
                    ) : (
                      <View className="pb-1">
                        {record ? (
                          <View className="flex-row h-1.5 rounded-full overflow-hidden mx-4 md:mx-5 mb-3" style={{ backgroundColor: 'var(--c-surface-3)' }}>
                            <View className="ui-bar h-full" style={{ width: `${(record.wins / record.total) * 100}%`, backgroundColor: 'var(--c-success)' } as any} />
                            <View className="ui-bar h-full" style={{ width: `${(record.losses / record.total) * 100}%`, backgroundColor: 'var(--c-danger)' } as any} />
                          </View>
                        ) : null}
                        <View className="ui-stagger">
                          {results.map((m, index) => {
                            const win = m.result === 'W';
                            const loss = m.result === 'L';
                            const tone = win ? ACCENT.success : loss ? ACCENT.danger : null;
                            // FRB only exposes a match sheet for rows that carry a game id.
                            const open = m.gameId && m.frbSeasonId
                              ? () => go(`/admin/match/${m.gameId}?seasonId=${encodeURIComponent(m.frbSeasonId)}`)
                              : undefined;
                            const Row: any = open ? Pressable : View;
                            return (
                              <Row
                                key={`${m.savedTeamName}-${m.date}-${index}`}
                                {...(open ? { onPress: open, accessibilityRole: 'link', accessibilityLabel: `Detalii meci: ${m.homeTeam} – ${m.awayTeam}` } : {})}
                                className={`flex-row items-center gap-3 border-t pl-4 md:pl-5 ${open ? 'pr-3 md:pr-4 home-row ui-press text-left hover:bg-[var(--c-surface-2)]' : 'pr-4 md:pr-5'} py-2.5`}
                                style={{ borderColor: 'var(--c-border-soft)' } as any}
                              >
                                <View
                                  className="w-8 h-8 rounded-[10px] items-center justify-center shrink-0"
                                  style={{ backgroundColor: tone ? tone.bg : 'var(--c-surface-3)' } as any}
                                  accessibilityLabel={win ? 'Victorie' : loss ? 'Înfrângere' : 'Rezultat'}
                                >
                                  <Text className="text-[12.5px] font-extrabold" style={{ color: tone ? tone.fg : 'var(--c-muted)' }}>{win ? 'V' : loss ? 'Î' : '–'}</Text>
                                </View>
                                <View className="flex-1 min-w-0">
                                  <Text className="text-[13px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{m.homeTeam}</Text>
                                  <Text className="text-[13px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{m.awayTeam}</Text>
                                </View>
                                <View className="items-end shrink-0">
                                  <Text className="t-num text-[14px] font-extrabold" style={{ color: 'var(--c-ink)' }}>{m.homeScore}</Text>
                                  <Text className="t-num text-[14px] font-extrabold" style={{ color: 'var(--c-ink)' }}>{m.awayScore}</Text>
                                </View>
                                <Text className="t-meta w-[40px] text-right shrink-0" style={{ color: 'var(--c-faint)' }}>{m.date.slice(0, 5)}</Text>
                                {open ? <View className="home-arrow"><MaterialIcons name="chevron-right" size={18} color="var(--c-faint)" /></View> : null}
                              </Row>
                            );
                          })}
                        </View>
                      </View>
                    )}
                  </SectionCard>
                </View>
              </View>
            </View>
          </PageContainer>
        </View>
      </ScrollView>
    </View>
  );
}
