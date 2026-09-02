import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant, LovelaceCardEditor, M3GroupCardConfig, LovelaceCardConfig } from "./types";
import { DEFAULT_GROUP_RADIUS, DEFAULT_GROUP_GAP } from "./const";
import { localize, type TranslationKey } from "./localize";
import { fireEvent, colorRow, editorStyles, type SchemaEntry } from "./shared/editor-helpers";
import {
  initAppearanceState,
  radiusPresetPatch,
  cornerPresetPatch,
  renderAppearanceSection,
  type AppearanceState,
} from "./shared/appearance-editor";
import { radiusLabelMap } from "./shared/radius-editor";
import { renderGroupCardsListEditor, groupCardsListStyles } from "./shared/group-cards-editor";

@customElement("m3-group-card-editor")
export class M3GroupCardEditor extends LitElement implements LovelaceCardEditor<M3GroupCardConfig> {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3GroupCardConfig;
  @state() private _appearance: AppearanceState = {
    showCustomRadius: false,
    showCorners: false,
    cornerCustom: {},
  };
  @state() private _showPicker = false;

  public setConfig(config: M3GroupCardConfig): void {
    this._config = config;
    this._appearance = initAppearanceState(config, DEFAULT_GROUP_RADIUS);
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey): string {
    return localize(key, this._language);
  }

  private _emit(config: M3GroupCardConfig): void {
    this._config = config;
    fireEvent(this, "config-changed", { config });
  }

  private _itemLabel(card: LovelaceCardConfig, index: number): string {
    const type = typeof card.type === "string" ? card.type.replace(/^custom:/, "") : "";
    const entity = typeof card.entity === "string" ? card.entity : undefined;
    const name = entity
      ? ((this.hass?.states[entity]?.attributes.friendly_name as string | undefined) ?? entity)
      : undefined;
    return name ? `${type} — ${name}` : type || `#${index + 1}`;
  }

  private _cardsChanged(cards: LovelaceCardConfig[]): void {
    if (!this._config) return;
    this._emit({ ...this._config, cards });
  }

  private _valueChanged(ev: CustomEvent): void {
    if (!this._config) return;
    this._emit({ ...this._config, ...(ev.detail.value as Record<string, unknown>) });
  }

  private _colorChanged(field: "card_background", value: string): void {
    if (!this._config) return;
    if (value) {
      this._emit({ ...this._config, [field]: value });
    } else {
      const { [field]: _drop, ...rest } = this._config;
      this._emit(rest as M3GroupCardConfig);
    }
  }

  private _radiusPresetChanged(ev: CustomEvent): void {
    if (!this._config) return;
    const patch = radiusPresetPatch(ev.detail.value.radius_preset as string);
    this._appearance = { ...this._appearance, showCustomRadius: patch.showCustomRadius };
    if (patch.radius !== undefined) this._emit({ ...this._config, radius: patch.radius });
  }

  private _cornersToggleChanged(ev: CustomEvent): void {
    if (!this._config) return;
    const showCorners = ev.detail.value.use_corners as boolean;
    this._appearance = { ...this._appearance, showCorners };
    if (!showCorners) {
      const { corners: _corners, ...rest } = this._config;
      this._emit(rest as M3GroupCardConfig);
    }
  }

  private _cornerPresetChanged(key: string, ev: CustomEvent): void {
    if (!this._config) return;
    const patch = cornerPresetPatch(ev.detail.value[key] as string);
    this._appearance = {
      ...this._appearance,
      cornerCustom: { ...this._appearance.cornerCustom, [key]: patch.custom },
    };
    if (patch.px !== undefined) {
      this._emit({ ...this._config, corners: { ...(this._config.corners ?? {}), [key]: patch.px } });
    }
  }

  private _cornerValueChanged(key: string, ev: CustomEvent): void {
    if (!this._config) return;
    const px = ev.detail.value[key] as number;
    this._emit({ ...this._config, corners: { ...(this._config.corners ?? {}), [key]: px } });
  }

  private _computeLabel = (schema: SchemaEntry): string => {
    const labelMap: Record<string, TranslationKey> = {
      gap: "editor_group_gap",
      glass_background: "editor_glass_background",
      ...radiusLabelMap,
    };
    const key = labelMap[schema.name];
    return key ? this._t(key) : schema.name;
  };

  private _gapSchema(): SchemaEntry[] {
    return [{ name: "gap", selector: { number: { mode: "box", min: 0, step: 1, unit_of_measurement: "px" } } }];
  }

  protected render() {
    if (!this.hass || !this._config) return nothing;
    const gapData = { gap: this._config.gap ?? DEFAULT_GROUP_GAP };

    return html`
      <div class="editor">
        <ha-expansion-panel outlined .header=${this._t("editor_group_cards")} expanded>
          <ha-icon slot="leading-icon" icon="mdi:view-stream-outline"></ha-icon>
          <div class="panel-content">
            ${renderGroupCardsListEditor({
              hass: this.hass,
              cards: this._config.cards ?? [],
              showPicker: this._showPicker,
              onCardsChange: (cards) => this._cardsChanged(cards),
              onShowPickerChange: (show) => {
                this._showPicker = show;
              },
              itemLabel: (card, index) => this._itemLabel(card, index),
              addLabel: this._t("editor_group_add_card"),
              removeLabel: this._t("editor_group_remove_card"),
              moveUpLabel: this._t("editor_group_move_up"),
              moveDownLabel: this._t("editor_group_move_down"),
              emptyLabel: this._t("editor_group_empty"),
              noVisualEditorLabel: this._t("editor_group_no_visual_editor"),
              addOtherHint: this._t("editor_group_add_other_hint"),
            })}
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_group_layout")}>
          <ha-icon slot="leading-icon" icon="mdi:arrow-split-horizontal"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${gapData}
              .schema=${this._gapSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_progress_colors")}>
          <ha-icon slot="leading-icon" icon="mdi:palette-outline"></ha-icon>
          <div class="panel-content">
            ${colorRow(this._t("editor_progress_card_background"), this._config.card_background, (v) =>
              this._colorChanged("card_background", v),
            )}
          </div>
        </ha-expansion-panel>

        ${renderAppearanceSection({
          hass: this.hass,
          language: this._language,
          config: this._config,
          defaultRadius: DEFAULT_GROUP_RADIUS,
          state: this._appearance,
          computeLabel: this._computeLabel,
          onValueChanged: this._valueChanged.bind(this),
          onRadiusPresetChanged: this._radiusPresetChanged.bind(this),
          onCornersToggleChanged: this._cornersToggleChanged.bind(this),
          onCornerPresetChanged: this._cornerPresetChanged.bind(this),
          onCornerValueChanged: this._cornerValueChanged.bind(this),
        })}
      </div>
    `;
  }

  static styles = [editorStyles, groupCardsListStyles];
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-group-card-editor": M3GroupCardEditor;
  }
}
