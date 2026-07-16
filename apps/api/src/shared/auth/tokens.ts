import { Context, Effect, Layer } from "effect";
import { Data } from "effect";
import jwt from "jsonwebtoken";
import type { UserId, UserRole } from "@gymkartel/contracts";
import { Config } from "../config/config.js";

export class InvalidTokenError extends Data.TaggedError("InvalidTokenError")<{
  readonly reason: string;
}> {}

export interface AccessClaims {
  readonly sub: UserId;
  readonly role: UserRole;
}

export interface RefreshClaims {
  readonly sub: UserId;
  readonly fam: string;
}

export interface TokenPair {
  readonly accessToken: string;
  readonly refreshToken: string;
}

export interface TokenServiceApi {
  readonly issue: (claims: AccessClaims, fam: string) => Effect.Effect<TokenPair>;
  readonly verifyAccess: (
    token: string,
  ) => Effect.Effect<AccessClaims, InvalidTokenError>;
  readonly verifyRefresh: (
    token: string,
  ) => Effect.Effect<RefreshClaims, InvalidTokenError>;
}

export class TokenService extends Context.Tag("shared/TokenService")<
  TokenService,
  TokenServiceApi
>() {}

export const TokenServiceLive = Layer.effect(
  TokenService,
  Effect.gen(function* () {
    const config = yield* Config;
    return {
      issue: (claims, fam) =>
        Effect.sync(() => {
          const accessToken = jwt.sign(
            { role: claims.role },
            config.jwtAccessSecret,
            { subject: claims.sub, expiresIn: config.jwtAccessTtlSeconds },
          );
          const refreshToken = jwt.sign(
            { fam },
            config.jwtRefreshSecret,
            { subject: claims.sub, expiresIn: config.jwtRefreshTtlSeconds },
          );
          return { accessToken, refreshToken };
        }),
      verifyAccess: (token) =>
        Effect.try({
          try: () => {
            const decoded = jwt.verify(token, config.jwtAccessSecret);
            if (typeof decoded === "string" || !decoded.sub)
              throw new Error("malformed");
            const role = (decoded as jwt.JwtPayload).role;
            return {
              sub: decoded.sub as UserId,
              role: (role === "COACH" ? "COACH" : "MEMBER") as UserRole,
            };
          },
          catch: (e) => new InvalidTokenError({ reason: String(e) }),
        }),
      verifyRefresh: (token) =>
        Effect.try({
          try: () => {
            const decoded = jwt.verify(token, config.jwtRefreshSecret);
            if (typeof decoded === "string" || !decoded.sub)
              throw new Error("malformed");
            const fam = (decoded as jwt.JwtPayload).fam;
            return { sub: decoded.sub as UserId, fam: String(fam ?? "") };
          },
          catch: (e) => new InvalidTokenError({ reason: String(e) }),
        }),
    };
  }),
);
