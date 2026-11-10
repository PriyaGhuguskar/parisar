"use client";

// Copies text and says truthfully what happened. Used for invitation links and messages,
// since nothing is sent automatically (docs/onboarding/PLAN.md, decision 5).
//
//   <CopyButton value={inviteUrl} label="Copy invite link" />
//
// "Copied" appears only after the browser confirms it. Clipboard access can be refused
// and does not exist on plain http, so on failure the button says so and the person can
// copy by hand: keep the text visible on screen near the button.

import { Check, Copy, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

const RESET_MS = 2000;

function legacyCopy(text) {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission refused or document unfocused: the legacy path may still work.
    }
  }
  return legacyCopy(text);
}

export function CopyButton({
  value,
  label,
  copiedLabel,
  failedLabel,
  onCopied,
  variant = "outline",
  size = "touch",
  className,
  disabled,
}) {
  const { t } = useTranslation("kit");
  const [state, setState] = useState("idle");
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  async function handleClick() {
    clearTimeout(timerRef.current);
    const ok = await copyText(String(value ?? ""));
    setState(ok ? "copied" : "failed");
    if (ok) {
      onCopied?.();
      timerRef.current = setTimeout(() => setState("idle"), RESET_MS);
    }
  }

  const Icon = { idle: Copy, copied: Check, failed: TriangleAlert }[state];
  const text = {
    idle: label ?? t("copy.copy"),
    copied: copiedLabel ?? t("copy.copied"),
    failed: failedLabel ?? t("copy.failed"),
  }[state];

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        disabled={disabled}
        onClick={handleClick}
      >
        <Icon aria-hidden="true" className="size-4" />
        {text}
      </Button>
      <output className="sr-only">{state === "idle" ? "" : text}</output>
    </>
  );
}
