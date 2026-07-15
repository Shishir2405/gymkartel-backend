import { describe, it, expect } from "vitest";
import { topUpCost } from "@gymkartel/contracts";
import { resolveScan } from "../domain/resolve-scan.js";

describe("resolveScan (Flow 3/4)", () => {
  it("scans free when pass tier >= gym tier", () => {
    expect(resolveScan({ passTier: "PREMIUM", gymTier: "BASIC", acceptedTopUp: false, topUpPaid: false }))
      .toEqual({ kind: "FREE" });
    expect(resolveScan({ passTier: "STANDARD", gymTier: "STANDARD", acceptedTopUp: false, topUpPaid: false }))
      .toEqual({ kind: "FREE" });
  });

  it("requires a top-up when gym tier is above pass tier and not accepted", () => {
    const r = resolveScan({ passTier: "BASIC", gymTier: "PREMIUM", acceptedTopUp: false, topUpPaid: false });
    expect(r.kind).toBe("TOP_UP_REQUIRED");
    if (r.kind === "TOP_UP_REQUIRED") {
      expect(r.amountPaise).toBe(topUpCost("BASIC", "PREMIUM"));
      expect(r.gymTier).toBe("PREMIUM");
    }
  });

  it("is pending when accepted but not yet paid", () => {
    const r = resolveScan({ passTier: "BASIC", gymTier: "STANDARD", acceptedTopUp: true, topUpPaid: false });
    expect(r.kind).toBe("TOP_UP_PENDING");
  });

  it("settles when accepted and paid", () => {
    const r = resolveScan({ passTier: "STANDARD", gymTier: "PREMIUM", acceptedTopUp: true, topUpPaid: true });
    expect(r.kind).toBe("TOP_UP_SETTLED");
    if (r.kind === "TOP_UP_SETTLED") {
      expect(r.amountPaise).toBe(topUpCost("STANDARD", "PREMIUM"));
    }
  });

  it("top-up matrix matches the spec", () => {
    expect(topUpCost("BASIC", "STANDARD")).toBe(5900);
    expect(topUpCost("STANDARD", "PREMIUM")).toBe(5900);
    expect(topUpCost("BASIC", "PREMIUM")).toBe(9900);
    expect(topUpCost("PREMIUM", "BASIC")).toBeNull();
  });
});
