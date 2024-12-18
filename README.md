# JavaScript library for micro:bit connections in browsers via USB and Bluetooth

This project is a work in progress. We are extracting WebUSB and Web Bluetooth code from the [micro:bit Python Editor](https://github.com/microbit-foundation/python-editor-v3/) and other projects.

It is intended to be used by other Micro:bit Educational Foundation projects that need to connect to a BBC micro:bit.

The API is not stable and it's not yet recommended that third parties use this project unless they are happy to update usage as the API evolves.

[Alpha releases are now on NPM](https://www.npmjs.com/package/@microbit/microbit-connection).

[This Python Editor PR](https://github.com/microbit-foundation/python-editor-v3/pull/1190) tracks updating the micro:bit Python Editor to use this library.

[micro:bit CreateAI](https://github.com/microbit-foundation/ml-trainer/) is already using this library for WebUSB and Web Bluetooth.

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
