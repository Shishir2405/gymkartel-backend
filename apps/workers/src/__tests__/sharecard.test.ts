import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import { buildShareCardData } from "@gymkartel/api/workers";
import { shareCardRender, type ShareCardDeps } from "../handlers.js";

const captured: { checkInId?: string; bytes?: Uint8Array } = {};

const deps: ShareCardDeps = {
  log: () => {},
  loadCardData: async (evt) =>
    buildShareCardData({
      gymName: evt.gymId,
      checkInInstants: [
        new Date("2026-06-02T10:00:00Z"),
        new Date("2026-06-04T10:00:00Z"),
        new Date("2026-06-06T10:00:00Z"),
      ],
      now: new Date("2026-06-06T10:00:00Z"),
    }),
  upload: async (checkInId, png) => {
    captured.checkInId = checkInId;
    captured.bytes = png;
    return `https://cdn.example/share-cards/${checkInId}.png`;
  },
};

const validEvent = {
  checkInId: "chk_1",
  userId: "u1",
  gymId: "g1",
  zone: "z",
  scannedAt: "2026-06-06T10:00:00Z",
};

describe("shareCardRender consumer", () => {
  it("renders a PNG and uploads it keyed by check-in id", async () => {
    const result = await Effect.runPromise(
      shareCardRender(deps)(validEvent).pipe(Effect.either),
    );
    expect(result._tag).toBe("Right");
    expect(captured.checkInId).toBe("chk_1");
    const head = Buffer.from(captured.bytes?.subarray(0, 4) ?? []).toString("hex");
    expect(head).toBe("89504e47");
  });

  it("fails (→ retry/DLX) on a malformed message", async () => {
    const result = await Effect.runPromise(
      shareCardRender(deps)({ nope: true }).pipe(Effect.either),
    );
    expect(result._tag).toBe("Left");
  });
});
