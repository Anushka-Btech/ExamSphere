import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useNavigate, useParams } from "react-router-dom";

import { AnimatePresence, motion, type Variants } from "framer-motion";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eraser,
  Flag,
  LayoutGrid,
  Loader2,
  WifiOff,
  X,
} from "lucide-react";

import { api, ApiError } from "../../lib/api";

import {
  Button,
  Card,
  ConfirmDialog,
  ErrorState,
  Skeleton,
  cn,
} from "../../components/ui";

import { LogoMark } from "../../components/Logo";

import { spring } from "../../lib/motion";

import { useToast } from "../../components/Toast";

interface Question {
  examQuestionId: number;
  order: number;
  marks: number;
  text: string;
  type: "MCQ" | "TRUE_FALSE" | "SHORT" | "DESCRIPTIVE";

  options: { optionId: number; text: string }[];
  answer: {
    selectedOptionId: number | null;
    text: string | null;
    markedForReview: boolean;
  };
}

interface Paper {
  attempt: {
    attemptId: number;
    status: string;
    deadline: string;
    serverNow: string;
  };

  exam: {
    title: string;
    duration_minutes: number;
    max_marks: number;
    subject_name: string;
    subject_code: string;
  };
  questions: Question[];
}

interface Ans {
  selectedOptionId: number | null;
  text: string;
  markedForReview: boolean;
}

type SaveState = "saved" | "saving" | "error";

const utc = (s: string) =>
  new Date(s.replace(" ", "T").replace(/\.\d+$/, "") + "Z").getTime();

