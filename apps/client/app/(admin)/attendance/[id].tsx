import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Image, StyleSheet } from '@/src/web/reactNative';
import { useLocalSearchParams, useRouter } from '@/src/web/expoRouter';
import {
  Calendar,
  Clock,
  MapPin,
  Search,
  ChevronLeft,
  UserCheck
} from 'lucide-react';
import { eventsApi, CalendarEvent } from '../../../services/eventsApi';
import { teamsApi, Team, Player } from '../../../services/teamsApi';
import { useResponsive } from '../../../hooks/useResponsive';

type TabFilter = 'All Players' | 'Starters' | 'Injured Reserve';
type AttendanceStatus = 'present' | 'absent' | 'medical';

export default function AttendanceScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { isMobile, isSmallPhone } = useResponsive();

  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<CalendarEvent | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [players, setPlayers] = useState<(Omit<Player, 'status'> & { status: AttendanceStatus | null })[]>([]);

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
            return { ...p, status: mappedStatus };
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

  const submitAttendance = async () => {
    if (!event) return;
    setIsSubmitting(true);
    try {
      const payload = players.map(p => ({
        playerId: p.id,
        status: p.status || 'pending'
      }));
      await eventsApi.updateEventAttendance(event.id, payload);
      const updatedEvent = await eventsApi.updateEvent(event.id, { status: 'graded' });
      setEvent(updatedEvent);
      setHasChanges(false);
      alert('Attendance saved successfully!');
    } catch (err) {
      console.error('Submit failed', err);
      alert('Failed to save attendance. Please try again.');
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
        <ActivityIndicator size="large" color="#1D3E90" />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.centeredFull}>
        <Text style={styles.notFoundText}>Event Not Found</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.goBackBtn}>
          <Text style={styles.goBackText}>Go Back</Text>
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
          <ChevronLeft size={20} color="#1E293B" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={[styles.headerTitle, { fontSize: isMobile ? 22 : 32 }]} numberOfLines={1}>
            Session Attendance
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
          <SnapshotItem icon={<Calendar size={18} color="#3B82F6" />} label="Date">
            {new Date(event.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </SnapshotItem>
          <SnapshotItem icon={<Clock size={18} color="#3B82F6" />} label="Time">
            {new Date(event.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} –{' '}
            {new Date(event.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </SnapshotItem>
          <SnapshotItem icon={<MapPin size={18} color="#3B82F6" />} label="Location">
            {event.location || 'Main Gym'}
          </SnapshotItem>
        </View>

        {/* Stats cards — 2×2 on small phones, 4-in-a-row on tablet/desktop */}
        <View style={[styles.statsRow, isSmallPhone && styles.statsRowWrap]}>
          <StatCard label="Total" value={stats.total} color="#1D3E90" />
          <StatCard label="Present" value={stats.present} color="#10B981" />
          <StatCard label="Absent" value={stats.absent} color="#F43F5E" />
          <StatCard label="Medical" value={stats.medical} color="#F59E0B" />
        </View>

        {/* Player list card */}
        <View style={styles.playerListCard}>
          {/* Search + tab row — stacks on mobile */}
          <View style={[styles.listControls, isMobile && styles.listControlsMobile]}>
            {/* Search bar */}
            <View style={[styles.searchBar, isMobile && styles.searchBarMobile]}>
              <Search size={16} color="#94A3B8" />
              <TextInput
                placeholder={isMobile ? 'Search player...' : 'Search player by name or number...'}
                placeholderTextColor="#94A3B8"
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
                    {tab}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Table header — hide position column on small phones */}
          <View style={styles.tableHeader}>
            <View style={styles.colPlayer}>
              <Text style={styles.tableHeaderText}>Player</Text>
            </View>
            {!isSmallPhone && (
              <View style={styles.colPosition}>
                <Text style={styles.tableHeaderText}>Position</Text>
              </View>
            )}
            <View style={styles.colStatus}>
              <Text style={[styles.tableHeaderText, { textAlign: 'center' }]}>Status</Text>
            </View>
          </View>

          {/* Roster */}
          {filteredPlayers.length === 0 ? (
            <View style={styles.emptyState}>
              <UserCheck size={40} color="#E2E8F0" />
              <Text style={styles.emptyText}>No players found.</Text>
            </View>
          ) : (
            filteredPlayers.map((player, index) => (
              <View
                key={player.id}
                style={[
                  styles.playerRow,
                  index !== filteredPlayers.length - 1 && styles.playerRowBorder,
                ]}
              >
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
                      #{player.number || '00'} · {team?.name || 'Roster'}
                    </Text>
                  </View>
                </View>

                {/* Position — hidden on small phones */}
                {!isSmallPhone && (
                  <View style={styles.colPosition}>
                    <View style={styles.positionBadge}>
                      <Text style={styles.positionText}>{player.position || 'Player'}</Text>
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
                        {isMobile ? '✓' : 'Present'}
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
            ))
          )}

          {/* Footer count */}
          <View style={styles.listFooter}>
            <Text style={styles.listFooterText}>
              {filteredPlayers.length} / {players.length} players
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
              <Text style={styles.fabText}>Submit Attendance</Text>
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
    backgroundColor: '#F5F7FA',
  },
  centeredFull: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F7FA',
  },
  notFoundText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#94A3B8',
  },
  goBackBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 24,
  },
  goBackText: {
    fontWeight: '700',
    color: '#475569',
  },
  // Header
  header: {
    backgroundColor: '#F5F7FA',
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginRight: 12,
    flexShrink: 0,
    shadowColor: '#0F172A',
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
    color: '#1D3E90',
    marginTop: 2,
  },
  // Event snapshot card
  snapshotCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#0F172A',
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
    backgroundColor: '#fff',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    overflow: 'hidden',
    shadowColor: '#0F172A',
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
    borderBottomColor: '#F8FAFC',
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
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    color: '#334155',
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
    backgroundColor: '#EBF1FF',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  tabTextActive: {
    color: '#1D3E90',
  },
  // Table header  
  tableHeader: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tableHeaderText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
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
  playerRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  playerRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  // Avatar
  avatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  jerseyBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#1D3E90',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
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
    color: '#94A3B8',
    marginTop: 2,
  },
  // Position badge
  positionBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  positionText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#475569',
  },
  // Segmented attendance control
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 24,
    padding: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    backgroundColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  segmentAbsent: {
    backgroundColor: '#F43F5E',
    shadowColor: '#F43F5E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  segmentMedical: {
    backgroundColor: '#F59E0B',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  segmentText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#64748B',
  },
  segmentTextActive: {
    color: '#fff',
  },
  // List footer
  listFooter: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  listFooterText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#94A3B8',
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
    color: '#94A3B8',
  },
  // FAB
  fab: {
    position: 'absolute',
    zIndex: 50,
  },
  fabBtn: {
    backgroundColor: '#1D3E90',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 28,
    height: 56,
    borderRadius: 28,
    shadowColor: '#1D3E90',
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
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  label: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
  },
  value: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
});

const statStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 14,
    borderLeftWidth: 4,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: '#F1F5F9',
    borderRightColor: '#F1F5F9',
    borderBottomColor: '#F1F5F9',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
    minWidth: 60,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 4,
  },
  value: {
    fontSize: 26,
    fontWeight: '900',
  },
});
