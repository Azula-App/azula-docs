import { useState } from "react";
import { RadioGroup } from "@azula/design-system";

const relays = [
  { value: "sfo", label: "sfo", detail: "12ms" },
  { value: "ams", label: "ams", detail: "88ms" },
  { value: "tok", label: "tok", detail: "140ms" },
];

export function RelayPicker() {
  const [value, setValue] = useState("sfo");
  return (
    <div style={{ width: 340 }}>
      <RadioGroup options={relays} value={value} onChange={setValue} />
    </div>
  );
}

export function FarRelaySelected() {
  const [value, setValue] = useState("tok");
  return (
    <div style={{ width: 340 }}>
      <RadioGroup options={relays} value={value} onChange={setValue} />
    </div>
  );
}
