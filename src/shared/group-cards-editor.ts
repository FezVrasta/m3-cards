import { html, css, nothing, type TemplateResult } from "lit";
import type { HomeAssistant, LovelaceCardConfig } from "../types";

// The nested-cards list for m3-group-card-editor.ts — the same two
// HA-internal elements HA's own stock vertical-stack editor uses for its
// `cards` array:
//
// - <hui-card-element-editor> per row: HA's built-in editor that lazy-loads
//   whatever editor the row's own card type registers. Needs only `.hass`
//   and `.value` (the card's config) to render; fires `config-changed` with
//   `detail.config` on itself (verified against home-assistant/frontend's
//   hui-element-editor.ts / hui-card-element-editor.ts).
// - <hui-card-picker> for "add card": HA's real card-type picker (search,
//   favorites, clipboard paste, custom/energy/manual-YAML sections) — the
//   exact same widget behind HA's native "Add Card" dialog, used here
//   inline instead of in a dialog, same as vertical-stack's own editor.
//   A first attempt only set `.hass` and it silently rendered nothing;
//   checking the real source (home-assistant/frontend's hui-card-picker.ts)
//   showed its render() bails out to `nothing` unless `.lovelace` is also
//   set — an empty `{ views: [] }` is enough (only used to compute the
//   unused-entities list for stub configs). Also listens for
//   `config-changed` with `detail.config`.
//
// Both are undocumented/internal HA elements, so their presence is checked
// at runtime and a plain JSON/text fallback takes over if a future HA
// version renames or removes them — same defensive stance as
// `window.loadCardHelpers` in shared/detail-card.ts.
//
// Mirrors shared/chip-buttons-editor.ts's convention: a pure render function
// the consuming editor mixes into its own panel layout, with UI-only state
// (here, whether the add-card picker is open) owned by the caller's
// @state field rather than by this module.

// hui-card-picker only reads `.views` (to compute which entities are
// already used, for its stub-config generator) — an empty view list is a
// valid, harmless input, not a placeholder that needs real data.
const EMPTY_LOVELACE_CONFIG = { views: [] };

export interface GroupCardsListEditorParams {
  hass?: HomeAssistant;
  cards: LovelaceCardConfig[];
  showPicker: boolean;
  onCardsChange: (cards: LovelaceCardConfig[]) => void;
  onShowPickerChange: (show: boolean) => void;
  itemLabel: (card: LovelaceCardConfig, index: number) => string;
  addLabel: string;
  removeLabel: string;
  moveUpLabel: string;
  moveDownLabel: string;
  emptyLabel: string;
  noVisualEditorLabel: string;
  addOtherHint: string;
}

