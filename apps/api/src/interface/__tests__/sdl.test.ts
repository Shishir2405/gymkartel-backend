import { describe, it, expect } from "vitest";
import { loadTypeDefs } from "../schema.js";

describe("GraphQL SDL contract", () => {
  it("loads the SDL from @gymkartel/contracts and matches snapshot", () => {
    const sdl = loadTypeDefs();
    expect(sdl).toContain("type Query");
    expect(sdl).toContain("syncCheckIn");
    expect(sdl).toContain("passLadder");
    expect(sdl).toMatchSnapshot();
  });
});
