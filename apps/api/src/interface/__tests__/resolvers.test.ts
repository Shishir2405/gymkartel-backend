import { describe, it, expect, beforeAll } from "vitest";
import { Effect } from "effect";
import { buildYoga } from "../server.js";
import { appRuntime } from "../../runtime/runtime.js";
import { TokenService } from "../../shared/auth/tokens.js";
import type { UserId } from "@gymkartel/contracts";

const yoga = buildYoga();

/** Mint a real access token for the seeded demo member (exercises auth too). */
let demoToken = "";

const query = async (
  source: string,
  token?: string,
): Promise<{ data?: Record<string, unknown>; errors?: unknown[] }> => {
  const res = await yoga.fetch("http://test/graphql", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query: source }),
  });
  return (await res.json()) as { data?: Record<string, unknown>; errors?: unknown[] };
};

beforeAll(async () => {
  const pair = await appRuntime.runPromise(
    TokenService.pipe(
      Effect.flatMap((svc) =>
        svc.issue({ sub: "user_demo" as UserId, role: "MEMBER" }, "test-fam"),
      ),
    ),
  );
  demoToken = pair.accessToken;
});

describe("GraphQL resolvers (interface, via Yoga fetch)", () => {
  it("versionGate returns configured versions (anonymous)", async () => {
    const r = await query(`{ versionGate { latestVersion minSupportedVersion } }`);
    expect(r.errors).toBeUndefined();
    const vg = (r.data as { versionGate: { latestVersion: string } }).versionGate;
    expect(vg.latestVersion).toBeTruthy();
  });

  it("passLadder requires a viewer, returns 4 priced rows when authed", async () => {
    const anon = await query(`{ passLadder { pack } }`);
    expect(
      (anon.errors?.[0] as { extensions?: { code?: string } })?.extensions?.code,
    ).toBe("UNAUTHENTICATED");

    const authed = await query(
      `{ passLadder { pack days pricePaise perDayPaise emphasized } }`,
      demoToken,
    );
    expect(authed.errors).toBeUndefined();
    expect((authed.data as { passLadder: unknown[] }).passLadder).toHaveLength(4);
  });

  it("viewer resolves the seeded member with active pass + streak", async () => {
    const r = await query(
      `{ viewer { name tier activePass { daysLeft status } streak { current windowDaysLeft bonusDaysEarned } } }`,
      demoToken,
    );
    expect(r.errors).toBeUndefined();
    const v = r.data as { viewer: { name: string; activePass: { status: string } } };
    expect(v.viewer.name).toBe("Demo Member");
    expect(v.viewer.activePass.status).toBe("ACTIVE");
  });

  it("gyms lists the viewer's tier and can peek higher tiers", async () => {
    const inTier = await query(`{ gyms { tier } }`, demoToken);
    const gyms = (inTier.data as { gyms: { tier: string }[] }).gyms;
    expect(gyms.every((g) => g.tier === "STANDARD")).toBe(true);

    const peek = await query(`{ gyms(peekOtherTiers: true) { tier } }`, demoToken);
    const peeked = (peek.data as { gyms: { tier: string }[] }).gyms;
    expect(peeked.length).toBeGreaterThan(gyms.length);
  });

  it("coaches query returns seeded coaches with upfront pricing", async () => {
    const r = await query(`{ coaches { displayName pricePerSessionPaise verified } }`);
    expect(r.errors).toBeUndefined();
    const coaches = (r.data as { coaches: { pricePerSessionPaise: number }[] }).coaches;
    expect(coaches.length).toBeGreaterThan(0);
    expect(coaches[0]?.pricePerSessionPaise).toBeGreaterThan(0);
  });

  it("syncCheckIn returns topUpRequired (never a wall) for an above-tier gym", async () => {
    const r = await query(
      `mutation { syncCheckIn(input: { gymCheckInCode: "GYM-ELITE-002", scannedAt: "2026-07-01T10:00:00.000Z", idempotencyKey: "iface-topup-key" }) { checkIn { id } topUpRequired { amountPaise razorpayOrderId gymTier } } }`,
      demoToken,
    );
    expect(r.errors).toBeUndefined();
    const out = r.data as {
      syncCheckIn: { checkIn: null; topUpRequired: { amountPaise: number } | null };
    };
    expect(out.syncCheckIn.checkIn).toBeNull();
    expect(out.syncCheckIn.topUpRequired?.amountPaise).toBe(5900);
  });
});
