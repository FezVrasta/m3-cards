import { customElement } from "lit/decorators.js";
import { M3NasCard } from "./m3-nas-card";
import type { M3NasCardConfig, LovelaceCardEditor, HostSource } from "./types";

// The Home Assistant host and a NAS are the same kind of subject — volumes,
// CPU, memory, temperature, network, uptime — so this card is the NAS card
// pointed at the System Monitor integration instead of Glances. Sharing the
// implementation keeps the two tiles visually identical, which is the whole
// point of having them side by side.
@customElement("m3-system-card")
export class M3SystemCard extends M3NasCard {
  protected get _source(): HostSource {
    return this._config?.source ?? "systemmonitor";
  }

  public setConfig(config: M3NasCardConfig): void {
    super.setConfig({ source: "systemmonitor", ...config });
  }

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./m3-nas-card-editor");
    return document.createElement("m3-nas-card-editor") as unknown as LovelaceCardEditor;
  }

  public static getStubConfig(): Partial<M3NasCardConfig> {
    return { source: "systemmonitor" };
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-system-card": M3SystemCard;
  }
}

const windowWithCards = window as unknown as Window & {
  customCards: Array<Record<string, unknown>>;
};
windowWithCards.customCards = windowWithCards.customCards || [];
windowWithCards.customCards.push({
  type: "m3-system-card",
  name: "M3 System Card",
  description:
    "Speicher, CPU, RAM und Temperatur der Home-Assistant-Instanz über die System-Monitor-Integration.",
  preview: true,
  documentationURL: "https://github.com/j0sp0r/m3-cards",
});
