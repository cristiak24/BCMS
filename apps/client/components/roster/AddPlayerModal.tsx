import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, Text, TextInput, View } from '@/src/web/reactNative';
import { Plus, Search, UserPlus, X } from 'lucide-react';
import { Player, Team, teamsApi } from '../../services/teamsApi';
import { useResponsive } from '../../hooks/useResponsive';
import { dash } from '../dashboard/dashboardTheme';

const SEARCH_DEBOUNCE_MS = 300;

interface AddPlayerModalProps {
  visible: boolean;
  teams: Team[];
  initialTeamId: number | null;
  onClose: () => void;
  onAdded: () => void;
}

export default function AddPlayerModal({ visible, teams, initialTeamId, onClose, onAdded }: AddPlayerModalProps) {
  const { isMobile, isSmallPhone } = useResponsive();
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(initialTeamId);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Player[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<number | null>(null);

  useEffect(() => {
    if (visible) {
      setSelectedTeamId(initialTeamId);
      setSearchQuery('');
      setDebouncedQuery('');
      setSearchResults([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(searchQuery), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);

    teamsApi
      .searchPlayers(debouncedQuery)
      .then((results) => {
        if (!cancelled) setSearchResults(results);
      })
      .catch((searchError) => {
        console.error('Search players error:', searchError);
        if (!cancelled) setSearchResults([]);
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  const selectedTeam = teams.find((team) => team.id === selectedTeamId) ?? null;

  const addPlayerToRoster = async (player: Player) => {
    if (!selectedTeamId) {
      window.alert('Alege o echipă înainte de a adăuga un sportiv în lot.');
      return;
    }

    try {
      setAdding(player.id);
      await teamsApi.addPlayerToTeam(player.id, selectedTeamId);
      onAdded();
      onClose();
    } catch (addError: any) {
      console.error('Add player to roster error:', addError);
      window.alert(addError?.message || 'Acest sportiv nu a putut fi adăugat la echipa selectată.');
    } finally {
      setAdding(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View className={`flex-1 bg-black/50 ${isMobile ? 'justify-end' : 'items-center justify-center p-8'}`}>
        <View
          className={`overflow-hidden shadow-2xl ${isMobile ? 'h-[88%] rounded-t-[34px]' : 'w-full max-w-5xl rounded-[34px]'}`}
          style={{ backgroundColor: dash.surface }}
        >
          <View className="border-b p-5 md:p-6" style={{ borderColor: dash.hairline, backgroundColor: dash.surfaceSubtle }}>
            <View className="flex-row items-start justify-between gap-4">
              <View className="flex-1">
                <View className="mb-3 flex-row items-center gap-2">
                  <View className="h-10 w-10 items-center justify-center rounded-2xl" style={{ backgroundColor: dash.accentBlue }}>
                    <UserPlus color="#FFFFFF" size={19} />
                  </View>
                  <View>
                    <Text className="text-[10px] font-black uppercase tracking-[2px]" style={{ color: dash.accentBlue }}>
                      Adăugare în lot
                    </Text>
                    <Text className={`${isSmallPhone ? 'text-2xl' : 'text-3xl'} font-black`} style={{ color: dash.ink }}>
                      Adaugă jucător
                    </Text>
                  </View>
                </View>
                <Text className="max-w-2xl text-[13px] font-semibold leading-5" style={{ color: dash.muted }}>
                  Alege echipa destinație, caută sportivul în baza de date, apoi adaugă-l în lotul activ.
                </Text>
              </View>

              <Pressable
                onPress={onClose}
                className="h-10 w-10 items-center justify-center rounded-2xl border"
                style={{ backgroundColor: dash.surface, borderColor: dash.hairline }}
              >
                <X color={dash.ink} size={20} />
              </Pressable>
            </View>
          </View>

          <View className="flex-1 p-5 md:p-6">
            <View className={`${isMobile ? 'gap-4' : 'flex-row gap-5'} flex-1`}>
              <View
                className={`${isMobile ? 'w-full' : 'w-[300px]'} rounded-[26px] border p-4`}
                style={{ borderColor: dash.hairline, backgroundColor: dash.surfaceSubtle }}
              >
                <View className="mb-4 flex-row items-center justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-[10px] font-black uppercase tracking-[1.6px]" style={{ color: dash.faint }}>
                      Echipa destinație
                    </Text>
                    <Text className="mt-1 text-lg font-black" style={{ color: dash.ink }} numberOfLines={1}>
                      {selectedTeam?.name ?? 'Alege o echipă'}
                    </Text>
                  </View>
                  <View className="rounded-full px-3 py-1.5" style={{ backgroundColor: dash.surface }}>
                    <Text className="text-[10px] font-black" style={{ color: dash.accentBlue }}>
                      {teams.length} echipe
                    </Text>
                  </View>
                </View>

                <ScrollView
                  horizontal={isMobile}
                  showsHorizontalScrollIndicator={false}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={isMobile ? { paddingRight: 8, gap: 10 } : { gap: 10 }}
                >
                  {teams.map((team) => {
                    const active = team.id === selectedTeamId;
                    return (
                      <Pressable
                        key={team.id}
                        onPress={() => setSelectedTeamId(team.id)}
                        className="dash-filter-hover flex-row items-center rounded-[18px] border px-3 py-2.5"
                        style={{
                          minHeight: 58,
                          gap: 10,
                          backgroundColor: active ? dash.accentBlue : dash.surface,
                          borderColor: active ? dash.accentBlue : dash.hairline,
                        }}
                      >
                        <View
                          className="rounded-full"
                          style={{ width: 10, height: 10, backgroundColor: active ? '#FFFFFF' : dash.line }}
                        />
                        <Text
                          className="flex-1 text-[12px] font-black leading-4"
                          style={{ color: active ? '#FFFFFF' : dash.inkSoft }}
                          numberOfLines={2}
                        >
                          {team.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {!teams.length ? (
                  <View className="mt-3 rounded-[14px] px-3 py-2.5" style={{ backgroundColor: dash.surface }}>
                    <Text className="text-[12px] font-semibold" style={{ color: dash.muted }}>
                      Nu există echipe disponibile. Creează mai întâi o echipă pentru a adăuga sportivi.
                    </Text>
                  </View>
                ) : null}
              </View>

              <View className="flex-1">
                <View className="rounded-[26px] border p-4" style={{ borderColor: dash.hairline, backgroundColor: dash.surface }}>
                  <Text className="mb-3 text-[10px] font-black uppercase tracking-[1.6px]" style={{ color: dash.faint }}>
                    Caută sportiv
                  </Text>
                  <View
                    className="flex-row items-center rounded-2xl border px-4 py-3"
                    style={{ borderColor: dash.hairline, backgroundColor: dash.surfaceSubtle }}
                  >
                    <Search color={dash.faint} size={19} />
                    <TextInput
                      placeholder="Caută după nume, email sau tricou..."
                      placeholderTextColor={dash.faint}
                      className="ml-3 flex-1 text-[15px] font-bold outline-none"
                      style={{ color: dash.ink }}
                      autoFocus
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                    />
                    {searching ? <ActivityIndicator size="small" color={dash.accentBlue} /> : null}
                  </View>
                </View>

                <FlatList
                  data={searchResults}
                  keyExtractor={(item: Player) => item.id.toString()}
                  style={{ flex: 1, marginTop: 14 }}
                  contentContainerStyle={{ flexGrow: 1, gap: 10, paddingBottom: 12 }}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }: { item: Player }) => {
                    const initials = `${item.firstName?.[0] || 'P'}${item.lastName?.[0] || ''}`.toUpperCase();
                    const isAdding = adding === item.id;
                    return (
                      <Pressable
                        onPress={() => addPlayerToRoster(item)}
                        disabled={isAdding}
                        className="dash-card-hover flex-row items-center rounded-[22px] border px-3.5 py-3"
                        style={{ minHeight: 72, backgroundColor: dash.surface, borderColor: dash.hairline, ...dash.shadow.sm }}
                      >
                        <View
                          className="h-[46px] w-[46px] items-center justify-center rounded-[16px] border"
                          style={{ backgroundColor: 'rgba(37,99,235,0.08)', borderColor: dash.hairline }}
                        >
                          <Text className="text-[14px] font-black" style={{ color: dash.accentBlue }}>
                            {initials}
                          </Text>
                        </View>
                        <View className="ml-3 flex-1 pr-3">
                          <Text className="text-[15px] font-black" style={{ color: dash.ink }} numberOfLines={1}>
                            {item.firstName} {item.lastName}
                          </Text>
                          <Text className="mt-[3px] text-[12px] font-bold" style={{ color: dash.faint }} numberOfLines={1}>
                            #{item.number || '--'} • {item.position || 'Sportiv'} • {item.email || 'Fără email'}
                          </Text>
                        </View>
                        <View
                          className="h-9 w-9 items-center justify-center rounded-[14px]"
                          style={{ backgroundColor: dash.accentBlue }}
                        >
                          {isAdding ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Plus color="#FFFFFF" size={16} />}
                        </View>
                      </Pressable>
                    );
                  }}
                  ListEmptyComponent={() => {
                    if (searching) {
                      return (
                        <View className="flex-1 items-center justify-center rounded-[26px] border p-6" style={{ minHeight: 240, borderColor: dash.hairline, backgroundColor: dash.surfaceSubtle }}>
                          <ActivityIndicator size="small" color={dash.accentBlue} />
                          <Text className="mt-2.5 text-[16px] font-black" style={{ color: dash.ink }}>
                            Se caută sportivi...
                          </Text>
                        </View>
                      );
                    }

                    if (searchQuery.length > 1) {
                      return (
                        <View className="flex-1 items-center justify-center rounded-[26px] border p-6" style={{ minHeight: 240, borderColor: dash.hairline, backgroundColor: dash.surfaceSubtle }}>
                          <Text className="text-[16px] font-black" style={{ color: dash.ink }}>
                            Niciun sportiv găsit.
                          </Text>
                          <Text className="mt-1.5 text-center text-[13px] font-bold leading-5" style={{ color: dash.muted }}>
                            Încearcă alt nume, email sau număr de tricou.
                          </Text>
                        </View>
                      );
                    }

                    return (
                      <View className="flex-1 items-center justify-center rounded-[26px] border p-6" style={{ minHeight: 240, borderColor: dash.hairline, backgroundColor: dash.surfaceSubtle }}>
                        <View className="mb-3 h-[54px] w-[54px] items-center justify-center rounded-[20px]" style={{ backgroundColor: 'rgba(37,99,235,0.08)' }}>
                          <Search color={dash.accentBlue} size={22} />
                        </View>
                        <Text className="text-[16px] font-black" style={{ color: dash.ink }}>
                          Începe să scrii pentru a căuta
                        </Text>
                        <Text className="mt-1.5 text-center text-[13px] font-bold leading-5" style={{ color: dash.muted }}>
                          Folosește cel puțin 2 caractere pentru a găsi sportivi în baza de date.
                        </Text>
                      </View>
                    );
                  }}
                />
              </View>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
