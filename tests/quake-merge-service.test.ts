import { beforeEach, describe, expect, it } from "vitest";
import pino from "pino";
import { createDatabase } from "../src/storage/database.js";
import { QuakeEventRepository } from "../src/storage/repositories.js";
import { QuakeMergeService, createDraftFromRawP2PQuakeEvent } from "../src/services/quake-merge-service.js";
import type { RawP2PQuakeEvent } from "../src/types/quake.js";

function buildRawEvent(overrides: Partial<RawP2PQuakeEvent> = {}): RawP2PQuakeEvent {
  return {
    id: "event-1",
    code: 551,
    time: "2026/03/09 21:00:00",
    issue: {
      source: "気象庁",
      time: "2026/03/09 21:00:00",
      type: "ScalePrompt"
    },
    earthquake: {
      time: "2026/03/09 21:00:00",
      maxScale: 40,
      domesticTsunami: "None",
      foreignTsunami: "None",
      hypocenter: {
        name: "東京都多摩東部",
        latitude: 35.7,
        longitude: 139.4,
        depth: 80,
        magnitude: 4.3
      }
    },
    ...overrides
  };
}

describe("QuakeMergeService", () => {
  let events: QuakeEventRepository;
  let merge: QuakeMergeService;

  beforeEach(async () => {
    const database = await createDatabase(":memory:");
    events = new QuakeEventRepository(database);
    merge = new QuakeMergeService(events, pino({ enabled: false }));
  });

  it("creates a temporary key from a realtime event", () => {
    const draft = createDraftFromRawP2PQuakeEvent(buildRawEvent(), "p2pquake");
    expect(draft.temporaryEventKey).toContain("東京都多摩東部");
    expect(draft.maxIntensity).toBe(40);
  });

  it("deduplicates the same quake by temporary key", async () => {
    const first = await merge.ingestFastEvent(buildRawEvent());
    const second = await merge.ingestFastEvent(buildRawEvent({ id: "event-2" }));

    expect(first.isNew).toBe(true);
    expect(second.isNew).toBe(false);
    expect(second.event.id).toBe(first.event.id);
  });

  it("upgrades the same quake with authoritative details", async () => {
    const initial = await merge.ingestFastEvent(buildRawEvent());
    const detailed = buildRawEvent({
      id: "event-authoritative",
      issue: {
        source: "気象庁",
        time: "2026/03/09 21:00:10",
        type: "DetailScale"
      },
      earthquake: {
        time: "2026/03/09 21:00:00",
        maxScale: 45,
        domesticTsunami: "None",
        foreignTsunami: "None",
        hypocenter: {
          name: "東京都多摩東部",
          latitude: 35.72,
          longitude: 139.41,
          depth: 70,
          magnitude: 4.8
        }
      }
    });

    const merged = await merge.mergeAuthoritativeEvent(initial.event.id, detailed);
    expect(merged.changed).toBe(true);
    expect(merged.event.maxIntensity).toBe(45);
    expect(merged.event.status).toBe("final");
    expect(merged.event.sourcesSeen).toContain("jma");
  });
});
