import { Terminal } from "@azula/design-system";

export function Session() {
  return (
    <div style={{ maxWidth: 480 }}>
      <Terminal
        lines={[
          { cmd: "iroh doctor connect" },
          "✓ holepunched — direct path established",
          { cmd: "azula pair" },
          "session k7-fox-ember · waiting for peer…",
        ]}
      />
    </div>
  );
}
