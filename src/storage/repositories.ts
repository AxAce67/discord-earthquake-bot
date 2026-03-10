import type { SqliteDatabase } from "./database.js";
import type {
  GuildQuakeSettings,
  QuakeEvent,
  QuakeNotificationRecord,
  QuakeSummary,
  QuakeSourceName
} from "../types/quake.js";
import { createDefaultGuildQuakeSettings } from "../types/quake.js";

function parseSourcesSeen(value: unknown): QuakeSourceName[] {
  if (typeof value !== "string" || value.length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((entry): entry is QuakeSourceName => {
      return entry === "p2pquake" || entry === "jma" || entry === "yahoo";
    });
  } catch {
    return [];
  }
}

function mapEvent(row: Record<string, unknown>): QuakeEvent {
  return {
    id: String(row.id),
    canonicalEventId: row.canonical_event_id ? String(row.canonical_event_id) : null,
    temporaryEventKey: String(row.temporary_event_key),
    sourceFirst: row.source_first as QuakeSourceName,
    occurredAt: Number(row.occurred_at),
    hypocenterName: row.hypocenter_name ? String(row.hypocenter_name) : null,
    latitude: row.latitude === null || row.latitude === undefined ? null : Number(row.latitude),
    longitude: row.longitude === null || row.longitude === undefined ? null : Number(row.longitude),
    depthKm: row.depth_km === null || row.depth_km === undefined ? null : Number(row.depth_km),
    magnitude: row.magnitude === null || row.magnitude === undefined ? null : Number(row.magnitude),
    maxIntensity: row.max_intensity === null || row.max_intensity === undefined ? null : Number(row.max_intensity),
    tsunamiStatus: row.tsunami_status ? String(row.tsunami_status) : null,
    issueType: row.issue_type ? String(row.issue_type) : null,
    status: String(row.status) as QuakeEvent["status"],
    rawFastPayload: String(row.raw_fast_payload),
    rawAuthoritativePayload: row.raw_authoritative_payload ? String(row.raw_authoritative_payload) : null,
    sourcesSeen: parseSourcesSeen(row.sources_seen),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  };
}

function mapNotification(row: Record<string, unknown>): QuakeNotificationRecord {
  return {
    eventId: String(row.event_id),
    guildId: String(row.guild_id),
    channelId: String(row.channel_id),
    messageId: String(row.message_id),
    lastRenderHash: String(row.last_render_hash),
    imageUrl: row.image_url ? String(row.image_url) : null,
    sourceUrl: row.source_url ? String(row.source_url) : null,
    imageStatus: String(row.image_status) as QuakeNotificationRecord["imageStatus"],
    updatedAt: Number(row.updated_at)
  };
}

export class GuildSettingsRepository {
  constructor(private readonly db: SqliteDatabase) {}

  async load(guildId: string): Promise<GuildQuakeSettings> {
    const row = await this.db.get<Record<string, unknown>>(
      `SELECT * FROM guild_quake_settings WHERE guild_id = ?`,
      guildId
    );

    if (!row) {
      const settings = createDefaultGuildQuakeSettings(guildId);
      await this.save(settings);
      return settings;
    }

    return {
      guildId,
      enabled: Number(row.enabled) === 1,
      channelId: row.channel_id ? String(row.channel_id) : null,
      thresholdIntensity: Number(row.threshold_intensity ?? 0),
      imageMode: "yahoo_best_effort",
      updatedAt: Number(row.updated_at)
    };
  }

  async save(settings: GuildQuakeSettings): Promise<void> {
    await this.db.run(
      `INSERT INTO guild_quake_settings (guild_id, enabled, channel_id, threshold_intensity, image_mode, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        enabled = excluded.enabled,
        channel_id = excluded.channel_id,
        threshold_intensity = excluded.threshold_intensity,
        image_mode = excluded.image_mode,
        updated_at = excluded.updated_at`,
      settings.guildId,
      settings.enabled ? 1 : 0,
      settings.channelId,
      settings.thresholdIntensity,
      settings.imageMode,
      settings.updatedAt
    );
  }

  async listEnabled(): Promise<GuildQuakeSettings[]> {
    const rows = await this.db.all<Record<string, unknown>[]>(`SELECT * FROM guild_quake_settings WHERE enabled = 1`);
    return rows.map((row) => ({
      guildId: String(row.guild_id),
      enabled: true,
      channelId: row.channel_id ? String(row.channel_id) : null,
      thresholdIntensity: Number(row.threshold_intensity ?? 0),
      imageMode: "yahoo_best_effort",
      updatedAt: Number(row.updated_at)
    }));
  }
}

export class QuakeEventRepository {
  constructor(private readonly db: SqliteDatabase) {}

  async findById(id: string): Promise<QuakeEvent | null> {
    const row = await this.db.get<Record<string, unknown>>(`SELECT * FROM quake_events WHERE id = ?`, id);
    return row ? mapEvent(row) : null;
  }

