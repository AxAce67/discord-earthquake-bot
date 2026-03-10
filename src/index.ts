import { createAppContainer } from "./app/container.js";

async function main(): Promise<void> {
  const container = await createAppContainer();
  const { client, config, ingestService, interactionHandler, logger, database } = container;

  interactionHandler.register();

  client.once("clientReady", () => {
    logger.info({ user: client.user?.tag }, "Discord quake bot is ready");
    ingestService.start();
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Shutting down quake bot");
    await ingestService.stop().catch((error) => logger.error({ err: error }, "Failed to stop ingest service"));
    await client.destroy();
    await database.close().catch((error) => logger.error({ err: error }, "Failed to close database"));
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  await client.login(config.DISCORD_TOKEN);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
