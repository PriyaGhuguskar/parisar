// STAGING ONLY — exercises Excel import validation (import_validate_rows) with N synthetic rows.
// Each iteration creates an import batch; cancel it afterwards. Low concurrency by design:
// import is an admin action; measure latency vs. batch size (100, 500, 1000, 5000 rows).
// Env: TOKENS_FILE (authority tokens of a LOAD- society), ROWS (default 500)
import { rpc, tokenForVu, SOCIETY_ID } from "./lib.js";

export const options = {
  scenarios: { imp: { executor: "per-vu-iterations", vus: Number(__ENV.TARGET_VUS || 5), iterations: 3 } },
  thresholds: { "http_req_duration{name:rpc:import_validate_rows}": ["p(95)<10000"] },
};

export default function () {
  const n = Number(__ENV.ROWS || 500);
  const rows = Array.from({ length: n }, (_, i) => ({
    wing: "A", flat: String(100 + (i % 400)), name: `LOAD Resident ${i}`,
    phone: `9${String(800000000 + i).padStart(9, "0")}`, resident_type: i % 3 ? "owner" : "tenant",
  }));

  rpc("import_validate_rows", { p_society_id: SOCIETY_ID, p_file_name: `LOAD-${__VU}-${__ITER}.xlsx`, p_rows: rows }, tokenForVu(), "rpc:import_validate_rows");
}
