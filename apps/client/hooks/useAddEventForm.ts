import { useCallback, useState } from 'react';
import { Alert } from '@/src/web/reactNative';
import AsyncStorage from '@/src/web/asyncStorage';
import { eventsApi } from '../services/eventsApi';

export type AddEventType = 'training' | 'match' | 'camp' | 'admin' | 'medical';
export type AddEventFormField = 'title' | 'description' | 'location' | 'team' | 'startTime' | 'endTime' | 'recurringDays';
export type AddEventFormErrors = Partial<Record<AddEventFormField, string>>;

const RECENT_LOCATIONS_KEY = 'recent_locations';

function toLocalDateStr(d: Date) {
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

function getLocalDateTime(date: Date, time: string) {
  return new Date(`${toLocalDateStr(date)}T${time}:00`);
}

function parseTimeToMinutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes: number) {
  const normalized = Math.max(0, Math.min(totalMinutes, 23 * 60 + 59));
  const hours = Math.floor(normalized / 60).toString().padStart(2, '0');
  const minutes = (normalized % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

function formatTimeInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 1) return digits;
  if (digits.length === 2) return `${digits}:`;

  const firstTwo = Number(digits.slice(0, 2));
  if (digits.length === 3 && firstTwo > 23) {
    return `0${digits[0]}:${digits.slice(1)}`;
  }

  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function normalizeTimeValue(value: string, fallback: string) {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (!digits) return fallback;

  let hours = 0;
  let minutes = 0;

  if (digits.length === 1) {
    hours = Number(digits);
  } else if (digits.length === 2) {
    hours = Number(digits);
  } else if (digits.length === 3) {
    const firstTwo = Number(digits.slice(0, 2));
    if (firstTwo > 23) {
      hours = Number(digits[0]);
      minutes = Number(digits.slice(1));
    } else {
      hours = firstTwo;
      minutes = Number(digits[2]) * 10;
    }
  } else {
    hours = Number(digits.slice(0, 2));
    minutes = Number(digits.slice(2));
  }

  hours = Math.max(0, Math.min(hours, 23));
  minutes = Math.max(0, Math.min(minutes, 59));
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

function keepEndAfterStart(startTime: string, endTime: string) {
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  if (startMinutes == null || endMinutes == null || endMinutes > startMinutes) {
    return endTime;
  }

  return minutesToTime(Math.min(startMinutes + 60, 23 * 60 + 59));
}

/**
 * Owns every piece of state and validation logic behind the "Add Event"
 * modal (including the recurring-training scheduler). Extracted out of the
 * admin schedule screen so that screen only has to wire up UI.
 */
export function useAddEventForm(onCreated: () => void) {
  const [newEventType, setNewEventType] = useState<AddEventType>('training');
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newStartTime, setNewStartTime] = useState('09:00');
  const [newEndTime, setNewEndTime] = useState('10:00');
  const [newLocation, setNewLocation] = useState('');
  const [newTeamId, setNewTeamId] = useState<number | null>(null);
  const [newAmount, setNewAmount] = useState('');
  const [addEventErrors, setAddEventErrors] = useState<AddEventFormErrors>({});
  const [newStartDate, setNewStartDate] = useState(new Date());
  const [newEndDate, setNewEndDate] = useState(new Date());
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringDays, setRecurringDays] = useState<number[]>([]); // 0=Mon,...,6=Sun
  const [recurringWeeks, setRecurringWeeks] = useState(4);
  const [recentLocations, setRecentLocations] = useState<string[]>([]);
  const [addingEvent, setAddingEvent] = useState(false);

  const loadRecentLocations = useCallback(async () => {
    try {
      const saved = await AsyncStorage.getItem(RECENT_LOCATIONS_KEY);
      if (saved) setRecentLocations(JSON.parse(saved));
    } catch (e) {
      console.error('Load locations error', e);
    }
  }, []);

  const saveLocation = useCallback(async (location: string) => {
    if (!location) return;
    setRecentLocations((current) => {
      const updated = [location, ...current.filter((l) => l !== location)].slice(0, 5);
      AsyncStorage.setItem(RECENT_LOCATIONS_KEY, JSON.stringify(updated)).catch((e) =>
        console.error('Save location error', e)
      );
      return updated;
    });
  }, []);

  const clearError = useCallback((field: AddEventFormField) => {
    setAddEventErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }, []);

  const handleTimeInputChange = useCallback((field: 'start' | 'end', value: string) => {
    const nextValue = formatTimeInput(value);
    if (field === 'start') {
      setNewStartTime(nextValue);
      clearError('startTime');
      return;
    }
    setNewEndTime(nextValue);
    clearError('endTime');
  }, [clearError]);

  const handleTimeInputBlur = useCallback((field: 'start' | 'end') => {
    setNewStartTime((currentStart) => {
      const normalizedStart = normalizeTimeValue(currentStart, '09:00');
      setNewEndTime((currentEnd) => keepEndAfterStart(normalizedStart, normalizeTimeValue(currentEnd, '10:00')));
      return normalizedStart;
    });
    void field;
  }, []);

  const updatePickerTime = useCallback((field: 'start' | 'end', value: string) => {
    if (field === 'start') {
      setNewStartTime(value);
      setNewEndTime((currentEnd) => keepEndAfterStart(value, normalizeTimeValue(currentEnd, '10:00')));
      clearError('startTime');
      return;
    }

    setNewStartTime((currentStart) => {
      const normalizedStart = normalizeTimeValue(currentStart, '09:00');
      setNewEndTime(keepEndAfterStart(normalizedStart, value));
      return normalizedStart;
    });
    clearError('endTime');
  }, [clearError]);

  const validateForm = useCallback(() => {
    const errors: AddEventFormErrors = {};
    const title = newTitle.trim();
    const description = newDescription.trim();
    const location = newLocation.trim();

    if (!title) {
      errors.title = 'Titlul evenimentului este obligatoriu.';
    }

    // Descrierea este opțională; validăm lungimea minimă doar dacă a fost completată.
    if (description && description.length < 12) {
      errors.description = 'Descrierea ar trebui să aibă cel puțin 12 caractere.';
    }

    if (!location) {
      errors.location = 'Adaugă o sală, o locație sau un link de întâlnire online.';
    }

    if (!newTeamId) {
      errors.team = 'Selectează echipa sau grupul căruia îi aparține evenimentul.';
    }

    const effectiveStartTime = normalizeTimeValue(newStartTime, '09:00');
    const effectiveEndTime = keepEndAfterStart(effectiveStartTime, normalizeTimeValue(newEndTime, '10:00'));

    if (!effectiveStartTime) {
      errors.startTime = 'Ora de început este obligatorie.';
    }
    if (!effectiveEndTime) {
      errors.endTime = 'Ora de sfârșit este obligatorie.';
    }

    if (effectiveStartTime && effectiveEndTime) {
      const start = getLocalDateTime(newStartDate, effectiveStartTime);
      const endDate = newEventType !== 'training' ? newEndDate : newStartDate;
      const end = getLocalDateTime(endDate, effectiveEndTime);

      if (Number.isNaN(start.getTime())) {
        errors.startTime = 'Alege o oră de început validă.';
      }
      if (Number.isNaN(end.getTime()) || end <= start) {
        errors.endTime = 'Ora de sfârșit trebuie să fie după ora de început.';
      }
    }

    if (newEventType === 'training' && isRecurring && recurringDays.length === 0) {
      errors.recurringDays = 'Alege cel puțin o zi pentru antrenamentele recurente.';
    }

    setAddEventErrors(errors);
    return Object.keys(errors).length === 0;
  }, [newTitle, newDescription, newLocation, newTeamId, newStartTime, newEndTime, newStartDate, newEndDate, newEventType, isRecurring, recurringDays]);

  const resetForm = useCallback(() => {
    setNewTitle('');
    setNewDescription('');
    setNewStartTime('09:00');
    setNewEndTime('10:00');
    setNewLocation('');
    setNewTeamId(null);
    setNewAmount('');
    setIsRecurring(false);
    setRecurringDays([]);
    setRecurringWeeks(4);
    setAddEventErrors({});
  }, []);

  /** Pre-fills the start/end date, used by the day-cell "quick add" action. */
  const prefillDate = useCallback((date: Date) => {
    setNewStartDate(date);
    setNewEndDate(date);
  }, []);

  const submit = useCallback(async () => {
    if (addingEvent) return false;

    const effectiveStartTime = normalizeTimeValue(newStartTime, '09:00');
    const effectiveEndTime = keepEndAfterStart(effectiveStartTime, normalizeTimeValue(newEndTime, '10:00'));
    setNewStartTime(effectiveStartTime);
    setNewEndTime(effectiveEndTime);

    if (!validateForm()) {
      return false;
    }

    setAddingEvent(true);
    try {
      if (newEventType === 'training' && isRecurring && recurringDays.length > 0) {
        // For each selected weekday (0=Mon, 1=Tue, ..., 6=Sun in our UI)
        // Find the FIRST occurrence of that weekday on or after newStartDate,
        // then create one event per week for recurringWeeks weeks.
        const datesToCreate: Date[] = [];

        for (const dayOffset of recurringDays) {
          const targetJsDay = dayOffset === 6 ? 0 : dayOffset + 1; // Mon=1 … Sun=0
          const base = new Date(newStartDate);
          base.setHours(0, 0, 0, 0);
          const baseJsDay = base.getDay();
          const daysUntilTarget = (targetJsDay - baseJsDay + 7) % 7;
          const firstOccurrence = new Date(base);
          firstOccurrence.setDate(base.getDate() + daysUntilTarget);

          for (let week = 0; week < recurringWeeks; week++) {
            const d = new Date(firstOccurrence);
            d.setDate(firstOccurrence.getDate() + week * 7);
            datesToCreate.push(d);
          }
        }

        const unique = [...new Map(datesToCreate.map((d) => [d.toDateString(), d])).values()]
          .sort((a, b) => a.getTime() - b.getTime());

        await Promise.all(unique.map((date) => {
          const dateStr = toLocalDateStr(date);
          return eventsApi.createEvent({
            type: newEventType,
            title: newTitle.trim(),
            description: newDescription.trim(),
            startTime: `${dateStr}T${effectiveStartTime}:00`,
            endTime: `${dateStr}T${effectiveEndTime}:00`,
            location: newLocation.trim(),
            teamId: newTeamId,
            amount: null,
          });
        }));
        Alert.alert('Done', `Created ${unique.length} recurring training sessions.`);
      } else {
        const localBaseDateStr = toLocalDateStr(newStartDate);

        await eventsApi.createEvent({
          type: newEventType,
          title: newTitle.trim(),
          description: newDescription.trim(),
          startTime: `${localBaseDateStr}T${effectiveStartTime}:00`,
          endTime: `${newEventType !== 'training' ? toLocalDateStr(newEndDate) : localBaseDateStr}T${effectiveEndTime}:00`,
          location: newLocation.trim(),
          teamId: newTeamId,
          amount: newAmount ? parseInt(newAmount, 10) : null,
        });
      }

      if (newLocation.trim()) await saveLocation(newLocation.trim());
      onCreated();
      resetForm();
      return true;
    } catch (error) {
      const maybeAxiosError = error as { response?: { data?: { error?: string } }; message?: string };
      const message = maybeAxiosError.response?.data?.error || maybeAxiosError.message || 'Failed to create event';
      Alert.alert('Error', message);
      return false;
    } finally {
      setAddingEvent(false);
    }
  }, [
    addingEvent, newStartTime, newEndTime, validateForm, newEventType, isRecurring, recurringDays,
    newStartDate, recurringWeeks, newTitle, newDescription, newLocation, newTeamId, newEndDate,
    newAmount, saveLocation, onCreated, resetForm,
  ]);

  return {
    newEventType, setNewEventType,
    newTitle, setNewTitle,
    newDescription, setNewDescription,
    newStartTime, newEndTime,
    newLocation, setNewLocation,
    newTeamId, setNewTeamId,
    newAmount, setNewAmount,
    addEventErrors, clearError,
    newStartDate, setNewStartDate,
    newEndDate, setNewEndDate,
    isRecurring, setIsRecurring,
    recurringDays, setRecurringDays,
    recurringWeeks, setRecurringWeeks,
    recentLocations, loadRecentLocations,
    addingEvent,
    handleTimeInputChange, handleTimeInputBlur, updatePickerTime,
    resetForm, prefillDate, submit,
  };
}

export type AddEventFormState = ReturnType<typeof useAddEventForm>;
