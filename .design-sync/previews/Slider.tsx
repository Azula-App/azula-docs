import { useState } from "react";
import { Slider } from "@azula/design-system";

export function GlowIntensity() {
  const [value, setValue] = useState(0.6);
  return (
    <div style={{ width: 340 }}>
      <Slider
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={setValue}
        label="glow intensity · 0.0–1.0"
        valueText={value.toFixed(2)}
      />
    </div>
  );
}

export function RelayLoadCap() {
  const [value, setValue] = useState(42);
  return (
    <div style={{ width: 340 }}>
      <Slider min={0} max={100} value={value} onChange={setValue} label="relay load cap · 0–100" />
    </div>
  );
}
