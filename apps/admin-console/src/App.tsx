import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, MouseEvent as ReactMouseEvent } from "react";
import type { DocumentResponse, DocumentSummary, JobSummary } from "@docgraph/api-contracts";

type Mode = "file" | "local" | "repo";
type ReaderView = "rendered" | "markdown" | "ir" | "source";
type AppPage = "main" | "conversion" | "reader" | "metrics";

type CounterRecord = {
  key: string;
  value: number;
};

type HistogramRecord = {
  key: string;
  count: number;
  sum: number;
};

type HealthResponse = {
  ok: boolean;
  metrics: {
    counters: CounterRecord[];
    histograms: HistogramRecord[];
  };
};

type PaginationState = {
  page: number;
  pageSize: number;
};

type PageSectionOption = {
  id: string;
  label: string;
};

const compactNumberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1
});

const integerFormatter = new Intl.NumberFormat("en-US");

const LIBRARY_PAGE_SIZE = 8;
const JOB_PAGE_SIZE = 5;
const TOC_PAGE_SIZE = 12;
const DIAGNOSTIC_PAGE_SIZE = 6;
const PAGE_OPTIONS = [
  {
    id: "main",
    label: "Main",
    description: "Product overview and fast launch surfaces."
  },
  {
    id: "conversion",
    label: "Conversion",
    description: "Ingestion workflows and job execution."
  },
  {
    id: "reader",
    label: "Documentation",
    description: "Reader-first document browsing and preview."
  },
  {
    id: "metrics",
    label: "Metrics",
    description: "Quality evaluation and live compiler health."
  }
] as const satisfies readonly {
  id: AppPage;
  label: string;
  description: string;
}[];

const PAGE_SECTIONS = {
  main: [
    { id: "main-hero", label: "Hero" },
    { id: "main-surfaces", label: "Pages" },
    { id: "main-library", label: "Featured docs" },
    { id: "main-pulse", label: "Conversion pulse" }
  ],
  conversion: [
    { id: "conversion-top", label: "Overview" },
    { id: "conversion-entry", label: "Entry points" },
    { id: "conversion-jobs", label: "Jobs" },
    { id: "conversion-model", label: "Product split" }
  ],
  reader: [
    { id: "reader-top", label: "Overview" },
    { id: "reader-library", label: "Library" },
    { id: "reader-canvas", label: "Canvas" },
    { id: "reader-graph", label: "Graph" },
    { id: "reader-outline", label: "Outline" },
    { id: "reader-diagnostics", label: "Diagnostics" }
  ],
  metrics: [
    { id: "metrics-top", label: "Overview" },
    { id: "metrics-evaluation", label: "Evaluation" },
    { id: "metrics-platform", label: "Platform" },
    { id: "metrics-formats", label: "Format mix" },
    { id: "metrics-diagnostics", label: "Diagnostics" }
  ]
} as const satisfies Record<AppPage, readonly PageSectionOption[]>;

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

function defaultSectionId(page: AppPage): string | null {
  return PAGE_SECTIONS[page][0]?.id ?? null;
}

function isValidPageSection(page: AppPage, sectionId: string): boolean {
  return PAGE_SECTIONS[page].some((section) => section.id === sectionId);
}

function buildHash(page: AppPage, sectionId?: string | null): string {
  return sectionId ? `#${page}/${sectionId}` : `#${page}`;
}

