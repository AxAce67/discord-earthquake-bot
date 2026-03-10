import type pino from "pino";
import type { AppConfig } from "../config/env.js";
import { QuakeEventRepository } from "../storage/repositories.js";
import type { QuakeEvent, RawP2PQuakeEvent } from "../types/quake.js";
import { JmaClient } from "../sources/jma-client.js";
import { P2PQuakeClient } from "../sources/p2pquake-client.js";
import { YahooImageClient } from "../sources/yahoo-image-client.js";
import { QuakeMergeService } from "./quake-merge-service.js";
import { QuakeNotificationService } from "./quake-notification-service.js";

export class QuakeIngestService {
  private readonly authoritativeTimers = new Map<string, NodeJS.Timeout[]>();
  private readonly imageTimers = new Map<string, NodeJS.Timeout>();
  private readonly authoritativeFailuresWarned = new Set<string>();

  constructor(
    private readonly config: AppConfig,
    private readonly p2pquakeClient: P2PQuakeClient,
    private readonly jmaClient: JmaClient,
    private readonly yahooClient: YahooImageClient,
    private readonly events: QuakeEventRepository,
    private readonly mergeService: QuakeMergeService,
    private readonly notificationService: QuakeNotificationService,
    private readonly logger: pino.Logger
  ) {}

  start(): void {
    this.p2pquakeClient.start(async (event) => {
      await this.handleRealtimeEvent(event);
    });
  }

  async stop(): Promise<void> {
    for (const timers of this.authoritativeTimers.values()) {
      for (const timer of timers) {
        clearTimeout(timer);
      }
    }
    this.authoritativeTimers.clear();

    for (const timer of this.imageTimers.values()) {
      clearTimeout(timer);
    }
    this.imageTimers.clear();

    await this.p2pquakeClient.stop();
  }

  private async handleRealtimeEvent(raw: RawP2PQuakeEvent): Promise<void> {
    const result = await this.mergeService.ingestFastEvent(raw);
    if (result.isNew || result.changed) {
      await this.notificationService.notifyForEvent(result.event, null);
    }

    this.scheduleAuthoritativeResolution(result.event.id, raw);
    this.scheduleYahooImageResolution(result.event.id);
    await this.events.pruneOlderThan(Date.now() - 7 * 24 * 60 * 60 * 1000);
  }

  private scheduleAuthoritativeResolution(eventId: string, raw: RawP2PQuakeEvent): void {
    if (this.authoritativeTimers.has(eventId)) {
      return;
    }

    const timers = this.config.AUTHORITATIVE_RESOLVE_DELAYS_MS.map((delayMs) =>
      setTimeout(() => {
        void this.resolveAuthoritative(eventId, raw);
      }, delayMs)
    );

    this.authoritativeTimers.set(eventId, timers);
  }

  private scheduleYahooImageResolution(eventId: string): void {
    if (this.imageTimers.has(eventId)) {
      return;
    }

    const timer = setTimeout(() => {
      this.imageTimers.delete(eventId);
      void this.resolveYahooImage(eventId);
    }, 5000);

    this.imageTimers.set(eventId, timer);
  }

  private async resolveAuthoritative(eventId: string, raw: RawP2PQuakeEvent): Promise<void> {
    const detailed = await this.jmaClient.findMatchingDetailedQuake(raw).catch((error) => {
      if (this.authoritativeFailuresWarned.has(eventId)) {
        this.logger.debug({ err: error, eventId }, "Failed to resolve authoritative quake details");
      } else {
        this.authoritativeFailuresWarned.add(eventId);
        this.logger.warn({ err: error, eventId }, "Failed to resolve authoritative quake details");
      }
      return null;
    });

    if (!detailed) {
      return;
    }

    this.authoritativeFailuresWarned.delete(eventId);

    const { event, changed } = await this.mergeService.mergeAuthoritativeEvent(eventId, detailed);
    if (changed) {
      await this.notificationService.notifyForEvent(event, null);
    }
  }

  private async resolveYahooImage(eventId: string): Promise<void> {
    const event = await this.events.findById(eventId);
    if (!event) {
      return;
    }

    const result = await this.yahooClient.findImage(event);
    if (!result.imageUrl) {
      this.logger.info({ eventId, detailUrl: result.detailUrl }, "Yahoo quake image was not available");
      const updated = await this.mergeService.markImageUnavailable(eventId);
      if (updated) {
        await this.notificationService.notifyForEvent(updated, null);
      }
      return;
    }

    this.logger.info({ eventId, detailUrl: result.detailUrl, imageUrl: result.imageUrl }, "Attached Yahoo quake image");
    const updated = await this.mergeService.markImageAttached(eventId);
    if (updated) {
      await this.notificationService.notifyForEvent(updated, result.imageUrl);
    }
  }
}