  async findByTemporaryEventKey(key: string): Promise<QuakeEvent | null> {
    const row = await this.db.get<Record<string, unknown>>(
      `SELECT * FROM quake_events WHERE temporary_event_key = ? ORDER BY updated_at DESC LIMIT 1`,
      key
    );
    return row ? mapEvent(row) : null;
  }

  async findRecentCandidates(occurredAt: number, windowMs: number): Promise<QuakeEvent[]> {
    const rows = await this.db.all<Record<string, unknown>[]>(
      `SELECT * FROM quake_events WHERE occurred_at BETWEEN ? AND ? ORDER BY occurred_at DESC`,
      occurredAt - windowMs,
      occurredAt + windowMs
    );
    return rows.map(mapEvent);
  }

  async save(event: QuakeEvent): Promise<void> {
    await this.db.run(
      `INSERT INTO quake_events (
        id,
        canonical_event_id,
        temporary_event_key,
        source_first,
        occurred_at,
        hypocenter_name,
        latitude,
        longitude,
        depth_km,
        magnitude,
        max_intensity,
        tsunami_status,
        issue_type,
        status,
        raw_fast_payload,
        raw_authoritative_payload,
        sources_seen,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        canonical_event_id = excluded.canonical_event_id,
        temporary_event_key = excluded.temporary_event_key,
        hypocenter_name = excluded.hypocenter_name,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        depth_km = excluded.depth_km,
        magnitude = excluded.magnitude,
        max_intensity = excluded.max_intensity,
        tsunami_status = excluded.tsunami_status,
        issue_type = excluded.issue_type,
        status = excluded.status,
        raw_fast_payload = excluded.raw_fast_payload,
        raw_authoritative_payload = excluded.raw_authoritative_payload,
        sources_seen = excluded.sources_seen,
        updated_at = excluded.updated_at`,
      event.id,
      event.canonicalEventId,
      event.temporaryEventKey,
      event.sourceFirst,
      event.occurredAt,
      event.hypocenterName,
      event.latitude,
      event.longitude,
      event.depthKm,
      event.magnitude,
      event.maxIntensity,
      event.tsunamiStatus,
      event.issueType,
      event.status,
      event.rawFastPayload,
      event.rawAuthoritativePayload,
      JSON.stringify(event.sourcesSeen),
      event.createdAt,
      event.updatedAt
    );
  }

  async listLatest(limit: number): Promise<QuakeSummary[]> {
    const rows = await this.db.all<Record<string, unknown>[]>(
      `SELECT id, occurred_at, hypocenter_name, depth_km, magnitude, max_intensity, status
       FROM quake_events ORDER BY occurred_at DESC LIMIT ?`,
      limit
    );
    return rows.map((row) => ({
      id: String(row.id),
      occurredAt: Number(row.occurred_at),
      hypocenterName: row.hypocenter_name ? String(row.hypocenter_name) : null,
      depthKm: row.depth_km === null || row.depth_km === undefined ? null : Number(row.depth_km),
      magnitude: row.magnitude === null || row.magnitude === undefined ? null : Number(row.magnitude),
      maxIntensity: row.max_intensity === null || row.max_intensity === undefined ? null : Number(row.max_intensity),
      status: String(row.status) as QuakeSummary["status"]
    }));
  }

  async pruneOlderThan(thresholdMs: number): Promise<void> {
    await this.db.run(`DELETE FROM quake_events WHERE updated_at < ?`, thresholdMs);
    await this.db.run(`DELETE FROM quake_notifications WHERE event_id NOT IN (SELECT id FROM quake_events)`);
  }
}

export class QuakeNotificationRepository {
  constructor(private readonly db: SqliteDatabase) {}

  async load(eventId: string, guildId: string): Promise<QuakeNotificationRecord | null> {
    const row = await this.db.get<Record<string, unknown>>(
      `SELECT * FROM quake_notifications WHERE event_id = ? AND guild_id = ?`,
      eventId,
      guildId
    );
    return row ? mapNotification(row) : null;
  }

  async listByEvent(eventId: string): Promise<QuakeNotificationRecord[]> {
    const rows = await this.db.all<Record<string, unknown>[]>(
      `SELECT * FROM quake_notifications WHERE event_id = ?`,
      eventId
    );
    return rows.map(mapNotification);
  }

  async save(record: QuakeNotificationRecord): Promise<void> {
    await this.db.run(
      `INSERT INTO quake_notifications (
        event_id,
        guild_id,
        channel_id,
        message_id,
        last_render_hash,
        image_url,
        source_url,
        image_status,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(event_id, guild_id) DO UPDATE SET
        channel_id = excluded.channel_id,
        message_id = excluded.message_id,
        last_render_hash = excluded.last_render_hash,
        image_url = excluded.image_url,
        source_url = excluded.source_url,
        image_status = excluded.image_status,
        updated_at = excluded.updated_at`,
      record.eventId,
      record.guildId,
      record.channelId,
      record.messageId,
      record.lastRenderHash,
      record.imageUrl,
      record.sourceUrl,
      record.imageStatus,
      record.updatedAt
    );
  }
}
