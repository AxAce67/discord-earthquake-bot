import { Client, GatewayIntentBits } from "discord.js";
import type { Database } from "sqlite";
import { loadConfig, type AppConfig } from "../config/env.js";
import { createDatabase } from "../storage/database.js";
import {
  GuildSettingsRepository,
  QuakeEventRepository,
  QuakeNotificationRepository
} from "../storage/repositories.js";
import { createLogger } from "../utils/logger.js";
import { P2PQuakeClient } from "../sources/p2pquake-client.js";
import { JmaClient } from "../sources/jma-client.js";
import { YahooImageClient } from "../sources/yahoo-image-client.js";
import { QuakeMergeService } from "../services/quake-merge-service.js";
import { QuakeNotificationService } from "../services/quake-notification-service.js";
import { QuakeIngestService } from "../services/quake-ingest-service.js";
import { QuakeConfigService } from "../services/quake-config-service.js";
import { QuakeCommandHandler } from "../commands/quake-command-handler.js";
import { InteractionHandler } from "../interactions/interaction-handler.js";

export interface AppContainer {
  config: AppConfig;
  client: Client;
  database: Database;
  ingestService: QuakeIngestService;
  interactionHandler: InteractionHandler;
  logger: ReturnType<typeof createLogger>;
}

export async function createAppContainer(): Promise<AppContainer> {
  const config = loadConfig();
  const logger = createLogger(config);
  const database = await createDatabase(config.DATABASE_URL);

  const client = new Client({
    intents: [GatewayIntentBits.Guilds]
  });

  const settings = new GuildSettingsRepository(database);
  const events = new QuakeEventRepository(database);
  const notifications = new QuakeNotificationRepository(database);
  const p2pquakeClient = new P2PQuakeClient(config, logger.child({ source: "p2pquake" }));
  const jmaClient = new JmaClient(config, logger.child({ source: "jma" }));
  const yahooClient = new YahooImageClient(config, logger.child({ source: "yahoo" }));
  const mergeService = new QuakeMergeService(events, logger.child({ service: "merge" }));
  const notificationService = new QuakeNotificationService(
    client,
    settings,
    notifications,
    logger.child({ service: "notify" })
  );
  const ingestService = new QuakeIngestService(
    config,
    p2pquakeClient,
    jmaClient,
    yahooClient,
    events,
    mergeService,
    notificationService,
    logger.child({ service: "ingest" })
  );
  const configService = new QuakeConfigService(settings);
  const commandHandler = new QuakeCommandHandler(configService, events, notificationService);
  const interactionHandler = new InteractionHandler(client, commandHandler, logger.child({ service: "slash" }));

  return {
    config,
    client,
    database,
    ingestService,
    interactionHandler,
    logger
  };
}
