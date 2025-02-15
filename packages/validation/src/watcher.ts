import {
  $mobx,
  action,
  computed,
  isBoxedObservable,
  isObservableArray,
  isObservableMap,
  isObservableObject,
  isObservableSet,
  makeObservable,
  observable,
  reaction,
  runInAction,
} from "mobx";
import { createPropertyLikeAnnotation, getAnnotationProcessor } from "./annotationProcessor";
import type { ObservableObjectAdministration } from "mobx/dist/internal";

enum WatchMode {
  /**
   * Watch only reassignments
   *
   * Akin to `@observable.ref`.
   */
  Ref,
  /**
   * Watch shallow changes
   *
   * Akin to `@observable.shallow`?
   */
  Shallow,
  /**
   * Watch nested objects
   *
   * Akin to `@observable.deep`?
   */
  Nested,
}

const watchKey = Symbol("watch");
const unwatchKey = Symbol("unwatch");

const createWatch = createPropertyLikeAnnotation(watchKey, () => WatchMode.Shallow);
const createWatchRef = createPropertyLikeAnnotation(watchKey, () => WatchMode.Ref);
const createWatchNested = createPropertyLikeAnnotation(watchKey, () => WatchMode.Nested);

/**
 * Annotation for watching changes to a property and a getter
 *
 * `@observable` and `@computed` (and their variants) are automatically assumed to be `@watched`,\
 * unless `@unwatch` or `@unwatch.ref` or `@unwatch.nested` is specified.
 */
export const watch = Object.freeze(
  Object.assign(createWatch, {
    /**
     * Annotation for watching only assignments to a property and a getter
     */
    ref: createWatchRef,
    /**
     * Annotation for watching nested objects
     */
    nested: createWatchNested,
  })
);

/**
 * Annotation for unwatching changes to a property and a getter
 *
 * Combine with `@observable` or `@computed` to stop watching changes.
 */
export const unwatch = createPropertyLikeAnnotation(unwatchKey, () => true);

const watcherKey = Symbol("watcher");
const internalToken = Symbol("watcher.internal");

/** Watcher for changes to a target object */
export class Watcher {
  readonly #assumeChanged = observable.box(false);
  readonly #changedTick = observable.box(0n);
  readonly #changedKeys = observable.set<string>();
  readonly #processedKeys = new Set<string>();
  readonly #nested = new Map<
    string,
    () => Array<{
      value: any;
      subKey?: string | symbol | number;
      watcher: Watcher | null;
    }>
  >();

  /**
   * Get a watcher for a target object
   *
   * @throws TypeError when the target is not an object.
   */
  static get<T extends object>(target: T): Watcher {
    const watcher = this.getSafe(target);
    if (!watcher) throw new TypeError("target: Expected an object");
    return watcher;
  }

  /**
   * Get a watcher for a target object
   *
   * Same as {@link Watcher.get} but returns null instead of throwing an error.
   */
  static getSafe(target: any): Watcher | null {
    if (!target || typeof target !== "object") {
      return null;
    }

    let watcher: Watcher | null = (target as any)[watcherKey] ?? null;
    if (!watcher) {
      watcher = new this(internalToken, target);
      Object.defineProperty(target, watcherKey, { value: watcher });
    }
    return watcher;
  }

  private constructor(token: symbol, target: object) {
    if (token !== internalToken) {
      throw new Error("private constructor");
    }

    this.#processUnwatchAnnotations(target);
    this.#processWatchAnnotations(target);
    this.#processMobxAnnotations(target);

    makeObservable(this);
  }

  /**
   * The total number of changes have been processed
   *
   * The value is incremented for each change and each key.
   * Observe this value to react to changes.
   */
  @computed
  get changedTick() {
    return this.#changedTick.get();
  }

  /** Whether changes have been made */
  @computed
  get changed() {
    return this.changedTick > 0n || this.#assumeChanged.get();
  }

  /** The keys that have changed */
  @computed.struct
  get changedKeys(): ReadonlySet<string> {
    return new Set(this.#changedKeys);
  }

  /** The key paths that have changed, including nested objects */
  @computed.struct
  get changedKeyPaths(): ReadonlySet<string> {
    const result = new Set(this.#changedKeys);
    for (const [key, fn] of this.#nested) {
      for (const { subKey, watcher } of fn()) {
        if (watcher) {
          for (const changedKey of watcher.changedKeyPaths) {
            if (typeof subKey === "string" || typeof subKey === "number") {
              result.add(`${key}`);
              result.add(`${key}.${subKey}`);
              result.add(`${key}.${subKey}.${changedKey}`);
            } else {
              result.add(`${key}`);
              result.add(`${key}.${changedKey}`);
            }
          }
        }
      }
    }
    return result;
  }

  /** The nested objects being watched */
  @computed.struct
  get nested() {
    const result = new Map<string, { value: any; watcher: Watcher | null }>();
    for (const [key, fn] of this.#nested) {
      for (const { subKey, value, watcher } of fn()) {
        if (typeof subKey === "string" || typeof subKey === "number") {
          result.set(`${key}.${subKey}`, { value, watcher });
        } else {
          result.set(key, { value, watcher });
        }
      }
    }
    return result;
  }

  /** Reset the changed keys */
  @action
  reset() {
    this.#changedKeys.clear();
    this.#changedTick.set(0n);
    this.#assumeChanged.set(false);

    for (const fn of this.#nested.values()) {
      for (const { watcher } of fn()) {
        watcher?.reset();
      }
    }
  }

  /**
   * Assume some changes have been made
   *
   * It only changes {@link changed} to true and does not increment {@link changedTick}.
   */
  @action
  assumeChanged() {
    this.#assumeChanged.set(true);
  }

  /** Mark a key as changed */
  #didChange(key: string) {
    runInAction(() => {
      this.#changedKeys.add(key);
      this.#changedTick.set(this.#changedTick.get() + 1n);
    });
  }

  /** Shallow read the value to be included in reactions */
  #shallowRead(value: any) {
    if (isBoxedObservable(value)) {
      value = value.get();
    }

    if (isObservableArray(value)) {
      return value.slice();
    }
    if (isObservableSet(value)) {
      return new Set(value.values());
    }
    if (isObservableMap(value)) {
      return new Map(value.entries());
    }

    return value;
  }

