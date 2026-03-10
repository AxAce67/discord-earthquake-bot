import { EmbedBuilder } from "discord.js";
import type { QuakeEvent } from "../types/quake.js";
import { formatScaleLabel } from "../types/quake.js";

function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Tokyo"
  }).format(new Date(timestamp));
}

function formatDepth(depthKm: number | null): string {
  if (depthKm === null) {
    return "不明";
  }

  if (depthKm === 0) {
    return "ごく浅い";
  }

  return `${Math.round(depthKm)}km`;
}

function formatMagnitude(magnitude: number | null): string {
  if (magnitude === null || magnitude < 0) {
    return "不明";
  }

  return magnitude.toFixed(1);
}

function formatTsunamiStatus(status: string | null): string {
  switch (status) {
    case "None":
      return "津波の心配なし";
    case "Checking":
      return "津波調査中";
    case "NonEffective":
      return "若干の海面変動の可能性あり";
    case "Watch":
      return "津波注意報";
    case "Warning":
      return "津波予報あり";
    default:
      return status ?? "不明";
  }
}

function formatStatusLabel(event: QuakeEvent): string {
  if (event.status === "final") {
    return "詳細確定";
  }

  if (event.status === "detailed") {
    if (event.issueType === "Destination" || event.issueType === "ScaleAndDestination") {
      return "震源確定";
    }

    return "更新";
  }

  return "速報";
}

export function buildQuakeEmbed(event: QuakeEvent, imageUrl: string | null): EmbedBuilder {
  const title = event.status === "detected" ? "地震速報" : "地震情報";
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(event.status === "detected" ? 0xff8c00 : 0xd62828)
    .addFields(
      { name: "発生時刻", value: formatDateTime(event.occurredAt), inline: true },
      { name: "震源", value: event.hypocenterName ?? "不明", inline: true },
      { name: "最大震度", value: formatScaleLabel(event.maxIntensity), inline: true },
      { name: "マグニチュード", value: formatMagnitude(event.magnitude), inline: true },
      { name: "深さ", value: formatDepth(event.depthKm), inline: true },
      { name: "津波", value: formatTsunamiStatus(event.tsunamiStatus), inline: true },
      { name: "状態", value: formatStatusLabel(event), inline: true },
      { name: "ソース", value: event.sourcesSeen.join(", "), inline: true }
    )
    .setFooter({ text: `event_id: ${event.id}` })
    .setTimestamp(new Date(event.updatedAt));

  if (imageUrl) {
    embed.setImage(imageUrl);
  }

  return embed;
}
