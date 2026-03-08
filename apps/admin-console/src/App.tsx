import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { DocumentResponse, DocumentSummary, JobSummary } from "@docgraph/api-contracts";

type Mode = "file" | "local" | "repo";
type ReaderView = "rendered" | "markdown" | "ir" | "source";

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

const compactNumberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1
});

const integerFormatter = new Intl.NumberFormat("en-US");

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

export function App() {
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
  const pollTimerRef = useRef<number | null>(null);

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

  function activateJob(jobId: string): void {
    setActiveJobId(jobId);
    setSelectedDocumentId(null);
    setSelectedDocument(null);
    setJobDocuments([]);
    setReaderView("rendered");
  }

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
    } catch (caughtError) {
      setError(String(caughtError));
    }
  }

  return (
    <div className="app-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />
      <div className="layout-shell">
        <header className="topbar">
          <div className="mark">DG//</div>
          <div className="masthead-copy">
            <p className="eyebrow">DocGraph Compiler</p>
            <h1>Graph-native technical reading for repositories that are too large for ordinary docs tooling.</h1>
            <p className="lede">
              Import PyTorch-scale sources, normalize them into a canonical IR, and inspect rendered output, markdown export, compiler state, and original source from one reader.
            </p>
          </div>
          <div className="masthead-metrics">
            <div className="hero-chip">
              <span>Artifacts</span>
              <strong>{integerFormatter.format(libraryOverview.documents)}</strong>
            </div>
            <div className="hero-chip">
              <span>Avg compile</span>
              <strong>{formatLatency(platformOverview?.averageCompileMs ?? null)}</strong>
            </div>
            <div className="hero-chip">
              <span>Active source</span>
              <strong>{sourceKindLabel(activeJob?.source?.kind)}</strong>
            </div>
          </div>
        </header>

        <main className="workspace-grid">
        <aside className="left-rail">
          <section className="panel">
            <div className="section-heading">
              <h2>Ingest</h2>
              <p>Compiler entrypoints</p>
            </div>
            <p className="supporting-copy">
              Keep the import surface narrow and deterministic: single file payloads, local repository trees, or a remote GitHub repository snapshot.
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

            {error ? <p className="error-box">{error}</p> : null}
          </section>

          <section className="panel">
            <div className="section-heading">
              <h2>Recent jobs</h2>
              <p>{jobs.length} tracked</p>
            </div>
            <div className="job-list recent-job-list">
              {jobs.map((job) => {
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
          </section>
        </aside>

        <section className="preview-column">
          <section className="panel reader-header">
            <div className="reader-header-copy">
              <p className="eyebrow">Reader</p>
              <h2>{readerTitle}</h2>
              <p className="reader-path">{selectedDocumentEntry?.path ?? activeJob?.source?.label ?? "Awaiting import."}</p>
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

            <div className="reader-chip-row">
              <span className="reader-chip">{selectedDocument?.format ?? activeDocumentSummary?.format ?? "n/a"}</span>
              <span className={`reader-chip tone-${toneForJobState(activeJob?.state ?? "queued")}`}>{formatStateLabel(activeJob?.state ?? "queued")}</span>
              <span className={`reader-chip ${selectedDocumentIsInternal ? "tone-warning" : "tone-success"}`}>
                {selectedDocumentIsInternal ? "internal artifact" : "reader document"}
              </span>
              <span className="reader-chip">
                {selectedDocument ? `${selectedDocument.links.length} links` : `${libraryOverview.documents} docs`}
              </span>
            </div>
          </section>

          <section className="panel preview-panel">
            <div className="preview-toolbar">
              <div className="preview-heading">
                <div>
                  <h2>Document canvas</h2>
                  <p>Rendered preview, markdown export, canonical IR, and original source are available from the same normalized artifact.</p>
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
              <div className="preview-toolbar-actions">
                <div className="view-switch">
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
            </div>

            <div className="preview-body">
              <div className="preview-stage">
                {readerView === "rendered" ? (
                  <div
                    className="preview-surface"
                    dangerouslySetInnerHTML={{
                      __html:
                        selectedDocument?.htmlPreview ??
                        '<article class="dg-doc"><header class="dg-doc-header"><p class="dg-doc-kicker">ready</p><h1>Import a documentation source</h1></header><p>Use the left rail to compile a file or repository, then inspect the rendered output here with link graph, diagnostics, source fidelity, and original source fallback preserved.</p></article>'
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

        <aside className="right-rail">
          <section className="panel">
            <div className="section-heading">
              <h2>Library</h2>
              <p>
                {filteredDocuments.length}/{libraryOverview.documents} visible
              </p>
            </div>
            <p className="supporting-copy">
              {libraryOverview.readerDocuments} reader documents · {libraryOverview.internalArtifacts} internal artifacts
            </p>
            {featuredDocuments.length > 0 ? (
              <div className="featured-strip">
                {featuredDocuments.map((document) => (
                  <button
                    className="featured-chip"
                    key={document.docId}
                    onClick={() => {
                      setSelectedDocumentId(document.docId);
                      setReaderView("rendered");
                    }}
                    type="button"
                  >
                    {documentLabel(document)}
                  </button>
                ))}
              </div>
            ) : null}
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
              {filteredDocuments.map((document) => (
                <button
                  className={`job-card ${selectedDocumentId === document.docId ? "active" : ""}`}
                  key={document.docId}
                  onClick={() => {
                    setSelectedDocumentId(document.docId);
                    setReaderView("rendered");
                  }}
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
          </section>

          <section className="panel">
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

          <section className="panel">
            <div className="section-heading">
              <h2>Outline</h2>
              <p>{selectedDocument?.toc.length ?? 0} headings</p>
            </div>
            <ul className="toc-list panel-scroll">
              {(selectedDocument?.toc ?? []).map((entry) => (
                <li key={entry.slug} style={{ paddingLeft: `${(entry.level - 1) * 12}px` }}>
                  <a href={`#${entry.slug}`}>{entry.title}</a>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel">
            <div className="section-heading">
              <h2>Diagnostics</h2>
              <p>{selectedDocumentMetrics?.diagnostics ?? 0} items</p>
            </div>
            <div className="diagnostic-list panel-scroll">
              {(selectedDocument?.diagnostics ?? []).map((diagnostic) => (
                <div className={`diagnostic ${toneForDiagnosticSeverity(diagnostic.severity)}`} key={diagnostic.id}>
                  <strong>{diagnostic.code}</strong>
                  <p>{diagnostic.message}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="section-heading">
              <h2>Platform</h2>
              <p>Live metrics</p>
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
                <span>Diagnostics</span>
                <strong>{compactNumberFormatter.format(libraryOverview.diagnostics)}</strong>
              </div>
            </div>
          </section>
        </aside>
        </main>
      </div>
    </div>
  );
}
