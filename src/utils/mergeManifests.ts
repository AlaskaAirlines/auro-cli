import { Logger } from "@aurodesignsystem/auro-library/scripts/utils/logger.mjs";
import type { CemModule, Manifest } from "#utils/cem.js";

/** A single package's manifest, paired with the package that published it. */
export interface ManifestSource {
  pkg: string;
  manifest: Manifest;
}

/**
 * Recursively namespace every local module reference in a CEM node with the
 * owning package. A reference is local only when it has a `module` string and
 * no `package` sibling (a `package` means it points at an external package, so
 * its `module` must be left untouched). This keeps the merged manifest's
 * internal references (exports' `declaration.module`, `references[].module`,
 * etc.) pointing at the same paths as their now-namespaced modules.
 */
export function namespaceReferences(node: unknown, pkg: string): unknown {
  if (Array.isArray(node)) {
    return node.map((item) => namespaceReferences(item, pkg));
  }

  if (node && typeof node === "object") {
    const source = node as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source)) {
      if (
        key === "module" &&
        typeof value === "string" &&
        source.package == null
      ) {
        result[key] = `${pkg}/${value}`;
      } else {
        result[key] = namespaceReferences(value, pkg);
      }
    }
    return result;
  }

  return node;
}

/**
 * Merge per-package manifests into a single Custom Elements Manifest.
 * Every module (and its internal references) is namespaced with its package so
 * paths stay unique and every declaration remains traceable to its component.
 *
 * When the sources declare more than one distinct `schemaVersion`, the merge
 * still proceeds (using the first source's version for the aggregate) but a
 * warning is emitted, since a mixed-schema aggregate may not be internally
 * consistent. The warning sink is injectable so the behavior can be unit-tested
 * without capturing global logger output; it defaults to `Logger.warn`.
 */
export function mergeManifests(
  sources: ManifestSource[],
  warn: (message: string) => void = Logger.warn,
): Manifest {
  const modules: CemModule[] = [];

  for (const { pkg, manifest } of sources) {
    for (const module of manifest.modules ?? []) {
      const namespaced = namespaceReferences(module, pkg) as CemModule;
      // Only namespace a real path. A spec-violating module that omits `path`
      // would otherwise be stored as the literal "@scope/pkg/undefined"; leave
      // its (absent) path untouched rather than fabricating a bogus one.
      if (typeof module.path === "string") {
        namespaced.path = `${pkg}/${module.path}`;
      }
      modules.push(namespaced);
    }
  }

  const schemaVersions = new Set(
    sources.map((source) => source.manifest.schemaVersion).filter(Boolean),
  );
  if (schemaVersions.size > 1) {
    warn(
      `Merging mixed CEM schema versions: ${[...schemaVersions].join(", ")}`,
    );
  }

  return {
    schemaVersion: sources[0]?.manifest.schemaVersion ?? "1.0.0",
    modules,
  };
}
