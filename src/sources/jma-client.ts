import type pino from "pino";
import type { AppConfig } from "../config/env.js";
import type { RawP2PQuakeEvent } from "../types/quake.js";

export class JmaClient {
  constructor(
    private readonly config: AppConfig,
    private readonly logger: pino.Logger
  ) {}

  async fetchRecentDetailedQuakes(limit = 20): Promise<RawP2PQuakeEvent[]> {
    const url = new URL("/jma/quake", this.config.P2PQUAKE_HTTP_BASE_URL);
    url.searchParams.set("limit", String(limit));

    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.config.P2PQUAKE_HTTP_TIMEOUT_MS)
    });

    if (!response.ok) {
      throw new Error(`JMA quake API failed: ${response.status}`);
    }

    const payload = (await response.json()) as RawP2PQuakeEvent[];
    return payload.filter((entry) => entry.code === 551 && !!entry.earthquake && !!entry.issue);
  }

  async findMatchingDetailedQuake(event: RawP2PQuakeEvent): Promise<RawP2PQuakeEvent | null> {
    const recent = await this.fetchRecentDetailedQuakes(20);
    const targetTime = normalizeApiTime(event.earthquake?.time ?? "");
    const targetName = event.earthquake?.hypocenter?.name ?? null;

    const match =
      recent.find((candidate) => {
        const candidateTime = normalizeApiTime(candidate.earthquake?.time ?? "");
        const candidateName = candidate.earthquake?.hypocenter?.name ?? null;
        return candidateTime === targetTime && candidateName === targetName;
      }) ?? null;

    this.logger.debug({ found: !!match, eventId: event.id }, "Resolved detailed quake candidate");
    return match;
  }
}

function normalizeApiTime(value: string): string {
  return value.replace(/\//g, "-").replace(" ", "T");
}
