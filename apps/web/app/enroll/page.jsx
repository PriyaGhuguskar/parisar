import { redirect } from "next/navigation";

// /enroll moved to /connect. Middleware already redirects (lib/supabase/middleware.js,
// PUBLIC_REDIRECTS); this covers any request that reaches the page anyway, and keeps
// the query string so shared links still work.
export default async function Enroll({ searchParams }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries((await searchParams) ?? {})) {
    for (const item of [].concat(value)) params.append(key, String(item));
  }
  const query = params.toString();
  redirect(query ? `/connect?${query}` : "/connect");
}
