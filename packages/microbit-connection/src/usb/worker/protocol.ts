/**
 * (c) 2026, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 *
 * Message protocol between the main-thread facade and the worker-hosted
 * USB connection core. All payloads must be structured-cloneable.
 */
import {
  ConnectionStatus,
  DeviceError,
  DeviceErrorCode,
  FlashDataError,
  ProgressStage,
} from "../../device.js";
import { type DeviceSelectionMode } from "../connection.js";
import { type CoreConnectionInfo } from "../connection.js";

/**
 * Bumped on incompatible protocol changes so a stale prebuilt worker
 * bundle fails fast rather than misbehaving.
 */
export const PROTOCOL_VERSION = 1;

// ---------------------------------------------------------------------------
// Error marshalling
// ---------------------------------------------------------------------------

export interface SerializedError {
  errorKind: "DeviceError" | "FlashDataError" | "Error";
  code?: DeviceErrorCode;
  name: string;
  message: string;
  stack?: string;
}

export const serializeError = (e: unknown): SerializedError => {
  if (e instanceof DeviceError) {
    return {
      errorKind: "DeviceError",
      code: e.code,
      name: e.name,
      message: e.message,
      stack: e.stack,
    };
  }
  if (e instanceof FlashDataError) {
    return {
      errorKind: "FlashDataError",
      name: e.name,
      message: e.message,
      stack: e.stack,
    };
  }
  if (e instanceof Error) {
    return {
      errorKind: "Error",
      name: e.name,
      message: e.message,
      stack: e.stack,
    };
  }
  return { errorKind: "Error", name: "Error", message: String(e) };
};

/**
 * Reconstruct a real error instance so consumer `instanceof` checks and
 * `DeviceError.code` matching work identically in worker mode.
 */
export const deserializeError = (s: SerializedError): Error => {
  let error: Error;
  switch (s.errorKind) {
    case "DeviceError":
      error = new DeviceError({
        code: s.code ?? "connection-error",
        message: s.message,
      });
      break;
    case "FlashDataError":
      error = new FlashDataError(s.message);
      break;
    default:
      error = new Error(s.message);
      error.name = s.name;
  }
  if (s.stack) {
    error.stack = s.stack;
  }
  return error;
};

export const toDeviceError = (e: Error): DeviceError =>
  e instanceof DeviceError
    ? e
    : new DeviceError({
        code: "connection-error",
        message: e.message,
        cause: e,
      });

// ---------------------------------------------------------------------------
// RPC envelope (used in both directions; ids are scoped per sender)
// ---------------------------------------------------------------------------

export interface RpcRequest {
  kind: "req";
  id: number;
  method: string;
  args: unknown[];
}

export type RpcResponse =
  | { kind: "res"; id: number; ok: true; result: unknown }
  | { kind: "res"; id: number; ok: false; error: SerializedError };

export interface RpcProgress {
  kind: "progress";
  id: number;
  stage: ProgressStage;
  value?: number;
}

/**
 * Cancels the server-side operation for an in-flight request.
 * Currently unused by the USB flash/connect paths (signals are
 * native-only today) but part of the protocol for compatibility.
 */
export interface RpcAbort {
  kind: "abort";
  id: number;
}

// ---------------------------------------------------------------------------
// Fire-and-forget control messages (main -> worker)
// ---------------------------------------------------------------------------

/**
 * The events with lazy side effects in the core (serial polling and the
 * Jacdac pump start when the first listener appears). The host attaches
 * or removes its forwarding listener on the core so this behaviour is
 * driven by the facade's real listener counts.
 */
export type SubscribableEvent = "serialdata" | "jacdacframe";

export interface SubscribeMessage {
  kind: "subscribe" | "unsubscribe";
  type: SubscribableEvent;
}

export interface VisibilityMessage {
  kind: "visibility";
  visible: boolean;
}

export interface PageUnloadMessage {
  kind: "pageunload";
}

export interface PageStayedOpenMessage {
  kind: "pagestayedopen";
}

export type MainToWorkerMessage =
  | RpcRequest
  | RpcResponse
  | RpcAbort
  | SubscribeMessage
  | VisibilityMessage
  | PageUnloadMessage
  | PageStayedOpenMessage;

// ---------------------------------------------------------------------------
// Worker -> main messages
// ---------------------------------------------------------------------------

export type ForwardedEventMessage =
  | {
      kind: "event";
      type: "status";
      status: ConnectionStatus;
      previousStatus: ConnectionStatus;
      /**
       * Piggybacked so the facade's synchronous getters stay correct even
       * for reconnects the worker performs on its own (e.g. visibility
       * resume).
       */
      connectionInfo?: CoreConnectionInfo;
    }
  | {
      kind: "event";
      type: "backgrounderror";
      error: SerializedError;
      event?: string;
    }
  | { kind: "event"; type: "serialdata"; data: string }
  | { kind: "event"; type: "serialreset" }
  | { kind: "event"; type: "flash" }
  | { kind: "event"; type: "jacdacframe"; frame: Uint8Array };

export interface LogMessage {
  kind: "log";
  method: "log" | "error" | "event";
  args: unknown[];
}

/**
 * An unrecoverable worker-side failure outside any RPC (the in-RPC path
 * reports errors via the response).
 */
export interface FatalMessage {
  kind: "fatal";
  error: SerializedError;
}

export type WorkerToMainMessage =
  | RpcRequest
  | RpcResponse
  | RpcProgress
  | ForwardedEventMessage
  | LogMessage
  | FatalMessage;

// ---------------------------------------------------------------------------
// RPC payload shapes
// ---------------------------------------------------------------------------

export interface InitOptions {
  protocolVersion: number;
  deviceSelectionMode?: DeviceSelectionMode;
  pauseOnHidden?: boolean;
}

export interface InitResult {
  protocolVersion: number;
}

export interface FlashRpcOptions {
  partial?: boolean;
  minimumProgressIncrement?: number;
}

/** requestDevice result: enough to re-acquire the device via getDevices(). */
export interface ChosenDevice {
  serialNumber?: string;
  vendorId: number;
  productId: number;
}

export type FlashDataResult =
  | { type: "text"; data: string }
  | { type: "bytes"; data: Uint8Array };

export type { CoreConnectionInfo };
