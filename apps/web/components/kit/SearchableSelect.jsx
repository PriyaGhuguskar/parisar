"use client";

// Combobox over a passed list of options. The text box only filters: the value can
// only ever be one of `options`, and leaving the field restores the current choice.
//
//   <FormField label="Wing" required error={errors.wing}>
//     <SearchableSelect options={wings} value={wing} onChange={(value) => setWing(value)} />
//   </FormField>
//
// options: [{ value, label, description?, keywords?, disabled? }]
// Keys follow the ARIA combobox pattern: Up, Down, Home, End, Enter, Escape, Tab.

import { Check, ChevronDown, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { CONTROL_CLASS, ICON_BUTTON_CLASS } from "./controlStyles";

const normalize = (text) =>
  String(text ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .trim();

function matches(option, needle) {
  if (!needle) return true;
  return [option.label, option.description, option.keywords]
    .filter(Boolean)
    .some((text) => normalize(text).includes(needle));
}

function nextEnabled(list, from, step) {
  for (let i = from + step; i >= 0 && i < list.length; i += step) {
    if (!list[i].disabled) return i;
  }
  return from;
}

export function SearchableSelect({
  id,
  name,
  options = [],
  value = "",
  onChange,
  placeholder,
  searchPlaceholder,
  emptyText,
  disabled = false,
  loading = false,
  clearable = false,
  className,
  onBlur,
  "aria-describedby": describedBy,
  "aria-invalid": ariaInvalid,
  "aria-required": ariaRequired,
}) {
  const { t } = useTranslation("kit");
  const autoId = useId();
  const inputId = id ?? autoId;
  const listId = `${inputId}-list`;
  const listRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);

  const hasValue = value !== "" && value !== null && value !== undefined;
  const selected = hasValue ? options.find((o) => String(o.value) === String(value)) : undefined;
  const filtered = useMemo(() => {
    const needle = normalize(query);
    return options.filter((option) => matches(option, needle));
  }, [options, query]);

  const optionId = (index) => `${listId}-${index}`;
  const showClear = clearable && Boolean(selected) && !disabled;

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    listRef.current?.children[activeIndex]?.scrollIntoView?.({ block: "nearest" });
  }, [open, activeIndex]);

  function openList() {
    if (disabled || open) return;
    const selectedIndex = selected ? options.indexOf(selected) : -1;
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : nextEnabled(options, -1, 1));
    setOpen(true);
  }

  function closeList() {
    setOpen(false);
    setQuery("");
    setActiveIndex(-1);
  }

  function choose(option) {
    if (!option || option.disabled) return;
    onChange?.(option.value, option);
    closeList();
  }

  function handleQueryChange(event) {
    const text = event.target.value;
    const needle = normalize(text);
    setQuery(text);
    setOpen(true);
    setActiveIndex(
      nextEnabled(
        options.filter((o) => matches(o, needle)),
        -1,
        1,
      ),
    );
  }

  function handleKeyDown(event) {
    const moves = {
      ArrowDown: () => (open ? nextEnabled(filtered, activeIndex, 1) : null),
      ArrowUp: () => (open ? nextEnabled(filtered, activeIndex, -1) : null),
      Home: () => (open ? nextEnabled(filtered, -1, 1) : null),
      End: () => (open ? nextEnabled(filtered, filtered.length, -1) : null),
    };
    if (moves[event.key]) {
      if (!open && (event.key === "Home" || event.key === "End")) return;
      event.preventDefault();
      if (open) setActiveIndex(moves[event.key]());
      else openList();
    } else if (event.key === "Enter" && open) {
      // Stays in the field, so a half-finished search never submits the form.
      event.preventDefault();
      choose(filtered[activeIndex]);
    } else if (event.key === "Escape" && open) {
      // Only closes the list, not a dialog this field sits inside.
      event.preventDefault();
      event.stopPropagation();
      closeList();
    } else if (event.key === "Tab" && open) {
      closeList();
    }
  }

  function handleBlur(event) {
    closeList();
    onBlur?.(event);
  }

  const noResults = open && !loading && filtered.length === 0;

  return (
    <div className={cn("relative min-w-0", className)}>
      {name ? <input type="hidden" name={name} value={hasValue ? value : ""} /> : null}
      <input
        id={inputId}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        aria-describedby={describedBy}
        aria-invalid={ariaInvalid || undefined}
        aria-required={ariaRequired || undefined}
        disabled={disabled}
        value={open ? query : (selected?.label ?? "")}
        placeholder={
          open
            ? (selected?.label ?? searchPlaceholder ?? t("select.searchPlaceholder"))
            : (placeholder ?? t("select.placeholder"))
        }
        onChange={handleQueryChange}
        onClick={openList}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className={cn(CONTROL_CLASS, "pr-11")}
      />
      {showClear ? (
        <button
          type="button"
          // Keeps focus in the input: a blur here would close the list mid-click.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onChange?.("", null);
            closeList();
          }}
          aria-label={t("select.clear")}
          className={cn(ICON_BUTTON_CLASS, "absolute top-0 right-0")}
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      ) : (
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute top-3.5 right-3 size-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      )}
      {open ? (
        <>
          {/* preventDefault keeps focus in the input, so a blur cannot close the list mid-click. */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: mouse-only focus guard, no action */}
          <div
            onMouseDown={(event) => event.preventDefault()}
            className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-overlay"
          >
            <div
              id={listId}
              ref={listRef}
              role="listbox"
              aria-label={placeholder ?? t("select.placeholder")}
              className={cn("max-h-64 overflow-auto", filtered.length > 0 && "p-1")}
            >
              {filtered.map((option, index) => {
                const isSelected = option === selected;
                return (
                  // Focus stays on the input (aria-activedescendant), which handles the keys.
                  // biome-ignore lint/a11y/useFocusableInteractive: see above
                  // biome-ignore lint/a11y/useKeyWithClickEvents: see above
                  <div
                    key={option.value}
                    id={optionId(index)}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={option.disabled || undefined}
                    onClick={() => choose(option)}
                    onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-[15px]",
                      index === activeIndex && "bg-accent text-accent-foreground",
                      option.disabled && "cursor-not-allowed text-muted-foreground opacity-70",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block">{option.label}</span>
                      {option.description ? (
                        <span className="type-body-sm block text-muted-foreground">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                    {isSelected ? (
                      <Check aria-hidden="true" className="size-4 shrink-0 text-primary" />
                    ) : null}
                  </div>
                );
              })}
            </div>
            {loading ? (
              <p className="type-body-sm px-3 py-3 text-muted-foreground">{t("select.loading")}</p>
            ) : null}
            {noResults ? (
              <p className="type-body-sm px-3 py-3 text-muted-foreground">
                {emptyText ?? t("select.noResults")}
              </p>
            ) : null}
          </div>
          <output className="sr-only">
            {loading
              ? t("select.loading")
              : noResults
                ? (emptyText ?? t("select.noResults"))
                : t("select.results", { n: filtered.length })}
          </output>
        </>
      ) : null}
    </div>
  );
}
