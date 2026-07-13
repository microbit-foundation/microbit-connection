/**
 * (c) 2026, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 *
 * Worker entry point. Import (or bundle) this module inside a Web Worker
 * and pass the Worker to createUSBConnection({ worker }).
 */
import { startUSBWorkerHost } from "./host.js";
import { type MessagePortLike } from "./rpc.js";

// importScripts exists on WorkerGlobalScope (classic and module workers)
// but not on window, making it a reliable are-we-in-a-worker check that
// keeps accidental main-thread imports harmless.
if (
  typeof (globalThis as { importScripts?: unknown }).importScripts ===
  "function"
) {
  startUSBWorkerHost(globalThis as unknown as MessagePortLike);
}
