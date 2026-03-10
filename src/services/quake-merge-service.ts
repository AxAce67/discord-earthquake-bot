import type pino from "pino";
import { QuakeEventRepository } from "../storage/repositories.js";
import type { QuakeEvent, QuakeEventDraft, QuakeSourceName, RawP2PQuakeEvent } from "../types/quake.js";
import {
  buildCanonicalEventId,
  buildTemporaryEventKey,
  getIssueRank,
  normalizeScale
} from "../types/quake.js";

function parseP2PQuakeTimestamp(value: string): number {
  const normalized = value.replace(/\//g, "-").replace(" ", "T");
  const withTimezone = normalized.includes("+09:00") ? normalized : `${normalized}+09:00`;
  return new Date(withTimezone).getTime();
}

function mapDraftStatus(issueType: string | null): QuakeEvent["status"] {
  switch (issueType) {
    case "ScalePrompt":
      return "detected";
    case "DetailScale":
      return "final";
    case "Destination":
    case "ScaleAndDestination":
    case "Foreign":
    case "Other":
      return "detailed";
    default:
      return "detected";
  }
}

function statusRank(status: QuakeEvent["status"]): number {
  switch (status) {
    case "detected":
      return 1;
    case "detailed":
      return 2;
    case "final":
      return 3;
    case "image_unavailable":
      return 4;
    default:
      return 0;
  }
}

export function createDraftFromRawP2PQuakeEvent(
  raw: RawP2PQuakeEvent,
  source: QuakeSourceName
): QuakeEventDraft {
  const occurredAt = parseP2PQuakeTimestamp(raw.earthquake?.time ?? raw.time);
  const hypocenterName = raw.earthquake?.hypocenter?.name ?? null;
  const latitude =
    raw.earthquake?.hypocenter?.latitude !== undefined && raw.earthquake.hypocenter.latitude > -200
      ? raw.earthquake.hypocenter.latitude
      : null;
  const longitude =
    raw.earthquake?.hypocenter?.longitude !== undefined && raw.earthquake.hypocenter.longitude > -200
      ? raw.earthquake.hypocenter.longitude
      : null;
  const depthKm =
    raw.earthquake?.hypocenter?.depth !== undefined && raw.earthquake.hypocenter.depth >= 0
      ? raw.earthquake.hypocenter.depth
      : null;
  const magnitude =
    raw.earthquake?.hypocenter?.magnitude !== undefined && raw.earthquake.hypocenter.magnitude >= 0
      ? raw.earthquake.hypocenter.magnitude
      : null;
  const maxIntensity = normalizeScale(raw.earthquake?.maxScale ?? null);
  const issueType = raw.issue?.type ?? null;

  return {
    temporaryEventKey: buildTemporaryEventKey({
      occurredAt,
      hypocenterName,
      maxIntensity,
      latitude,
      longitude,
      depthKm
    }),
    canonicalEventId: buildCanonicalEventId({
      occurredAt,
      hypocenterName,
      latitude,
      longitude,
      depthKm,
      magnitude,
      maxIntensity
    }),
    occurredAt,
    hypocenterName,
    latitude,
    longitude,
    depthKm,
    magnitude,
    maxIntensity,
    tsunamiStatus: raw.earthquake?.domesticTsunami ?? raw.earthquake?.foreignTsunami ?? null,
    issueType,
    status: mapDraftStatus(issueType),
    source,
    rawPayload: JSON.stringify(raw)
  };
}

function buildFallbackEventId(draft: QuakeEventDraft): string {
  return `quake:${draft.canonicalEventId ?? draft.temporaryEventKey}`;
}

export class QuakeMergeService {
  constructor(
    private readonly events: QuakeEventRepository,
    private readonly logger: pino.Logger
  ) {}

  async ingestFastEvent(raw: RawP2PQuakeEvent): Promise<{ event: QuakeEvent; isNew: boolean; changed: boolean }> {
    const draft = createDraftFromRawP2PQuakeEvent(raw, "p2pquake");
    const existing = await this.findBestMatch(draft);
    const merged = this.merge(existing, draft, raw.id ?? buildFallbackEventId(draft));
    await this.events.save(merged);

    const changed = !existing || hasEventMeaningfulChanges(existing, merged);
    this.logger.info({ eventId: merged.id, isNew: !existing, changed }, "Merged P2PQuake quake event");
    return { event: merged, isNew: !existing, changed };
  }

  async mergeAuthoritativeEvent(
    existingEventId: string,
    raw: RawP2PQuakeEvent
  ): Promise<{ event: QuakeEvent; changed: boolean }> {
    const existing = await this.events.findById(existingEventId);
    if (!existing) {
      throw new Error(`Event ${existingEventId} not found`);
    }

    const draft = createDraftFromRawP2PQuakeEvent(raw, "jma");
    const merged = this.merge(existing, draft, existing.id, true);
    await this.events.save(merged);
    return { event: merged, changed: hasEventMeaningfulChanges(existing, merged) };
  }

  async markImageUnavailable(eventId: string): Promise<QuakeEvent | null> {
    const event = await this.events.findById(eventId);
    if (!event) {
      return null;
    }

    if (!event.sourcesSeen.includes("yahoo")) {
      event.sourcesSeen = [...event.sourcesSeen, "yahoo"];
    }
    event.status = event.status === "final" ? "final" : "image_unavailable";
    event.updatedAt = Date.now();
    await this.events.save(event);
    return event;
  }

  async markImageAttached(eventId: string): Promise<QuakeEvent | null> {
    const event = await this.events.findById(eventId);
    if (!event) {
      return null;
    }

    if (!event.sourcesSeen.includes("yahoo")) {
      event.sourcesSeen = [...event.sourcesSeen, "yahoo"];
      event.updatedAt = Date.now();
      await this.events.save(event);
    }

    return event;
  }

  async findBestMatch(draft: QuakeEventDraft): Promise<QuakeEvent | null> {
    const exactTemporary = await this.events.findByTemporaryEventKey(draft.temporaryEventKey);
    if (exactTemporary) {
      return exactTemporary;
    }

    const candidates = await this.events.findRecentCandidates(draft.occurredAt, 120000);
    const exactCanonical =
      candidates.find((candidate) => {
        return draft.canonicalEventId !== null && candidate.canonicalEventId === draft.canonicalEventId;
      }) ?? null;

    if (exactCanonical) {
      return exactCanonical;
    }

    return (
      candidates.find((candidate) => {
        const sameName = candidate.hypocenterName !== null && candidate.hypocenterName === draft.hypocenterName;
        const nearCoordinates =
          candidate.latitude !== null &&
          candidate.longitude !== null &&
          draft.latitude !== null &&
          draft.longitude !== null &&
          Math.abs(candidate.latitude - draft.latitude) <= 0.3 &&
          Math.abs(candidate.longitude - draft.longitude) <= 0.3;

        return sameName || nearCoordinates;
      }) ?? null
    );
  }

  private merge(
    existing: QuakeEvent | null,
    draft: QuakeEventDraft,
    fallbackId: string,
    authoritative = false
  ): QuakeEvent {
    if (!existing) {
      const now = Date.now();
      return {
        id: fallbackId,
        canonicalEventId: draft.canonicalEventId,
        temporaryEventKey: draft.temporaryEventKey,
        sourceFirst: draft.source,
        occurredAt: draft.occurredAt,
        hypocenterName: draft.hypocenterName,
        latitude: draft.latitude,
        longitude: draft.longitude,
        depthKm: draft.depthKm,
        magnitude: draft.magnitude,
        maxIntensity: draft.maxIntensity,
        tsunamiStatus: draft.tsunamiStatus,
        issueType: draft.issueType,
        status: draft.status,
        rawFastPayload: draft.rawPayload,
        rawAuthoritativePayload: authoritative ? draft.rawPayload : null,
        sourcesSeen: [draft.source],
        createdAt: now,
        updatedAt: now
      };
    }

    const merged: QuakeEvent = {
      ...existing,
      canonicalEventId: draft.canonicalEventId ?? existing.canonicalEventId,
      temporaryEventKey: draft.temporaryEventKey,
      hypocenterName: draft.hypocenterName ?? existing.hypocenterName,
      latitude: draft.latitude ?? existing.latitude,
      longitude: draft.longitude ?? existing.longitude,
      depthKm: draft.depthKm ?? existing.depthKm,
      magnitude: draft.magnitude ?? existing.magnitude,
      maxIntensity: draft.maxIntensity ?? existing.maxIntensity,
      tsunamiStatus: draft.tsunamiStatus ?? existing.tsunamiStatus,
      issueType:
        getIssueRank(draft.issueType) >= getIssueRank(existing.issueType) ? draft.issueType : existing.issueType,
      status: statusRank(draft.status) >= statusRank(existing.status) ? draft.status : existing.status,
      rawFastPayload: authoritative ? existing.rawFastPayload : draft.rawPayload,
      rawAuthoritativePayload: authoritative ? draft.rawPayload : existing.rawAuthoritativePayload,
      updatedAt: Date.now()
    };

    if (!merged.sourcesSeen.includes(draft.source)) {
      merged.sourcesSeen = [...merged.sourcesSeen, draft.source];
    }

    return merged;
  }
}

function hasEventMeaningfulChanges(before: QuakeEvent, after: QuakeEvent): boolean {
  return JSON.stringify({
    canonicalEventId: before.canonicalEventId,
    temporaryEventKey: before.temporaryEventKey,
    hypocenterName: before.hypocenterName,
    latitude: before.latitude,
    longitude: before.longitude,
    depthKm: before.depthKm,
    magnitude: before.magnitude,
    maxIntensity: before.maxIntensity,
    tsunamiStatus: before.tsunamiStatus,
    issueType: before.issueType,
    status: before.status,
    sourcesSeen: before.sourcesSeen
  }) !==
    JSON.stringify({
      canonicalEventId: after.canonicalEventId,
      temporaryEventKey: after.temporaryEventKey,
      hypocenterName: after.hypocenterName,
      latitude: after.latitude,
      longitude: after.longitude,
      depthKm: after.depthKm,
      magnitude: after.magnitude,
      maxIntensity: after.maxIntensity,
      tsunamiStatus: after.tsunamiStatus,
      issueType: after.issueType,
      status: after.status,
      sourcesSeen: after.sourcesSeen
    });
}
