import { useState } from "react";
import type { ReactNode } from "react";

export interface TabItem {
  title: ReactNode;
  content: ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  /** Controlled selected index. */
  index?: number;
  /** Uncontrolled initial index. Default 0. */
  defaultIndex?: number;
  onChange?: (index: number) => void;
}

/**
 * Underline tabs: the active tab is pink-light at weight 600 with a 2px
 * `primary` underline riding the hairline bar; inactive tabs are dim.
 * Renders exactly one panel.
 */
export function Tabs({ tabs, index, defaultIndex = 0, onChange }: TabsProps) {
  const [internal, setInternal] = useState(defaultIndex);
  const current = index ?? internal;
  const select = (i: number) => {
    setInternal(i);
    onChange?.(i);
  };
  return (
    <div>
      <div className="az-tabs__bar" role="tablist">
        {tabs.map((t, i) => (
          <button
            key={i}
            role="tab"
            aria-selected={i === current}
            className={`az-tab${i === current ? " az-tab--on" : ""}`}
            onClick={() => select(i)}
          >
            {t.title}
          </button>
        ))}
      </div>
      <div className="az-tabs__panel" role="tabpanel">
        {tabs[current]?.content}
      </div>
    </div>
  );
}
