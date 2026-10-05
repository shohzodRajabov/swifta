"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Expand, Hand, Minus, MousePointer2, Pentagon, Plus, Search, Spline, Square, MapPin, MessageSquareWarning, Maximize } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Badge, Button, Input, Select, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { TaskSummary } from "@/server/drawings/drawings";
import { addDrawingRemark, deleteZone, reviewZones, saveZone, type ZoneGeometry } from "../actions";

export type ViewerZone = { id: string; page: number; name: string; geometry: ZoneGeometry; locationId: string | null; needsReview: boolean; taskIds: string[] };
export type ViewerRemark = { id: string; number: number; page: number; x: number; y: number; description: string; status: string; priority: string };
type Opt = { id: string; name: string };
type TaskOpt = { id: string; number: number; title: string; status: string };

type Mode = "select" | "pan" | "POINT" | "LINE" | "RECT" | "POLYGON" | "remark";

const TONE = { none: "#94a3b8", idle: "#64748b", work: "#3b82f6", check: "#f59e0b", done: "#22c55e", bad: "#ef4444" } as const;
type Tone = keyof typeof TONE;

/** One color for a zone with several tasks: problems first, then "all approved", then checking, then in work. */
export function zoneTone(tasks: TaskSummary[]): Tone {
  if (tasks.length === 0) return "none";
  const s = tasks.map((t) => t.status);
  if (s.some((x) => ["REWORK", "REJECTED", "BLOCKED"].includes(x))) return "bad";
  const live = s.filter((x) => x !== "CANCELLED");
  if (live.length && live.every((x) => x === "APPROVED")) return "done";
  if (live.some((x) => ["COMPLETED", "INSPECTION"].includes(x)) && !live.some((x) => ["NEW", "ASSIGNED"].includes(x))) return "check";
  if (live.some((x) => ["IN_PROGRESS", "ACCEPTED", "COMPLETED", "INSPECTION", "APPROVED"].includes(x)) || tasks.some((t) => t.percent > 0)) return "work";
  return "idle";
}

