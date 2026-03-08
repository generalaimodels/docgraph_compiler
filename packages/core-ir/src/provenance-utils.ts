import type { Provenance } from "@docgraph/core-types";
import type { SourceDescriptor } from "./adapter-contract.js";

export function repoProvenanceFromSource(source: SourceDescriptor): Provenance["repo"] | undefined {
  if (!source.repoContext) {
    return undefined;
  }

  return {
    owner: source.repoContext.owner,
    repo: source.repoContext.repo,
    ref: source.repoContext.ref,
    path: source.path,
    commitSha: source.repoContext.commitSha
  };
}
