import {
    View,
    Text,
    ScrollView,
    Pressable,
    ActivityIndicator,
    Modal,
    FlatList,
    type LayoutChangeEvent,
    type NativeScrollEvent,
    type NativeSyntheticEvent,
} from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from '@/src/web/reactNativeSvg';
import * as React from 'react';
import { basketballApi, League, Season, Team, Match, StandingRow } from '../../services/basketballApi';
import { dashboardApi, DashboardSummary, ExpiringItem } from '../../services/dashboardApi';
import { teamsApi, Team as SavedTeam } from '../../services/teamsApi';
import { useResponsive } from '../../hooks/useResponsive';
import StatCard from '../../components/dashboard/StatCard';
import FilterBar from '../../components/dashboard/FilterBar';
import { EmptyState, ErrorState, LoadingState, SkeletonBlock } from '../../components/dashboard/ScreenStates';
import { GameCard, ResultCard as DashboardResultCard } from '../../components/dashboard/EventCards';
import { dash } from '../../components/dashboard/dashboardTheme';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type PickerItem = { id: string; label: string };

type RecentResult = Match & {
    savedTeamName: string;
};

type TeamStanding = {
    played: number;
    wins: number;
    losses: number;
    draws: number;
    pointsFor: number;
    pointsAgainst: number;
    diff: number;
    winRate: number;
    lastFive: Match['result'][];
    streakLabel: string;
    rows: TeamStandingRow[];
};

type TeamStandingRow = {
    position: number;
    team: string;
    played: number;
    wins: number;
    losses: number;
    draws: number;
    pointsFor: number;
    pointsAgainst: number;
    diff: number;
    points: number;
};

type PickerProps = {
    visible: boolean;
    items: PickerItem[];
    onSelect: (id: string) => void;
    onClose: () => void;
    title: string;
    icon?: keyof typeof MaterialIcons.glyphMap;
    selectedId?: string;
};

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const MONTHS: PickerItem[] = [
    { id: '1', label: 'Ianuarie' }, { id: '2', label: 'Februarie' },
    { id: '3', label: 'Martie' },  { id: '4', label: 'Aprilie' },
    { id: '5', label: 'Mai' },     { id: '6', label: 'Iunie' },
    { id: '7', label: 'Iulie' },   { id: '8', label: 'August' },
    { id: '9', label: 'Septembrie' }, { id: '10', label: 'Octombrie' },
    { id: '11', label: 'Noiembrie' }, { id: '12', label: 'Decembrie' },
];

const RON_MONTHS = ['IAN', 'FEB', 'MAR', 'APR', 'MAI', 'IUN', 'IUL', 'AUG', 'SEP', 'OCT', 'NOI', 'DEC'];

// ─────────────────────────────────────────────────────────────
// Date Helpers (pure functions — fără side effects)
// ─────────────────────────────────────────────────────────────

/**
 * Parsează "DD.MM.YYYY" într-un obiect Date.
 * Returnează null dacă formatul e invalid.
 */
function parseDateStr(dateStr: string): Date | null {
    if (!dateStr) return null;
    const parts = dateStr.split('.');
    if (parts.length !== 3) return null;
    const [day, month, year] = parts.map(Number);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    return new Date(year, month - 1, day);
}

function parseMatchDateTime(match: Match): Date | null {
    const date = parseDateStr(match.date);
    if (!date) return null;

    if (match.time && /^\d{1,2}:\d{2}$/.test(match.time)) {
        const [hours, minutes] = match.time.split(':').map(Number);
        date.setHours(hours, minutes, 0, 0);
        return date;
    }

    date.setHours(23, 59, 59, 999);
    return date;
}

function isFutureMatch(match: Match): boolean {
    const matchDate = parseMatchDateTime(match);
    if (!matchDate) return false;
    return matchDate.getTime() >= Date.now();
}

/**
 * Întoarce ziua relativă față de astăzi: TODAY, TOMORROW, IN X DAYS, etc.
 * Funcționează cu formatul "DD.MM.YYYY".
 */
function relativeDay(dateStr: string): string {
    const matchDate = parseDateStr(dateStr);
    if (!matchDate) return dateStr;

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diffDays = Math.round((matchDate.getTime() - now.getTime()) / 86400000);

    if (diffDays === 0) return 'AZI';
    if (diffDays === 1) return 'MÂINE';
    if (diffDays === -1) return 'IERI';
    if (diffDays < -1 && diffDays >= -7) return `ACUM ${Math.abs(diffDays)} ZILE`;
    if (diffDays > 1 && diffDays <= 7) return `ÎN ${diffDays} ZILE`;
    return dateStr;
}

/**
 * Extrage luna (abreviată română) și ziua dintr-un șir "DD.MM.YYYY".
 */
function splitDate(dateStr: string): { month: string; day: string } {
    const parts = dateStr?.split('.');
    if (parts?.length === 3) {
        const monthIndex = Number(parts[1]) - 1;
        return {
            month: RON_MONTHS[monthIndex] ?? parts[1],
            day: parts[0],
        };
    }
    return { month: '---', day: '??' };
}

/**
 * Formatează suma monetară în RON cu separator de mii.
 */
function formatCurrency(amount: number): string {
    if (amount === 0) return '0 RON';
    return `${amount.toLocaleString('ro-RO')} RON`;
}

function polarToCartesian(cx: number, cy: number, radius: number, angleInDegrees: number) {
    const angleInRadians = (angleInDegrees - 90) * (Math.PI / 180);
    return {
        x: cx + radius * Math.cos(angleInRadians),
        y: cy + radius * Math.sin(angleInRadians),
    };
}

function describeArc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
    const start = polarToCartesian(cx, cy, radius, endAngle);
    const end = polarToCartesian(cx, cy, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

    return [
        'M',
        start.x,
        start.y,
        'A',
        radius,
        radius,
        0,
        largeArcFlag,
        0,
        end.x,
        end.y,
    ].join(' ');
}

function AttendanceRing({
    rate,
    loading,
    size,
    strokeWidth,
}: {
    rate: number | null;
    loading: boolean;
    size: number;
    strokeWidth: number;
}) {
    const progress = rate == null ? 0 : Math.max(0, Math.min(100, rate));
    const radius = (size - strokeWidth) / 2;
    const center = size / 2;
    const innerSize = size - strokeWidth * 2;
    const hasProgress = progress > 0;
    const arcPath = hasProgress ? describeArc(center, center, radius, 0, progress / 100 * 360) : null;
    const isFullRing = progress >= 99.99;
    const gradientId = React.useId();

    return (
        <View className="items-center justify-center" style={{ width: size, height: size }}>
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <Defs>
                    <LinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                        <Stop offset="0%" stopColor={dash.gradients.ring[0]} />
                        <Stop offset="100%" stopColor={dash.gradients.ring[1]} />
                    </LinearGradient>
                </Defs>
                <Circle
                    cx={center}
                    cy={center}
                    r={radius}
                    stroke="rgba(99,91,255,0.1)"
                    strokeWidth={strokeWidth}
                    fill="transparent"
                />
                {arcPath ? isFullRing ? (
                    <Circle
                        cx={center}
                        cy={center}
                        r={radius}
                        stroke={`url(#${gradientId})`}
                        strokeWidth={strokeWidth}
                        fill="transparent"
                    />
                ) : (
                    <Path
                        d={arcPath}
                        stroke={`url(#${gradientId})`}
                        strokeWidth={strokeWidth}
                        fill="transparent"
                        strokeLinecap="round"
                    />
                ) : null}
            </Svg>
            <View className="absolute items-center justify-center" style={{ width: innerSize, height: innerSize }}>
                {loading ? (
                    <ActivityIndicator size="small" color={dash.accent} />
                ) : (
                    <>
                        <Text className="text-[20px] font-semibold tracking-tight" style={{ color: dash.ink }}>
                            {rate !== null ? `${Math.round(rate)}%` : '0%'}
                        </Text>
                        <Text className="text-[8px] font-medium uppercase tracking-[0.08em] mt-1" style={{ color: dash.muted }}>
                            PREZENȚĂ
                        </Text>
                    </>
                )}
            </View>
        </View>
    );
}

// ─────────────────────────────────────────────────────────────
// Match Filter Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Filtrează meciurile programate care chiar urmează.
 * Sursa de adevăr: câmpul `status === 'scheduled'`.
 */
function filterScheduled(matches: Match[]): Match[] {
    return matches.filter((m) => m.status === 'scheduled' && isFutureMatch(m));
}

/**
 * Filtrează meciurile terminate (cu scor).
 * Sursa de adevăr: câmpul `status === 'finished'`.
 */
function filterFinished<T extends Match>(matches: T[]): T[] {
    return matches.filter((m) => m.status === 'finished');
}

/**
 * Sortează meciurile programate în ordine cronologică ascendentă (cel mai apropiat primul).
 */
function sortAscending<T extends Match>(matches: T[]): T[] {
    return [...matches].sort((a, b) => {
        const da = parseDateStr(a.date)?.getTime() ?? 0;
        const db = parseDateStr(b.date)?.getTime() ?? 0;
        return da - db;
    });
}

/**
 * Sortează meciurile terminate în ordine descrescătoare (cel mai recent primul).
 */
