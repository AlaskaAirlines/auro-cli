declare module "@semantic-release/commit-analyzer" {
  export function analyzeCommits(
    pluginConfig: Record<string, unknown>,
    context: {
      commits: Array<{ hash: string; message: string }>;
      cwd: string;
      logger: { log: (...args: unknown[]) => void };
    },
  ): Promise<"major" | "minor" | "patch" | null>;
}
