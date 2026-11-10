"use client";

// Loaded on demand by DatePicker, so react-day-picker stays out of every page that
// imports the kit.
//
// All text comes from Intl and the kit shard, not a date-fns locale: date-fns ships no
// Marathi one, and DayPicker's own aria labels are English in every locale.

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Calendar } from "@/components/ui/calendar";
import { intlLocale } from "./lib/dateValue";

function buildText(lng, t) {
  const locale = intlLocale(lng);
  const fmt = (options) => new Intl.DateTimeFormat(locale, options);
  const caption = fmt({ month: "long", year: "numeric" });
  const weekdayShort = fmt({ weekday: "short" });
  const weekdayLong = fmt({ weekday: "long" });
  const monthShort = fmt({ month: "short" });
  const fullDate = fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return {
    formatters: {
      formatCaption: (date) => caption.format(date),
      formatWeekdayName: (date) => weekdayShort.format(date),
      formatMonthDropdown: (date) => monthShort.format(date),
    },
    labels: {
      labelGrid: (date) => caption.format(date),
      labelWeekday: (date) => weekdayLong.format(date),
      labelNav: () => t("date.nav"),
      labelNext: () => t("date.nextMonth"),
      labelPrevious: () => t("date.previousMonth"),
      labelMonthDropdown: () => t("date.monthDropdown"),
      labelYearDropdown: () => t("date.yearDropdown"),
      labelDayButton: (date, modifiers) => {
        const label = fullDate.format(date);
        if (modifiers.selected) return t("date.selectedDay", { date: label });
        return modifiers.today ? t("date.today", { date: label }) : label;
      },
    },
  };
}

/**
 * The month the calendar opens on: the chosen date, else today, kept inside
 * [min, max]. Opening on `max` would show a far-future month first for pickers
 * that allow the next 90 days, and today for date-of-birth pickers.
 */
export function initialMonth(selected, min, max, today = new Date()) {
  if (selected) return selected;
  if (max && today > max) return max;
  if (min && today < min) return min;
  return today;
}

export default function DatePickerCalendar({ lng, selected, min, max, onSelect, captionLayout }) {
  const { t } = useTranslation("kit");
  const { formatters, labels } = useMemo(() => buildText(lng, t), [lng, t]);
  const disabled = [...(min ? [{ before: min }] : []), ...(max ? [{ after: max }] : [])];
  return (
    <Calendar
      mode="single"
      required
      autoFocus
      selected={selected}
      defaultMonth={initialMonth(selected, min, max)}
      onSelect={onSelect}
      disabled={disabled}
      startMonth={min}
      endMonth={max}
      captionLayout={captionLayout}
      formatters={formatters}
      labels={labels}
      // 44px day cells, shrinking only when seven of them cannot fit a 320px phone.
      className="bg-transparent [--cell-size:min(2.75rem,calc((100vw_-_3rem)/7))]"
    />
  );
}