function sortDescending<T extends Match>(matches: T[]): T[] {
    return [...matches].sort((a, b) => {
        const da = parseMatchDateTime(a)?.getTime() ?? 0;
        const db = parseMatchDateTime(b)?.getTime() ?? 0;
        return db - da;
    });
}

function hasFrbIds(team: SavedTeam): boolean {
    return Boolean(team.frbTeamId && team.frbLeagueId && team.frbSeasonId);
}

function dedupeResults(results: RecentResult[]): RecentResult[] {
    return Array.from(
        new Map(
            results.map((match) => [
                [
                    match.savedTeamName,
                    match.date,
                    match.time,
                    match.homeTeam,
                    match.awayTeam,
                    match.homeScore,
                    match.awayScore,
                ].join('|'),
                match,
            ])
        ).values()
    );
}

function normalizeTeamName(name: string) {
    return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

function calculateTeamStanding(matches: Match[], teamName?: string, officialRows: StandingRow[] = []): TeamStanding {
    const normalizedSelectedTeam = normalizeTeamName(teamName ?? '');
    const finishedMatches = filterFinished(matches).filter((match) => {
        if (!normalizedSelectedTeam) return true;
        return normalizeTeamName(match.homeTeam) === normalizedSelectedTeam || normalizeTeamName(match.awayTeam) === normalizedSelectedTeam;
    });

    const standing = finishedMatches.reduce<TeamStanding>((acc, match) => {
        const homeScore = Number(match.homeScore);
        const awayScore = Number(match.awayScore);
        if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return acc;

        const isSelectedHome = normalizeTeamName(match.homeTeam) === normalizedSelectedTeam;
        const pointsFor = isSelectedHome ? homeScore : awayScore;
        const pointsAgainst = isSelectedHome ? awayScore : homeScore;

        acc.played += 1;
        acc.pointsFor += pointsFor;
        acc.pointsAgainst += pointsAgainst;
        if (pointsFor > pointsAgainst) acc.wins += 1;
        else if (pointsFor < pointsAgainst) acc.losses += 1;
        else acc.draws += 1;

        return acc;
    }, {
        played: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        diff: 0,
        winRate: 0,
        lastFive: [],
        streakLabel: 'Fără rezultate',
        rows: [],
    });

    standing.diff = standing.pointsFor - standing.pointsAgainst;
    standing.winRate = standing.played > 0 ? Math.round((standing.wins / standing.played) * 100) : 0;
    standing.lastFive = sortDescending(finishedMatches).slice(0, 5).map((match) => match.result);

    const currentStreak = standing.lastFive[0];
    const streakCount = currentStreak && currentStreak !== 'N/A'
        ? standing.lastFive.findIndex((result) => result !== currentStreak)
        : -1;
    const count = streakCount === -1 ? standing.lastFive.filter((result) => result === currentStreak).length : streakCount;
    standing.streakLabel = currentStreak && currentStreak !== 'N/A'
        ? `${currentStreak}${count || 1}`
        : 'Fără serie';
    standing.rows = officialRows.map((row) => ({
        position: row.position,
        team: row.team,
        played: row.played,
        wins: row.wins,
        losses: row.losses,
        draws: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        diff: 0,
        points: row.points,
    }));
    const selectedOfficialRow = standing.rows.find((row) => normalizeTeamName(row.team) === normalizedSelectedTeam);
    if (selectedOfficialRow) {
        standing.played = selectedOfficialRow.played;
        standing.wins = selectedOfficialRow.wins;
        standing.losses = selectedOfficialRow.losses;
        standing.draws = selectedOfficialRow.draws;
        standing.winRate = selectedOfficialRow.played > 0
            ? Math.round((selectedOfficialRow.wins / selectedOfficialRow.played) * 100)
            : 0;
    }

    return standing;
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

const DropdownPicker = ({ visible, items, onSelect, onClose, title, icon = 'apps', selectedId }: PickerProps) => (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <Pressable className="flex-1 items-center justify-center p-4" style={{ backgroundColor: 'rgba(10,15,28,0.5)' }} onPress={onClose}>
            <Pressable
                className="rounded-[22px] w-full max-w-[360px] max-h-[70vh] border dash-fade-in overflow-hidden flex-col"
                style={{ backgroundColor: dash.surface, borderColor: 'rgba(15,23,42,0.06)', ...dash.shadow.lift }}
                onPress={(event: any) => event.stopPropagation()}
            >
                <View
                    pointerEvents="none"
                    className="absolute top-0 left-0 right-0 h-[3px]"
                    style={{ backgroundImage: 'linear-gradient(90deg, #635BFF, #2563EB)' } as any}
                />
                <View className="flex-row items-center justify-between px-5 pt-6 pb-4" style={{ borderBottomWidth: 1, borderBottomColor: 'rgba(15,23,42,0.05)' }}>
                    <View className="flex-row items-center flex-1 pr-3">
                        <View className="w-9 h-9 rounded-[12px] items-center justify-center mr-3" style={{ backgroundColor: 'rgba(99,91,255,0.1)' }}>
                            <MaterialIcons name={icon} size={17} color={dash.accent} />
                        </View>
                        <View className="flex-1">
                            <Text className="text-base font-semibold" style={{ color: dash.ink }} numberOfLines={1}>{title}</Text>
                            <Text className="text-[11px] mt-0.5 font-medium" style={{ color: dash.muted }}>
                                {items.length} {items.length === 1 ? 'opțiune' : 'opțiuni'} disponibile
                            </Text>
                        </View>
                    </View>
                    <Pressable
                        onPress={onClose}
                        className="w-8 h-8 rounded-full items-center justify-center active:opacity-70"
                        style={{ backgroundColor: dash.lineSoft }}
                    >
                        <MaterialIcons name="close" size={15} color={dash.faint} />
                    </Pressable>
                </View>
                <FlatList
                    className="px-3 py-3 max-h-[50vh]"
                    data={items}
                    keyExtractor={(i) => i.id}
                    renderItem={({ item }) => {
                        const isSelected = selectedId != null && item.id === selectedId;
                        return (
                            <Pressable
                                onPress={() => { onSelect(item.id); onClose(); }}
                                className="dash-row-hover flex-row items-center justify-between py-3 px-3.5 rounded-[13px] mb-1 border active:opacity-80"
                                style={{
                                    backgroundColor: isSelected ? 'rgba(99,91,255,0.08)' : 'transparent',
                                    borderColor: isSelected ? 'rgba(99,91,255,0.25)' : 'transparent',
                                }}
                            >
                                <Text
                                    className="text-sm"
                                    style={{ color: isSelected ? dash.accent : dash.inkSoft, fontWeight: isSelected ? '700' : '500' }}
                                >
                                    {item.label}
                                </Text>
                                {isSelected ? (
                                    <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: dash.accent }}>
                                        <MaterialIcons name="check" size={12} color="#FFFFFF" />
                                    </View>
                                ) : null}
                            </Pressable>
                        );
                    }}
                />
            </Pressable>
        </Pressable>
    </Modal>
);

// ─────────────────────────────────────────────────────────────
// Match Cards
// ─────────────────────────────────────────────────────────────

const ScheduledMatchCard = ({ game, leagueName }: { game: Match; leagueName: string }) => {
    const { month, day } = splitDate(game.date);
    const categoryLabel = leagueName || game.league || 'Categorie';
    return (
        <GameCard
            title={`${game.homeTeam} vs ${game.awayTeam}`}
            dateLabel={game.date}
            month={month}
            day={day}
            time={game.time}
            meta={categoryLabel}
            location={game.league}
        />
    );
};

const ResultCard = ({ m, leagueName, isSmallPhone }: { m: RecentResult; leagueName: string; isSmallPhone: boolean }) => {
    const contextLabel = m.savedTeamName || leagueName || m.league;
    return (
        <DashboardResultCard
            homeTeam={m.homeTeam}
            awayTeam={m.awayTeam}
            score={`${m.homeScore}-${m.awayScore}`}
            context={contextLabel}
            dateLabel={relativeDay(m.date)}
            result={m.result}
            compact={isSmallPhone}
        />
    );
};

// ─────────────────────────────────────────────────────────────
// Risk Management Block — conectat la date reale
// ─────────────────────────────────────────────────────────────

interface RiskManagementBlockProps {
    expiringItems: ExpiringItem[];
    expiredCount: number;
    loading: boolean;
    compact?: boolean;
    showHeader?: boolean;
}

