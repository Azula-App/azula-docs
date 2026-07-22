## ADDED Requirements

### Requirement: The mock terminal harness SHALL NOT emit width-sensitive content before the first resize

`FakeTerminalStream` SHALL NOT dump its greeting at the emulator's default 80
columns before the window's actual size is known, so width-sensitive replayed
mock content is not corrupted by a layout it will immediately be resized out
of.

#### Scenario: Mock harness starts in a non-default-width window

- **WHEN** a mock-harness test opens a terminal in a window whose column
  count differs from the emulator default (80)
- **THEN** `FakeTerminalStream`'s greeting is laid out at the window's actual
  column count, either by delaying the greeting until after the first
  `Resize` event or by feeding a resize first
