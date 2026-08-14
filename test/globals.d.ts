/*
 * The one global that needs declaring by hand.
 *
 * Content scripts of one extension share a single isolated world, which is how
 * modes.js, boot.js and hn.js see each other with no module system. `HN` and
 * `CommentTracker` are plain top-level `var`s, so the checker infers them from
 * their own source. `HNESModes` is assigned onto `globalThis` from inside an
 * IIFE, which is deliberate — it is the only thing modes.js exports — and that
 * is invisible to inference.
 *
 * Writing it out is not duplication for its own sake: `declare var` adds the
 * property to globalThis, so modes.js's own assignment is checked against this,
 * and the two cannot drift without the checker saying so.
 */

// jquery-linkify, vendored under js/. It patches the jQuery prototype at load
// time, which @types/jquery has no way to know about.
interface JQuery<TElement = HTMLElement> {
  linkify(options?: Record<string, any>): JQuery<TElement>;
}

interface HNESModeValue {
  id: string;
  label?: string;
  hint?: string;
  /** `multi` only: sections carry the page they link to. */
  href?: string;
}

interface HNESModeSpec {
  key: string;
  /** Present on a spec that paints: boot.js writes it onto <html> before first
   *  paint. Absent on one that hn.js reads and acts on. */
  attr?: string;
  /** The panel heading. Consecutive specs sharing one share a group. */
  label: string;
  ui: 'list' | 'swatch' | 'toggle' | 'multi';
  /** values[0] is the unset state, and for a toggle the shipped default. */
  values: HNESModeValue[];
  /** `toggle` only: the row's own name, since the heading is the group's. */
  name?: string;
  hint?: string;
  /** `toggle` only: key bindings listed under the switch. */
  help?: { id: string; label: string }[];
  /** `multi` only: the default set, comma-joined. Empty is a real answer. */
  dflt?: string;
}

type HNESStoredValues = Record<string, any>;

interface HNESModesApi {
  list: HNESModeSpec[];
  sections: HNESModeValue[];
  keys(): string[];
  spec(key: string): HNESModeSpec | null;
  indexOf(spec: HNESModeSpec, value: unknown): number;
  current(spec: HNESModeSpec): string;
  selected(spec: HNESModeSpec): string[];
  on(key: string): boolean;
  apply(root: HTMLElement, spec: HNESModeSpec, value: unknown): void;
  applyAll(root: HTMLElement, items: HNESStoredValues): void;
  commit(spec: HNESModeSpec, value: string): void;
  load(callback?: (values: HNESStoredValues) => void): void;
  ready(callback: (values: HNESStoredValues) => void): void;
  watch(root: HTMLElement): void;
  subscribe(callback: (touched: HNESModeSpec[]) => void): void;
}

declare var HNESModes: HNESModesApi;
