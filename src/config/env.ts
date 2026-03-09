import { config as loadDotEnv } from "dotenv";
import { z } from "zod";

loadDotEnv();

const commaSeparatedNumbers = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => Number(entry));
}, z.array(z.number().int().nonnegative()).default([15000, 30000, 60000]));

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DATABASE_URL: z.string().min(1).default("./data/quake-bot.sqlite"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  P2PQUAKE_WS_URL: z.string().url().default("wss://api.p2pquake.net/v2/ws"),
  P2PQUAKE_HTTP_BASE_URL: z.string().url().default("https://api.p2pquake.net/v2"),
  P2PQUAKE_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  P2PQUAKE_RECONNECT_DELAY_MS: z.coerce.number().int().positive().default(5000),
  YAHOO_LIST_URL: z.string().url().default("https://typhoon.yahoo.co.jp/weather/jp/earthquake/list/"),
  YAHOO_BASE_URL: z.string().url().default("https://typhoon.yahoo.co.jp"),
  YAHOO_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
  AUTHORITATIVE_RESOLVE_DELAYS_MS: commaSeparatedNumbers
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(): AppConfig {
  return envSchema.parse(process.env);
}
