import { randomUUID } from "node:crypto";
import type { ImportFileRequest, ImportRepoRequest } from "@docgraph/api-contracts";
import { isTerminalJobState } from "@docgraph/api-contracts";
import { attachDiagnostics, replaceLinkGraph } from "@docgraph/core-ir";
import { AdapterRegistry, type ParseContext, type SourceAdapter, type SourceDescriptor } from "@docgraph/core-ir";
import { makeAssetId, makeDiagnosticId, SUPPORTED_EXTENSIONS, type AssetRef, type Diagnostic, type LinkRef } from "@docgraph/core-types";
import { createLogger, MetricsRegistry, type CounterRecord, type HistogramRecord, type Logger } from "@docgraph/observability";
import { DocxAdapter } from "@docgraph/parser-docx";
import { HtmlAdapter } from "@docgraph/parser-html";
import { IpynbAdapter } from "@docgraph/parser-ipynb";
import { MarkdownAdapter } from "@docgraph/parser-md";
import { MdxAdapter } from "@docgraph/parser-mdx";
import { RdxAdapter } from "@docgraph/parser-rdx";
import { buildBacklinkIndex, buildTableOfContents } from "@docgraph/projection-navigation";
import { buildSearchDocument } from "@docgraph/projection-search";
import { renderHtml } from "@docgraph/renderer-html";
import { renderJson } from "@docgraph/renderer-json";
import { renderMarkdown } from "@docgraph/renderer-markdown";
import { assertSafeRepoPath, assertWithinFileSizeLimit, resolveRelativeRepoPath } from "@docgraph/security";
import { createSourceDescriptor } from "@docgraph/source-sniffer";
import { GitHubRepositoryClient } from "./github-client.js";
import { InMemoryCompilerStore } from "./store.js";
import type { CompilerJobRecord, CompiledDocumentRecord } from "./types.js";

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function splitHref(href: string): { path: string; anchor?: string } {
  const [pathWithoutQuery = ""] = href.split("?");
  const [path = "", anchor] = pathWithoutQuery.split("#");
  return {
    path,
    ...(anchor ? { anchor } : {})
  };
}

async function runWithConcurrency<TItem>(
  items: readonly TItem[],
  concurrency: number,
  worker: (item: TItem) => Promise<void>
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(concurrency, queue.length || 1) }, async () => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) {
        break;
      }

      await worker(next);
    }
  });

  await Promise.all(workers);
}

function createDefaultAdapters(): SourceAdapter[] {
  return [new MarkdownAdapter(), new MdxAdapter(), new DocxAdapter(), new IpynbAdapter(), new RdxAdapter(), new HtmlAdapter()];
}

export class DocGraphCompiler {
  private readonly registry: AdapterRegistry;
  private readonly store: InMemoryCompilerStore;
  private readonly githubClient: GitHubRepositoryClient;
  private readonly logger: Logger;
  private readonly metrics: MetricsRegistry;

  constructor(
    options: {
      adapters?: readonly SourceAdapter[];
      store?: InMemoryCompilerStore;
      githubClient?: GitHubRepositoryClient;
      logger?: Logger;
      metrics?: MetricsRegistry;
    } = {}
  ) {
    this.registry = new AdapterRegistry();
    this.registry.registerMany(options.adapters ?? createDefaultAdapters());
    this.store = options.store ?? new InMemoryCompilerStore();
    const githubClientOptions = {
      ...(process.env.GITHUB_TOKEN ? { token: process.env.GITHUB_TOKEN } : {}),
      ...(process.env.GITHUB_API_BASE_URL ? { apiBaseUrl: process.env.GITHUB_API_BASE_URL } : {})
    };
    this.githubClient =
      options.githubClient ??
      new GitHubRepositoryClient(githubClientOptions);
    this.logger = options.logger ?? createLogger("docgraph.compiler");
    this.metrics = options.metrics ?? new MetricsRegistry();
  }

  scheduleFileImport(request: ImportFileRequest, idempotencyKey?: string): CompilerJobRecord {
    if (idempotencyKey) {
      const existing = this.store.getJobByIdempotencyKey(idempotencyKey);
      if (existing) {
        return existing;
      }
    }

    const job = this.store.createJob(
      {
        kind: "file",
        label: request.path
      },
      idempotencyKey
    );
    this.store.updateJob(job.jobId, {
      progress: {
        totalFiles: 1,
        completedFiles: 0,
        failedFiles: 0
      }
    });

    queueMicrotask(() => {
      void this.runFileImport(job.jobId, request);
    });

    return this.getJobOrThrow(job.jobId);
  }

