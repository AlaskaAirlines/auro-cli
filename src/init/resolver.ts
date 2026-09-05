/**
 * The single data module PT-M1 isolates behind one seam (per the ticket): detect
 * the installed Auro packages, resolve each at its installed version, and
 * normalise both single-component and aggregated multi-component (monorepo) CEMs
 * into one flat `ResolvedComponent[]`. Everything downstream — tag resolution
 * (`registry.ts`) and generation (`generator.ts`) — consumes that flat list, so a
 * Phase-2 shared core can replace this module without touching the generator.
 */

import type { CemDeclaration, Manifest } from "#utils/cem.js";
import {
  detectInstalled,
  type InstalledComponent,
} from "#utils/detectInstalled.js";

/** One installed Auro custom element, normalised for grounding-file generation. */
export interface ResolvedComponent {
  /** The npm package that ships this component. */
  pkg: string;
  /**
   * The installed version of {@link pkg}. A multi-component package shares one
   * version across every component it ships.
   */
  version: string;
  /**
   * The component's canonical, bare `auro-*` tag as declared in the manifest —
   * the stable identity used as the `auro.config.json` key and the subpath
   * segment. Any custom/prefixed tag is applied later by the generator using
   * `registry.ts` output; the resolver never renames a component.
   */
  tagName: string;
  /** The element's Custom Elements Manifest declaration (its full API surface). */
  declaration: CemDeclaration;
  /**
   * The module specifier to import this component from: the package root for a
   * standalone package (`@aurodesignsystem/auro-button`), or the per-component
   * subpath export for a multi-component package
   * (`@aurodesignsystem/auro-formkit/auro-input`).
   */
  importPath: string;
  /** True when {@link pkg} ships more than one registered element. */
  isMonorepo: boolean;
}

/** A tag registered by more than one installed package (a dedupe conflict). */
export interface DuplicateTag {
  /** The canonical bare `auro-*` tag registered by multiple packages. */
  tagName: string;
  /** The installed packages that all register {@link tagName}, in resolve order. */
  packages: string[];
}

/** The normalised component set plus any cross-package tag conflicts. */
export interface ResolveResult {
  /**
   * Every installed component, flattened across single- and multi-component
   * packages, in package-detection order then manifest-declaration order.
   */
  components: ResolvedComponent[];
  /**
   * Tags registered by more than one installed package — the legacy-standalone
   * vs monorepo overlap the generator warns on (never silently drops).
   */
  duplicates: DuplicateTag[];
}

/**
 * Pull every registered custom element out of a single package's manifest. A
 * declaration counts only when it is a real registered element — `customElement`
 * with a `tagName` — since an internal base class can be `customElement: true`
 * yet carry no tag. Module and declaration order is preserved for deterministic
 * output.
 */
export function registeredElements(manifest: Manifest): CemDeclaration[] {
  return (manifest.modules ?? [])
    .flatMap((module) => module.declarations ?? [])
    .filter((decl) => decl.customElement && decl.tagName);
}

/**
 * Normalise the installed packages into a flat component list, deriving each
 * component's import specifier and flagging any tag registered by more than one
 * package. Pure and side-effect-free — the network/fs work is done upstream by
 * {@link detectInstalled} — so it can be unit-tested against synthetic manifests.
 *
 * A package is treated as multi-component ("monorepo") when its manifest registers
 * more than one element; each of those components imports via its subpath export
 * (`<pkg>/<tag>`, e.g. `@aurodesignsystem/auro-formkit/auro-input`), while a
 * standalone package imports from its root. The subpath segment is the component's
 * canonical bare `auro-*` tag, which matches Auro's per-component export names.
 *
 * A tag registered by more than one installed package (the legacy standalone vs
 * `auro-formkit` monorepo overlap) is **grounded once** — the first-detected
 * package wins — and every colliding package is recorded in `duplicates` so the
 * command warns which packages the tag came from. Detection order follows the
 * installed order, so the winner is deterministic.
 */
export function resolveComponents(
  installed: readonly InstalledComponent[],
): ResolveResult {
  const components: ResolvedComponent[] = [];
  // tag -> the packages that register it, insertion-ordered, for duplicate
  // detection. A package appears at most once per tag.
  const owningPackages = new Map<string, string[]>();
  // Tags already emitted to `components`, so a duplicate tag is grounded once.
  const grounded = new Set<string>();

  for (const { pkg, version, manifest } of installed) {
    const elements = registeredElements(manifest);
    // The import shape is per-package: >1 registered element means the package
    // ships per-component subpath exports (an aggregated monorepo CEM).
    const isMonorepo = elements.length > 1;
    for (const declaration of elements) {
      const tagName = declaration.tagName as string;

      // Record every package that registers this tag (for the dedupe warning),
      // before deciding whether to ground it.
      const owners = owningPackages.get(tagName);
      if (owners) {
        if (!owners.includes(pkg)) {
          owners.push(pkg);
        }
      } else {
        owningPackages.set(tagName, [pkg]);
      }

      // Ground each canonical tag exactly once: the first package to register it
      // wins. A later package's registration is flagged as a duplicate (above),
      // never grounded a second time.
      if (grounded.has(tagName)) {
        continue;
      }
      grounded.add(tagName);
      components.push({
        pkg,
        version,
        tagName,
        declaration,
        importPath: isMonorepo ? `${pkg}/${tagName}` : pkg,
        isMonorepo,
      });
    }
  }

  const duplicates: DuplicateTag[] = [];
  for (const [tagName, packages] of owningPackages) {
    if (packages.length > 1) {
      duplicates.push({ tagName, packages });
    }
  }

  return { components, duplicates };
}

/**
 * Detect the installed Auro packages in the current project and normalise them
 * into a {@link ResolveResult}. Delegates detection to {@link detectInstalled}
 * (local-only, version-pinned) and normalisation to {@link resolveComponents}.
 * Pass an explicit package set to scope the scan; defaults to the curated
 * candidate list.
 */
export async function resolveInstalled(
  packages?: readonly string[],
): Promise<ResolveResult> {
  const installed = await detectInstalled(packages);
  return resolveComponents(installed);
}