export function renderGroupCardsListEditor(params: GroupCardsListEditorParams): TemplateResult {
  const {
    hass,
    cards,
    showPicker,
    onCardsChange,
    onShowPickerChange,
    itemLabel,
    addLabel,
    removeLabel,
    moveUpLabel,
    moveDownLabel,
    emptyLabel,
    noVisualEditorLabel,
    addOtherHint,
  } = params;

  const cardChanged = (index: number, config: LovelaceCardConfig): void => {
    const next = [...cards];
    next[index] = config;
    onCardsChange(next);
  };

  const move = (index: number, dir: -1 | 1): void => {
    const target = index + dir;
    if (target < 0 || target >= cards.length) return;
    const next = [...cards];
    [next[index], next[target]] = [next[target], next[index]];
    onCardsChange(next);
  };

  const remove = (index: number): void => {
    onCardsChange(cards.filter((_, i) => i !== index));
  };

  const addCard = (config: LovelaceCardConfig): void => {
    onShowPickerChange(false);
    onCardsChange([...cards, config]);
  };

  const renderRow = (card: LovelaceCardConfig, index: number): TemplateResult => {
    const hasElementEditor = !!customElements.get("hui-card-element-editor");
    return html`
      <ha-expansion-panel outlined .header=${itemLabel(card, index)}>
        <ha-icon slot="leading-icon" icon="mdi:card-outline"></ha-icon>
        <div class="panel-content">
          ${hasElementEditor
            ? html`
                <hui-card-element-editor
                  .hass=${hass}
                  .value=${card}
                  @config-changed=${(ev: CustomEvent) => {
                    ev.stopPropagation();
                    cardChanged(index, ev.detail.config as LovelaceCardConfig);
                  }}
                ></hui-card-element-editor>
              `
            : html`
                <div class="hint warn">${noVisualEditorLabel}</div>
                <textarea
                  class="json-editor"
                  .value=${JSON.stringify(card, null, 2)}
                  @change=${(ev: Event) => {
                    try {
                      const parsed = JSON.parse((ev.target as HTMLTextAreaElement).value) as LovelaceCardConfig;
                      cardChanged(index, parsed);
                    } catch {
                      // Invalid JSON — leave the stored config untouched until it parses.
                    }
                  }}
                ></textarea>
              `}
          <div class="group-row-actions">
            <ha-icon-button .disabled=${index === 0} .label=${moveUpLabel} @click=${() => move(index, -1)}>
              <ha-icon icon="mdi:arrow-up"></ha-icon>
            </ha-icon-button>
            <ha-icon-button
              .disabled=${index === cards.length - 1}
              .label=${moveDownLabel}
              @click=${() => move(index, 1)}
            >
              <ha-icon icon="mdi:arrow-down"></ha-icon>
            </ha-icon-button>
            <ha-button class="remove" @click=${() => remove(index)}>${removeLabel}</ha-button>
          </div>
        </div>
      </ha-expansion-panel>
    `;
  };

  const renderPicker = (): TemplateResult => {
    if (!customElements.get("hui-card-picker")) {
      return html`
        <div class="picker-fallback">
          <div class="hint">${addOtherHint}</div>
          <input
            type="text"
            placeholder="custom:m3-chip-buttons-card"
            @keydown=${(ev: KeyboardEvent) => {
              if (ev.key !== "Enter") return;
              const value = (ev.target as HTMLInputElement).value.trim();
              if (value) addCard({ type: value });
            }}
          />
        </div>
      `;
    }
    return html`
      <hui-card-picker
        .hass=${hass}
        .lovelace=${EMPTY_LOVELACE_CONFIG}
        @config-changed=${(ev: CustomEvent) => {
          ev.stopPropagation();
          addCard(ev.detail.config as LovelaceCardConfig);
        }}
      ></hui-card-picker>
    `;
  };

  return html`
    <div class="group-cards-list">
      ${cards.length === 0 ? html`<div class="hint">${emptyLabel}</div>` : nothing}
      ${cards.map(renderRow)}
      ${showPicker
        ? renderPicker()
        : html`<ha-button raised @click=${() => onShowPickerChange(true)}>${addLabel}</ha-button>`}
    </div>
  `;
}

export const groupCardsListStyles = css`
  .group-cards-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .group-row-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 8px;
  }

  .group-row-actions .remove {
    margin-left: auto;
    --mdc-theme-primary: var(--error-color, #e57368);
  }

  .json-editor {
    width: 100%;
    min-height: 120px;
    box-sizing: border-box;
    font-family: monospace;
    font-size: 12px;
    padding: 8px;
    border-radius: 8px;
    border: 1px solid rgba(127, 127, 127, 0.4);
    background: transparent;
    color: var(--primary-text-color);
  }

  hui-card-picker {
    max-height: 480px;
  }

  .picker-fallback {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .picker-fallback input {
    width: 100%;
    box-sizing: border-box;
    height: 40px;
    padding: 0 12px;
    border-radius: 8px;
    border: 1px solid rgba(127, 127, 127, 0.4);
    background: transparent;
    color: var(--primary-text-color);
    font-size: 14px;
    font-family: inherit;
  }
`;
