/**
 * Date helpers.
 *
 * Everything in the save is an ISO `YYYY-MM-DD` string; Date objects are only ever transient.
 * All arithmetic is in UTC so a player's birthday doesn't shift with the user's timezone.
 */

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function dateToISO(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function addDaysISO(iso: string, days: number): string {
  return dateToISO(addDays(parseISO(iso), days));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / 86_400_000);
}

export function yearsBetween(from: string, to: string): number {
  const a = parseISO(from);
  const b = parseISO(to);
  let years = b.getUTCFullYear() - a.getUTCFullYear();
  const monthDiff = b.getUTCMonth() - a.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && b.getUTCDate() < a.getUTCDate())) years--;
  return years;
}

export function isBefore(a: string, b: string): boolean {
  return a < b;
}

export function isAfter(a: string, b: string): boolean {
  return a > b;
}

export function isSameOrAfter(a: string, b: string): boolean {
  return a >= b;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function formatDate(iso: string): string {
  const d = parseISO(iso);
  return `${DAYS[d.getUTCDay()].slice(0, 3)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`;
}

export function formatLongDate(iso: string): string {
  const d = parseISO(iso);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function dayOfWeek(iso: string): number {
  return parseISO(iso).getUTCDay();
}

export function monthOf(iso: string): number {
  return parseISO(iso).getUTCMonth() + 1;
}

export function yearOf(iso: string): number {
  return parseISO(iso).getUTCFullYear();
}

/**
 * Season label for a date. The English season runs July to June, so 2026-08-15 and 2027-03-01
 * both belong to "2026/27".
 */
export function seasonLabel(iso: string): string {
  const y = yearOf(iso);
  const m = monthOf(iso);
  const startYear = m >= 7 ? y : y - 1;
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`;
}

export function seasonStartYear(iso: string): number {
  return monthOf(iso) >= 7 ? yearOf(iso) : yearOf(iso) - 1;
}

/** Find the next occurrence of a weekday (0 = Sunday) on or after the given date. */
export function nextWeekday(iso: string, weekday: number): string {
  const d = parseISO(iso);
  const diff = (weekday - d.getUTCDay() + 7) % 7;
  return dateToISO(addDays(d, diff));
}
