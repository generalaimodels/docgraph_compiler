import { randomUUID } from "node:crypto";
import { makeJobId } from "@docgraph/core-types";
import type { CompilerJobRecord, CompiledDocumentRecord } from "./types.js";

export class InMemoryCompilerStore {
  private readonly jobs = new Map<string, CompilerJobRecord>();
  private readonly documents = new Map<string, CompiledDocumentRecord>();
  private readonly repoPathIndex = new Map<string, string>();
  private readonly idempotencyIndex = new Map<string, string>();

  createJob(source: CompilerJobRecord["source"], idempotencyKey?: string): CompilerJobRecord {
    const now = new Date().toISOString();
    const job: CompilerJobRecord = {
      jobId: makeJobId(randomUUID()),
      state: "queued",
      createdAt: now,
      updatedAt: now,
      progress: {
        totalFiles: 0,
        completedFiles: 0,
        failedFiles: 0
      },
      documentIds: [],
      source,
      ...(idempotencyKey ? { idempotencyKey } : {})
    };

    this.jobs.set(job.jobId, job);
    if (idempotencyKey) {
      this.idempotencyIndex.set(idempotencyKey, job.jobId);
    }

    return job;
  }

  getJob(jobId: string): CompilerJobRecord | null {
    return this.jobs.get(jobId) ?? null;
  }

  getJobByIdempotencyKey(idempotencyKey: string): CompilerJobRecord | null {
    const jobId = this.idempotencyIndex.get(idempotencyKey);
    return jobId ? this.getJob(jobId) : null;
  }

  updateJob(jobId: string, patch: Partial<CompilerJobRecord>): CompilerJobRecord {
    const current = this.jobs.get(jobId);
    if (!current) {
      throw new Error(`Job ${jobId} was not found.`);
    }

    const next: CompilerJobRecord = {
      ...current,
      ...patch,
      progress: {
        ...current.progress,
        ...patch.progress
      },
      documentIds: patch.documentIds ?? current.documentIds,
      updatedAt: new Date().toISOString()
    };
    this.jobs.set(jobId, next);
    return next;
  }

  attachDocument(jobId: string, docId: string): void {
    const current = this.getJob(jobId);
    if (!current) {
      throw new Error(`Job ${jobId} was not found.`);
    }

    this.updateJob(jobId, {
      documentIds: [...current.documentIds, docId]
    });
  }

  saveDocument(record: CompiledDocumentRecord): CompiledDocumentRecord {
    this.documents.set(record.docId, record);
    if (record.repoKey) {
      this.repoPathIndex.set(`${record.repoKey}:${record.path}`, record.docId);
    }
    return record;
  }

  getDocument(docId: string): CompiledDocumentRecord | null {
    return this.documents.get(docId) ?? null;
  }

  getDocuments(docIds: readonly string[]): CompiledDocumentRecord[] {
    return docIds.map((docId) => this.documents.get(docId)).filter((document): document is CompiledDocumentRecord => Boolean(document));
  }

  findDocumentIdByRepoPath(repoKey: string, path: string): string | null {
    return this.repoPathIndex.get(`${repoKey}:${path}`) ?? null;
  }
}
