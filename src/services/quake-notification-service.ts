import { createHash } from "node:crypto";
import type pino from "pino";
import { ChannelType, type Client, type TextChannel } from "discord.js";
import { GuildSettingsRepository, QuakeNotificationRepository } from "../storage/repositories.js";
import type { QuakeEvent } from "../types/quake.js";
import { buildQuakeEmbed } from "../ui/quake-embed.js";

function isSendableChannel(channel: unknown): channel is TextChannel {
  return !!channel && typeof channel === "object" && "type" in channel && channel.type === ChannelType.GuildText;
}

export class QuakeNotificationService {
  constructor(
    private readonly client: Client,
    private readonly settings: GuildSettingsRepository,
    private readonly notifications: QuakeNotificationRepository,
    private readonly logger: pino.Logger
  ) {}

  async notifyForEvent(event: QuakeEvent, imageUrl: string | null): Promise<void> {
    const guildSettings = await this.settings.listEnabled();

    for (const setting of guildSettings) {
      if (!setting.channelId || (event.maxIntensity ?? 0) < setting.thresholdIntensity) {
        continue;
      }

      await this.sendOrUpdate(setting.guildId, setting.channelId, event, imageUrl);
    }
  }

  async sendTestNotification(channel: TextChannel): Promise<void> {
    const now = Date.now();
    const event: QuakeEvent = {
      id: "test-event",
      canonicalEventId: "test-event",
      temporaryEventKey: "test-event",
      sourceFirst: "p2pquake",
      occurredAt: now,
      hypocenterName: "テスト震源",
      latitude: 35,
      longitude: 139,
      depthKm: 10,
      magnitude: 4.2,
      maxIntensity: 30,
      tsunamiStatus: "None",
      issueType: "DetailScale",
      status: "final",
      rawFastPayload: "{}",
      rawAuthoritativePayload: "{}",
      sourcesSeen: ["p2pquake", "jma", "yahoo"],
      createdAt: now,
      updatedAt: now
    };

    await channel.send({ embeds: [buildQuakeEmbed(event, null)] });
  }

  private async sendOrUpdate(guildId: string, channelId: string, event: QuakeEvent, imageUrl: string | null): Promise<void> {
    const channel = await this.client.channels.fetch(channelId).catch(() => null);
    if (!isSendableChannel(channel)) {
      this.logger.warn({ guildId, channelId }, "Configured quake notification channel is not sendable");
      return;
    }

    const embed = buildQuakeEmbed(event, imageUrl);
    const renderHash = createHash("sha256").update(JSON.stringify(embed.toJSON())).digest("hex");
    const existing = await this.notifications.load(event.id, guildId);

    if (existing && existing.lastRenderHash === renderHash && existing.imageUrl === imageUrl) {
      return;
    }

    if (!existing) {
      const created = await channel.send({ embeds: [embed] });
      await this.notifications.save({
        eventId: event.id,
        guildId,
        channelId,
        messageId: created.id,
        lastRenderHash: renderHash,
        imageUrl,
        imageStatus: imageUrl ? "attached" : "pending",
        updatedAt: Date.now()
      });
      this.logger.info({ guildId, eventId: event.id, messageId: created.id }, "Sent quake notification");
      return;
    }

    const message = await channel.messages.fetch(existing.messageId).catch(() => null);
    if (!message) {
      const recreated = await channel.send({ embeds: [embed] });
      await this.notifications.save({
        eventId: event.id,
        guildId,
        channelId,
        messageId: recreated.id,
        lastRenderHash: renderHash,
        imageUrl,
        imageStatus: imageUrl ? "attached" : existing.imageStatus,
        updatedAt: Date.now()
      });
      this.logger.warn({ guildId, eventId: event.id }, "Notification message missing; recreated");
      return;
    }

    await message.edit({ embeds: [embed] });
    await this.notifications.save({
      eventId: event.id,
      guildId,
      channelId,
      messageId: message.id,
      lastRenderHash: renderHash,
      imageUrl,
      imageStatus: imageUrl ? "attached" : existing.imageStatus,
      updatedAt: Date.now()
    });
    this.logger.info({ guildId, eventId: event.id, messageId: message.id }, "Updated quake notification");
  }
}
