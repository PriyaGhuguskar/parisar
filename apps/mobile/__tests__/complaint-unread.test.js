import { fetchUnreadComplaintCount } from "../lib/complaint-unread";

describe("fetchUnreadComplaintCount (stub)", () => {
  it("returns 0 in v1 stub", async () => {
    expect(await fetchUnreadComplaintCount({}, "u-1")).toBe(0);
  });

  it("returns 0 regardless of args (stub ignores inputs)", async () => {
    expect(await fetchUnreadComplaintCount(null, null)).toBe(0);
    expect(await fetchUnreadComplaintCount(undefined, undefined)).toBe(0);
  });
});
