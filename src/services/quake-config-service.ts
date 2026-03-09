import { GuildSettingsRepository } from "../storage/repositories.js";
import type { GuildQuakeSettings } from "../types/quake.js";

export class QuakeConfigService {
  constructor(private readonly settings: GuildSettingsRepository) {}

  async setup(guildId: string, channelId: string): Promise<GuildQuakeSettings> {
    const current = await this.settings.load(guildId);
    const updated: GuildQuakeSettings = {
      ...current,
      enabled: true,
      channelId,
      updatedAt: Date.now()
    };
    await this.settings.save(updated);
    return updated;
  }

  async disable(guildId: string): Promise<GuildQuakeSettings> {
    const current = await this.settings.load(guildId);
    const updated: GuildQuakeSettings = {
      ...current,
      enabled: false,
      updatedAt: Date.now()
    };
    await this.settings.save(updated);
    return updated;
  }

  async get(guildId: string): Promise<GuildQuakeSettings> {
    return this.settings.load(guildId);
  }
}
