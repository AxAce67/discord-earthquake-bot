import {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
  type TextChannel
} from "discord.js";
import { QuakeConfigService } from "../services/quake-config-service.js";
import { QuakeEventRepository } from "../storage/repositories.js";
import { QuakeNotificationService } from "../services/quake-notification-service.js";

const EPHEMERAL_FLAG = MessageFlags.Ephemeral as const;

export const quakeCommands = [
  new SlashCommandBuilder()
    .setName("quake")
    .setDescription("地震通知の設定と確認を行います")
    .addSubcommand((subcommand) =>
      subcommand.setName("setup").setDescription("このチャンネルを地震通知チャンネルに設定します")
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("disable").setDescription("このサーバーでの地震通知を無効化します")
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("status").setDescription("地震通知の現在の設定を表示します")
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("test").setDescription("テスト用の地震通知を送信します")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("latest")
        .setDescription("保存されている最新の地震情報を表示します")
        .addIntegerOption((option) =>
          option.setName("count").setDescription("表示件数").setMinValue(1).setMaxValue(5)
        )
    )
    .setDMPermission(false)
].map((command) => command.toJSON());

function formatDateTime(value: number): string {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Tokyo"
  }).format(new Date(value));
}

function formatIntensity(value: number | null): string {
  if (value === null) {
    return "不明";
  }

  const mapping: Record<number, string> = {
    10: "1",
    20: "2",
    30: "3",
    40: "4",
    45: "5弱",
    50: "5強",
    55: "6弱",
    60: "6強",
    70: "7"
  };

  return mapping[value] ?? String(value);
}

export class QuakeCommandHandler {
  constructor(
    private readonly configService: QuakeConfigService,
    private readonly events: QuakeEventRepository,
    private readonly notificationService: QuakeNotificationService
  ) {}

  async handle(interaction: ChatInputCommandInteraction): Promise<boolean> {
    if (interaction.commandName !== "quake") {
      return false;
    }

    switch (interaction.options.getSubcommand()) {
      case "setup":
        await this.handleSetup(interaction);
        return true;
      case "disable":
        await this.handleDisable(interaction);
        return true;
      case "status":
        await this.handleStatus(interaction);
        return true;
      case "test":
        await this.handleTest(interaction);
        return true;
      case "latest":
        await this.handleLatest(interaction);
        return true;
      default:
        return false;
    }
  }

  private async handleSetup(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guildId || interaction.channel?.type !== ChannelType.GuildText) {
      await interaction.reply({
        content: "このコマンドはサーバーのテキストチャンネルでのみ使えます。",
        flags: EPHEMERAL_FLAG
      });
      return;
    }

    const setting = await this.configService.setup(interaction.guildId, interaction.channelId);
    await interaction.reply({
      content: `このチャンネルを地震通知チャンネルに設定しました。\n有効: ${setting.enabled ? "はい" : "いいえ"}`,
      flags: EPHEMERAL_FLAG
    });
  }

  private async handleDisable(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "このコマンドはサーバー内でのみ使えます。",
        flags: EPHEMERAL_FLAG
      });
      return;
    }

    await this.configService.disable(interaction.guildId);
    await interaction.reply({
      content: "このサーバーでの地震通知を無効化しました。",
      flags: EPHEMERAL_FLAG
    });
  }

  private async handleStatus(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "このコマンドはサーバー内でのみ使えます。",
        flags: EPHEMERAL_FLAG
      });
      return;
    }

    const setting = await this.configService.get(interaction.guildId);
    const embed = new EmbedBuilder()
      .setTitle("地震通知の設定")
      .setColor(setting.enabled ? 0x2b8a3e : 0x868e96)
      .addFields(
        { name: "通知", value: setting.enabled ? "有効" : "無効", inline: true },
        { name: "チャンネル", value: setting.channelId ? `<#${setting.channelId}>` : "未設定", inline: true },
        { name: "しきい値", value: setting.thresholdIntensity > 0 ? formatIntensity(setting.thresholdIntensity) : "未設定", inline: true },
        { name: "画像", value: setting.imageMode === "yahoo_best_effort" ? "Yahoo 補助取得" : setting.imageMode, inline: true },
        { name: "ソース", value: "P2PQuake 優先 / 詳細は JMA 補完", inline: true }
      );

    await interaction.reply({ embeds: [embed], flags: EPHEMERAL_FLAG });
  }

  private async handleTest(interaction: ChatInputCommandInteraction): Promise<void> {
    if (interaction.channel?.type !== ChannelType.GuildText) {
      await interaction.reply({
        content: "このコマンドはサーバーのテキストチャンネルでのみ使えます。",
        flags: EPHEMERAL_FLAG
      });
      return;
    }

    await this.notificationService.sendTestNotification(interaction.channel as TextChannel);
    await interaction.reply({
      content: "テスト通知を送信しました。",
      flags: EPHEMERAL_FLAG
    });
  }

  private async handleLatest(interaction: ChatInputCommandInteraction): Promise<void> {
    const count = interaction.options.getInteger("count") ?? 1;
    const events = await this.events.listLatest(count);

    if (events.length === 0) {
      await interaction.reply({
        content: "保存されている地震情報はまだありません。",
        flags: EPHEMERAL_FLAG
      });
      return;
    }

    const embed = new EmbedBuilder().setTitle("最新の地震情報").setColor(0xe67700);
    for (const event of events) {
      embed.addFields({
        name: `${formatDateTime(event.occurredAt)} / ${event.hypocenterName ?? "震源不明"}`,
        value: `最大震度: ${formatIntensity(event.maxIntensity)}\nM${event.magnitude?.toFixed(1) ?? "?"} / 深さ ${
          event.depthKm !== null ? `${event.depthKm}km` : "不明"
        }\n状態: ${event.status}`
      });
    }

    await interaction.reply({ embeds: [embed], flags: EPHEMERAL_FLAG });
  }
}

export type QuakeCommandDefinition = RESTPostAPIChatInputApplicationCommandsJSONBody;
