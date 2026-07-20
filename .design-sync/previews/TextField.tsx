import { useState } from "react";
import { TextField } from "@azula/design-system";

export function Kinds() {
  const [alias, setAlias] = useState("zuko");
  const [ceiling, setCeiling] = useState("50");
  const [secret, setSecret] = useState("k7-fox-ember");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: 340 }}>
      <TextField kind="shortText" label="shortText · peer alias" value={alias} onChange={setAlias} />
      <TextField kind="number" label="number · ping ceiling (ms)" value={ceiling} onChange={setCeiling} />
      <TextField kind="obscured" label="obscured · relay secret" value={secret} onChange={setSecret} />
    </div>
  );
}

export function LongText() {
  const [note, setNote] = useState("peer-to-peer over iroh — no server in the middle.");
  return (
    <div style={{ width: 340 }}>
      <TextField kind="longText" label="longText · connection note" value={note} onChange={setNote} />
    </div>
  );
}

export function Placeholder() {
  const [value, setValue] = useState("");
  return (
    <div style={{ width: 340 }}>
      <TextField value={value} onChange={setValue} placeholder="filter games…" />
    </div>
  );
}
