import { describe, it, expect, beforeAll } from "vitest";
import { Effect } from "effect";
import { buildYoga } from "../server.js";
import { appRuntime } from "../../runtime/runtime.js";
import { TokenService } from "../../shared/auth/tokens.js";
import { topUpCost, type UserId } from "@gymkartel/contracts";

const yoga = buildYoga();

let demoToken = "";
let coachToken = "";

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

  const coachPair = await appRuntime.runPromise(
    TokenService.pipe(
      Effect.flatMap((svc) =>
        svc.issue({ sub: "user_neha" as UserId, role: "COACH" }, "test-fam-coach"),
      ),
    ),
  );
  coachToken = coachPair.accessToken;
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

  it("gym.location maps stored GeoJSON [lng, lat] to { lat, lng }", async () => {
    const r = await query(`{ gym(id: "gym_iron") { location { lat lng } } }`);
    expect(r.errors).toBeUndefined();
    const gym = (r.data as { gym: { location: { lat: number; lng: number } } }).gym;
    expect(gym.location.lat).toBe(12.9352);
    expect(gym.location.lng).toBe(77.6229);
  });

  it("createTopUpOrder returns a RazorpayOrder for the topUpCost delta", async () => {
    const expected = topUpCost("STANDARD", "PREMIUM");
    const r = await query(
      `mutation { createTopUpOrder(input: { gymCheckInCode: "GYM-ELITE-002", idempotencyKey: "iface-topup-order-key" }) { orderId amountPaise currency } }`,
      demoToken,
    );
    expect(r.errors).toBeUndefined();
    const order = (
      r.data as {
        createTopUpOrder: { orderId: string; amountPaise: number; currency: string };
      }
    ).createTopUpOrder;
    expect(order.amountPaise).toBe(expected);
    expect(order.amountPaise).toBe(5900);
    expect(order.orderId).toBeTruthy();
    expect(order.currency).toBe("INR");

    const again = await query(
      `mutation { createTopUpOrder(input: { gymId: "gym_elite", idempotencyKey: "iface-topup-order-key" }) { orderId } }`,
      demoToken,
    );
    expect(
      (again.data as { createTopUpOrder: { orderId: string } }).createTopUpOrder
        .orderId,
    ).toBe(order.orderId);
  });

  it("createTopUpOrder rejects a same-or-lower tier gym (no delta due)", async () => {
    const r = await query(
      `mutation { createTopUpOrder(input: { gymCheckInCode: "GYM-IRON-001", idempotencyKey: "iface-topup-noop-key" }) { orderId } }`,
      demoToken,
    );
    expect(
      (r.errors?.[0] as { extensions?: { code?: string } })?.extensions?.code,
    ).toBe("TOP_UP_NOT_REQUIRED");
  });

  it("createBookingOrder returns a RazorpayOrder priced at the coach's pricePerSession", async () => {
    const r = await query(
      `mutation { createBookingOrder(input: { coachId: "coach_neha", gymId: "gym_iron", scheduledFor: "2026-08-01T10:00:00.000Z" }) { orderId amountPaise currency } }`,
      demoToken,
    );
    expect(r.errors).toBeUndefined();
    const order = (
      r.data as {
        createBookingOrder: {
          orderId: string;
          amountPaise: number;
          currency: string;
        };
      }
    ).createBookingOrder;
    expect(order.amountPaise).toBe(80000);
    expect(order.orderId).toBeTruthy();
    expect(order.currency).toBe("INR");
  });

  it("chat: sendMessage masks PII both directions and never returns raw text", async () => {
    const r = await query(
      `mutation { sendMessage(bookingId: "bk_demo", text: "call me on 9876543210 or rahul@okhdfc, see insta.com/coach") { text masked } }`,
      demoToken,
    );
    expect(r.errors).toBeUndefined();
    const msg = (r.data as { sendMessage: { text: string; masked: boolean } })
      .sendMessage;
    expect(msg.masked).toBe(true);
    expect(msg.text).not.toContain("9876543210");
    expect(msg.text).toContain("[number hidden]");
    expect(msg.text).toContain("[handle hidden]");
    expect(msg.text).toContain("[link hidden]");
  });

  it("chat: is locked until a booking unlocks it (ChatLocked at the edge)", async () => {
    const r = await query(
      `mutation { sendMessage(bookingId: "bk_missing", text: "hi") { text } }`,
      demoToken,
    );
    expect(
      (r.errors?.[0] as { extensions?: { code?: string } })?.extensions?.code,
    ).toBe("CHAT_LOCKED");
  });

  it("leaderboard: keeps a sticky self-row when the viewer is off-page", async () => {
    const r = await query(
      `{ leaderboard(segment: ZONE, limit: 1) { segment season page { userId position isSelf } self { userId position isSelf } } }`,
      demoToken,
    );
    expect(r.errors).toBeUndefined();
    const lb = (
      r.data as {
        leaderboard: {
          page: { userId: string; isSelf: boolean }[];
          self: { userId: string; isSelf: boolean; position: number } | null;
        };
      }
    ).leaderboard;
    expect(lb.page).toHaveLength(1);
    expect(lb.page[0]?.isSelf).toBe(false);
    expect(lb.self?.userId).toBe("user_demo");
    expect(lb.self?.isSelf).toBe(true);
  });

  it("ledger: logWorkout parses free text into chips (amber '?' on guesses)", async () => {
    const r = await query(
      `mutation { logWorkout(text: "bench 3x8 60kg, squat 5x5 100, run 5km") { chip { kind exercise sets reps weightKg distanceKm uncertain } isPR } }`,
      demoToken,
    );
    expect(r.errors).toBeUndefined();
    const rows = (
      r.data as {
        logWorkout: {
          chip: {
            kind: string;
            exercise: string | null;
            weightKg: number | null;
            distanceKm: number | null;
            uncertain: boolean;
          };
        }[];
      }
    ).logWorkout;
    expect(rows).toHaveLength(3);
    const bench = rows.find((x) => x.chip.exercise === "bench")!;
    expect(bench.chip.kind).toBe("STRENGTH");
    expect(bench.chip.weightKg).toBe(60);
    expect(bench.chip.uncertain).toBe(false);
    const squat = rows.find((x) => x.chip.exercise === "squat")!;
    expect(squat.chip.uncertain).toBe(true);
    const run = rows.find((x) => x.chip.kind === "CARDIO")!;
    expect(run.chip.distanceKm).toBe(5);
  });

  it("coach-portal: gated to role=COACH (member is FORBIDDEN, coach passes)", async () => {
    const anon = await query(`{ coachDashboard { sessionsCompleted } }`);
    expect(
      (anon.errors?.[0] as { extensions?: { code?: string } })?.extensions?.code,
    ).toBe("UNAUTHENTICATED");

    const asMember = await query(
      `{ coachDashboard { sessionsCompleted } }`,
      demoToken,
    );
    expect(
      (asMember.errors?.[0] as { extensions?: { code?: string } })?.extensions
        ?.code,
    ).toBe("FORBIDDEN");

    const asCoach = await query(
      `{ coachDashboard { sessionsCompleted earningsPaise todaysSessions { id } } coachProfile { displayName } }`,
      coachToken,
    );
    expect(asCoach.errors).toBeUndefined();
    const data = asCoach.data as {
      coachDashboard: { sessionsCompleted: number; earningsPaise: number };
      coachProfile: { displayName: string };
    };
    expect(data.coachDashboard.sessionsCompleted).toBe(320);
    expect(data.coachProfile.displayName).toBe("Neha S.");
  });
});
