/**
 * @gymkartel/contracts — the shared contract between backend and app.
 *
 * Exports:
 *  - Zod domain schemas + inferred TS types (the persistence/validation shape)
 *  - Pricing tables + pure pricing helpers (single source of truth, principle #6)
 *
 * The GraphQL SDL ships alongside as ./schema.graphql (the wire contract);
 * consumers point GraphQL Code Generator at it rather than importing it here.
 */

export * from "./domain/common.js";
export * from "./domain/user.js";
export * from "./domain/pass.js";
export * from "./domain/gym.js";
export * from "./domain/checkIn.js";
export * from "./domain/coach.js";
export * from "./domain/booking.js";
export * from "./pricing.js";
