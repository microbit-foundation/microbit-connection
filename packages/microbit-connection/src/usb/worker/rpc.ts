/**
 * (c) 2026, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 *
 * Symmetric request/response RPC over a postMessage channel, with
 * progress streaming and abort forwarding. Used on both sides of the
 * worker boundary.
 */
import { ProgressStage } from "../../device.js";
import {
  RpcRequest,
  RpcResponse,
  SerializedError,
  deserializeError,
  serializeError,
} from "./protocol.js";

/**
 * The subset of Worker / DedicatedWorkerGlobalScope / MessagePort the
 * endpoint needs. `start` matters for MessagePorts, which queue messages
 * until started when addEventListener is used.
 */
export interface MessagePortLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(
    type: "message",
    listener: (event: { data: unknown }) => void,
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: { data: unknown }) => void,
  ): void;
  start?(): void;
}

/**
 * Wrap a handler result to request the listed values be transferred
 * rather than cloned in the response message.
 */
export class RpcTransfer {
  constructor(
    public readonly value: unknown,
    public readonly transfer: Transferable[],
  ) {}
}

export interface RpcCallOptions {
  transfer?: Transferable[];
  onProgress?: (stage: ProgressStage, value?: number) => void;
  signal?: AbortSignal;
}

export interface RpcServeContext {
  progress: (stage: ProgressStage, value?: number) => void;
  signal: AbortSignal;
}

export type RpcHandler = (
  args: unknown[],
  context: RpcServeContext,
) => Promise<unknown>;

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  onProgress?: (stage: ProgressStage, value?: number) => void;
}

export class RpcEndpoint {
  private nextId = 1;
  private pending = new Map<number, PendingCall>();
  private served = new Map<number, AbortController>();
  private handlers: Record<string, RpcHandler> = {};
  private otherHandler: ((message: unknown) => void) | undefined;
  private failure: Error | undefined;

  private messageListener = (event: { data: unknown }) => {
    void this.handleMessage(event.data);
  };

  constructor(private port: MessagePortLike) {
    port.addEventListener("message", this.messageListener);
    port.start?.();
  }

  call<T>(
    method: string,
    args: unknown[],
    options: RpcCallOptions = {},
  ): Promise<T> {
    if (this.failure) {
      return Promise.reject(this.failure);
    }
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        onProgress: options.onProgress,
      });
      options.signal?.addEventListener(
        "abort",
        () => this.post({ kind: "abort", id }),
        { once: true },
      );
      const request: RpcRequest = { kind: "req", id, method, args };
      this.port.postMessage(request, options.transfer);
    });
  }

  /** Fire-and-forget message (non-RPC kinds). */
  post(message: unknown, transfer?: Transferable[]): void {
    if (this.failure) {
      return;
    }
    this.port.postMessage(message, transfer);
  }

  serve(handlers: Record<string, RpcHandler>): void {
    Object.assign(this.handlers, handlers);
  }

  /** Handler for message kinds the RPC layer doesn't own. */
  onOther(handler: (message: unknown) => void): void {
    this.otherHandler = handler;
  }

  /**
   * Mark the channel dead: rejects all in-flight calls and makes future
   * calls fail immediately.
   */
  fail(error: Error): void {
    this.failure = error;
    const pending = [...this.pending.values()];
    this.pending.clear();
    pending.forEach((call) => call.reject(error));
  }

  dispose(): void {
    this.port.removeEventListener("message", this.messageListener);
  }

  private async handleMessage(data: unknown): Promise<void> {
    if (!data || typeof data !== "object" || !("kind" in data)) {
      return;
    }
    const message = data as { kind: string } & Record<string, unknown>;
    switch (message.kind) {
      case "req": {
        await this.handleRequest(message as unknown as RpcRequest);
        break;
      }
      case "res": {
        const response = message as unknown as RpcResponse;
        const call = this.pending.get(response.id);
        if (call) {
          this.pending.delete(response.id);
          if (response.ok) {
            call.resolve(response.result);
          } else {
            call.reject(deserializeError(response.error));
          }
        }
        break;
      }
      case "progress": {
        const { id, stage, value } = message as unknown as {
          id: number;
          stage: ProgressStage;
          value?: number;
        };
        this.pending.get(id)?.onProgress?.(stage, value);
        break;
      }
      case "abort": {
        this.served.get((message as unknown as { id: number }).id)?.abort();
        break;
      }
      default:
        this.otherHandler?.(message);
    }
  }

  private async handleRequest(request: RpcRequest): Promise<void> {
    const handler = this.handlers[request.method];
    const respondError = (error: SerializedError) =>
      this.port.postMessage({
        kind: "res",
        id: request.id,
        ok: false,
        error,
      } satisfies RpcResponse);
    if (!handler) {
      respondError(
        serializeError(new Error(`Unknown RPC method: ${request.method}`)),
      );
      return;
    }
    const abort = new AbortController();
    this.served.set(request.id, abort);
    try {
      const result = await handler(request.args, {
        progress: (stage, value) =>
          this.post({ kind: "progress", id: request.id, stage, value }),
        signal: abort.signal,
      });
      if (result instanceof RpcTransfer) {
        this.port.postMessage(
          {
            kind: "res",
            id: request.id,
            ok: true,
            result: result.value,
          } satisfies RpcResponse,
          result.transfer,
        );
      } else {
        this.port.postMessage({
          kind: "res",
          id: request.id,
          ok: true,
          result,
        } satisfies RpcResponse);
      }
    } catch (e) {
      respondError(serializeError(e));
    } finally {
      this.served.delete(request.id);
    }
  }
}
