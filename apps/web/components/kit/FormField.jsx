"use client";

// Label, required marker, hint and error for one control, with the aria wiring done.
//
//   <FormField label="Society name" required hint="As registered" error={errors.name}>
//     <TextInput value={name} onChange={...} />
//   </FormField>
//
// The child element receives id, aria-describedby, aria-invalid and aria-required.
// For a control that needs those somewhere else, pass a function:
// {(fieldProps) => <Custom inputProps={fieldProps} />}. Use `group` for a set of
// radios or checkboxes: it renders a fieldset and legend instead of a label.

import { AlertCircle } from "lucide-react";
import { cloneElement, isValidElement, useId } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

function joinIds(...ids) {
  return ids.filter(Boolean).join(" ") || undefined;
}

export function FormField({
  label,
  required = false,
  optional = false,
  hint,
  error,
  group = false,
  labelHidden = false,
  className,
  children,
}) {
  const { t } = useTranslation("kit");
  const autoId = useId();
  const childProps = isValidElement(children) ? children.props : {};
  const id = childProps.id ?? autoId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  const fieldProps = {
    id,
    "aria-describedby": joinIds(childProps["aria-describedby"], hintId, errorId),
    "aria-invalid": error ? true : childProps["aria-invalid"],
    "aria-required": required ? true : undefined,
  };

  let control = children;
  if (typeof children === "function") control = children(fieldProps);
  else if (isValidElement(children)) control = cloneElement(children, fieldProps);

  const Root = group ? "fieldset" : "div";
  const Caption = group ? "legend" : "label";

  return (
    <Root className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Caption
        {...(group ? {} : { htmlFor: id })}
        className={cn(
          "type-label flex items-baseline gap-1 text-foreground",
          labelHidden && "sr-only",
        )}
      >
        {label}
        {required ? (
          <>
            <span aria-hidden="true" className="text-destructive">
              *
            </span>
            <span className="sr-only">({t("form.required")})</span>
          </>
        ) : null}
        {optional && !required ? (
          <span className="type-caption font-normal text-muted-foreground">
            {t("form.optional")}
          </span>
        ) : null}
      </Caption>
      {control}
      {hint ? (
        <p id={hintId} className="type-body-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="type-body-sm flex gap-1.5 text-destructive">
          <AlertCircle aria-hidden="true" className="mt-[3px] size-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </Root>
  );
}
