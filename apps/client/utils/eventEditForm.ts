/**
 * Editing an existing event with the "Eveniment nou" form — pure, see
 * eventEditForm.test.ts.
 *
 * The form works in the browser's local time (dates and "HH:mm"); the API
 * stores instants. Times go out as ISO strings with an offset
 * (`new Date(local).toISOString()`): a naive "2026-10-22T19:00:00" is read in
 * the server's time zone (UTC on Render) and lands three hours late.
 */

import { localDateTimeToIso, parseApiDate } from './dates';

export type EditableEvent = {
  type: string;
  title: string;
  description: string | null;
  location: string | null;
  startTime: string;
  endTime: string;
  teamId: number | null;
  amount: number | null;
  opponent?: string | null;
};

export type EventFormValues = {
  type: string;
  title: string;
  description: string;
  location: string;
  teamId: number | null;
  startDate: Date;
  endDate: Date;
  startTime: string;
  endTime: string;
  amount: string;
  /** The other side of a match (events.opponent; L12, scorer). */
  opponent: string;
};

const pad = (n: number) => String(n).padStart(2, '0');

function toLocalDateStr(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toLocalTime(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** The form values that show `event` as it is stored, in local time. */
export function eventToFormValues(event: EditableEvent): EventFormValues {
  const start = parseApiDate(event.startTime);
  const end = parseApiDate(event.endTime);
  return {
    type: event.type,
    title: event.title ?? '',
    description: event.description ?? '',
    location: event.location ?? '',
    teamId: event.teamId,
    startDate: toLocalDay(start),
    endDate: toLocalDay(end),
    startTime: toLocalTime(start),
    endTime: toLocalTime(end),
    amount: event.amount != null ? String(event.amount) : '',
    opponent: event.opponent ?? '',
  };
}

/** A local calendar day + "HH:mm" as an ISO instant (UTC, `Z`). */
function toIso(date: Date, time: string) {
  const iso = localDateTimeToIso(toLocalDateStr(date), time);
  if (!iso) throw new Error(`Invalid date or time: ${toLocalDateStr(date)} ${time}`);
  return iso;
}

/**
 * The `PUT /events/:id` body. A training is a single-day session, so its end
 * shares the start's day. The fee is only sent when the caller may change it
 * (coaches may not: the server refuses any change to it).
 */
export function buildEventUpdate(values: EventFormValues, options: { includeAmount: boolean }) {
  const endDate = values.type === 'training' ? values.startDate : values.endDate;
  const body: Record<string, unknown> = {
    type: values.type,
    title: values.title.trim(),
    description: values.description.trim() || null,
    location: values.location.trim() || null,
    teamId: values.teamId,
    startTime: toIso(values.startDate, values.startTime),
    endTime: toIso(endDate, values.endTime),
    // Only a match has an opponent; changing the type clears it.
    opponent: values.type === 'match' ? values.opponent.trim() || null : null,
  };
  if (options.includeAmount) {
    const amount = values.amount.trim() ? Number(values.amount.replace(',', '.')) : null;
    body.amount = amount != null && Number.isFinite(amount) ? amount : null;
  }
  return body;
}
