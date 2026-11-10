"use client";

// "When should we call?": call as soon as possible, or a preferred date and time with
// an optional alternative. Times are India Standard Time; lib/connectForm turns them
// into +05:30 timestamps so a visitor abroad still books the slot they read.

import { AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DatePicker, FormField, TextInput } from "@/components/kit";
import { cn } from "@/lib/utils";

function SlotFields({
  idPrefix,
  legend,
  hint,
  required,
  date,
  time,
  errors,
  onChange,
  min,
  max,
  disabled,
}) {
  const { t } = useTranslation("connect");
  const groupErrorId = `${idPrefix}-slot-error`;
  const slotError = errors.slot;
  const extra = slotError ? groupErrorId : undefined;
  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="type-label mb-1.5 flex items-baseline gap-1 text-foreground">
        {legend}
        {required ? (
          <>
            <span aria-hidden="true" className="text-destructive">
              *
            </span>
            <span className="sr-only">({t("kit:form.required")})</span>
          </>
        ) : (
          <span className="type-caption font-normal text-muted-foreground">
            {t("kit:form.optional")}
          </span>
        )}
      </legend>
      {hint ? <p className="type-body-sm -mt-1 text-muted-foreground">{hint}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("form.date")} required={required} error={errors.date && t(errors.date)}>
          <DatePicker
            id={`${idPrefix}-date`}
            value={date}
            min={min}
            max={max}
            disabled={disabled}
            clearable={!required}
            aria-describedby={extra}
            aria-invalid={slotError ? true : undefined}
            onChange={(value) => onChange({ date: value })}
          />
        </FormField>
        <FormField label={t("form.time")} required={required} error={errors.time && t(errors.time)}>
          <TextInput
            id={`${idPrefix}-time`}
            type="time"
            step={300}
            value={time}
            disabled={disabled}
            aria-describedby={extra}
            aria-invalid={slotError ? true : undefined}
            onChange={(e) => onChange({ time: e.target.value })}
          />
        </FormField>
      </div>
      {slotError ? (
        <p id={groupErrorId} role="alert" className="type-body-sm flex gap-1.5 text-destructive">
          <AlertCircle aria-hidden="true" className="mt-[3px] size-3.5 shrink-0" />
          <span>{t(slotError)}</span>
        </p>
      ) : null}
    </fieldset>
  );
}

function WhenOption({ value, checked, label, onSelect, disabled }) {
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors focus-within:ring-2 focus-within:ring-ring",
        checked
          ? "border-primary bg-primary-soft text-primary-soft-foreground"
          : "border-input bg-card text-foreground",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <input
        type="radio"
        name="connect-when"
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onSelect(value)}
        className="size-4 accent-primary"
      />
      <span className="type-body font-medium">{label}</span>
    </label>
  );
}

export function ScheduleSection({ form, errors, onChange, min, max, disabled }) {
  const { t } = useTranslation("connect");
  return (
    <div className="flex flex-col gap-5">
      <FormField label={t("form.whenLabel")} required group>
        {() => (
          <div className="grid gap-2 sm:grid-cols-2">
            <WhenOption
              value="schedule"
              checked={form.when !== "now"}
              label={t("form.whenSchedule")}
              disabled={disabled}
              onSelect={(when) => onChange({ when })}
            />
            <WhenOption
              value="now"
              checked={form.when === "now"}
              label={t("form.whenNow")}
              disabled={disabled}
              onSelect={(when) => onChange({ when })}
            />
          </div>
        )}
      </FormField>

      {form.when === "now" ? (
        <p className="type-body-sm text-muted-foreground">{t("form.whenNowHint")}</p>
      ) : (
        <>
          <p className="type-body-sm text-muted-foreground">{t("form.timezoneHint")}</p>
          <SlotFields
            idPrefix="connect-preferred"
            legend={t("form.preferred")}
            required
            date={form.preferredDate}
            time={form.preferredTime}
            errors={{
              date: errors.preferredDate,
              time: errors.preferredTime,
              slot: errors.preferredSlot,
            }}
            min={min}
            max={max}
            disabled={disabled}
            onChange={({ date, time }) =>
              onChange(date !== undefined ? { preferredDate: date } : { preferredTime: time })
            }
          />
          <SlotFields
            idPrefix="connect-alternate"
            legend={t("form.alternate")}
            hint={t("form.alternateHint")}
            date={form.alternateDate}
            time={form.alternateTime}
            errors={{
              date: errors.alternateDate,
              time: errors.alternateTime,
              slot: errors.alternateSlot,
            }}
            min={min}
            max={max}
            disabled={disabled}
            onChange={({ date, time }) =>
              onChange(date !== undefined ? { alternateDate: date } : { alternateTime: time })
            }
          />
        </>
      )}
    </div>
  );
}
