// Shared keyboard-activation handler for elements that use role="button"
// instead of a native <button> (rows, header tiles — swapping the element
// type would require a full CSS reset per usage; ARIA role + this handler
// gives the same keyboard/screen-reader behavior with far less risk).
export function activateOnKey(onClick: (e: Event) => void): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick(e);
    }
  };
}
