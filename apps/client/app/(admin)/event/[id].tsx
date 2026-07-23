import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from '@/src/web/reactNative';
import { useLocalSearchParams, useRouter } from '@/src/web/expoRouter';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Users,
  MapPin,
  Zap,
  Trophy,
  Dumbbell,
  ShieldCheck,
  Settings,
  CheckCircle2,
  Trash2,
} from 'lucide-react';
import { eventsApi, CalendarEvent } from '../../../services/eventsApi';
import { teamsApi, Team } from '../../../services/teamsApi';
import { useHeader, DEFAULT_SEARCH_PLACEHOLDER } from '../../../components/HeaderContext';

// ─── Colour helpers ──────────────────────────────────────────────────────────

const TYPE_META: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  training: {
    label: 'Training',
    color: 'var(--c-brand-fg)',
    bg: 'var(--c-surface-tint)',
    icon: <Dumbbell size={14} color="var(--c-brand-fg)" />,
  },
  match: {
    label: 'Match',
    color: '#7C3AED',
    bg: 'var(--c-surface-tint)',
    icon: <Trophy size={14} color="#7C3AED" />,
  },
  camp: {
    label: 'Camp',
    color: '#0891B2',
    bg: 'var(--c-surface-tint)',
    icon: <Zap size={14} color="#0891B2" />,
  },
  admin: {
    label: 'Admin',
    color: 'var(--c-success-fg)',
    bg: 'var(--c-success-bg)',
    icon: <Settings size={14} color="var(--c-success-fg)" />,
  },
};

function getTypeMeta(type: string) {
  return TYPE_META[type] ?? TYPE_META.training;
}

// ─── Duration helper ──────────────────────────────────────────────────────────

function durationLabel(startIso: string, endIso: string): string {
  const diffMs = new Date(endIso).getTime() - new Date(startIso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const InfoRow = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) => (
  <View style={{ marginBottom: 20 }}>
    <Text
      style={{
        fontSize: 10,
        fontWeight: '900',
        color: 'var(--c-faint)',
        textTransform: 'uppercase',
        letterSpacing: 1.2,
        marginBottom: 6,
        marginLeft: 2,
      }}
    >
      {label}
    </Text>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 12,
          backgroundColor: 'var(--c-surface-3)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </View>
      <Text
        style={{
          fontSize: 16,
          fontWeight: '800',
          color: 'var(--c-ink-soft)',
          flexShrink: 1,
        }}
      >
        {value}
      </Text>
    </View>
  </View>
);

const SectionCard = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <View
    style={{
      backgroundColor: 'var(--c-surface)',
      borderRadius: 28,
      padding: 24,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: 'var(--c-surface-3)',
      shadowColor: 'var(--c-ink-strong)',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 10,
      elevation: 2,
    }}
  >
    <Text
      style={{
        fontSize: 18,
        fontWeight: '900',
        color: 'var(--c-brand-fg)',
        marginBottom: 20,
      }}
    >
      {title}
    </Text>
    {children}
  </View>
);

// Team card in Target Audience
const TeamCard = ({
  team,
  playerCount,
}: {
  team: Team;
  playerCount: number;
}) => (
  <View
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'var(--c-surface-2)',
      borderRadius: 18,
      padding: 16,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: 'var(--c-border)',
    }}
  >
    {/* Team avatar */}
    <View
      style={{
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: 'var(--c-surface-tint)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
      }}
    >
      <ShieldCheck size={20} color="var(--c-brand-fg)" />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 15, fontWeight: '800', color: 'var(--c-ink-soft)', marginBottom: 2 }}>
        {team.name}
      </Text>
      <Text
        style={{
          fontSize: 11,
          fontWeight: '700',
          color: 'var(--c-muted)',
          textTransform: 'uppercase',
          letterSpacing: 0.8,
        }}
      >
        {team.leagueName}
      </Text>
    </View>
    <View style={{ alignItems: 'flex-end' }}>
      <Text style={{ fontSize: 20, fontWeight: '900', color: 'var(--c-brand-fg)' }}>
        {playerCount}
      </Text>
      <Text
        style={{
          fontSize: 9,
          fontWeight: '800',
          color: 'var(--c-faint)',
          textTransform: 'uppercase',
          letterSpacing: 0.8,
        }}
      >
        Players
      </Text>
    </View>
  </View>
);

