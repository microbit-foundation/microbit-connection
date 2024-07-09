// Very incomplete BT profile
export const profile = {
  uart: {
    id: "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
    characteristics: {
      tx: { id: "6e400002-b5a3-f393-e0a9-e50e24dcca9e" },
      rx: { id: "6e400003-b5a3-f393-e0a9-e50e24dcca9e" },
    },
  },
  accelerometer: {
    id: "e95d0753-251d-470a-a062-fa1922dfa9a8",
    characteristics: {
      data: { id: "e95dca4b-251d-470a-a062-fa1922dfa9a8" },
    },
  },
  deviceInformation: {
    id: "0000180a-0000-1000-8000-00805f9b34fb",
    characteristics: {
      modelNumber: { id: "00002a24-0000-1000-8000-00805f9b34fb" },
    },
  },
  led: {
    id: "e95dd91d-251d-470a-a062-fa1922dfa9a8",
    characteristics: {
      matrixState: { id: "e95d7b77-251d-470a-a062-fa1922dfa9a8" },
    },
  },
  io: {
    id: "e95d127b-251d-470a-a062-fa1922dfa9a8",
    characteristics: {
      data: { id: "e95d8d00-251d-470a-a062-fa1922dfa9a8" },
    },
  },
  button: {
    id: "e95d9882-251d-470a-a062-fa1922dfa9a8",
    characteristics: {
      a: { id: "e95dda90-251d-470a-a062-fa1922dfa9a8" },
      b: { id: "e95dda91-251d-470a-a062-fa1922dfa9a8" },
    },
  },
};
