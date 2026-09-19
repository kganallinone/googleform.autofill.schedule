"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* ─────────────────────────────────────────────
   Types
   ───────────────────────────────────────────── */

interface Schedule {
  id: string;
  clinician: string;
  studentNumber: string;
  day: string;
  shift: string;
  dept: string;
  time: string;
  collapsed?: boolean;
}

interface EntryField {
  entry: string;
  title: string;
  type: number;
  choices: string[];
}

type MappingKey =
  | "clinician"
  | "studentNumber"
  | "day"
  | "shift"
  | "dept"
  | "time"
  | "";

type Stage = "setup" | "run";

interface PersistedState {
  formUrl: string;
  schedules: Schedule[];
  mapping: Record<string, MappingKey>;
  fields: EntryField[];
}

interface GeneratedScreen {
  schedule: Schedule;
  prefillUrl: string;
  embedUrl: string;
}

/* ─────────────────────────────────────────────
   Constants
   ───────────────────────────────────────────── */

const STORAGE_KEY = "gform-prefill-state-v3";

const FIXED_REMINDER = "⚠️ Don't forget to enter your email in every screen!";

/* Visible height of each screen's form window (px).
   The iframe is rendered TALLER than this so the whole form
   fits; the wrapper scrolls to reveal the Submit button. */
const FORM_VIEWPORT_HEIGHT = 600;

/* Total rendered height of the embedded form.
   Must be large enough to fit the entire Google Form. */
const FORM_IFRAME_HEIGHT = 2400;

const FALLBACK_CHOICES: Record<"day" | "shift" | "dept" | "time", string[]> = {
  day: [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ],
  shift: ["8-12 AM shift", "12-4 PM shift", "4-8 PM shift"],
  dept: [
    "OD / OP",
    "Prothodontics",
    "Endodontics",
    "Operative Dentistry",
    "Periodontics",
    "Oral Sugery",
    "Orthodontics",
    "Pediatrics",
    "TYPO",
  ],
  time: ["4 hrs", "2hrs", "1hr"],
};

/* ─────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────── */

const uid = () => Math.random().toString(36).slice(2, 10);

const emptySchedule = (): Schedule => ({
  id: uid(),
  clinician: "",
  studentNumber: "",
  day: "",
  shift: "",
  dept: "",
  time: "",
  collapsed: false,
});

const isValidGoogleForm = (url: string): boolean =>
  /^https:\/\/docs\.google\.com\/forms\/d\/e\/[^/]+\/(viewform|formResponse)/.test(
    url,
  );

const isShortLink = (url: string): boolean =>
  /^https:\/\/forms\.gle\//.test(url);

const toCanonicalViewForm = (url: string): string =>
  url.replace(/\/(viewform|formResponse).*$/, "/viewform");

const toEmbedUrl = (url: string): string =>
  `${toCanonicalViewForm(url)}?embedded=true`;

const guessKey = (field: EntryField): MappingKey => {
  const t = field.title.toLowerCase();
  const c = field.choices.map((s) => s.toLowerCase());
  const joined = c.join(" | ");

  if (field.choices.length === 0) {
    if (/clinician/.test(t)) return "clinician";
    if (/student\s*(number|no|#|id)/.test(t)) return "studentNumber";
    return "";
  }

  if (/(am|pm)\s*shift|\d+\s*(am|pm)/.test(joined)) return "shift";
  if (/\b\d+\s*hr/.test(joined)) return "time";
  if (/(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/.test(joined))
    return "day";
  if (
    /(od\s*\/\s*op|prostho|protho|endo|operative|perio|oral|ortho|pediatric)/.test(
      joined,
    )
  )
    return "dept";

  if (/\bshift\b/.test(t)) return "shift";
  if (/\bscheduled?\s*day\b/.test(t)) return "day";
  if (/\b(dep|department|procedure)/.test(t)) return "dept";
  if (/\b(time|interval)/.test(t)) return "time";

  return "";
};

const buildPrefillUrl = (
  baseUrl: string,
  fields: EntryField[],
  mapping: Record<string, MappingKey>,
  schedule: Schedule,
): string => {
  const params = new URLSearchParams();
  params.set("usp", "pp_url");

  for (const f of fields) {
    const key = mapping[f.entry];
    if (!key) continue;
    const value = schedule[key as keyof Schedule];
    if (!value || typeof value !== "string") continue;
    params.set(f.entry, value);
  }

  return `${toCanonicalViewForm(baseUrl)}?${params.toString()}`;
};

const buildEmbedUrl = (prefillUrl: string): string =>
  `${prefillUrl}&embedded=true`;

const loadState = (): PersistedState | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    if (!Array.isArray(parsed.schedules)) return null;
    return parsed;
  } catch {
    return null;
  }
};

const saveState = (state: PersistedState) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
};

