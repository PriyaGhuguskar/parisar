// /residents — the resident lists start on Owners.
// JavaScript only — no TypeScript per CLAUDE.md.

import { redirect } from "next/navigation";

export default function ResidentsIndexPage() {
  redirect("/residents/owners");
}
