/**
 * Copyright (c) 2022 Jonas "DerZade" Schade
 *
 * SPDX-License-Identifier: MIT
 *
 * https://github.com/DerZade/typescript-event-target/blob/master/src/TypedEventTarget.ts
 */

/**
 * A function that can be passed to the `listener` parameter of {@link TypedEventTarget.addEventListener} and {@link TypedEventTarget.removeEventListener}.
 *
 * @template M A map of event types to their respective event classes.
 * @template T The type of event to listen for (has to be keyof `M`).
 */
export type TypedEventListener<M, T extends keyof M> = (
  evt: M[T],
) => void | Promise<void>;

/**
 * An object that can be passed to the `listener` parameter of {@link TypedEventTarget.addEventListener} and {@link TypedEventTarget.removeEventListener}.
 *
 * @template M A map of event types to their respective event classes.
 * @template T The type of event to listen for (has to be keyof `M`).
 */
export interface TypedEventListenerObject<M, T extends keyof M> {
  handleEvent: (evt: M[T]) => void | Promise<void>;
}

/**
 * Type of parameter `listener` in {@link TypedEventTarget.addEventListener} and {@link TypedEventTarget.removeEventListener}.
 *
 * The object that receives a notification (an object that implements the Event interface) when an event of the specified type occurs.
 *
 * Can be either an object with a handleEvent() method, or a JavaScript function.
 *
 * @template M A map of event types to their respective event classes.
 * @template T The type of event to listen for (has to be keyof `M`).
 */
export type TypedEventListenerOrEventListenerObject<M, T extends keyof M> =
  | TypedEventListener<M, T>
  | TypedEventListenerObject<M, T>;

type ValueIsEvent<T> = {
  [key in keyof T]: Event;
};

/**
 * Typescript friendly version of {@link EventTarget}
 *
 * @template M A map of event types to their respective event classes.
 *
 * @example
 * ```typescript
 * interface MyEventMap {
 *     hello: Event;
 *     time: CustomEvent<number>;
 * }
 *
 * const eventTarget = new TypedEventTarget<MyEventMap>();
 *
 * eventTarget.addEventListener('time', (event) => {
 *     // event is of type CustomEvent<number>
 * });
 * ```
 */
export interface TypedEventTarget<M extends ValueIsEvent<M>> {
  /** Appends an event listener for events whose type attribute value is type.
   * The callback argument sets the callback that will be invoked when the event
   * is dispatched.
   *
   * The options argument sets listener-specific options. For compatibility this
   * can be a boolean, in which case the method behaves exactly as if the value
   * was specified as options's capture.
   *
   * When set to true, options's capture prevents callback from being invoked
   * when the event's eventPhase attribute value is BUBBLING_PHASE. When false
   * (or not present), callback will not be invoked when event's eventPhase
   * attribute value is CAPTURING_PHASE. Either way, callback will be invoked if
   * event's eventPhase attribute value is AT_TARGET.
   *
   * When set to true, options's passive indicates that the callback will not
   * cancel the event by invoking preventDefault(). This is used to enable
   * performance optimizations described in § 2.8 Observing event listeners.
   *
   * When set to true, options's once indicates that the callback will only be
   * invoked once after which the event listener will be removed.
   *
   * The event listener is appended to target's event listener list and is not
   * appended if it has the same type, callback, and capture. */
  addEventListener: <T extends keyof M & string>(
    type: T,
    listener: TypedEventListenerOrEventListenerObject<M, T> | null,
    options?: boolean | AddEventListenerOptions,
  ) => void;

  /** Removes the event listener in target's event listener list with the same
   * type, callback, and options. */
  removeEventListener: <T extends keyof M & string>(
    type: T,
    callback: TypedEventListenerOrEventListenerObject<M, T> | null,
    options?: EventListenerOptions | boolean,
  ) => void;

  /**
   * Dispatches a synthetic event event to target and returns true if either
   * event's cancelable attribute value is false or its preventDefault() method
   * was not invoked, and false otherwise.
   * @deprecated To ensure type safety use `dispatchTypedEvent` instead.
   */
  dispatchEvent: (event: Event) => boolean;
}

// We've added this in to keep track of what events are active.
// Having done this it's questionable whether it's worth the reimplementation
// just to use an EventTarget API.
export class TrackingEventTarget extends EventTarget {
  private activeEventTracking: Map<string, Registration[]> = new Map();

  addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean,
  ): void {
    if (callback !== null) {
      const registrations = this.activeEventTracking.get(type) ?? [];
      const wasEmpty = registrations.length === 0;
      const registration = new Registration(callback, options ?? false);
      if (!registrations.find((r) => r.eq(registration))) {
        registrations.push(registration);
        this.activeEventTracking.set(type, registrations);
        if (wasEmpty) {
          this.eventActivated(type);
        }
      }
    }
    super.addEventListener(type, callback, options);
  }

  removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: EventListenerOptions | boolean,
  ): void {
    if (callback !== null) {
      const registration = new Registration(callback, options ?? false);
      this.filterRegistrations(type, (r) => !r.eq(registration));
    }
    super.removeEventListener(type, callback, options);
  }

  dispatchEvent(event: Event): boolean {
    const result = super.dispatchEvent(event);
    this.filterRegistrations(event.type, (r) => !r.isOnce());
    return result;
  }

  private filterRegistrations(
    type: string,
    predicate: (r: Registration) => boolean,
  ): void {
    let registrations = this.activeEventTracking.get(type) ?? [];
    registrations = registrations.filter(predicate);
    if (registrations.length === 0) {
      this.activeEventTracking.delete(type);
      this.eventDeactivated(type);
    } else {
      this.activeEventTracking.set(type, registrations);
    }
  }

  protected eventActivated(type: string) {}

  protected eventDeactivated(type: string) {}

  protected getActiveEvents(): string[] {
    return [...this.activeEventTracking.keys()];
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class TypedEventTarget<
  M extends ValueIsEvent<M>,
> extends TrackingEventTarget {
  /**
   * Dispatches a synthetic event event to target and returns true if either
   * event's cancelable attribute value is false or its preventDefault() method
   * was not invoked, and false otherwise.
   */
  public dispatchTypedEvent<T extends keyof M>(_type: T, event: M[T]): boolean {
    return super.dispatchEvent(event);
  }
}

class Registration {
  constructor(
    private callback: EventListenerOrEventListenerObject,
    private options: AddEventListenerOptions | boolean,
  ) {}

  isOnce() {
    return typeof this.options === "object" && this.options.once === true;
  }

  eq(other: Registration) {
    return (
      other.callback === this.callback &&
      eqUseCapture(this.options, other.options)
    );
  }
}

const eqUseCapture = (
  left: AddEventListenerOptions | boolean,
  right: AddEventListenerOptions | boolean,
) => {
  const leftValue = typeof left === "boolean" ? left : left.capture ?? false;
  const rightValue =
    typeof right === "boolean" ? right : right.capture ?? false;
  return leftValue === rightValue;
};
