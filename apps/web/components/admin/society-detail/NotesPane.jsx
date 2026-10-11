import { Loader2, Send } from "lucide-react";
import { field } from "./constants";

export function NotesPane({ notes, note, setNote, busy, addNote }) {
  return (
    <div>
      <form onSubmit={addNote} className="flex gap-2">
        <input
          className={field}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What happened on the call?"
          maxLength={2000}
        />
        <button
          type="submit"
          disabled={!note.trim() || busy === "note"}
          aria-label="Add note"
          className="pk-press inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-2 disabled:opacity-45"
          style={{ backgroundColor: "var(--color-brand-500)", color: "#fff" }}
        >
          {busy === "note" ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Send size={15} strokeWidth={2.4} />
          )}
        </button>
      </form>

      <div className="mt-5 flex flex-col gap-3">
        {notes.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-[var(--color-neutral-400)]">
            No notes yet. Anything recorded here stays internal — the society cannot read it.
          </p>
        ) : (
          notes.map((n) => (
            <div
              key={n.id}
              className="rounded-xl border border-[var(--color-neutral-200)] bg-white p-3.5"
            >
              <p className="text-[14px] leading-relaxed text-[var(--color-neutral-900)]">
                {n.body}
              </p>
              <p className="mt-2 text-[12px] text-[var(--color-neutral-400)]">
                {new Date(n.created_at).toLocaleString(undefined, {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
