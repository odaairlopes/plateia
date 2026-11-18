import { VENUE_TIME_ZONE } from '@plateia/contracts';
import { useLocale } from '@plateia/web-kit';
import { useMemo } from 'react';
import type { Formatters } from '../charts/options';

/** Locale-aware number, money and date formatting, rebuilt when the language changes. */
export function useFormatters(): Formatters & { time: (iso: string) => string; dateTime: (iso: string) => string } {
  const { locale } = useLocale();

  return useMemo(() => {
    const money = new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL' });
    const moneyCompact = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'BRL',
      notation: 'compact',
      maximumFractionDigits: 1,
    });
    const number = new Intl.NumberFormat(locale);
    const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 });
    // Calendar dates (YYYY-MM-DD) are formatted at noon UTC, so no time zone can shift the day.
    const atNoon = (isoDate: string) => new Date(`${isoDate}T12:00:00Z`);
    const shortDate = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
    const longDate = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' });
    const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
    const dateTime = new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: VENUE_TIME_ZONE,
    });

    return {
      money: (cents) => money.format(cents / 100),
      moneyCompact: (cents) => moneyCompact.format(cents / 100),
      number: (value) => number.format(value),
      percent: (ratio) => percent.format(ratio),
      shortDate: (isoDate) => shortDate.format(atNoon(isoDate)),
      longDate: (isoDate) => longDate.format(atNoon(isoDate)),
      time: (iso) => time.format(new Date(iso)),
      dateTime: (iso) => dateTime.format(new Date(iso)),
    };
  }, [locale]);
}
