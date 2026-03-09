import pino from "pino";
import type { AppConfig } from "../config/env.js";

export function createLogger(config: AppConfig): pino.Logger {
  return pino({
    level: config.LOG_LEVEL
  });
}
