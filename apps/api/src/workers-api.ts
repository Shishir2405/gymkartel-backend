/**
 * Barrel of the pure, dependency-light building blocks the `@gymkartel/workers`
 * app reuses (RabbitMQ topology + streak/rank/leaderboard domain + message
 * contracts). Exposed via the package `./workers` export so the workers app
 * never reaches into api internals.
 */
export {
  EXCHANGE,
  DLX,
  RETRY_EXCHANGE,
  ROUTING,
  assertQueueTopology,
  attemptCount,
  type RoutingKey,
} from "./shared/mq/rabbit.js";

export {
  computeStreak,
  streakWeeks,
  bonusDaysForWeeks,
  bonusDaysToGrant,
  toTrainingDays,
  type StreakState,
} from "./features/streaks-ranks/domain/streak.js";
export { rankForWeeks, RANKS, type RankKey } from "./features/streaks-ranks/domain/rank.js";
export { istDayNumber, istSeasonKey } from "./features/streaks-ranks/domain/ist.js";
export { buildView, rankAll, type LeaderboardEntry } from "./features/leaderboards/domain/ranking.js";

export {
  renderShareCard,
  TOKENS as SHARE_CARD_TOKENS,
  CARD_WIDTH,
  CARD_HEIGHT,
  type ShareCardData,
} from "./features/share-cards/domain/render.js";
export { buildShareCardData, formatCardDate } from "./features/share-cards/domain/card-data.js";
export {
  makeR2ShareCardUploader,
  shareCardKey,
  type ShareCardUploader,
} from "./features/share-cards/application/share-card-storage.js";

export type { CheckinRecordedEvent } from "./features/check-in/application/ports.js";
export {
  TEMPLATE,
  type NotificationMessage,
  type NotificationChannel,
} from "./features/notifications/application/port.js";
