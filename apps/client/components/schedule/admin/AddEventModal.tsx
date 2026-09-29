import { useEffect, useRef, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Switch, Text, View, type ScrollViewHandle } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { Team } from '../../../services/teamsApi';
import { useAddEventForm, type AddEventType } from '../../../hooks/useAddEventForm';
import { FormField } from '../../ui/FormField';
import { EVENT_TYPE_META } from '../scheduleShared';

/**
 * "Eveniment nou" — bottom sheet on phones, centred dialog on desktop.
 *
 * Rebuilt for mobile. The previous version:
 *   • kept the form state in the SCHEDULE screen, so every keystroke re-rendered
 *     the whole calendar behind the modal — the typing lag;
 *   • drew custom scroll-wheel time pickers and a flat 1–31 day grid, whose
 *     month arrows navigated (and refetched) the schedule behind it;
 *   • ran at poster scale: 36px corners, 56px fields, 11px black uppercase
 *     labels, stacked 2xl shadows.
 *
 * Now the form lives here, dates / times / team use the phone's NATIVE pickers
 * (the iOS wheel / Android dialog — fast, familiar, accessible), and the
 * geometry matches the rest of the app (44px fields, 12–16px radii).
 */

const TYPE_ORDER: AddEventType[] = ['training', 'match', 'camp', 'medical', 'admin'];
const TYPE_ICON: Record<AddEventType, string> = {
  training: 'fitness-center',
  match: 'sports-basketball',
  camp: 'terrain',
  medical: 'medical-services',
  admin: 'badge',
};
const REPEAT_DAY_LABELS = ['L', 'Ma', 'Mi', 'J', 'V', 'S', 'D'];
const REPEAT_WEEKS = [2, 4, 6, 8, 12];
const DEFAULT_LOCATIONS = ['Sală principală', 'Sala Polivalentă', 'Teren de antrenament'];

function toDateInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromDateInput(value: string) {
  const [y, m, d] = value.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}

const nativeInputClass = 'native-field h-11 w-full rounded-[11px] border px-3 text-[14px] font-medium';

function Label({ children }: { children: ReactNode }) {
  return <Text className="text-[12.5px] font-semibold mb-1.5" style={{ color: 'var(--c-ink-soft)' }}>{children}</Text>;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <Text className="text-[12px] font-semibold mt-1.5" style={{ color: 'var(--c-danger-fg)' }} data-field-error>
      {message}
    </Text>
  );
}

function Section({ title, trailing, children }: { title: string; trailing?: ReactNode; children: ReactNode }) {
  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="t-eyebrow" style={{ color: 'var(--c-faint)' }}>{title}</Text>
        {trailing}
      </View>
      {children}
    </View>
  );
}