export function DrawingViewer(props: {
  fileUrl: string;
  versionId: string;
  isLatest: boolean;
  needsReview: boolean;
  initialPage: number;
  focusZoneId: string | null;
  zones: ViewerZone[];
  tasks: Record<string, TaskSummary>;
  taskOptions: TaskOpt[];
  remarks: ViewerRemark[];
  locations: Opt[];
  users: Opt[];
  canEdit: boolean;
  canRemark: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState(props.initialPage);
  const [zoom, setZoom] = useState(1);
  const [base, setBase] = useState<{ w: number; h: number } | null>(null);
  const [fit, setFit] = useState(1);
  const [mode, setMode] = useState<Mode>("select");
  const [draft, setDraft] = useState<[number, number][]>([]);
  const [drag, setDrag] = useState<{ x: number; y: number; x2: number; y2: number } | null>(null);
  const [shape, setShape] = useState<ZoneGeometry | null>(null);
  const [selected, setSelected] = useState<string | null>(props.focusZoneId);
  const [selectedRemark, setSelectedRemark] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [remarkAt, setRemarkAt] = useState<{ x: number; y: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<number[] | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ x: number; y: number; l: number; t: number } | null>(null);
  const textCache = useRef<Map<number, string>>(new Map());

  // ---- load the PDF (worker served from /public) ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const d = await pdfjs.getDocument({ url: props.fileUrl, withCredentials: true }).promise;
        if (!cancelled) {
          setDoc(d);
          setPage((p) => Math.min(Math.max(1, p), d.numPages));
        }
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.fileUrl]);

  // ---- render the current page ----
  useEffect(() => {
    if (!doc) return;
    let task: { cancel: () => void } | null = null;
    let cancelled = false;
    (async () => {
      const p = await doc.getPage(page);
      const vp1 = p.getViewport({ scale: 1 });
      const box = scrollRef.current?.clientWidth ?? 900;
      const f = Math.max(0.2, (box - 24) / vp1.width);
      if (cancelled) return;
      setBase({ w: vp1.width, h: vp1.height });
      setFit(f);
      const scale = f * zoom;
      const vp = p.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(vp.width * dpr);
      canvas.height = Math.floor(vp.height * dpr);
      canvas.style.width = `${vp.width}px`;
      canvas.style.height = `${vp.height}px`;
      const ctx = canvas.getContext("2d")!;
      const r = p.render({ canvasContext: ctx, canvas, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
      task = r;
      await r.promise.catch(() => undefined);
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, page, zoom]);

  const W = base ? base.w * fit * zoom : 0;
  const H = base ? base.h * fit * zoom : 0;
  const pageZones = props.zones.filter((z) => z.page === page);
  const pageRemarks = props.remarks.filter((r) => r.page === page);
  const zone = props.zones.find((z) => z.id === selected) ?? null;
  const remark = props.remarks.find((r) => r.id === selectedRemark) ?? null;

  // Focus a zone given in the URL (Task → "Show on drawing").
  useEffect(() => {
    if (!props.focusZoneId || !W) return;
    const z = props.zones.find((x) => x.id === props.focusZoneId);
    if (!z || z.page !== page) return;
    const c = center(z.geometry);
    scrollRef.current?.scrollTo({ left: c[0] * W - (scrollRef.current.clientWidth / 2), top: c[1] * H - 200, behavior: "smooth" });
  }, [props.focusZoneId, props.zones, page, W, H]);

  const rel = useCallback((e: React.PointerEvent | React.MouseEvent): [number, number] => {
    const r = frameRef.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  }, []);

  const resetDraw = () => {
    setDraft([]);
    setDrag(null);
    setShape(null);
    setRemarkAt(null);
    setEditing(false);
    setError(null);
  };

  const finishPoly = () => {
    if (mode === "LINE" && draft.length >= 2) setShape({ kind: "LINE", points: draft });
    if (mode === "POLYGON" && draft.length >= 3) setShape({ kind: "POLYGON", points: draft });
    setDraft([]);
  };

  // ---- pointer handling on the drawing ----
  const onDown = (e: React.PointerEvent) => {
    if (mode === "pan" || (mode === "select" && e.button === 1)) {
      panRef.current = { x: e.clientX, y: e.clientY, l: scrollRef.current!.scrollLeft, t: scrollRef.current!.scrollTop };
      return;
    }
    if (mode === "RECT" && !shape) {
      const [x, y] = rel(e);
      setDrag({ x, y, x2: x, y2: y });
      (e.target as Element).setPointerCapture?.(e.pointerId);
    }
  };
  const onMove = (e: React.PointerEvent) => {
    if (panRef.current) {
      scrollRef.current!.scrollLeft = panRef.current.l - (e.clientX - panRef.current.x);
      scrollRef.current!.scrollTop = panRef.current.t - (e.clientY - panRef.current.y);
      return;
    }
    if (drag) {
      const [x2, y2] = rel(e);
      setDrag({ ...drag, x2, y2 });
    }
  };
  const onUp = () => {
    panRef.current = null;
    if (drag) {
      const x = Math.min(drag.x, drag.x2);
      const y = Math.min(drag.y, drag.y2);
      const w = Math.abs(drag.x2 - drag.x);
      const h = Math.abs(drag.y2 - drag.y);
      setDrag(null);
      if (w > 0.005 && h > 0.005) setShape({ kind: "RECT", x, y, w, h });
    }
  };
  const onClick = (e: React.MouseEvent) => {
    if (shape) return;
    const [x, y] = rel(e);
    if (mode === "POINT") setShape({ kind: "POINT", x, y });
    if (mode === "LINE" || mode === "POLYGON") setDraft((d) => [...d, [x, y]]);
    if (mode === "remark") setRemarkAt({ x, y });
    if (mode === "select") {
      setSelected(null);
      setSelectedRemark(null);
    }
  };

  // ---- zoom (buttons + ctrl/⌘ + wheel) ----
  const zoomBy = (k: number) => setZoom((z) => Math.min(6, Math.max(0.25, Math.round(z * k * 100) / 100)));
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => Math.min(6, Math.max(0.25, Math.round(z * (e.deltaY < 0 ? 1.15 : 1 / 1.15) * 100) / 100)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ---- text search across pages ----
  const search = async () => {
    if (!doc || !query.trim()) return setHits(null);
    const q = query.trim().toLowerCase();
    const found: number[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      let text = textCache.current.get(i);
      if (text === undefined) {
        const c = await (await doc.getPage(i)).getTextContent();
        text = c.items.map((it) => ("str" in it ? it.str : "")).join(" ").toLowerCase();
        textCache.current.set(i, text);
      }
      if (text.includes(q)) found.push(i);
    }
    setHits(found);
    if (found.length) setPage(found[0]);
  };

  const fullscreen = () => {
    const el = document.getElementById("drawing-shell");
    if (!document.fullscreenElement) el?.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  const run = (p: Promise<{ ok?: boolean; error?: string } | null>, after?: () => void) =>
    start(async () => {
      const r = await p;
      if (r?.error) setError(r.error);
      else {
        after?.();
        router.refresh();
      }
    });

  const tools: { m: Mode; icon: React.ReactNode; label: string; show: boolean }[] = [
    { m: "select", icon: <MousePointer2 className="size-4" />, label: t("drawings.toolSelect"), show: true },
    { m: "pan", icon: <Hand className="size-4" />, label: t("drawings.toolPan"), show: true },
    { m: "POINT", icon: <MapPin className="size-4" />, label: t("drawings.toolPoint"), show: props.canEdit && props.isLatest },
    { m: "LINE", icon: <Spline className="size-4" />, label: t("drawings.toolLine"), show: props.canEdit && props.isLatest },
    { m: "RECT", icon: <Square className="size-4" />, label: t("drawings.toolRect"), show: props.canEdit && props.isLatest },
    { m: "POLYGON", icon: <Pentagon className="size-4" />, label: t("drawings.toolPolygon"), show: props.canEdit && props.isLatest },
    { m: "remark", icon: <MessageSquareWarning className="size-4" />, label: t("drawings.toolRemark"), show: props.canRemark },
  ];
  const numPages = doc?.numPages ?? 1;
  const reviewCount = props.zones.filter((z) => z.needsReview).length;

  return (
    <div id="drawing-shell" className="flex flex-col gap-3 bg-bg lg:flex-row">
      <div className="min-w-0 flex-1">
        {/* toolbar */}
        <div className="mb-2 flex flex-wrap items-center gap-1 rounded-xl border border-border bg-surface p-1.5">
          {tools
            .filter((x) => x.show)
            .map((x) => (
              <button
                key={x.m}
                type="button"
                title={x.label}
                aria-label={x.label}
                onClick={() => {
                  resetDraw();
                  setMode(x.m);
                }}
                className={cn("flex h-8 items-center gap-1 rounded-lg px-2 text-xs", mode === x.m ? "bg-primary text-primary-fg" : "text-muted hover:bg-surface-2 hover:text-text")}
              >
                {x.icon}
                <span className="hidden xl:inline">{x.label}</span>
              </button>
            ))}
          <span className="mx-1 h-6 w-px bg-border" />
          <button type="button" onClick={() => zoomBy(1 / 1.25)} className="rounded-lg p-1.5 text-muted hover:bg-surface-2" aria-label="zoom out">
            <Minus className="size-4" />
          </button>
          <button type="button" onClick={() => setZoom(1)} className="num w-12 rounded-lg py-1 text-center text-xs hover:bg-surface-2" title={t("drawings.fit")}>
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" onClick={() => zoomBy(1.25)} className="rounded-lg p-1.5 text-muted hover:bg-surface-2" aria-label="zoom in">
            <Plus className="size-4" />
          </button>
          <span className="mx-1 h-6 w-px bg-border" />
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 disabled:opacity-40" aria-label="prev">
            <ChevronLeft className="size-4" />
          </button>
          <span className="num text-xs">
            {page} / {numPages}
          </span>
          <button type="button" disabled={page >= numPages} onClick={() => setPage(page + 1)} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 disabled:opacity-40" aria-label="next">
            <ChevronRight className="size-4" />
          </button>
          <span className="mx-1 h-6 w-px bg-border" />
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
          >
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("drawings.searchText")} className="h-8 w-36 text-xs" />
            <button type="submit" className="rounded-lg p-1.5 text-muted hover:bg-surface-2" aria-label={t("common.search")}>
              <Search className="size-4" />
            </button>
          </form>
          {hits && (
            <span className="flex items-center gap-1 text-xs text-muted">
              {hits.length === 0
                ? t("drawings.notFound")
                : hits.map((h) => (
                    <button key={h} type="button" onClick={() => setPage(h)} className={cn("rounded px-1.5", h === page ? "bg-primary-soft text-primary" : "hover:bg-surface-2")}>
                      {h}
                    </button>
                  ))}
            </span>
          )}
          <button type="button" onClick={fullscreen} className="ml-auto rounded-lg p-1.5 text-muted hover:bg-surface-2" title={t("drawings.fullscreen")} aria-label={t("drawings.fullscreen")}>
            <Maximize className="size-4" />
          </button>
        </div>

        {(mode === "LINE" || mode === "POLYGON") && !shape && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-primary-soft px-3 py-1.5 text-xs text-primary">
            {t("drawings.polyHint", { n: String(draft.length) })}
            <Button type="button" className="h-7 text-xs" disabled={draft.length < (mode === "LINE" ? 2 : 3)} onClick={finishPoly}>
              {t("drawings.finishShape")}
            </Button>
            <Button type="button" variant="ghost" className="h-7 text-xs" onClick={() => setDraft([])}>
              {t("common.reset")}
            </Button>
          </div>
        )}
        {mode === "remark" && !remarkAt && <div className="mb-2 rounded-lg bg-warning-soft px-3 py-1.5 text-xs text-warning">{t("drawings.remarkHint")}</div>}
        {(mode === "POINT" || mode === "RECT") && !shape && <div className="mb-2 rounded-lg bg-primary-soft px-3 py-1.5 text-xs text-primary">{t(mode === "POINT" ? "drawings.pointHint" : "drawings.rectHint")}</div>}

        {/* canvas + overlay */}
        <div ref={scrollRef} className="relative h-[70vh] select-none overflow-auto rounded-xl border border-border bg-surface-2/60 p-3">
          {loadError && <div className="p-10 text-center text-sm text-danger">{t("drawings.loadError")}</div>}
          {!doc && !loadError && <div className="p-10 text-center text-sm text-muted">{t("drawings.loading")}</div>}
          <div ref={frameRef} className="relative mx-auto bg-white shadow" style={{ width: W || undefined, height: H || undefined }}>
            <canvas ref={canvasRef} className="block" />
            {W > 0 && (
              <svg
                width={W}
                height={H}
                className={cn("absolute inset-0", mode === "pan" ? "cursor-grab" : mode === "select" ? "cursor-default" : "cursor-crosshair")}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onClick={onClick}
                onDoubleClick={() => (mode === "LINE" || mode === "POLYGON") && finishPoly()}
              >
                {pageZones.map((z) => {
                  const ts = z.taskIds.map((id) => props.tasks[id]).filter(Boolean);
                  const tone = zoneTone(ts);
                  const pct = ts.length ? Math.round(ts.reduce((s, x) => s + x.percent, 0) / ts.length) : 0;
                  return (
                    <ZoneShape
                      key={z.id}
                      g={z.geometry}
                      W={W}
                      H={H}
                      color={TONE[tone]}
                      progress={pct}
                      label={`${z.name}${ts.length ? ` · ${pct}%` : ""}`}
                      active={z.id === selected}
                      review={z.needsReview}
                      onClick={(e) => {
                        if (mode !== "select" && mode !== "pan") return;
                        e.stopPropagation();
                        setSelected(z.id);
                        setSelectedRemark(null);
                        setEditing(false);
                      }}
                    />
                  );
                })}
                {pageRemarks.map((r) => (
                  <g
                    key={r.id}
                    transform={`translate(${r.x * W} ${r.y * H})`}
                    className="cursor-pointer"
                    onClick={(e) => {
                      if (mode !== "select" && mode !== "pan") return;
                      e.stopPropagation();
                      setSelectedRemark(r.id);
                      setSelected(null);
                    }}
                  >
                    <path d="M0 0 C -9 -12 -9 -24 0 -24 C 9 -24 9 -12 0 0 Z" fill={r.status === "ACCEPTED" ? TONE.done : r.status === "FIXED" ? TONE.check : TONE.bad} stroke="white" strokeWidth={1.5} />
                    <text y={-13} textAnchor="middle" fontSize={9} fontWeight={700} fill="white">
                      {r.number}
                    </text>
                  </g>
                ))}
                {/* drafts */}
                {drag && <rect x={Math.min(drag.x, drag.x2) * W} y={Math.min(drag.y, drag.y2) * H} width={Math.abs(drag.x2 - drag.x) * W} height={Math.abs(drag.y2 - drag.y) * H} fill="#3b82f633" stroke="#3b82f6" strokeDasharray="4 3" />}
                {draft.length > 0 && (
                  <polyline points={draft.map(([x, y]) => `${x * W},${y * H}`).join(" ")} fill={mode === "POLYGON" ? "#3b82f622" : "none"} stroke="#3b82f6" strokeWidth={2} strokeDasharray="4 3" />
                )}
                {draft.map(([x, y], i) => (
                  <circle key={i} cx={x * W} cy={y * H} r={3.5} fill="#3b82f6" />
                ))}
                {shape && <ZoneShape g={shape} W={W} H={H} color="#3b82f6" progress={0} label="" active review={false} />}
                {remarkAt && <circle cx={remarkAt.x * W} cy={remarkAt.y * H} r={7} fill={TONE.bad} stroke="white" strokeWidth={2} />}
              </svg>
            )}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
          {(["idle", "work", "check", "done", "bad", "none"] as Tone[]).map((k) => (
            <span key={k} className="flex items-center gap-1">
              <span className="size-2.5 rounded-sm" style={{ background: TONE[k] }} />
              {t(`drawings.tone_${k}`)}
            </span>
          ))}
        </div>
      </div>

      {/* side panel */}
      <aside className="w-full shrink-0 lg:w-96">
        <div className="sticky top-4 flex flex-col gap-3">
          {props.needsReview && props.isLatest && reviewCount > 0 && (
            <div className="rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm text-warning">
              <div className="font-medium">{t("drawings.reviewBanner")}</div>
              <div className="mt-1 text-xs">{t("drawings.reviewCount", { n: String(reviewCount) })}</div>
              {props.canEdit && (
                <Button type="button" variant="secondary" className="mt-2 h-8 text-xs" disabled={pending} onClick={() => run(reviewZones(props.versionId, null))}>
                  {t("drawings.reviewAll")}
                </Button>
              )}
            </div>
          )}
          {error && <div className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{t(`errors.${error}`)}</div>}

          {(shape || (editing && zone)) && (
            <ZoneForm
              key={zone?.id ?? "new"}
              zone={editing ? zone : null}
              shape={shape ?? zone!.geometry}
              page={editing && zone ? zone.page : page}
              tasks={props.taskOptions}
              locations={props.locations}
              pending={pending}
              onCancel={resetDraw}
              onSave={(v) =>
                run(
                  saveZone({ id: editing && zone ? zone.id : null, versionId: props.versionId, page: editing && zone ? zone.page : page, geometry: shape ?? zone!.geometry, ...v }),
                  () => {
                    resetDraw();
                    setMode("select");
                  },
                )
              }
            />
          )}

          {remarkAt && (
            <RemarkForm
              users={props.users}
              tasks={props.taskOptions}
              locations={props.locations}
              pending={pending}
              onCancel={resetDraw}
              onSave={(v) =>
                run(addDrawingRemark({ versionId: props.versionId, page, x: remarkAt.x, y: remarkAt.y, ...v }), () => {
                  resetDraw();
                  setMode("select");
                })
              }
            />
          )}

          {zone && !editing && !shape && (
            <div className="rounded-xl border border-border bg-surface">
              <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
                <div>
                  <div className="font-semibold">{zone.name}</div>
                  <div className="text-xs text-muted">
                    {t(`drawings.kind_${zone.geometry.kind}`)} · {t("drawings.page", { n: String(zone.page) })}
                    {zone.locationId && ` · ${props.locations.find((l) => l.id === zone.locationId)?.name ?? ""}`}
                  </div>
                </div>
                {zone.needsReview && <Badge tone="warning">{t("drawings.needsReview")}</Badge>}
              </div>
              <div className="divide-y divide-border">
                {zone.taskIds.length === 0 && <p className="px-4 py-3 text-sm text-muted">{t("drawings.noTasks")}</p>}
                {zone.taskIds
                  .map((id) => props.tasks[id])
                  .filter(Boolean)
                  .map((ts) => (
                    <div key={ts.id} className="px-4 py-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <Link href={`/tasks/${ts.id}`} className="font-medium hover:text-primary">
                          <span className="num text-muted">T-{ts.number}</span> {ts.title}
                        </Link>
                        <span className="num text-xs font-semibold" style={{ color: TONE[zoneTone([ts])] }}>
                          {ts.percent}%
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full rounded-full" style={{ width: `${ts.percent}%`, background: TONE[zoneTone([ts])] }} />
                      </div>
                      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                        <dt className="text-muted">{t("common.status")}</dt>
                        <dd>{t(`taskStatus.${ts.status}`)}</dd>
                        <dt className="text-muted">{t("tasks.responsible")}</dt>
                        <dd>{ts.responsible ?? "—"}</dd>
                        <dt className="text-muted">{t("tasks.performers")}</dt>
                        <dd>{ts.performers.join(", ") || "—"}</dd>
                        <dt className="text-muted">{t("tasks.deadline")}</dt>
                        <dd className="num">{ts.deadline ?? "—"}</dd>
                        <dt className="text-muted">{t("common.quantity")}</dt>
                        <dd className="num">
                          {Math.round(ts.doneQty * 100) / 100} / {ts.plannedQty ?? "—"} {ts.unit ?? ""}
                        </dd>
                        <dt className="text-muted">{t("tasks.inspections")}</dt>
                        <dd>{ts.inspections.length ? ts.inspections.map((i) => (i.result === "PASSED" ? "✓" : "✕")).join(" ") : "—"}</dd>
                        <dt className="text-muted">{t("remarks.title")}</dt>
                        <dd className={ts.openRemarks ? "text-danger" : ""}>{ts.openRemarks}</dd>
                        <dt className="text-muted">{t("attachments.title")}</dt>
                        <dd>{ts.photos}</dd>
                      </dl>
                    </div>
                  ))}
              </div>
              {props.canEdit && props.isLatest && (
                <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
                  <Button type="button" variant="secondary" className="h-8 text-xs" onClick={() => setEditing(true)}>
                    {t("common.edit")}
                  </Button>
                  {zone.needsReview && (
                    <Button type="button" variant="secondary" className="h-8 text-xs" disabled={pending} onClick={() => run(reviewZones(props.versionId, zone.id))}>
                      {t("drawings.reviewed")}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="danger"
                    className="h-8 text-xs"
                    disabled={pending}
                    onClick={() => {
                      if (confirm(t("common.confirmDelete"))) run(deleteZone(zone.id), () => setSelected(null));
                    }}
                  >
                    {t("common.delete")}
                  </Button>
                </div>
              )}
            </div>
          )}

          {remark && (
            <div className="rounded-xl border border-border bg-surface p-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <Link href={`/remarks/${remark.id}`} className="font-semibold hover:text-primary">
                  #{remark.number} {t("remarks.remark")}
                </Link>
                <Badge tone={remark.status === "ACCEPTED" ? "success" : remark.status === "FIXED" ? "warning" : "danger"}>{t(`remarkStatus.${remark.status}`)}</Badge>
              </div>
              <p className="mt-2 whitespace-pre-line">{remark.description}</p>
              <Link href={`/remarks/${remark.id}`} className="mt-2 inline-block text-xs text-primary">
                {t("common.open")} →
              </Link>
            </div>
          )}

          {!zone && !remark && !shape && !remarkAt && (
            <div className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
              <p>{t("drawings.sideHint")}</p>
              <ul className="mt-3 space-y-1">
                {props.zones.map((z) => {
                  const ts = z.taskIds.map((id) => props.tasks[id]).filter(Boolean);
                  return (
                    <li key={z.id}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-surface-2"
                        onClick={() => {
                          setPage(z.page);
                          setSelected(z.id);
                        }}
                      >
                        <span className="size-2.5 shrink-0 rounded-sm" style={{ background: TONE[zoneTone(ts)] }} />
                        <span className="flex-1 truncate text-text">{z.name}</span>
                        {z.needsReview && <Expand className="size-3 text-warning" />}
                        <span className="num text-xs">p.{z.page}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function center(g: ZoneGeometry): [number, number] {
  if (g.kind === "POINT") return [g.x, g.y];
  if (g.kind === "RECT") return [g.x + g.w / 2, g.y + g.h / 2];
  const xs = g.points.map((p) => p[0]);
  const ys = g.points.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

function ZoneShape({
  g,
  W,
  H,
  color,
  progress,
  label,
  active,
  review,
  onClick,
}: {
  g: ZoneGeometry;
  W: number;
  H: number;
  color: string;
  progress: number;
  label: string;
  active: boolean;
  review: boolean;
  onClick?: (e: React.MouseEvent) => void;
}) {
  const stroke = { stroke: color, strokeWidth: active ? 3 : 2, strokeDasharray: review ? "6 4" : undefined };
  const [cx, cy] = center(g);
  return (
    <g onClick={onClick} className={onClick ? "cursor-pointer" : undefined}>
      {g.kind === "POINT" && <circle cx={g.x * W} cy={g.y * H} r={active ? 9 : 7} fill={color} fillOpacity={0.85} stroke="white" strokeWidth={2} />}
      {g.kind === "RECT" && (
        <>
          <rect x={g.x * W} y={g.y * H} width={g.w * W} height={g.h * H} fill={color} fillOpacity={0.12} {...stroke} />
          {/* visual progress: the done share of the zone is filled */}
          <rect x={g.x * W} y={g.y * H} width={(g.w * W * progress) / 100} height={g.h * H} fill={color} fillOpacity={0.28} pointerEvents="none" />
        </>
      )}
      {g.kind === "LINE" && (
        <>
          <polyline points={g.points.map(([x, y]) => `${x * W},${y * H}`).join(" ")} fill="none" stroke="transparent" strokeWidth={14} />
          <polyline points={g.points.map(([x, y]) => `${x * W},${y * H}`).join(" ")} fill="none" {...stroke} strokeWidth={active ? 5 : 4} strokeLinecap="round" />
        </>
      )}
      {g.kind === "POLYGON" && <polygon points={g.points.map(([x, y]) => `${x * W},${y * H}`).join(" ")} fill={color} fillOpacity={0.12 + (progress / 100) * 0.25} {...stroke} />}
      {label && (
        <text x={cx * W} y={cy * H + (g.kind === "POINT" ? -12 : 4)} textAnchor="middle" fontSize={11} fontWeight={600} fill="#0f172a" stroke="white" strokeWidth={3} paintOrder="stroke" pointerEvents="none">
          {label}
        </text>
      )}
    </g>
  );
}

function TaskPicker({ tasks, value, onChange }: { tasks: TaskOpt[]; value: string[]; onChange: (v: string[]) => void }) {
  const t = useTranslations();
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return tasks.filter((x) => !s || x.title.toLowerCase().includes(s) || String(x.number).includes(s));
  }, [q, tasks]);
  return (
    <div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("tasks.searchPlaceholder")} className="mb-1 h-8 text-xs" />
      <div className="max-h-48 overflow-y-auto rounded-lg border border-border p-1">
        {list.map((x) => (
          <label key={x.id} className="flex items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-surface-2">
            <input type="checkbox" checked={value.includes(x.id)} onChange={(e) => onChange(e.target.checked ? [...value, x.id] : value.filter((v) => v !== x.id))} />
            <span className="num text-muted">T-{x.number}</span>
            <span className="truncate">{x.title}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function ZoneForm({
  zone,
  shape,
  page,
  tasks,
  locations,
  pending,
  onCancel,
  onSave,
}: {
  zone: ViewerZone | null;
  shape: ZoneGeometry;
  page: number;
  tasks: TaskOpt[];
  locations: Opt[];
  pending: boolean;
  onCancel: () => void;
  onSave: (v: { name: string; taskIds: string[]; locationId: string | null }) => void;
}) {
  const t = useTranslations();
  const [name, setName] = useState(zone?.name ?? "");
  const [taskIds, setTaskIds] = useState<string[]>(zone?.taskIds ?? []);
  const [locationId, setLocationId] = useState(zone?.locationId ?? "");
  return (
    <div className="rounded-xl border border-primary/40 bg-surface p-4">
      <div className="mb-3 text-sm font-semibold">
        {zone ? t("drawings.editZone") : t("drawings.newZone")} · {t(`drawings.kind_${shape.kind}`)} · {t("drawings.page", { n: String(page) })}
      </div>
      <div className="flex flex-col gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("drawings.zoneName")} autoFocus />
        <Select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="text-xs">
          <option value="">{t("tasks.location")}: —</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
        <div className="text-xs font-medium">{t("drawings.linkTasks")}</div>
        <TaskPicker tasks={tasks} value={taskIds} onChange={setTaskIds} />
        <div className="mt-1 flex gap-2">
          <Button type="button" disabled={pending || !name.trim()} onClick={() => onSave({ name: name.trim(), taskIds, locationId: locationId || null })}>
            {pending ? t("common.saving") : t("common.save")}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function RemarkForm({
  users,
  tasks,
  locations,
  pending,
  onCancel,
  onSave,
}: {
  users: Opt[];
  tasks: TaskOpt[];
  locations: Opt[];
  pending: boolean;
  onCancel: () => void;
  onSave: (v: { description: string; priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; responsibleUserId: string | null; deadline: string | null; taskId: string | null; locationId: string | null }) => void;
}) {
  const t = useTranslations();
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">("MEDIUM");
  const [responsible, setResponsible] = useState("");
  const [deadline, setDeadline] = useState("");
  const [taskId, setTaskId] = useState("");
  const [locationId, setLocationId] = useState("");
  return (
    <div className="rounded-xl border border-danger/40 bg-surface p-4">
      <div className="mb-3 text-sm font-semibold">{t("drawings.newRemark")}</div>
      <div className="flex flex-col gap-2">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("remarks.description")} autoFocus className="min-h-16" />
        <div className="grid grid-cols-2 gap-2">
          <Select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} className="text-xs">
            {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const).map((p) => (
              <option key={p} value={p}>
                {t(`priority.${p}`)}
              </option>
            ))}
          </Select>
          <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="text-xs" />
        </div>
        <Select value={responsible} onChange={(e) => setResponsible(e.target.value)} className="text-xs">
          <option value="">{t("remarks.responsible")}: —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
        <Select value={taskId} onChange={(e) => setTaskId(e.target.value)} className="text-xs">
          <option value="">{t("tasks.task")}: —</option>
          {tasks.map((x) => (
            <option key={x.id} value={x.id}>
              T-{x.number} {x.title}
            </option>
          ))}
        </Select>
        <Select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="text-xs">
          <option value="">{t("tasks.location")}: —</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
        <p className="text-xs text-muted">{t("drawings.remarkPhotoHint")}</p>
        <div className="flex gap-2">
          <Button
            type="button"
            disabled={pending || !description.trim()}
            onClick={() => onSave({ description: description.trim(), priority, responsibleUserId: responsible || null, deadline: deadline || null, taskId: taskId || null, locationId: locationId || null })}
          >
            {pending ? t("common.saving") : t("common.save")}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        </div>
      </div>
    </div>
  );
}