  scheduleRepoImport(request: ImportRepoRequest, idempotencyKey?: string): CompilerJobRecord {
    if (idempotencyKey) {
      const existing = this.store.getJobByIdempotencyKey(idempotencyKey);
      if (existing) {
        return existing;
      }
    }

    const job = this.store.createJob(
      {
        kind: "github",
        label: `${request.source.owner}/${request.source.repo}@${request.source.ref ?? "main"}`
      },
      idempotencyKey
    );

    queueMicrotask(() => {
      void this.runRepoImport(job.jobId, request);
    });

    return this.getJobOrThrow(job.jobId);
  }

  getJob(jobId: string): CompilerJobRecord | null {
    return this.store.getJob(jobId);
  }

  getDocument(docId: string): CompiledDocumentRecord | null {
    return this.store.getDocument(docId);
  }

  getOutgoingLinks(docId: string): LinkRef[] {
    return this.store.getDocument(docId)?.links ?? [];
  }

  getBacklinks(docId: string): LinkRef[] {
    return this.store.getDocument(docId)?.backlinks ?? [];
  }

  getMetricsSnapshot(): {
    counters: CounterRecord[];
    histograms: HistogramRecord[];
  } {
    return this.metrics.snapshot();
  }

  async waitForJob(jobId: string, timeoutMs = 15_000): Promise<CompilerJobRecord> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const job = this.getJob(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} was not found.`);
      }

      if (isTerminalJobState(job.state)) {
        return job;
      }

      await sleep(25);
    }

    throw new Error(`Timed out while waiting for job ${jobId}.`);
  }

  private getJobOrThrow(jobId: string): CompilerJobRecord {
    const job = this.store.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} was not found.`);
    }
    return job;
  }

  private async runFileImport(jobId: string, request: ImportFileRequest): Promise<void> {
    try {
      this.store.updateJob(jobId, { state: "parsing" });
      const bytes = Buffer.from(request.contentBase64, "base64");
      const document = await this.compileDocument({
        path: assertSafeRepoPath(request.path),
        bytes
      });
      this.store.attachDocument(jobId, document.docId);
      this.store.updateJob(jobId, {
        state: "completed",
        progress: {
          totalFiles: 1,
          completedFiles: 1,
          failedFiles: 0
        }
      });
      this.metrics.increment("docgraph.import.file.completed");
    } catch (error) {
      this.logger.error({ message: "File import failed", error: String(error), jobId });
      this.store.updateJob(jobId, {
        state: "failed",
        error: {
          code: "FILE_IMPORT_FAILED",
          message: String(error)
        },
        progress: {
          totalFiles: 1,
          completedFiles: 0,
          failedFiles: 1
        }
      });
    }
  }

  private async runRepoImport(jobId: string, request: ImportRepoRequest): Promise<void> {
    try {
      this.store.updateJob(jobId, { state: "fetching" });
      const includeExtensions = request.options?.includeExtensions ?? [...SUPPORTED_EXTENSIONS];
      const listing = await this.githubClient.listRepositoryFiles(
        request.source.owner,
        request.source.repo,
        request.source.ref ?? "main",
        request.source.path,
        includeExtensions
      );

      this.store.updateJob(jobId, {
        progress: {
          totalFiles: listing.files.length,
          completedFiles: 0,
          failedFiles: 0
        },
        state: "parsing"
      });

      const repoKey = `${request.source.owner}/${request.source.repo}@${listing.commitSha}`;

      await runWithConcurrency(listing.files, 4, async (file) => {
        try {
          const bytes = await this.githubClient.fetchFile(
            request.source.owner,
            request.source.repo,
            listing.commitSha,
            file.path
          );
          const document = await this.compileDocument({
            path: file.path,
            bytes,
            repoKey,
            repoContext: {
              owner: request.source.owner,
              repo: request.source.repo,
              ref: request.source.ref ?? "main",
              commitSha: listing.commitSha,
              basePath: request.source.path ?? ""
            }
          });
          this.store.attachDocument(jobId, document.docId);
          const current = this.getJobOrThrow(jobId);
          this.store.updateJob(jobId, {
            progress: {
              ...current.progress,
              completedFiles: current.progress.completedFiles + 1
            }
          });
        } catch (error) {
          const current = this.getJobOrThrow(jobId);
          this.logger.warn({ message: "Repository file compilation failed", path: file.path, error: String(error) });
          this.store.updateJob(jobId, {
            progress: {
              ...current.progress,
              failedFiles: current.progress.failedFiles + 1
            }
          });
        }
      });

      if (request.options?.followLocalLinks !== false) {
        this.store.updateJob(jobId, { state: "resolving" });
        await this.resolveRepositoryLinks(repoKey, this.getJobOrThrow(jobId).documentIds);
      }

      const finalJob = this.getJobOrThrow(jobId);
      const partialSuccess = finalJob.progress.failedFiles > 0 && finalJob.progress.completedFiles > 0;
      this.store.updateJob(jobId, {
        state: partialSuccess ? "partial_success" : "completed"
      });
      this.metrics.increment("docgraph.import.repo.completed", {
        partial: partialSuccess
      });
    } catch (error) {
      this.logger.error({ message: "Repository import failed", error: String(error), jobId });
      this.store.updateJob(jobId, {
        state: "failed",
        error: {
          code: "REPO_IMPORT_FAILED",
          message: String(error)
        }
      });
    }
  }

  private async compileDocument(input: {
    path: string;
    bytes: Uint8Array;
    repoKey?: string;
    repoContext?: SourceDescriptor["repoContext"];
  }): Promise<CompiledDocumentRecord> {
    assertWithinFileSizeLimit(input.bytes);
    const source = createSourceDescriptor(input.path, input.bytes, input.repoContext);
    const resolution = await this.registry.resolve(source);
    const extraDiagnostics: Diagnostic[] = [];
    const extraAssets: AssetRef[] = [];
    const abortController = new AbortController();

    const parseContext: ParseContext = {
      source,
      resolveRelativePath: async () => null,
      emitDiagnostic: (diagnostic) => {
        extraDiagnostics.push({
          ...diagnostic,
          id: makeDiagnosticId(randomUUID())
        });
      },
      registerAsset: (asset) => {
        const normalized: AssetRef = {
          ...asset,
          assetId: makeAssetId(randomUUID())
        };
        extraAssets.push(normalized);
        return normalized;
      },
      signal: abortController.signal
    };

    const parsed = resolution ? await resolution.adapter.parse(parseContext) : await this.createFallbackDocument(parseContext);
    const irWithDiagnostics = attachDiagnostics(parsed.ir, extraDiagnostics);
    const ir = extraAssets.length > 0 ? { ...irWithDiagnostics, assets: [...irWithDiagnostics.assets, ...extraAssets] } : irWithDiagnostics;
    const format = resolution?.adapter.format ?? "html";
    const now = new Date().toISOString();

    const record: CompiledDocumentRecord = {
      docId: ir.id,
      path: source.path,
      format,
      canonicalHash: ir.canonicalHash,
      diagnostics: ir.diagnostics,
      ir,
      htmlPreview: renderHtml(ir),
      markdownPreview: renderMarkdown(ir),
      jsonPreview: renderJson(ir),
      toc: buildTableOfContents(ir),
      links: ir.linkGraph,
      backlinks: [],
      searchProjection: buildSearchDocument(ir),
      createdAt: now,
      updatedAt: now,
      ...(ir.title ? { title: ir.title } : {}),
      ...(input.repoKey ? { repoKey: input.repoKey } : {})
    };

    this.store.saveDocument(record);
    return record;
  }

  private createFallbackDocument(ctx: ParseContext) {
    const adapter = new HtmlAdapter();
    return adapter.parse(ctx);
  }

  private async resolveRepositoryLinks(repoKey: string, docIds: readonly string[]): Promise<void> {
    const documents = this.store.getDocuments(docIds);

    for (const document of documents) {
      const resolvedLinks = document.links.map((link) => {
        if (link.linkType === "doc-to-external" || link.linkType === "doc-to-asset" || link.resolved) {
          return link;
        }

        const { path, anchor } = splitHref(link.hrefRaw);
        if (path.length === 0 && anchor) {
          return {
            ...link,
            resolved: true,
            linkType: "doc-to-anchor" as const,
            dstDocId: document.ir.id,
            anchor
          };
        }

        if (path.length === 0) {
          return link;
        }

        const targetPath = resolveRelativeRepoPath(document.path, path);
        const targetDocId = this.store.findDocumentIdByRepoPath(repoKey, targetPath);
        if (!targetDocId) {
          return link;
        }

        const targetDocument = this.store.getDocument(targetDocId);
        if (!targetDocument) {
          return link;
        }

        return {
          ...link,
          resolved: true,
          linkType: anchor ? ("doc-to-anchor" as const) : ("doc-to-doc" as const),
          dstDocId: targetDocument.ir.id,
          ...(anchor ? { anchor } : {})
        };
      });

      const nextIr = replaceLinkGraph(document.ir, resolvedLinks);
      this.store.saveDocument({
        ...document,
        ir: nextIr,
        diagnostics: nextIr.diagnostics,
        links: resolvedLinks,
        updatedAt: new Date().toISOString()
      });
    }

    const updatedDocuments = this.store.getDocuments(docIds);
    const backlinkIndex = buildBacklinkIndex(updatedDocuments.map((document) => ({ docId: document.docId, links: document.links })));

    for (const document of updatedDocuments) {
      this.store.saveDocument({
        ...document,
        backlinks: backlinkIndex.get(document.docId) ?? [],
        updatedAt: new Date().toISOString()
      });
    }
  }
}
