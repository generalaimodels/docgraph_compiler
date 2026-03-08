import type { ImportFileRequest, ImportRepoRequest, JobState } from "@docgraph/api-contracts";
import { TOPICS } from "./topics.js";

export interface MessageEnvelope<TType extends string, TPayload> {
  type: TType;
  messageId: string;
  timestamp: string;
  correlationId: string;
  retryCount: number;
  maxRetries: number;
  payload: TPayload;
}

export type ImportRequestedMessage = MessageEnvelope<
  typeof TOPICS.IMPORT_REQUESTED,
  ImportRepoRequest | ImportFileRequest
>;

export type JobStateChangedMessage = MessageEnvelope<
  typeof TOPICS.JOB_STATE_CHANGED,
  {
    jobId: string;
    previousState: JobState;
    newState: JobState;
  }
>;
