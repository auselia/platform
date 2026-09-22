"use client";

export type SettingsSection = "general" | "irrigation" | "oscilloscope";

// The left-top slot for the Settings tab: a vertical list of sections, in the same box the
// day/range picker sits in for other tabs, so the left column's outer shape never changes.
export default function SettingsNav({
  sections, active, onSelect,
}: {
  sections: { id: SettingsSection; label: string }[];
  active: SettingsSection;
  onSelect: (s: SettingsSection) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {sections.map((s) => (
        <button
          key={s.id}
          onClick={() => onSelect(s.id)}
          aria-current={s.id === active}
          className={`rounded-lg border px-3 py-2.5 text-left text-[13px] font-semibold ${
            s.id === active ? "border-accent bg-accent-soft text-ink" : "border-transparent text-ink2 hover:bg-surface-2"
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
