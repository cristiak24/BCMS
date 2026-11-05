import { parseApiDate } from '@/utils/dates';
import { Pressable, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import Button from '../ui/Button';
import { DenseRow } from '../ui/DenseList';
import PageHero, { GlassStat, StatStrip } from '../admin/PageHero';
import type { L12OverviewMatch } from '../../services/l12Api';
import { plural } from '../../utils/plural';

import { tr, appLocale } from '../../i18n';
/**
 * Presentational pieces of the L12 home: match "tickets", lineup pips, team
 * avatars and the welcome panel. Colour is limited to the match-kind accent on
 * the date block and the green of a ready lineup; surfaces stay neutral (no
 * glass and no hero artwork since the admin work pages went plain).
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
  frb: { label: tr('Oficial FRB'), plural: tr('Oficiale FRB'), fg: 'var(--c-brand-fg)', bg: 'var(--c-surface-tint)' },
  // Not success/warning: a green „Amical” read like the green „Gata” next to it.
  amical: { label: tr('Amical'), plural: tr('Amicale'), fg: 'var(--c-sky-fg)', bg: 'var(--c-sky-bg)' },
  municipal: { label: tr('Municipal'), plural: tr('Municipale'), fg: 'var(--c-purple-fg)', bg: 'var(--c-purple-bg)' },
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
    <View className="flex-row items-center gap-[3px]" accessibilityLabel={tr('{filled} din {LINEUP_SIZE} jucători', { filled, LINEUP_SIZE })}>
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
          {tr('{0} pe listă', { '0': plural(count, tr('jucător'), tr('jucători')) })}</Text>
      </View>
    );
  }
  return (
    <View className="flex-row items-center gap-1 rounded-full pl-2.5 pr-2 h-7 self-start" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
      <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>{tr('Completează lista')}</Text>
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
        {valid ? date.toLocaleDateString(appLocale(), { weekday: 'short' }).replace('.', '') : ''}
      </Text>
      <Text className="f-display t-num text-[18px] font-bold leading-none mt-0.5" style={{ color: 'var(--c-ink)' }}>
        {valid ? date.getDate() : '–'}
      </Text>
    </View>
  );
}

const timeOf = (iso: string) => {
  const date = parseApiDate(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString(appLocale(), { hour: '2-digit', minute: '2-digit' });
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
        accessibilityLabel={tr('L12 pentru {0}', { '0': match.title })}
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
      accessibilityLabel={tr('L12 constant pentru {name}', { name })}
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
      <Text className="t-num t-meta" style={{ color: 'var(--c-faint)' }}>{plural(count, tr('meci'), tr('meciuri'))}</Text>
      <View className="flex-1 h-px" style={{ backgroundColor: 'var(--c-border-soft)' }} />
    </View>
  );
}

// ── Welcome panel ────────────────────────────────────────────

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
  const title = unset > 0 ? tr('Meciuri fără listă L12') : upcoming > 0 ? tr('Toate listele sunt gata') : tr('Niciun meci în program');
  const subtitle = unset > 0
    ? tr('{0} încă lista L12. Alege unul ca s-o completezi.', { '0': plural(unset, 'meci nu are', 'meciuri nu au') })
    : upcoming > 0
      ? tr('Toate cele {0} lista L12 gata.', { '0': plural(upcoming, 'meci viitor are', 'meciuri viitoare au') })
      : tr('Când apar meciuri în Program, lista lor se pregătește de aici.');

  // The plain page header every admin work page opens on (the hero is Acasă's
  // alone); the next match without a list stays one actionable row below it.
  return (
    <PageHero eyebrow={tr('Liste de joc · L12')} title={title} subtitle={subtitle} className="mb-0">
      <StatStrip className="grid-cols-3">
        <GlassStat value={unset} label={tr('Fără L12')} dot="var(--c-warning)" />
        <GlassStat value={ready} label={tr('Gata')} dot="var(--c-success)" />
        <GlassStat value={`${teamsSet}/${teamsTotal}`} label={tr('L12 constant')} shortLabel={tr('Constant')} hint={tr('echipe cu lista setată')} dot="var(--c-brand-fg)" />
      </StatStrip>

      {next ? (
        <View className="flex-col sm:flex-row sm:items-center gap-3 rounded-[14px] border px-3.5 py-3" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}>
          <View className="flex-1 min-w-0 gap-1">
            <Text className="t-label" style={{ color: 'var(--c-muted)' }}>{unset > 0 ? tr('Următorul meci fără listă') : tr('Următorul meci')}</Text>
            <View className="flex-row items-center gap-2 min-w-0">
              <TeamAvatar name={next.home} mine={isOwnSide(next.home, next.match.teamName)} />
              <Text className="f-display text-[15px] font-semibold shrink min-w-0" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>
                {next.away ? `${next.home} – ${next.away}` : next.home}
              </Text>
            </View>
            <View className="flex-row items-center gap-1.5">
              <MaterialIcons name="event" size={14} color="var(--c-faint)" />
              <Text className="t-meta" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
                {parseApiDate(next.match.startTime).toLocaleDateString(appLocale(), { weekday: 'long', day: 'numeric', month: 'long' })} · {timeOf(next.match.startTime)}
              </Text>
            </View>
          </View>
          <Button
            variant={next.match.hasLineup ? 'secondary' : 'primary'}
            icon={next.match.hasLineup ? 'assignment' : 'edit'}
            label={next.match.hasLineup ? tr('Vezi lista') : tr('Completează lista')}
            onPress={() => onOpenNext(next.match.eventId)}
          />
        </View>
      ) : null}
    </PageHero>
  );
}
