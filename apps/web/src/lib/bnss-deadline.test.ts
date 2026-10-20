import { describe, expect, it } from "vitest";
import { bnssDeadline, coveredSections, normalizeSections, parseSection } from "./bnss-deadline";

/** Midday India time on an IST calendar date. */
const ist = (date: string, time = "12:00") => new Date(`${date}T${time}:00+05:30`);
const kase = (registered: string | null, sections: string[], status = "OPEN") => ({
  firRegisteredAt: registered ? ist(registered) : null,
  offenceSections: sections,
  status,
});

describe("parseSection", () => {
  it.each([
    ["BNS 64", { act: "BNS", section: 64 }],
    ["bns s.64(1)", { act: "BNS", section: 64 }],
    ["Section 70(2) BNS", { act: "BNS", section: 70 }],
    ["Bharatiya Nyaya Sanhita, 2023 - Section 71", { act: "BNS", section: 71 }],
    ["POCSO 4", { act: "POCSO", section: 4 }],
    ["POCSO Act sec. 10", { act: "POCSO", section: 10 }],
    ["POCSO Act, 2012 s.6", { act: "POCSO", section: 6 }],
  ])("%s", (raw, expected) => expect(parseSection(raw)).toEqual(expected));

  it("returns null for other acts or no number", () => {
    expect(parseSection("IPC 376")).toBeNull();
    expect(parseSection("BNS")).toBeNull();
  });
});

describe("normalizeSections", () => {
  it("splits a typed list and carries the act to bare numbers", () => {
    expect(normalizeSections("BNS 64, 74;  POCSO 4,6")).toEqual(["BNS 64", "BNS 74", "POCSO 4", "POCSO 6"]);
    expect(normalizeSections(["BNS s.64(1)", "s.70(2)", "IPC 376", "354"])).toEqual(["BNS s.64(1)", "BNS s.70(2)", "IPC 376", "354"]);
    expect(normalizeSections("BNS 64, BNS 64")).toEqual(["BNS 64"]);
    expect(normalizeSections("  ")).toEqual([]);
  });

  it("rejects absurd input", () => {
    expect(() => normalizeSections(Array.from({ length: 21 }, (_, i) => `BNS ${i}`))).toThrow(/20/);
    expect(() => normalizeSections("x".repeat(61))).toThrow(/too long/);
  });
});

describe("coveredSections", () => {
  it("keeps only the s.193(2) offences", () => {
    expect(coveredSections(["BNS 64", "BNS 74", "BNS 69", "BNS 303", "POCSO 4", "POCSO 12", "POCSO 8", "IPC 376"])).toEqual([
      "BNS 64",
      "POCSO 4",
      "POCSO 8",
    ]);
  });

  it("does not treat a sub-section number as the section (BNS 74(64) is s.74)", () => {
    expect(coveredSections(["BNS 74(64)"])).toEqual([]);
  });
});

describe("bnssDeadline", () => {
  it("day 50 of a covered case is amber (docs/07 Phase 7 done-when)", () => {
    const d = bnssDeadline(kase("2026-08-30", ["BNS 64", "BNS 74"]), ist("2026-10-19"));
    expect(d).toMatchObject({ day: 50, level: "amber", coveredSections: ["BNS 64"], registeredOn: "2026-08-30", dueOn: "2026-10-29", daysLeft: 10 });
    expect(d?.label).toBe("Day 50 of 60");
  });

  it("a non-covered section gets no deadline at all", () => {
    expect(bnssDeadline(kase("2026-08-30", ["BNS 303", "BNS 74"]), ist("2026-10-19"))).toBeNull();
  });

  it("no registration date, or a closed case, gets no deadline", () => {
    expect(bnssDeadline(kase(null, ["BNS 64"]), ist("2026-10-19"))).toBeNull();
    expect(bnssDeadline(kase("2026-08-01", ["BNS 64"], "CLOSED"), ist("2026-10-19"))).toBeNull();
  });

  it("thresholds: 44 on track, 45 amber, 54 amber, 55 red, 59 red, 60 due today (overdue), 61 overdue", () => {
    // 1 Jan 2026 + 2 months = 1 Mar (59 days), so use a 61/62-day span: 1 Jul -> 1 Sep (62 days) -> due is +60.
    const reg = "2026-07-01";
    const at = (day: number) => {
      const d = new Date(ist(reg).getTime() + day * 86400000);
      return bnssDeadline(kase(reg, ["POCSO 6"]), d)!;
    };
    expect([44, 45, 54, 55, 59, 60, 61].map((n) => at(n).level)).toEqual(["on_track", "amber", "amber", "red", "red", "overdue", "overdue"]);
    expect(at(60).label).toBe("Due today");
    expect(at(61).label).toBe("Overdue by 1 day");
    expect(at(64).label).toBe("Overdue by 4 days");
    expect(at(0).label).toBe("Day 0 of 60");
  });

  it("uses two calendar months when that is shorter than 60 days", () => {
    // 1 Jan -> 1 Mar is 59 days in 2026.
    const d = bnssDeadline(kase("2026-01-01", ["BNS 64"]), ist("2026-03-01"))!;
    expect(d.dueOn).toBe("2026-03-01");
    expect(d.level).toBe("overdue");
    expect(d.label).toBe("Due today");
    // 31 Dec -> end of February, not 3 March.
    expect(bnssDeadline(kase("2025-12-31", ["BNS 64"]), ist("2026-01-10"))!.dueOn).toBe("2026-02-28");
  });

  it("counts calendar days in India time, not UTC", () => {
    // Registered 23:30 IST on 30 Aug (18:00 UTC same day); checked 00:30 IST on 19 Oct (19:00 UTC on 18 Oct).
    const d = bnssDeadline(
      { firRegisteredAt: ist("2026-08-30", "23:30"), offenceSections: ["BNS 64"], status: "OPEN" },
      ist("2026-10-19", "00:30")
    )!;
    expect(d.registeredOn).toBe("2026-08-30");
    expect(d.day).toBe(50);
  });
});
