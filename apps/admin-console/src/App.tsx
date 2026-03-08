import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { DocumentResponse, JobSummary } from "@docgraph/api-contracts";

type Mode = "file" | "repo";

function isTerminal(state: JobSummary["state"]): boolean {
  return state === "completed" || state === "failed" || state === "partial_success";
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
  const [sourceText, setSourceText] = useState<string>("# Start here\n\nDocGraph Compiler is live.");
  const [filePath, setFilePath] = useState<string>("notes.md");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [repoOwner, setRepoOwner] = useState<string>("pytorch");
  const [repoName, setRepoName] = useState<string>("pytorch");
  const [repoRef, setRepoRef] = useState<string>("main");
  const [repoPath, setRepoPath] = useState<string>("docs");
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<DocumentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollTimerRef = useRef<number | null>(null);

  const activeJob = useMemo(
    () => jobs.find((job) => job.jobId === activeJobId) ?? null,
    [activeJobId, jobs]
  );

  useEffect(() => {
    if (!activeJobId) {
      return;
    }

    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current);
    }

    pollTimerRef.current = window.setInterval(async () => {
      const response = await fetch(`/v1/jobs/${activeJobId}`);
      if (!response.ok) {
        return;
      }

      const nextJob = (await response.json()) as JobSummary;
      setJobs((current) => [nextJob, ...current.filter((job) => job.jobId !== nextJob.jobId)]);

      if (isTerminal(nextJob.state)) {
        if (pollTimerRef.current) {
          window.clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }

        if (nextJob.documentIds[0]) {
          setSelectedDocumentId((current) => current ?? nextJob.documentIds[0] ?? null);
        }
      }
    }, 1000);

    return () => {
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [activeJobId]);

  useEffect(() => {
    if (!selectedDocumentId) {
      return;
    }

    void (async () => {
      const response = await fetch(`/v1/documents/${selectedDocumentId}`);
      if (!response.ok) {
        return;
      }
      const document = (await response.json()) as DocumentResponse;
      setSelectedDocument(document);
    })();
  }, [selectedDocumentId]);

  async function handleFileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      const path = filePath.trim();
      if (!path) {
        throw new Error("A repository-relative path is required.");
      }

      const contentBase64 = selectedFile
        ? await encodeToBase64(selectedFile)
        : btoa(unescape(encodeURIComponent(sourceText)));

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
      setActiveJobId(job.jobId);
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
      setActiveJobId(job.jobId);
      setSelectedDocumentId(null);
      setSelectedDocument(null);
    } catch (caughtError) {
      setError(String(caughtError));
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="mark">DG//</div>
        <div>
          <p className="eyebrow">DocGraph Compiler</p>
          <h1>Compiler-grade documentation ingestion with a preview surface tuned for readable technical docs.</h1>
        </div>
      </header>

      <main className="workspace-grid">
        <aside className="left-rail">
          <section className="panel">
            <div className="mode-switch">
              <button className={mode === "file" ? "active" : ""} onClick={() => setMode("file")} type="button">
                File
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
            <div className="job-list">
              {jobs.map((job) => (
                <button
                  className={`job-card ${activeJobId === job.jobId ? "active" : ""}`}
                  key={job.jobId}
                  onClick={() => setActiveJobId(job.jobId)}
                  type="button"
                >
                  <strong>{job.source?.label ?? job.jobId}</strong>
                  <span>{job.state}</span>
                  <small>
                    {job.progress.completedFiles}/{job.progress.totalFiles} compiled · {job.progress.failedFiles} failed
                  </small>
                </button>
              ))}
            </div>
          </section>
        </aside>

        <section className="preview-column">
          <div className="panel preview-panel">
            <div className="section-heading">
              <h2>{selectedDocument?.title ?? "Preview"}</h2>
              <p>{selectedDocument?.format ?? "No document selected"}</p>
            </div>
            <div
              className="preview-surface"
              dangerouslySetInnerHTML={{
                __html:
                  selectedDocument?.htmlPreview ??
                  '<article class="dg-doc"><header class="dg-doc-header"><p class="dg-doc-kicker">ready</p><h1>Select a compiled document</h1></header><p>The preview surface is tuned for readable technical content: restrained line length, clear hierarchy, and room for code, tables, and notebook outputs.</p></article>'
              }}
            />
          </div>
        </section>

        <aside className="right-rail">
          <section className="panel">
            <div className="section-heading">
              <h2>Artifacts</h2>
              <p>{activeJob?.documentIds.length ?? 0} documents</p>
            </div>
            <div className="job-list">
              {(activeJob?.documentIds ?? []).map((docId) => (
                <button
                  className={`job-card ${selectedDocumentId === docId ? "active" : ""}`}
                  key={docId}
                  onClick={() => setSelectedDocumentId(docId)}
                  type="button"
                >
                  <strong>{docId}</strong>
                  <small>{selectedDocument?.path}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="section-heading">
              <h2>On this page</h2>
              <p>{selectedDocument?.toc.length ?? 0} headings</p>
            </div>
            <ul className="toc-list">
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
              <p>{selectedDocument?.diagnostics.length ?? 0} items</p>
            </div>
            <div className="diagnostic-list">
              {(selectedDocument?.diagnostics ?? []).map((diagnostic) => (
                <div className={`diagnostic ${diagnostic.severity}`} key={diagnostic.id}>
                  <strong>{diagnostic.code}</strong>
                  <p>{diagnostic.message}</p>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
}
