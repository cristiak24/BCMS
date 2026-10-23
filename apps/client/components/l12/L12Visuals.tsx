import { parseApiDate } from '@/utils/dates';
import { Pressable, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import Button from '../ui/Button';
import { DenseRow } from '../ui/DenseList';
import type { L12OverviewMatch } from '../../services/l12Api';
import { plural } from '../../utils/plural';

/**
 * Presentational pieces of the L12 home: match "tickets", lineup pips, team
 * avatars and the welcome panel. Colour is limited to the match-kind accent on
 * the date block and the green of a ready lineup; surfaces stay neutral and the
 * `.glass` layer is used only on small panels that sit over the hero artwork.
 */

// ── Match kinds ──────────────────────────────────────────────

export type MatchKind = 'frb' | 'amical' | 'municipal';

/**
 * Official national fixtures reach the calendar through the FRB sync; anything
 * added by hand is a friendly, unless the team plays the municipal league (or
 * the event says so).
 */
export function matchKind(match: L12OverviewMatch): MatchKind {
  const text = `${match.title} ${match.location ?? ''}`.toLowerCase();
  if (match.source === 'frb') return 'frb';
  if (/amical/.test(text)) return 'amical';
  if (match.teamLevel === 'municipal' || /municipal/.test(text)) return 'municipal';
  return 'amical';
}

export const KIND_META: Record<MatchKind, { label: string; plural: string; fg: string; bg: string }> = {
  frb: { label: 'Oficial FRB', plural: 'Oficiale FRB', fg: 'var(--c-brand-fg)', bg: 'var(--c-surface-tint)' },
  // Not success/warning: a green „Amical” read like the green „Gata” next to it.
  amical: { label: 'Amical', plural: 'Amicale', fg: 'var(--c-sky-fg)', bg: 'var(--c-sky-bg)' },
  municipal: { label: 'Municipal', plural: 'Municipale', fg: 'var(--c-purple-fg)', bg: 'var(--c-purple-bg)' },
};

export function KindBadge({ kind }: { kind: MatchKind }) {
  const meta = KIND_META[kind];
  return (
    <View className="self-start rounded-full px-2 py-[2px]" style={{ backgroundColor: meta.bg }}>
      <Text className="text-[11px] font-semibold" style={{ color: meta.fg }}>{meta.label}</Text>
    </View>
  );
}

// ── Small building blocks ────────────────────────────────────

const LINEUP_SIZE = 12;

export function initials(name: string) {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Is this side of the fixture the club's own team? */
export function isOwnSide(side: string | null, teamName: string | null) {
  if (!side || !teamName) return false;
  const a = side.toLowerCase();
  const b = teamName.toLowerCase();
  return a === b || a.includes(b) || b.includes(a);
}

export function TeamAvatar({ name, mine, size = 22 }: { name: string; mine?: boolean; size?: number }) {
  return (
    // Decorative: the team name is always written next to it.
    <View
      aria-hidden
      className="items-center justify-center rounded-full shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: mine ? 'var(--c-surface-tint)' : 'var(--c-surface-3)',
      }}
    >
      <Text
        className="f-display font-bold"
        style={{ fontSize: Math.max(11, Math.round(size * 0.4)), color: mine ? 'var(--c-brand-fg)' : 'var(--c-ink-soft)' }}
      >
        {initials(name)}
      </Text>
    </View>
  );
}

/** Twelve small dots — one per spot on the sheet — filled as the lineup grows. */
export function LineupPips({ count }: { count: number }) {
  const filled = Math.max(0, Math.min(LINEUP_SIZE, count));
  return (
    <View className="flex-row items-center gap-[3px]" accessibilityLabel={`${filled} din ${LINEUP_SIZE} jucători`}>
      {Array.from({ length: LINEUP_SIZE }, (_, i) => {
        const on = i < filled;
        return (
          <View
            key={i}
            className={on ? 'l12-pip' : undefined}
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: on ? 'var(--c-success)' : 'var(--c-border)',
              animationDelay: on ? `${0.15 + i * 0.03}s` : undefined,
            } as any}
          />
        );
      })}
    </View>
  );
}

/** Right-hand status of a match or team: pips when ready, a gentle nudge when not. */
export function LineupStatus({ set, count, align = 'end' }: { set: boolean; count: number; align?: 'start' | 'end' }) {
  if (set) {
    return (
      <View className={`gap-1 ${align === 'end' ? 'items-end' : 'items-start'}`}>
        <LineupPips count={count} />
        <Text className="t-meta" style={{ color: 'var(--c-success-fg)' }}>
          {plural(count, 'jucător', 'jucători')} pe listă
        </Text>
      </View>
    );
  }
  return (
    <View className="flex-row items-center gap-1 rounded-full pl-2.5 pr-2 h-7 self-start" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
      <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>Completează lista</Text>
      <View className="home-arrow"><MaterialIcons name="arrow-forward" size={13} color="var(--c-brand-fg)" /></View>
    </View>
  );
}

