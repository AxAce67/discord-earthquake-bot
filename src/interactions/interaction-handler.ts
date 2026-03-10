import type pino from "pino";
import { MessageFlags, type Client, type Interaction } from "discord.js";
import { QuakeCommandHandler } from "../commands/quake-command-handler.js";

const EPHEMERAL_FLAG = MessageFlags.Ephemeral as const;

export class InteractionHandler {
  constructor(
    private readonly client: Client,
    private readonly commandHandler: QuakeCommandHandler,
    private readonly logger: pino.Logger
  ) {}

  register(): void {
    this.client.on("interactionCreate", async (interaction: Interaction) => {
      if (!interaction.isChatInputCommand()) {
        return;
      }

      try {
        const handled = await this.commandHandler.handle(interaction);
        if (!handled) {
          return;
        }
      } catch (error) {
        this.logger.error({ err: error, commandName: interaction.commandName }, "Slash command failed");
        const payload = { content: "コマンドの処理に失敗しました。", flags: EPHEMERAL_FLAG };
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp(payload).catch(() => undefined);
        } else {
          await interaction.reply(payload).catch(() => undefined);
        }
      }
    });
  }
}
