import { describe, expect, it, vi } from "vitest";
import { TypedEventTarget } from "./events.js";

interface TestEventMap {
  foo: { value: number };
  bar: void;
}

class TestTypedEventTarget extends TypedEventTarget<TestEventMap> {
  constructor(
    private activate: (type: string) => void,
    private deactivate: (type: string) => void,
  ) {
    super();
  }
  public getActiveEvents(): string[] {
    return super.getActiveEvents();
  }
  public dispatchEvent<K extends keyof TestEventMap & string>(
    type: K,
    ...[data]: TestEventMap[K] extends void ? [] : [data: TestEventMap[K]]
  ): void {
    super.dispatchEvent(type, ...([data] as any));
  }
  protected eventActivated(type: string): void {
    this.activate(type);
  }
  protected eventDeactivated(type: string): void {
    this.deactivate(type);
  }
}

describe("TypedEventTarget", () => {
  const listener = (_data: { value: number }) => {};

  it("add remove", () => {
    const activate = vi.fn();
    const deactivate = vi.fn();
    const target = new TestTypedEventTarget(activate, deactivate);
    expect(target.getActiveEvents()).toEqual([]);

    target.addEventListener("foo", listener);
    expect(activate).toBeCalledTimes(1);
    expect(deactivate).toBeCalledTimes(0);
    expect(target.getActiveEvents()).toEqual(["foo"]);

    target.removeEventListener("foo", listener);
    expect(activate).toBeCalledTimes(1);
    expect(deactivate).toBeCalledTimes(1);
    expect(target.getActiveEvents()).toEqual([]);
  });

  it("identity-based dedup", () => {
    const listenerAlt = (_data: { value: number }) => {};

    const activate = vi.fn();
    const deactivate = vi.fn();
    const target = new TestTypedEventTarget(activate, deactivate);

    target.addEventListener("foo", listenerAlt);
    target.addEventListener("foo", listener);
    target.addEventListener("foo", listener); // duplicate, ignored
    expect(activate).toBeCalledTimes(1); // only called once for "foo"

    target.removeEventListener("foo", listener);
    expect(target.getActiveEvents()).toEqual(["foo"]);
    target.removeEventListener("foo", listenerAlt);
    expect(target.getActiveEvents()).toEqual([]);
  });

  it("remove during dispatch", () => {
    const activate = vi.fn();
    const deactivate = vi.fn();
    const target = new TestTypedEventTarget(activate, deactivate);
    const calls: number[] = [];

    const selfRemovingListener = (_data: { value: number }) => {
      calls.push(1);
      target.removeEventListener("foo", selfRemovingListener);
    };
    const secondListener = (_data: { value: number }) => {
      calls.push(2);
    };

    target.addEventListener("foo", selfRemovingListener);
    target.addEventListener("foo", secondListener);
    target.dispatchEvent("foo", { value: 42 });

    // Both should have been called (Set iteration guarantees this)
    expect(calls).toEqual([1, 2]);
    // selfRemovingListener should be removed now
    expect(target.getActiveEvents()).toEqual(["foo"]);
  });

  it("getActiveEvents", () => {
    const target = new TestTypedEventTarget(vi.fn(), vi.fn());
    const fooListener = () => {};
    const barListener = () => {};

    target.addEventListener("foo", fooListener);
    target.addEventListener("bar", barListener);
    expect(target.getActiveEvents().sort()).toEqual(["bar", "foo"]);

    target.removeEventListener("foo", fooListener);
    expect(target.getActiveEvents()).toEqual(["bar"]);
  });

  it("void events dispatch without argument", () => {
    const target = new TestTypedEventTarget(vi.fn(), vi.fn());
    const barListener = vi.fn();

    target.addEventListener("bar", barListener);
    target.dispatchEvent("bar");
    expect(barListener).toBeCalledTimes(1);
  });

  it("dispatches correct data to listeners", () => {
    const target = new TestTypedEventTarget(vi.fn(), vi.fn());
    const fooListener = vi.fn();

    target.addEventListener("foo", fooListener);
    target.dispatchEvent("foo", { value: 99 });
    expect(fooListener).toBeCalledWith({ value: 99 });
  });

  it("removing non-existent listener is a no-op", () => {
    const deactivate = vi.fn();
    const target = new TestTypedEventTarget(vi.fn(), deactivate);
    target.removeEventListener("foo", listener);
    expect(deactivate).not.toBeCalled();
  });
});
