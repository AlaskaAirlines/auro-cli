import { getBatchedUpdateOrder } from "#scripts/formatDependencyTree.js";
import type { BundledEdge, RepoDeps } from "./extractBundledDeps.js";

export const DEPENDENCY_MAP_SCHEMA_VERSION = 1;

export interface MapPackage {
  repo?: string;
  /** Sub-components this package compiles into its build. */
  bundles: BundledEdge[];
  /** Packages that directly bundle this one (the reverse of `bundles`). */
  bundledBy: string[];
  /** Monorepo only: workspace component → sibling workspaces it bundles. */
  internal?: Record<string, string[]>;
}

/**
 * The Auro bundled-component graph. Every package that bundles, or is bundled
 * by, another appears under `packages`; `releaseOrder` groups them into batches
 * where each batch only bundles packages from earlier batches.
 */
export interface DependencyMap {
  schemaVersion: number;
  generatedAt: string;
  packages: Record<string, MapPackage>;
  releaseOrder: string[][];
  warnings: string[];
}

/** Assemble per-repo extraction results into the full dependency map. */
export function buildDependencyMap(
  repos: RepoDeps[],
  generatedAt: string = new Date().toISOString().slice(0, 10),
): DependencyMap {
  const packages: Record<string, MapPackage> = {};
  const ensure = (name: string): MapPackage => {
    packages[name] ??= { bundles: [], bundledBy: [] };
    return packages[name];
  };

  for (const repo of repos) {
    // Repos that neither bundle nor get bundled are left out of the graph.
    if (repo.bundles.length === 0 && !repo.internal) continue;
    const node = ensure(repo.package);
    node.repo = repo.repo;
    node.bundles = repo.bundles;
    if (repo.internal) node.internal = repo.internal;
    for (const edge of repo.bundles) {
      ensure(edge.package).bundledBy.push(repo.package);
    }
  }

  // Bundled-only leaves (e.g. auro-icon) still need their repo slug.
  for (const repo of repos) {
    if (packages[repo.package] && !packages[repo.package].repo && repo.repo) {
      packages[repo.package].repo = repo.repo;
    }
  }

  const sorted: Record<string, MapPackage> = {};
  for (const name of Object.keys(packages).sort()) {
    const node = packages[name];
    node.bundledBy.sort();
    sorted[name] = {
      ...(node.repo ? { repo: node.repo } : {}),
      bundles: node.bundles,
      bundledBy: node.bundledBy,
      ...(node.internal ? { internal: node.internal } : {}),
    };
  }

  return {
    schemaVersion: DEPENDENCY_MAP_SCHEMA_VERSION,
    generatedAt,
    packages: sorted,
    releaseOrder: releaseOrder(sorted),
    warnings: repos.flatMap((repo) => repo.warnings),
  };
}

/** Batches in which packages must release so every bundle is already current. */
function releaseOrder(packages: Record<string, MapPackage>): string[][] {
  const tree = Object.fromEntries(
    Object.entries(packages).map(([name, node]) => [
      name,
      {
        dependsOn: node.bundles.map((edge) => edge.package),
        dependentPackages: [...node.bundledBy],
      },
    ]),
  );
  return getBatchedUpdateOrder(tree).map((batch) => batch.sort());
}

/**
 * Every package that must rebuild and release when `pkg` releases — its direct
 * and transitive consumers — in the order they should be updated.
 */
export function transitiveDependents(
  map: DependencyMap,
  pkg: string,
): string[][] {
  const affected = new Set<string>();
  const queue = [...(map.packages[pkg]?.bundledBy ?? [])];
  while (queue.length > 0) {
    const next = queue.shift()!;
    if (affected.has(next)) continue;
    affected.add(next);
    queue.push(...(map.packages[next]?.bundledBy ?? []));
  }

  return map.releaseOrder
    .map((batch) => batch.filter((name) => affected.has(name)))
    .filter((batch) => batch.length > 0);
}
