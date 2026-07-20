import { useState } from "react";
import { Checkbox } from "@azula/design-system";

export function Checked() {
  const [checked, setChecked] = useState(true);
  return <Checkbox checked={checked} onChange={setChecked} label="Keep a backup relay on standby" />;
}

export function Unchecked() {
  const [checked, setChecked] = useState(false);
  return <Checkbox checked={checked} onChange={setChecked} label="Auto-accept files from zuko" />;
}

export function Disabled() {
  return <Checkbox checked disabled label="End-to-end encryption (always on)" />;
}
