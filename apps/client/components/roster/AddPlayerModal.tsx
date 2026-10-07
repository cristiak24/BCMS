import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, Text, TextInput, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { Plus, Search, X } from 'lucide-react';
import { Player, Team, teamsApi } from '../../services/teamsApi';
import { useResponsive } from '../../hooks/useResponsive';

const SEARCH_DEBOUNCE_MS = 300;

interface AddPlayerModalProps {
  visible: boolean;
  teams: Team[];
  initialTeamId: number | null;
  onClose: () => void;
  onAdded: () => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text className="t-eyebrow" style={{ color: 'var(--c-faint)' }}>{children}</Text>;
}

export default function AddPlayerModal({ visible, teams, initialTeamId, onClose, onAdded }: AddPlayerModalProps) {
  const { isMobile } = useResponsive();
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(initialTeamId);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Player[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<number | null>(null);
  // Inline banner instead of window.alert: the modal stays open, the message
  // appears next to the control that caused it, and it is themeable.
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setSelectedTeamId(initialTeamId);
      setSearchQuery('');
      setDebouncedQuery('');
      setSearchResults([]);
      setError(null);
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

  const addPlayerToRoster = async (player: Player) => {
    if (!selectedTeamId) {
      setError('Alege o echipă înainte de a adăuga un sportiv în lot.');
      return;
    }

    setError(null);

    try {
      setAdding(player.id);
      await teamsApi.addPlayerToTeam(player.id, selectedTeamId);
      onAdded();
      onClose();
    } catch (addError: any) {
      console.error('Add player to roster error:', addError);
      setError(addError?.message || 'Acest sportiv nu a putut fi adăugat la echipa selectată.');
    } finally {
      setAdding(null);
    }
  };

  const close = () => { if (adding == null) onClose(); };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable
        className="ui-backdrop flex-1 items-center justify-end lg:justify-center lg:p-6"
        style={{ backgroundColor: 'rgba(10,15,28,0.55)' }}
        onPress={close}
      >
        <Pressable
          onPress={(event: any) => event.stopPropagation()}
          className="ui-sheet w-full lg:max-w-[760px] rounded-t-[20px] lg:rounded-[18px] border flex-col overflow-hidden"
          style={{
            backgroundColor: 'var(--c-surface)',
            borderColor: 'var(--c-border)',
            maxHeight: isMobile ? '92vh' : '88vh',
            boxShadow: 'var(--e-lg)',
          } as any}
        >
          {/* Header */}
          <View className="px-5 pt-3 lg:pt-5 pb-3.5 border-b" style={{ borderColor: 'var(--c-border-soft)' } as any}>
            {isMobile ? (
              <View className="self-center w-10 h-1 rounded-full mb-3" style={{ backgroundColor: 'var(--c-border-strong)' }} />
            ) : null}
            <View className="flex-row items-center justify-between gap-3">
              <View className="flex-1 min-w-0">
                <Text className="text-[18px] font-bold" style={{ color: 'var(--c-ink)' }}>Adaugă jucător</Text>
                <Text className="t-meta mt-0.5" style={{ color: 'var(--c-muted)' }}>Alege echipa, caută sportivul și adaugă-l în lot.</Text>
              </View>
              <Pressable
                onPress={close}
                accessibilityRole="button"
                accessibilityLabel="Închide"
                className="ui-press w-9 h-9 rounded-full items-center justify-center"
                style={{ backgroundColor: 'var(--c-surface-2)' }}
              >
                <X size={18} color="var(--c-ink-soft)" />
              </Pressable>
            </View>
          </View>

          {/* Body */}
          <View className={`flex-1 ${isMobile ? '' : 'flex-row'}`} style={{ overflow: 'hidden' }}>
            <View
              className={`${isMobile ? 'px-5 pt-4 pb-1' : 'w-[260px] border-r px-5 py-5'} gap-3`}
              style={!isMobile ? { borderColor: 'var(--c-border-soft)' } : undefined}
            >
              <View className="flex-row items-center justify-between gap-3">
                <SectionLabel>Echipa destinație</SectionLabel>
                <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: 'var(--c-surface-2)' }}>
                  <Text className="text-[11px] font-semibold" style={{ color: 'var(--c-muted)' }}>{teams.length} echipe</Text>
                </View>
              </View>

              <ScrollView
                horizontal={isMobile}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={isMobile ? { gap: 8, paddingRight: 8 } : { gap: 8 }}
              >
                <View className={isMobile ? 'flex-row gap-2' : 'gap-2'}>
                  {teams.map((team) => {
                    const active = team.id === selectedTeamId;
                    return (
                      <Pressable
                        key={team.id}
                        onPress={() => setSelectedTeamId(team.id)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        className="ui-press h-10 rounded-full border px-3.5 flex-row items-center"
                        style={{
                          backgroundColor: active ? 'var(--c-brand-surface)' : 'var(--c-surface)',
                          borderColor: active ? 'var(--c-brand-surface)' : 'var(--c-border)',
                        } as any}
                      >
                        <Text
                          className="text-[13px] font-semibold"
                          style={{ color: active ? 'var(--c-on-brand)' : 'var(--c-ink-soft)' }}
                          numberOfLines={1}
                        >
                          {team.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>

              {!teams.length ? (
                <View className="rounded-[12px] px-3 py-2.5" style={{ backgroundColor: 'var(--c-surface-2)' }}>
                  <Text className="text-[12.5px] font-medium" style={{ color: 'var(--c-muted)' }}>
                    Nu există echipe disponibile. Creează mai întâi o echipă pentru a adăuga sportivi.
                  </Text>
                </View>
              ) : null}
            </View>

            <View className={`flex-1 ${isMobile ? 'px-5 pt-4' : 'p-5'}`} style={{ overflow: 'hidden' }}>
              <SectionLabel>Caută sportiv</SectionLabel>
              <View
                className="mt-2 h-11 flex-row items-center rounded-[11px] border px-3"
                style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)' }}
              >
                <Search size={17} color="var(--c-faint)" />
                <TextInput
                  placeholder="Caută după nume, email sau tricou..."
                  placeholderTextColor="var(--c-faint)"
                  className="ml-2.5 flex-1 text-[14px] font-medium outline-none"
                  style={{ color: 'var(--c-ink)' }}
                  autoFocus
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {searching ? <ActivityIndicator size="small" color="var(--c-brand-fg)" /> : null}
              </View>

              {error ? (
                <View
                  accessibilityRole="alert"
                  className="mt-3 flex-row items-center gap-2 rounded-[12px] border px-3.5 py-2.5"
                  style={{ backgroundColor: 'var(--c-danger-bg)', borderColor: 'var(--c-danger-border)' } as any}
                >
                  <MaterialIcons name="error-outline" size={16} color="var(--c-danger-fg)" />
                  <Text className="flex-1 text-[12.5px] font-semibold" style={{ color: 'var(--c-danger-fg)' }}>
                    {error}
                  </Text>
                </View>
              ) : null}

              <FlatList
                data={searchResults}
                keyExtractor={(item: Player) => item.id.toString()}
                style={{ flex: 1, marginTop: 12 }}
                contentContainerStyle={{ flexGrow: 1, gap: 8, paddingBottom: 12 }}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }: { item: Player }) => {
                  const initials = `${item.firstName?.[0] || 'P'}${item.lastName?.[0] || ''}`.toUpperCase();
                  const isAdding = adding === item.id;
                  return (
                    <Pressable
                      onPress={() => addPlayerToRoster(item)}
                      disabled={isAdding}
                      className="ui-press flex-row items-center rounded-[14px] border px-3 py-2.5"
                      style={{ minHeight: 64, backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border-soft)' } as any}
                    >
                      <View
                        className="h-10 w-10 items-center justify-center rounded-[11px]"
                        style={{ backgroundColor: 'var(--c-surface-2)' }}
                      >
                        <Text className="text-[13px] font-bold" style={{ color: 'var(--c-brand-fg)' }}>
                          {initials}
                        </Text>
                      </View>
                      <View className="ml-3 flex-1 pr-3">
                        <Text className="text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>
                          {item.firstName} {item.lastName}
                        </Text>
                        <Text className="mt-[2px] text-[12px] font-medium" style={{ color: 'var(--c-faint)' }} numberOfLines={1}>
                          #{item.number || '--'} • {item.position || 'Sportiv'} • {item.email || 'Fără email'}
                        </Text>
                      </View>
                      <View
                        className="h-8 w-8 items-center justify-center rounded-[10px]"
                        style={{ backgroundColor: 'var(--c-brand-surface)' }}
                      >
                        {isAdding ? <ActivityIndicator size="small" color="var(--c-on-brand)" /> : <Plus size={15} color="var(--c-on-brand)" />}
                      </View>
                    </Pressable>
                  );
                }}
                ListEmptyComponent={() => {
                  if (searching) {
                    return (
                      <View className="flex-1 items-center justify-center rounded-[14px] p-6" style={{ minHeight: 220, backgroundColor: 'var(--c-surface-2)' }}>
                        <ActivityIndicator size="small" color="var(--c-brand-fg)" />
                        <Text className="mt-2.5 text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }}>
                          Se caută sportivi...
                        </Text>
                      </View>
                    );
                  }

                  if (searchQuery.length > 1) {
                    return (
                      <View className="flex-1 items-center justify-center rounded-[14px] p-6" style={{ minHeight: 220, backgroundColor: 'var(--c-surface-2)' }}>
                        <Text className="text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }}>
                          Niciun sportiv găsit.
                        </Text>
                        <Text className="mt-1.5 text-center text-[12.5px] font-medium leading-5" style={{ color: 'var(--c-muted)' }}>
                          Încearcă alt nume, email sau număr de tricou.
                        </Text>
                      </View>
                    );
                  }

                  return (
                    <View className="flex-1 items-center justify-center rounded-[14px] p-6" style={{ minHeight: 220, backgroundColor: 'var(--c-surface-2)' }}>
                      <View className="mb-3 h-11 w-11 items-center justify-center rounded-[12px]" style={{ backgroundColor: 'var(--c-surface)' }}>
                        <Search size={19} color="var(--c-brand-fg)" />
                      </View>
                      <Text className="text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }}>
                        Începe să scrii pentru a căuta
                      </Text>
                      <Text className="mt-1.5 text-center text-[12.5px] font-medium leading-5" style={{ color: 'var(--c-muted)' }}>
                        Folosește cel puțin 2 caractere pentru a găsi sportivi în baza de date.
                      </Text>
                    </View>
                  );
                }}
              />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
