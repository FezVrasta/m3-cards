import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant, LovelaceCardEditor, M3EnergyFlowCardConfig } from "./types";
import { localize, type TranslationKey } from "./localize";
import { fireEvent, editorStyles, type SchemaEntry } from "./shared/editor-helpers";

// Phase 1 stub — full editor (colors, battery/animation toggles, etc.)
// lands in Phase 4, mirroring how the other cards in this project started.
@customElement("m3-energy-flow-card-editor")
export class M3EnergyFlowCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3EnergyFlowCardConfig;

  public setConfig(config: M3EnergyFlowCardConfig): void {
    this._config = config;
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey): string {
    return localize(key, this._language);
  }

  private _schema(): SchemaEntry[] {
    const source = this._config?.source ?? "energy";
    const fields: SchemaEntry[] = [
      {
        name: "source",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "energy", label: this._t("editor_flow_source_energy") },
              { value: "entities", label: this._t("editor_flow_source_entities") },
            ],
          },
        },
      },
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
    ];
    if (source === "entities") {
      fields.push(
        { name: "solar_entity", selector: { entity: { domain: "sensor" } } },
        { name: "grid_import_entity", selector: { entity: { domain: "sensor" } } },
        { name: "grid_export_entity", selector: { entity: { domain: "sensor" } } },
        { name: "battery_entity", selector: { entity: { domain: "sensor" } } },
      );
    }
    return fields;
  }

  private _computeLabel = (schema: SchemaEntry): string => {
    const labelMap: Record<string, TranslationKey> = {
      source: "editor_flow_source",
      name: "editor_name",
      icon: "editor_icon",
      solar_entity: "editor_flow_solar_entity",
      grid_import_entity: "editor_flow_grid_import_entity",
      grid_export_entity: "editor_flow_grid_export_entity",
      battery_entity: "editor_flow_battery_entity",
    };
    const key = labelMap[schema.name];
    return key ? this._t(key) : schema.name;
  };

  private _valueChanged(ev: CustomEvent): void {
    if (!this._config) return;
    this._config = { ...this._config, ...ev.detail.value };
    fireEvent(this, "config-changed", { config: this._config });
  }

  protected render() {
    if (!this.hass || !this._config) return nothing;

    const data = {
      source: this._config.source ?? "energy",
      name: this._config.name,
      icon: this._config.icon,
      solar_entity: this._config.solar_entity,
      grid_import_entity: this._config.grid_import_entity,
      grid_export_entity: this._config.grid_export_entity,
      battery_entity: this._config.battery_entity,
    };

    return html`
      <div class="editor">
        <ha-form
          .hass=${this.hass}
          .data=${data}
          .schema=${this._schema()}
          .computeLabel=${this._computeLabel}
          @value-changed=${this._valueChanged}
        ></ha-form>
      </div>
    `;
  }

  static styles = editorStyles;
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-energy-flow-card-editor": M3EnergyFlowCardEditor;
  }
}
