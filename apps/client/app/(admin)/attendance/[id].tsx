import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Image, StyleSheet } from '@/src/web/reactNative';
import { useLocalSearchParams, useRouter } from '@/src/web/expoRouter';
import {
  Calendar,
  Clock,
  MapPin,
  Search,
  ChevronLeft,
  UserCheck,
  MessageSquare
} from 'lucide-react';
import { eventsApi, CalendarEvent } from '../../../services/eventsApi';
import { teamsApi, Team, Player } from '../../../services/teamsApi';
import { useResponsive } from '../../../hooks/useResponsive';

type TabFilter = 'All Players' | 'Starters' | 'Injured Reserve';
type AttendanceStatus = 'present' | 'absent' | 'medical';

const TAB_LABELS: Record<TabFilter, string> = {
  'All Players': 'Toți jucătorii',
  Starters: 'Disponibili',
  'Injured Reserve': 'Indisponibili',
};

export default function AttendanceScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { isMobile, isSmallPhone } = useResponsive();

  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<CalendarEvent | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [players, setPlayers] = useState<(Omit<Player, 'status'> & { status: AttendanceStatus | null; note: string })[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabFilter>('All Players');

  const [hasChanges, setHasChanges] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function loadData() {
      if (!id) return;
      try {
        setLoading(true);
        const eventId = parseInt(id as string, 10);

        const eventDetails = await eventsApi.getEventById(eventId);
        setEvent(eventDetails);

        if (eventDetails.teamId) {
          const teamDetails = await teamsApi.getTeamById(eventDetails.teamId);
          setTeam(teamDetails);

          const [roster, attendanceData] = await Promise.all([
            teamsApi.getTeamPlayers(eventDetails.teamId),
            eventsApi.getEventAttendance(eventId)
          ]);

          const mappedPlayers = roster.map(p => {
            const record = attendanceData.find(a => a.playerId === p.id);
            let mappedStatus: AttendanceStatus | null = null;
            if (record?.status === 'present') mappedStatus = 'present';
            if (record?.status === 'absent') mappedStatus = 'absent';
            if (record?.status === 'medical' || record?.status === 'excused') mappedStatus = 'medical';
            return { ...p, status: mappedStatus, note: record?.note ?? '' };
          });
          setPlayers(mappedPlayers);
        }
      } catch (error) {
        console.error('Failed to load attendance screen data', error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [id]);

  const updatePlayerStatus = (playerId: number, newStatus: AttendanceStatus) => {
    setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, status: newStatus } : p));
    setHasChanges(true);
  };

  const updatePlayerNote = (playerId: number, note: string) => {
    setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, note } : p));
    setHasChanges(true);
  };

  const submitAttendance = async () => {
    if (!event) return;
    setIsSubmitting(true);
    try {
      const payload = players.map(p => ({
        playerId: p.id,
        status: p.status || 'pending',
        note: p.note.trim() ? p.note.trim() : null,
      }));
      await eventsApi.updateEventAttendance(event.id, payload);
      const updatedEvent = await eventsApi.updateEvent(event.id, { status: 'graded' });
      setEvent(updatedEvent);
      setHasChanges(false);
      alert('Prezența și notele au fost salvate.');
    } catch (err) {
      console.error('Submit failed', err);
      alert('Salvarea a eșuat. Încearcă din nou.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredPlayers = useMemo(() => {
    let result = players;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(p =>
        p.firstName.toLowerCase().includes(query) ||
        p.lastName.toLowerCase().includes(query) ||
        p.number?.toString().includes(query)
      );
    }
    if (activeTab === 'Starters') {
      result = result.filter(p => p.status !== 'medical');
    } else if (activeTab === 'Injured Reserve') {
      result = result.filter(p => p.status === 'medical');
    }
    return result;
  }, [players, searchQuery, activeTab]);

  const stats = useMemo(() => ({
    total: players.length,
    present: players.filter(p => p.status === 'present').length,
    absent: players.filter(p => p.status === 'absent').length,
    medical: players.filter(p => p.status === 'medical').length,
  }), [players]);

  if (loading) {
    return (
      <View style={styles.centeredFull}>
        <ActivityIndicator size="large" color="var(--c-brand-fg)" />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.centeredFull}>
        <Text style={styles.notFoundText}>Evenimentul nu a fost găsit</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.goBackBtn}>
          <Text style={styles.goBackText}>Înapoi</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const px = isMobile ? 16 : 40;

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: px, paddingTop: isMobile ? 16 : 40, paddingBottom: isMobile ? 12 : 24 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={20} color="var(--c-ink-soft)" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={[styles.headerTitle, { fontSize: isMobile ? 22 : 32 }]} numberOfLines={1}>
            Notare sesiune
          </Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {event.title}{team ? ` - ${team.name}` : ''}
          </Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: px, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Event snapshot card — wraps on mobile */}
        <View style={[styles.snapshotCard, isMobile && styles.snapshotCardMobile]}>
          <SnapshotItem icon={<Calendar size={18} color="var(--c-blue)" />} label="Data">
            {new Date(event.startTime).toLocaleDateString('ro-RO', { month: 'short', day: 'numeric', year: 'numeric' })}
          </SnapshotItem>
          <SnapshotItem icon={<Clock size={18} color="var(--c-blue)" />} label="Ora">
            {new Date(event.startTime).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })} –{' '}
            {new Date(event.endTime).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}
          </SnapshotItem>
          <SnapshotItem icon={<MapPin size={18} color="var(--c-blue)" />} label="Locație">
            {event.location || 'Sală principală'}
          </SnapshotItem>
        </View>

        {/* Stats cards — 2×2 on small phones, 4-in-a-row on tablet/desktop */}
        <View style={[styles.statsRow, isSmallPhone && styles.statsRowWrap]}>
          <StatCard label="Total" value={stats.total} color="var(--c-brand-fg)" />
          <StatCard label="Prezenți" value={stats.present} color="var(--c-success)" />
          <StatCard label="Absenți" value={stats.absent} color="var(--c-danger)" />
          <StatCard label="Medical" value={stats.medical} color="var(--c-warning)" />
        </View>

        {/* Player list card */}
        <View style={styles.playerListCard}>
          {/* Search + tab row — stacks on mobile */}
          <View style={[styles.listControls, isMobile && styles.listControlsMobile]}>
            {/* Search bar */}
            <View style={[styles.searchBar, isMobile && styles.searchBarMobile]}>
              <Search size={16} color="var(--c-faint)" />
              <TextInput
                placeholder={isMobile ? 'Caută jucător...' : 'Caută jucător după nume sau număr...'}
                placeholderTextColor="var(--c-faint)"
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={styles.searchInput}
              />
            </View>

            {/* Filter tabs — scroll horizontally on tiny screens */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabsContainer}
            >
              {(['All Players', 'Starters', 'Injured Reserve'] as TabFilter[]).map(tab => (
                <TouchableOpacity
                  key={tab}
                  onPress={() => setActiveTab(tab)}
                  style={[styles.tab, activeTab === tab && styles.tabActive]}
                >
                  <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                    {TAB_LABELS[tab]}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Table header — hide position column on small phones */}
          <View style={styles.tableHeader}>
            <View style={styles.colPlayer}>
              <Text style={styles.tableHeaderText}>Jucător</Text>
            </View>
            {!isSmallPhone && (
              <View style={styles.colPosition}>
                <Text style={styles.tableHeaderText}>Poziție</Text>
              </View>
            )}
            <View style={styles.colStatus}>
              <Text style={[styles.tableHeaderText, { textAlign: 'center' }]}>Status</Text>
            </View>
          </View>

          {/* Roster */}
          {filteredPlayers.length === 0 ? (
            <View style={styles.emptyState}>
              <UserCheck size={40} color="var(--c-border)" />
              <Text style={styles.emptyText}>Niciun jucător găsit.</Text>
            </View>
          ) : (
            filteredPlayers.map((player, index) => (
              <View
                key={player.id}
                style={[
                  styles.playerEntry,
                  index !== filteredPlayers.length - 1 && styles.playerRowBorder,
                ]}
              >
                <View style={styles.playerRow}>
                {/* Player info */}
                <View style={styles.colPlayer}>
                  <View style={styles.avatarWrap}>
                    {player.avatarUrl ? (
                      <Image source={{ uri: player.avatarUrl }} style={styles.avatar} />
                    ) : (
                      <Text style={styles.avatarInitials}>{player.firstName[0]}{player.lastName[0]}</Text>
                    )}
                    <View style={styles.jerseyBadge}>
                      <Text style={styles.jerseyNum}>{player.number || '00'}</Text>
                    </View>
                  </View>
                  <View style={styles.playerNameBlock}>
                    <Text style={[styles.playerName, { fontSize: isMobile ? 13 : 15 }]} numberOfLines={1}>
                      {player.firstName} {player.lastName}
                    </Text>
                    <Text style={styles.playerMeta} numberOfLines={1}>
                      #{player.number || '00'} · {team?.name || 'Lot'}
                    </Text>
                  </View>
                </View>

                {/* Position — hidden on small phones */}
                {!isSmallPhone && (
                  <View style={styles.colPosition}>
                    <View style={styles.positionBadge}>
                      <Text style={styles.positionText}>{player.position || 'Jucător'}</Text>
                    </View>
                  </View>
                )}

                {/* Attendance segmented control */}
                <View style={styles.colStatus}>
                  <View style={[styles.segmentedControl, isMobile && styles.segmentedControlSmall]}>
                    <TouchableOpacity
                      onPress={() => updatePlayerStatus(player.id, 'present')}
                      style={[styles.segment, player.status === 'present' && styles.segmentPresent]}
                    >
                      <Text style={[styles.segmentText, player.status === 'present' && styles.segmentTextActive]}>
                        {isMobile ? '✓' : 'Prezent'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => updatePlayerStatus(player.id, 'absent')}
                      style={[styles.segment, player.status === 'absent' && styles.segmentAbsent]}
                    >
                      <Text style={[styles.segmentText, player.status === 'absent' && styles.segmentTextActive]}>
                        {isMobile ? '✕' : 'Absent'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => updatePlayerStatus(player.id, 'medical')}
                      style={[styles.segment, player.status === 'medical' && styles.segmentMedical]}
                    >
                      <Text style={[styles.segmentText, player.status === 'medical' && styles.segmentTextActive]}>
                        {isMobile ? '＋' : 'Medical'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
                </View>

                {/* Coach feedback / note for this player */}
                <View style={styles.noteWrap}>
                  <View style={styles.noteLabelRow}>
                    <MessageSquare size={13} color="var(--c-faint)" />
                    <Text style={styles.noteLabel}>Notă / feedback</Text>
                    {player.note.trim() ? <View style={styles.noteDot} /> : null}
                  </View>
                  <TextInput
                    value={player.note}
                    onChangeText={(t: string) => updatePlayerNote(player.id, t)}
                    placeholder="Adaugă o notiță despre jucător la acest eveniment…"
                    placeholderTextColor="var(--c-faint)"
                    multiline
                    style={styles.noteInput}
                  />
                </View>
              </View>
            ))
          )}

          {/* Footer count */}
          <View style={styles.listFooter}>
            <Text style={styles.listFooterText}>
              {filteredPlayers.length} / {players.length} jucători
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Floating submit button */}
      {hasChanges && (
        <View style={[styles.fab, { right: isMobile ? 16 : 40, bottom: isMobile ? 24 : 40 }]}>
          <TouchableOpacity
            onPress={submitAttendance}
            disabled={isSubmitting}
            style={styles.fabBtn}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.fabText}>Salvează notarea</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

/** Small reusable snapshot item for the event info card */
function SnapshotItem({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <View style={snapStyles.item}>
      <View style={snapStyles.iconWrap}>{icon}</View>
      <View>
        <Text style={snapStyles.label}>{label}</Text>
        <Text style={snapStyles.value}>{children}</Text>
      </View>
    </View>
  );
}

/** Small stat card for the summary row */
function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[statStyles.card, { borderLeftColor: color }]}>
      <Text style={statStyles.label}>{label}</Text>
      <Text style={[statStyles.value, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'var(--c-surface-2)',
  },
  centeredFull: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--c-surface-2)',
  },
  notFoundText: {
    fontSize: 20,
    fontWeight: '700',
    color: 'var(--c-faint)',
  },
  goBackBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 8,
    backgroundColor: 'var(--c-border)',
    borderRadius: 24,
  },
  goBackText: {
    fontWeight: '700',
    color: 'var(--c-muted)',
  },
  // Header
  header: {
    backgroundColor: 'var(--c-surface-2)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'var(--c-surface)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'var(--c-surface-3)',
    marginRight: 12,
    flexShrink: 0,
    shadowColor: 'var(--c-ink-strong)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontWeight: '900',
    color: '#0B1B42',
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: 'var(--c-brand-fg)',
    marginTop: 2,
  },
  // Event snapshot card
  snapshotCard: {
    backgroundColor: 'var(--c-surface)',
    borderRadius: 24,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'var(--c-surface-3)',
    shadowColor: 'var(--c-ink-strong)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    flexWrap: 'wrap',
    gap: 16,
  },
  snapshotCardMobile: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 14,
  },
  // Stats row
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  statsRowWrap: {
    flexWrap: 'wrap',
  },
  // Player list card
  playerListCard: {
    backgroundColor: 'var(--c-surface)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'var(--c-surface-3)',
    overflow: 'hidden',
    shadowColor: 'var(--c-ink-strong)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  // Controls (search + tabs)
  listControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'var(--c-surface-2)',
    gap: 10,
  },
  listControlsMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'var(--c-surface-2)',
    borderWidth: 1,
    borderColor: 'var(--c-border)',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flex: 1,
    minWidth: 0,
  },
  searchBarMobile: {
    flex: 0,
    width: '100%',
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 13,
    fontWeight: '500',
    color: 'var(--c-ink-soft)',
    // Remove outline on web
    outlineStyle: 'none',
  } as any,
  tabsContainer: {
    flexDirection: 'row',
    gap: 6,
    paddingRight: 4,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 24,
    backgroundColor: 'transparent',
  },
  tabActive: {
    backgroundColor: 'var(--c-surface-tint)',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '900',
    color: 'var(--c-faint)',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  tabTextActive: {
    color: 'var(--c-brand-fg)',
  },
  // Table header  
  tableHeader: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'var(--c-surface-2)',
    borderBottomWidth: 1,
    borderBottomColor: 'var(--c-surface-3)',
  },
  tableHeaderText: {
    fontSize: 10,
    fontWeight: '900',
    color: 'var(--c-faint)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  // Column widths
  colPlayer: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  colPosition: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  colStatus: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Player row
  playerEntry: {
    paddingBottom: 6,
  },
  playerRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  playerRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'var(--c-surface-3)',
  },
  noteWrap: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 6,
  },
  noteLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  noteLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: 'var(--c-faint)',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  noteDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'var(--c-brand-surface)',
  },
  noteInput: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'var(--c-border)',
    backgroundColor: 'var(--c-surface-2)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: '500',
    color: 'var(--c-ink)',
    textAlignVertical: 'top',
  },
  // Avatar
  avatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'var(--c-surface-3)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'var(--c-border)',
    marginRight: 10,
    flexShrink: 0,
    position: 'relative',
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
  },
  avatarInitials: {
    fontSize: 13,
    fontWeight: '900',
    color: 'var(--c-faint)',
    textTransform: 'uppercase',
  },
  jerseyBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'var(--c-brand-surface)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'var(--c-border)',
  },
  jerseyNum: {
    fontSize: 7,
    fontWeight: '900',
    color: '#fff',
  },
  playerNameBlock: {
    flex: 1,
    minWidth: 0,
  },
  playerName: {
    fontWeight: '900',
    color: '#0B1B42',
  },
  playerMeta: {
    fontSize: 11,
    color: 'var(--c-faint)',
    marginTop: 2,
  },
  // Position badge
  positionBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'var(--c-surface-3)',
    borderWidth: 1,
    borderColor: 'var(--c-border)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  positionText: {
    fontSize: 10,
    fontWeight: '900',
    color: 'var(--c-muted)',
  },
  // Segmented attendance control
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: 'var(--c-surface-2)',
    borderRadius: 24,
    padding: 3,
    borderWidth: 1,
    borderColor: 'var(--c-border)',
    width: '100%',
  },
  segmentedControlSmall: {
    // on mobile we abbreviate text to symbols so it fits
  },
  segment: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentPresent: {
    backgroundColor: 'var(--c-success)',
    shadowColor: 'var(--c-success)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  segmentAbsent: {
    backgroundColor: 'var(--c-danger)',
    shadowColor: 'var(--c-danger)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  segmentMedical: {
    backgroundColor: 'var(--c-warning)',
    shadowColor: 'var(--c-warning)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  segmentText: {
    fontSize: 11,
    fontWeight: '900',
    color: 'var(--c-muted)',
  },
  segmentTextActive: {
    color: '#fff',
  },
  // List footer
  listFooter: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'var(--c-surface-2)',
    borderTopWidth: 1,
    borderTopColor: 'var(--c-surface-3)',
  },
  listFooterText: {
    fontSize: 12,
    fontWeight: '500',
    color: 'var(--c-faint)',
  },
  // Empty state
  emptyState: {
    paddingVertical: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '700',
    color: 'var(--c-faint)',
  },
  // FAB
  fab: {
    position: 'absolute',
    zIndex: 50,
  },
  fabBtn: {
    backgroundColor: 'var(--c-brand-surface)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 28,
    height: 56,
    borderRadius: 28,
    shadowColor: 'var(--c-brand-fg)',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  fabText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});

const snapStyles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
    flexShrink: 1,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'var(--c-surface-tint)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  label: {
    fontSize: 10,
    fontWeight: '900',
    color: 'var(--c-faint)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
  },
  value: {
    fontSize: 14,
    fontWeight: '700',
    color: 'var(--c-ink-soft)',
  },
});

const statStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: 'var(--c-surface)',
    borderRadius: 20,
    padding: 14,
    borderLeftWidth: 4,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: 'var(--c-surface-3)',
    borderRightColor: 'var(--c-surface-3)',
    borderBottomColor: 'var(--c-surface-3)',
    shadowColor: 'var(--c-ink-strong)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
    minWidth: 60,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: 'var(--c-faint)',
    marginBottom: 4,
  },
  value: {
    fontSize: 26,
    fontWeight: '900',
  },
});
