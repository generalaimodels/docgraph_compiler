export const JOB_STATES = [
  "queued",
  "fetching",
  "parsing",
  "normalizing",
  "resolving",
  "projecting",
  "completed",
  "failed",
  "partial_success"
] as const;

export type JobState = (typeof JOB_STATES)[number];

export function isTerminalJobState(state: JobState): boolean {
  return state === "completed" || state === "failed" || state === "partial_success";
}
