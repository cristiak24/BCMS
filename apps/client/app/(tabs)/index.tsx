import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { LinearGradient } from '@/src/web/linearGradient';
import { useRouter } from '@/src/web/expoRouter';
import { eventsApi, CalendarEvent } from '../../services/eventsApi';
import { basketballApi, Match } from '../../services/basketballApi';
import { teamsApi, Player, Team } from '../../services/teamsApi';
import { AuthUser, normalizeRole } from '../../utils/authSession';
import { loadPlayerAttendanceSummary, PlayerAttendanceSummary } from '../../utils/playerAttendance';
import { useFirebaseAuth } from '../../context/AuthContext';
import { useResponsive } from '../../hooks/useResponsive';
import CoachHome from '../../components/coach/CoachHome';

type HubEvent = CalendarEvent & {
  source?: 'internal' | 'frb';
  frbMatch?: Match;
  teamFilterKey?: string;
  teamDisplayName?: string;
  categoryName?: string;
  seasonName?: string;
  venueName?: string | null;
};

type FilterOption = {
  key: string;
  label: string;
};

type GameFilters = {
  team: string;
  category: string;
  month: string;
  season: string;
};

const ALL_FILTER_KEY = 'all';
const palette = {
  navy: '#07152F',
  royal: '#123A97',
  blue: '#2563EB',
  sky: '#0EA5E9',
  orange: '#F97316',
  amber: '#FDBA2D',
  green: '#087A2F',
  slate: '#64748B',
  muted: '#8EA1B8',
  line: '#DDE8F5',
  soft: '#F4F8FD',
  page: '#EDF4FB',
  card: '#FFFFFF',
};

function getSessionTeamIds(user: AuthUser | null) {
  return new Set(
    (user?.teamIds ?? [])
      .map((teamId) => Number(teamId))
      .filter((teamId) => Number.isFinite(teamId))
  );
}