/* ─────────────────────────────────────────────
   Small UI components
   ───────────────────────────────────────────── */

function Toast({
  message,
  type = "info",
  onClose,
}: {
  message: string;
  type?: "info" | "success" | "error";
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 2200);
    return () => clearTimeout(t);
  }, [onClose]);

  const bg =
    type === "success"
      ? "bg-emerald-600"
      : type === "error"
        ? "bg-red-600"
        : "bg-slate-800";

  return (
    <div
      className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-50 ${bg} text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg`}
    >
      {message}
    </div>
  );
}

function ScheduleSummary({ s }: { s: Schedule }) {
  const parts = [
    s.clinician,
    s.studentNumber,
    s.day,
    s.shift,
    s.dept,
    s.time,
  ].filter(Boolean);

  if (!parts.length) {
    return <span className="text-slate-400 italic">Empty schedule</span>;
  }

  return (
    <span className="text-slate-600 text-sm truncate">{parts.join(" · ")}</span>
  );
}

/* ─────────────────────────────────────────────
   Screen Card — with internally-scrollable form
   ───────────────────────────────────────────── */

function ScreenCard({
  index,
  data,
  onCopyUrl,
}: {
  index: number;
  data: GeneratedScreen;
  onCopyUrl: (msg: string, type: "info" | "success" | "error") => void;
}) {
  /* This is the SCROLLING CONTAINER.
     Scrolling it scrolls the tall iframe inside it. */
  const scrollBoxRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    const box = scrollBoxRef.current;
    if (!box) return;
    box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
  };

  return (
    <div className="relative bg-white rounded-2xl shadow-sm overflow-hidden flex flex-col border border-slate-100">
      {/* Header */}
      <div className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white flex justify-between items-center gap-2">
        <span className="font-bold text-sm shrink-0">Screen {index + 1}</span>
        <span className="text-xs opacity-90 truncate">
          {data.schedule.clinician || "—"} · {data.schedule.day || "—"} ·{" "}
          {data.schedule.shift || "—"}
        </span>
      </div>

      {/*
        Wrapper has a fixed VIEWPORT height and overflow:auto.
        Inside it, the iframe is TALL (FORM_IFRAME_HEIGHT) so
        the entire Google Form fits — and the wrapper scrolls
        within that tall content, revealing the Submit button.
      */}
      <div
        ref={scrollBoxRef}
        className="relative w-full overflow-y-auto"
        style={{ height: `${FORM_VIEWPORT_HEIGHT}px` }}
      >
        <iframe
          src={data.embedUrl}
          className="w-full block"
          style={{ height: `${FORM_IFRAME_HEIGHT}px`, border: "none" }}
          title={`Screen ${index + 1}`}
        />
      </div>

      {/* Floating scroll-to-bottom button — inside the viewport */}
      <button
        type="button"
        onClick={scrollToBottom}
        tabIndex={-1}
        title="Scroll to form bottom"
        aria-label="Scroll to bottom of form"
        className="
          absolute right-3 z-20
          w-11 h-11 rounded-full
          bg-indigo-600 hover:bg-indigo-700
          text-white shadow-lg hover:shadow-xl
          flex items-center justify-center
          transition-all duration-200
          active:scale-95
        "
        style={{
          bottom: `${FORM_VIEWPORT_HEIGHT - FORM_VIEWPORT_HEIGHT + 70}px`,
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-5 h-5"
        >
          <path d="M12 5v14" />
          <path d="M19 12l-7 7-7-7" />
        </svg>
      </button>

      <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
        <a
          href={data.prefillUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-indigo-600 font-semibold hover:underline truncate"
        >
          Open in new tab ↗
        </a>
        <button
          onClick={() => {
            navigator.clipboard.writeText(data.prefillUrl);
            onCopyUrl("Prefill URL copied", "success");
          }}
          className="text-xs text-slate-500 hover:text-indigo-600 font-medium transition shrink-0"
        >
          📋 Copy URL
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Page
   ───────────────────────────────────────────── */

export default function GoogleFormPage() {
  const [stage, setStage] = useState<Stage>("setup");

  const [formUrl, setFormUrl] = useState("");
  const [fields, setFields] = useState<EntryField[]>([]);
  const [mapping, setMapping] = useState<Record<string, MappingKey>>({});
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");

  const [schedules, setSchedules] = useState<Schedule[]>([emptySchedule()]);

  const [generated, setGenerated] = useState<GeneratedScreen[]>([]);

  const [hydrated, setHydrated] = useState(false);
  const [toast, setToast] = useState<{
    msg: string;
    type: "info" | "success" | "error";
  } | null>(null);

  const showToast = (
    msg: string,
    type: "info" | "success" | "error" = "info",
  ) => setToast({ msg, type });

  /* ─────────────── Hydrate ─────────────── */
  useEffect(() => {
    const saved = loadState();
    if (saved) {
      setFormUrl(saved.formUrl || "");
      setSchedules(
        saved.schedules.length ? saved.schedules : [emptySchedule()],
      );
      setMapping(saved.mapping || {});
      setFields(saved.fields || []);
    }
    setHydrated(true);
  }, []);

  /* ─────────────── Persist ─────────────── */
  useEffect(() => {
    if (!hydrated) return;
    saveState({ formUrl, schedules, mapping, fields });
  }, [hydrated, formUrl, schedules, mapping, fields]);

  /* ─────────────── Choices ─────────────── */
  const choicesFor = (key: "day" | "shift" | "dept" | "time"): string[] => {
    const matches = fields.filter((f) => mapping[f.entry] === key);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const f of matches) {
      for (const c of f.choices) {
        if (!seen.has(c)) {
          seen.add(c);
          out.push(c);
        }
      }
    }
    return out.length ? out : FALLBACK_CHOICES[key];
  };

  const dayChoices = useMemo(() => choicesFor("day"), [fields, mapping]);
  const shiftChoices = useMemo(() => choicesFor("shift"), [fields, mapping]);
  const deptChoices = useMemo(() => choicesFor("dept"), [fields, mapping]);
  const timeChoices = useMemo(() => choicesFor("time"), [fields, mapping]);
  const usingFallback = !fields.length;

  /* ─────────────── Schedule actions ─────────────── */
  const addSchedule = () => {
    setSchedules((prev) => [...prev, emptySchedule()]);
    showToast("Schedule added", "success");
  };

  const removeSchedule = (id: string) => {
    setSchedules((prev) => prev.filter((s) => s.id !== id));
    showToast("Schedule deleted", "info");
  };

  const copySchedule = (id: string) => {
    setSchedules((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx === -1) return prev;
      const clone: Schedule = {
        ...prev[idx],
        id: uid(),
        collapsed: false,
      };
      const next = [...prev];
      next.splice(idx + 1, 0, clone);
      return next;
    });
    showToast("Schedule duplicated", "success");
  };

  const updateSchedule = (id: string, key: keyof Schedule, value: string) =>
    setSchedules((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [key]: value } : s)),
    );

  const toggleCollapse = (id: string) =>
    setSchedules((prev) =>
      prev.map((s) => (s.id === id ? { ...s, collapsed: !s.collapsed } : s)),
    );

  const duplicateAll = () => {
    setSchedules((prev) => [
      ...prev,
      ...prev.map((s) => ({ ...s, id: uid(), collapsed: false })),
    ]);
    showToast("All schedules duplicated", "success");
  };

  /* ─────────────── Fetch entry codes ─────────────── */
  const fetchEntryCodes = async (): Promise<EntryField[]> => {
    setFetchError("");
    setFetching(true);

    let url = formUrl.trim();

    try {
      if (isShortLink(url)) {
        const res = await fetch(`/api/resolve?url=${encodeURIComponent(url)}`);
        const data: { resolved?: string } = await res.json();
        if (!data.resolved) throw new Error("Could not resolve short link.");
        url = data.resolved;
        setFormUrl(url);
      }

      if (!isValidGoogleForm(url)) throw new Error("Invalid Google Form link.");

      const res = await fetch(`/api/form?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error("Failed to fetch form HTML.");

      const data: { fields?: EntryField[]; error?: string } = await res.json();
      if (data.error) throw new Error(data.error);
      if (!data.fields?.length) throw new Error("No fields found in form.");

      setFields(data.fields);

      setMapping((prev) => {
        const next: Record<string, MappingKey> = {};
        for (const f of data.fields!) {
          next[f.entry] = prev[f.entry] ?? guessKey(f);
        }
        return next;
      });

      return data.fields;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setFetchError(`❌ ${msg}`);
      return [];
    } finally {
      setFetching(false);
    }
  };

  /* ─────────────── Generate ─────────────── */
  const handleGenerate = async () => {
    setFetchError("");

    let activeFields = fields;
    let activeMapping = mapping;

    if (!activeFields.length) {
      activeFields = await fetchEntryCodes();
      if (!activeFields.length) return;

      activeMapping = {};
      for (const f of activeFields) {
        activeMapping[f.entry] = mapping[f.entry] ?? guessKey(f);
      }
      setMapping(activeMapping);
    }

    const valid = schedules.filter((s) =>
      [s.clinician, s.studentNumber, s.day, s.shift, s.dept, s.time].some((v) =>
        v.trim(),
      ),
    );

    if (!valid.length) {
      setFetchError("❌ Fill at least one schedule before generating.");
      return;
    }

    const canonicalUrl = toCanonicalViewForm(formUrl.trim());

    const out = valid.map((s) => {
      const prefillUrl = buildPrefillUrl(
        canonicalUrl,
        activeFields,
        activeMapping,
        s,
      );
      return {
        schedule: s,
        prefillUrl,
        embedUrl: buildEmbedUrl(prefillUrl),
      };
    });

    setGenerated(out);
    setStage("run");
    showToast(
      `Generated ${out.length} screen${out.length > 1 ? "s" : ""}`,
      "success",
    );
  };

  const canGenerate =
    formUrl.trim().length > 0 &&
    !fetching &&
    schedules.some((s) =>
      [s.clinician, s.studentNumber, s.day, s.shift, s.dept, s.time].some((v) =>
        v.trim(),
      ),
    );

  const clearAll = () => {
    if (!confirm("Clear form URL, schedules, and cached entry codes?")) return;
    setFormUrl("");
    setFields([]);
    setMapping({});
    setSchedules([emptySchedule()]);
    setGenerated([]);
    setFetchError("");
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    showToast("All data cleared", "info");
  };

  /* ═══════════════════════════════════════════════
     RUN VIEW
     ═══════════════════════════════════════════════ */
  if (stage === "run") {
    return (
      <main className="min-h-screen bg-slate-50 pb-24">
        {/* Sticky toolbar */}
        <div className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200 px-4 py-3">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <h1 className="text-lg sm:text-xl font-bold text-slate-800 truncate">
                📋 Screens
              </h1>
              <span className="text-xs bg-indigo-100 text-indigo-700 font-semibold px-2 py-1 rounded-full shrink-0">
                {generated.length}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setStage("setup")}
                className="px-3 sm:px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition"
              >
                ← Back
              </button>
              <button
                onClick={clearAll}
                className="px-3 sm:px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium rounded-lg transition"
              >
                🗑 Clear
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 py-5 space-y-5">
          {/* Fixed reminder banner */}
          <div className="bg-amber-50 border-l-4 border-amber-400 rounded-r-xl px-4 py-3 flex items-start gap-3 shadow-sm">
            <span className="text-xl leading-none">📌</span>
            <p className="text-sm font-semibold text-amber-900">
              {FIXED_REMINDER}
            </p>
          </div>

          {generated.length === 0 ? (
            <div className="text-center text-slate-400 py-20 bg-white rounded-2xl border border-dashed border-slate-300">
              No screens generated.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
              {generated.map((g, i) => (
                <ScreenCard key={i} index={i} data={g} onCopyUrl={showToast} />
              ))}
            </div>
          )}
        </div>

        {toast && (
          <Toast
            message={toast.msg}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
      </main>
    );
  }

  /* ═══════════════════════════════════════════════
     SETUP VIEW
     ═══════════════════════════════════════════════ */
  return (
    <main className="min-h-screen bg-slate-50 pb-24">
      {/* Sticky header */}
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <h1 className="text-lg sm:text-xl font-bold text-slate-800 truncate">
            🛠️ Form Prefill Generator
          </h1>
          <span className="text-xs text-slate-500 hidden sm:block">
            Auto-saves to browser
          </span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-5 space-y-5">
        {/* ─── STEP 1: Form URL ─── */}
        <section className="bg-white rounded-2xl shadow-sm p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
              1
            </span>
            <h2 className="text-base sm:text-lg font-semibold text-slate-800">
              Form Setup
            </h2>
          </div>

          <label className="block text-sm font-medium text-slate-700 mb-2">
            Google Form link
          </label>
          <input
            type="url"
            value={formUrl}
            onChange={(e) => setFormUrl(e.target.value)}
            placeholder="https://docs.google.com/forms/d/e/.../viewform"
            className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />

          {fetchError && (
            <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
              {fetchError}
            </div>
          )}

          {fields.length > 0 && (
            <div className="mt-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-lg flex items-center gap-2">
              <span>✅</span>
              <span>
                {fields.length} field{fields.length > 1 ? "s" : ""} cached
              </span>
            </div>
          )}

          {usingFallback && (
            <div className="mt-3 text-sm text-blue-700 bg-blue-50 border border-blue-100 px-3 py-2 rounded-lg flex items-center gap-2">
              <span>ℹ️</span>
              <span>Using built-in choice lists until you generate.</span>
            </div>
          )}

          {fetching && (
            <div className="mt-3 text-sm text-indigo-700 bg-indigo-50 border border-indigo-100 px-3 py-2 rounded-lg flex items-center gap-2">
              <span className="animate-spin">⏳</span>
              <span>Fetching entry codes…</span>
            </div>
          )}
        </section>

        {/* ─── STEP 2: Schedules ─── */}
        <section className="bg-white rounded-2xl shadow-sm p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                2
              </span>
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-slate-800">
                  Schedules
                </h2>
                <p className="text-xs text-slate-500">
                  Each schedule produces one screen
                </p>
              </div>
            </div>
            <div className="flex gap-2 self-start sm:self-auto">
              {schedules.length > 1 && (
                <button
                  onClick={duplicateAll}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition"
                  title="Duplicate all schedules"
                >
                  ⧉ Duplicate All
                </button>
              )}
              <button
                onClick={addSchedule}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition shadow-sm"
              >
                + Add Schedule
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {schedules.map((s, i) => {
              const isCollapsed = s.collapsed;

              return (
                <div
                  key={s.id}
                  className={`rounded-xl border transition-all ${
                    isCollapsed
                      ? "bg-slate-50 border-slate-200"
                      : "bg-white border-slate-200 shadow-sm"
                  }`}
                >
                  {/* Header row */}
                  <div className="flex items-center gap-2 px-3 sm:px-4 py-3">
                    <button
                      onClick={() => toggleCollapse(s.id)}
                      className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-700 transition shrink-0"
                      title={isCollapsed ? "Expand" : "Collapse"}
                    >
                      <span
                        className={`transition-transform ${
                          isCollapsed ? "" : "rotate-90"
                        }`}
                      >
                        ▶
                      </span>
                    </button>

                    <span className="text-xs font-bold text-slate-400 shrink-0 w-6">
                      #{i + 1}
                    </span>

                    <div className="flex-1 min-w-0">
                      <ScheduleSummary s={s} />
                    </div>

                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        onClick={() => copySchedule(s.id)}
                        className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                        title="Duplicate"
                      >
                        ⧉
                      </button>
                      <button
                        onClick={() => toggleCollapse(s.id)}
                        className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                        title={isCollapsed ? "Edit" : "Done"}
                      >
                        {isCollapsed ? "✏️" : "✓"}
                      </button>
                      <button
                        onClick={() => removeSchedule(s.id)}
                        disabled={schedules.length === 1}
                        className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 rounded-lg transition"
                        title="Delete"
                      >
                        🗑
                      </button>
                    </div>
                  </div>

                  {/* Body (expanded) */}
                  {!isCollapsed && (
                    <div className="px-3 sm:px-4 pb-4 pt-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {/* Name of Clinician */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Name of Clinician
                        </label>
                        <input
                          type="text"
                          value={s.clinician}
                          onChange={(e) =>
                            updateSchedule(s.id, "clinician", e.target.value)
                          }
                          placeholder="e.g. Dr. Juan Dela Cruz"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                      </div>

                      {/* Student Number */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Student Number
                        </label>
                        <input
                          type="text"
                          value={s.studentNumber}
                          onChange={(e) =>
                            updateSchedule(
                              s.id,
                              "studentNumber",
                              e.target.value,
                            )
                          }
                          placeholder="e.g. 2024-00123"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                      </div>

                      {/* Scheduled Day */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Scheduled Day
                        </label>
                        <select
                          value={s.day}
                          onChange={(e) =>
                            updateSchedule(s.id, "day", e.target.value)
                          }
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        >
                          <option value="">— Select —</option>
                          {dayChoices.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Shift Schedule */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Shift Schedule
                        </label>
                        <select
                          value={s.shift}
                          onChange={(e) =>
                            updateSchedule(s.id, "shift", e.target.value)
                          }
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        >
                          <option value="">— Select —</option>
                          {shiftChoices.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Department / Procedure */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Department / Procedure
                        </label>
                        <select
                          value={s.dept}
                          onChange={(e) =>
                            updateSchedule(s.id, "dept", e.target.value)
                          }
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        >
                          <option value="">— Select —</option>
                          {deptChoices.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Time Interval */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Time Interval Required
                        </label>
                        <select
                          value={s.time}
                          onChange={(e) =>
                            updateSchedule(s.id, "time", e.target.value)
                          }
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        >
                          <option value="">— Select —</option>
                          {timeChoices.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-xs text-slate-500 mt-4 text-center">
            <span className="font-bold text-indigo-600">
              {schedules.length}
            </span>{" "}
            schedule{schedules.length > 1 ? "s" : ""} →{" "}
            <span className="font-bold text-indigo-600">
              {schedules.length}
            </span>{" "}
            screen{schedules.length > 1 ? "s" : ""}
          </p>
        </section>

        {/* ─── STEP 3: Mapping (collapsible) ─── */}
        {fields.length > 0 && (
          <section className="bg-white rounded-2xl shadow-sm p-4 sm:p-6">
            <details>
              <summary className="cursor-pointer select-none">
                <span className="inline-flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-slate-400 text-white text-xs font-bold flex items-center justify-center">
                    3
                  </span>
                  <span className="text-base sm:text-lg font-semibold text-slate-800">
                    Advanced Field Mapping
                  </span>
                  <span className="text-xs font-normal text-slate-500">
                    (auto-detected)
                  </span>
                </span>
              </summary>
              <div className="space-y-2 mt-4">
                {fields.map((f) => (
                  <div
                    key={f.entry}
                    className="flex flex-col sm:flex-row sm:items-center gap-2 py-2 border-b border-slate-100 last:border-0"
                  >
                    <label className="flex-1 text-sm text-slate-700 font-medium break-words">
                      {f.title || f.entry}
                      <span className="ml-2 text-[10px] text-slate-400 font-mono">
                        {f.entry}
                      </span>
                      {f.choices.length > 0 && (
                        <span className="ml-2 text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-semibold">
                          {f.choices.length} choices
                        </span>
                      )}
                    </label>
                    <select
                      value={mapping[f.entry] ?? ""}
                      onChange={(e) =>
                        setMapping((prev) => ({
                          ...prev,
                          [f.entry]: e.target.value as MappingKey,
                        }))
                      }
                      className="sm:w-56 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">— Ignore —</option>
                      <option value="clinician">Name of Clinician</option>
                      <option value="studentNumber">Student Number</option>
                      <option value="day">Scheduled Day</option>
                      <option value="shift">Shift Schedule</option>
                      <option value="dept">Department / Procedure</option>
                      <option value="time">Time Interval Required</option>
                    </select>
                  </div>
                ))}
              </div>
            </details>
          </section>
        )}
      </div>

      {/* ─── Sticky Generate Bar ─── */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
        <div className="max-w-5xl mx-auto px-4 py-3 flex gap-2">
          <button
            onClick={() => void handleGenerate()}
            disabled={!canGenerate}
            className="flex-1 px-5 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold rounded-xl transition shadow-sm text-sm sm:text-base"
          >
            {fetching
              ? "⏳ Fetching…"
              : `⚡ GENERATE ${schedules.length} SCREEN${
                  schedules.length > 1 ? "S" : ""
                }`}
          </button>
          <button
            onClick={clearAll}
            title="Clear all saved data"
            className="px-4 py-3 bg-slate-100 hover:bg-red-50 hover:text-red-600 text-slate-600 rounded-xl transition shrink-0"
          >
            🗑
          </button>
        </div>
      </div>

      {toast && (
        <Toast
          message={toast.msg}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </main>
  );
}
