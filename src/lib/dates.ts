import type { Timestamp } from "firebase/firestore";

const pad = (value: number) => String(value).padStart(2, "0");

export const getDateKey = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const getTodayKey = () => getDateKey(new Date());

export const getYesterdayKey = () => {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return getDateKey(date);
};

export const getWindowDateKeys = (days: number, endDate: Date = new Date()) => {
  const keys: string[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(endDate);
    date.setDate(date.getDate() - offset);
    keys.push(getDateKey(date));
  }
  return keys;
};

export const getStartOfWindow = (days: number, endDate: Date = new Date()) => {
  const start = new Date(endDate);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return start;
};

export const dateKeyToDate = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }
  return new Date(year, month - 1, day);
};

export const toDate = (
  input?: string | number | Date | Timestamp | { toDate: () => Date } | null
): Date | null => {
  if (!input) {
    return null;
  }
  if (input instanceof Date) {
    return input;
  }
  if (typeof input === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
      return dateKeyToDate(input);
    }
    const parsed = new Date(input);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof input === "number") {
    return new Date(input);
  }
  if (typeof (input as Timestamp).toDate === "function") {
    return (input as Timestamp).toDate();
  }
  return null;
};

export const formatDateFR = (
  input?: string | number | Date | Timestamp | { toDate: () => Date } | null
) => {
  const date = toDate(input);
  if (!date) {
    return "-";
  }
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
};

export const getDateKeyFromValue = (
  input?: string | number | Date | Timestamp | { toDate: () => Date } | null
) => {
  const date = toDate(input);
  return date ? getDateKey(date) : null;
};
