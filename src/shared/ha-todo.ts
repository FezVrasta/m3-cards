import type { HomeAssistant } from "../types";

// Home Assistant exposes a todo list's entries only through the
// `todo.get_items` service response, never as entity attributes — the entity
// state is just the number of open items. Service responses are not reachable
// via hass.callService, so the call goes through `execute_script`, whose
// `stop` step hands the response variable back to the caller.

export type TodoStatus = "needs_action" | "completed";

export interface TodoItem {
  uid: string;
  summary: string;
  status: TodoStatus;
  description?: string;
  due?: string;
}

// Bit flags from homeassistant/components/todo/const.py.
export const TODO_FEATURE = {
  create: 1,
  delete: 2,
  update: 4,
  move: 8,
  dueDate: 16,
  dueDatetime: 32,
  description: 64,
} as const;

export function todoSupports(
  hass: HomeAssistant | undefined,
  entityId: string,
  feature: number,
): boolean {
  const bits = hass?.states[entityId]?.attributes?.supported_features;
  return typeof bits === "number" && (bits & feature) !== 0;
}

export async function fetchTodoItems(
  hass: HomeAssistant,
  entityId: string,
  status?: TodoStatus[],
): Promise<TodoItem[]> {
  const data: Record<string, unknown> = {};
  if (status?.length) data.status = status;
  const result = await hass.callWS<Record<string, unknown>>({
    type: "execute_script",
    sequence: [
      {
        action: "todo.get_items",
        target: { entity_id: entityId },
        ...(status?.length ? { data } : {}),
        response_variable: "m3_todo",
      },
      { stop: "", response_variable: "m3_todo" },
    ],
  });
  // execute_script wraps the stopped value in `response`; older cores returned
  // it bare, so accept both rather than depending on the core version.
  const payload = ((result as { response?: unknown }).response ?? result) as Record<
    string,
    { items?: TodoItem[] }
  >;
  return payload?.[entityId]?.items ?? [];
}