const mmss = (ms: number) => {
  const t = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(t / 3600),
    m = Math.floor((t % 3600) / 60),
    s = t % 60;

  return `${h ? h + ":" : ""}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const isObjective = (q: Question) =>
  q.type === "MCQ" || q.type === "TRUE_FALSE";

const hasAnswer = (q: Question, a?: Ans) =>
  !!a &&
  (isObjective(q) ? a.selectedOptionId !== null : a.text.trim().length > 0);

export default function ExamTake() {
  const { attemptId } = useParams();

  const nav = useNavigate();

  const toast = useToast();

  const [paper, setPaper] = useState<Paper | null>(null);

  const [error, setError] = useState("");

  const [idx, setIdx] = useState(0);

  const [answers, setAnswers] = useState<Record<number, Ans>>({});

  const [visited, setVisited] = useState<Set<number>>(new Set());

  const [saveState, setSaveState] = useState<Record<number, SaveState>>({});

  const [now, setNow] = useState(Date.now());

  const [skew, setSkew] = useState(0);

  const [confirm, setConfirm] = useState<{
    answered: number;
    unanswered: number;
  } | null>(null);

  const [submitting, setSubmitting] = useState(false);

  const [closed, setClosed] = useState<string | null>(null); // set when the SERVER says the attempt is over

  // view-only state: slide direction, last successful save time, mobile palette sheet

  const [dir, setDir] = useState(1);

  const [lastSaved, setLastSaved] = useState<number | null>(null);

  const [sheet, setSheet] = useState(false);

  const totalMs = useRef(0);

  const answersRef = useRef(answers);
  answersRef.current = answers;

  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const dirty = useRef<Set<number>>(new Set());

  const submittingRef = useRef(false);

  // ---- load (also used to resume after a refresh: saved answers come back from the server)

  useEffect(() => {
    api<Paper>(`/student/attempts/${attemptId}`)
      .then((p) => {
        setPaper(p);

        setSkew(utc(p.attempt.serverNow) - Date.now());

        const a: Record<number, Ans> = {};

        p.questions.forEach((q) => {
          a[q.examQuestionId] = {
            selectedOptionId: q.answer.selectedOptionId,
            text: q.answer.text ?? "",
            markedForReview: q.answer.markedForReview,
          };
        });

        setAnswers(a);

        setVisited(
          new Set(
            p.questions
              .filter((q) => hasAnswer(q, a[q.examQuestionId]))
              .map((q) => q.examQuestionId)
              .concat(p.questions[0]?.examQuestionId ?? []),
          ),
        );

        if (p.attempt.status !== "IN_PROGRESS")
          setClosed("This attempt has already been submitted.");
      })
      .catch((e) => setError(e.message));
  }, [attemptId]);

  // ---- countdown: cosmetic only. Time left = server deadline minus (local clock + offset to server clock).

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const msLeft = paper ? utc(paper.attempt.deadline) - (now + skew) : Infinity;

  // ---- saving. Local state updates instantly; the network write is retried until the server confirms or closes the attempt.

  const send = useCallback(
    async (eqId: number): Promise<boolean> => {
      const a = answersRef.current[eqId];
      const q = paper?.questions.find((x) => x.examQuestionId === eqId);

      if (!a || !q) return true;

      setSaveState((s) => ({ ...s, [eqId]: "saving" }));

      try {
        await api(`/student/attempts/${attemptId}/answers`, {
          method: "PUT",
          body: {
            examQuestionId: eqId,
            markedForReview: a.markedForReview,

            ...(isObjective(q)
              ? { selectedOptionId: a.selectedOptionId }
              : { answerText: a.text === "" ? null : a.text }),
          },
        });

        dirty.current.delete(eqId);

        setSaveState((s) => ({ ...s, [eqId]: "saved" }));

        setLastSaved(Date.now());

        return true;
      } catch (e) {
        if (e instanceof ApiError && (e.status === 409 || e.status === 404)) {
          setClosed(e.message);
          dirty.current.clear();
          return true;
        } // server closed the attempt

        setSaveState((s) => ({ ...s, [eqId]: "error" })); // network/server error: keep it dirty and retry

        return false;
      }
    },
    [attemptId, paper],
  );

  // memoised callbacks call send() through a ref, so they never run a stale copy that still has paper === null

  const sendRef = useRef(send);
  sendRef.current = send;

  const schedule = useCallback((eqId: number, delay: number) => {
    dirty.current.add(eqId);

    clearTimeout(timers.current[eqId]);

    timers.current[eqId] = setTimeout(() => {
      sendRef.current(eqId);
    }, delay);
  }, []);

  // retry anything that failed every 4 seconds

  useEffect(() => {
    const t = setInterval(
      () =>
        dirty.current.forEach((id) => {
          if (saveState[id] === "error") send(id);
        }),
      4000,
    );

    return () => clearInterval(t);
  }, [saveState, send]);

  // warn before leaving with unsaved answers

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty.current.size) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  const update = (q: Question, patch: Partial<Ans>, delay: number) => {
    setAnswers((a) => ({
      ...a,
      [q.examQuestionId]: { ...a[q.examQuestionId], ...patch },
    }));

    answersRef.current = {
      ...answersRef.current,
      [q.examQuestionId]: { ...answersRef.current[q.examQuestionId], ...patch },
    };

    schedule(q.examQuestionId, delay);
  };

  const flushAllRef = useRef<() => Promise<boolean>>(async () => true);

  const flushAll = async () => {
    Object.values(timers.current).forEach(clearTimeout);

    const ids = [...dirty.current];

    const results = await Promise.all(ids.map((id) => sendRef.current(id)));

    return results.every(Boolean);
  };

  flushAllRef.current = flushAll;

  const go = (i: number) => {
    if (!paper) return;
    const t = Math.min(Math.max(i, 0), paper.questions.length - 1);
    setDir(t >= idx ? 1 : -1);
    setIdx(t);
    setVisited((v) => new Set(v).add(paper.questions[t].examQuestionId));
  };

  // ---- submit

  const openConfirm = async () => {
    if (!(await flushAll())) {
      toast.error(
        "Some answers could not be saved yet. Check your connection and try again.",
      );
      return;
    }

    try {
      const p = await api<{ answered: number; unanswered: number }>(
        `/student/attempts/${attemptId}/progress`,
      );
      setConfirm(p);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const finalSubmit = useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);

    try {
      await flushAllRef.current();

      await api(`/student/attempts/${attemptId}/submit`, { method: "POST" }); // idempotent on the server

      setConfirm(null);
      setClosed("Your examination has been submitted.");
    } catch (e) {
      toast.error((e as Error).message);
      setTimeout(() => {
        submittingRef.current = false;
      }, 5000);
    } finally {
      // allow a retry after 5s, not every tick

      setSubmitting(false);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId]);

  // when the countdown hits zero, ask the server to close the attempt. The server decides; this just triggers it.

  useEffect(() => {
    if (paper && !closed && msLeft <= 0) finalSubmit();
  }, [msLeft, paper, closed, finalSubmit]);

  const q = paper?.questions[idx];

  const goRef = useRef<(i: number) => void>(() => undefined);
  goRef.current = go;

  const idxRef = useRef(idx);
  idxRef.current = idx;

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;

      if (
        el &&
        (el.tagName === "TEXTAREA" ||
          (el.tagName === "INPUT" &&
            (el as HTMLInputElement).type !== "radio") ||
          el.tagName === "SELECT")
      )
        return;

      if (e.altKey || e.ctrlKey || e.metaKey) return;

      if (e.key === "ArrowRight") {
        e.preventDefault();
        goRef.current(idxRef.current + 1);
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goRef.current(idxRef.current - 1);
      }
    };

    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  const status = (x: Question) => {
    const a = answers[x.examQuestionId];

    if (a?.markedForReview) return "review";

    if (hasAnswer(x, a)) return "answered";

    return visited.has(x.examQuestionId) ? "unanswered" : "notvisited";
  };

  const counts = useMemo(() => {
    const c = { answered: 0, review: 0, unanswered: 0, notvisited: 0 };

    paper?.questions.forEach((x) => {
      c[status(x) as keyof typeof c]++;
    });

    return c;

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper, answers, visited]);

  const failing = Object.values(saveState).some((s) => s === "error");

  const saving = Object.values(saveState).some((s) => s === "saving");

  if (error)
    return (
      <div className="mx-auto max-w-lg p-6">
        <ErrorState message={error} onRetry={() => nav("/student/exams")} />
      </div>
    );

  if (!paper)
    return (
      <div
        className="mx-auto max-w-5xl space-y-4 p-6"
        role="status"
        aria-label="Loading examination"
      >
        <Skeleton className="h-14 rounded-2xl" />
        <div className="grid gap-5 lg:grid-cols-[1fr_17rem]">
          <Skeleton className="h-96 rounded-3xl" />
          <Skeleton className="h-72 rounded-3xl" />
        </div>
      </div>
    );

  if (closed)
    return (
      <div
        className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas p-6"
        data-role="STUDENT"
      >
        <div
          className="accent-gradient pointer-events-none absolute left-1/2 top-1/3 h-80 w-80 -translate-x-1/2 rounded-full opacity-20 blur-3xl"
          aria-hidden
        />

        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={spring}
          className="relative flex w-full max-w-md flex-col items-center gap-4 rounded-3xl border border-line bg-surface p-8 text-center shadow-pop"
        >
          <motion.svg
            viewBox="0 0 52 52"
            className="h-20 w-20"
            aria-hidden
            fill="none"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ stroke: "rgb(var(--ok))" }}
          >
            <motion.circle
              cx="26"
              cy="26"
              r="23"
              initial={{ pathLength: 0 } as any}
              animate={{ pathLength: 1 } as any}
              transition={{ duration: 0.7 }}
            />

            <motion.path
              d="M15 27l8 8 14-16"
              initial={{ pathLength: 0 } as any}
              animate={{ pathLength: 1 } as any}
              transition={{ duration: 0.4, delay: 0.55 }}
            />
          </motion.svg>

          <h1 className="text-2xl font-semibold text-ink">{closed}</h1>

          <p className="text-sm text-muted">
            Objective answers are graded automatically. Written answers are
            marked by your faculty, and results appear after they are published.
          </p>

          <Button size="lg" onClick={() => nav("/student/exams")}>
            Back to my examinations
          </Button>
        </motion.div>
      </div>
    );

  const a = q ? answers[q.examQuestionId] : undefined;

  const statuses = paper.questions.map(status);

  const total = paper.questions.length;

  if (Number.isFinite(msLeft) && msLeft > totalMs.current)
    totalMs.current = msLeft; // largest value seen = the full allowance, used only to draw the ring

  const frac =
    totalMs.current > 0
      ? Math.max(0, Math.min(1, msLeft / totalMs.current))
      : 1;

  const level: "ok" | "low" | "critical" =
    msLeft <= 60_000 ? "critical" : msLeft < 5 * 60_000 ? "low" : "ok";

  const ago =
    lastSaved === null
      ? null
      : Math.max(0, Math.floor((now - lastSaved) / 1000));

  const agoText =
    ago === null
      ? "All changes saved"
      : ago < 5
        ? "Saved just now"
        : ago < 60
          ? `Saved ${ago}s ago`
          : `Saved ${Math.floor(ago / 60)}m ago`;

  return (
    <div className="min-h-screen bg-canvas pb-24 lg:pb-0" data-role="STUDENT">
      <header className="glass sticky top-0 z-30 border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-3">
            <LogoMark className="hidden h-8 w-8 shrink-0 sm:block" />

            <div className="min-w-0">
              <h1 className="truncate text-[0.95rem] font-semibold text-ink">
                {paper.exam.title}
              </h1>

              <p className="truncate text-xs text-muted">
                {paper.exam.subject_code} · {paper.exam.subject_name} ·{" "}
                {paper.exam.max_marks} marks
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <SaveStatus failing={failing} saving={saving} text={agoText} />

            <TimerPill ms={msLeft} frac={frac} level={level} />

            <Button onClick={openConfirm}>Submit</Button>
          </div>
        </div>

        <div
          className="h-1 bg-surface-3"
          role="progressbar"
          aria-label="Questions answered"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={counts.answered + counts.review}
        >
          <div
            className="accent-gradient h-full transition-[width] duration-500 ease-out"
            style={{
              width: `${((counts.answered + counts.review) / total) * 100}%`,
            }}
          />
        </div>

        {/* announced once at each threshold, so screen readers are warned without hearing every second */}

        <p className="sr-only" aria-live="assertive">
          {level === "critical"
            ? "One minute remaining."
            : level === "low"
              ? "Less than five minutes remaining."
              : ""}
        </p>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1fr_17rem]">
        <Card className="overflow-hidden rounded-3xl">
          <div className="accent-gradient h-1" aria-hidden />

          <div className="p-5 sm:p-8">
            {q && a && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                    Question {idx + 1}{" "}
                    <span className="text-line-strong">/</span> {total}{" "}
                    <span className="mx-1.5 text-line-strong">·</span> {q.marks}{" "}
                    {q.marks === 1 ? "mark" : "marks"}
                  </p>

                  <span className="text-xs text-muted" aria-live="polite">
                    {saveState[q.examQuestionId] === "saving"
                      ? "Saving…"
                      : saveState[q.examQuestionId] === "error"
                        ? "Not saved"
                        : saveState[q.examQuestionId] === "saved"
                          ? "Saved"
                          : ""}
                  </span>
                </div>

                <AnimatePresence mode="wait" custom={dir} initial={false}>
                  <motion.div
                    key={q.examQuestionId}
                    custom={dir}
                    variants={slide}
                    initial="enter"
                    animate="center"
                    exit="exit"
                  >
                    {isObjective(q) ? (
                      <fieldset className="mt-4">
                        <legend className="whitespace-pre-wrap text-xl font-medium leading-snug text-ink">
                          {q.text}
                        </legend>

                        <div className="mt-6 space-y-3">
                          {q.options.map((o, oi) => {
                            const picked = a.selectedOptionId === o.optionId;
                            return (
                              <motion.label
                                key={o.optionId}
                                whileTap={{ scale: 0.985 }}
                                className={cn(
                                  "group relative flex cursor-pointer items-center gap-4 rounded-2xl border px-4 py-3.5 text-[0.95rem] transition-all duration-200 focus-within:ring-4 focus-within:ring-brand-500/20",

                                  picked
                                    ? "border-brand-500 bg-brand-500/10 text-ink shadow-glow"
                                    : "border-line bg-surface hover:border-line-strong hover:bg-surface-2",
                                )}
                              >
                                <input
                                  type="radio"
                                  name={`q-${q.examQuestionId}`}
                                  className="sr-only"
                                  checked={picked}
                                  onChange={() =>
                                    update(
                                      q,
                                      { selectedOptionId: o.optionId },
                                      0,
                                    )
                                  }
                                />

                                <span
                                  className={cn(
                                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold transition-colors duration-200",
                                    picked
                                      ? "accent-gradient text-white"
                                      : "bg-surface-3 text-muted group-hover:text-ink",
                                  )}
                                  aria-hidden
                                >
                                  {String.fromCharCode(65 + oi)}
                                </span>

                                <span className="flex-1">{o.text}</span>

                                <AnimatePresence>
                                  {picked && (
                                    <motion.span
                                      initial={{ scale: 0, rotate: -40 }}
                                      animate={{ scale: 1, rotate: 0 }}
                                      exit={{ scale: 0 }}
                                      transition={spring}
                                      aria-hidden
                                    >
                                      <CheckCircle2 className="h-5 w-5 text-brand-600" />
                                    </motion.span>
                                  )}
                                </AnimatePresence>
                              </motion.label>
                            );
                          })}
                        </div>
                      </fieldset>
                    ) : (
                      <div className="mt-4">
                        <label
                          htmlFor="written"
                          className="block whitespace-pre-wrap text-xl font-medium leading-snug text-ink"
                        >
                          {q.text}
                        </label>

                        <textarea
                          id="written"
                          value={a.text}
                          maxLength={10000}
                          onChange={(e) =>
                            update(q, { text: e.target.value }, 800)
                          }
                          onBlur={() => {
                            if (dirty.current.has(q.examQuestionId)) {
                              clearTimeout(timers.current[q.examQuestionId]);
                              send(q.examQuestionId);
                            }
                          }}
                          rows={q.type === "SHORT" ? 5 : 12}
                          placeholder="Type your answer here"
                          className="mt-5 w-full resize-y rounded-2xl border border-line bg-surface px-4 py-3 text-sm leading-relaxed text-ink transition-all placeholder:text-muted/70 hover:border-line-strong focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15"
                        />

                        <p className="mt-1 text-right text-xs text-muted tnum">
                          {a.text.length} / 10000
                        </p>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>

                <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        update(q, { markedForReview: !a.markedForReview }, 0)
                      }
                      aria-pressed={a.markedForReview}
                      className={cn(
                        a.markedForReview &&
                          "border-warn/40 bg-warn/10 text-warn hover:bg-warn/15",
                      )}
                    >
                      <motion.span
                        key={String(a.markedForReview)}
                        initial={{ scale: 0.5, rotate: -25 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={spring}
                        className="inline-flex"
                      >
                        <Flag
                          className={cn(
                            "h-4 w-4",
                            a.markedForReview && "fill-current",
                          )}
                          aria-hidden
                        />
                      </motion.span>
                      {a.markedForReview
                        ? "Marked for review"
                        : "Mark for review"}
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        update(
                          q,
                          isObjective(q)
                            ? { selectedOptionId: null }
                            : { text: "" },
                          0,
                        )
                      }
                    >
                      <Eraser className="h-4 w-4" aria-hidden />
                      Clear response
                    </Button>
                  </div>

                  <div className="hidden gap-2 lg:flex">
                    <Button
                      variant="secondary"
                      onClick={() => go(idx - 1)}
                      disabled={idx === 0}
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden />
                      Previous
                    </Button>

                    <Button
                      onClick={() => go(idx + 1)}
                      disabled={idx === total - 1}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </Card>

        <aside aria-label="Question navigator" className="hidden lg:block">
          <Card className="rounded-3xl p-5 lg:sticky lg:top-28">
            <PaletteBody
              statuses={statuses}
              idx={idx}
              counts={counts}
              onPick={go}
              prefix="desk"
              total={total}
            />

            <p className="mt-4 flex gap-2 rounded-xl bg-surface-2 p-3 text-xs text-muted">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              The timer is a guide only. The server decides when your attempt
              ends.
            </p>

            <p className="mt-3 text-center text-[0.7rem] text-muted">
              Tip: use <kbd className="rounded border border-line px-1">←</kbd>{" "}
              <kbd className="rounded border border-line px-1">→</kbd> to move
              between questions.
            </p>
          </Card>
        </aside>
      </div>

      {/* mobile / tablet: bottom action bar + palette sheet */}

      <div className="glass fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-2 border-t border-line px-4 py-3 lg:hidden">
        <Button
          variant="secondary"
          onClick={() => go(idx - 1)}
          disabled={idx === 0}
          aria-label="Previous question"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Button>

        <Button
          variant="secondary"
          onClick={() => setSheet(true)}
          className="flex-1"
        >
          <LayoutGrid className="h-4 w-4" aria-hidden />
          Questions
          <span className="text-muted tnum">
            {counts.answered + counts.review}/{total}
          </span>
        </Button>

        <Button
          onClick={() => go(idx + 1)}
          disabled={idx === total - 1}
          aria-label="Next question"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>

      <AnimatePresence>
        {sheet && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <motion.div
              className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSheet(false)}
              aria-hidden
            />

            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Question navigator"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={spring}
              className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-3xl border border-line bg-surface p-5 shadow-pop"
            >
              <button
                onClick={() => setSheet(false)}
                aria-label="Close navigator"
                className="absolute right-4 top-4 rounded-lg p-1.5 text-muted hover:bg-surface-3"
              >
                <X className="h-5 w-5" />
              </button>

              <PaletteBody
                statuses={statuses}
                idx={idx}
                counts={counts}
                onPick={(i) => {
                  go(i);
                  setSheet(false);
                }}
                prefix="sheet"
                total={total}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={!!confirm}
        title="Submit examination?"
        confirmLabel="Submit now"
        loading={submitting}
        onClose={() => setConfirm(null)}
        onConfirm={finalSubmit}
        message={
          confirm && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat n={confirm.answered} l="Answered" tone="ok" />
                <Stat n={counts.review} l="For review" tone="warn" />
                <Stat
                  n={confirm.unanswered}
                  l="Unanswered"
                  tone={confirm.unanswered ? "bad" : "muted"}
                />
              </div>

              <p>
                You have answered{" "}
                <strong className="text-ink">{confirm.answered}</strong> of{" "}
                {total} questions.
              </p>

              {confirm.unanswered > 0 && (
                <p className="text-bad">
                  {confirm.unanswered}{" "}
                  {confirm.unanswered === 1 ? "question is" : "questions are"}{" "}
                  unanswered.
                </p>
              )}

              {counts.review > 0 && (
                <p className="text-warn">
                  {counts.review}{" "}
                  {counts.review === 1 ? "question is" : "questions are"} still
                  marked for review.
                </p>
              )}

              <p>You cannot change your answers after submitting.</p>
            </div>
          )
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

// View-only helpers. None of these touch the exam engine: they just render state that ExamTake owns.

// ---------------------------------------------------------------------------------------------

const slide: Variants = {
  enter: (d: number) => ({ opacity: 0, x: d * 28 }),

  center: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.26, ease: [0.22, 1, 0.36, 1] },
  },

  exit: (d: number) => ({
    opacity: 0,
    x: -d * 28,
    transition: { duration: 0.14 },
  }),
};

function Stat({
  n,
  l,
  tone,
}: {
  n: number;
  l: string;
  tone: "ok" | "warn" | "bad" | "muted";
}) {
  const c = {
    ok: "bg-ok/10 text-ok",
    warn: "bg-warn/10 text-warn",
    bad: "bg-bad/10 text-bad",
    muted: "bg-surface-3 text-muted",
  }[tone];

  return (
    <div className={cn("rounded-xl px-2 py-3", c)}>
      <p className="text-2xl font-semibold tnum">{n}</p>
      <p className="text-[0.7rem] font-medium uppercase tracking-wide">{l}</p>
    </div>
  );
}

function SaveStatus({
  failing,
  saving,
  text,
}: {
  failing: boolean;
  saving: boolean;
  text: string;
}) {
  const state = failing ? "error" : saving ? "saving" : "saved";

  return (
    <div aria-live="polite" className="hidden text-xs sm:block">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={state}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium",
            state === "error"
              ? "bg-bad/10 text-bad"
              : state === "saving"
                ? "bg-surface-3 text-muted"
                : "text-ok",
          )}
        >
          {state === "error" ? (
            <>
              <WifiOff className="h-3.5 w-3.5" aria-hidden />
              Not saved. Retrying…
            </>
          ) : state === "saving" ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Saving…
            </>
          ) : (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              {text}
            </>
          )}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

/** Countdown: a ring that drains with the remaining time, turning amber under 5 minutes and red (pulsing) under 1. */

function TimerPill({
  ms,
  frac,
  level,
}: {
  ms: number;
  frac: number;
  level: "ok" | "low" | "critical";
}) {
  const r = 14;
  const c = 2 * Math.PI * r;

  const tone =
    level === "critical"
      ? "bg-bad/10 text-bad ring-bad/30"
      : level === "low"
        ? "bg-warn/10 text-warn ring-warn/30"
        : "bg-brand-500/10 text-brand-600 ring-brand-500/20";

  const stroke =
    level === "critical"
      ? "rgb(var(--bad))"
      : level === "low"
        ? "rgb(var(--warn))"
        : "rgb(var(--brand-500))";

  return (
    <div
      role="timer"
      aria-label="Time remaining"
      className={cn(
        "inline-flex items-center gap-2 rounded-full py-1 pl-1.5 pr-3.5 ring-1 ring-inset transition-colors duration-500",
        tone,
        level === "critical" && "animate-pulse",
      )}
    >
      <svg
        width="34"
        height="34"
        viewBox="0 0 34 34"
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx="17"
          cy="17"
          r={r}
          fill="none"
          strokeWidth="3.5"
          style={{ stroke: "currentColor", opacity: 0.18 }}
        />

        <circle
          cx="17"
          cy="17"
          r={r}
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          style={{
            stroke,
            transition: "stroke-dashoffset 0.6s linear, stroke 0.5s",
          }}
        />
      </svg>

      <span className="text-[0.95rem] font-semibold tnum">{mmss(ms)}</span>
    </div>
  );
}

const LEGEND = [
  ["ok", "Answered", "answered"],
  ["warn", "Marked for review", "review"],
  ["bad", "Unanswered", "unanswered"],
  ["muted", "Not visited", "notvisited"],
] as const;

const CELL: Record<string, string> = {
  answered: "bg-ok/15 text-ok ring-ok/30 hover:bg-ok/25",
  review: "bg-warn/15 text-warn ring-warn/30 hover:bg-warn/25",

  unanswered: "bg-bad/10 text-bad ring-bad/25 hover:bg-bad/20",
  notvisited: "bg-surface text-muted ring-line hover:bg-surface-3",
};

const DOT: Record<string, string> = {
  ok: "bg-ok/40",
  warn: "bg-warn/40",
  bad: "bg-bad/30",
  muted: "bg-surface-3 ring-1 ring-line",
};

function PaletteBody({
  statuses,
  idx,
  counts,
  onPick,
  prefix,
  total,
}: {
  statuses: string[];
  idx: number;
  counts: Record<string, number>;
  onPick: (i: number) => void;
  prefix: string;
  total: number;
}) {
  return (
    <>
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold text-ink">Questions</p>
        <p className="text-xs text-muted tnum">
          {counts.answered + counts.review} of {total} done
        </p>
      </div>

      <div className="mt-4 grid grid-cols-5 gap-2">
        {statuses.map((s, i) => (
          <button
            key={i}
            onClick={() => onPick(i)}
            aria-label={`Question ${i + 1}: ${s === "notvisited" ? "not visited" : s}`}
            aria-current={i === idx ? "true" : undefined}
            className={cn(
              "relative flex h-10 items-center justify-center rounded-xl text-sm font-semibold tnum ring-1 ring-inset transition-all duration-150 hover:-translate-y-0.5 active:scale-95",
              CELL[s],
            )}
          >
            {i === idx && (
              <motion.span
                layoutId={`pal-${prefix}`}
                transition={spring}
                className="absolute -inset-0.5 rounded-xl ring-2 ring-brand-500"
                aria-hidden
              />
            )}

            <span className="relative">{i + 1}</span>

            {s === "review" && (
              <Flag
                className="absolute -right-1 -top-1 h-3.5 w-3.5 fill-warn text-warn"
                aria-hidden
              />
            )}
          </button>
        ))}
      </div>

      <dl className="mt-5 space-y-2 text-xs text-muted">
        {LEGEND.map(([tone, l, key]) => (
          <div key={l} className="flex items-center justify-between">
            <dt className="flex items-center gap-2">
              <span className={cn("h-3 w-3 rounded", DOT[tone])} />
              {l}
            </dt>
            <dd className="font-semibold text-ink tnum">{counts[key]}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