function readRouteFromHash(hash: string): { page: AppPage; sectionId: string | null } {
  const normalized = hash.replace(/^#/u, "").trim().toLowerCase();
  const [pageCandidate = "", sectionCandidate = ""] = normalized.split("/");
  const page: AppPage =
    pageCandidate === "conversion" || pageCandidate === "reader" || pageCandidate === "metrics" ? pageCandidate : "main";
  const sectionId = isValidPageSection(page, sectionCandidate) ? sectionCandidate : null;
  return { page, sectionId };
}

function isTerminal(state: JobSummary["state"]): boolean {
  return state === "completed" || state === "failed" || state === "partial_success";
}

function formatStateLabel(state: JobSummary["state"]): string {
  return state.replaceAll("_", " ");
}

function toneForJobState(state: JobSummary["state"]): "neutral" | "success" | "warning" | "danger" {
  if (state === "completed") {
    return "success";
  }

  if (state === "failed") {
    return "danger";
  }

  if (state === "partial_success") {
    return "warning";
  }

  return "neutral";
}

function toneForDiagnosticSeverity(severity: "info" | "warning" | "error"): "neutral" | "warning" | "danger" {
  if (severity === "error") {
    return "danger";
  }

  if (severity === "warning") {
    return "warning";
  }

  return "neutral";
}

function sourceKindLabel(kind?: NonNullable<JobSummary["source"]>["kind"]): string {
  switch (kind) {
    case "file":
      return "Single file";
    case "local":
      return "Local tree";
    case "github":
      return "GitHub repo";
    default:
      return "Source";
  }
}

function pathDepth(path: string): number {
  return path.split("/").filter(Boolean).length;
}

function isInternalArtifactPath(path: string): boolean {
  return path
    .toLowerCase()
    .split("/")
    .some((segment) => segment.startsWith("_"));
}

function isLandingDocument(path: string): boolean {
  return /(?:^|\/)(?:index|readme|overview|intro(?:duction)?|getting[-_ ]started)\.[^.]+$/iu.test(path);
}

function fallbackDocumentTitle(path: string): string {
  const basename = path.split("/").at(-1) ?? path;
  const normalized = basename.replace(/\.[^.]+$/u, "").replace(/[_-]+/gu, " ").trim();
  return normalized.length > 0 ? normalized : path;
}

function documentLabel(document?: Pick<DocumentSummary, "title" | "path"> | null): string {
  if (!document) {
    return "Select a compiled document";
  }

  return document.title ?? fallbackDocumentTitle(document.path);
}

function documentRank(document: Pick<DocumentSummary, "path" | "title" | "diagnostics">): number {
  let score = 0;

  if (!isInternalArtifactPath(document.path)) {
    score += 2_000;
  }

  if (document.title) {
    score += 600;
  }

  if (isLandingDocument(document.path)) {
    score += 450;
  }

  score -= pathDepth(document.path) * 12;
  score -= document.diagnostics.length * 40;

  return score;
}

function compareDocuments(left: DocumentSummary, right: DocumentSummary): number {
  const rankDelta = documentRank(right) - documentRank(left);
  if (rankDelta !== 0) {
    return rankDelta;
  }

  const titleDelta = documentLabel(left).localeCompare(documentLabel(right));
  if (titleDelta !== 0) {
    return titleDelta;
  }

  return left.path.localeCompare(right.path);
}

function formatLatency(milliseconds: number | null): string {
  if (milliseconds === null) {
    return "No samples";
  }

  if (milliseconds < 1) {
    return `${milliseconds.toFixed(2)} ms`;
  }

  if (milliseconds < 1000) {
    return `${milliseconds.toFixed(1)} ms`;
  }

  return `${(milliseconds / 1000).toFixed(2)} s`;
}

function formatTimestamp(value?: string): string {
  if (!value) {
    return "No activity yet";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return dateTimeFormatter.format(parsed);
}

function calculateJobCompletion(job: JobSummary): number {
  const processed = job.progress.completedFiles + job.progress.failedFiles;
  return job.progress.totalFiles === 0 ? 0 : Math.round((processed / job.progress.totalFiles) * 100);
}

function sumCounters(records: readonly CounterRecord[], prefix: string): number {
  return records.reduce((total, record) => total + (record.key.startsWith(prefix) ? record.value : 0), 0);
}

function meanHistogram(records: readonly HistogramRecord[], prefix: string): number | null {
  let count = 0;
  let sum = 0;

  for (const record of records) {
    if (!record.key.startsWith(prefix)) {
      continue;
    }

    count += record.count;
    sum += record.sum;
  }

  return count === 0 ? null : sum / count;
}

function clampPage(page: number, totalItems: number, pageSize: number): number {
  return Math.min(Math.max(page, 1), Math.max(1, Math.ceil(totalItems / pageSize)));
}

function paginateItems<TItem>(items: readonly TItem[], page: number, pageSize: number): readonly TItem[] {
  const startIndex = (page - 1) * pageSize;
  return items.slice(startIndex, startIndex + pageSize);
}

function formatPaginationLabel(page: number, pageSize: number, totalItems: number): string {
  if (totalItems === 0) {
    return "0 of 0";
  }

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);
  return `${start}-${end} of ${totalItems}`;
}

function normalizeHref(href: string): string {
  const [pathWithoutQuery = ""] = href.split("?");
  return pathWithoutQuery.replace(/^\.?\//u, "").replace(/\\/gu, "/");
}

function anchorFromHref(href: string): string | null {
  const hashIndex = href.indexOf("#");
  if (hashIndex === -1) {
    return null;
  }

  const anchor = href.slice(hashIndex + 1).trim();
  return anchor.length > 0 ? anchor : null;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return 0;
  }

  return trimmed.split(/\s+/u).length;
}

function encodeTextToBase64(value: string): string {
  return btoa(unescape(encodeURIComponent(value)));
}

async function encodeToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function PaginationControls(props: {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (nextPage: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(props.totalItems / props.pageSize));

  if (props.totalItems <= props.pageSize) {
    return null;
  }

  return (
    <div className="pagination-bar">
      <span>{formatPaginationLabel(props.page, props.pageSize, props.totalItems)}</span>
      <div className="pagination-actions">
        <button disabled={props.page <= 1} onClick={() => props.onPageChange(props.page - 1)} type="button">
          Previous
        </button>
        <span>
          {props.page}/{pageCount}
        </span>
        <button disabled={props.page >= pageCount} onClick={() => props.onPageChange(props.page + 1)} type="button">
          Next
        </button>
      </div>
    </div>
  );
}

function SectionNavigation(props: {
  page: AppPage;
  activeSectionId: string | null;
  onNavigate: (page: AppPage, sectionId: string) => void;
}) {
  return (
    <nav className="local-nav" aria-label={`${props.page} sections`}>
      {PAGE_SECTIONS[props.page].map((section) => (
        <button
          className={props.activeSectionId === section.id ? "active" : ""}
          key={section.id}
          onClick={() => props.onNavigate(props.page, section.id)}
          type="button"
        >
          {section.label}
        </button>
      ))}
    </nav>
  );
}

export function App() {
  const [page, setPage] = useState<AppPage>(() => readRouteFromHash(typeof window === "undefined" ? "" : window.location.hash).page);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(() => {
    const route = readRouteFromHash(typeof window === "undefined" ? "" : window.location.hash);
    return route.sectionId ?? defaultSectionId(route.page);
  });
  const [pendingSectionId, setPendingSectionId] = useState<string | null>(() =>
    readRouteFromHash(typeof window === "undefined" ? "" : window.location.hash).sectionId
  );
  const [mode, setMode] = useState<Mode>("file");
  const [readerView, setReaderView] = useState<ReaderView>("rendered");
  const [sourceText, setSourceText] = useState<string>("# Start here\n\nDocGraph Compiler is live.");
  const [filePath, setFilePath] = useState<string>("notes.md");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [repoOwner, setRepoOwner] = useState<string>("pytorch");
  const [repoName, setRepoName] = useState<string>("pytorch");
  const [repoRef, setRepoRef] = useState<string>("main");
  const [repoPath, setRepoPath] = useState<string>("docs");
  const [localRepoRoot, setLocalRepoRoot] = useState<string>("C:\\Users\\heman\\Desktop\\code\\Docs_conversion\\_tmp_pytorch");
  const [localRepoPath, setLocalRepoPath] = useState<string>("docs/source");
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<DocumentResponse | null>(null);
  const [jobDocuments, setJobDocuments] = useState<DocumentSummary[]>([]);
  const [documentFilter, setDocumentFilter] = useState<string>("");
  const [showInternalArtifacts, setShowInternalArtifacts] = useState<boolean>(false);
  const [platformMetrics, setPlatformMetrics] = useState<HealthResponse["metrics"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null);
  const [jobPagination, setJobPagination] = useState<PaginationState>({
    page: 1,
    pageSize: JOB_PAGE_SIZE
  });
  const [libraryPagination, setLibraryPagination] = useState<PaginationState>({
    page: 1,
    pageSize: LIBRARY_PAGE_SIZE
  });
  const [tocPagination, setTocPagination] = useState<PaginationState>({
    page: 1,
    pageSize: TOC_PAGE_SIZE
  });
  const [diagnosticPagination, setDiagnosticPagination] = useState<PaginationState>({
    page: 1,
    pageSize: DIAGNOSTIC_PAGE_SIZE
  });
  const pollTimerRef = useRef<number | null>(null);
  const previewStageRef = useRef<HTMLDivElement | null>(null);

  const currentPage = useMemo(
    () => PAGE_OPTIONS.find((option) => option.id === page) ?? PAGE_OPTIONS[0],
    [page]
  );
  const currentPageSections = useMemo(() => PAGE_SECTIONS[page], [page]);
  const currentDefaultSectionId = useMemo(() => defaultSectionId(page), [page]);

  const activeJob = useMemo(
    () => jobs.find((job) => job.jobId === activeJobId) ?? null,
    [activeJobId, jobs]
  );

  const activeDocumentSummary = useMemo(
    () => jobDocuments.find((document) => document.docId === selectedDocumentId) ?? null,
    [jobDocuments, selectedDocumentId]
  );

  const rankedDocuments = useMemo(() => [...jobDocuments].sort(compareDocuments), [jobDocuments]);

  const preferredDocuments = useMemo(() => {
    const visibleDocuments = rankedDocuments.filter((document) => showInternalArtifacts || !isInternalArtifactPath(document.path));
    return visibleDocuments.length > 0 ? visibleDocuments : rankedDocuments;
  }, [rankedDocuments, showInternalArtifacts]);

  const filteredDocuments = useMemo(() => {
    const normalizedQuery = documentFilter.trim().toLowerCase();
    const documents = preferredDocuments;

    if (normalizedQuery.length === 0) {
      return documents;
    }

    return documents.filter((document) => {
      const haystack = `${document.title ?? ""} ${document.path} ${document.format}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [documentFilter, preferredDocuments]);

  const featuredDocuments = useMemo(() => preferredDocuments.slice(0, 3), [preferredDocuments]);
  const pagedJobs = useMemo(
    () => paginateItems(jobs, jobPagination.page, jobPagination.pageSize),
    [jobPagination.page, jobPagination.pageSize, jobs]
  );
  const pagedDocuments = useMemo(
    () => paginateItems(filteredDocuments, libraryPagination.page, libraryPagination.pageSize),
    [filteredDocuments, libraryPagination.page, libraryPagination.pageSize]
  );
  const pagedTocEntries = useMemo(
    () => paginateItems(selectedDocument?.toc ?? [], tocPagination.page, tocPagination.pageSize),
    [selectedDocument?.toc, tocPagination.page, tocPagination.pageSize]
  );
  const pagedDiagnostics = useMemo(
    () => paginateItems(selectedDocument?.diagnostics ?? [], diagnosticPagination.page, diagnosticPagination.pageSize),
    [diagnosticPagination.page, diagnosticPagination.pageSize, selectedDocument?.diagnostics]
  );
  const recommendedDocuments = useMemo(() => {
    if (!selectedDocument) {
      return [];
    }

    const documentIndex = new Map(jobDocuments.map((document) => [document.docId, document] as const));
    const ordered: DocumentSummary[] = [];
    const seen = new Set<string>();

    const pushDocument = (docId: string | undefined) => {
      if (!docId || docId === selectedDocument.docId || seen.has(docId)) {
        return;
      }

      const document = documentIndex.get(docId);
      if (!document) {
        return;
      }

      seen.add(docId);
      ordered.push(document);
    };

    for (const link of selectedDocument.links) {
      if (link.resolved && (link.linkType === "doc-to-doc" || link.linkType === "doc-to-anchor")) {
        pushDocument(link.dstDocId);
      }
    }

    for (const backlink of selectedDocument.backlinks) {
      pushDocument(backlink.srcDocId);
    }

    return ordered.slice(0, 6);
  }, [jobDocuments, selectedDocument]);

  const activeJobOverview = useMemo(() => {
    if (!activeJob) {
      return null;
    }

    const processed = activeJob.progress.completedFiles + activeJob.progress.failedFiles;

    return {
      completion: calculateJobCompletion(activeJob),
      processed,
      totalFiles: activeJob.progress.totalFiles,
      completedFiles: activeJob.progress.completedFiles,
      failedFiles: activeJob.progress.failedFiles
    };
  }, [activeJob]);

  const selectedDocumentMetrics = useMemo(() => {
    if (!selectedDocument) {
      return null;
    }

    const resolvedLinks = selectedDocument.links.filter((link) => link.resolved).length;
    const totalLinks = selectedDocument.links.length;
    const wordCount = countWords(selectedDocument.searchProjection.body);
    const headings = selectedDocument.searchProjection.headings.length;

    return {
      fidelityTier: selectedDocument.ir.fidelity.tier,
      wordCount,
      headings,
      blocks: selectedDocument.ir.blocks.length,
      diagnostics: selectedDocument.diagnostics.length,
      warnings: selectedDocument.ir.fidelity.warningCount,
      errors: selectedDocument.ir.fidelity.errorCount,
      rawEmbeds: selectedDocument.ir.fidelity.rawEmbedCount,
      unresolvedLinks: selectedDocument.ir.fidelity.unresolvedLinkCount,
      outgoingLinks: totalLinks,
      backlinks: selectedDocument.backlinks.length,
      resolvedLinks,
      graphIntegrity: totalLinks === 0 ? 100 : Math.round((resolvedLinks / totalLinks) * 100)
    };
  }, [selectedDocument]);

  const libraryOverview = useMemo(() => {
    const internalArtifacts = jobDocuments.filter((document) => isInternalArtifactPath(document.path)).length;

    return {
      documents: jobDocuments.length,
      diagnostics: jobDocuments.reduce((total, document) => total + document.diagnostics.length, 0),
      internalArtifacts,
      readerDocuments: Math.max(jobDocuments.length - internalArtifacts, 0)
    };
  }, [jobDocuments]);

  const selectedDocumentEntry = useMemo(
    () => selectedDocument ?? activeDocumentSummary ?? null,
    [activeDocumentSummary, selectedDocument]
  );

  const selectedDocumentIsInternal = useMemo(
    () => (selectedDocumentEntry ? isInternalArtifactPath(selectedDocumentEntry.path) : false),
    [selectedDocumentEntry]
  );

  const readerTitle = useMemo(() => documentLabel(selectedDocumentEntry), [selectedDocumentEntry]);

  const platformOverview = useMemo(() => {
    if (!platformMetrics) {
      return null;
    }

    return {
      averageCompileMs: meanHistogram(platformMetrics.histograms, "docgraph.compile.duration_ms"),
      fileImports: sumCounters(platformMetrics.counters, "docgraph.import.file.completed"),
      repoImports: sumCounters(platformMetrics.counters, "docgraph.import.repo.completed"),
      localImports: sumCounters(platformMetrics.counters, "docgraph.import.local.completed")
    };
  }, [platformMetrics]);

  const jobStateOverview = useMemo(() => {
    const summary = {
      queued: 0,
      processing: 0,
      completed: 0,
      partial: 0,
      failed: 0
    };

    for (const job of jobs) {
      if (job.state === "queued") {
        summary.queued += 1;
      } else if (
        job.state === "fetching" ||
        job.state === "parsing" ||
        job.state === "normalizing" ||
        job.state === "resolving" ||
        job.state === "projecting"
      ) {
        summary.processing += 1;
      } else if (job.state === "completed") {
        summary.completed += 1;
      } else if (job.state === "partial_success") {
        summary.partial += 1;
      } else if (job.state === "failed") {
        summary.failed += 1;
      }
    }

    const healthyJobs = summary.completed + summary.partial;
    const successRate = jobs.length === 0 ? 100 : Math.round((healthyJobs / jobs.length) * 100);

    return {
      ...summary,
      successRate
    };
  }, [jobs]);

  const formatBreakdown = useMemo(() => {
    const counts = new Map<string, number>();

    for (const document of jobDocuments) {
      counts.set(document.format, (counts.get(document.format) ?? 0) + 1);
    }

    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 6);
  }, [jobDocuments]);

  const evaluationSummary = useMemo(() => {
    if (!selectedDocumentMetrics) {
      return null;
    }

    const fidelityScore =
      selectedDocumentMetrics.fidelityTier === "A"
        ? 96
        : selectedDocumentMetrics.fidelityTier === "B"
          ? 84
          : 72;
    const sourceCoverage = Math.max(
      0,
      100 - selectedDocumentMetrics.rawEmbeds * 10 - selectedDocumentMetrics.errors * 14 - selectedDocumentMetrics.warnings * 4
    );
    const navigationScore = selectedDocumentMetrics.graphIntegrity;
    const stabilityScore = Math.max(0, 100 - selectedDocumentMetrics.diagnostics * 6);

    return {
      fidelityScore,
      sourceCoverage,
      navigationScore,
      stabilityScore
    };
  }, [selectedDocumentMetrics]);

  const diagnosticDigest = useMemo(() => {
    const severityRank = {
      error: 0,
      warning: 1,
      info: 2
    } as const;

    return jobDocuments
      .flatMap((document) =>
        document.diagnostics.map((diagnostic) => ({
          ...diagnostic,
          path: document.path,
          title: documentLabel(document)
        }))
      )
      .sort((left, right) => {
        const severityDelta = severityRank[left.severity] - severityRank[right.severity];
        if (severityDelta !== 0) {
          return severityDelta;
        }

        return left.code.localeCompare(right.code);
      })
      .slice(0, 8);
  }, [jobDocuments]);

  function activateJob(jobId: string): void {
    setActiveJobId(jobId);
    setSelectedDocumentId(null);
    setSelectedDocument(null);
    setJobDocuments([]);
    setReaderView("rendered");
    setPendingAnchor(null);
    setError(null);
  }

  function updateRoute(
    nextPage: AppPage,
    sectionId: string | null,
    historyMode: "push" | "replace" = "push",
    shouldScroll = true
  ): void {
    setPage(nextPage);
    setActiveSectionId(sectionId ?? defaultSectionId(nextPage));
    setPendingSectionId(shouldScroll ? sectionId : null);

    if (typeof window === "undefined") {
      return;
    }

    const nextHash = buildHash(nextPage, sectionId);
    if (window.location.hash !== nextHash) {
      if (historyMode === "replace") {
        window.history.replaceState(null, "", nextHash);
      } else {
        window.history.pushState(null, "", nextHash);
      }
    }
  }

  function navigateToPage(nextPage: AppPage): void {
    updateRoute(nextPage, defaultSectionId(nextPage));
  }

  function navigateToSection(nextPage: AppPage, sectionId: string): void {
    updateRoute(nextPage, sectionId);
  }

  function openDocument(docId: string, options?: { anchor?: string | null; nextPage?: AppPage }): void {
    setError(null);
    setSelectedDocumentId(docId);
    setReaderView("rendered");
    setPendingAnchor(options?.anchor ?? null);

    if (options?.nextPage) {
      updateRoute(options.nextPage, defaultSectionId(options.nextPage));
    }
  }

  function scrollToAnchor(anchor: string): void {
    const selector = `#${window.CSS?.escape?.(anchor) ?? anchor}`;
    const anchorElement = previewStageRef.current?.querySelector(selector);
    if (!(anchorElement instanceof HTMLElement)) {
      return;
    }

    anchorElement.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  function handlePreviewClick(event: ReactMouseEvent<HTMLDivElement>): void {
    const target = event.target instanceof HTMLElement ? event.target.closest("a") : null;
    if (!(target instanceof HTMLAnchorElement) || !selectedDocument) {
      return;
    }

    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    const href = target.getAttribute("href");
    if (!href) {
      return;
    }

    const hrefAnchor = anchorFromHref(href);

    if (/^(?:https?:)?\/\//u.test(href) || href.startsWith("mailto:")) {
      event.preventDefault();
      window.open(href, "_blank", "noopener,noreferrer");
      return;
    }

    if (href.startsWith("#") && hrefAnchor) {
      event.preventDefault();
      setPendingAnchor(hrefAnchor);
      return;
    }

    const matchedLink =
      selectedDocument.links.find((link) => link.hrefRaw === href) ??
      selectedDocument.links.find((link) => normalizeHref(link.hrefRaw) === normalizeHref(href));

    if (matchedLink?.resolved && matchedLink.dstDocId) {
      event.preventDefault();
      openDocument(matchedLink.dstDocId, {
        anchor: matchedLink.anchor ?? hrefAnchor,
        nextPage: "reader"
      });
      return;
    }

    if (matchedLink?.linkType === "doc-to-anchor" && (matchedLink.anchor ?? hrefAnchor)) {
      event.preventDefault();
      setPendingAnchor(matchedLink.anchor ?? hrefAnchor);
      return;
    }

    if (matchedLink?.linkType === "doc-to-asset") {
      event.preventDefault();
      setError(`Asset navigation for "${href}" is not yet available in the reader.`);
      return;
    }

    if (hrefAnchor) {
      event.preventDefault();
      setPendingAnchor(hrefAnchor);
      return;
    }

    event.preventDefault();
    setError(`Link target "${href}" is not available in the current document graph.`);
  }

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const onHashChange = () => {
      const route = readRouteFromHash(window.location.hash);
      setPage(route.page);
      setActiveSectionId(route.sectionId ?? defaultSectionId(route.page));
      setPendingSectionId(route.sectionId ?? defaultSectionId(route.page));
    };

    if (!window.location.hash) {
      window.history.replaceState(null, "", buildHash("main", defaultSectionId("main")));
    }

    window.addEventListener("hashchange", onHashChange);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);

  useEffect(() => {
    if (!currentDefaultSectionId) {
      return;
    }

    if (!activeSectionId || !isValidPageSection(page, activeSectionId)) {
      setActiveSectionId(currentDefaultSectionId);
    }
  }, [activeSectionId, currentDefaultSectionId, page]);

  useEffect(() => {
    if (!pendingSectionId || typeof window === "undefined") {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const target = document.getElementById(pendingSectionId);
      if (target instanceof HTMLElement) {
        target.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      }

      setPendingSectionId(null);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [page, pendingSectionId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const sections = currentPageSections
      .map((section) => document.getElementById(section.id))
      .filter((section): section is HTMLElement => section instanceof HTMLElement);

    if (sections.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio || left.boundingClientRect.top - right.boundingClientRect.top);

        const nextSectionId = (visibleEntries[0]?.target as HTMLElement | undefined)?.id;
        if (!nextSectionId || nextSectionId === activeSectionId) {
          return;
        }

        setActiveSectionId(nextSectionId);
        const nextHash = buildHash(page, nextSectionId);
        if (window.location.hash !== nextHash) {
          window.history.replaceState(null, "", nextHash);
        }
      },
      {
        root: null,
        rootMargin: "-140px 0px -55% 0px",
        threshold: [0.18, 0.34, 0.55]
      }
    );

    for (const section of sections) {
      observer.observe(section);
    }

    return () => {
      observer.disconnect();
    };
  }, [activeSectionId, currentPageSections, page]);

  useEffect(() => {
    if (!activeJobId) {
      return;
    }

    let cancelled = false;

    const pollJob = async () => {
      try {
        const response = await fetch(`/v1/jobs/${activeJobId}`);
        if (!response.ok || cancelled) {
          return;
        }

        const nextJob = (await response.json()) as JobSummary;
        if (cancelled) {
          return;
        }

        setJobs((current) => [nextJob, ...current.filter((job) => job.jobId !== nextJob.jobId)]);

        if (isTerminal(nextJob.state) && pollTimerRef.current) {
          window.clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
      } catch {
        return;
      }
    };

    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current);
    }

    void pollJob();
    pollTimerRef.current = window.setInterval(() => {
      void pollJob();
    }, 1000);

    return () => {
      cancelled = true;
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [activeJobId]);

  useEffect(() => {
    if (!selectedDocumentId) {
      setSelectedDocument(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(`/v1/documents/${selectedDocumentId}`);
        if (!response.ok || cancelled) {
          return;
        }

        const document = (await response.json()) as DocumentResponse;
        if (!cancelled) {
          setSelectedDocument(document);
        }
      } catch {
        return;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedDocumentId]);

  useEffect(() => {
    if (!activeJobId) {
      setJobDocuments([]);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(`/v1/jobs/${activeJobId}/documents`);
        if (!response.ok || cancelled) {
          return;
        }

        const payload = (await response.json()) as { items: DocumentSummary[] };
        if (!cancelled) {
          setJobDocuments(payload.items);
        }
      } catch {
        return;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeJobId, jobs]);

  useEffect(() => {
    if (preferredDocuments.length === 0) {
      setSelectedDocumentId(null);
      setSelectedDocument(null);
      return;
    }

    const selectedDocumentSummary = jobDocuments.find((document) => document.docId === selectedDocumentId) ?? null;
    const needsPreferredSelection =
      !selectedDocumentSummary ||
      (!showInternalArtifacts && selectedDocumentSummary && isInternalArtifactPath(selectedDocumentSummary.path));

    if (needsPreferredSelection) {
      setSelectedDocumentId(preferredDocuments[0]?.docId ?? null);
    }
  }, [jobDocuments, preferredDocuments, selectedDocumentId, showInternalArtifacts]);

  useEffect(() => {
    setLibraryPagination((current) => ({
      ...current,
      page: clampPage(current.page, filteredDocuments.length, current.pageSize)
    }));
  }, [filteredDocuments.length]);

  useEffect(() => {
    if (!selectedDocumentId) {
      return;
    }

    const selectedIndex = filteredDocuments.findIndex((document) => document.docId === selectedDocumentId);
    if (selectedIndex === -1) {
      return;
    }

    setLibraryPagination((current) => {
      const nextPage = Math.floor(selectedIndex / current.pageSize) + 1;
      return nextPage === current.page ? current : { ...current, page: nextPage };
    });
  }, [filteredDocuments, selectedDocumentId]);

  useEffect(() => {
    setJobPagination((current) => ({
      ...current,
      page: clampPage(current.page, jobs.length, current.pageSize)
    }));
  }, [jobs.length]);

  useEffect(() => {
    if (!activeJobId) {
      return;
    }

    const activeIndex = jobs.findIndex((job) => job.jobId === activeJobId);
    if (activeIndex === -1) {
      return;
    }

    setJobPagination((current) => {
      const nextPage = Math.floor(activeIndex / current.pageSize) + 1;
      return nextPage === current.page ? current : { ...current, page: nextPage };
    });
  }, [activeJobId, jobs]);

  useEffect(() => {
    setTocPagination((current) => ({
      ...current,
      page: 1
    }));
    setDiagnosticPagination((current) => ({
      ...current,
      page: 1
    }));
  }, [selectedDocumentId]);

  useEffect(() => {
    if (!pendingAnchor || readerView !== "rendered") {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      scrollToAnchor(pendingAnchor);
      setPendingAnchor(null);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [pendingAnchor, readerView, selectedDocumentId]);

  useEffect(() => {
    let cancelled = false;

    const loadMetrics = async () => {
      try {
        const response = await fetch("/v1/health");
        if (!response.ok || cancelled) {
          return;
        }

        const health = (await response.json()) as HealthResponse;
        if (!cancelled) {
          setPlatformMetrics(health.metrics);
        }
      } catch {
        return;
      }
    };

    void loadMetrics();
    const timerId = window.setInterval(() => {
      void loadMetrics();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(timerId);
    };
  }, []);

  async function handleFileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      const path = filePath.trim();
      if (!path) {
        throw new Error("A repository-relative path is required.");
      }

      const contentBase64 = selectedFile ? await encodeToBase64(selectedFile) : encodeTextToBase64(sourceText);
      const response = await fetch("/v1/import/files", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID()
        },
        body: JSON.stringify({
          path,
          contentBase64
        })
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const job = (await response.json()) as JobSummary;
      setJobs((current) => [job, ...current.filter((entry) => entry.jobId !== job.jobId)]);
      activateJob(job.jobId);
      navigateToPage("conversion");
    } catch (caughtError) {
      setError(String(caughtError));
    }
  }

  async function handleRepoSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      const response = await fetch("/v1/import/repos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID()
        },
        body: JSON.stringify({
          source: {
            provider: "github",
            owner: repoOwner,
            repo: repoName,
            ref: repoRef,
            path: repoPath || undefined
          }
        })
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const job = (await response.json()) as JobSummary;
      setJobs((current) => [job, ...current.filter((entry) => entry.jobId !== job.jobId)]);
      activateJob(job.jobId);
      navigateToPage("conversion");
    } catch (caughtError) {
      setError(String(caughtError));
    }
  }

  async function handleLocalRepoSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      const response = await fetch("/v1/import/local-repo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID()
        },
        body: JSON.stringify({
          source: {
            rootPath: localRepoRoot,
            path: localRepoPath || undefined
          },
          options: {
            followLocalLinks: true
          }
        })
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const job = (await response.json()) as JobSummary;
      setJobs((current) => [job, ...current.filter((entry) => entry.jobId !== job.jobId)]);
      activateJob(job.jobId);
      navigateToPage("conversion");
    } catch (caughtError) {
      setError(String(caughtError));
    }
  }

  return (
    <div className="app-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />
      <div className="layout-shell">
        <header className="site-header panel">
          <div className="brand-block">
            <div className="mark">DG//</div>
            <div className="brand-copy">
              <p className="eyebrow">DocGraph Compiler</p>
              <strong>Compiler-grade documentation conversion and reading.</strong>
              <span>{currentPage.description}</span>
            </div>
          </div>
          <div className="site-nav-stack">
            <nav className="page-switch" aria-label="Primary">
              {PAGE_OPTIONS.map((option) => (
                <button
                  aria-current={page === option.id ? "page" : undefined}
                  className={page === option.id ? "active" : ""}
                  key={option.id}
                  onClick={() => navigateToPage(option.id)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </nav>
            <p className="site-context">
              {integerFormatter.format(libraryOverview.documents)} artifacts · {formatLatency(platformOverview?.averageCompileMs ?? null)} mean compile ·{" "}
              {activeJob?.source?.label ?? "No active source"}
            </p>
          </div>
        </header>

        {error ? <div className="error-box site-error-banner">{error}</div> : null}

        <main className="page-shell">
          {page === "main" ? (
            <section className="page-stack">
              <section className="panel hero-panel" id="main-hero">
                <div className="hero-grid">
                  <div className="hero-copy">
                    <p className="eyebrow">Main page</p>
                    <h1>Separate conversion, reading, and evaluation into surfaces users can actually understand.</h1>
                    <p className="lede">
                      DocGraph now exposes a cleaner product flow: bring sources in on the conversion page, hand readers a focused documentation surface, and keep evaluation on its own metrics page.
                    </p>
                    <div className="hero-actions">
                      <button className="cta-primary" onClick={() => navigateToPage("conversion")} type="button">
                        Start conversion
                      </button>
                      <button className="cta-secondary" onClick={() => navigateToPage("reader")} type="button">
                        Open documentation page
                      </button>
                    </div>
                  </div>
                  <div className="hero-side">
                    <div className="hero-stat-grid">
                      <div className="hero-chip">
                        <span>Reader docs</span>
                        <strong>{integerFormatter.format(libraryOverview.readerDocuments)}</strong>
                      </div>
                      <div className="hero-chip">
                        <span>Success rate</span>
                        <strong>{jobStateOverview.successRate}%</strong>
                      </div>
                      <div className="hero-chip">
                        <span>Selected document</span>
                        <strong>{readerTitle}</strong>
                      </div>
                      <div className="hero-chip">
                        <span>Last activity</span>
                        <strong>{formatTimestamp(activeJob?.updatedAt)}</strong>
                      </div>
                    </div>
                    <div className="hero-glass">
                      <span>Active source</span>
                      <strong>{activeJob?.source?.label ?? "Load a file, local tree, or GitHub repo"}</strong>
                      <p>{activeJob ? `${calculateJobCompletion(activeJob)}% complete across ${activeJob.progress.totalFiles} files.` : "No active compilation yet."}</p>
                    </div>
                  </div>
                </div>
              </section>

              <SectionNavigation activeSectionId={activeSectionId} onNavigate={navigateToSection} page="main" />

              <section className="page-card-grid" id="main-surfaces">
                {PAGE_OPTIONS.map((option) => (
                  <button className="page-card" key={option.id} onClick={() => navigateToPage(option.id)} type="button">
                    <span className="page-card-label">{option.label}</span>
                    <strong>
                      {option.id === "main"
                        ? "Overview and launchpad"
                        : option.id === "conversion"
                          ? "Ingestion and jobs"
                          : option.id === "reader"
                            ? "Reading and navigation"
                            : "Evaluation and health"}
                    </strong>
                    <p>{option.description}</p>
                  </button>
                ))}
              </section>

              <div className="overview-grid">
                <section className="panel" id="main-library">
                  <div className="section-heading">
                    <h2>Featured documents</h2>
                    <p>{featuredDocuments.length} ready</p>
                  </div>
                  <p className="supporting-copy">
                    Promote reader-first artifacts from the active library instead of landing users inside templates or internal source fragments.
                  </p>
                  <div className="recommendation-list">
                    {featuredDocuments.map((document) => (
                      <button
                        className="recommendation-card"
                        key={document.docId}
                        onClick={() => openDocument(document.docId, { nextPage: "reader" })}
                        type="button"
                      >
                        <strong>{documentLabel(document)}</strong>
                        <span>{document.path}</span>
                      </button>
                    ))}
                    {featuredDocuments.length === 0 ? <p className="supporting-copy compact">Import a source to generate the first reader pages.</p> : null}
                  </div>
                </section>

                <section className="panel" id="main-pulse">
                  <div className="section-heading">
                    <h2>Conversion pulse</h2>
                    <p>{jobs.length} tracked</p>
                  </div>
                  <div className="mini-metric-grid">
                    <div className="mini-metric-card">
                      <span>Processing</span>
                      <strong>{jobStateOverview.processing}</strong>
                    </div>
                    <div className="mini-metric-card">
                      <span>Completed</span>
                      <strong>{jobStateOverview.completed}</strong>
                    </div>
                    <div className="mini-metric-card">
                      <span>Partial</span>
                      <strong>{jobStateOverview.partial}</strong>
                    </div>
                    <div className="mini-metric-card">
                      <span>Failed</span>
                      <strong>{jobStateOverview.failed}</strong>
                    </div>
                  </div>
                  <div className="job-list recent-job-list">
                    {pagedJobs.slice(0, 3).map((job) => (
                      <button
                        className={`job-card ${activeJobId === job.jobId ? "active" : ""}`}
                        key={job.jobId}
                        onClick={() => {
                          activateJob(job.jobId);
                          navigateToPage("conversion");
                        }}
                        type="button"
                      >
                        <div className="job-card-header">
                          <strong>{job.source?.label ?? job.jobId}</strong>
                          <span className={`status-pill ${toneForJobState(job.state)}`}>{formatStateLabel(job.state)}</span>
                        </div>
                        <span>{sourceKindLabel(job.source?.kind)}</span>
                        <small>{formatTimestamp(job.updatedAt)}</small>
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            </section>
          ) : null}

          {page === "conversion" ? (
            <section className="page-stack">
              <section className="panel page-intro-panel" id="conversion-top">
                <div className="page-title-row">
                  <div className="page-title-copy">
                    <p className="eyebrow">Conversion page</p>
                    <h1>Keep ingestion on its own page with deterministic entry points and visible job state.</h1>
                    <p className="supporting-copy">
                      Import a file, a local repository tree, or a GitHub snapshot without mixing conversion controls into the documentation reader.
                    </p>
                    <div className="hero-actions">
                      <button className="cta-primary" onClick={() => navigateToPage("reader")} type="button">
                        Open documentation page
                      </button>
                      <button className="cta-secondary" onClick={() => navigateToPage("metrics")} type="button">
                        Open metrics page
                      </button>
                    </div>
                  </div>
                  <div className="summary-pill-row">
                    <span className="reader-chip">Queued {jobStateOverview.queued}</span>
                    <span className="reader-chip tone-success">Completed {jobStateOverview.completed}</span>
                    <span className="reader-chip tone-warning">Partial {jobStateOverview.partial}</span>
                    <span className="reader-chip tone-danger">Failed {jobStateOverview.failed}</span>
                  </div>
                </div>
              </section>

              <SectionNavigation activeSectionId={activeSectionId} onNavigate={navigateToSection} page="conversion" />

              <div className="conversion-grid">
                <section className="panel" id="conversion-entry">
                  <div className="section-heading">
                    <h2>Conversion entrypoints</h2>
                    <p>File, local, or GitHub</p>
                  </div>
                  <p className="supporting-copy">
                    Narrow import surfaces keep parsing deterministic and make failures visible at the source boundary.
                  </p>

                  <div className="mode-switch">
                    <button className={mode === "file" ? "active" : ""} onClick={() => setMode("file")} type="button">
                      File
                    </button>
                    <button className={mode === "local" ? "active" : ""} onClick={() => setMode("local")} type="button">
                      Local
                    </button>
                    <button className={mode === "repo" ? "active" : ""} onClick={() => setMode("repo")} type="button">
                      GitHub
                    </button>
                  </div>

                  {mode === "file" ? (
                    <form onSubmit={handleFileSubmit} className="form-stack">
                      <label>
                        <span>Path</span>
                        <input value={filePath} onChange={(event) => setFilePath(event.target.value)} />
                      </label>
                      <label>
                        <span>Upload file</span>
                        <input
                          type="file"
                          onChange={(event) => {
                            const file = event.target.files?.[0] ?? null;
                            setSelectedFile(file);
                            if (file) {
                              setFilePath(file.name);
                            }
                          }}
                        />
                      </label>
                      <label>
                        <span>Or paste source</span>
                        <textarea value={sourceText} onChange={(event) => setSourceText(event.target.value)} rows={12} />
                      </label>
                      <button type="submit">Compile source</button>
                    </form>
                  ) : mode === "local" ? (
                    <form onSubmit={handleLocalRepoSubmit} className="form-stack">
                      <label>
                        <span>Repository root</span>
                        <input value={localRepoRoot} onChange={(event) => setLocalRepoRoot(event.target.value)} />
                      </label>
                      <label>
                        <span>Import path</span>
                        <input value={localRepoPath} onChange={(event) => setLocalRepoPath(event.target.value)} />
                      </label>
                      <button type="submit">Import local docs tree</button>
                    </form>
                  ) : (
                    <form onSubmit={handleRepoSubmit} className="form-stack">
                      <label>
                        <span>Owner</span>
                        <input value={repoOwner} onChange={(event) => setRepoOwner(event.target.value)} />
                      </label>
                      <label>
                        <span>Repository</span>
                        <input value={repoName} onChange={(event) => setRepoName(event.target.value)} />
                      </label>
                      <label>
                        <span>Ref</span>
                        <input value={repoRef} onChange={(event) => setRepoRef(event.target.value)} />
                      </label>
                      <label>
                        <span>Path filter</span>
                        <input value={repoPath} onChange={(event) => setRepoPath(event.target.value)} />
                      </label>
                      <button type="submit">Import repository</button>
                    </form>
                  )}
                </section>

                <div className="page-side-stack">
                  <section className="panel" id="conversion-jobs">
                    <div className="section-heading">
                      <h2>Recent jobs</h2>
                      <p>{jobs.length} tracked</p>
                    </div>
                    <div className="job-list recent-job-list">
                      {pagedJobs.map((job) => {
                        const completion = calculateJobCompletion(job);
                        const tone = toneForJobState(job.state);

                        return (
                          <button
                            className={`job-card ${activeJobId === job.jobId ? "active" : ""}`}
                            key={job.jobId}
                            onClick={() => activateJob(job.jobId)}
                            type="button"
                          >
                            <div className="job-card-header">
                              <strong>{job.source?.label ?? job.jobId}</strong>
                              <span className={`status-pill ${tone}`}>{formatStateLabel(job.state)}</span>
                            </div>
                            <span>{sourceKindLabel(job.source?.kind)}</span>
                            <div className="progress-track" aria-hidden="true">
                              <span style={{ width: `${completion}%` }} />
                            </div>
                            <small>
                              {job.progress.completedFiles}/{job.progress.totalFiles} compiled · {job.progress.failedFiles} failed
                            </small>
                          </button>
                        );
                      })}
                    </div>
                    <PaginationControls
                      page={jobPagination.page}
                      pageSize={jobPagination.pageSize}
                      totalItems={jobs.length}
                      onPageChange={(nextPage) => setJobPagination((current) => ({ ...current, page: nextPage }))}
                    />
                  </section>

                  <section className="panel" id="conversion-model">
                    <div className="section-heading">
                      <h2>Recommended split</h2>
                      <p>Clear user lanes</p>
                    </div>
                    <div className="lane-grid">
                      <div className="lane-card">
                        <strong>Main page</strong>
                        <p>Entry point, launch actions, and system snapshot.</p>
                      </div>
                      <div className="lane-card">
                        <strong>Conversion page</strong>
                        <p>Source import forms and job progress only.</p>
                      </div>
                      <div className="lane-card">
                        <strong>Documentation page</strong>
                        <p>Reader, library, outline, and reading recommendations.</p>
                      </div>
                      <div className="lane-card">
                        <strong>Metrics page</strong>
                        <p>Fidelity, graph quality, diagnostics, and operational analysis.</p>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </section>
          ) : null}

          {page === "reader" ? (
            <section className="page-stack">
              <section className="panel reader-page-intro" id="reader-top">
                <div className="page-title-row">
                  <div className="page-title-copy">
                    <p className="eyebrow">Documentation page</p>
                    <h1>{readerTitle}</h1>
                    <p className="supporting-copy">
                      A dedicated reading surface with document preview, library navigation, outline, diagnostics, and continuation paths separated from import controls.
                    </p>
                    <p className="reader-path">{selectedDocumentEntry?.path ?? activeJob?.source?.label ?? "Awaiting import."}</p>
                    <div className="hero-actions">
                      <button className="cta-primary" onClick={() => navigateToPage("conversion")} type="button">
                        Go to conversion page
                      </button>
                      <button className="cta-secondary" onClick={() => navigateToPage("metrics")} type="button">
                        Inspect metrics
                      </button>
                    </div>
                  </div>
                  <div className="summary-pill-row">
                    <span className="reader-chip">{selectedDocument?.format ?? activeDocumentSummary?.format ?? "n/a"}</span>
                    <span className={`reader-chip tone-${toneForJobState(activeJob?.state ?? "queued")}`}>{formatStateLabel(activeJob?.state ?? "queued")}</span>
                    <span className={`reader-chip ${selectedDocumentIsInternal ? "tone-warning" : "tone-success"}`}>
                      {selectedDocumentIsInternal ? "internal artifact" : "reader document"}
                    </span>
                  </div>
                </div>
              </section>

              <SectionNavigation activeSectionId={activeSectionId} onNavigate={navigateToSection} page="reader" />

              <div className="reader-page-grid">
                <aside className="page-side-stack">
                  <section className="panel" id="reader-library">
                    <div className="section-heading">
                      <h2>Library</h2>
                      <p>
                        {filteredDocuments.length}/{libraryOverview.documents} visible
                      </p>
                    </div>
                    <p className="supporting-copy">
                      {libraryOverview.readerDocuments} reader documents · {libraryOverview.internalArtifacts} internal artifacts
                    </p>
                    <label className="document-filter">
                      <span>Filter</span>
                      <input
                        value={documentFilter}
                        onChange={(event) => setDocumentFilter(event.target.value)}
                        placeholder="Search title, path, or format"
                      />
                    </label>
                    <label className="toggle-control">
                      <input
                        checked={showInternalArtifacts}
                        onChange={(event) => setShowInternalArtifacts(event.target.checked)}
                        type="checkbox"
                      />
                      <span>Show internal artifacts and templates</span>
                    </label>
                    <div className="job-list artifact-list">
                      {pagedDocuments.map((document) => (
                        <button
                          className={`job-card ${selectedDocumentId === document.docId ? "active" : ""}`}
                          key={document.docId}
                          onClick={() => openDocument(document.docId, { nextPage: "reader" })}
                          type="button"
                        >
                          <div className="job-card-header">
                            <strong>{documentLabel(document)}</strong>
                            <div className="card-badge-row">
                              <span className="status-pill neutral">{document.format}</span>
                              <span className={`status-pill ${isInternalArtifactPath(document.path) ? "warning" : "success"}`}>
                                {isInternalArtifactPath(document.path) ? "internal" : "reader"}
                              </span>
                            </div>
                          </div>
                          <span>{document.path}</span>
                          <small>
                            {document.diagnostics.length} diagnostics · {document.canonicalHash.slice(0, 10)}
                          </small>
                        </button>
                      ))}
                    </div>
                    <PaginationControls
                      page={libraryPagination.page}
                      pageSize={libraryPagination.pageSize}
                      totalItems={filteredDocuments.length}
                      onPageChange={(nextPage) => setLibraryPagination((current) => ({ ...current, page: nextPage }))}
                    />
                  </section>

                  <section className="panel">
                    <div className="section-heading">
                      <h2>Continue reading</h2>
                      <p>{recommendedDocuments.length} suggestions</p>
                    </div>
                    <p className="supporting-copy">Resolved graph neighbors and backlinks around the current document.</p>
                    <div className="recommendation-list">
                      {recommendedDocuments.map((document) => (
                        <button
                          className="recommendation-card"
                          key={document.docId}
                          onClick={() => openDocument(document.docId, { nextPage: "reader" })}
                          type="button"
                        >
                          <strong>{documentLabel(document)}</strong>
                          <span>{document.path}</span>
                        </button>
                      ))}
                      {recommendedDocuments.length === 0 ? <p className="supporting-copy compact">No resolved adjacent documents yet.</p> : null}
                    </div>
                  </section>
                </aside>

                <section className="preview-column">
                  <section className="panel reader-header">
                    <div className="reader-header-copy">
                      <p className="eyebrow">Document state</p>
                      <h2>Reading analysis</h2>
                      <p className="supporting-copy compact">
                        Reader fidelity, graph integrity, and compile progress are kept above the canvas so the document body stays uninterrupted.
                      </p>
                    </div>

                    <div className="metric-grid">
                      <div className="metric-card">
                        <span>Fidelity</span>
                        <strong>{selectedDocumentMetrics?.fidelityTier ?? "A-"}</strong>
                      </div>
                      <div className="metric-card">
                        <span>Words</span>
                        <strong>{selectedDocumentMetrics ? compactNumberFormatter.format(selectedDocumentMetrics.wordCount) : "0"}</strong>
                      </div>
                      <div className="metric-card">
                        <span>Graph integrity</span>
                        <strong>{selectedDocumentMetrics ? `${selectedDocumentMetrics.graphIntegrity}%` : "0%"}</strong>
                      </div>
                      <div className="metric-card">
                        <span>Job progress</span>
                        <strong>{activeJobOverview ? `${activeJobOverview.completion}%` : "0%"}</strong>
                      </div>
                    </div>
                  </section>

                  <section className="panel preview-panel" id="reader-canvas">
                    <div className="preview-toolbar">
                      <div className="preview-heading">
                        <div>
                          <h2>Document canvas</h2>
                          <p>Rendered preview, markdown export, canonical IR, and original source stay on the same artifact without pushing users back into ingestion mode.</p>
                        </div>
                      </div>
                      <div className="preview-toolbar-actions">
                        <div className="view-switch" role="tablist" aria-label="Document views">
                          <button
                            className={readerView === "rendered" ? "active" : ""}
                            onClick={() => setReaderView("rendered")}
                            type="button"
                          >
                            Rendered
                          </button>
                          <button
                            className={readerView === "markdown" ? "active" : ""}
                            onClick={() => setReaderView("markdown")}
                            type="button"
                          >
                            Markdown
                          </button>
                          <button
                            className={readerView === "ir" ? "active" : ""}
                            onClick={() => setReaderView("ir")}
                            type="button"
                          >
                            Canonical IR
                          </button>
                          <button
                            className={readerView === "source" ? "active" : ""}
                            onClick={() => setReaderView("source")}
                            type="button"
                          >
                            Source
                          </button>
                        </div>
                      </div>
                      <div className="preview-meta-grid">
                        <div className="preview-meta-card">
                          <span>Format</span>
                          <strong>{selectedDocument?.format ?? activeDocumentSummary?.format ?? "n/a"}</strong>
                        </div>
                        <div className="preview-meta-card">
                          <span>Headings</span>
                          <strong>{selectedDocumentMetrics?.headings ?? 0}</strong>
                        </div>
                        <div className="preview-meta-card">
                          <span>Blocks</span>
                          <strong>{selectedDocumentMetrics?.blocks ?? 0}</strong>
                        </div>
                        <div className="preview-meta-card">
                          <span>Diagnostics</span>
                          <strong>{selectedDocumentMetrics?.diagnostics ?? 0}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="preview-body">
                      <div className="preview-stage" ref={previewStageRef}>
                        {readerView === "rendered" ? (
                          <div
                            className="preview-surface"
                            onClick={handlePreviewClick}
                            dangerouslySetInnerHTML={{
                              __html:
                                selectedDocument?.htmlPreview ??
                                '<article class="dg-doc"><header class="dg-doc-header"><p class="dg-doc-kicker">ready</p><h1>Import a documentation source</h1></header><p>Use the conversion page to compile a file or repository, then inspect the normalized output here with graph context, diagnostics, and original source fallback preserved.</p></article>'
                            }}
                          />
                        ) : (
                          <pre className="code-pane">
                            <code>
                              {readerView === "markdown"
                                ? selectedDocument?.markdownPreview ?? ""
                                : readerView === "source"
                                  ? selectedDocument?.sourcePreview ?? "Source preview unavailable for this artifact."
                                  : selectedDocument?.jsonPreview ?? ""}
                            </code>
                          </pre>
                        )}
                      </div>
                    </div>
                  </section>
                </section>

                <aside className="page-side-stack">
                  <section className="panel" id="reader-graph">
                    <div className="section-heading">
                      <h2>Graph</h2>
                      <p>{selectedDocumentMetrics?.graphIntegrity ?? 0}% resolved</p>
                    </div>
                    <div className="mini-metric-grid">
                      <div className="mini-metric-card">
                        <span>Outgoing</span>
                        <strong>{selectedDocumentMetrics?.outgoingLinks ?? 0}</strong>
                      </div>
                      <div className="mini-metric-card">
                        <span>Backlinks</span>
                        <strong>{selectedDocumentMetrics?.backlinks ?? 0}</strong>
                      </div>
                      <div className="mini-metric-card">
                        <span>Resolved</span>
                        <strong>{selectedDocumentMetrics?.resolvedLinks ?? 0}</strong>
                      </div>
                      <div className="mini-metric-card">
                        <span>Raw embeds</span>
                        <strong>{selectedDocumentMetrics?.rawEmbeds ?? 0}</strong>
                      </div>
                      <div className="mini-metric-card">
                        <span>Warnings</span>
                        <strong>{selectedDocumentMetrics?.warnings ?? 0}</strong>
                      </div>
                      <div className="mini-metric-card">
                        <span>Errors</span>
                        <strong>{selectedDocumentMetrics?.errors ?? 0}</strong>
                      </div>
                    </div>
                  </section>

                  <section className="panel" id="reader-outline">
                    <div className="section-heading">
                      <h2>Outline</h2>
                      <p>{selectedDocument?.toc.length ?? 0} headings</p>
                    </div>
                    <ul className="toc-list panel-scroll">
                      {pagedTocEntries.map((entry) => (
                        <li key={entry.slug} style={{ paddingLeft: `${(entry.level - 1) * 12}px` }}>
                          <button
                            className="toc-button"
                            onClick={() => {
                              setReaderView("rendered");
                              setPendingAnchor(entry.slug);
                            }}
                            type="button"
                          >
                            {entry.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                    <PaginationControls
                      page={tocPagination.page}
                      pageSize={tocPagination.pageSize}
                      totalItems={selectedDocument?.toc.length ?? 0}
                      onPageChange={(nextPage) => setTocPagination((current) => ({ ...current, page: nextPage }))}
                    />
                  </section>

                  <section className="panel" id="reader-diagnostics">
                    <div className="section-heading">
                      <h2>Diagnostics</h2>
                      <p>{selectedDocumentMetrics?.diagnostics ?? 0} items</p>
                    </div>
                    <div className="diagnostic-list panel-scroll">
                      {pagedDiagnostics.map((diagnostic) => (
                        <div className={`diagnostic ${toneForDiagnosticSeverity(diagnostic.severity)}`} key={diagnostic.id}>
                          <strong>{diagnostic.code}</strong>
                          <p>{diagnostic.message}</p>
                        </div>
                      ))}
                    </div>
                    <PaginationControls
                      page={diagnosticPagination.page}
                      pageSize={diagnosticPagination.pageSize}
                      totalItems={selectedDocument?.diagnostics.length ?? 0}
                      onPageChange={(nextPage) => setDiagnosticPagination((current) => ({ ...current, page: nextPage }))}
                    />
                  </section>
                </aside>
              </div>
            </section>
          ) : null}

          {page === "metrics" ? (
            <section className="page-stack">
              <section className="panel page-intro-panel" id="metrics-top">
                <div className="page-title-row">
                  <div className="page-title-copy">
                    <p className="eyebrow">Metrics page</p>
                    <h1>Evaluation, fidelity, and live compiler analysis stay separate from the reading surface.</h1>
                    <p className="supporting-copy">
                      Track platform throughput, document quality, graph integrity, and diagnostics without crowding the documentation page.
                    </p>
                    <div className="hero-actions">
                      <button className="cta-primary" onClick={() => navigateToPage("reader")} type="button">
                        Open documentation page
                      </button>
                      <button className="cta-secondary" onClick={() => navigateToPage("conversion")} type="button">
                        Start another conversion
                      </button>
                    </div>
                  </div>
                  <div className="summary-pill-row">
                    <span className="reader-chip">Docs {libraryOverview.documents}</span>
                    <span className="reader-chip tone-success">Healthy {jobStateOverview.successRate}%</span>
                    <span className="reader-chip tone-warning">Diagnostics {libraryOverview.diagnostics}</span>
                  </div>
                </div>
              </section>

              <SectionNavigation activeSectionId={activeSectionId} onNavigate={navigateToSection} page="metrics" />

              <div className="metrics-page-grid">
                <section className="panel" id="metrics-evaluation">
                  <div className="section-heading">
                    <h2>Document evaluation</h2>
                    <p>{readerTitle}</p>
                  </div>
                  <div className="metric-grid">
                    <div className="metric-card">
                      <span>Fidelity score</span>
                      <strong>{evaluationSummary?.fidelityScore ?? 0}</strong>
                    </div>
                    <div className="metric-card">
                      <span>Source coverage</span>
                      <strong>{evaluationSummary?.sourceCoverage ?? 0}%</strong>
                    </div>
                    <div className="metric-card">
                      <span>Navigation score</span>
                      <strong>{evaluationSummary?.navigationScore ?? 0}%</strong>
                    </div>
                    <div className="metric-card">
                      <span>Stability score</span>
                      <strong>{evaluationSummary?.stabilityScore ?? 0}%</strong>
                    </div>
                  </div>
                  <p className="supporting-copy">
                    Scores are derived from canonical fidelity tier, unresolved graph edges, raw embeds, and diagnostic pressure on the selected document.
                  </p>
                </section>

                <section className="panel" id="metrics-platform">
                  <div className="section-heading">
                    <h2>Platform health</h2>
                    <p>Live ingestion signals</p>
                  </div>
                  <div className="mini-metric-grid">
                    <div className="mini-metric-card">
                      <span>File imports</span>
                      <strong>{compactNumberFormatter.format(platformOverview?.fileImports ?? 0)}</strong>
                    </div>
                    <div className="mini-metric-card">
                      <span>Repo imports</span>
                      <strong>{compactNumberFormatter.format(platformOverview?.repoImports ?? 0)}</strong>
                    </div>
                    <div className="mini-metric-card">
                      <span>Local imports</span>
                      <strong>{compactNumberFormatter.format(platformOverview?.localImports ?? 0)}</strong>
                    </div>
                    <div className="mini-metric-card">
                      <span>Compile mean</span>
                      <strong>{formatLatency(platformOverview?.averageCompileMs ?? null)}</strong>
                    </div>
                    <div className="mini-metric-card">
                      <span>Processed</span>
                      <strong>{activeJobOverview ? integerFormatter.format(activeJobOverview.processed) : "0"}</strong>
                    </div>
                    <div className="mini-metric-card">
                      <span>Reader docs</span>
                      <strong>{integerFormatter.format(libraryOverview.readerDocuments)}</strong>
                    </div>
                  </div>
                </section>

                <section className="panel" id="metrics-formats">
                  <div className="section-heading">
                    <h2>Format mix</h2>
                    <p>{formatBreakdown.length} tracked formats</p>
                  </div>
                  <div className="lane-grid">
                    {formatBreakdown.map(([format, count]) => (
                      <div className="lane-card" key={format}>
                        <strong>{format}</strong>
                        <p>{integerFormatter.format(count)} documents</p>
                      </div>
                    ))}
                    {formatBreakdown.length === 0 ? <p className="supporting-copy compact">No compiled documents available yet.</p> : null}
                  </div>
                </section>

                <section className="panel" id="metrics-diagnostics">
                  <div className="section-heading">
                    <h2>Diagnostic feed</h2>
                    <p>{diagnosticDigest.length} surfaced</p>
                  </div>
                  <div className="diagnostic-list panel-scroll">
                    {diagnosticDigest.map((diagnostic) => (
                      <div className={`diagnostic ${toneForDiagnosticSeverity(diagnostic.severity)}`} key={`${diagnostic.path}:${diagnostic.id}`}>
                        <strong>{diagnostic.code}</strong>
                        <p>{diagnostic.message}</p>
                        <small>{diagnostic.path}</small>
                      </div>
                    ))}
                    {diagnosticDigest.length === 0 ? <p className="supporting-copy compact">No diagnostics in the current library.</p> : null}
                  </div>
                </section>
              </div>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}