/** Neutral date tile: the match type is the badge, not a coloured field. */
function DateBlock({ iso, played }: { iso: string; played: boolean }) {
  const date = parseApiDate(iso);
  const valid = !Number.isNaN(date.getTime());
  return (
    <View
      aria-hidden
      className="w-11 items-center justify-center py-1.5 rounded-[10px] shrink-0"
      style={{ backgroundColor: 'var(--c-surface-2)', opacity: played ? 0.7 : 1 }}
    >
      <Text className="text-[11px] font-semibold capitalize" style={{ color: 'var(--c-muted)' }}>
        {valid ? date.toLocaleDateString('ro-RO', { weekday: 'short' }).replace('.', '') : ''}
      </Text>
      <Text className="f-display t-num text-[18px] font-bold leading-none mt-0.5" style={{ color: 'var(--c-ink)' }}>
        {valid ? date.getDate() : '–'}
      </Text>
    </View>
  );
}

const timeOf = (iso: string) => {
  const date = parseApiDate(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
};

// ── Match ticket ─────────────────────────────────────────────

export function MatchTicket({
  match,
  home,
  away,
  note,
  showTeam,
  played,
  onPress,
}: {
  match: L12OverviewMatch;
  home: string;
  away: string | null;
  /** The event title, when the sides don't come from it (manual matches). */
  note?: string | null;
  showTeam: boolean;
  played: boolean;
  onPress: () => void;
}) {
  const kind = matchKind(match);
  const sides = [home, away].filter((side): side is string => Boolean(side));
  // A row of the day's DenseList; it used to be a card per match.
  return (
    <DenseRow className="hover:bg-[var(--c-surface-2)] transition-colors">
      <Pressable
        onPress={onPress}
        accessibilityRole="link"
        accessibilityLabel={`L12 pentru ${match.title}`}
        className="flex-1 min-w-0 flex-row items-center gap-3 text-left"
      >
        <DateBlock iso={match.startTime} played={played} />

        <View className="flex-1 min-w-0 gap-1.5 justify-center">
          <View className="gap-1">
            {sides.map((side) => (
              <View key={side} className="flex-row items-center gap-2 min-w-0">
                <TeamAvatar name={side} mine={isOwnSide(side, match.teamName)} />
                <Text className="f-display text-[13.5px] font-semibold flex-1 min-w-0" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{side}</Text>
              </View>
            ))}
          </View>

          <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
            <View className="flex-row items-center gap-1">
              <MaterialIcons name="schedule" size={13} color="var(--c-faint)" />
              <Text className="t-num t-meta font-semibold" style={{ color: 'var(--c-ink-soft)' }}>{timeOf(match.startTime)}</Text>
            </View>
            <KindBadge kind={kind} />
            {showTeam && match.teamName ? <Text className="t-meta" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{match.teamName}</Text> : null}
            {note ? <Text className="t-meta" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{note}</Text> : null}
            {played ? <Text className="t-meta" style={{ color: 'var(--c-faint)' }}>jucat</Text> : null}
          </View>

          <View className="sm:hidden">
            <LineupStatus set={match.hasLineup} count={match.playerCount} align="start" />
          </View>
        </View>

        <View className="hidden sm:flex items-end justify-center pl-2 shrink-0">
          <LineupStatus set={match.hasLineup} count={match.playerCount} />
        </View>
      </Pressable>
    </DenseRow>
  );
}

// ── Team card (L12 constant) ─────────────────────────────────

export function TeamTile({
  name,
  subtitle,
  set,
  count,
  onPress,
}: {
  name: string;
  subtitle: string;
  set: boolean;
  count: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`L12 constant pentru ${name}`}
      className="ui-lift ui-press home-row rounded-[14px] border p-3 gap-2.5 text-left"
      style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-xs)' } as any}
    >
      <View className="flex-row items-center gap-3 min-w-0">
        <TeamAvatar name={name} mine size={34} />
        <View className="flex-1 min-w-0">
          <Text className="f-display text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{name}</Text>
          <Text className="t-meta mt-0.5" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{subtitle}</Text>
        </View>
      </View>
      <LineupStatus set={set} count={count} align="start" />
    </Pressable>
  );
}

// ── Day heading ──────────────────────────────────────────────

