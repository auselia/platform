import type { LegalDoc } from "@/lib/marketing/legal-content";

export default function LegalDocView({ doc }: { doc: LegalDoc }) {
  return (
    <article>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
        {doc.title}
      </h1>
      <p className="mt-2 font-mono text-xs uppercase tracking-wide text-ink2">{doc.updated}</p>

      <div className="mt-8 flex flex-col gap-6">
        {doc.sections.map((s) => (
          <section key={s.heading}>
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
              {s.heading}
            </h2>
            <div className="mt-2 flex flex-col gap-3">
              {s.paragraphs.map((p, i) => (
                <p key={i} className="text-sm leading-relaxed text-ink2">
                  {p}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
