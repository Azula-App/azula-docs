import { useState } from "react";
import { ChipGroup } from "@azula/design-system";

export function MultiSelect() {
  const [selected, setSelected] = useState(["dice", "trivia"]);
  return (
    <ChipGroup
      options={["dice", "poll", "tic-tac-toe", "trivia", "word race", "hangman"]}
      selected={selected}
      onChange={setSelected}
    />
  );
}

export function SingleSelect() {
  const [selected, setSelected] = useState(["sfo"]);
  return (
    <ChipGroup
      options={[
        { value: "sfo", label: "sfo · 12ms" },
        { value: "ams", label: "ams · 88ms" },
        { value: "tok", label: "tok · 140ms" },
      ]}
      selected={selected}
      onChange={setSelected}
      multiple={false}
    />
  );
}

export function NoneSelected() {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <ChipGroup
      options={["direct", "encrypted", "relay standby"]}
      selected={selected}
      onChange={setSelected}
    />
  );
}
