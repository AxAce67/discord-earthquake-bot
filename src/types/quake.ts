export type GuildId = string;
export type ChannelId = string;
export type MessageId = string;

export type QuakeEventStatus = "detected" | "detailed" | "final" | "image_unavailable";
export type QuakeImageStatus = "pending" | "attached" | "unavailable";
export type ImageMode = "yahoo_best_effort";
export type QuakeSourceName = "p2pquake" | "jma" | "yahoo";

export interface GuildQuakeSettings {
  guildId: GuildId;
  enabled: boolean;
  channelId: ChannelId | null;
  thresholdIntensity: number;
  imageMode: ImageMode;
  updatedAt: number;
}

export interface QuakeEvent {
  id: string;
  canonicalEventId: string | null;
  temporaryEventKey: string;
  sourceFirst: QuakeSourceName;
  occurredAt: number;
  hypocenterName: string | null;
  latitude: number | null;
  longitude: number | null;
  depthKm: number | null;
  magnitude: number | null;
  maxIntensity: number | null;
  tsunamiStatus: string | null;
  issueType: string | null;
  status: QuakeEventStatus;
  rawFastPayload: string;
  rawAuthoritativePayload: string | null;
  sourcesSeen: QuakeSourceName[];
  createdAt: number;
  updatedAt: number;
}

export interface QuakeNotificationRecord {
  eventId: string;
  guildId: GuildId;
  channelId: ChannelId;
  messageId: MessageId;
  lastRenderHash: string;
  imageUrl: string | null;
  imageStatus: QuakeImageStatus;
  updatedAt: number;
}

export interface RawP2PQuakeIssue {
  source: string;
  time: string;
  type: string;
  correct?: string;
}

export interface RawP2PQuakeHypocenter {
  name?: string;
  latitude?: number;
  longitude?: number;
  depth?: number;
  magnitude?: number;
}

export interface RawP2PQuakeEarthquake {
  time: string;
  hypocenter?: RawP2PQuakeHypocenter;
  maxScale?: number;
  domesticTsunami?: string;
  foreignTsunami?: string;
}

export interface RawP2PQuakeEvent {
  id?: string;
  code: number;
  time: string;
  issue?: RawP2PQuakeIssue;
  earthquake?: RawP2PQuakeEarthquake;
  comments?: {
    freeFormComment?: string;
  };
}

export interface QuakeEventDraft {
  temporaryEventKey: string;
  canonicalEventId: string | null;
  occurredAt: number;
  hypocenterName: string | null;
  latitude: number | null;
  longitude: number | null;
  depthKm: number | null;
  magnitude: number | null;
  maxIntensity: number | null;
  tsunamiStatus: string | null;
  issueType: string | null;
  status: QuakeEventStatus;
  source: QuakeSourceName;
  rawPayload: string;
}

export interface QuakeImageResult {
  imageUrl: string | null;
  detailUrl: string | null;
}

export interface YahooListEntry {
  detailPath: string;
  occurredAt: number;
  hypocenterName: string;
  magnitude: number | null;
  maxIntensity: number | null;
}

export interface YahooDetailPage {
  pointImageUrl: string | null;
  areaImageUrl: string | null;
  hypocenterName: string | null;
  occurredAt: number | null;
  maxIntensity: number | null;
  magnitude: number | null;
  depthKm: number | null;
}

export interface QuakeSummary {
  id: string;
  occurredAt: number;
  hypocenterName: string | null;
  depthKm: number | null;
  magnitude: number | null;
  maxIntensity: number | null;
  status: QuakeEventStatus;
}

export function createDefaultGuildQuakeSettings(guildId: string): GuildQuakeSettings {
  return {
    guildId,
    enabled: false,
    channelId: null,
    thresholdIntensity: 0,
    imageMode: "yahoo_best_effort",
    updatedAt: Date.now()
  };
}

export function normalizeScale(scale: number | null | undefined): number | null {
  if (typeof scale !== "number" || Number.isNaN(scale) || scale < 0) {
    return null;
  }

  return scale;
}

export function formatScaleLabel(scale: number | null): string {
  switch (scale) {
    case 10:
      return "震度1";
    case 20:
      return "震度2";
    case 30:
      return "震度3";
    case 40:
      return "震度4";
    case 45:
      return "震度5弱";
    case 50:
      return "震度5強";
    case 55:
      return "震度6弱";
    case 60:
      return "震度6強";
    case 70:
      return "震度7";
    default:
      return "不明";
  }
}

export function buildTemporaryEventKey(input: {
  occurredAt: number;
  hypocenterName: string | null;
  maxIntensity: number | null;
  latitude: number | null;
  longitude: number | null;
  depthKm: number | null;
}): string {
  const latitude = input.latitude === null ? "na" : input.latitude.toFixed(1);
  const longitude = input.longitude === null ? "na" : input.longitude.toFixed(1);
  const depth = input.depthKm === null ? "na" : String(Math.round(input.depthKm));

  return [
    String(input.occurredAt),
    input.hypocenterName ?? "unknown",
    input.maxIntensity === null ? "na" : String(input.maxIntensity),
    latitude,
    longitude,
    depth
  ].join("|");
}

export function buildCanonicalEventId(input: {
  occurredAt: number;
  hypocenterName: string | null;
  latitude: number | null;
  longitude: number | null;
  depthKm: number | null;
  magnitude: number | null;
  maxIntensity: number | null;
}): string | null {
  if (input.hypocenterName === null || input.latitude === null || input.longitude === null) {
    return null;
  }

  const depth = input.depthKm === null ? "na" : String(Math.round(input.depthKm));
  const magnitude = input.magnitude === null ? "na" : input.magnitude.toFixed(1);
  const maxIntensity = input.maxIntensity === null ? "na" : String(input.maxIntensity);

  return [
    String(input.occurredAt),
    input.hypocenterName,
    input.latitude.toFixed(2),
    input.longitude.toFixed(2),
    depth,
    magnitude,
    maxIntensity
  ].join("|");
}

export function getIssueRank(issueType: string | null): number {
  switch (issueType) {
    case "ScalePrompt":
      return 1;
    case "Destination":
      return 2;
    case "ScaleAndDestination":
      return 3;
    case "DetailScale":
      return 4;
    case "Foreign":
      return 5;
    case "Other":
      return 6;
    default:
      return 0;
  }
}
