import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ImportRepoRequest } from "@docgraph/api-contracts";
import type { ImportLocalRepoRequest } from "@docgraph/api-contracts";
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
    expect(home?.sourcePreview).toContain("# Home");

    const api = compiler.getDocument(apiId);
    expect(api?.backlinks).toHaveLength(1);
  });

  it("imports a local repository tree with rst content", async () => {
    const rootPath = await mkdtemp(join(tmpdir(), "docgraph-local-"));
    await mkdir(join(rootPath, "docs"), { recursive: true });
    await writeFile(
      join(rootPath, "docs", "index.rst"),
      [
        "Home",
        "====",
        "",
        ".. toctree::",
        "",
        "   guide.rst",
        "",
        "Read the `Guide <guide.rst>`_."
      ].join("\n")
    );
    await writeFile(join(rootPath, "docs", "guide.rst"), "Guide\n=====\n\nHello from the guide.\n");

    const compiler = new DocGraphCompiler();
    const request: ImportLocalRepoRequest = {
      source: {
        rootPath,
        path: "docs"
      }
    };

    const job = compiler.scheduleLocalRepoImport(request, "local-rst");
    const completed = await compiler.waitForJob(job.jobId);
    expect(completed.state).toBe("completed");
    expect(completed.source.kind).toBe("local");
    expect(completed.documentIds).toHaveLength(2);
    const sourcePreviews = completed.documentIds
      .map((docId) => compiler.getDocument(docId)?.sourcePreview ?? "")
      .join("\n");
    expect(sourcePreviews).toContain("Home");
  });
});
