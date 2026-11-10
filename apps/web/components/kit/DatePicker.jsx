"use client";

// Popover date picker over components/ui/calendar.
//
//   <FormField label="Date of birth" required>
//     <DatePicker value={dob} onChange={setDob} max={today} captionLayout="dropdown" />
//   </FormField>
//
// `value`, `min`, `max` and the onChange argument are "yyyy-MM-dd" strings; onChange
// gets "" when cleared. `name` adds a hidden input for native form posts.

import { CalendarDays, X } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CONTROL_CLASS, ICON_BUTTON_CLASS } from "./controlStyles";
import { LoadingState } from "./LoadingState";
import { formatDateValue, parseDateValue, toDateValue } from "./lib/dateValue";

// Loads the calendar the first time it opens. Not next/dynamic: a failed chunk there
// either leaves the loading state up forever or throws to the page's error boundary,
// when all that should happen is a retry inside this popover.
function useLazyCalendar(open) {
  const [state, setState] = useState({ Calendar: null, failed: false });

  const load = useCallback(() => {
    setState({ Calendar: null, failed: false });
    import("./DatePickerCalendar")
      .then((module) => setState({ Calendar: module.default, failed: false }))
      .catch(() => setState({ Calendar: null, failed: true }));
  }, []);

  const needed = open && !state.Calendar && !state.failed;
  useEffect(() => {
    if (needed) load();
  }, [needed, load]);

  return { ...state, retry: load };
}

export function DatePicker({
  id,
  name,
  value = "",
  onChange,
  min,
  max,
  placeholder,
  disabled = false,
  clearable = false,
  captionLayout = "label",
  className,
  "aria-describedby": describedBy,
  "aria-invalid": ariaInvalid,
}) {
  const { t, i18n } = useTranslation("kit");
  const autoId = useId();
  const triggerId = id ?? autoId;
  const valueId = `${triggerId}-value`;
  const [open, setOpen] = useState(false);
  const { Calendar, failed, retry } = useLazyCalendar(open);

  const display = formatDateValue(value, i18n.language);
  const showClear = clearable && Boolean(display) && !disabled;

  function handleSelect(date) {
    if (!date) return;
    onChange?.(toDateValue(date));
    setOpen(false);
  }

  return (
    <div className={cn("relative min-w-0", className)}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          id={triggerId}
          disabled={disabled}
          // A linked <label> replaces a button's text as its name, so the chosen date
          // has to be exposed as the description or a screen reader never hears it.
          aria-describedby={[valueId, describedBy].filter(Boolean).join(" ")}
          aria-invalid={ariaInvalid || undefined}
          className={cn(
            CONTROL_CLASS,
            "flex items-center gap-2 text-left",
            showClear && "pr-11",
            !display && "text-muted-foreground",
          )}
        >
          <CalendarDays aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <span id={valueId} className="truncate">
            {display || placeholder || t("date.placeholder")}
          </span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          {Calendar ? (
            <Calendar
              lng={i18n.language}
              selected={parseDateValue(value)}
              min={parseDateValue(min)}
              max={parseDateValue(max)}
              onSelect={handleSelect}
              captionLayout={captionLayout}
            />
          ) : null}
          {!Calendar && !failed ? <LoadingState variant="inline" className="p-4" /> : null}
          {failed ? (
            <div role="alert" className="flex max-w-64 flex-col items-start gap-3 p-4">
              <p className="type-body text-foreground">{t("date.loadFailed")}</p>
              <Button type="button" variant="outline" size="touch" onClick={retry}>
                {t("date.retry")}
              </Button>
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
      {showClear ? (
        <button
          type="button"
          onClick={() => onChange?.("")}
          aria-label={t("date.clear")}
          className={cn(ICON_BUTTON_CLASS, "absolute top-0 right-0")}
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
