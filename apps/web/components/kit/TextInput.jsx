"use client";

// components/ui/input and textarea at the kit's 44px size and token styling.

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { CONTROL_CLASS } from "./controlStyles";

export function TextInput({ className, ...props }) {
  return <Input className={cn(CONTROL_CLASS, className)} {...props} />;
}

export function TextArea({ className, ...props }) {
  return <Textarea className={cn(CONTROL_CLASS, "h-auto min-h-24 py-2.5", className)} {...props} />;
}