  /** Process nested observables */
  #processNested<R>(value: any, map: (value: any, key?: string | symbol | number) => R) {
    if (isBoxedObservable(value)) {
      value = value.get();
    }

    if (Array.isArray(value) || isObservableArray(value)) {
      return value.map((element, i) => map(element, i));
    }
    if (value instanceof Set || isObservableSet(value)) {
      return Array.from(value.values(), (element, i) => map(element, i));
    }
    if (value instanceof Map || isObservableMap(value)) {
      return Array.from(value.entries(), ([key, value]) => map(value, key));
    }
    if (typeof value === "object" && value) {
      return [map(value)];
    }

    return [];
  }

  /**
   * Process MobX's `@observable` and `@computed` annotations
   *
   * Also includes their variants such as `@observable.ref` and `@computed.struct`.
   *
   * It relies on the internal API, so it may break in future versions of MobX.\
   * When making changes, please ensure that the internal API is still available by
   * asserting the types at both compile-time and runtime.
   */
  #processMobxAnnotations(target: object) {
    if (!isObservableObject(target)) return;
    const adm = (target as any)[$mobx] as ObservableObjectAdministration;
    // Compile-time assertion
    adm satisfies object;
    adm?.values_ satisfies Map<string | symbol | number, { get: () => any }>;

    // Runtime assertion
    if (typeof adm !== "object" || !adm) return;
    if (!("values_" in adm)) return;
    const values = adm.values_;
    if (!(values instanceof Map)) return;

    for (const [key, value] of values) {
      // Runtime assertion
      if (typeof key !== "string") continue;
      if (typeof value !== "object" || !value) continue;
      if (!("get" in value && typeof value.get === "function")) continue;

      if (this.#processedKeys.has(key)) continue;
      this.#processedKeys.add(key);

      const getValue = () => (key in target ? (target as any)[key] : value.get());

      reaction(
        () => this.#shallowRead(getValue()),
        () => this.#didChange(key)
      );
    }
  }

  /**
   * Process `@watch`, `@watch.ref`, and `@watch.nested` annotations
   */
  #processWatchAnnotations(target: object) {
    const processor = getAnnotationProcessor(target);
    if (!processor) return;

    const watchAnnotations = processor.getPropertyLike(watchKey);
    if (watchAnnotations) {
      for (const [key, metadata] of watchAnnotations) {
        if (typeof key !== "string") continue;
        if (this.#processedKeys.has(key)) continue;
        this.#processedKeys.add(key);

        const isNested = metadata.data.includes(WatchMode.Nested);
        const isShallow = isNested || metadata.data.includes(WatchMode.Shallow); // false if one and only @watch.ref is specified
        const getValue = () => (key in target ? (target as any)[key] : metadata.get?.());

        reaction(
          () => (isShallow ? this.#shallowRead(getValue()) : getValue()),
          () => this.#didChange(key)
        );

        if (isNested) {
          reaction(
            () => this.#processNested(getValue(), (v) => Watcher.getSafe(v)?.changed ?? false).some(Boolean),
            (changed) => changed && this.#didChange(key)
          );
          this.#nested.set(key, () =>
            this.#processNested(getValue(), (v, k) => ({
              value: v,
              subKey: k,
              watcher: Watcher.getSafe(v),
            }))
          );
        }
      }
    }
  }

  /**
   * Process `@unwatch` annotations
   */
  #processUnwatchAnnotations(target: object) {
    const processor = getAnnotationProcessor(target);
    if (!processor) return;

    const unwatchAnnotations = processor.getPropertyLike(unwatchKey);
    if (unwatchAnnotations) {
      for (const [key] of unwatchAnnotations) {
        if (typeof key !== "string") continue;
        this.#processedKeys.add(key);
      }
    }
  }

  /**
   * Get the internal properties of the watcher.
   *
   * For internal testing purposes only.
   *
   * @internal
   * @ignore
   */
  [internalToken]() {
    return {
      didChange: this.#didChange.bind(this),
    };
  }
}

/** @internal */
export function getInternal(watcher: Watcher) {
  return watcher[internalToken]();
}
