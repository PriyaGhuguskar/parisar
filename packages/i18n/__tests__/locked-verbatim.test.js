// Phase 7 — Plan 07-01: locked-verbatim snapshot suite.
//
// UI-SPEC §Copywriting Contract names six strings that MUST survive the
// 108-file i18n retrofit byte-exact across en / hi / mr. Any drift in any
// locale is a compliance or legal risk (FLAT-05 no-payment legal footer,
// DPDP statement, IT Rules 2021 Grievance Officer About copy).
//
// This suite loads the resident JSON shards and asserts each locked key's
// exact value. The strings are repeated INLINE in the test so a planner or
// reviewer can read the expected value without opening the shard file. If
// the shard drifts, the test fails and CI blocks the merge.

import { describe, expect, it } from "vitest";
import enDashboard from "../locales/en/dashboard.json";
import enFlatActions from "../locales/en/flat-actions.json";
import enModeration from "../locales/en/moderation.json";
import enAuth from "../locales/en.json";
import hiDashboard from "../locales/hi/dashboard.json";
import hiFlatActions from "../locales/hi/flat-actions.json";
import hiModeration from "../locales/hi/moderation.json";
import hiAuth from "../locales/hi.json";
import mrDashboard from "../locales/mr/dashboard.json";
import mrFlatActions from "../locales/mr/flat-actions.json";
import mrModeration from "../locales/mr/moderation.json";
import mrAuth from "../locales/mr.json";

describe("Locked-verbatim string 1: FLAT-05 no-payment footer (flat-actions.json fine.noPaymentFooter)", () => {
  it("en value is byte-exact", () => {
    expect(enFlatActions.flatAction.noPaymentFooter).toBe(
      "Parisar does not collect payments. This fine is a recorded notice only — please settle it directly with your society as per its bylaws.",
    );
  });

  it("hi value is byte-exact", () => {
    expect(hiFlatActions.flatAction.noPaymentFooter).toBe(
      "Parisar भुगतान एकत्र नहीं करता है। यह जुर्माना केवल एक दर्ज सूचना है — कृपया इसे अपनी सोसायटी के नियमों के अनुसार सीधे सोसायटी के साथ निपटाएं।",
    );
  });

  it("mr value is byte-exact", () => {
    expect(mrFlatActions.flatAction.noPaymentFooter).toBe(
      "Parisar पेमेंट गोळा करत नाही. हा दंड फक्त एक नोंदवलेली सूचना आहे — कृपया तो तुमच्या सोसायटीच्या नियमांनुसार थेट सोसायटीकडे भरा.",
    );
  });
});

describe("Locked-verbatim string 2: dashboard joined-percent suffix (dashboard.json header.joinedPercent)", () => {
  it("en value is byte-exact (preserves leading space + middle-dot)", () => {
    expect(enDashboard.header.joinedPercent).toBe(" · {{percent}}% joined");
  });

  it("hi value is byte-exact (Devanagari analog from existing shard)", () => {
    expect(hiDashboard.header.joinedPercent).toBe(" · {{percent}}% जुड़े");
  });

  it("mr value is byte-exact (Devanagari analog from existing shard)", () => {
    expect(mrDashboard.header.joinedPercent).toBe(" · {{percent}}% सामील");
  });
});

describe("Locked-verbatim string 3: Phase 3 Member-removal DPDP statement (auth-namespace removal.warningBody)", () => {
  // Legally sensitive — invokes the Indian Digital Personal Data Protection Act
  // and an irreversible data-erasure commitment. Drift in any locale is a
  // compliance risk. Each assertion below confirms the exact value AND that
  // the locale-appropriate DPDP token survives.

  it("en value is byte-exact AND contains literal DPDP", () => {
    const expected =
      "This will permanently remove {{name}} from the society. Their flat {{flat}} will be freed. Their personal data will be erased (name, phone) in compliance with DPDP.";
    expect(enAuth.removal.warningBody).toBe(expected);
    expect(enAuth.removal.warningBody).toContain("DPDP");
  });

  it("hi value is byte-exact AND contains डीपीडीपी and स्थायी रूप से", () => {
    const expected =
      "यह {{name}} को सोसायटी से स्थायी रूप से हटा देगा। उनका फ्लैट {{flat}} खाली हो जाएगा। उनका व्यक्तिगत डेटा (नाम, फोन) डीपीडीपी के अनुपालन में मिटा दिया जाएगा।";
    expect(hiAuth.removal.warningBody).toBe(expected);
    expect(hiAuth.removal.warningBody).toContain("डीपीडीपी");
    expect(hiAuth.removal.warningBody).toContain("स्थायी रूप से");
  });

  it("mr value is byte-exact AND contains डीपीडीपी and कायमचे", () => {
    const expected =
      "यामुळे {{name}} ला सोसायटीतून कायमचे काढले जाईल. त्यांचा फ्लॅट {{flat}} मोकळा होईल. त्यांचा वैयक्तिक डेटा (नाव, फोन) डीपीडीपीच्या अनुपालनात मिटवला जाईल.";
    expect(mrAuth.removal.warningBody).toBe(expected);
    expect(mrAuth.removal.warningBody).toContain("डीपीडीपी");
    expect(mrAuth.removal.warningBody).toContain("कायमचे");
  });
});

describe("Locked-verbatim string 4: Grievance Officer About title (moderation.json about.title — IT Rules 2021)", () => {
  it("en value is byte-exact", () => {
    expect(enModeration.about.title).toBe("About & Help");
  });

  it("hi value is byte-exact", () => {
    expect(hiModeration.about.title).toBe("के बारे में और सहायता");
  });

  it("mr value is byte-exact", () => {
    expect(mrModeration.about.title).toBe("विषयी आणि मदत");
  });
});

describe("Locked-verbatim string 5: Phase 2 stub OTP dev hint (auth-namespace)", () => {
  // Per Plan 07-01 read-first: grep for "123456" / "stub" / "demo" across
  // packages/i18n/locales/{en,hi,mr}.json shows no such key today. The dev
  // hint exists in apps/mobile and apps/web as a hard-coded label that
  // Phase 2 noted will be lifted into i18n during Phase 7. Documented as
  // it.todo per the plan rather than fabricating a key path.

  it.todo(
    "stub OTP dev hint key — pending Phase 7 Wave 2 retrofit (apps/* lift the hard-coded label into <lng>.json)",
  );
});

describe("Locked-verbatim string 6: Phase 3 destructive-confirm typing instruction (auth-namespace removal.typedNameLabel)", () => {
  it("en value is byte-exact", () => {
    expect(enAuth.removal.typedNameLabel).toBe("Type the member's name to confirm");
  });

  it("hi value is byte-exact", () => {
    expect(hiAuth.removal.typedNameLabel).toBe("पुष्टि के लिए सदस्य का नाम टाइप करें");
  });

  it("mr value is byte-exact", () => {
    expect(mrAuth.removal.typedNameLabel).toBe("पुष्टीसाठी सदस्याचे नाव टाइप करा");
  });
});
