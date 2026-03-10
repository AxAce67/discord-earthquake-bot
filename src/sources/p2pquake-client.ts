import WebSocket from "ws";
import type pino from "pino";
import type { AppConfig } from "../config/env.js";
import type { RawP2PQuakeEvent } from "../types/quake.js";

export class P2PQuakeClient {
  private socket: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isStopping = false;

  constructor(
    private readonly config: AppConfig,
    private readonly logger: pino.Logger
  ) {}

  start(onEvent: (event: RawP2PQuakeEvent) => Promise<void>): void {
    this.isStopping = false;
    this.connect(onEvent);
  }

  async stop(): Promise<void> {
    this.isStopping = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  private connect(onEvent: (event: RawP2PQuakeEvent) => Promise<void>): void {
    this.logger.info({ url: this.config.P2PQUAKE_WS_URL }, "Connecting to P2PQuake websocket");
    const socket = new WebSocket(this.config.P2PQUAKE_WS_URL);
    this.socket = socket;

    socket.on("open", () => {
      this.logger.info("P2PQuake websocket connected");
    });

    socket.on("message", (data) => {
      void this.handleMessage(data.toString(), onEvent);
    });

    socket.on("error", (error) => {
      this.logger.warn({ err: error }, "P2PQuake websocket error");
    });

    socket.on("close", (code) => {
      this.logger.warn({ code }, "P2PQuake websocket closed");
      if (!this.isStopping) {
        this.scheduleReconnect(onEvent);
      }
    });
  }

  private scheduleReconnect(onEvent: (event: RawP2PQuakeEvent) => Promise<void>): void {
    if (this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect(onEvent);
    }, this.config.P2PQUAKE_RECONNECT_DELAY_MS);
  }

  private async handleMessage(
    message: string,
    onEvent: (event: RawP2PQuakeEvent) => Promise<void>
  ): Promise<void> {
    let parsed: unknown;

    try {
      parsed = JSON.parse(message);
    } catch (error) {
      this.logger.warn({ err: error, message }, "Failed to parse P2PQuake message");
      return;
    }

    if (!parsed || typeof parsed !== "object") {
      return;
    }

    const event = parsed as RawP2PQuakeEvent;
    if (this.config.P2PQUAKE_LOG_INCOMING) {
      this.logger.info(
        {
          code: event.code,
          id: event.id ?? null,
          issueType: event.issue?.type ?? null,
          issueSource: event.issue?.source ?? null,
          earthquakeTime: event.earthquake?.time ?? null,
          receivedTime: event.time ?? null,
          hypocenterName: event.earthquake?.hypocenter?.name ?? null,
          maxScale: event.earthquake?.maxScale ?? null
        },
        "Observed incoming P2PQuake websocket event"
      );
    }

    if (event.code !== 551 || !event.earthquake || !event.issue) {
      return;
    }

    await onEvent(event);
  }
}
