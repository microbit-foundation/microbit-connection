# micro:bit connection library

This is a JavaScript library for micro:bit connections in browsers via USB and Bluetooth.

This project is a work in progress. We are extracting WebUSB and Web Bluetooth code from the [micro:bit Python Editor](https://github.com/microbit-foundation/python-editor-v3/) and other projects.

It is intended to be used by other Micro:bit Educational Foundation projects that need to connect to a BBC micro:bit.

The API is not stable and it's not yet recommended that third parties use this project unless they are happy to update usage as the API evolves.

[Demo site](https://microbit-connection.pages.dev/) for this library.

[Alpha releases are now on NPM](https://www.npmjs.com/package/@microbit/microbit-connection).

[This Python Editor PR](https://github.com/microbit-foundation/python-editor-v3/pull/1190) tracks updating the micro:bit Python Editor to use this library.

[micro:bit CreateAI](https://github.com/microbit-foundation/ml-trainer/) is already using this library for WebUSB and Web Bluetooth.

## Usage

### Flash a micro:bit

Instantiate a WebUSB connection using {@link MicrobitWebUSBConnection} class and use it to connect to a micro:bit.

```ts
import { MicrobitWebUSBConnection } from "@microbit/microbit-connection";

const usb = new MicrobitWebUSBConnection();
const connectionStatus = await usb.connect();

console.log("Connection status: ", connectionStatus);
```

{@link ConnectionStatus | Connection status} is `"CONNECTED"` if connection succeeds.

Create a Universal Hex that supports both V1 and V2 micro:bits using {@link createUniversalHexFlashDataSource} and flash the micro:bit.

```ts
import { createUniversalHexFlashDataSource } from "@microbit/microbit-connection";

const universalHex = createUniversalHexFlashDataSource(text);
await usb.flash(universalHex, {
  partial: true,
  progress: (percentage: number | undefined) => {
    console.log(percentage);
  },
});
```

Alternatively, you can create and flash a hex that supports a specific micro:bit version (V1 or V2) using the [@microbit/microbit-fs library](https://microbit-foundation.github.io/microbit-fs/). Below is an example of creating a hex for V1 and using it to flash the micro:bit.

```ts
import { MicropythonFsHex } from "@microbit/microbit-fs";
import { BoardId } from "@microbit/microbit-connection";

const boardId = BoardId.forVersion("V1").id;
const micropythonFs = new MicropythonFsHex([{ hex: intelHexString, boardId }]);
const hex = micropythonFs.getIntelHex(boardId);
await usb.flash(async () => hex, {
  partial: true,
  progress: (percentage: number | undefined) => {
    console.log(percentage);
  },
});
```

For more examples of using other methods in the {@link MicrobitWebUSBConnection} class, see our [demo code](https://github.com/microbit-foundation/microbit-connection/blob/main/src/demo.ts) for our [demo site](https://microbit-connection.pages.dev/).

### Connect via Bluetooth

By default, the micro:bit's Bluetooth service is not enabled. Visit our [Bluetooth tech site page](https://tech.microbit.org/bluetooth/) to download a hex file that would enable the bluetooth service.

Instantiate a Bluetooth connection using {@link MicrobitWebBluetoothConnection} class and use it to connect to a micro:bit.

```ts
import { MicrobitWebBluetoothConnection } from "@microbit/microbit-connection";

const bluetooth = new MicrobitWebBluetoothConnection();
const connectionStatus = await bluetooth.connect();

console.log("Connection status: ", connectionStatus);
```

{@link ConnectionStatus | Connection status} is `"CONNECTED"` if connection succeeds.

For more examples of using other methods in the {@link MicrobitWebBluetoothConnection} class, see our [demo code](https://github.com/microbit-foundation/microbit-connection/blob/main/src/demo.ts) for our [demo site](https://microbit-connection.pages.dev/).

## License

This software is under the MIT open source license.

[SPDX-License-Identifier: MIT](LICENSE)

We use dependencies via the NPM registry as specified by the package.json file under common Open Source licenses.

Full details of each package can be found by running `license-checker`:

```bash
$ npx license-checker --direct --summary --production
```

Omit the flags as desired to obtain more detail.

## Code of Conduct

Trust, partnership, simplicity and passion are our core values we live and
breathe in our daily work life and within our projects. Our open-source
projects are no exception. We have an active community which spans the globe
and we welcome and encourage participation and contributions to our projects
by everyone. We work to foster a positive, open, inclusive and supportive
environment and trust that our community respects the micro:bit code of
conduct. Please see our [code of conduct](https://microbit.org/safeguarding/)
which outlines our expectations for all those that participate in our
community and details on how to report any concerns and what would happen
should breaches occur.