export function AddEventModal({
  visible,
  onClose,
  onCreated,
  teams,
  isMobile,
  initialDate,
  initialTeamId,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: (createdCount: number) => void;
  teams: Team[];
  isMobile: boolean;
  /** Pre-filled day (from "add on this day"); null keeps the last one. */
  initialDate?: Date | null;
  /** Team scope of the schedule, if any. */
  initialTeamId?: number | null;
}) {
  const form = useAddEventForm(onCreated);
  const {
    newEventType, setNewEventType, newTitle, setNewTitle, newDescription, setNewDescription,
    newStartTime, newEndTime, newLocation, setNewLocation, newTeamId, setNewTeamId, newAmount, setNewAmount,
    addEventErrors, clearError, newStartDate, setNewStartDate, newEndDate, setNewEndDate,
    isRecurring, setIsRecurring, recurringDays, setRecurringDays, recurringWeeks, setRecurringWeeks,
    recentLocations, loadRecentLocations, addingEvent, submitError, updatePickerTime, prefillDate, submit,
  } = form;

  const scrollRef = useRef<ScrollViewHandle | null>(null);

  // Apply the opening context once per open.
  const wasVisible = useRef(false);
  useEffect(() => {
    if (visible && !wasVisible.current) {
      loadRecentLocations();
      if (initialDate) prefillDate(initialDate);
      if (initialTeamId != null) setNewTeamId(initialTeamId);
    }
    wasVisible.current = visible;
  }, [visible, initialDate, initialTeamId, loadRecentLocations, prefillDate, setNewTeamId]);

  if (!visible) return null;

  const close = () => { if (!addingEvent) onClose(); };
  const handleSubmit = async () => {
    const ok = await submit();
    if (ok) {
      onClose();
      return;
    }
    // Validation errors sit in the fields above the fold on a phone; bring the
    // first one into view instead of leaving the user staring at the footer.
    requestAnimationFrame(() => {
      const target = document.querySelector('.rn-modal [data-field-error]') as HTMLElement | null;
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      else scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
  };

  const isTraining = newEventType === 'training';
  const locationSuggestions = Array.from(new Set([...recentLocations, ...DEFAULT_LOCATIONS]))
    .filter((location) => location && location !== newLocation.trim())
    .slice(0, 5);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable
        className="ui-backdrop flex-1 items-center justify-end lg:justify-center lg:p-6"
        style={{ backgroundColor: 'rgba(10,15,28,0.55)' }}
        onPress={close}
      >
        <Pressable
          onPress={(event: any) => event.stopPropagation()}
          className="ui-sheet w-full lg:max-w-[620px] rounded-t-[20px] lg:rounded-[18px] border flex-col overflow-hidden"
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
                <Text className="text-[18px] font-bold" style={{ color: 'var(--c-ink)' }}>Eveniment nou</Text>
                <Text className="t-meta mt-0.5" style={{ color: 'var(--c-muted)' }}>Apare imediat în programul echipei.</Text>
              </View>
              <Pressable
                onPress={close}
                disabled={addingEvent}
                accessibilityRole="button"
                accessibilityLabel="Închide"
                className="ui-press w-9 h-9 rounded-full items-center justify-center"
                style={{ backgroundColor: 'var(--c-surface-2)' }}
              >
                <MaterialIcons name="close" size={18} color="var(--c-ink-soft)" />
              </Pressable>
            </View>
          </View>

          {/* Body */}
          <ScrollView ref={scrollRef} className="flex-1" contentContainerStyle={{ padding: 20, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
            <View className="gap-6">
              <Section title="Tip">
                {/* Wraps instead of scrolling so all five are visible at once. */}
                <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup" accessibilityLabel="Tip eveniment">
                  {TYPE_ORDER.map((type) => {
                    const meta = EVENT_TYPE_META[type];
                    const selected = newEventType === type;
                    return (
                      <Pressable
                        key={type}
                        onPress={() => {
                          setNewEventType(type);
                          if (type !== 'training') clearError('recurringDays');
                        }}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        accessibilityLabel={meta.label}
                        className="ui-press h-10 rounded-full border px-3.5 flex-row items-center gap-1.5"
                        style={{
                          backgroundColor: selected ? meta.soft : 'var(--c-surface)',
                          borderColor: selected ? meta.solid : 'var(--c-border)',
                          boxShadow: selected ? `inset 0 0 0 1px ${meta.solid}` : 'none',
                        } as any}
                      >
                        <MaterialIcons name={TYPE_ICON[type]} size={15} color={selected ? meta.onSoft : 'var(--c-muted)'} />
                        <Text className="text-[13px] font-semibold" style={{ color: selected ? meta.onSoft : 'var(--c-ink-soft)' }}>
                          {meta.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Section>

              <Section title="Detalii">
                <FormField
                  label="Titlu"
                  value={newTitle}
                  onChangeText={(value: string) => { setNewTitle(value); clearError('title'); }}
                  placeholder={isTraining ? 'ex. Antrenament aruncări U16' : 'ex. CSM Focșani vs CSU Brașov'}
                  error={addEventErrors.title}
                  maxLength={255}
                />

                <View>
                  <Label>Echipă</Label>
                  <View className="relative">
                    {/* Native select: the phone's own picker, no custom sheet. */}
                    <select
                      className={nativeInputClass}
                      style={{
                        backgroundColor: 'var(--c-surface-2)',
                        borderColor: addEventErrors.team ? 'var(--c-danger)' : 'var(--c-border)',
                        color: newTeamId == null ? 'var(--c-faint)' : 'var(--c-ink)',
                        appearance: 'none',
                        paddingRight: 36,
                      }}
                      value={newTeamId ?? ''}
                      onChange={(event) => {
                        const value = event.target.value;
                        setNewTeamId(value ? Number(value) : null);
                        clearError('team');
                      }}
                      aria-label="Echipă"
                    >
                      <option value="">Alege echipa</option>
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>{team.name}</option>
                      ))}
                    </select>
                    <View className="absolute right-3 top-0 bottom-0 justify-center" style={{ pointerEvents: 'none' } as any}>
                      <MaterialIcons name="expand-more" size={18} color="var(--c-faint)" />
                    </View>
                  </View>
                  <FieldError message={addEventErrors.team} />
                </View>

                <View>
                  <FormField
                    label="Locație"
                    icon="place"
                    value={newLocation}
                    onChangeText={(value: string) => { setNewLocation(value); clearError('location'); }}
                    placeholder="Sală, teren sau link"
                    error={addEventErrors.location}
                    maxLength={255}
                  />
                  {locationSuggestions.length ? (
                    <View className="flex-row flex-wrap gap-1.5 mt-2">
                      {locationSuggestions.map((location) => (
                        <Pressable
                          key={location}
                          onPress={() => { setNewLocation(location); clearError('location'); }}
                          accessibilityRole="button"
                          accessibilityLabel={`Folosește locația ${location}`}
                          className="ui-press h-8 rounded-full px-3 justify-center border"
                          style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border-soft)' } as any}
                        >
                          <Text className="text-[12.5px] font-medium" style={{ color: 'var(--c-ink-soft)' }} numberOfLines={1}>{location}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              </Section>

              <Section
                title="Când"
                trailing={isTraining ? (
                  <View className="flex-row items-center gap-2">
                    <Text className="text-[12.5px] font-semibold" style={{ color: 'var(--c-ink-soft)' }}>Se repetă</Text>
                    <Switch
                      value={isRecurring}
                      onValueChange={(value: boolean) => { setIsRecurring(value); clearError('recurringDays'); }}
                      accessibilityLabel="Antrenament recurent"
                    />
                  </View>
                ) : null}
              >
                <View className={`grid gap-3 ${isTraining ? 'grid-cols-1' : 'grid-cols-2'}`}>
                  <View className="min-w-0">
                    <Label>{isTraining ? 'Data' : 'Început'}</Label>
                    <input
                      type="date"
                      className={nativeInputClass}
                      style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)', color: 'var(--c-ink)' }}
                      value={toDateInput(newStartDate)}
                      onChange={(event) => {
                        const date = fromDateInput(event.target.value);
                        if (!date) return;
                        setNewStartDate(date);
                        if (newEndDate < date) setNewEndDate(date);
                      }}
                      aria-label="Data de început"
                    />
                  </View>
                  {!isTraining ? (
                    <View className="min-w-0">
                      <Label>Sfârșit</Label>
                      <input
                        type="date"
                        className={nativeInputClass}
                        style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)', color: 'var(--c-ink)' }}
                        value={toDateInput(newEndDate)}
                        min={toDateInput(newStartDate)}
                        onChange={(event) => {
                          const date = fromDateInput(event.target.value);
                          if (date) setNewEndDate(date);
                        }}
                        aria-label="Data de sfârșit"
                      />
                    </View>
                  ) : null}
                </View>

                <View className="grid grid-cols-2 gap-3">
                  {(['start', 'end'] as const).map((field) => {
                    const error = field === 'start' ? addEventErrors.startTime : addEventErrors.endTime;
                    return (
                      <View key={field} className="min-w-0">
                        <Label>{field === 'start' ? 'Ora de început' : 'Ora de sfârșit'}</Label>
                        <input
                          type="time"
                          step={300}
                          className={nativeInputClass}
                          style={{
                            backgroundColor: 'var(--c-surface-2)',
                            borderColor: error ? 'var(--c-danger)' : 'var(--c-border)',
                            color: 'var(--c-ink)',
                          }}
                          value={field === 'start' ? newStartTime : newEndTime}
                          onChange={(event) => {
                            if (event.target.value) updatePickerTime(field, event.target.value);
                          }}
                          aria-label={field === 'start' ? 'Ora de început' : 'Ora de sfârșit'}
                        />
                        <FieldError message={error} />
                      </View>
                    );
                  })}
                </View>

                {isTraining && isRecurring ? (
                  <View className="gap-3 rounded-[14px] border p-3.5" style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border-soft)' } as any}>
                    <View>
                      <Label>Zilele săptămânii</Label>
                      <View className="flex-row justify-between gap-1">
                        {REPEAT_DAY_LABELS.map((day, index) => {
                          const selected = recurringDays.includes(index);
                          return (
                            <Pressable
                              key={day}
                              onPress={() => {
                                setRecurringDays((prev) => (prev.includes(index) ? prev.filter((d) => d !== index) : [...prev, index]));
                                clearError('recurringDays');
                              }}
                              accessibilityRole="checkbox"
                              accessibilityState={{ checked: selected }}
                              accessibilityLabel={day}
                              className="ui-press w-10 h-10 rounded-full items-center justify-center border"
                              style={{
                                backgroundColor: selected ? 'var(--c-brand-surface)' : 'var(--c-surface)',
                                borderColor: selected ? 'var(--c-brand-surface)' : 'var(--c-border)',
                              } as any}
                            >
                              <Text className="text-[12.5px] font-bold" style={{ color: selected ? 'var(--c-on-brand)' : 'var(--c-ink-soft)' }}>{day}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                      <FieldError message={addEventErrors.recurringDays} />
                    </View>
                    <View>
                      <Label>Timp de</Label>
                      <View className="flex-row rounded-[11px] p-1 gap-1" style={{ backgroundColor: 'var(--c-surface-3)' }}>
                        {REPEAT_WEEKS.map((weeks) => {
                          const selected = recurringWeeks === weeks;
                          return (
                            <Pressable
                              key={weeks}
                              onPress={() => setRecurringWeeks(weeks)}
                              accessibilityRole="radio"
                              accessibilityState={{ selected }}
                              accessibilityLabel={`${weeks} săptămâni`}
                              className="flex-1 h-9 rounded-[8px] items-center justify-center"
                              style={{ backgroundColor: selected ? 'var(--c-surface)' : 'transparent', boxShadow: selected ? 'var(--e-xs)' : 'none' } as any}
                            >
                              <Text className="text-[12.5px] font-semibold" style={{ color: selected ? 'var(--c-ink)' : 'var(--c-muted)' }}>{weeks} săpt.</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  </View>
                ) : null}
              </Section>

              {newEventType === 'camp' ? (
                <Section title="Cost">
                  <FormField
                    label="Taxă de participare (RON)"
                    icon="payments"
                    value={newAmount}
                    onChangeText={setNewAmount}
                    keyboardType="numeric"
                    inputMode="decimal"
                    placeholder="0"
                  />
                </Section>
              ) : null}

              <Section title="Note">
                <FormField
                  label="Descriere (opțional)"
                  value={newDescription}
                  onChangeText={(value: string) => { setNewDescription(value); clearError('description'); }}
                  placeholder="Obiective, echipament, detalii de logistică…"
                  multiline
                  error={addEventErrors.description}
                  maxLength={5000}
                />
              </Section>
            </View>
          </ScrollView>

          {submitError ? (
            <View
              className="mx-5 mb-1 flex-row items-center gap-2.5 rounded-[12px] border px-3.5 py-2.5"
              style={{ backgroundColor: 'var(--c-danger-bg)', borderColor: 'var(--c-danger-border)' } as any}
              accessibilityRole="alert"
            >
              <MaterialIcons name="error-outline" size={17} color="var(--c-danger-fg)" />
              <Text className="text-[13px] font-semibold flex-1" style={{ color: 'var(--c-danger-fg)' }}>{submitError}</Text>
            </View>
          ) : null}

          {/* Footer — always visible, clears the home indicator. */}
          <View
            className="flex-row gap-2.5 px-5 pt-3 border-t"
            style={{
              borderColor: 'var(--c-border-soft)',
              backgroundColor: 'var(--c-surface)',
              paddingBottom: isMobile ? 'max(14px, env(safe-area-inset-bottom))' : 16,
            } as any}
          >
            <Pressable
              onPress={close}
              disabled={addingEvent}
              accessibilityRole="button"
              accessibilityLabel="Anulează"
              className="ui-press h-11 px-5 rounded-[11px] items-center justify-center border"
              style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)', opacity: addingEvent ? 0.6 : 1 } as any}
            >
              <Text className="text-[13.5px] font-semibold" style={{ color: 'var(--c-ink-soft)' }}>Anulează</Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              disabled={addingEvent}
              accessibilityRole="button"
              accessibilityLabel="Salvează evenimentul"
              className="ui-press flex-1 h-11 rounded-[11px] flex-row items-center justify-center gap-2"
              style={{ backgroundColor: 'var(--c-brand-surface)', boxShadow: 'var(--e-brand)', opacity: addingEvent ? 0.8 : 1 } as any}
            >
              {addingEvent ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <MaterialIcons name="check" size={18} color="#FFFFFF" />
              )}
              <Text className="text-[14px] font-bold" style={{ color: '#FFFFFF' }}>
                {addingEvent ? 'Se salvează…' : isTraining && isRecurring ? 'Creează seria' : 'Salvează'}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
