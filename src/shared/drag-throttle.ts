// Throttles a fast-firing continuous value (drag / pointer-move) down to at
// most one service call per `ms`, always flushing the final value.
//
// Every wavy slider in the suite needs the same behaviour: call the service at
// most every N ms while the finger is down, but never miss the value the user
// released on. Written for the light card's three sliders; moved here when the
// humidifier card became the second user, rather than copied.

export class DragThrottle<T> {
  private timer?: number;
  private pending?: T;
  private lastCallTs = 0;

  constructor(
    private readonly fn: (value: T) => void,
    private readonly ms: number,
  ) {}

  call(value: T): void {
    this.pending = value;
    const elapsed = performance.now() - this.lastCallTs;
    if (elapsed >= this.ms) {
      this.flush(value);
    } else if (this.timer === undefined) {
      this.timer = window.setTimeout(() => {
        this.timer = undefined;
        if (this.pending !== undefined) this.flush(this.pending);
      }, this.ms - elapsed);
    }
  }

  flush(value: T): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.pending = undefined;
    this.lastCallTs = performance.now();
    this.fn(value);
  }

  clear(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
}