function belongsToSessionTeam(event: CalendarEvent, teamIds: Set<number>) {
  if (teamIds.size === 0) {
    return true;
  }

  return event.teamId != null && teamIds.has(Number(event.teamId));
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

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function getDateBlock(value: string) {
  const date = getEventTime(value);
  if (!date) {
    return { month: 'DATE', day: '--' };
  }

  return {
    month: new Intl.DateTimeFormat('en', { month: 'short' }).format(date).toUpperCase(),
    day: String(date.getDate()),
  };
}

function formatTimeRange(start: string, end: string) {
  const startDate = getEventTime(start);
  const endDate = getEventTime(end);

  if (!startDate) {
    return start;
  }

  const formatter = new Intl.DateTimeFormat('en', {
    hour: 'numeric',
    minute: '2-digit',
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

function getPlayerTeamNamesFromRoster(roster: Player[], session: AuthUser | null) {
  const sessionEmail = normalizeTeamName(session?.email);
  const sessionId = Number(session?.id);
  const player = roster.find((item) => {
    const sameEmail = sessionEmail && normalizeTeamName(item.email) === sessionEmail;
    const sameId = Number.isFinite(sessionId) && Number(item.id) === sessionId;
    return sameEmail || sameId;
  });

  if (!player) {
    return new Set<string>();
  }

  return new Set(
    [player.teamName, ...(player.teamNames ?? [])]
      .map(normalizeTeamName)
      .filter(Boolean)
  );
}

function isScopedTeam(team: Team, teamIds: Set<number>, teamNames: Set<string>) {
  if (teamIds.size === 0 && teamNames.size === 0) {
    return true;
  }

  return teamIds.has(Number(team.id)) || teamNames.has(normalizeTeamName(team.name));
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
    teamFilterKey: String(team.id),
    teamDisplayName: team.name,
    categoryName: team.leagueName || match.league || 'FRB',
    seasonName: team.seasonName || '',
    venueName: match.league || null,
  };
}

function getEventTeamKey(event: HubEvent) {
  if (event.teamFilterKey) {
    return event.teamFilterKey;
  }

  if (event.teamId != null) {
    return String(event.teamId);
  }

  return normalizeTeamName(event.teamName || event.teamDisplayName || 'team');
}

function getEventTeamLabel(event: HubEvent) {
  return event.teamDisplayName || event.teamName || 'Team event';
}

function getEventCategory(event: HubEvent) {
  if (event.categoryName) {
    return event.categoryName;
  }

  if (event.type === 'match') {
    return 'Internal match';
  }

  if (event.type === 'camp') {
    return 'Camp';
  }

  return 'Training';
}

function getEventSeason(event: HubEvent) {
  if (event.seasonName) {
    return event.seasonName;
  }

  const date = getEventTime(event.startTime);
  return date ? `${date.getFullYear()}` : 'Season';
}

function getMonthKey(value: string) {
  const date = getEventTime(value);
  if (!date) {
    return 'unknown';
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthLabel(value: string) {
  const date = getEventTime(value);
  if (!date) {
    return 'Unknown month';
  }

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function buildFilterOptions<T>(
  items: T[],
  getKey: (item: T) => string,
  getLabel: (item: T) => string
): FilterOption[] {
  const map = new Map<string, string>();
  items.forEach((item) => {
    const key = getKey(item);
    const label = getLabel(item);
    if (key && label && !map.has(key)) {
      map.set(key, label);
    }
  });

  return Array.from(map, ([key, label]) => ({ key, label }));
}

function getEventIdentity(event: CalendarEvent) {
  const eventDate = getEventTime(event.startTime);
  const dateKey = eventDate
    ? `${eventDate.getFullYear()}-${eventDate.getMonth() + 1}-${eventDate.getDate()}`
    : event.startTime;
  return `${event.type}:${dateKey}:${event.title.trim().toLowerCase()}`;
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
    return 'Scheduled';
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

function getInitial(session: AuthUser | null) {
  return session?.name?.trim()?.[0]?.toUpperCase() ?? 'P';
}

function splitMatchTitle(title: string) {
  const parts = title.split(/\s+vs\s+/i);
  return parts.length === 2 ? { home: parts[0], away: parts[1] } : { home: title, away: '' };
}

function getAttendanceTone(rate: number | null) {
  if (rate == null) {
    return { label: 'Pending', color: '#475569', bg: '#F1F5F9' };
  }

  if (rate >= 90) {
    return { label: 'Elite rhythm', color: palette.green, bg: '#DCFCE7' };
  }

  if (rate >= 80) {
    return { label: 'On track', color: '#0369A1', bg: '#E0F2FE' };
  }

  return { label: 'Needs focus', color: '#B45309', bg: '#FEF3C7' };
}

function PremiumCard({ children, className = '', style }: { children: ReactNode; className?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View className={`bg-white border border-[#DDE8F5] ${className}`} style={[styles.cardShadow, style]}>
      {children}
    </View>
  );
}

function IconBadge({
  icon,
  color,
  bg,
  size = 42,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  color: string;
  bg: string;
  size?: number;
}) {
  return (
    <View
      className="items-center justify-center"
      style={{ width: size, height: size, borderRadius: Math.max(14, size / 3), backgroundColor: bg }}
    >
      <MaterialIcons name={icon} size={Math.round(size * 0.48)} color={color} />
    </View>
  );
}

function MetaRow({ icon, text }: { icon: keyof typeof MaterialIcons.glyphMap; text: string }) {
  return (
    <View className="flex-row items-center min-w-0">
      <MaterialIcons name={icon} size={16} color={palette.slate} />
      <Text className="text-[#64748B] text-[13px] font-bold ml-1.5 flex-1" numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

function PlayerHubHeader({
  query,
  onQueryChange,
  refreshing,
  onRefresh,
  onAccount,
  session,
  isMobile,
  isSmallPhone,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  refreshing: boolean;
  onRefresh: () => void;
  onAccount: () => void;
  session: AuthUser | null;
  isMobile: boolean;
  isSmallPhone: boolean;
}) {
  return (
    <LinearGradient
      colors={['#06132C', '#123A97', '#0EA5E9']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.hero, isMobile ? styles.heroMobile : null]}
    >
      <View className="absolute right-[-44px] top-[-70px] w-[210px] h-[210px] rounded-full border border-white/15" />
      <View className="absolute right-[42px] bottom-[-84px] w-[170px] h-[170px] rounded-full border border-white/10" />
      <View className="absolute left-[-26px] bottom-[-52px] w-[120px] h-[120px] rounded-full border border-[#FDBA2D]/30" />

      <View className={`${isMobile ? 'gap-5' : 'flex-row items-start justify-between gap-6'}`}>
        <View className="flex-1 min-w-0">
          <View className="self-start flex-row items-center rounded-full bg-white/12 border border-white/15 px-3 py-2 mb-4">
            <MaterialIcons name="sports-basketball" size={16} color={palette.amber} />
            <Text className="text-white/90 text-[10px] font-black uppercase tracking-widest ml-2">
              Player workspace
            </Text>
          </View>
          <Text
            className={`text-white font-black leading-tight ${isSmallPhone ? 'text-[34px]' : isMobile ? 'text-[40px]' : 'text-[54px]'}`}
          >
            Player Hub
          </Text>
          <Text className="text-[#CFE2FF] text-[15px] md:text-[17px] font-semibold mt-3 max-w-[680px] leading-6">
            Training rhythm, next fixtures, attendance, and recent results in one sharp game-day view.
          </Text>
        </View>

        <View className={`${isMobile ? 'w-full gap-3' : 'w-[460px] gap-3'}`}>
          <View className={`${isSmallPhone ? 'flex-col' : 'flex-row'} gap-3`}>
            <View className="flex-1 h-[54px] rounded-[20px] bg-white flex-row items-center px-4 border border-white/70">
              <MaterialIcons name="search" size={20} color={palette.slate} />
              <TextInput
                value={query}
                onChangeText={onQueryChange}
                placeholder="Search sessions, teams, venues..."
                placeholderTextColor="#8EA1B8"
                className="flex-1 ml-3 text-[#07152F] text-[15px] font-semibold outline-none"
              />
            </View>
            <View className={`${isSmallPhone ? 'flex-row' : 'flex-row'} gap-3`}>
              <Pressable
                onPress={onRefresh}
                className="h-[54px] rounded-[20px] bg-white/95 items-center justify-center border border-white/70 active:scale-95"
                style={{ flex: isSmallPhone ? 1 : undefined, width: isSmallPhone ? undefined : 54 }}
                accessibilityRole="button"
              >
                {refreshing ? <ActivityIndicator size="small" color={palette.royal} /> : <MaterialIcons name="refresh" size={23} color={palette.royal} />}
              </Pressable>
              <Pressable
                onPress={onAccount}
                className="h-[54px] rounded-[20px] bg-[#FDBA2D] items-center justify-center active:scale-95"
                style={{ flex: isSmallPhone ? 1 : undefined, width: isSmallPhone ? undefined : 54 }}
                accessibilityRole="button"
              >
                <Text className="text-[#07152F] font-black text-lg">{getInitial(session)}</Text>
              </Pressable>
            </View>
          </View>

          <View className="flex-row flex-wrap gap-2">
            <View className="rounded-full bg-white/12 border border-white/15 px-3 py-2">
              <Text className="text-white text-[10px] font-black uppercase tracking-widest" numberOfLines={1}>
                {session?.clubName ?? 'Club workspace'}
              </Text>
            </View>
            <View className="rounded-full bg-[#FDBA2D]/20 border border-[#FDBA2D]/30 px-3 py-2">
              <Text className="text-[#FFE8A3] text-[10px] font-black uppercase tracking-widest">
                Game ready
              </Text>
            </View>
          </View>
        </View>
      </View>
    </LinearGradient>
  );
}

function AttendanceCard({
  playerAttendance,
  attendanceRate,
  attendancePercent,
  isMobile,
}: {
  playerAttendance: PlayerAttendanceSummary | null;
  attendanceRate: number | null;
  attendancePercent: number;
  isMobile: boolean;
}) {
  const tone = getAttendanceTone(attendanceRate);

  return (
    <PremiumCard className="rounded-[28px] p-6 md:p-7 justify-between overflow-hidden" style={{ minHeight: isMobile ? 260 : 330 }}>
      <View className="absolute right-[-36px] top-[-42px] w-[150px] h-[150px] rounded-full bg-[#EAF2FF]" />
      <View className="flex-row items-start justify-between gap-4">
        <IconBadge icon="insert-chart-outlined" color={palette.royal} bg="#EAF2FF" size={58} />
        <View className="rounded-full px-3.5 py-2" style={{ backgroundColor: tone.bg }}>
          <Text className="text-[10px] font-black uppercase tracking-widest" style={{ color: tone.color }}>
            {tone.label}
          </Text>
        </View>
      </View>

      <View className="mt-8">
        <Text className="text-[#07152F] text-[13px] font-black uppercase tracking-widest">Attendance rate</Text>
        <View className="flex-row items-end mt-2">
          <Text className="text-[#123A97] text-[56px] md:text-[68px] font-black tracking-tight leading-none">
            {attendanceRate == null ? '--' : `${attendanceRate}`}
          </Text>
          <Text className="text-[#123A97] text-[25px] md:text-[30px] font-black mb-1">%</Text>
        </View>
        <Text className="text-[#64748B] text-[14px] font-semibold mt-3 leading-5">
          {playerAttendance?.total
            ? `${playerAttendance.present}/${playerAttendance.total} recent sessions marked present`
            : 'No marked attendance yet'}
        </Text>
      </View>

      <View className="mt-7">
        <View className="h-3.5 rounded-full bg-[#E8EEF7] overflow-hidden">
          <LinearGradient
            colors={[palette.sky, palette.royal]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ width: `${attendancePercent}%`, height: '100%', borderRadius: 999 }}
          />
        </View>
        <View className="flex-row justify-between mt-3">
          <Text className="text-[#8EA1B8] text-[11px] font-black uppercase tracking-widest">Recent form</Text>
          <Text className="text-[#F97316] text-[11px] font-black uppercase tracking-widest">Target 90%</Text>
        </View>
      </View>
    </PremiumCard>
  );
}

function NextEventCard({
  event,
  label,
  accent,
  icon,
  compact,
}: {
  event: HubEvent | null;
  label: string;
  accent: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  compact: boolean;
}) {
  const score = event ? getScoreFromText(event) : null;

  return (
    <PremiumCard className="rounded-[26px] p-5 overflow-hidden" style={{ flexBasis: compact ? '100%' : 230, flexGrow: 1, minHeight: 220 }}>
      <View className="absolute left-0 top-0 bottom-0 w-1.5" style={{ backgroundColor: accent }} />
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-[#64748B] text-[10px] font-black uppercase tracking-widest">{label}</Text>
        <IconBadge icon={icon} color={accent} bg="#F4F8FD" size={38} />
      </View>
      {event ? (
        <>
          <Text className="text-[#07152F] text-[18px] font-black mt-5 leading-6" numberOfLines={2}>
            {event.title}
          </Text>
          <View className="mt-4 gap-2.5">
            {score ? (
              <View className="self-start rounded-2xl bg-[#EEF5FF] px-4 py-2 border border-[#D7E5FF]">
                <Text className="text-[#123A97] text-lg font-black">{score.label}</Text>
              </View>
            ) : null}
            <MetaRow icon="calendar-today" text={formatDate(event.startTime)} />
            <MetaRow icon="schedule" text={formatTimeRange(event.startTime, event.endTime)} />
            <MetaRow icon="place" text={event.venueName || event.location || event.teamName || 'Club court'} />
          </View>
        </>
      ) : (
        <View className="flex-1 justify-center mt-5">
          <Text className="text-[#64748B] text-sm font-bold">No scheduled item found.</Text>
        </View>
      )}
    </PremiumCard>
  );
}

function NextUpSection({
  nextTraining,
  nextGame,
  latestResult,
  isMobile,
}: {
  nextTraining: HubEvent | null;
  nextGame: HubEvent | null;
  latestResult: HubEvent | null;
  isMobile: boolean;
}) {
  return (
    <PremiumCard className="rounded-[32px] p-6 md:p-7 flex-1">
      <View className={`${isMobile ? 'gap-2' : 'flex-row items-end justify-between gap-6'}`}>
        <View>
          <Text className="text-[#F97316] text-[11px] font-black uppercase tracking-widest">Live overview</Text>
          <Text className="text-[#07152F] text-[30px] md:text-[38px] font-black mt-2 leading-tight">Next up</Text>
        </View>
        <Text className="text-[#64748B] text-[13px] font-semibold max-w-[300px] leading-5">
          Your closest court moments, prioritized for quick scanning.
        </Text>
      </View>
      <View className="flex-row flex-wrap gap-4 mt-7">
        <NextEventCard event={nextTraining} accent={palette.royal} icon="fitness-center" label="Next training" compact={isMobile} />
        <NextEventCard event={nextGame} accent={palette.orange} icon="sports-basketball" label="Next game" compact={isMobile} />
        <NextEventCard event={latestResult} accent={palette.green} icon="emoji-events" label="Latest result" compact={isMobile} />
      </View>
    </PremiumCard>
  );
}

function SectionHeader({
  eyebrow,
  title,
  subtitle,
  actionLabel,
  onAction,
  trailing,
  isMobile,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  trailing?: ReactNode;
  isMobile: boolean;
}) {
  return (
    <View className={`${isMobile ? 'gap-4' : 'flex-row items-end justify-between gap-5'} mb-5`}>
      <View className="flex-1 min-w-0">
        {eyebrow ? <Text className="text-[#F97316] text-[10px] font-black uppercase tracking-widest mb-2">{eyebrow}</Text> : null}
        <Text className="text-[#07152F] text-[26px] md:text-[32px] font-black leading-tight">{title}</Text>
        {subtitle ? <Text className="text-[#64748B] text-[14px] font-semibold mt-2 leading-5">{subtitle}</Text> : null}
      </View>
      {trailing ?? (actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          className="self-start rounded-full bg-[#EAF2FF] border border-[#D7E5FF] px-4 py-3 flex-row items-center active:scale-95"
          accessibilityRole="button"
        >
          <Text className="text-[#123A97] text-[12px] font-black uppercase tracking-widest">{actionLabel}</Text>
          <MaterialIcons name="arrow-forward" size={17} color={palette.royal} style={{ marginLeft: 6 }} />
        </Pressable>
      ) : null)}
    </View>
  );
}

function EventCard({
  event,
  accent,
  label,
  variant,
  isMobile,
}: {
  event: HubEvent;
  accent: string;
  label: string;
  variant: 'training' | 'game';
  isMobile: boolean;
}) {
  const dateBlock = getDateBlock(event.startTime);
  const isMatch = event.type === 'match';

  return (
    <Pressable accessibilityRole="button" className="active:scale-[0.99]">
      <PremiumCard className={`rounded-[26px] overflow-hidden ${isMobile ? 'p-4' : 'p-5'}`}>
        <View className={`${isMobile ? 'gap-4' : 'flex-row items-center gap-5'}`}>
          <View className={`${isMobile ? 'flex-row items-center gap-3' : 'items-center'}`}>
            <View className="w-[66px] h-[74px] rounded-[22px] bg-[#F4F8FD] border border-[#DDE8F5] items-center justify-center">
              <Text className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: accent }}>
                {dateBlock.month}
              </Text>
              <Text className="text-[#07152F] text-[24px] font-black leading-none">{dateBlock.day}</Text>
            </View>
            {isMobile ? (
              <View className="rounded-full px-3 py-1.5" style={{ backgroundColor: variant === 'game' ? '#FFF7ED' : '#EAF2FF' }}>
                <Text className="text-[10px] font-black uppercase tracking-widest" style={{ color: accent }}>
                  {label}
                </Text>
              </View>
            ) : null}
          </View>

          <View className="flex-1 min-w-0">
            <View className="flex-row flex-wrap gap-2 mb-2">
              {!isMobile ? (
                <View className="rounded-full px-3 py-1.5" style={{ backgroundColor: variant === 'game' ? '#FFF7ED' : '#EAF2FF' }}>
                  <Text className="text-[10px] font-black uppercase tracking-widest" style={{ color: accent }}>
                    {label}
                  </Text>
                </View>
              ) : null}
              <View className="rounded-full bg-[#F8FAFC] border border-[#E8EEF7] px-3 py-1.5">
                <Text className="text-[#64748B] text-[10px] font-black uppercase tracking-widest">
                  {event.source === 'frb' ? 'FRB' : 'Club'}
                </Text>
              </View>
            </View>
            <Text className="text-[#07152F] text-[18px] md:text-[20px] font-black leading-6" numberOfLines={isMobile ? 3 : 2}>
              {event.title}
            </Text>
            <View className={`${isMobile ? 'gap-2.5' : 'flex-row flex-wrap gap-x-5 gap-y-2'} mt-3`}>
              <MetaRow icon="calendar-today" text={formatDate(event.startTime)} />
              <MetaRow icon="schedule" text={formatTimeRange(event.startTime, event.endTime)} />
              <MetaRow icon="place" text={event.venueName || event.location || event.teamName || 'Club court'} />
            </View>
          </View>

          <View className={`${isMobile ? 'w-full' : 'items-end min-w-[150px]'}`}>
            {!isMobile ? (
              <>
                <Text className="text-[#8EA1B8] text-[9px] font-black uppercase tracking-widest">Category</Text>
                <Text className="text-[13px] font-black mt-1 uppercase text-right" style={{ color: accent }} numberOfLines={1}>
                  {label}
                </Text>
              </>
            ) : null}
            <Pressable
              onPress={() => isMatch ? null : undefined}
              className={`${isMobile ? 'w-full mt-1' : 'mt-4'} h-12 rounded-[18px] bg-[#07152F] px-5 items-center justify-center flex-row active:scale-95`}
            >
              <Text className="text-white text-[12px] font-black uppercase tracking-widest">{isMatch ? 'Fișă Meci' : 'Details'}</Text>
              <MaterialIcons name="chevron-right" size={18} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      </PremiumCard>
    </Pressable>
  );
}

function ResultCard({ event, isMobile }: { event: HubEvent; isMobile: boolean }) {
  const score = getScoreFromText(event);
  const dateBlock = getDateBlock(event.startTime);
  const teams = splitMatchTitle(event.title);

  return (
    <PremiumCard
      className="rounded-[26px] p-5 overflow-hidden"
      style={{ flexBasis: isMobile ? '100%' : 250, flexGrow: isMobile ? 0 : 1, minHeight: 210 }}
    >
      <View className="absolute right-[-28px] top-[-30px] w-[96px] h-[96px] rounded-full bg-[#FFF7ED]" />
      <View className="flex-row items-center justify-between">
        <View className="rounded-full bg-[#F4F8FD] border border-[#E8EEF7] px-3 py-1.5">
          <Text className="text-[#64748B] text-[10px] font-black uppercase tracking-widest">
            {dateBlock.month} {dateBlock.day}
          </Text>
        </View>
        <IconBadge icon="emoji-events" color={palette.green} bg="#DCFCE7" size={36} />
      </View>
      <Text className="text-[#64748B] text-[10px] font-black uppercase tracking-widest mt-5" numberOfLines={1}>
        {event.teamName || event.location || 'Match'}
      </Text>
      <View className="mt-3 gap-2">
        <Text className="text-[#07152F] text-[15px] font-black leading-5" numberOfLines={1}>
          {teams.home}
        </Text>
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-[#8EA1B8] text-[10px] font-black uppercase tracking-widest">Final</Text>
          <Text className="text-[#123A97] text-[30px] font-black tracking-tight leading-none">
            {score?.label ?? getStatusCopy(event)}
          </Text>
        </View>
        {teams.away ? (
          <Text className="text-[#07152F] text-[15px] font-black leading-5" numberOfLines={1}>
            {teams.away}
          </Text>
        ) : null}
      </View>
    </PremiumCard>
  );
}

function EmptySection({ message }: { message: string }) {
  return (
    <View className="bg-white rounded-[28px] border border-dashed border-[#BFD0EA] px-6 py-9 items-center justify-center min-h-[160px]">
      <View className="w-14 h-14 rounded-[20px] bg-[#F4F8FD] items-center justify-center border border-[#E8EEF7]">
        <MaterialIcons name="event-busy" size={28} color="#8EA1B8" />
      </View>
      <Text className="text-[#64748B] font-bold text-center mt-4 leading-5">{message}</Text>
    </View>
  );
}

function DropdownFilter({
  label,
  value,
  options,
  onChange,
  isMobile,
}: {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  isMobile: boolean;
}) {
  const [open, setOpen] = useState(false);
  const allOptions = [{ key: ALL_FILTER_KEY, label: 'All' }, ...options];
  const selectedLabel = allOptions.find((option) => option.key === value)?.label ?? 'All';

  return (
    <View className="relative flex-1" style={{ zIndex: open ? 40 : 1, minWidth: isMobile ? '100%' : 180 }}>
      <Text className="text-[#64748B] text-[10px] font-black uppercase tracking-widest mb-2">{label}</Text>
      <Pressable
        onPress={() => setOpen((current) => !current)}
        className={`h-[54px] rounded-[18px] border px-4 flex-row items-center justify-between active:scale-[0.99] ${open ? 'bg-[#07152F] border-[#07152F]' : 'bg-[#F8FBFF] border-[#DDE8F5]'}`}
      >
        <Text className={`${open ? 'text-white' : 'text-[#0E2041]'} flex-1 text-[13px] font-black`} numberOfLines={1}>
          {selectedLabel}
        </Text>
        <MaterialIcons name={open ? 'expand-less' : 'expand-more'} size={20} color={open ? '#FFFFFF' : palette.orange} />
      </Pressable>

      {open ? (
        <View
          className="absolute left-0 right-0 top-[78px] rounded-[20px] bg-white border border-[#DDE8F5] overflow-hidden"
          style={[styles.cardShadow, { elevation: 20 }]}
        >
          <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator>
            {allOptions.map((option) => {
              const active = value === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => {
                    onChange(option.key);
                    setOpen(false);
                  }}
                  className={`min-h-[50px] px-4 flex-row items-center justify-between border-b border-[#EEF3FA] ${active ? 'bg-[#EEF5FF]' : 'bg-white'}`}
                >
                  <Text className={`${active ? 'text-[#0A2C93]' : 'text-[#334155]'} flex-1 text-[13px] font-black`} numberOfLines={1}>
                    {option.label}
                  </Text>
                  {active ? <MaterialIcons name="check-circle" size={18} color={palette.royal} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function FilterBar({
  gameFilters,
  teamFilterOptions,
  categoryFilterOptions,
  monthFilterOptions,
  seasonFilterOptions,
  onChange,
  onReset,
  isMobile,
}: {
  gameFilters: GameFilters;
  teamFilterOptions: FilterOption[];
  categoryFilterOptions: FilterOption[];
  monthFilterOptions: FilterOption[];
  seasonFilterOptions: FilterOption[];
  onChange: (filters: GameFilters) => void;
  onReset: () => void;
  isMobile: boolean;
}) {
  return (
    <PremiumCard className="rounded-[28px] p-4 md:p-5 mb-5" style={{ zIndex: 30 }}>
      <View className={`${isMobile ? 'gap-4' : 'flex-row items-center justify-between gap-4'} mb-5`}>
        <View className="flex-1 min-w-0">
          <Text className="text-[#07152F] text-[18px] font-black">Match filters</Text>
          <Text className="text-[#64748B] text-[13px] font-semibold mt-1 leading-5">
            Filter by team, category, month, or season without leaving the hub.
          </Text>
        </View>
        <Pressable
          onPress={onReset}
          className="self-start h-11 rounded-full bg-[#FFF7ED] border border-[#FED7AA] px-4 items-center justify-center flex-row active:scale-95"
          accessibilityRole="button"
        >
          <MaterialIcons name="restart-alt" size={17} color={palette.orange} />
          <Text className="text-[#C2410C] text-[11px] font-black uppercase tracking-widest ml-1.5">Reset</Text>
        </Pressable>
      </View>

      <View className={`${isMobile ? 'flex-col' : 'flex-row flex-wrap'} gap-3`}>
        <DropdownFilter
          label="Team"
          value={gameFilters.team}
          options={teamFilterOptions}
          isMobile={isMobile}
          onChange={(team) => onChange({ ...gameFilters, team })}
        />
        <DropdownFilter
          label="Category"
          value={gameFilters.category}
          options={categoryFilterOptions}
          isMobile={isMobile}
          onChange={(category) => onChange({ ...gameFilters, category })}
        />
        <DropdownFilter
          label="Month"
          value={gameFilters.month}
          options={monthFilterOptions}
          isMobile={isMobile}
          onChange={(month) => onChange({ ...gameFilters, month })}
        />
        <DropdownFilter
          label="Season"
          value={gameFilters.season}
          options={seasonFilterOptions}
          isMobile={isMobile}
          onChange={(season) => onChange({ ...gameFilters, season })}
        />
      </View>
    </PremiumCard>
  );
}

function PlayerHomeScreen() {
  const router = useRouter();
  const { session } = useFirebaseAuth();
  const { isMobile, isTablet, isDesktop, isSmallPhone } = useResponsive();
  const [playerAttendance, setPlayerAttendance] = useState<PlayerAttendanceSummary | null>(null);
  const [events, setEvents] = useState<HubEvent[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attendanceWarning, setAttendanceWarning] = useState<string | null>(null);
  const [gameFilters, setGameFilters] = useState<GameFilters>({
    team: ALL_FILTER_KEY,
    category: ALL_FILTER_KEY,
    month: ALL_FILTER_KEY,
    season: ALL_FILTER_KEY,
  });

  const loadData = useCallback(async (showSpinner = false) => {
    if (showSpinner) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);
    setAttendanceWarning(null);

    try {
      const [allEvents, savedTeams, roster] = await Promise.all([
        eventsApi.getEvents(),
        teamsApi.getTeams().catch(() => [] as Team[]),
        teamsApi.getRoster().catch(() => [] as Player[]),
      ]);
      const teamIds = getSessionTeamIds(session);
      const rosterTeamNames = getPlayerTeamNamesFromRoster(roster, session);
      const sessionEvents = allEvents
        .filter((event) => belongsToSessionTeam(event, teamIds))
        .map((event) => ({ ...event, source: 'internal' as const }));

      const scopedTeams = savedTeams
        .filter(hasFrbIds)
        .filter((team) => isScopedTeam(team, teamIds, rosterTeamNames));

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
        setPlayerAttendance(await loadPlayerAttendanceSummary(session, sessionEvents));
      } catch (attendanceError) {
        setPlayerAttendance(null);
        setAttendanceWarning(attendanceError instanceof Error ? attendanceError.message : 'Could not load attendance.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your player hub.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredEvents = useMemo(
    () => {
      return events
        .filter((event) => sessionMatchesSearch(event, query));
    },
    [events, query]
  );

  const upcomingTraining = useMemo(
    () => filteredEvents
      .filter((event) => event.type === 'training' && isUpcoming(event))
      .sort((a, b) => getEventTimestamp(a) - getEventTimestamp(b))
      .slice(0, 3),
    [filteredEvents]
  );

  const allUpcomingGames = useMemo(
    () => filteredEvents
      .filter((event) => event.type === 'match' && isUpcoming(event))
      .sort((a, b) => getEventTimestamp(a) - getEventTimestamp(b)),
    [filteredEvents]
  );

  const teamFilterOptions = useMemo(
    () => buildFilterOptions(allUpcomingGames, getEventTeamKey, getEventTeamLabel),
    [allUpcomingGames]
  );

  const categoryFilterOptions = useMemo(
    () => buildFilterOptions(allUpcomingGames, getEventCategory, getEventCategory),
    [allUpcomingGames]
  );

  const monthFilterOptions = useMemo(
    () => buildFilterOptions(allUpcomingGames, (event) => getMonthKey(event.startTime), (event) => getMonthLabel(event.startTime)),
    [allUpcomingGames]
  );

  const seasonFilterOptions = useMemo(
    () => buildFilterOptions(allUpcomingGames, getEventSeason, getEventSeason),
    [allUpcomingGames]
  );

  const upcomingGames = useMemo(
    () => allUpcomingGames.filter((event) => {
      const matchesTeam = gameFilters.team === ALL_FILTER_KEY || getEventTeamKey(event) === gameFilters.team;
      const matchesCategory = gameFilters.category === ALL_FILTER_KEY || getEventCategory(event) === gameFilters.category;
      const matchesMonth = gameFilters.month === ALL_FILTER_KEY || getMonthKey(event.startTime) === gameFilters.month;
      const matchesSeason = gameFilters.season === ALL_FILTER_KEY || getEventSeason(event) === gameFilters.season;
      return matchesTeam && matchesCategory && matchesMonth && matchesSeason;
    }).slice(0, 12),
    [allUpcomingGames, gameFilters]
  );

  useEffect(() => {
    setGameFilters((current) => ({
      team: current.team === ALL_FILTER_KEY || teamFilterOptions.some((option) => option.key === current.team) ? current.team : ALL_FILTER_KEY,
      category: current.category === ALL_FILTER_KEY || categoryFilterOptions.some((option) => option.key === current.category) ? current.category : ALL_FILTER_KEY,
      month: current.month === ALL_FILTER_KEY || monthFilterOptions.some((option) => option.key === current.month) ? current.month : ALL_FILTER_KEY,
      season: current.season === ALL_FILTER_KEY || seasonFilterOptions.some((option) => option.key === current.season) ? current.season : ALL_FILTER_KEY,
    }));
  }, [categoryFilterOptions, monthFilterOptions, seasonFilterOptions, teamFilterOptions]);

  const gameResults = useMemo(
    () => filteredEvents
      .filter(isFinishedGame)
      .sort((a, b) => getEventTimestamp(b) - getEventTimestamp(a))
      .slice(0, 12),
    [filteredEvents]
  );

  const attendanceRate = playerAttendance?.rate ?? null;
  const attendancePercent = attendanceRate == null ? 0 : Math.max(0, Math.min(100, attendanceRate));
  const nextTraining = upcomingTraining[0] ?? null;
  const nextGame = upcomingGames[0] ?? null;
  const latestResult = gameResults[0] ?? null;
  const contentPaddingClass = isSmallPhone ? 'px-3 py-3' : isMobile ? 'px-4 py-4' : 'px-6 lg:px-10 py-6 lg:py-8';

  return (
    <ScrollView
      className="flex-1 bg-[#EDF4FB]"
      contentContainerClassName={`${contentPaddingClass} pb-24`}
      showsVerticalScrollIndicator={false}
    >
      <View className="w-full max-w-[1440px] self-center">
        <PlayerHubHeader
          query={query}
          onQueryChange={setQuery}
          refreshing={refreshing}
          onRefresh={() => loadData(true)}
          onAccount={() => router.replace('/account' as any)}
          session={session}
          isMobile={isMobile}
          isSmallPhone={isSmallPhone}
        />

        <View className={`${isDesktop ? 'flex-row' : 'flex-col'} gap-5 md:gap-6 mt-5 md:mt-6 mb-8 md:mb-10`}>
          <View style={{ width: isDesktop ? 370 : '100%' }}>
            <AttendanceCard
              playerAttendance={playerAttendance}
              attendanceRate={attendanceRate}
              attendancePercent={attendancePercent}
              isMobile={isMobile}
            />
          </View>
          <NextUpSection
            nextTraining={nextTraining}
            nextGame={nextGame}
            latestResult={latestResult}
            isMobile={isMobile || isTablet}
          />
        </View>

        {loading ? (
          <View className="py-16 items-center justify-center">
            <ActivityIndicator size="large" color={palette.royal} />
            <Text className="text-[#64748B] text-sm font-bold mt-3">Loading your player hub...</Text>
          </View>
        ) : error ? (
          <View className="bg-white rounded-[28px] p-8 items-center border border-red-100" style={styles.cardShadow}>
            <MaterialIcons name="error-outline" size={34} color="#EF4444" />
            <Text className="text-red-600 font-bold text-center mt-3">{error}</Text>
          </View>
        ) : (
          <View className="gap-10 md:gap-12">
            {attendanceWarning ? (
              <View className="bg-[#FFFBEB] rounded-[24px] border border-amber-200 px-5 py-4 flex-row items-center gap-3">
                <MaterialIcons name="info-outline" size={22} color="#D97706" />
                <Text className="text-[#92400E] font-bold flex-1">{attendanceWarning}</Text>
              </View>
            ) : null}

            <View>
              <SectionHeader
                eyebrow="Court work"
                title="Upcoming Training"
                subtitle="Your next scheduled team sessions, ordered by time."
                actionLabel="Schedule"
                onAction={() => router.replace('/schedule' as any)}
                isMobile={isMobile}
              />

              {upcomingTraining.length ? (
                <View className="gap-4">
                  {upcomingTraining.map((event) => (
                    <EventCard key={event.id} event={event} accent={palette.royal} label="Team training" variant="training" isMobile={isMobile} />
                  ))}
                </View>
              ) : (
                <EmptySection message="No upcoming training sessions found." />
              )}
            </View>

            <View>
              <SectionHeader
                eyebrow="Game day"
                title="Upcoming Games"
                subtitle={`Showing ${upcomingGames.length} of ${allUpcomingGames.length} scheduled games`}
                actionLabel="Schedule"
                onAction={() => router.replace('/schedule' as any)}
                isMobile={isMobile}
              />

              <FilterBar
                gameFilters={gameFilters}
                teamFilterOptions={teamFilterOptions}
                categoryFilterOptions={categoryFilterOptions}
                monthFilterOptions={monthFilterOptions}
                seasonFilterOptions={seasonFilterOptions}
                isMobile={isMobile}
                onChange={setGameFilters}
                onReset={() => setGameFilters({ team: ALL_FILTER_KEY, category: ALL_FILTER_KEY, month: ALL_FILTER_KEY, season: ALL_FILTER_KEY })}
              />

              {upcomingGames.length ? (
                <View className="gap-4">
                  {upcomingGames.map((event) => (
                    <EventCard key={event.id} event={event} accent={palette.orange} label={getEventCategory(event)} variant="game" isMobile={isMobile} />
                  ))}
                </View>
              ) : (
                <EmptySection message="No upcoming games found." />
              )}
            </View>

            <View>
              <SectionHeader
                eyebrow="Scoreboard"
                title="Game Results"
                subtitle="Recent finals and completed match records."
                trailing={
                  <View className="rounded-full bg-white border border-[#DDE8F5] px-4 py-3" style={styles.microShadow}>
                    <Text className="text-[#64748B] text-[12px] font-black uppercase tracking-widest">{gameResults.length} recent</Text>
                  </View>
                }
                isMobile={isMobile}
              />

              {gameResults.length ? (
                <View className={`${isMobile ? 'flex-col' : 'flex-row flex-wrap'} gap-4`}>
                  {gameResults.map((event) => <ResultCard key={event.id} event={event} isMobile={isMobile} />)}
                </View>
              ) : (
                <EmptySection message="No game results available yet." />
              )}
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 36,
    padding: 30,
    shadowColor: '#123A97',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.2,
    shadowRadius: 30,
    elevation: 10,
  },
  heroMobile: {
    borderRadius: 28,
    padding: 20,
  },
  cardShadow: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 22,
    elevation: 4,
  },
  microShadow: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
});

export default function HomeScreen() {
  const { session } = useFirebaseAuth();

  if (normalizeRole(session?.role) === 'coach') {
    return <CoachHome />;
  }

  return <PlayerHomeScreen />;
}