const RiskManagementBlock = ({ expiringItems, expiredCount, loading, compact = false, showHeader = true }: RiskManagementBlockProps) => (
    <View>
        {showHeader ? (
            <View className="flex-row justify-between items-center mb-4 px-1 lg:px-0">
                <View>
                    <Text className="text-lg lg:text-xl font-semibold" style={{ color: dash.ink }}>Risk Management</Text>
                    <Text className="text-xs mt-0.5 font-medium" style={{ color: dash.muted }}>Conformitate &amp; scadențe</Text>
                </View>
                {expiredCount > 0 && (
                    <View className="px-2.5 py-1 rounded-full" style={{ backgroundColor: 'rgba(239,68,68,0.1)' }}>
                        <Text className="text-[10px] font-semibold" style={{ color: dash.danger }}>{expiredCount} EXPIRATE</Text>
                    </View>
                )}
            </View>
        ) : null}
        <View
            className={`dash-card-hover rounded-[18px] ${compact ? 'p-4 min-h-[142px]' : 'p-4 min-h-[176px]'} flex-col border dash-fade-in`}
            style={{ backgroundColor: dash.surface, borderColor: 'rgba(15,23,42,0.06)', ...dash.shadow.card }}
        >
            <View className={`flex-row items-center justify-between ${compact ? 'mb-3' : 'mb-3'}`}>
                <View className="flex-row items-center flex-1">
                    <View
                        className="w-9 h-9 rounded-[12px] items-center justify-center"
                        style={{ backgroundColor: expiredCount > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)' }}
                    >
                        <MaterialIcons name={expiredCount > 0 ? 'warning' : 'verified'} size={17} color={expiredCount > 0 ? dash.danger : dash.success} />
                    </View>
                    <View className="ml-3 flex-1">
                        <Text className="text-[13px] font-semibold" style={{ color: expiredCount > 0 ? '#991B1B' : '#047857' }}>
                            Necesită atenție
                        </Text>
                        {compact ? (
                            <Text className="text-[11px] font-medium mt-0.5" style={{ color: dash.muted }} numberOfLines={1}>
                                {expiredCount > 0 ? `${expiredCount} documente expirate` : 'Status verificat'}
                            </Text>
                        ) : null}
                    </View>
                </View>
                {!showHeader && expiredCount > 0 ? (
                    <View className="px-2.5 py-1 rounded-full" style={{ backgroundColor: 'rgba(239,68,68,0.1)' }}>
                        <Text className="text-[10px] font-semibold" style={{ color: dash.danger }}>{expiredCount} EXPIRATE</Text>
                    </View>
                ) : null}
            </View>

            {loading && (
                <View className={`${compact ? 'py-3' : 'py-4'} gap-2.5`}>
                    <SkeletonBlock width="100%" height={compact ? 48 : 52} className="rounded-[14px]" />
                    {!compact ? <SkeletonBlock width="80%" height={44} className="rounded-[14px]" /> : null}
                </View>
            )}

            {!loading && expiringItems.length === 0 && (
                <View className={`items-center ${compact ? 'py-2' : 'py-4'}`}>
                    {!compact ? (
                        <View className="w-10 h-10 rounded-full items-center justify-center mb-2" style={{ backgroundColor: 'rgba(16,185,129,0.1)' }}>
                            <MaterialIcons name="check-circle" size={24} color={dash.success} />
                        </View>
                    ) : null}
                    <Text className="text-sm font-semibold mt-1" style={{ color: dash.success }}>Totul e în regulă</Text>
                    <Text className="text-xs mt-1 font-medium" style={{ color: dash.faint }}>Nicio urgență activă</Text>
                </View>
            )}

            {/* Desktop list */}
            {!loading && expiringItems.length > 0 && (
                <View className={`hidden lg:flex flex-col ${compact ? 'gap-2.5' : 'gap-3'} w-full`}>
                    {expiringItems.slice(0, compact ? 2 : 4).map((d, i) => (
                        <React.Fragment key={i}>
                            <View
                                className="flex-row pl-3.5 border-l-2 items-start rounded-r-[12px] py-1"
                                style={{
                                    borderLeftColor: d.urgent ? dash.danger : dash.warning,
                                    backgroundColor: d.urgent ? 'rgba(239,68,68,0.03)' : 'rgba(245,158,11,0.04)',
                                }}
                            >
                                <View className="flex-col pb-1 flex-1">
                                    <Text className="text-[9px] font-medium uppercase tracking-[0.06em]" style={{ color: dash.faint }}>
                                        {d.type}
                                    </Text>
                                    <Text className="text-[13px] font-semibold mt-0.5" style={{ color: dash.inkSoft }}>
                                        {d.name}
                                    </Text>
                                    <View className="flex-row items-center gap-3 mt-1.5">
                                        <View
                                            className="px-2 py-[3px] rounded-md"
                                            style={{ backgroundColor: d.urgent ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.12)' }}
                                        >
                                            <Text className="text-[9px] font-semibold tracking-wide" style={{ color: d.urgent ? dash.danger : '#B45309' }}>
                                                {d.daysLeft !== null ? `${d.daysLeft} ZILE RĂMASE` : 'EXPIRAT'}
                                            </Text>
                                        </View>
                                        {!compact ? <Text className="text-[10px] font-medium" style={{ color: dash.muted }}>Exp: {d.expiryDate}</Text> : null}
                                    </View>
                                </View>
                            </View>
                        </React.Fragment>
                    ))}
                </View>
            )}

            {/* Mobile list */}
            {!loading && expiringItems.length > 0 && (
                <View className="flex lg:hidden flex-col gap-2.5">
                    {expiringItems.slice(0, 2).map((d, i) => (
                        <React.Fragment key={i}>
                            <View
                                className="flex-row items-center justify-between p-3 rounded-[14px] h-[62px] border"
                                style={{ backgroundColor: dash.lineSoft, borderColor: 'rgba(15,23,42,0.04)' }}
                            >
                                <View className="flex-1 pr-2">
                                    <Text className="text-[13px] font-semibold" style={{ color: dash.ink }} numberOfLines={1}>{d.name}</Text>
                                    <Text className="text-[10px] mt-1 font-medium" style={{ color: dash.muted }}>{d.type}</Text>
                                </View>
                                <View
                                    className="px-2.5 py-1.5 rounded-full"
                                    style={{ backgroundColor: d.urgent ? dash.danger : dash.ink }}
                                >
                                    <Text className="text-white text-[9px] font-semibold tracking-wide leading-none">
                                        {d.daysLeft !== null ? `${d.daysLeft} ZILE` : 'EXPIRAT'}
                                    </Text>
                                </View>
                            </View>
                        </React.Fragment>
                    ))}
                </View>
            )}

            {!compact ? <View className="hidden lg:flex mt-auto pt-5">
                <Pressable
                    className="w-full py-2.5 rounded-[12px] border items-center justify-center dash-btn-hover"
                    style={{ borderColor: 'rgba(99,91,255,0.2)', backgroundColor: 'rgba(99,91,255,0.04)' }}
                >
                    <Text className="text-[13px] font-semibold" style={{ color: dash.accent }}>
                        Notifică Echipa de Conformitate
                    </Text>
                </Pressable>
            </View> : null}
        </View>
    </View>
);

// ─────────────────────────────────────────────────────────────
// Financial Summary — venit/cheltuială/profit într-un singur card compact
// ─────────────────────────────────────────────────────────────

interface FinancialSummaryCardProps {
    income: number;
    expense: number;
    profit: number;
    profitChangePercent: number | null;
    loading: boolean;
}

const FinancialSummaryCard = ({ income, expense, profit, profitChangePercent, loading }: FinancialSummaryCardProps) => {
    const trendTone = profitChangePercent == null
        ? null
        : profitChangePercent > 0 ? dash.trend.up : profitChangePercent < 0 ? dash.trend.down : dash.trend.flat;

    return (
        <View
            className="dash-card dash-card-hover flex-1 rounded-[18px] p-4 border min-w-[280px] overflow-hidden relative dash-fade-in"
            style={{ backgroundColor: dash.surface, borderColor: dash.hairline, ...dash.shadow.card }}
        >
            <View pointerEvents="none" className="absolute top-0 left-0 right-0 h-[3px]" style={{ backgroundImage: 'linear-gradient(90deg, #10B981, #635BFF)' } as any} />
            <Text className="text-[10px] font-semibold uppercase tracking-[0.09em] mb-3" style={{ color: dash.muted }}>
                Financiar · luna curentă
            </Text>

            {loading ? (
                <View className="flex-row gap-3">
                    <SkeletonBlock width="30%" height={36} />
                    <SkeletonBlock width="30%" height={36} />
                    <SkeletonBlock width="30%" height={36} />
                </View>
            ) : (
                <View className="flex-row">
                    <View className="flex-1 pr-3">
                        <Text className="text-[10px] font-semibold" style={{ color: dash.muted }}>Venituri</Text>
                        <Text className="text-[16px] font-bold mt-1" style={{ color: dash.successDeep }} numberOfLines={1}>
                            {formatCurrency(income)}
                        </Text>
                    </View>
                    <View className="w-px" style={{ backgroundColor: dash.line }} />
                    <View className="flex-1 px-3">
                        <Text className="text-[10px] font-semibold" style={{ color: dash.muted }}>Cheltuieli</Text>
                        <Text className="text-[16px] font-bold mt-1" style={{ color: dash.warningDeep }} numberOfLines={1}>
                            {formatCurrency(expense)}
                        </Text>
                    </View>
                    <View className="w-px" style={{ backgroundColor: dash.line }} />
                    <View className="flex-1 pl-3">
                        <Text className="text-[10px] font-semibold" style={{ color: dash.muted }}>Profit</Text>
                        <Text className="text-[16px] font-bold mt-1" style={{ color: profit >= 0 ? dash.ink : dash.danger }} numberOfLines={1}>
                            {formatCurrency(profit)}
                        </Text>
                        {trendTone && profitChangePercent != null ? (
                            <View className="flex-row items-center gap-0.5 mt-1">
                                <MaterialIcons name={trendTone.icon} size={11} color={trendTone.fg} />
                                <Text className="text-[10px] font-bold" style={{ color: trendTone.fg }} numberOfLines={1}>
                                    {profitChangePercent > 0 ? '+' : ''}{profitChangePercent}% vs. luna trecută
                                </Text>
                            </View>
                        ) : null}
                    </View>
                </View>
            )}
        </View>
    );
};

// ─────────────────────────────────────────────────────────────
// Selected Team Standing
// ─────────────────────────────────────────────────────────────

const TeamStandingWidget = ({
    teamName,
    standing,
    loading,
}: {
    teamName?: string;
    standing: TeamStanding;
    loading: boolean;
}) => {
    const selectedRow = standing.rows.find((row) => normalizeTeamName(row.team) === normalizeTeamName(teamName ?? ''));
    const stats = [
        { label: 'MJ', value: standing.played },
        { label: 'V', value: standing.wins },
        { label: 'Î', value: standing.losses },
        { label: 'PCT', value: selectedRow?.points ?? standing.wins * 2 + standing.draws },
    ];

    return (
        <View
            className="dash-card-hover rounded-[20px] p-4 border mb-5 dash-fade-in"
            style={{ backgroundColor: dash.surface, borderColor: 'rgba(15,23,42,0.06)', ...dash.shadow.card }}
        >
            <View className="flex-row items-start justify-between mb-3.5">
                <View className="flex-1 pr-3">
                    <Text className="text-[17px] font-semibold" style={{ color: dash.ink }}>Standings</Text>
                    <Text className="text-xs mt-1 font-medium" style={{ color: dash.muted }} numberOfLines={1}>
                        {teamName ?? 'Alege o echipă din filtre'}
                    </Text>
                </View>
                <View className="w-9 h-9 rounded-[12px] items-center justify-center" style={{ backgroundColor: 'rgba(99,91,255,0.08)' }}>
                    <MaterialIcons name="leaderboard" size={16} color={dash.accent} />
                </View>
            </View>

            {loading ? (
                <View className="gap-3 py-2">
                    <SkeletonBlock width="100%" height={120} className="rounded-[16px]" />
                    <SkeletonBlock width="100%" height={140} className="rounded-[14px]" />
                </View>
            ) : (
                <>
                    <View
                        className="rounded-[16px] p-4 mb-4 border overflow-hidden"
                        style={{
                            backgroundColor: dash.ink,
                            borderColor: 'rgba(255,255,255,0.06)',
                            backgroundImage: 'linear-gradient(135deg, #0A0F1C 0%, #1E293B 100%)',
                        } as any}
                    >
                        <View className="flex-row items-center justify-between">
                            <View>
                                <Text className="text-[10px] font-medium uppercase tracking-[0.06em]" style={{ color: 'rgba(255,255,255,0.55)' }}>
                                    Rată victorii
                                </Text>
                                <Text className="text-white text-[30px] font-semibold mt-1 leading-none">{standing.winRate}%</Text>
                            </View>
                            <View className="items-end">
                                <Text className="text-[10px] font-medium uppercase tracking-[0.06em]" style={{ color: 'rgba(255,255,255,0.55)' }}>
                                    Loc
                                </Text>
                                <View className="px-3 py-1.5 rounded-full mt-2" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}>
                                    <Text className="text-white text-xs font-semibold">
                                        {selectedRow ? `#${selectedRow.position}` : standing.streakLabel}
                                    </Text>
                                </View>
                            </View>
                        </View>
                        <View className="flex-row gap-2 mt-4">
                            {stats.map((item) => (
                                <View key={item.label} className="flex-1 rounded-[12px] py-2.5 items-center" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
                                    <Text className="text-[9px] font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>{item.label}</Text>
                                    <Text className="text-white text-[14px] font-semibold mt-1">{item.value}</Text>
                                </View>
                            ))}
                        </View>
                    </View>

                    <View className="mb-4 rounded-[14px] border overflow-hidden" style={{ borderColor: 'rgba(15,23,42,0.06)' }}>
                        <View className="flex-row items-center px-3 py-2.5" style={{ backgroundColor: dash.lineSoft }}>
                            <Text className="w-7 text-[9px] font-semibold uppercase tracking-wide" style={{ color: dash.faint }}>#</Text>
                            <Text className="flex-1 text-[9px] font-semibold uppercase tracking-wide" style={{ color: dash.faint }}>ECHIPĂ</Text>
                            <Text className="w-8 text-right text-[9px] font-semibold uppercase tracking-wide" style={{ color: dash.faint }}>MJ</Text>
                            <Text className="w-7 text-right text-[9px] font-semibold uppercase tracking-wide" style={{ color: dash.faint }}>V</Text>
                            <Text className="w-7 text-right text-[9px] font-semibold uppercase tracking-wide" style={{ color: dash.faint }}>Î</Text>
                            <Text className="w-9 text-right text-[9px] font-semibold uppercase tracking-wide" style={{ color: dash.faint }}>PCT</Text>
                        </View>
                        {(standing.rows.length ? standing.rows : [{
                            position: 1,
                            team: teamName ?? 'Fără rezultate',
                            played: 0,
                            wins: 0,
                            losses: 0,
                            draws: 0,
                            pointsFor: 0,
                            pointsAgainst: 0,
                            diff: 0,
                            points: 0,
                        }]).map((row, index) => {
                            const isSelected = normalizeTeamName(row.team) === normalizeTeamName(teamName ?? '');
                            return (
                                <View
                                    key={`${row.team}-${index}`}
                                    className="dash-row-hover flex-row items-center px-3 py-2.5 border-t"
                                    style={{
                                        backgroundColor: isSelected ? 'rgba(99,91,255,0.06)' : dash.surface,
                                        borderTopColor: 'rgba(15,23,42,0.04)',
                                    }}
                                >
                                    <Text className="w-7 text-[11px] font-semibold" style={{ color: isSelected ? dash.accent : dash.muted }}>
                                        {row.position}
                                    </Text>
                                    <Text className="flex-1 text-[11px] font-medium pr-2" style={{ color: isSelected ? dash.ink : dash.inkSoft }} numberOfLines={1}>
                                        {row.team}
                                    </Text>
                                    <Text className="w-8 text-right text-[11px] font-medium" style={{ color: dash.inkSoft }}>{row.played}</Text>
                                    <Text className="w-7 text-right text-[11px] font-semibold" style={{ color: dash.success }}>{row.wins}</Text>
                                    <Text className="w-7 text-right text-[11px] font-semibold" style={{ color: dash.danger }}>{row.losses}</Text>
                                    <Text className="w-9 text-right text-[11px] font-semibold" style={{ color: dash.ink }}>{row.points}</Text>
                                </View>
                            );
                        })}
                    </View>

                    <View className="flex-row items-center justify-between pt-1">
                        <Text className="text-[11px] font-medium uppercase tracking-[0.06em]" style={{ color: dash.muted }}>Formă</Text>
                        <View className="flex-row gap-1.5">
                            {(standing.lastFive.length ? standing.lastFive : ['N/A']).map((result, index) => {
                                const isWin = result === 'W';
                                const isLoss = result === 'L';
                                const bg = isWin ? 'rgba(16,185,129,0.1)' : isLoss ? 'rgba(239,68,68,0.08)' : dash.lineSoft;
                                const text = isWin ? dash.success : isLoss ? dash.danger : dash.faint;
                                return (
                                    <View key={`${result}-${index}`} className="w-6 h-6 rounded-full items-center justify-center" style={{ backgroundColor: bg }}>
                                        <Text className="text-[10px] font-bold" style={{ color: text }}>{result}</Text>
                                    </View>
                                );
                            })}
                        </View>
                    </View>
                </>
            )}
        </View>
    );
};

// ─────────────────────────────────────────────────────────────
// Club Health Block — conectat la date reale de prezență
// ─────────────────────────────────────────────────────────────

interface ClubHealthBlockProps {
    attendanceRate: number | null;
    presentCount: number;
    totalRecords: number;
    loading: boolean;
    isSmallPhone: boolean;
}

const ClubHealthBlock = ({ attendanceRate, presentCount, totalRecords, loading, isSmallPhone }: ClubHealthBlockProps) => {
    const absentCount = Math.max(0, totalRecords - presentCount);
    const rate = attendanceRate ?? 0;
    const label = attendanceRate == null ? 'DATE LIPSĂ' : rate >= 80 ? 'OPTIMAL' : rate >= 60 ? 'MEDIU' : 'SCĂZUT';

    return (
        <View
            className="flex lg:hidden rounded-[20px] p-4 mb-6 mt-2 border overflow-hidden relative dash-fade-in"
            style={{ backgroundColor: dash.surface, borderColor: dash.hairline, ...dash.shadow.card }}
        >
            <View pointerEvents="none" className="absolute top-0 left-0 right-0 h-[3px]" style={{ backgroundImage: 'linear-gradient(90deg, #635BFF, #2563EB)' } as any} />
            <View pointerEvents="none" className="absolute inset-0" style={{ backgroundImage: dash.gradients.cardPurple } as any} />
            <View className="relative flex-row justify-between items-start mb-3">
                <View>
                    <Text className="text-base font-bold tracking-tight" style={{ color: dash.ink }}>Club Health</Text>
                    <Text className="text-xs mt-1 font-medium" style={{ color: dash.muted }}>Prezență luna curentă</Text>
                </View>
                {loading ? (
                    <ActivityIndicator size="small" color={dash.accentSky} />
                ) : (
                    <View className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full mt-1" style={{ backgroundColor: 'rgba(16,185,129,0.12)' }}>
                        <View className="w-1.5 h-1.5 rounded-full dash-pulse-dot" style={{ backgroundColor: dash.success }} />
                        <Text className="text-[10px] font-bold tracking-wider" style={{ color: dash.successDeep }}>LIVE</Text>
                    </View>
                )}
            </View>

            {!loading && (
                <>
                    <View className="items-center justify-center my-2 relative">
                        <AttendanceRing
                            rate={attendanceRate}
                            loading={loading}
                            size={isSmallPhone ? 112 : 132}
                            strokeWidth={isSmallPhone ? 10 : 13}
                        />
                        {!loading ? (
                            <Text className="text-[#1D3E90] text-[10px] font-bold tracking-widest uppercase mt-2">
                                {label}
                            </Text>
                        ) : null}
                    </View>
                    <View className="flex-row justify-around px-2 mt-3">
                        <View className="flex-row items-center gap-2">
                            <View className="w-2.5 h-2.5 rounded-full bg-[#1D3E90]" />
                            <View>
                                <Text className="text-[10px] text-[#64748B] font-semibold">Prezenți</Text>
                                <Text className="text-[#0E2041] font-bold text-lg mt-[-2px]">{presentCount}</Text>
                            </View>
                        </View>
                        <View className="flex-row items-center gap-2">
                            <View className="w-2.5 h-2.5 rounded-full bg-[#E2E8F0]" />
                            <View>
                                <Text className="text-[10px] text-[#64748B] font-semibold">Absenți</Text>
                                <Text className="text-[#0E2041] font-bold text-lg mt-[-2px]">{absentCount}</Text>
                            </View>
                        </View>
                    </View>
                </>
            )}
        </View>
    );
};

function MobileWidgetStack({ children }: { children: React.ReactNode }) {
    const { width } = useResponsive();
    const cardWidth = Math.max(288, width - 32);
    const scrollRef = React.useRef<ScrollView>(null);
    const [activeIndex, setActiveIndex] = React.useState(0);
    const [cardHeights, setCardHeights] = React.useState<Record<number, number>>({});
    const activeHeight = cardHeights[activeIndex];
    const widgetItems = React.Children.toArray(children);
    const maxIndex = Math.max(0, widgetItems.length - 1);

    const handleCardLayout = React.useCallback((index: number, event: LayoutChangeEvent) => {
        const nextHeight = Math.ceil(event.nativeEvent.layout.height);
        setCardHeights((current) => current[index] === nextHeight ? current : { ...current, [index]: nextHeight });
    }, []);

    const handleScrollEnd = React.useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const nextIndex = Math.round(event.nativeEvent.contentOffset.x / cardWidth);
        setActiveIndex(Math.max(0, Math.min(nextIndex, maxIndex)));
    }, [cardWidth, maxIndex]);

    const goToWidget = React.useCallback((direction: 'left' | 'right') => {
        const nextIndex = Math.max(0, Math.min(activeIndex + (direction === 'right' ? 1 : -1), maxIndex));
        setActiveIndex(nextIndex);
        scrollRef.current?.scrollTo({ x: nextIndex * cardWidth, animated: true });
    }, [activeIndex, cardWidth, maxIndex]);

    return (
        <View className="flex lg:hidden mb-4 relative">
            <View className="flex-row items-center justify-between px-1 mb-3">
                <View>
                    <Text className="text-[#07152F] text-lg font-black">Workspace pulse</Text>
                    <Text className="text-[#64748B] text-xs font-bold mt-0.5">Un card pe ecran, glisează pentru următorul</Text>
                </View>
                <View className="flex-row items-center gap-2">
                    <Pressable
                        onPress={() => goToWidget('left')}
                        disabled={activeIndex === 0}
                        className={`w-9 h-9 rounded-full items-center justify-center border border-[#DCE6F5] ${activeIndex === 0 ? 'bg-white/60 opacity-50' : 'bg-white'}`}
                    >
                        <MaterialIcons name="chevron-left" size={20} color="#0D2040" />
                    </Pressable>
                    <Pressable
                        onPress={() => goToWidget('right')}
                        disabled={activeIndex === maxIndex}
                        className={`w-9 h-9 rounded-full items-center justify-center ${activeIndex === maxIndex ? 'bg-[#CBD5E1] opacity-60' : 'bg-[#0D2040]'}`}
                    >
                        <MaterialIcons name="chevron-right" size={20} color="#FFFFFF" />
                    </Pressable>
                </View>
            </View>

            <View pointerEvents="none" style={{ position: 'absolute', opacity: 0, left: -10000, top: 0, width: cardWidth }}>
                {widgetItems.map((child, index) => (
                    <View
                        key={`mobile-widget-measure-${index}`}
                        onLayout={(event) => handleCardLayout(index, event)}
                        style={{ width: cardWidth }}
                    >
                        {child}
                    </View>
                ))}
            </View>

            <ScrollView
                ref={scrollRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                snapToInterval={cardWidth}
                snapToAlignment="start"
                decelerationRate="fast"
                contentContainerStyle={{ paddingRight: 0 }}
                onMomentumScrollEnd={handleScrollEnd}
                onScrollEndDrag={handleScrollEnd}
                style={activeHeight ? { height: activeHeight } : undefined}
            >
                {widgetItems.map((child, index) => (
                    <View
                        key={`mobile-widget-${index}`}
                        style={{ width: cardWidth }}
                    >
                        {child}
                    </View>
                ))}
            </ScrollView>
            <View className="flex-row justify-center gap-1.5 mt-2">
                {widgetItems.map((_, index) => (
                    <View
                        key={`mobile-widget-dot-${index}`}
                        className={`h-1.5 rounded-full ${activeIndex === index ? 'w-5 bg-[#1D3E90]' : 'w-1.5 bg-[#BFD0EA]'}`}
                    />
                ))}
            </View>
        </View>
    );
}

