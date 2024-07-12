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
      period: { id: "e95dfb24-251d-470a-a062-fa1922dfa9a8" },
    },
  },
  deviceInformation: {
    id: "0000180a-0000-1000-8000-00805f9b34fb",
    characteristics: {
      modelNumber: { id: "00002a24-0000-1000-8000-00805f9b34fb" },
      serialNumber: { id: "00002a25-0000-1000-8000-00805f9b34fb" },
      firmwareRevision: { id: "00002a26-0000-1000-8000-00805f9b34fb" },
      hardwareRevision: { id: "00002a27-0000-1000-8000-00805f9b34fb" },
      manufacturer: { id: "00002a29-0000-1000-8000-00805f9b34fb" },
    },
  },
  dfuControl: {
    id: "e95d93b0-251d-470a-a062-fa1922dfa9a8",
    characteristics: {
      control: { id: "e95d93b1-251d-470a-a062-fa1922dfa9a8" },
    },
  },
  led: {
    id: "e95dd91d-251d-470a-a062-fa1922dfa9a8",
    characteristics: {
      matrixState: { id: "e95d7b77-251d-470a-a062-fa1922dfa9a8" },
      text: { id: "e95d93ee-251d-470a-a062-fa1922dfa9a8" },
      scrollingDelay: { id: "e95d0d2d-251d-470a-a062-fa1922dfa9a8" },
    },
  },
  ioPin: {
    id: "e95d127b-251d-470a-a062-fa1922dfa9a8",
    characteristics: {
      pinData: { id: "e95d8d00-251d-470a-a062-fa1922dfa9a8" },
      pinAdConfiguration: { id: "e95d5899-251d-470a-a062-fa1922dfa9a8" },
      pinIoConfiguration: { id: "e95db9fe-251d-470a-a062-fa1922dfa9a8" },
      pwmControl: { id: "e95dd822-251d-470a-a062-fa1922dfa9a8" },
    },
  },
  button: {
    id: "e95d9882-251d-470a-a062-fa1922dfa9a8",
    characteristics: {
      a: { id: "e95dda90-251d-470a-a062-fa1922dfa9a8" },
      b: { id: "e95dda91-251d-470a-a062-fa1922dfa9a8" },
    },
  },
  event: {
    id: "e95d93af-251d-470a-a062-fa1922dfa9a8",
    characteristics: {
      microBitRequirements: { id: "e95db84c-251d-470a-a062-fa1922dfa9a8" },
      microBitEvent: { id: "e95d9775-251d-470a-a062-fa1922dfa9a8" },
      clientRequirements: { id: "e95d23c4-251d-470a-a062-fa1922dfa9a8" },
      clientEvent: { id: "e95d5404-251d-470a-a062-fa1922dfa9a8" },
    },
  },
  magnetometer: {
    id: "e95df2d8-251d-470a-a062-fa1922dfa9a8",
    characteristics: {
      data: { id: "e95dfb11-251d-470a-a062-fa1922dfa9a8" },
      period: { id: "e95d386c-251d-470a-a062-fa1922dfa9a8" },
      bearing: { id: "e95d9715-251d-470a-a062-fa1922dfa9a8" },
      calibration: { id: "e95db358-251d-470a-a062-fa1922dfa9a8" },
    },
  },
  temperature: {
    id: "e95d6100-251d-470a-a062-fa1922dfa9a8",
    characteristics: {
      data: { id: "e95d9250-251d-470a-a062-fa1922dfa9a8" },
      period: { id: "e95d1b25-251d-470a-a062-fa1922dfa9a8" },
    },
  },
};
