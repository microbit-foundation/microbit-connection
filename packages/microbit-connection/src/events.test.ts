import { describe, expect, it, vi } from "vitest";
import { TrackingEventTarget } from "./events.js";

class TestTrackingEventTarget extends TrackingEventTarget {
  constructor(
    private activate: (type: string) => void,
    private deactivate: (type: string) => void,
  ) {
    super();
  }
  public getActiveEvents(): string[] {
    return super.getActiveEvents();
  }
  protected eventActivated(type: string): void {
    this.activate(type);
  }
  protected eventDeactivated(type: string): void {
    this.deactivate(type);
  }
}

describe("TrackingEventTarget", () => {
  const listener = () => {};

  it("add remove", () => {
    const activate = vi.fn();
    const deactivate = vi.fn();
    const target = new TestTrackingEventTarget(activate, deactivate);
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

  it("callback equality", () => {
    const listenerAlt = () => {};

    const activate = vi.fn();
    const deactivate = vi.fn();
    const target = new TestTrackingEventTarget(activate, deactivate);
    expect(target.getActiveEvents()).toEqual([]);

    target.addEventListener("foo", listenerAlt);
    target.addEventListener("foo", listener);
    target.addEventListener("foo", listener);
    target.removeEventListener("foo", listener);
    expect(target.getActiveEvents()).toEqual(["foo"]);
    target.removeEventListener("foo", listenerAlt);
    expect(target.getActiveEvents()).toEqual([]);
  });

  it("option equality - capture", () => {
    const fooListener = vi.fn();
    const activate = vi.fn();
    const deactivate = vi.fn();
    const target = new TestTrackingEventTarget(activate, deactivate);
    expect(target.getActiveEvents()).toEqual([]);

    target.addEventListener("foo", fooListener, { capture: true });
    target.addEventListener("foo", fooListener, false);
    target.removeEventListener("foo", fooListener, true);
    expect(target.getActiveEvents()).toEqual(["foo"]);
    target.dispatchEvent(new Event("foo"));
    expect(fooListener).toBeCalledTimes(1);
  });

  it("option equality", () => {
    const fooListener = vi.fn();
    const activate = vi.fn();
    const deactivate = vi.fn();
    const target = new TestTrackingEventTarget(activate, deactivate);

    // Despite MDN docs claiming all options can result in another listener added
    // it seems only capture counts for both add and remove
    target.addEventListener("foo", fooListener, { passive: true });
    target.addEventListener("foo", fooListener, { once: true });
    target.addEventListener("foo", fooListener, { capture: true });
    target.addEventListener("foo", fooListener, { capture: false });
    target.dispatchEvent(new Event("foo"));
    expect(fooListener).toBeCalledTimes(2);

    target.removeEventListener("foo", fooListener, true);
    expect(target.getActiveEvents()).toEqual(["foo"]);
    target.dispatchEvent(new Event("foo"));
    expect(fooListener).toBeCalledTimes(3);

    target.removeEventListener("foo", fooListener, false);
    expect(target.getActiveEvents()).toEqual([]);
    target.dispatchEvent(new Event("foo"));
    expect(fooListener).toBeCalledTimes(3);
  });

  it("once", () => {
    const fooListener = vi.fn();
    const activate = vi.fn();
    const deactivate = vi.fn();
    const target = new TestTrackingEventTarget(activate, deactivate);

    target.addEventListener("foo", fooListener, { once: true });
    target.dispatchEvent(new Event("foo"));
    expect(fooListener).toBeCalledTimes(1);
    expect(deactivate).toBeCalledTimes(1);

    target.dispatchEvent(new Event("foo"));
    expect(fooListener).toBeCalledTimes(1);
  });
});
