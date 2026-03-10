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
  if (event.status === "image_unavailable") {
    return "画像未取得";
  }

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

function getEmbedColor(event: QuakeEvent): number {
  const isUnconfirmed =
    event.status === "detected" ||
    event.hypocenterName === null ||
    event.magnitude === null ||
    event.depthKm === null;

  if (isUnconfirmed) {
    return 0x868e96;
  }

  const intensity = event.maxIntensity ?? 0;

  if (intensity >= 60) {
    return 0x9c1c1c;
  }

  if (intensity >= 50) {
    return 0xc92a2a;
  }

  if (intensity >= 45) {
    return 0xd9480f;
  }

  if (intensity >= 40) {
    return 0xf08c00;
  }

  if (intensity >= 30) {
    return 0xf59f00;
  }

  if (intensity >= 20) {
    return 0x2b8a3e;
  }

  return 0x1c7ed6;
}

export function buildQuakeEmbed(event: QuakeEvent, imageUrl: string | null): EmbedBuilder {
  const title = event.status === "detected" ? "地震速報" : "地震情報";
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(getEmbedColor(event))
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
