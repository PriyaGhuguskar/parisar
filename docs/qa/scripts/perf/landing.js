// Public landing + connect page (anonymous, READ ONLY). Hits the Next.js server.
import http from "k6/http";
import { check, sleep } from "k6";
import { WEB_URL, stagedOptions } from "./lib.js";

export const options = stagedOptions(200);

export default function () {
  const r = http.get(`${WEB_URL}/`, { tags: { name: "web:/" } });
  check(r, { "landing 200": (x) => x.status === 200 });
  sleep(1);
  const c = http.get(`${WEB_URL}/connect`, { tags: { name: "web:/connect" } });
  check(c, { "connect 200": (x) => x.status === 200 });
  sleep(2 + Math.random() * 3);
}
