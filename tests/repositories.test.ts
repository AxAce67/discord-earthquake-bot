import { beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "../src/storage/database.js";
import {
  GuildSettingsRepository,
  QuakeEventRepository,
  QuakeNotificationRepository
} from "../src/storage/repositories.js";
import type { QuakeEvent } from "../src/types/quake.js";

describe("repositories", () => {
  let settings: GuildSettingsRepository;
  let events: QuakeEventRepository;
  let notifications: QuakeNotificationRepository;

  beforeEach(async () => {
    const database = await createDatabase(":memory:");
    settings = new GuildSettingsRepository(database);
    events = new QuakeEventRepository(database);
    notifications = new QuakeNotificationRepository(database);
  });

  it("persists guild settings", async () => {
    await settings.save({
      guildId: "guild-1",
      enabled: true,
      channelId: "channel-1",
      thresholdIntensity: 0,
      imageMode: "yahoo_best_effort",
      updatedAt: Date.now()
    });

    const saved = await settings.load("guild-1");
    expect(saved.channelId).toBe("channel-1");
    expect(saved.enabled).toBe(true);
  });

  it("stores quake events and latest ordering", async () => {
    const now = Date.now();
    const event: QuakeEvent = {
      id: "event-1",
      canonicalEventId: "canonical-1",
      temporaryEventKey: "temp-1",
      sourceFirst: "p2pquake",
      occurredAt: now,
      hypocenterName: "東京都多摩東部",
      latitude: 35.7,
      longitude: 139.4,
      depthKm: 80,
      magnitude: 4.3,
      maxIntensity: 40,
      tsunamiStatus: "None",
      issueType: "ScalePrompt",
      status: "detected",
      rawFastPayload: "{}",
      rawAuthoritativePayload: null,
      sourcesSeen: ["p2pquake"],
      createdAt: now,
      updatedAt: now
    };

    await events.save(event);
    const latest = await events.listLatest(1);
    expect(latest).toHaveLength(1);
    expect(latest[0]?.id).toBe("event-1");
  });

  it("persists notification records", async () => {
    await notifications.save({
      eventId: "event-1",
      guildId: "guild-1",
      channelId: "channel-1",
      messageId: "message-1",
      lastRenderHash: "hash",
      imageUrl: null,
      sourceUrl: "https://example.com/quake/1",
      imageStatus: "pending",
      updatedAt: Date.now()
    });

    const stored = await notifications.load("event-1", "guild-1");
    expect(stored?.messageId).toBe("message-1");
    expect(stored?.sourceUrl).toBe("https://example.com/quake/1");
  });
});
