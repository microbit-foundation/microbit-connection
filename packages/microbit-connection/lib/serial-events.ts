export class SerialDataEvent extends Event {
  constructor(public readonly data: string) {
    super("serialdata");
  }
}

export class SerialResetEvent extends Event {
  constructor() {
    super("serialreset");
  }
}

export class SerialErrorEvent extends Event {
  constructor(public readonly error: unknown) {
    super("serialerror");
  }
}

export class FlashEvent extends Event {
  constructor() {
    super("flash");
  }
}

export class SerialConnectionEventMap {
  "serialdata": SerialDataEvent;
  "serialreset": SerialResetEvent;
  "serialerror": SerialErrorEvent;
  "flash": FlashEvent;
}
