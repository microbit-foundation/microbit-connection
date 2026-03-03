type Listener<T> = (data: T) => void;

export class TypedEventTarget<M> {
  private listeners = new Map<keyof M, Set<Listener<any>>>();

  addEventListener<K extends keyof M & string>(
    type: K,
    listener: Listener<M[K]>,
  ): void {
    let set = this.listeners.get(type);
    const wasEmpty = !set || set.size === 0;
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    if (!set.has(listener)) {
      set.add(listener);
      if (wasEmpty) this.eventActivated(type);
    }
  }

  removeEventListener<K extends keyof M & string>(
    type: K,
    listener: Listener<M[K]>,
  ): void {
    const set = this.listeners.get(type);
    if (set?.delete(listener) && set.size === 0) {
      this.listeners.delete(type);
      this.eventDeactivated(type);
    }
  }

  protected dispatchEvent<K extends keyof M & string>(
    type: K,
    ...[data]: M[K] extends void ? [] : [data: M[K]]
  ): void {
    const set = this.listeners.get(type);
    if (set) {
      for (const listener of set) {
        listener(data as M[K]);
      }
    }
  }

  protected eventActivated(_type: string): void {}
  protected eventDeactivated(_type: string): void {}
  protected getActiveEvents(): string[] {
    return [...this.listeners.keys()] as string[];
  }
}
