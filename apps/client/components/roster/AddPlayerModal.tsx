import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, Text, TextInput, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { Plus, Search, X } from 'lucide-react';
import { Player, Team, teamsApi } from '../../services/teamsApi';
import { useResponsive } from '../../hooks/useResponsive';
import { familyApi } from '../../services/familyApi';
import Button from '../ui/Button';
import { FormField } from '../ui/FormField';
import { birthYearRange, playerDraftFromSearch } from '../../utils/rosterParse';

type PlayerDraft = { firstName: string; lastName: string; birthYear: string };

const SEARCH_DEBOUNCE_MS = 300;
const BROWSE_PAGE_SIZE = 20;
// The sheet's slide-in animation (.rn-modal[data-animation="slide"] in
// global.css) runs 320ms. Autofocusing immediately pops the keyboard while
// the sheet is still rising, so the viewport jumps mid-animation — delay
// focus past it on mobile; desktop has no on-screen keyboard to fight.
const MOBILE_FOCUS_DELAY_MS = 360;

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
  // "Creează jucător": a search that finds nobody can create the player on
  // the selected team (POST /teams/:id/players/bulk, one row).
  const [draft, setDraft] = useState<PlayerDraft | null>(null);
  const [creating, setCreating] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // No query typed yet: browse the roster-visible players, newest first and
  // paged, instead of showing an empty "start typing" state.
  const isBrowseMode = debouncedQuery.length < 2;
  const [browseResults, setBrowseResults] = useState<Player[]>([]);
  const [browseHasMore, setBrowseHasMore] = useState(false);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (visible) {
      setSelectedTeamId(initialTeamId);
      setSearchQuery('');
      setDebouncedQuery('');
      setSearchResults([]);
      setBrowseResults([]);
      setBrowseHasMore(false);
      setError(null);
      setDraft(null);

      const focusDelay = isMobile ? MOBILE_FOCUS_DELAY_MS : 0;
      const timer = setTimeout(() => searchInputRef.current?.focus(), focusDelay);
      return () => clearTimeout(timer);
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

  useEffect(() => {
    if (!visible || !isBrowseMode) return;

    let cancelled = false;
    setBrowseLoading(true);

    teamsApi
      .browsePlayers({ limit: BROWSE_PAGE_SIZE, offset: 0 })
      .then((page) => {
        if (cancelled) return;
        setBrowseResults(page.items);
        setBrowseHasMore(page.hasMore);
      })
      .catch((browseError) => {
        console.error('Browse players error:', browseError);
        if (!cancelled) {
          setBrowseResults([]);
          setBrowseHasMore(false);
        }
      })
      .finally(() => {
        if (!cancelled) setBrowseLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, isBrowseMode]);

  const loadMoreBrowseResults = () => {
    if (loadingMore || browseLoading || !browseHasMore) return;
    setLoadingMore(true);
    teamsApi
      .browsePlayers({ limit: BROWSE_PAGE_SIZE, offset: browseResults.length })
      .then((page) => {
        setBrowseResults((current) => [...current, ...page.items]);
        setBrowseHasMore(page.hasMore);
      })
      .catch((browseError) => console.error('Browse players error:', browseError))
      .finally(() => setLoadingMore(false));
  };

  const listData = isBrowseMode ? browseResults : searchResults;
  const listLoading = isBrowseMode ? browseLoading : searching;

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

  const yearRange = birthYearRange();
  const draftYear = draft?.birthYear.trim() ?? '';
  const draftYearError = draftYear && !(/^\d{4}$/.test(draftYear) && Number(draftYear) >= yearRange.min && Number(draftYear) <= yearRange.max)
    ? `Un an între ${yearRange.min} și ${yearRange.max}.`
    : null;
  const selectedTeam = teams.find((team) => team.id === selectedTeamId) ?? null;

  const createPlayer = async () => {
    if (!draft || creating) return;
    if (!selectedTeamId) {
      setError('Alege o echipă înainte de a crea un sportiv.');
      return;
    }
    const firstName = draft.firstName.trim();
    const lastName = draft.lastName.trim();
    if (!firstName || !lastName) {
      setError('Completează numele și prenumele.');
      return;
    }
    if (draftYearError) return;

    setError(null);
    setCreating(true);
    try {
      const result = await familyApi.bulkAddPlayers(selectedTeamId, [
        { firstName, lastName, birthYear: draftYear ? Number(draftYear) : null },
      ]);
      if (!result.created.length) {
        setError(`${lastName} ${firstName} este deja în lotul echipei ${selectedTeam?.name ?? 'selectate'}.`);
        return;
      }
      onAdded();
      onClose();
    } catch (createError: any) {
      console.error('Create player error:', createError);
      setError(createError?.message || 'Nu am putut crea sportivul.');
    } finally {
      setCreating(false);
    }
  };

  const close = () => { if (adding == null && !creating) onClose(); };

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
                  ref={searchInputRef}
                  placeholder="Caută după nume, email sau tricou..."
                  placeholderTextColor="var(--c-faint)"
                  className="ml-2.5 flex-1 text-[14px] font-medium outline-none"
                  style={{ color: 'var(--c-ink)' }}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {listLoading ? <ActivityIndicator size="small" color="var(--c-brand-fg)" /> : null}
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

              {draft ? (
                <ScrollView className="flex-1 mt-3" contentContainerStyle={{ paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
                  <View className="rounded-[14px] border p-4 gap-3.5" style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border-soft)' } as any}>
                    <View>
                      <Text className="text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }}>Sportiv nou</Text>
                      <Text className="t-meta mt-0.5" style={{ color: 'var(--c-muted)' }}>
                        {selectedTeam ? `Intră în lotul echipei ${selectedTeam.name}.` : 'Alege echipa destinație.'}
                      </Text>
                    </View>
                    <View className="flex-col sm:flex-row gap-3">
                      <View className="flex-1">
                        <FormField label="Nume" value={draft.lastName} onChangeText={(value: string) => setDraft({ ...draft, lastName: value })} placeholder="Popescu" maxLength={120} />
                      </View>
                      <View className="flex-1">
                        <FormField label="Prenume" value={draft.firstName} onChangeText={(value: string) => setDraft({ ...draft, firstName: value })} placeholder="Matei" maxLength={120} />
                      </View>
                    </View>
                    <View className="sm:max-w-[200px]">
                      <FormField
                        label="An naștere (opțional)"
                        value={draft.birthYear}
                        onChangeText={(value: string) => setDraft({ ...draft, birthYear: value })}
                        keyboardType="numeric"
                        placeholder="2016"
                        error={draftYearError}
                      />
                    </View>
                    <View className="flex-row justify-end gap-2">
                      <Button label="Înapoi la căutare" variant="ghost" onPress={() => { setDraft(null); setError(null); }} disabled={creating} />
                      <Button
                        icon="person-add"
                        label="Creează jucător"
                        variant="primary"
                        loading={creating}
                        disabled={!selectedTeamId || !draft.firstName.trim() || !draft.lastName.trim() || !!draftYearError}
                        onPress={createPlayer}
                      />
                    </View>
                  </View>
                </ScrollView>
              ) : (
              <FlatList
                data={listData}
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
                  if (listLoading) {
                    return (
                      <View className="flex-1 items-center justify-center rounded-[14px] p-6" style={{ minHeight: 220, backgroundColor: 'var(--c-surface-2)' }}>
                        <ActivityIndicator size="small" color="var(--c-brand-fg)" />
                        <Text className="mt-2.5 text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }}>
                          {isBrowseMode ? 'Se încarcă sportivii...' : 'Se caută sportivi...'}
                        </Text>
                      </View>
                    );
                  }

                  if (!isBrowseMode) {
                    return (
                      <View className="flex-1 items-center justify-center rounded-[14px] p-6" style={{ minHeight: 220, backgroundColor: 'var(--c-surface-2)' }}>
                        <Text className="text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }}>
                          Niciun sportiv găsit.
                        </Text>
                        <Text className="mt-1.5 text-center text-[12.5px] font-medium leading-5" style={{ color: 'var(--c-muted)' }}>
                          Încearcă alt nume, email sau număr de tricou, ori creează sportivul.
                        </Text>
                        <View className="mt-4">
                          <Button
                            icon="person-add"
                            label="Creează jucător"
                            variant="primary"
                            onPress={() => { setError(null); setDraft(playerDraftFromSearch(searchQuery)); }}
                          />
                        </View>
                      </View>
                    );
                  }

                  return (
                    <View className="flex-1 items-center justify-center rounded-[14px] p-6" style={{ minHeight: 220, backgroundColor: 'var(--c-surface-2)' }}>
                      <View className="mb-3 h-11 w-11 items-center justify-center rounded-[12px]" style={{ backgroundColor: 'var(--c-surface)' }}>
                        <Search size={19} color="var(--c-brand-fg)" />
                      </View>
                      <Text className="text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }}>
                        Niciun sportiv disponibil
                      </Text>
                      <Text className="mt-1.5 text-center text-[12.5px] font-medium leading-5" style={{ color: 'var(--c-muted)' }}>
                        Sportivii din club vor apărea aici, sau caută după nume, email ori tricou.
                      </Text>
                    </View>
                  );
                }}
                ListFooterComponent={isBrowseMode && browseHasMore ? () => (
                  <Pressable
                    onPress={loadMoreBrowseResults}
                    disabled={loadingMore}
                    className="ui-press h-11 items-center justify-center rounded-[12px] border mt-1"
                    style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)' } as any}
                  >
                    {loadingMore ? (
                      <ActivityIndicator size="small" color="var(--c-brand-fg)" />
                    ) : (
                      <Text className="text-[13px] font-semibold" style={{ color: 'var(--c-ink-soft)' }}>
                        Încarcă mai mulți
                      </Text>
                    )}
                  </Pressable>
                ) : undefined}
              />
              )}
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
