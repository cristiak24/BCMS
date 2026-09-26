import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useRouter } from '@/src/web/expoRouter';
import { eventsApi, CalendarEvent } from '../../services/eventsApi';
import { basketballApi, Match } from '../../services/basketballApi';
import { teamsApi, Player, Team } from '../../services/teamsApi';
import { AuthUser, normalizeRole } from '../../utils/authSession';
import {
  loadPlayerAttendanceDetails,
  isPresentAttendanceStatus,
  isCountedAttendanceStatus,
  PlayerAttendanceRecord,
  PlayerAttendanceSummary,
} from '../../utils/playerAttendance';
import { useSession } from '../../context/AuthContext';
import { useResponsive } from '../../hooks/useResponsive';
import { useHeader, DEFAULT_SEARCH_PLACEHOLDER } from '../../components/HeaderContext';
import { Navigate } from 'react-router-dom';
import GlassCard from '../../components/ui/GlassCard';
import { Skeleton } from '../../components/ui/Skeleton';
import PageContainer from '../../components/ui/PageContainer';
import PageHeader from '../../components/ui/PageHeader';
import SectionHeader from '../../components/ui/SectionHeader';
import { EmptyState, ErrorState } from '../../components/ui/ScreenState';
import { PlayerEventDetailModal } from '../../components/schedule/player/PlayerEventDetailModal';

type HubEvent = CalendarEvent & {
  source?: 'internal' | 'frb';
  frbMatch?: Match;
  teamDisplayName?: string;
  categoryName?: string;
  seasonName?: string;
  venueName?: string | null;
};

/**
 * Home is a digest, not an archive: each section shows at most this many rows
 * and links to /schedule for the full list. The old screen carried a 4-field
 * filter bar and 12-item lists, which made the landing page longer than the
 * dedicated schedule screen it was supposed to summarise.
 */
const SECTION_LIMIT = 4;
const RO_LOCALE = 'ro-RO';

const palette = {
  royal: 'var(--c-brand-fg)',
  orange: 'var(--c-warning)',
  green: 'var(--c-success-fg)',
};

function getSessionTeamIds(user: AuthUser | null) {
  return new Set(
    (user?.teamIds ?? [])
      .map((teamId) => Number(teamId))
      .filter((teamId) => Number.isFinite(teamId))
  );
}

function getEventTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value: string) {
  const date = getEventTime(value);
  if (!date) {
    return value;
  }

  return new Intl.DateTimeFormat(RO_LOCALE, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function getDateBlock(value: string) {
  const date = getEventTime(value);
  if (!date) {
    return { month: 'DATA', day: '--' };
  }

  return {
    month: new Intl.DateTimeFormat(RO_LOCALE, { month: 'short' }).format(date).toUpperCase().replace('.', ''),
    day: String(date.getDate()),
  };
}

function formatTimeRange(start: string, end: string) {
  const startDate = getEventTime(start);
  const endDate = getEventTime(end);

  if (!startDate) {
    return start;
  }

  const formatter = new Intl.DateTimeFormat(RO_LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  if (!endDate) {
    return formatter.format(startDate);
  }

  return `${formatter.format(startDate)} - ${formatter.format(endDate)}`;
}

function hasFrbIds(team: Team) {
  return Boolean(team.frbLeagueId && team.frbSeasonId && team.frbTeamId);
}

function normalizeTeamName(value?: string | null) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * The player's own team names, from every source that is scoped to *them*
 * rather than to their club:
 *   • their own player record (GET /players/me), and
 *   • the roster (GET /players/roster), which the server already narrows to
 *     the requesting player's team(s).
 * `teamsApi.getTeams()` is deliberately NOT a source — it returns every team
 * in the club, which is what used to leak other squads' fixtures onto this
 * page.
 */
function getPlayerTeamNames(myRecord: Player | null, roster: Player[]) {
  const names = [
    ...(myRecord ? [myRecord.teamName, ...(myRecord.teamNames ?? [])] : []),
    ...roster.flatMap((item) => [item.teamName, ...(item.teamNames ?? [])]),
  ];

  return new Set(names.map(normalizeTeamName).filter(Boolean));
}

/**
 * Team-name comparison that tolerates the drift between how a squad is named
 * in our DB and how the federation spells it in a fixture ("CSM 2007 Focsani"
 * vs "CSM 2007 Focsani U16"), by accepting either as a substring of the other.
 */
function namesOverlap(candidate: string | null | undefined, names: Set<string>) {
  const normalized = normalizeTeamName(candidate);
  if (!normalized) {
    return false;
  }

  if (names.has(normalized)) {
    return true;
  }

  for (const name of names) {
    if (name.length >= 4 && (normalized.includes(name) || name.includes(normalized))) {
      return true;
    }
  }

  return false;
}

/**
 * Whether an event belongs to a team the player is actually on.
 *
 * The previous rule returned `true` for everything whenever the session
 * carried no team ids, so a player whose squad was "CSM 2007 Focsani" saw the
 * club's other squads' results (Oradea fixtures on a Focsani player's home
 * page). Identity now also comes from the player's own record and roster, and
 * when at least one signal exists it is enforced instead of ignored.
 */
function belongsToPlayerTeams(event: CalendarEvent, teamIds: Set<number>, teamNames: Set<string>) {
  if (teamIds.size === 0 && teamNames.size === 0) {
    // No signal at all: fall back to the server's club scoping rather than
    // showing the player a blank page.
    return true;
  }

  if (event.teamId != null && teamIds.has(Number(event.teamId))) {
    return true;
  }

  return namesOverlap(event.teamName, teamNames);
}

function isPlayerTeam(team: Team, teamIds: Set<number>, teamNames: Set<string>) {
  if (teamIds.size === 0 && teamNames.size === 0) {
    // Unlike internal events, federation fixtures are fetched per-team from an
    // external API — with no identity signal there is nothing to scope them
    // to, and pulling every club team's fixtures is exactly the leak above.
    return false;
  }

  return teamIds.has(Number(team.id)) || namesOverlap(team.name, teamNames);
}

function hashToNegativeId(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }

  return -Math.abs(hash || value.length || 1);
}

function parseFrbDateTime(dateValue: string, timeValue?: string) {
  const match = dateValue.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  const [hour = '12', minute = '00'] = (timeValue || '12:00').split(':');
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    0,
    0
  );

  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoLocal(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}:00`;
}

function frbMatchToHubEvent(match: Match, team: Team, index: number): HubEvent | null {
  const startDate = parseFrbDateTime(match.date, match.time);
  if (!startDate) {
    return null;
  }

  const endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000);
  const scoreDescription = match.homeScore && match.awayScore ? `score: ${match.homeScore}-${match.awayScore}` : null;
  const title = `${match.homeTeam} vs ${match.awayTeam}`;
  const key = `${team.id}-${match.date}-${match.time}-${title}-${index}`;

  return {
    id: hashToNegativeId(key),
    type: 'match',
    title,
    description: scoreDescription,
    location: match.league || team.leagueName || null,
    startTime: toIsoLocal(startDate),
    endTime: toIsoLocal(endDate),
    teamId: team.id,
    coachId: null,
    amount: null,
    status: match.status,
    teamName: team.name,
    coachName: 'FRB',
    source: 'frb',
    frbMatch: match,
    teamDisplayName: team.name,
    categoryName: team.leagueName || match.league || 'FRB',
    seasonName: team.seasonName || '',
    venueName: match.league || null,
  };
}

function getEventCategory(event: HubEvent) {
  if (event.categoryName) {
    return event.categoryName;
  }

  if (event.type === 'match') {
    return 'Meci';
  }

  if (event.type === 'camp') {
    return 'Cantonament';
  }

  return 'Antrenament';
}

function getMonthKey(value: string) {
  const date = getEventTime(value);
  if (!date) {
    return 'unknown';
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getEventIdentity(event: CalendarEvent) {
  const eventDate = getEventTime(event.startTime);
  const dateKey = eventDate
    ? `${eventDate.getFullYear()}-${eventDate.getMonth() + 1}-${eventDate.getDate()}`
    : event.startTime;
  return `${event.type}:${dateKey}:${(event.title ?? '').trim().toLowerCase()}`;
}

function dedupeHubEvents(events: HubEvent[]) {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = getEventIdentity(event);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function loadFrbMatchesForTeam(team: Team) {
  const currentMonth = new Date().getMonth() + 1;
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
  const requests = ['all', String(currentMonth), String(nextMonth)];
  const groups = await Promise.all(
    requests.map(async (month) => {
      try {
        return await basketballApi.getMatches(team.frbLeagueId, team.frbSeasonId, team.frbTeamId, month);
      } catch (matchError) {
        console.error('[player hub frb matches]', matchError);
        return [] as Match[];
      }
    })
  );
  const seen = new Set<string>();

  return groups.flat().filter((match) => {
    const key = `${match.date}-${match.time}-${match.homeTeam}-${match.awayTeam}-${match.homeScore}-${match.awayScore}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function getEventTimestamp(event: CalendarEvent) {
  return getEventTime(event.startTime)?.getTime() ?? 0;
}

function isCancelled(event: CalendarEvent) {
  return String(event.status ?? '').toLowerCase() === 'cancelled';
}

function isUpcoming(event: CalendarEvent) {
  return !isCancelled(event) && getEventTimestamp(event) >= Date.now();
}

function isFinishedGame(event: CalendarEvent) {
  const status = String(event.status ?? '').toLowerCase();
  const finishedStatuses = new Set(['finished', 'completed', 'graded']);
  return event.type === 'match' && !isCancelled(event) && (finishedStatuses.has(status) || Boolean(getScoreFromText(event)));
}

function getStatusCopy(event: CalendarEvent) {
  const status = String(event.status ?? '').trim();
  if (!status) {
    return 'Programat';
  }

  return status.charAt(0).toUpperCase() + status.slice(1);
}

function getScoreFromText(event: CalendarEvent) {
  const source = `${event.title} ${event.description ?? ''}`;
  const explicitScore = source.match(/score:\s*(\d{1,3})\s*[-:]\s*(\d{1,3})/i);
  const fallbackScore = source.match(/\b(\d{1,3})\s*[-:]\s*(\d{1,3})\b/);
  const match = explicitScore ?? fallbackScore;
  return match ? { home: match[1], away: match[2], label: `${match[1]} - ${match[2]}` } : null;
}

function sessionMatchesSearch(event: CalendarEvent, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return [
    event.title,
    event.location,
    event.teamName,
    event.coachName,
    event.description,
    event.type,
  ].some((value) => String(value ?? '').toLowerCase().includes(normalized));
}

function getFirstName(session: AuthUser | null) {
  const name = session?.name?.trim();
  if (!name) return 'Panoul meu';
  return name.split(/\s+/)[0];
}

function splitMatchTitle(title: string) {
  const parts = title.split(/\s+vs\s+/i);
  return parts.length === 2 ? { home: parts[0], away: parts[1] } : { home: title, away: '' };
}

type MatchOutcome = 'win' | 'loss' | 'draw';

/** Win/loss/draw from the player's own side, resolved against their team names. */
function getMatchOutcome(event: HubEvent, teamNames: Set<string>): MatchOutcome | null {
  const score = getScoreFromText(event);
  if (!score) {
    return null;
  }

  const home = Number(score.home);
  const away = Number(score.away);
  if (Number.isNaN(home) || Number.isNaN(away)) {
    return null;
  }

  if (home === away) {
    return 'draw';
  }

  // Prefer the player's own team names; fall back to the event's team when the
  // session could not resolve any (so a solitary event still reads correctly).
  const ourNames = teamNames.size > 0
    ? teamNames
    : new Set([normalizeTeamName(event.teamName || event.teamDisplayName)].filter(Boolean));

  const teams = splitMatchTitle(event.title);
  const isHome = namesOverlap(teams.home, ourNames);
  const isAway = namesOverlap(teams.away, ourNames);
  if (isHome === isAway) {
    // Neither side (or ambiguously both) is us — not a result we can score.
    return null;
  }

  const weWon = isHome ? home > away : away > home;
  return weWon ? 'win' : 'loss';
}

/** Consecutive "present" records from the most recent one, stopping at the first counted-but-absent record. Unmarked records are skipped, not counted as a break. */
function getAttendanceStreak(recordsDescending: PlayerAttendanceRecord[]) {
  let streak = 0;
  for (const record of recordsDescending) {
    if (!isCountedAttendanceStatus(record.status)) {
      continue;
    }
    if (isPresentAttendanceStatus(record.status)) {
      streak += 1;
      continue;
    }
    break;
  }
  return streak;
}

/** Rate delta between the most recent chunk and the one before it, or null when there isn't enough counted history to compare. */
function getAttendanceTrend(countedDescending: PlayerAttendanceRecord[], chunkSize = 5) {
  if (countedDescending.length < chunkSize + 2) {
    return null;
  }

  const recent = countedDescending.slice(0, chunkSize);
  const previous = countedDescending.slice(chunkSize, chunkSize * 2);
  if (previous.length === 0) {
    return null;
  }

  const rate = (chunk: PlayerAttendanceRecord[]) => chunk.filter((r) => isPresentAttendanceStatus(r.status)).length / chunk.length;
  return Math.round((rate(recent) - rate(previous)) * 100);
}

function getAttendanceTone(rate: number | null) {
  if (rate == null) {
    return { label: 'În așteptare', color: 'var(--c-muted)' };
  }

  if (rate >= 90) {
    return { label: 'Ritm de elită', color: palette.green };
  }

  if (rate >= 80) {
    return { label: 'Pe drumul bun', color: 'var(--c-brand-fg)' };
  }

  return { label: 'Necesită atenție', color: 'var(--c-warning-fg)' };
}

function MetaRow({ icon, text }: { icon: keyof typeof MaterialIcons.glyphMap; text: string }) {
  return (
    <View className="flex-row items-center min-w-0">
      <MaterialIcons name={icon} size={14} color="var(--c-faint)" />
      <Text className="text-[12px] font-medium ml-1.5 flex-1" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

/** Uppercase micro-label + icon, the one card-header treatment used everywhere on this page. */
function CardLabel({ icon, children }: { icon: keyof typeof MaterialIcons.glyphMap; children: ReactNode }) {
  return (
    <View className="flex-row items-center gap-2">
      <MaterialIcons name={icon} size={14} color="var(--c-faint)" />
      <Text className="text-[11px] font-bold uppercase tracking-[0.07em]" style={{ color: 'var(--c-faint)' }}>
        {children}
      </Text>
    </View>
  );
}

function AttendanceCard({
  playerAttendance,
  attendanceRate,
  attendancePercent,
}: {
  playerAttendance: PlayerAttendanceSummary | null;
  attendanceRate: number | null;
  attendancePercent: number;
}) {
  const tone = getAttendanceTone(attendanceRate);

  return (
    <GlassCard className="min-h-[132px] h-full justify-between">
      <CardLabel icon="insert-chart-outlined">Rată prezență</CardLabel>

      <View className="mt-3">
        <View className="flex-row items-end">
          <Text className="text-[26px] font-bold tracking-tight leading-none" style={{ color: 'var(--c-ink)' }}>
            {attendanceRate == null ? '--' : `${attendanceRate}`}
          </Text>
          <Text className="text-[13px] font-bold mb-0.5" style={{ color: 'var(--c-muted)' }}>%</Text>
        </View>
        <Text className="text-[12px] font-semibold mt-1.5" style={{ color: tone.color }}>{tone.label}</Text>
        <View className="h-1.5 rounded-full overflow-hidden mt-2.5" style={{ backgroundColor: 'var(--c-border-soft)' }}>
          <View style={{ width: `${attendancePercent}%`, height: '100%', borderRadius: 999, backgroundColor: 'var(--c-brand-fg)' }} />
        </View>
        <Text className="text-[11px] font-medium mt-2" style={{ color: 'var(--c-faint)' }}>
          {playerAttendance?.total
            ? `${playerAttendance.present}/${playerAttendance.total} sesiuni recente`
            : 'Nicio prezență marcată încă'}
        </Text>
      </View>
    </GlassCard>
  );
}

function NextEventCard({
  event,
  accent,
  label,
  icon,
  onPress,
}: {
  event: HubEvent | null;
  label: string;
  accent: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  onPress?: () => void;
}) {
  const score = event ? getScoreFromText(event) : null;

  const body = (
    <>
      <CardLabel icon={icon}>{label}</CardLabel>
      {event ? (
        <View className="mt-3 flex-1">
          <Text className="text-[15px] font-bold leading-5" style={{ color: 'var(--c-ink)' }} numberOfLines={2}>
            {event.title}
          </Text>
          {score ? (
            <Text className="text-[18px] font-bold mt-1.5" style={{ color: accent }}>{score.label}</Text>
          ) : null}
          <View className="mt-2 gap-1">
            <MetaRow icon="calendar-today" text={formatDate(event.startTime)} />
            <MetaRow icon="schedule" text={formatTimeRange(event.startTime, event.endTime)} />
          </View>
        </View>
      ) : (
        <View className="flex-1 justify-center mt-3">
          <Text className="text-[13px] font-medium" style={{ color: 'var(--c-faint)' }}>Nimic programat.</Text>
        </View>
      )}
    </>
  );

  // h-full on both wrapper and card: as a grid child the Pressable is stretched
  // to the row height, but without it the GlassCard inside kept its own
  // min-height and rendered visibly shorter than the unwrapped AttendanceCard
  // sitting beside it.
  if (event && onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${event.title}`} className="h-full">
        <GlassCard className="min-h-[132px] h-full">{body}</GlassCard>
      </Pressable>
    );
  }

  return <GlassCard className="min-h-[132px] h-full">{body}</GlassCard>;
}

function EventRow({
  event,
  accent,
  label,
  isMobile,
  onDetails,
}: {
  event: HubEvent;
  accent: string;
  label: string;
  isMobile: boolean;
  onDetails: () => void;
}) {
  const dateBlock = getDateBlock(event.startTime);
  const isMatch = event.type === 'match';

  return (
    <Pressable
      onPress={onDetails}
      accessibilityRole="button"
      accessibilityLabel={`${isMatch ? 'Fișă meci' : 'Detalii'}: ${event.title}`}
      className="rounded-[14px] border px-4 py-3.5 flex-row items-center gap-4"
      style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}
    >
      <View
        className="w-12 h-12 rounded-[12px] items-center justify-center border shrink-0"
        style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)' } as any}
      >
        <Text className="text-[10px] font-bold uppercase tracking-widest" style={{ color: accent }}>
          {dateBlock.month}
        </Text>
        <Text className="text-[16px] font-bold leading-none mt-0.5" style={{ color: 'var(--c-ink)' }}>{dateBlock.day}</Text>
      </View>

      <View className="flex-1 min-w-0">
        <View className="flex-row items-center flex-wrap gap-x-2 gap-y-1">
          <Text className="text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: accent }}>
            {label}
          </Text>
          {event.coachNote ? (
            <View className="flex-row items-center gap-1">
              <MaterialIcons name="chat-bubble-outline" size={11} color="var(--c-brand-fg)" />
              <Text className="text-[11px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>Notă antrenor</Text>
            </View>
          ) : null}
        </View>
        <Text className="text-[15px] font-bold leading-5 mt-0.5" style={{ color: 'var(--c-ink)' }} numberOfLines={2}>
          {event.title}
        </Text>
        <View className={`${isMobile ? 'gap-1' : 'flex-row flex-wrap gap-x-5 gap-y-1'} mt-1.5`}>
          <MetaRow icon="schedule" text={formatTimeRange(event.startTime, event.endTime)} />
          <MetaRow icon="place" text={event.venueName || event.location || event.teamName || 'Teren club'} />
        </View>
      </View>

      {/* Shown on every breakpoint — the whole row is tappable, and hiding the
          chevron on mobile left that with no affordance at all. */}
      <MaterialIcons name="chevron-right" size={20} color="var(--c-faint)" />
    </Pressable>
  );
}

const OUTCOME_META: Record<MatchOutcome, { label: string; full: string; color: string; bg: string }> = {
  win: { label: 'V', full: 'Victorie', color: 'var(--c-success-fg)', bg: 'var(--c-success-bg)' },
  loss: { label: 'Î', full: 'Înfrângere', color: 'var(--c-danger-fg)', bg: 'var(--c-danger-bg)' },
  draw: { label: 'E', full: 'Egal', color: 'var(--c-muted)', bg: 'var(--c-surface-3)' },
};

function ResultCard({ event, outcome }: { event: HubEvent; outcome: MatchOutcome | null }) {
  const score = getScoreFromText(event);
  const dateBlock = getDateBlock(event.startTime);
  const teams = splitMatchTitle(event.title);
  const meta = outcome ? OUTCOME_META[outcome] : null;
  const ownTeam = normalizeTeamName(event.teamName);
  const context = [event.categoryName, event.venueName, event.location]
    .map((value) => (value ?? '').trim())
    .find((value) => value && normalizeTeamName(value) !== ownTeam) ?? '';

  return (
    <GlassCard className="min-h-[132px] h-full justify-between">
      <View className="flex-row items-center justify-between gap-2">
        <CardLabel icon="emoji-events">{`${dateBlock.month} ${dateBlock.day}`}</CardLabel>
        {meta ? (
          <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: meta.bg }}>
            <Text className="text-[10px] font-bold uppercase tracking-widest" style={{ color: meta.color }}>{meta.full}</Text>
          </View>
        ) : null}
      </View>

      <View className="mt-3 gap-1">
        <Text className="text-[13px] font-bold leading-5" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>
          {teams.home}
        </Text>
        <Text className="text-[20px] font-bold tracking-tight leading-none" style={{ color: 'var(--c-brand-fg)' }}>
          {score?.label ?? getStatusCopy(event)}
        </Text>
        {teams.away ? (
          <Text className="text-[13px] font-bold leading-5" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>
            {teams.away}
          </Text>
        ) : null}
      </View>

      {/* Competition/venue, NOT event.teamName — the player's own squad is
          already one of the two lines above, so printing it again just
          repeated "CSM 2007 Focsani" twice inside the same card. */}
      {context ? (
        <Text className="text-[11px] font-medium mt-2" style={{ color: 'var(--c-faint)' }} numberOfLines={1}>
          {context}
        </Text>
      ) : null}
    </GlassCard>
  );
}

function attendanceMarkColor(status: string | null) {
  if (isPresentAttendanceStatus(status)) return 'var(--c-success)';
  const normalized = String(status ?? '').toLowerCase();
  if (normalized === 'medical' || normalized === 'excused') return 'var(--c-warning)';
  if (normalized === 'absent') return 'var(--c-danger)';
  return 'var(--c-border-strong)';
}

function FormColumn({ icon, label, children }: { icon: keyof typeof MaterialIcons.glyphMap; label: string; children: ReactNode }) {
  return (
    <View className="flex-1 min-w-[180px]">
      <View className="mb-3">
        <CardLabel icon={icon}>{label}</CardLabel>
      </View>
      {children}
    </View>
  );
}

/**
 * "Formă" — a supporting stats block, not a dashboard: attendance consistency
 * (streak + a status strip of the last 10 marked sessions), the recent match
 * record, and session volume this month vs last. All three are derived from
 * data the page already loads — no extra network calls.
 */
function PlayerFormStats({
  streak,
  strip,
  trendDelta,
  wins,
  losses,
  draws,
  recentOutcomes,
  monthCount,
  lastMonthCount,
  isMobile,
}: {
  streak: number;
  strip: PlayerAttendanceRecord[];
  trendDelta: number | null;
  wins: number;
  losses: number;
  draws: number;
  recentOutcomes: MatchOutcome[];
  monthCount: number;
  lastMonthCount: number;
  isMobile: boolean;
}) {
  const hasAttendanceData = strip.length > 0;
  const hasMatchData = wins + losses + draws > 0;
  const monthDelta = monthCount - lastMonthCount;

  if (!hasAttendanceData && !hasMatchData && monthCount === 0 && lastMonthCount === 0) {
    return null;
  }

  return (
    <GlassCard>
      <Text className="text-[15px] font-bold mb-4" style={{ color: 'var(--c-ink)' }}>Formă</Text>
      <View className={`${isMobile ? 'gap-5' : 'flex-row gap-8'}`}>
        <FormColumn icon="event-available" label="Consistență">
          {hasAttendanceData ? (
            <>
              <View className="flex-row items-end gap-1.5 mb-2" accessibilityLabel={`Ultimele ${strip.length} sesiuni marcate`}>
                {strip.slice().reverse().map((record) => (
                  <View
                    key={record.event.id}
                    style={{ width: 10, height: 24, borderRadius: 4, backgroundColor: attendanceMarkColor(record.status) }}
                  />
                ))}
              </View>
              <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-ink-soft)' }}>
                {streak > 0 ? `${streak} sesiuni consecutive prezent` : 'Fără sesiuni consecutive momentan'}
              </Text>
              {trendDelta != null ? (
                <Text className="text-[11px] font-medium mt-1" style={{ color: trendDelta >= 0 ? 'var(--c-success-fg)' : 'var(--c-danger-fg)' }}>
                  {trendDelta === 0 ? 'Ritm constant' : `${trendDelta > 0 ? '▲' : '▼'} ${Math.abs(trendDelta)}% față de perioada anterioară`}
                </Text>
              ) : null}
            </>
          ) : (
            <Text className="text-[12px] font-medium" style={{ color: 'var(--c-faint)' }}>Nicio prezență marcată încă.</Text>
          )}
        </FormColumn>

        <FormColumn icon="scoreboard" label="Bilanț meciuri">
          {hasMatchData ? (
            <>
              <View className="flex-row items-center gap-1.5 mb-2">
                {recentOutcomes.slice().reverse().map((outcome, index) => (
                  <View
                    key={index}
                    className="w-6 h-6 rounded-full items-center justify-center"
                    style={{ backgroundColor: OUTCOME_META[outcome].bg }}
                  >
                    <Text className="text-[10px] font-bold" style={{ color: OUTCOME_META[outcome].color }}>{OUTCOME_META[outcome].label}</Text>
                  </View>
                ))}
              </View>
              <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-ink-soft)' }}>
                {wins}V · {losses}Î{draws ? ` · ${draws}E` : ''} în ultimele {wins + losses + draws} meciuri
              </Text>
            </>
          ) : (
            <Text className="text-[12px] font-medium" style={{ color: 'var(--c-faint)' }}>Niciun rezultat cu scor încă.</Text>
          )}
        </FormColumn>

        <FormColumn icon="calendar-month" label="Volum lunar">
          <Text className="text-[24px] font-bold leading-none" style={{ color: 'var(--c-ink)' }}>{monthCount}</Text>
          <Text className="text-[12px] font-semibold mt-1.5" style={{ color: 'var(--c-ink-soft)' }}>sesiuni luna aceasta</Text>
          {lastMonthCount > 0 ? (
            <Text className="text-[11px] font-medium mt-1" style={{ color: monthDelta >= 0 ? 'var(--c-success-fg)' : 'var(--c-muted)' }}>
              {monthDelta === 0 ? 'La fel ca luna trecută' : `${monthDelta > 0 ? '▲' : '▼'} ${Math.abs(monthDelta)} față de luna trecută (${lastMonthCount})`}
            </Text>
          ) : null}
        </FormColumn>
      </View>
    </GlassCard>
  );
}

function PlayerHomeScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { isMobile } = useResponsive();
  // Search lives in the global app header (components/AppHeader.tsx, wired via
  // HeaderContext) — same as the schedule screen. Home used to render its own
  // search box and its own avatar button, duplicating both of the header's.
  const { setSearchPlaceholder, searchValue, setSearchValue } = useHeader();
  const [playerAttendance, setPlayerAttendance] = useState<PlayerAttendanceSummary | null>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<PlayerAttendanceRecord[]>([]);
  const [events, setEvents] = useState<HubEvent[]>([]);
  const [playerTeamNames, setPlayerTeamNames] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attendanceWarning, setAttendanceWarning] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<HubEvent | null>(null);

  useEffect(() => {
    setSearchPlaceholder('Caută sesiuni, echipe, locații...');
    return () => {
      setSearchPlaceholder(DEFAULT_SEARCH_PLACEHOLDER);
      setSearchValue('');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = useCallback(async (showSpinner = false) => {
    if (showSpinner) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);
    setAttendanceWarning(null);

    try {
      const [allEvents, savedTeams, roster, myRecord] = await Promise.all([
        eventsApi.getEvents(),
        teamsApi.getTeams().catch(() => [] as Team[]),
        teamsApi.getRoster().catch(() => [] as Player[]),
        teamsApi.getMyPlayerRecord().catch(() => null),
      ]);

      const teamIds = getSessionTeamIds(session);
      const teamNames = getPlayerTeamNames(myRecord, roster);
      setPlayerTeamNames(teamNames);

      const sessionEvents = allEvents
        .filter((event) => belongsToPlayerTeams(event, teamIds, teamNames))
        .map((event) => ({ ...event, source: 'internal' as const }));

      // Only the player's OWN teams' fixtures — see isPlayerTeam.
      const scopedTeams = savedTeams
        .filter(hasFrbIds)
        .filter((team) => isPlayerTeam(team, teamIds, teamNames));

      const frbEventGroups = await Promise.all(
        scopedTeams.map(async (team) => {
          const matches = await loadFrbMatchesForTeam(team);
          return matches
            .map((match, index) => frbMatchToHubEvent(match, team, index))
            .filter((event): event is HubEvent => Boolean(event));
        })
      );

      setEvents(dedupeHubEvents([...sessionEvents, ...frbEventGroups.flat()]));

      try {
        const details = await loadPlayerAttendanceDetails(session, sessionEvents, 20);
        setPlayerAttendance(details.summary);
        setAttendanceRecords(details.records);
      } catch (attendanceError) {
        setPlayerAttendance(null);
        setAttendanceRecords([]);
        setAttendanceWarning(attendanceError instanceof Error ? attendanceError.message : 'Nu s-a putut încărca prezența.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu s-a putut încărca panoul.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredEvents = useMemo(
    () => events.filter((event) => sessionMatchesSearch(event, searchValue)),
    [events, searchValue]
  );

  // Strictly trainings — the section is titled "Antrenamente viitoare", and
  // admin/medical entries listed under it would be mislabelled. Everything
  // else is one tap away in /schedule.
  const allUpcomingTraining = useMemo(
    () => filteredEvents
      .filter((event) => event.type === 'training' && isUpcoming(event))
      .sort((a, b) => getEventTimestamp(a) - getEventTimestamp(b)),
    [filteredEvents]
  );

  const allUpcomingGames = useMemo(
    () => filteredEvents
      .filter((event) => event.type === 'match' && isUpcoming(event))
      .sort((a, b) => getEventTimestamp(a) - getEventTimestamp(b)),
    [filteredEvents]
  );

  const allGameResults = useMemo(
    () => filteredEvents
      .filter(isFinishedGame)
      .sort((a, b) => getEventTimestamp(b) - getEventTimestamp(a)),
    [filteredEvents]
  );

  const upcomingTraining = allUpcomingTraining.slice(0, SECTION_LIMIT);
  const upcomingGames = allUpcomingGames.slice(0, SECTION_LIMIT);
  const gameResults = allGameResults.slice(0, SECTION_LIMIT);

  const attendanceRate = playerAttendance?.rate ?? null;
  const attendancePercent = attendanceRate == null ? 0 : Math.max(0, Math.min(100, attendanceRate));
  const nextTraining = allUpcomingTraining[0] ?? null;
  const nextGame = allUpcomingGames[0] ?? null;
  const latestResult = allGameResults[0] ?? null;

  // ── "Formă" derived stats — all computed from data already on the page. ──
  const countedAttendance = useMemo(
    () => attendanceRecords.filter((record) => isCountedAttendanceStatus(record.status)),
    [attendanceRecords]
  );
  const attendanceStreak = useMemo(() => getAttendanceStreak(attendanceRecords), [attendanceRecords]);
  const attendanceTrend = useMemo(() => getAttendanceTrend(countedAttendance), [countedAttendance]);
  const attendanceStrip = useMemo(() => countedAttendance.slice(0, 10), [countedAttendance]);

  // Formă is a season summary, so it reads the UNFILTERED event set. Deriving
  // it from `filteredEvents` meant typing in the global search rewrote the
  // player's win/loss record and monthly volume, while the attendance half of
  // the same card (sourced from attendanceRecords) stayed put — one card
  // showing two different realities.
  const matchOutcomes = useMemo(
    () => events
      .filter(isFinishedGame)
      .sort((a, b) => getEventTimestamp(b) - getEventTimestamp(a))
      .map((event) => getMatchOutcome(event, playerTeamNames))
      .filter((outcome): outcome is MatchOutcome => outcome !== null),
    [events, playerTeamNames]
  );
  const winCount = useMemo(() => matchOutcomes.filter((o) => o === 'win').length, [matchOutcomes]);
  const lossCount = useMemo(() => matchOutcomes.filter((o) => o === 'loss').length, [matchOutcomes]);
  const drawCount = useMemo(() => matchOutcomes.filter((o) => o === 'draw').length, [matchOutcomes]);
  const recentOutcomes = useMemo(() => matchOutcomes.slice(0, 8), [matchOutcomes]);

  const sessionMonthCounts = useMemo(() => {
    const now = new Date();
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    let current = 0;
    let previous = 0;
    events.forEach((event) => {
      if (isCancelled(event) || (event.type !== 'training' && event.type !== 'match')) {
        return;
      }
      const monthKey = getMonthKey(event.startTime);
      if (monthKey === currentKey) current += 1;
      else if (monthKey === prevKey) previous += 1;
    });
    return { current, previous };
  }, [events]);

  const goToSchedule = () => router.push('/schedule' as any);

  /**
   * One consistent affordance per section. Showing "Vezi toate (5)" on a
   * truncated section but "Program" on an untruncated one made three adjacent
   * sections look like they did three different things.
   */
  const seeAllLabel = (total: number) => (total > SECTION_LIMIT ? `Vezi toate (${total})` : 'Vezi în program');

  return (
    <ScrollView
      className="flex-1 bg-[var(--c-bg)]"
      contentContainerClassName="pb-24"
      showsVerticalScrollIndicator={false}
    >
      <PageContainer>
        <PageHeader
          title={getFirstName(session)}
          subtitle={session?.clubName ?? 'Spațiul tău de jucător'}
          actions={
            <Pressable
              onPress={() => loadData(true)}
              accessibilityRole="button"
              accessibilityLabel="Reîmprospătează"
              className="w-9 h-9 rounded-[10px] border items-center justify-center"
              style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}
            >
              {refreshing ? <ActivityIndicator size="small" color="var(--c-brand-fg)" /> : <MaterialIcons name="refresh" size={17} color="var(--c-ink-soft)" />}
            </Pressable>
          }
        />

        {/* Real grid, not flex-wrap: with `basis-[220px] grow` a 4-card row broke
            into a ragged 3+1 / 4+2 at intermediate widths. Fixed column counts
            keep every row full. */}
        <View className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
          <AttendanceCard
            playerAttendance={playerAttendance}
            attendanceRate={attendanceRate}
            attendancePercent={attendancePercent}
          />
          <NextEventCard
            event={nextTraining}
            accent={palette.royal}
            icon="fitness-center"
            label="Următorul antrenament"
            onPress={nextTraining ? () => setSelectedEvent(nextTraining) : undefined}
          />
          <NextEventCard
            event={nextGame}
            accent={palette.orange}
            icon="sports-basketball"
            label="Următorul meci"
            onPress={nextGame ? () => setSelectedEvent(nextGame) : undefined}
          />
          <NextEventCard
            event={latestResult}
            accent={palette.green}
            icon="emoji-events"
            label="Ultimul rezultat"
            onPress={latestResult ? () => setSelectedEvent(latestResult) : undefined}
          />
        </View>

        {loading ? (
          <View className="gap-4" accessibilityRole="progressbar" accessibilityLabel="Se încarcă panoul">
            <Skeleton className="h-[150px] w-full rounded-[16px]" />
            {Array.from({ length: 2 }).map((_, sectionIndex) => (
              <View key={sectionIndex}>
                <View className="mb-4">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-5 w-52 mt-2" />
                </View>
                <View className="gap-2.5">
                  {Array.from({ length: 3 }).map((_, cardIndex) => (
                    <Skeleton key={cardIndex} className="h-[84px] w-full rounded-[14px]" />
                  ))}
                </View>
              </View>
            ))}
          </View>
        ) : error ? (
          <ErrorState
            title="Nu am putut încărca panoul"
            message={error}
            actionLabel="Reîncearcă"
            onAction={() => loadData(true)}
          />
        ) : (
          <View className="gap-6">
            {attendanceWarning ? (
              <View className="rounded-[14px] border px-4 py-3 flex-row items-center gap-3" style={{ backgroundColor: 'var(--c-warning-bg)', borderColor: 'var(--c-warning-border)' } as any}>
                <MaterialIcons name="info-outline" size={18} color="var(--c-warning)" />
                <Text className="text-[12px] font-semibold flex-1" style={{ color: 'var(--c-warning-fg)' }}>{attendanceWarning}</Text>
              </View>
            ) : null}

            <PlayerFormStats
              streak={attendanceStreak}
              strip={attendanceStrip}
              trendDelta={attendanceTrend}
              wins={winCount}
              losses={lossCount}
              draws={drawCount}
              recentOutcomes={recentOutcomes}
              monthCount={sessionMonthCounts.current}
              lastMonthCount={sessionMonthCounts.previous}
              isMobile={isMobile}
            />

            <View>
              <SectionHeader
                eyebrow="Pe teren"
                title="Antrenamente viitoare"
                subtitle="Următoarele sesiuni programate ale echipei."
                actionLabel={seeAllLabel(allUpcomingTraining.length)}
                onAction={goToSchedule}
                isMobile={isMobile}
              />

              {upcomingTraining.length ? (
                <View className="gap-2.5">
                  {upcomingTraining.map((event) => (
                    <EventRow
                      key={event.id}
                      event={event}
                      accent={palette.royal}
                      label={getEventCategory(event)}
                      isMobile={isMobile}
                      onDetails={() => setSelectedEvent(event)}
                    />
                  ))}
                </View>
              ) : (
                <EmptyState icon="event-busy" compact title="Niciun antrenament viitor" message="Antrenamentele programate de club apar aici." />
              )}
            </View>

            <View>
              <SectionHeader
                eyebrow="Zi de meci"
                title="Meciuri viitoare"
                subtitle="Următoarele meciuri ale echipei tale."
                actionLabel={seeAllLabel(allUpcomingGames.length)}
                onAction={goToSchedule}
                isMobile={isMobile}
              />

              {upcomingGames.length ? (
                <View className="gap-2.5">
                  {upcomingGames.map((event) => (
                    <EventRow
                      key={event.id}
                      event={event}
                      accent={palette.orange}
                      label={getEventCategory(event)}
                      isMobile={isMobile}
                      onDetails={() => setSelectedEvent(event)}
                    />
                  ))}
                </View>
              ) : (
                <EmptyState icon="sports-basketball" compact title="Niciun meci viitor" message="Meciurile programate ale echipei tale apar aici." />
              )}
            </View>

            <View>
              <SectionHeader
                eyebrow="Tabelă"
                title="Rezultate meciuri"
                subtitle="Ultimele meciuri încheiate ale echipei tale."
                actionLabel={seeAllLabel(allGameResults.length)}
                onAction={goToSchedule}
                isMobile={isMobile}
              />

              {gameResults.length ? (
                <View className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  {gameResults.map((event) => (
                    <ResultCard key={event.id} event={event} outcome={getMatchOutcome(event, playerTeamNames)} />
                  ))}
                </View>
              ) : (
                <EmptyState icon="scoreboard" compact title="Niciun rezultat disponibil încă" message="Rezultatele meciurilor jucate apar aici." />
              )}
            </View>
          </View>
        )}
      </PageContainer>

      <PlayerEventDetailModal event={selectedEvent} isMobile={isMobile} onClose={() => setSelectedEvent(null)} />
    </ScrollView>
  );
}

export default function HomeScreen() {
  const { session } = useSession();

  // Coaches have their own panel at /coach/dashboard. This route used to render
  // it inline; the redirect keeps old links and bookmarks working.
  if (normalizeRole(session?.role) === 'coach') {
    return <Navigate to="/coach/dashboard" replace />;
  }

  return <PlayerHomeScreen />;
}
