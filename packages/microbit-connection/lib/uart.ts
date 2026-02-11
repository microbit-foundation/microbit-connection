export class UARTDataEvent extends Event {
  constructor(public readonly value: Uint8Array) {
    super("uartdata");
  }
}
