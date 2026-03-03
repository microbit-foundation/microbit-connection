export interface SerialData {
  data: string;
}

export interface SerialErrorData {
  error: unknown;
}

export interface SerialConnectionEventMap {
  serialdata: SerialData;
  serialreset: void;
  serialerror: SerialErrorData;
  flash: void;
}