// ─── Main screen ───────────────────────────────────────────────────────────────

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const [event, setEvent] = useState<CalendarEvent | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamPlayers, setTeamPlayers] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const { setSearchPlaceholder, setHeaderActions, setMobileFab } = useHeader();

  // Clear header actions on mount and unmount
  useEffect(() => {
    setSearchPlaceholder('Event details...');
    setHeaderActions(null);
    setMobileFab(null);
    return () => {
      setSearchPlaceholder(DEFAULT_SEARCH_PLACEHOLDER);
      setHeaderActions(null);
      setMobileFab(null);
    };
  }, [setHeaderActions, setMobileFab, setSearchPlaceholder]);

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const eventId = Number(id);
      const [eventData, allTeams] = await Promise.all([
        eventsApi.getEventById(eventId),
        teamsApi.getTeams(),
      ]);
      setEvent(eventData);
      setTeams(allTeams);

      // If there is a team attached, load its player count
      if (eventData.teamId) {
        const players = await teamsApi.getTeamPlayers(eventData.teamId);
        setTeamPlayers({ [eventData.teamId]: players.length });
      }
    } catch (e) {
      console.error('Event detail load error:', e);
      Alert.alert('Error', 'Could not load event details.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const navigateAfterDelete = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/admin/schedule' as any);
  }, [router]);

  const confirmDeleteEvent = useCallback(async () => {
    if (!event || deleting) return;

    try {
      setDeleting(true);
      await eventsApi.deleteEvent(event.id);

      Alert.alert(
        'Success',
        'Event deleted successfully.',
        [{ text: 'OK', onPress: navigateAfterDelete }],
        { cancelable: false }
      );
    } catch (error) {
      console.error('Delete event error:', error);
      Alert.alert('Delete failed', 'Could not delete this event. Please try again.');
    } finally {
      setDeleting(false);
    }
  }, [event, deleting, navigateAfterDelete]);

  const handleDeleteEventPress = useCallback(() => {
    if (deleting) return;

    Alert.alert(
      'Delete Event',
      'Are you sure you want to delete this event?\n\nThis action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete Event', style: 'destructive', onPress: () => void confirmDeleteEvent() },
      ]
    );
  }, [deleting, confirmDeleteEvent]);

  // ── Derived values ──────────────────────────────────────────────────────────

  const isUpcoming = event ? new Date(event.startTime) > new Date() : false;
  const typeMeta = event ? getTypeMeta(event.type) : getTypeMeta('training');

  const startDate = event
    ? new Date(event.startTime).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '';

  const startTime = event
    ? new Date(event.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  const endTime = event
    ? new Date(event.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  const duration = event ? durationLabel(event.startTime, event.endTime) : '';

  const teamForEvent = event?.teamId
    ? teams.find((t) => t.id === event.teamId) ?? null
    : null;

  // ── Loading skeleton ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--c-surface-2)',
        }}
      >
        <ActivityIndicator size="large" color="var(--c-brand-fg)" />
        <Text
          style={{
            marginTop: 14,
            color: 'var(--c-faint)',
            fontWeight: '700',
            fontSize: 13,
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          Loading event...
        </Text>
      </View>
    );
  }

  if (!event) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--c-surface-2)',
          padding: 32,
        }}
      >
        <Text
          style={{
            fontSize: 18,
            fontWeight: '800',
            color: 'var(--c-ink-soft)',
            marginBottom: 12,
            textAlign: 'center',
          }}
        >
          Event not found
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            backgroundColor: 'var(--c-brand-surface)',
            paddingHorizontal: 24,
            paddingVertical: 12,
            borderRadius: 20,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '800' }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────────────

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: 'var(--c-surface-2)' }}
      contentContainerStyle={{
        padding: isDesktop ? 32 : 20,
        paddingBottom: 120,
        maxWidth: 900,
        alignSelf: 'center',
        width: '100%',
      }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Back Button ──────────────────────────────────────────────────── */}
      <TouchableOpacity
        onPress={() => router.back()}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginBottom: 24,
          alignSelf: 'flex-start',
        }}
        activeOpacity={0.7}
      >
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: 'var(--c-surface)',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: 'var(--c-border)',
            shadowColor: 'var(--c-ink-strong)',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.06,
            shadowRadius: 4,
          }}
        >
          <ArrowLeft size={18} color="var(--c-ink-soft)" />
        </View>
        <Text
          style={{
            fontSize: 13,
            fontWeight: '700',
            color: 'var(--c-muted)',
            textTransform: 'uppercase',
            letterSpacing: 0.8,
          }}
        >
          Schedule
        </Text>
      </TouchableOpacity>

      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <View style={{ marginBottom: 28 }}>
        {/* Tags row */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {/* Status badge */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 14,
              paddingVertical: 6,
              borderRadius: 20,
              backgroundColor: isUpcoming ? 'var(--c-brand-surface)' : 'var(--c-surface-3)',
            }}
          >
            {isUpcoming ? (
              <Clock size={12} color="#fff" />
            ) : (
              <CheckCircle2 size={12} color="var(--c-muted)" />
            )}
            <Text
              style={{
                fontSize: 11,
                fontWeight: '900',
                color: isUpcoming ? '#fff' : 'var(--c-muted)',
                textTransform: 'uppercase',
                letterSpacing: 0.8,
              }}
            >
              {isUpcoming ? 'Upcoming' : 'Completed'}
            </Text>
          </View>

          {/* Type badge */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 14,
              paddingVertical: 6,
              borderRadius: 20,
              backgroundColor: typeMeta.bg,
            }}
          >
            {typeMeta.icon}
            <Text
              style={{
                fontSize: 11,
                fontWeight: '900',
                color: typeMeta.color,
                textTransform: 'uppercase',
                letterSpacing: 0.8,
              }}
            >
              {typeMeta.label}
            </Text>
          </View>
        </View>

        {/* Title */}
        <Text
          style={{
            fontSize: isDesktop ? 38 : 30,
            fontWeight: '900',
            color: 'var(--c-brand-fg)',
            lineHeight: isDesktop ? 46 : 38,
            letterSpacing: -0.5,
          }}
        >
          {event.title}
        </Text>

        {/* Optional description */}
        {event.description ? (
          <Text
            style={{
              fontSize: 15,
              color: 'var(--c-muted)',
              fontWeight: '500',
              marginTop: 10,
              lineHeight: 22,
            }}
          >
            {event.description}
          </Text>
        ) : null}
      </View>

      {/* ── Cards grid (desktop: 2 columns, mobile: stacked) ─────────────── */}
      <View
        style={
          isDesktop
            ? { flexDirection: 'row', gap: 16, alignItems: 'flex-start' }
            : {}
        }
      >
        {/* LEFT column */}
        <View style={isDesktop ? { flex: 1 } : {}}>

          {/* Event Summary Card */}
          <SectionCard title="Event Summary">
            <InfoRow
              icon={<Calendar size={18} color="var(--c-brand-fg)" />}
              label="Date"
              value={startDate}
            />
            <InfoRow
              icon={<Clock size={18} color="var(--c-brand-fg)" />}
              label="Time & Duration"
              value={`${startTime} – ${endTime}  (${duration})`}
            />
            {/* Number of players, sourced from team players if available */}
            <InfoRow
              icon={<Users size={18} color="var(--c-brand-fg)" />}
              label="Expected Players"
              value={
                event.teamId && teamPlayers[event.teamId] !== undefined
                  ? `${teamPlayers[event.teamId]} Players`
                  : 'All Teams'
              }
            />
          </SectionCard>

          {/* Location Card */}
          <SectionCard title="Location">
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  backgroundColor: 'var(--c-surface-tint)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 2,
                }}
              >
                <MapPin size={20} color="var(--c-brand-fg)" />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 17,
                    fontWeight: '800',
                    color: 'var(--c-ink-soft)',
                    marginBottom: 4,
                  }}
                >
                  {event.location || 'Main Arena'}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: 'var(--c-faint)',
                    textTransform: 'uppercase',
                    letterSpacing: 0.6,
                  }}
                >
                  {event.teamName ? `${event.teamName} home venue` : 'Club venue'}
                </Text>
              </View>
            </View>

            {/* Map placeholder strip */}
            <View
              style={{
                marginTop: 16,
                height: 110,
                borderRadius: 18,
                backgroundColor: 'var(--c-surface-3)',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: 'var(--c-border)',
              }}
            >
              {/* Simple placeholder that feels like a map */}
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  opacity: 0.08,
                }}
              >
                {/* Grid lines */}
                {[...Array(6)].map((_, i) => (
                  <View
                    key={`h${i}`}
                    style={{
                      position: 'absolute',
                      top: `${i * 20}%`,
                      left: 0,
                      right: 0,
                      height: 1,
                      backgroundColor: 'var(--c-brand-surface)',
                    }}
                  />
                ))}
                {[...Array(10)].map((_, i) => (
                  <View
                    key={`v${i}`}
                    style={{
                      position: 'absolute',
                      left: `${i * 12}%`,
                      top: 0,
                      bottom: 0,
                      width: 1,
                      backgroundColor: 'var(--c-brand-surface)',
                    }}
                  />
                ))}
              </View>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: 'var(--c-brand-surface)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: 'var(--c-brand-fg)',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.4,
                  shadowRadius: 8,
                }}
              >
                <MapPin size={18} color="#fff" />
              </View>
            </View>
          </SectionCard>
        </View>

        {/* RIGHT column */}
        <View style={isDesktop ? { flex: 1 } : {}}>

          {/* Target Audience Card */}
          <SectionCard title="Target Audience">
            <Text
              style={{
                fontSize: 12,
                fontWeight: '600',
                color: 'var(--c-faint)',
                marginBottom: 16,
                marginTop: -10,
              }}
            >
              Eligible teams and player groups for this session
            </Text>

            {teamForEvent ? (
              <TeamCard
                team={teamForEvent}
                playerCount={
                  event.teamId && teamPlayers[event.teamId] !== undefined
                    ? teamPlayers[event.teamId]
                    : 0
                }
              />
            ) : (
              /* No team assigned — show all teams */
              teams.length > 0 ? (
                teams.map((t) => (
                  <TeamCard
                    key={t.id}
                    team={t}
                    playerCount={teamPlayers[t.id] ?? 0}
                  />
                ))
              ) : (
                <View
                  style={{
                    padding: 24,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Users size={36} color="var(--c-border-strong)" />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '700',
                      color: 'var(--c-faint)',
                      marginTop: 10,
                      textTransform: 'uppercase',
                      letterSpacing: 0.6,
                    }}
                  >
                    Open to all
                  </Text>
                </View>
              )
            )}
          </SectionCard>

          {/* Coach Info (subtle) */}
          {event.coachName ? (
            <View
              style={{
                backgroundColor: 'var(--c-surface)',
                borderRadius: 20,
                padding: 18,
                borderWidth: 1,
                borderColor: 'var(--c-surface-3)',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                shadowColor: 'var(--c-ink-strong)',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.04,
                shadowRadius: 6,
              }}
            >
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  backgroundColor: 'var(--c-brand-surface)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}
                >
                  {event.coachName.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View>
                <Text
                  style={{
                    fontSize: 9,
                    fontWeight: '900',
                    color: 'var(--c-faint)',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    marginBottom: 3,
                  }}
                >
                  Assigned Coach
                </Text>
                <Text
                  style={{ fontSize: 15, fontWeight: '800', color: 'var(--c-ink-soft)' }}
                >
                  {event.coachName}
                </Text>
              </View>
            </View>
          ) : null}

          {/* Destructive action */}
          <TouchableOpacity
            onPress={handleDeleteEventPress}
            disabled={deleting}
            activeOpacity={0.85}
            style={{
              marginTop: 16,
              backgroundColor: deleting ? 'var(--c-danger-bg)' : 'var(--c-danger-bg)',
              borderWidth: 1,
              borderColor: '#FCA5A5',
              borderRadius: 20,
              paddingVertical: 14,
              paddingHorizontal: 16,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: deleting ? 0.7 : 1,
              gap: 8,
            }}
          >
            {deleting ? (
              <ActivityIndicator size="small" color="var(--c-danger)" />
            ) : (
              <Trash2 size={16} color="var(--c-danger)" />
            )}
            <Text
              style={{
                color: 'var(--c-danger)',
                fontWeight: '900',
                fontSize: 13,
                textTransform: 'uppercase',
                letterSpacing: 0.8,
              }}
            >
              {deleting ? 'Deleting...' : 'Delete Event'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}