// ─────────────────────────────────────────────────────────────
// Main Dashboard
// ─────────────────────────────────────────────────────────────

export default function Dashboard() {
    const { isSmallPhone, width } = useResponsive();
    const currentMonth = new Date().getMonth() + 1;

    // ── Filter state ──
    const [leagues, setLeagues] = React.useState<League[]>([]);
    const [seasons, setSeasons] = React.useState<Season[]>([]);
    const [teams, setTeams] = React.useState<Team[]>([]);
    const [selectedLeague, setSelectedLeague] = React.useState<League | null>(null);
    const [selectedSeason, setSelectedSeason] = React.useState<Season | null>(null);
    const [selectedTeam, setSelectedTeam] = React.useState<Team | null>(null);
    const [selectedMonth, setSelectedMonth] = React.useState<number>(currentMonth);

    // ── Data state ──
    const [matches, setMatches] = React.useState<Match[]>([]);
    const [teamSeasonMatches, setTeamSeasonMatches] = React.useState<Match[]>([]);
    const [officialStandings, setOfficialStandings] = React.useState<StandingRow[]>([]);
    const [recentResults, setRecentResults] = React.useState<RecentResult[]>([]);
    const [summary, setSummary] = React.useState<DashboardSummary | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [loadingRecentResults, setLoadingRecentResults] = React.useState(true);
    const [loadingTeams, setLoadingTeams] = React.useState(false);
    const [loadingSummary, setLoadingSummary] = React.useState(true);
    const [loadingStandings, setLoadingStandings] = React.useState(false);
    const [resultsScrollX, setResultsScrollX] = React.useState(0);
    const [mobileResultsScrollX, setMobileResultsScrollX] = React.useState(0);
    const resultsScrollRef = React.useRef<ScrollView>(null);
    const mobileResultsScrollRef = React.useRef<ScrollView>(null);

    // ── Picker visibility ──
    const [showLeague, setShowLeague] = React.useState(false);
    const [showSeason, setShowSeason] = React.useState(false);
    const [showTeam, setShowTeam] = React.useState(false);
    const [showMonth, setShowMonth] = React.useState(false);

    // ── Main content tab (desktop): Meciuri & Rezultate vs. Clasament ──
    const [mainView, setMainView] = React.useState<'matches' | 'standings'>('matches');

    // ── Boot: încarcă ligile și KPI-urile ──
    React.useEffect(() => {
        // Încarcă ligile
        basketballApi.getLeagues().then((data) => {
            setLeagues(data);
            if (data.length > 0) handleLeagueSelect(data[0].id, data);
        }).catch(console.error);

        // Încarcă KPI-urile din dashboard summary
        setLoadingSummary(true);
        dashboardApi.getSummary()
            .then(setSummary)
            .catch((e) => {
                console.error('[dashboard summary]', e);
                setSummary(null);
            })
            .finally(() => setLoadingSummary(false));

        loadRecentResults();
    }, []);

    async function loadRecentResults() {
        setLoadingRecentResults(true);
        try {
            const savedTeams = await teamsApi.getTeams();
            const importableTeams = savedTeams.filter(hasFrbIds);
            const results = await Promise.all(
                importableTeams.map(async (team) => {
                    const teamMatches = await basketballApi.getMatches(
                        team.frbLeagueId,
                        team.frbSeasonId,
                        team.frbTeamId,
                        'all'
                    );

                    return filterFinished(teamMatches).map((match) => ({
                        ...match,
                        savedTeamName: team.name,
                    }));
                })
            );

            const uniqueResults = dedupeResults(results.flat());
            setRecentResults(sortDescending(uniqueResults).slice(0, 12));
        } catch (e) {
            console.error('[dashboard recent results]', e);
            setRecentResults([]);
        } finally {
            setLoadingRecentResults(false);
        }
    }

    async function handleLeagueSelect(leagueId: string, leagueList = leagues) {
        const league = leagueList.find((l) => l.id === leagueId) || null;
        setSelectedLeague(league);
        setSelectedSeason(null);
        setSelectedTeam(null);
        setMatches([]);
        setTeamSeasonMatches([]);
        setOfficialStandings([]);
        try {
            const data = await basketballApi.getSeasons(leagueId);
            setSeasons(data);
            if (data.length > 0) handleSeasonSelect(data[0].id, data, leagueId);
        } catch (e) { console.error(e); }
    }

    async function handleSeasonSelect(seasonId: string, seasonList = seasons, leagueId = selectedLeague?.id ?? '') {
        const season = seasonList.find((s) => s.id === seasonId) || null;
        setSelectedSeason(season);
        setSelectedTeam(null);
        setMatches([]);
        setTeamSeasonMatches([]);
        setOfficialStandings([]);
        if (!leagueId) return;
        setLoadingTeams(true);
        try {
            fetchLeagueStandings(leagueId, seasonId);
            const data = await basketballApi.getTeams(leagueId, seasonId);
            setTeams(data);
            if (data.length > 0) handleTeamSelect(data[0].id, data, leagueId, seasonId);
        } catch (e) { console.error(e); } finally { setLoadingTeams(false); }
    }

    async function handleTeamSelect(
        teamId: string,
        teamList = teams,
        leagueId = selectedLeague?.id ?? '',
        seasonId = selectedSeason?.id ?? ''
    ) {
        const team = teamList.find((t) => t.id === teamId) || null;
        setSelectedTeam(team);
        if (!leagueId || !seasonId) return;
        fetchMatches(leagueId, seasonId, teamId, selectedMonth);
        fetchTeamSeasonMatches(leagueId, seasonId, teamId);
    }

    async function fetchLeagueStandings(leagueId: string, seasonId: string) {
        setLoadingStandings(true);
        try {
            const data = await basketballApi.getStandings(leagueId, seasonId);
            setOfficialStandings(data);
        } catch (e) {
            console.error('[dashboard official standings]', e);
            setOfficialStandings([]);
        } finally {
            setLoadingStandings(false);
        }
    }

    async function fetchMatches(leagueId: string, seasonId: string, teamId: string, month: number) {
        setLoading(true);
        try {
            const data = await basketballApi.getMatches(leagueId, seasonId, teamId, month);
            setMatches(data);
        } catch (e) { console.error(e); } finally { setLoading(false); }
    }

    async function fetchTeamSeasonMatches(leagueId: string, seasonId: string, teamId: string) {
        try {
            const data = await basketballApi.getMatches(leagueId, seasonId, teamId, 'all');
            setTeamSeasonMatches(data);
        } catch (e) {
            console.error('[dashboard team standings]', e);
            setTeamSeasonMatches([]);
        }
    }

    async function handleMonthSelect(monthId: string) {
        const m = Number(monthId);
        setSelectedMonth(m);
        if (selectedLeague && selectedSeason && selectedTeam) {
            fetchMatches(selectedLeague.id, selectedSeason.id, selectedTeam.id, m);
        }
    }

    // ── Filtrare și sortare (fără date hardcodate) ──
    const scheduled = sortAscending(filterScheduled(matches));
    // Când e selectată o echipă din filtru, rezultatele recente arată doar meciurile acelei echipe
    // (recalculat dinamic din teamSeasonMatches, care se reîncarcă la fiecare schimbare de echipă).
    const finished = selectedTeam
        ? sortDescending(filterFinished(teamSeasonMatches)).slice(0, 12).map((match) => ({
              ...match,
              savedTeamName: selectedTeam.name,
          }))
        : recentResults;
    const selectedTeamStanding = React.useMemo(
        () => calculateTeamStanding(teamSeasonMatches, selectedTeam?.name, officialStandings),
        [teamSeasonMatches, selectedTeam?.name, officialStandings]
    );

    // KPI-uri din summary
    const expiringItems: ExpiringItem[] = summary?.expiringItems ?? [];
    const expiredCount = summary?.expiredVisasCount ?? 0;

    const scrollResults = (direction: 'left' | 'right') => {
        const nextX = Math.max(0, resultsScrollX + (direction === 'right' ? 420 : -420));
        resultsScrollRef.current?.scrollTo({ x: nextX, animated: true });
        setResultsScrollX(nextX);
    };

    const scrollMobileResults = (direction: 'left' | 'right') => {
        const step = Math.max(232, Math.min(width * 0.68, 300));
        const nextX = Math.max(0, mobileResultsScrollX + (direction === 'right' ? step : -step));
        mobileResultsScrollRef.current?.scrollTo({ x: nextX, animated: true });
        setMobileResultsScrollX(nextX);
    };

    const renderResultsFeed = () => (
        <View className="mt-8 lg:mt-10 mb-10 min-h-[160px]">
            <View className="flex-row items-center justify-between mb-4 px-1 lg:px-0">
                <View className="flex-row items-center gap-3">
                    <View className="w-9 h-9 rounded-[12px] items-center justify-center" style={{ backgroundColor: 'rgba(99,91,255,0.1)' }}>
                        <MaterialIcons name="emoji-events" size={18} color={dash.accent} />
                    </View>
                    <View>
                        <Text className="text-lg lg:text-xl font-bold tracking-tight" style={{ color: dash.ink }}>
                            Rezultate Recente
                        </Text>
                        {finished.length > 0 && (
                            <Text className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: dash.faint }}>
                                {finished.length} meciuri finalizate
                            </Text>
                        )}
                    </View>
                </View>
                {finished.length > 0 && (
                    <>
                        <View className="hidden lg:flex flex-row gap-2">
                            <Pressable
                                onPress={() => scrollResults('left')}
                                className="w-10 h-10 rounded-full bg-white border border-[#DCE6F5] items-center justify-center shadow-sm dash-nav-btn"
                            >
                                <MaterialIcons name="chevron-left" size={22} color="#0D2040" />
                            </Pressable>
                            <Pressable
                                onPress={() => scrollResults('right')}
                                className="w-10 h-10 rounded-full bg-[#0D2040] items-center justify-center shadow-sm dash-nav-btn"
                            >
                                <MaterialIcons name="chevron-right" size={22} color="#FFFFFF" />
                            </Pressable>
                        </View>
                        <View className="flex lg:hidden flex-row gap-2">
                            <Pressable
                                onPress={() => scrollMobileResults('left')}
                                className="w-9 h-9 rounded-full bg-white border border-[#DCE6F5] items-center justify-center shadow-sm dash-nav-btn"
                            >
                                <MaterialIcons name="chevron-left" size={20} color="#0D2040" />
                            </Pressable>
                            <Pressable
                                onPress={() => scrollMobileResults('right')}
                                className="w-9 h-9 rounded-full bg-[#0D2040] items-center justify-center shadow-sm dash-nav-btn"
                            >
                                <MaterialIcons name="chevron-right" size={20} color="#FFFFFF" />
                            </Pressable>
                        </View>
                    </>
                )}
            </View>

            {loadingRecentResults && (
                <LoadingState compact message="Se încarcă ultimele rezultate..." />
            )}

            {!loadingRecentResults && finished.length === 0 && (
                <EmptyState
                    title="Niciun rezultat final"
                    message="Echipele salvate nu au încă rezultate finale importate."
                    icon="emoji-events"
                />
            )}

            {!loadingRecentResults && finished.length > 0 && (
                <ScrollView
                    ref={resultsScrollRef}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    className="hidden lg:flex flex-row pb-4"
                    onScroll={(event) => setResultsScrollX(event.nativeEvent.contentOffset.x)}
                    scrollEventThrottle={16}
                >
                    <View className="flex-row gap-4 px-1 pb-2">
                        {finished.slice(0, 12).map((m, i) => (
                            <ResultCard
                                key={`res-desktop-${m.date}-${m.homeTeam}-${i}`}
                                m={m}
                                leagueName={selectedLeague?.name ?? ''}
                                isSmallPhone={isSmallPhone}
                            />
                        ))}
                    </View>
                </ScrollView>
            )}

            {!loadingRecentResults && finished.length > 0 && (
                <ScrollView
                    ref={mobileResultsScrollRef}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    className="flex lg:hidden pb-12"
                    onScroll={(event) => setMobileResultsScrollX(event.nativeEvent.contentOffset.x)}
                    scrollEventThrottle={16}
                >
                    <View className="flex-row gap-4 pb-4 px-1">
                        {finished.slice(0, 5).map((m, i) => (
                            <ResultCard
                                key={`res-mobile-${m.date}-${m.homeTeam}-${i}`}
                                m={m}
                                leagueName={selectedLeague?.name ?? ''}
                                isSmallPhone={isSmallPhone}
                            />
                        ))}
                    </View>
                </ScrollView>
            )}
        </View>
    );

    // ── Filter Bar ──
    const MatchFilterBar = () => (
        <FilterBar
            items={[
                {
                    key: 'league',
                    label: 'League',
                    value: selectedLeague?.name ?? 'Ligă',
                    onPress: () => setShowLeague(true),
                },
                {
                    key: 'season',
                    label: 'Season',
                    value: selectedSeason?.text ?? 'Sezon',
                    onPress: () => setShowSeason(true),
                },
                {
                    key: 'team',
                    label: 'Team',
                    value: selectedTeam?.name ?? 'Echipă',
                    loading: loadingTeams,
                    onPress: () => setShowTeam(true),
                },
                {
                    key: 'month',
                    label: 'Month',
                    value: MONTHS.find((m) => m.id === String(selectedMonth))?.label ?? 'Lună',
                    active: true,
                    onPress: () => setShowMonth(true),
                },
            ]}
        />
    );

    return (
        <ScrollView
            className="flex-1 bg-[#F5F7FB]"
            contentContainerStyle={{ paddingBottom: 140 }}
            showsVerticalScrollIndicator={false}
            horizontal={false}
        >
            <View className="w-full px-3 sm:px-4 lg:px-6 xl:px-8 bg-[#F5F7FB] pt-3 lg:pt-5 relative overflow-hidden">
                <View pointerEvents="none" className="absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(15,23,42,0.022)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.02)_1px,transparent_1px)] [background-size:36px_36px]" />
                <View pointerEvents="none" className="absolute -top-32 -left-16 h-[380px] w-[380px] rounded-full opacity-70" style={{ backgroundImage: 'radial-gradient(circle, rgba(99,91,255,0.1) 0%, rgba(99,91,255,0) 68%)' } as any} />
                <View pointerEvents="none" className="absolute -top-20 right-0 h-[420px] w-[420px] rounded-full opacity-70" style={{ backgroundImage: 'radial-gradient(circle, rgba(37,99,235,0.09) 0%, rgba(37,99,235,0) 66%)' } as any} />

                {/* Pickers */}
                <DropdownPicker visible={showLeague} title="Alege Liga" icon="sports-basketball" selectedId={selectedLeague?.id} items={leagues.map((l) => ({ id: l.id, label: l.name }))} onSelect={(id) => handleLeagueSelect(id)} onClose={() => setShowLeague(false)} />
                <DropdownPicker visible={showSeason} title="Alege Sezonul" icon="date-range" selectedId={selectedSeason?.id} items={seasons.map((s) => ({ id: s.id, label: s.text }))} onSelect={(id) => handleSeasonSelect(id)} onClose={() => setShowSeason(false)} />
                <DropdownPicker visible={showTeam} title="Alege Echipa" icon="groups" selectedId={selectedTeam?.id} items={teams.map((t) => ({ id: t.id, label: t.name }))} onSelect={(id) => handleTeamSelect(id)} onClose={() => setShowTeam(false)} />
                <DropdownPicker visible={showMonth} title="Alege Luna" icon="calendar-today" selectedId={String(selectedMonth)} items={MONTHS} onSelect={handleMonthSelect} onClose={() => setShowMonth(false)} />

                <View
                    className="hidden lg:flex rounded-[24px] p-6 mb-6 overflow-hidden relative dash-fade-in"
                    style={{ backgroundImage: dash.gradients.heroInk, backgroundColor: dash.ink } as any}
                >
                    <View pointerEvents="none" className="absolute inset-0 opacity-90 [background-image:linear-gradient(rgba(255,255,255,0.028)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] [background-size:30px_30px]" />
                    <View pointerEvents="none" className="absolute -top-24 -left-10 h-[300px] w-[300px] rounded-full opacity-80" style={{ backgroundImage: 'radial-gradient(circle, rgba(99,91,255,0.32) 0%, rgba(99,91,255,0) 66%)' } as any} />
                    <View pointerEvents="none" className="absolute -bottom-28 right-10 h-[300px] w-[300px] rounded-full opacity-70" style={{ backgroundImage: 'radial-gradient(circle, rgba(37,99,235,0.28) 0%, rgba(37,99,235,0) 68%)' } as any} />
                    <View className="relative flex-row items-center justify-between">
                        <View className="flex-1 pr-6">
                            <View className="self-start flex-row items-center gap-2 rounded-full px-3 py-1.5 mb-3.5 border" style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.14)' }}>
                                <View className="w-1.5 h-1.5 rounded-full dash-pulse-dot" style={{ backgroundColor: '#34D399' }} />
                                <Text className="text-white/90 text-[10px] font-bold uppercase tracking-[0.14em]">Basketball Operations · Live</Text>
                            </View>
                            <Text className="text-white text-[30px] font-bold tracking-tight leading-none">Dashboard Admin</Text>
                            <View className="flex-row items-center gap-4 mt-3 flex-wrap">
                                <View className="flex-row items-center gap-1.5">
                                    <MaterialIcons name="event" size={14} color="rgba(255,255,255,0.55)" />
                                    <Text className="text-white/70 text-[13px] font-semibold">{scheduled.length} meciuri viitoare</Text>
                                </View>
                                <View className="w-1 h-1 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.25)' }} />
                                <View className="flex-row items-center gap-1.5">
                                    <MaterialIcons name="emoji-events" size={14} color="rgba(255,255,255,0.55)" />
                                    <Text className="text-white/70 text-[13px] font-semibold">{finished.length} rezultate recente</Text>
                                </View>
                                <View className="w-1 h-1 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.25)' }} />
                                <View className="flex-row items-center gap-1.5">
                                    <MaterialIcons name="warning" size={14} color={expiredCount > 0 ? '#FCA5A5' : 'rgba(255,255,255,0.55)'} />
                                    <Text className="text-[13px] font-semibold" style={{ color: expiredCount > 0 ? '#FCA5A5' : 'rgba(255,255,255,0.7)' }}>{expiredCount} vize expirate</Text>
                                </View>
                            </View>
                        </View>
                        <View className="flex-row gap-3">
                            <View className="rounded-[16px] px-4 py-3 min-w-[140px] border" style={{ backgroundColor: 'rgba(255,255,255,0.07)', borderColor: 'rgba(255,255,255,0.12)' }}>
                                <View className="flex-row items-center gap-1.5 mb-1.5">
                                    <MaterialIcons name="groups" size={13} color="rgba(255,255,255,0.5)" />
                                    <Text className="text-white/50 text-[9px] font-bold uppercase tracking-[0.1em]">Echipă curentă</Text>
                                </View>
                                <Text className="text-white text-[15px] font-bold" numberOfLines={1}>
                                    {selectedTeam?.name ?? 'Se încarcă...'}
                                </Text>
                            </View>
                            <View className="rounded-[16px] px-4 py-3 min-w-[112px] border" style={{ backgroundColor: 'rgba(255,255,255,0.07)', borderColor: 'rgba(255,255,255,0.12)' }}>
                                <View className="flex-row items-center gap-1.5 mb-1.5">
                                    <MaterialIcons name="calendar-today" size={13} color="rgba(255,255,255,0.5)" />
                                    <Text className="text-white/50 text-[9px] font-bold uppercase tracking-[0.1em]">Luna</Text>
                                </View>
                                <Text className="text-white text-[15px] font-bold">
                                    {MONTHS.find((m) => m.id === String(selectedMonth))?.label ?? 'Lună'}
                                </Text>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Mobile: compact swipe stack for the dense dashboard widgets */}
                <MobileWidgetStack>
                    {[
                        <ClubHealthBlock
                            key="health"
                            attendanceRate={summary?.attendanceRate ?? null}
                            presentCount={summary?.presentCount ?? 0}
                            totalRecords={summary?.totalAttendanceRecords ?? 0}
                            loading={loadingSummary}
                            isSmallPhone={isSmallPhone}
                        />,
                        <TeamStandingWidget
                            key="standing"
                            teamName={selectedTeam?.name}
                            standing={selectedTeamStanding}
                            loading={loadingStandings}
                        />,
                        <RiskManagementBlock
                            key="risk"
                            expiringItems={expiringItems}
                            expiredCount={expiredCount}
                            loading={loadingSummary}
                        />,
                    ]}
                </MobileWidgetStack>

                {/* Desktop: KPI Cards Row — date reale */}
                <View className="hidden lg:flex dash-stagger flex-row flex-wrap justify-between gap-4 mb-6 mt-1">
                    <FinancialSummaryCard
                        income={summary?.monthlyIncome ?? 0}
                        expense={summary?.monthlyExpense ?? 0}
                        profit={summary?.monthlyProfit ?? 0}
                        profitChangePercent={summary?.profitChangePercent ?? null}
                        loading={loadingSummary}
                    />
                    <StatCard
                        icon="people"
                        label="JUCĂTORI ACTIVI"
                        value={loadingSummary ? '—' : String(summary?.activePlayerCount ?? 0)}
                        detail={loadingSummary ? '—' : `${summary?.teamCount ?? 0} echipe`}
                        tone="cyan"
                        loading={loadingSummary}
                        trend={
                            !loadingSummary && summary?.playerCountChange
                                ? {
                                      direction: summary.playerCountChange > 0 ? 'up' : 'down',
                                      label: `${summary.playerCountChange > 0 ? '+' : ''}${summary.playerCountChange} vs. luna trecută`,
                                  }
                                : undefined
                        }
                    />
                    <View
                        className="dash-card dash-card-hover flex-[1.3] min-w-[300px] rounded-[18px] p-4 border flex-row items-center gap-3 overflow-hidden relative dash-fade-in"
                        style={{ backgroundColor: dash.surface, borderColor: dash.hairline, ...dash.shadow.card }}
                    >
                        <View pointerEvents="none" className="absolute top-0 left-0 right-0 h-[3px]" style={{ backgroundImage: 'linear-gradient(90deg, #635BFF, #2563EB)' } as any} />
                        <View pointerEvents="none" className="absolute inset-0" style={{ backgroundImage: dash.gradients.cardPurple } as any} />
                        <AttendanceRing
                            rate={summary?.attendanceRate ?? 0}
                            loading={loadingSummary}
                            size={60}
                            strokeWidth={6}
                        />
                        <View className="flex-1 relative">
                            <View className="flex-row items-center justify-between mb-1">
                                <Text className="text-[14px] font-bold tracking-tight" style={{ color: dash.ink }}>Prezență Globală</Text>
                                {!loadingSummary && summary?.attendanceRate != null ? (() => {
                                    const r = summary.attendanceRate;
                                    const t = r >= 80 ? dash.trend.up : r >= 60 ? dash.trend.flat : dash.trend.down;
                                    const lbl = r >= 80 ? 'OPTIMAL' : r >= 60 ? 'MEDIU' : 'SCĂZUT';
                                    return (
                                        <View className="flex-row items-center gap-1 px-2 py-1 rounded-full" style={{ backgroundColor: t.bg }}>
                                            <MaterialIcons name={t.icon} size={12} color={t.fg} />
                                            <Text className="text-[9px] font-bold tracking-wide" style={{ color: t.fg }}>{lbl}</Text>
                                        </View>
                                    );
                                })() : null}
                            </View>
                            {loadingSummary ? (
                                <View className="gap-2 mt-1">
                                    <SkeletonBlock width="80%" height={12} />
                                    <SkeletonBlock width="55%" height={12} />
                                </View>
                            ) : (
                                <>
                                    <Text className="text-[12.5px] leading-relaxed pr-2" style={{ color: dash.muted }}>
                                        {summary?.pendingPaymentsCount
                                            ? `${summary.pendingPaymentsCount} plăți restante · `
                                            : ''}
                                        {summary?.expiredVisasCount
                                            ? `${summary.expiredVisasCount} vize expirate`
                                            : 'Fără vize expirate'}
                                    </Text>
                                    <View className="flex-row items-center gap-4 mt-3">
                                        <View className="flex-row items-center gap-1.5">
                                            <View className="w-2 h-2 rounded-full" style={{ backgroundColor: dash.accent }} />
                                            <Text className="text-[11px] font-semibold" style={{ color: dash.muted }}>
                                                Prezenți: {summary?.presentCount ?? 0}
                                            </Text>
                                        </View>
                                        <View className="flex-row items-center gap-1.5">
                                            <View className="w-2 h-2 rounded-full" style={{ backgroundColor: dash.line }} />
                                            <Text className="text-[11px] font-semibold" style={{ color: dash.muted }}>
                                                Absenți: {Math.max(0, (summary?.totalAttendanceRecords ?? 0) - (summary?.presentCount ?? 0))}
                                            </Text>
                                        </View>
                                        {summary?.attendanceChangePoints != null ? (() => {
                                            const points = summary.attendanceChangePoints as number;
                                            const t = points > 0 ? dash.trend.up : points < 0 ? dash.trend.down : dash.trend.flat;
                                            return (
                                                <View className="flex-row items-center gap-0.5">
                                                    <MaterialIcons name={t.icon} size={11} color={t.fg} />
                                                    <Text className="text-[10px] font-bold" style={{ color: t.fg }}>
                                                        {points > 0 ? '+' : ''}{points}pp
                                                    </Text>
                                                </View>
                                            );
                                        })() : null}
                                    </View>
                                </>
                            )}
                        </View>
                    </View>
                    <View className="flex-[0.9] min-w-[240px]">
                        <RiskManagementBlock
                            expiringItems={expiringItems}
                            expiredCount={expiredCount}
                            loading={loadingSummary}
                            compact
                            showHeader={false}
                        />
                    </View>
                </View>

                {/* Main Layout */}
                <View className="w-full mb-10 mt-2 lg:mt-4">

                    {/* Tab switcher (Desktop): Meciuri & Rezultate vs. Clasament */}
                    <View className="hidden lg:flex flex-row gap-2 mb-5">
                        <Pressable
                            onPress={() => setMainView('matches')}
                            className="flex-row items-center gap-2 h-10 px-4 rounded-[12px] border transition-all duration-200"
                            style={{
                                backgroundColor: mainView === 'matches' ? dash.ink : dash.surface,
                                borderColor: mainView === 'matches' ? dash.ink : dash.hairline,
                            }}
                        >
                            <MaterialIcons name="sports-basketball" size={16} color={mainView === 'matches' ? '#FFFFFF' : dash.faint} />
                            <Text className="text-[13px] font-semibold" style={{ color: mainView === 'matches' ? '#FFFFFF' : dash.inkSoft }}>
                                Meciuri &amp; Rezultate
                            </Text>
                        </Pressable>
                        <Pressable
                            onPress={() => setMainView('standings')}
                            className="flex-row items-center gap-2 h-10 px-4 rounded-[12px] border transition-all duration-200"
                            style={{
                                backgroundColor: mainView === 'standings' ? dash.ink : dash.surface,
                                borderColor: mainView === 'standings' ? dash.ink : dash.hairline,
                            }}
                        >
                            <MaterialIcons name="leaderboard" size={16} color={mainView === 'standings' ? '#FFFFFF' : dash.faint} />
                            <Text className="text-[13px] font-semibold" style={{ color: mainView === 'standings' ? '#FFFFFF' : dash.inkSoft }}>
                                Clasament
                            </Text>
                        </Pressable>
                    </View>

                    {mainView === 'matches' && (
                        <View className="w-full min-w-0">
                            <View className="flex-row justify-between items-center mb-4 px-1 lg:px-0 flex-wrap gap-2 relative z-10">
                                <View className="flex-row items-center gap-3">
                                    <View className="w-9 h-9 rounded-[12px] items-center justify-center" style={{ backgroundColor: 'rgba(14,165,233,0.1)' }}>
                                        <MaterialIcons name="sports-basketball" size={18} color={dash.accentSky} />
                                    </View>
                                    <View>
                                        <Text className="text-lg lg:text-xl font-bold tracking-tight" style={{ color: dash.ink }}>
                                            Meciuri Viitoare
                                        </Text>
                                        <Text className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: dash.faint }}>
                                            {scheduled.length} programate
                                        </Text>
                                    </View>
                                </View>
                                <MatchFilterBar />
                            </View>

                            {loading && (
                                <LoadingState message="Se încarcă meciurile..." />
                            )}

                            {!loading && matches.length === 0 && selectedTeam && (
                                <EmptyState
                                    title="Niciun meci găsit"
                                    message="Nu există meciuri pentru echipa selectată în această lună."
                                    icon="sports-basketball"
                                />
                            )}

                            {!loading && scheduled.length === 0 && matches.length > 0 && (
                                <View className="mb-4">
                                    <EmptyState
                                        title="Niciun meci programat"
                                        message="Există rezultate/importuri în lună, dar nimic viitor în calendar."
                                        icon="event-available"
                                    />
                                </View>
                            )}

                            {!loading && scheduled.length > 0 && (
                                <View className="dash-stagger gap-4 w-full">
                                    {scheduled.slice(0, 5).map((game, i) => (
                                        <ScheduledMatchCard
                                            key={`scheduled-${game.date}-${game.homeTeam}-${i}`}
                                            game={game}
                                            leagueName={selectedLeague?.name ?? ''}
                                        />
                                    ))}
                                </View>
                            )}

                            {renderResultsFeed()}
                        </View>
                    )}

                    {mainView === 'standings' && (
                        <View className="hidden lg:flex w-full max-w-[640px]">
                            <TeamStandingWidget
                                teamName={selectedTeam?.name}
                                standing={selectedTeamStanding}
                                loading={loadingStandings}
                            />
                        </View>
                    )}
                </View>

            </View>
        </ScrollView>
    );
}
