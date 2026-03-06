# Hex Files

Example `.hex` files for manual testing and the hardware test app.

## Testing hex files

| File | Description |
|------|-------------|
| `incremental-makecode.hex` | MakeCode program that outputs sequential numbers (0, 1, 2, ...) over serial. Used to verify serial data integrity. |
| `incremental-python.hex` | Same sequential output but as a MicroPython program. Flash after the MakeCode version to force a full flash (different runtime). |

## Bluetooth hex files

| File | Description |
|------|-------------|
| `bluetooth-v1-no-magnetometer.hex` | V1 "all services" Bluetooth hex (excludes magnetometer) |
| `bluetooth-v2.hex` | V2 "all services" Bluetooth hex |

## MicroPython

| File | Description |
|------|-------------|
| `microbit-micropython-v1.hex` | MicroPython for V1 (prints banner at startup over serial) |
| `microbit-micropython-v2.hex` | MicroPython for V2 (similar banner) |
| `python-editor-default.hex` | Universal hex with MicroPython default program from the Python Editor (no serial output) |

## Data collection / CreateAI

| File | Description |
|------|-------------|
| `microbit-data-collection-just-works-universal.hex` | Data collection hex with just-works Bluetooth pairing (C++) |
| `microbit-data-collection-no-pairing-universal.hex` | Data collection hex with open-link Bluetooth (C++) |
| `data-collection-program.hex` | C++ project with open-link Bluetooth |
| `createai-project.hex` | Example project from CreateAI (essentially a MakeCode program) |

## General purpose

| File | Description |
|------|-------------|
| `microbit-beating-heart.hex` | The best "default" MakeCode hex |
| `meet-the-microbit.hex` | Hex that ships on new micro:bits |

## Diagnostic

| File | Description |
|------|-------------|
| `microbit-v1-battery-level.hex` | V1 battery voltage reporter |
| `microbit-v2-battery-voltage-v1.0.0.hex` | V2 battery voltage reporter |
