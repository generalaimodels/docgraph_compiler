import { MAX_REPO_FILES, SUPPORTED_EXTENSIONS, type SupportedExtension } from "@docgraph/core-types";
import { assertSafeRepoPath } from "@docgraph/security";
import type { GitHubRepositoryListing, RepositoryFileDescriptor } from "./types.js";

interface CommitResponse {
  sha: string;
}

interface TreeResponse {
  truncated: boolean;
  tree: Array<{
    path: string;
    mode: string;
    type: string;
    sha: string;
    size?: number;
  }>;
}

function joinRawPath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export class GitHubRepositoryClient {
  constructor(
    private readonly options: {
      apiBaseUrl?: string;
      token?: string;
    } = {}
  ) {}

  private headers(): HeadersInit {
    return {
      Accept: "application/vnd.github+json",
      ...(this.options.token ? { Authorization: `Bearer ${this.options.token}` } : {})
    };
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url, { headers: this.headers() });
    if (!response.ok) {
      throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as T;
  }

  async resolveRef(owner: string, repo: string, ref = "main"): Promise<string> {
    const apiBaseUrl = this.options.apiBaseUrl ?? "https://api.github.com";
    const response = await this.fetchJson<CommitResponse>(
      `${apiBaseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(ref)}`
    );
    return response.sha;
  }

  async listRepositoryFiles(
    owner: string,
    repo: string,
    ref = "main",
    pathPrefix?: string,
    includeExtensions: readonly SupportedExtension[] = SUPPORTED_EXTENSIONS
  ): Promise<GitHubRepositoryListing> {
    const commitSha = await this.resolveRef(owner, repo, ref);
    const apiBaseUrl = this.options.apiBaseUrl ?? "https://api.github.com";
    const tree = await this.fetchJson<TreeResponse>(
      `${apiBaseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${commitSha}?recursive=1`
    );

    if (tree.truncated) {
      throw new Error("GitHub tree response was truncated. Narrow the import path.");
    }

    const normalizedPathPrefix = pathPrefix ? assertSafeRepoPath(pathPrefix) : undefined;

    const files: RepositoryFileDescriptor[] = tree.tree
      .filter((entry) => entry.type === "blob")
      .filter((entry) => {
        const extension = `.${entry.path.split(".").at(-1) ?? ""}` as SupportedExtension | ".";
        return includeExtensions.includes(extension as SupportedExtension);
      })
      .filter((entry) => !normalizedPathPrefix || entry.path.startsWith(normalizedPathPrefix))
      .map((entry) => ({
        path: assertSafeRepoPath(entry.path),
        sha: entry.sha,
        sizeBytes: entry.size ?? 0
      }));

    if (files.length > MAX_REPO_FILES) {
      throw new Error(`Repository import exceeds the maximum file count of ${MAX_REPO_FILES}.`);
    }

    return {
      commitSha,
      files
    };
  }

  async fetchFile(owner: string, repo: string, commitSha: string, path: string): Promise<Uint8Array> {
    const response = await fetch(
      `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${commitSha}/${joinRawPath(path)}`
    );

    if (!response.ok) {
      throw new Error(`GitHub raw fetch failed for ${path}: ${response.status} ${response.statusText}`);
    }

    return new Uint8Array(await response.arrayBuffer());
  }
}
