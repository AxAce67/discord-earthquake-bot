import * as cheerio from "cheerio";
import type pino from "pino";
import type { AppConfig } from "../config/env.js";
import type { QuakeEvent, QuakeImageResult, YahooDetailPage, YahooListEntry } from "../types/quake.js";

export class YahooImageClient {
  constructor(
    private readonly config: AppConfig,
    private readonly logger: pino.Logger
  ) {}

  async findImage(event: QuakeEvent): Promise<QuakeImageResult> {
    try {
      const listHtml = await this.fetchText(this.config.YAHOO_LIST_URL);
      const entries = parseYahooEarthquakeListEntries(listHtml, this.config.YAHOO_BASE_URL);
      const candidate = this.pickBestListEntry(entries, event);

      if (!candidate) {
        return { imageUrl: null, detailUrl: null };
      }

      const detailHtml = await this.fetchText(candidate.detailPath);
      const detail = parseYahooEarthquakeDetail(detailHtml);
      const imageUrl = detail.pointImageUrl ?? detail.areaImageUrl;

      return {
        imageUrl,
        detailUrl: candidate.detailPath
      };
    } catch (error) {
      this.logger.warn({ err: error, eventId: event.id }, "Failed to fetch Yahoo quake image");
      return { imageUrl: null, detailUrl: null };
    }
  }

  private async fetchText(url: string): Promise<string> {
    const response = await fetch(url, {
      headers: {
        "user-agent": "KanadeQuakeBot/0.1 (+https://example.invalid)"
      },
      signal: AbortSignal.timeout(this.config.YAHOO_HTTP_TIMEOUT_MS)
    });

    if (!response.ok) {
      throw new Error(`Yahoo request failed: ${response.status}`);
    }

    return response.text();
  }

  private pickBestListEntry(entries: YahooListEntry[], event: QuakeEvent): YahooListEntry | null {
    const targetMinute = Math.floor(event.occurredAt / 60000);

    const exact =
      entries.find((entry) => {
        return (
          Math.floor(entry.occurredAt / 60000) === targetMinute &&
          entry.hypocenterName === event.hypocenterName &&
          entry.maxIntensity === event.maxIntensity
        );
      }) ?? null;

    if (exact) {
      return exact;
    }

    return (
      entries.find((entry) => {
        return (
          Math.abs(entry.occurredAt - event.occurredAt) <= 120000 &&
          entry.hypocenterName === event.hypocenterName
        );
      }) ?? null
    );
  }
}

export function parseYahooEarthquakeListEntries(html: string, baseUrl: string): YahooListEntry[] {
  const $ = cheerio.load(html);
  const scopedRows = $("#eqhist tr").slice(1).toArray();
  const rows = scopedRows.length > 0 ? scopedRows : $("tr").toArray();

  return rows
    .map((row) => {
      const cells = $(row).find("td");
      if (cells.length < 4) {
        return null;
      }

      const anchor = cells.eq(0).find("a");
      const href = anchor.attr("href");
      const occurredAt = parseYahooDate(anchor.text().trim());
      const hypocenterName = cells.eq(1).text().trim();
      const magnitude = parseNullableNumber(cells.eq(2).text().trim());
      const maxIntensity = parseYahooIntensity(cells.eq(3).text().trim());

      if (!href || occurredAt === null || hypocenterName.length === 0) {
        return null;
      }

      return {
        detailPath: new URL(href, baseUrl).toString(),
        occurredAt,
        hypocenterName,
        magnitude,
        maxIntensity
      };
    })
    .filter((entry): entry is YahooListEntry => entry !== null);
}

export function parseYahooEarthquakeDetail(html: string): YahooDetailPage {
  const $ = cheerio.load(html);
  const ogImage = $('meta[property="og:image"]').attr("content") ?? null;
  const images = $("img")
    .toArray()
    .map((element) => $(element).attr("src"))
    .filter((src): src is string => typeof src === "string");

  const pointImageUrl = images.find((src) => src.includes("_point.png")) ?? ogImage;
  const areaImageUrl = images.find((src) => src.includes("_area.png")) ?? null;
  const rows = $("#eqinfdtl table").first().find("tr").toArray();
  const map = new Map<string, string>();

  for (const row of rows) {
    const label = $(row).find("td").eq(0).text().trim();
    const value = $(row).find("td").eq(1).text().trim();
    if (label.length > 0) {
      map.set(label, value);
    }
  }

  return {
    pointImageUrl,
    areaImageUrl,
    hypocenterName: map.get("震源地") ?? null,
    occurredAt: parseYahooDate(map.get("発生時刻") ?? ""),
    maxIntensity: parseYahooIntensity(map.get("最大震度") ?? ""),
    magnitude: parseNullableNumber(map.get("マグニチュード") ?? ""),
    depthKm: parseYahooDepth(map.get("深さ") ?? "")
  };
}

function parseYahooDate(value: string): number | null {
  const match =
    value.match(/(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\d{1,2})時(\d{1,2})分(?:ごろ)?/) ??
    value.match(/(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})/);

  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute] = match;
  return new Date(
    `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute.padStart(2, "0")}:00+09:00`
  ).getTime();
}

function parseYahooIntensity(value: string): number | null {
  switch (value) {
    case "1":
      return 10;
    case "2":
      return 20;
    case "3":
      return 30;
    case "4":
      return 40;
    case "5弱":
      return 45;
    case "5強":
      return 50;
    case "6弱":
      return 55;
    case "6強":
      return 60;
    case "7":
      return 70;
    default:
      return null;
  }
}

function parseNullableNumber(value: string): number | null {
  if (!value || value === "-") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseYahooDepth(value: string): number | null {
  if (value === "ごく浅い") {
    return 0;
  }

  const match = value.match(/(\d+)km/);
  return match ? Number(match[1]) : null;
}
