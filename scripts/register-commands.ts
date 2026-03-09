import { REST, Routes } from "discord.js";
import { loadConfig } from "../src/config/env.js";
import { quakeCommands } from "../src/commands/quake-command-handler.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const rest = new REST({ version: "10" }).setToken(config.DISCORD_TOKEN);

  await rest.put(Routes.applicationCommands(config.DISCORD_CLIENT_ID), {
    body: quakeCommands
  });

  console.log(`Registered ${quakeCommands.length} application commands.`);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