export function DayHeading({ label, count }: { label: string; count: number }) {
  const today = label === 'Azi';
  return (
    <View className="flex-row items-center gap-2.5 px-0.5">
      {today ? <View className="ui-ping w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--c-brand-fg)' }} /> : null}
      <Text accessibilityRole="header" className="f-display text-[15px] font-bold" style={{ color: today ? 'var(--c-brand-fg)' : 'var(--c-ink)' }}>{label}</Text>
      <Text className="t-num t-meta" style={{ color: 'var(--c-faint)' }}>{plural(count, 'meci', 'meciuri')}</Text>
      <View className="flex-1 h-px" style={{ backgroundColor: 'var(--c-border-soft)' }} />
    </View>
  );
}

// ── Welcome panel ────────────────────────────────────────────

function CourtLines() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 320 200"
      width="320"
      height="200"
      style={{ position: 'absolute', right: -50, bottom: -70, pointerEvents: 'none', opacity: 0.6 }}
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

function StatTile({ value, label, tone }: { value: string | number; label: string; tone: string }) {
  return (
    <View className="glass flex-1 min-w-0 rounded-[12px] px-3 py-2">
      <View className="flex-row items-center gap-1.5">
        <View className="w-[3px] h-3 rounded-full" style={{ backgroundColor: tone }} />
        <Text className="t-eyebrow" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{label}</Text>
      </View>
      <Text className="f-display t-num text-[20px] font-extrabold leading-none mt-1.5" style={{ color: 'var(--c-ink-strong)' }}>{value}</Text>
    </View>
  );
}

export type HeroNext = { match: L12OverviewMatch; home: string; away: string | null };

export function L12Hero({
  unset,
  ready,
  teamsSet,
  teamsTotal,
  next,
  onOpenNext,
}: {
  unset: number;
  ready: number;
  teamsSet: number;
  teamsTotal: number;
  next: HeroNext | null;
  onOpenNext: (eventId: number) => void;
}) {
  const upcoming = unset + ready;
  // Neutral, like the rest of the app (it was „Hai să pregătim loturile” / „Succes pe teren!”).
  const title = unset > 0 ? 'Meciuri fără listă L12' : upcoming > 0 ? 'Toate listele sunt gata' : 'Niciun meci în program';
  const subtitle = unset > 0
    ? `${plural(unset, 'meci nu are', 'meciuri nu au')} încă lista L12. Alege unul ca s-o completezi.`
    : upcoming > 0
      ? `Toate cele ${plural(upcoming, 'meci viitor are', 'meciuri viitoare au')} lista L12 gata.`
      : 'Când apar meciuri în Program, lista lor se pregătește de aici.';

  return (
    <View className="ui-rise relative overflow-hidden rounded-[16px] border" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}>
      <View
        pointerEvents="none"
        className="absolute rounded-full"
        style={{ width: 280, height: 280, right: -60, top: -110, backgroundColor: 'var(--c-surface-tint)', opacity: 0.85 }}
      />
      <CourtLines />

      <View className="relative flex-col lg:flex-row lg:items-center gap-3.5 p-3.5 sm:p-4 md:p-5">
        <View className="flex-1 min-w-0 gap-3">
          <View>
            <Text className="t-eyebrow" style={{ color: 'var(--c-muted)' }}>Liste de joc · L12</Text>
            <Text accessibilityRole="header" aria-level={1} className="f-display text-[20px] md:text-[24px] font-extrabold leading-tight mt-1" style={{ color: 'var(--c-ink-strong)', letterSpacing: '-0.03em' } as any}>
              {title}
            </Text>
            <Text className="text-[13px] mt-1 max-w-[520px]" style={{ color: 'var(--c-muted)' }}>{subtitle}</Text>
          </View>

          <View className="flex-row gap-2">
            <StatTile value={unset} label="Fără L12" tone="var(--c-warning)" />
            <StatTile value={ready} label="Gata" tone="var(--c-success)" />
            <StatTile value={`${teamsSet}/${teamsTotal}`} label="Loturi" tone="var(--c-brand-fg)" />
          </View>
        </View>

        {next ? (
          <View className="glass rounded-[14px] p-3 gap-2.5 lg:w-[300px]" style={{ boxShadow: 'var(--e-md)' } as any}>
            <Text className="t-eyebrow" style={{ color: 'var(--c-muted)' }}>{unset > 0 ? 'Următorul meci fără listă' : 'Următorul meci'}</Text>
            <View className="gap-1.5">
              {[next.home, next.away].filter((side): side is string => Boolean(side)).map((side) => (
                <View key={side} className="flex-row items-center gap-2 min-w-0">
                  <TeamAvatar name={side} mine={isOwnSide(side, next.match.teamName)} />
                  <Text className="f-display text-[15px] font-semibold flex-1 min-w-0" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{side}</Text>
                </View>
              ))}
            </View>
            <View className="flex-row items-center gap-1.5">
              <MaterialIcons name="event" size={14} color="var(--c-faint)" />
              <Text className="t-meta" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
                {parseApiDate(next.match.startTime).toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long' })} · {timeOf(next.match.startTime)}
              </Text>
            </View>
            <Button
              variant={next.match.hasLineup ? 'secondary' : 'primary'}
              icon={next.match.hasLineup ? 'assignment' : 'edit'}
              label={next.match.hasLineup ? 'Vezi lista' : 'Completează lista'}
              onPress={() => onOpenNext(next.match.eventId)}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}
