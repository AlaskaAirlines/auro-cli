import type { Octokit } from "@octokit/rest";
import { describe, expect, it, vi } from "vitest";
import { discoverAuroManifests } from "./manifest-discovery.ts";

interface CodeSearchItem {
  path: string;
  repository: { name: string };
}

function makeMockOctokit(
  responsesByQuery: Record<string, CodeSearchItem[]>,
): Octokit {
  const iterator = vi.fn(
    (_endpoint: unknown, params: { q: string; per_page?: number }) => {
      const items = responsesByQuery[params.q] ?? [];
      return {
        async *[Symbol.asyncIterator]() {
          yield { data: items };
        },
      };
    },
  );
  return {
    paginate: { iterator },
    rest: { search: { code: vi.fn() } },
  } as unknown as Octokit;
}

describe("discoverAuroManifests", () => {
  it("returns an empty map when neither namespace has any hits", async () => {
    const octokit = makeMockOctokit({});
    const result = await discoverAuroManifests(octokit, "Alaska-ECommerce");
    expect(result.byRepo.size).toBe(0);
    expect(result.totalMatches).toBe(0);
  });

  it("groups paths by repo across both namespace queries", async () => {
    const octokit = makeMockOctokit({
      "@aurodesignsystem org:Alaska-ECommerce in:file filename:package.json": [
        { path: "package.json", repository: { name: "repo-a" } },
        { path: "component/package.json", repository: { name: "repo-b" } },
        { path: "package.json", repository: { name: "repo-c" } },
      ],
      "@alaskaairux org:Alaska-ECommerce in:file filename:package.json": [
        // Same repo as above, different path — should merge into one entry
        { path: "client/package.json", repository: { name: "repo-b" } },
        // Same (repo, path) as @aurodesignsystem hit — should de-dup
        { path: "package.json", repository: { name: "repo-a" } },
      ],
    });

    const result = await discoverAuroManifests(octokit, "Alaska-ECommerce");

    expect(result.byRepo.size).toBe(3);
    expect([...(result.byRepo.get("repo-a") ?? [])]).toEqual(["package.json"]);
    expect([...(result.byRepo.get("repo-b") ?? [])].sort()).toEqual([
      "client/package.json",
      "component/package.json",
    ]);
    expect([...(result.byRepo.get("repo-c") ?? [])]).toEqual(["package.json"]);
    expect(result.totalMatches).toBe(5);
  });

  it("skips items missing repository.name or path", async () => {
    const octokit = makeMockOctokit({
      "@aurodesignsystem org:Alaska-ECommerce in:file filename:package.json": [
        { path: "", repository: { name: "repo-a" } },
        // biome-ignore lint/suspicious/noExplicitAny: testing malformed API response
        { path: "package.json", repository: undefined as any },
        { path: "package.json", repository: { name: "repo-b" } },
      ],
      "@alaskaairux org:Alaska-ECommerce in:file filename:package.json": [],
    });

    const result = await discoverAuroManifests(octokit, "Alaska-ECommerce");

    expect(result.byRepo.size).toBe(1);
    expect(result.byRepo.has("repo-b")).toBe(true);
    expect(result.totalMatches).toBe(3);
  });

  it("issues exactly one query per Auro namespace", async () => {
    const queries: string[] = [];
    const iterator = vi.fn((_endpoint: unknown, params: { q: string }) => {
      queries.push(params.q);
      return {
        async *[Symbol.asyncIterator]() {
          yield { data: [] };
        },
      };
    });
    const octokit = {
      paginate: { iterator },
      rest: { search: { code: vi.fn() } },
    } as unknown as Octokit;

    await discoverAuroManifests(octokit, "Alaska-ECommerce");

    expect(queries).toHaveLength(2);
    expect(queries[0]).toContain("@aurodesignsystem");
    expect(queries[0]).toContain("org:Alaska-ECommerce");
    expect(queries[0]).toContain("filename:package.json");
    expect(queries[1]).toContain("@alaskaairux");
  });
});
