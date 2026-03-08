import { describe, expect, it } from "vitest";
import type { ImportRepoRequest } from "@docgraph/api-contracts";
import { GitHubRepositoryClient } from "../github-client.js";
import { DocGraphCompiler } from "../compiler.js";

class FakeGitHubClient extends GitHubRepositoryClient {
  override async listRepositoryFiles() {
    return {
      commitSha: "deadbeef",
      files: [
        { path: "docs/index.md", sha: "1", sizeBytes: 10 },
        { path: "docs/api.md", sha: "2", sizeBytes: 10 }
      ]
    };
  }

  override async fetchFile(_owner: string, _repo: string, _commitSha: string, path: string) {
    const content =
      path === "docs/index.md"
        ? "# Home\n\nSee the [API](./api.md).\n"
        : "# API\n\nThe API reference lives here.\n";
    return new TextEncoder().encode(content);
  }
}

describe("DocGraphCompiler", () => {
  it("resolves repository-local markdown links into document graph edges", async () => {
    const compiler = new DocGraphCompiler({
      githubClient: new FakeGitHubClient()
    });
    const request: ImportRepoRequest = {
      source: {
        provider: "github",
        owner: "example",
        repo: "docs",
        ref: "main",
        path: "docs"
      }
    };

    const job = compiler.scheduleRepoImport(request, "test-idempotency");
    const completed = await compiler.waitForJob(job.jobId);
    expect(completed.state).toBe("completed");
    expect(completed.documentIds).toHaveLength(2);

    const [homeId, apiId] = completed.documentIds;
    if (!homeId || !apiId) {
      throw new Error("Expected both repository documents to be present.");
    }

    const home = compiler.getDocument(homeId);
    expect(home?.links[0]?.resolved).toBe(true);
    expect(home?.links[0]?.dstDocId).toBe(apiId);

    const api = compiler.getDocument(apiId);
    expect(api?.backlinks).toHaveLength(1);
  });
});
