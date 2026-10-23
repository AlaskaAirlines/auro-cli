/**
 * Version-bump primitives shared by every `auro api-diff` classifier: the bump
 * levels, their ordering, and the declared-vs-required comparison that decides
 * whether a pull request passes.
 */

/** A semantic-release release type, or `none` when no release is needed. */
export type Bump = "major" | "minor" | "patch" | "none";

/** One classified change and the bump it requires. */
export interface ApiChange {
  bump: Exclude<Bump, "none">;
  /** Where the change was found. */
  source: "manifest" | "package" | "files";
  /** Human-readable reason, e.g. "Removed attribute `ondark` from `<auro-button>`". */
  message: string;
  /**
   * For manifest changes when the PR also changes the generator: whether the
   * component's code or the generator upgrade produced the change. Either way
   * it changes the published manifest, so it counts toward the required bump.
   */
  cause?: "code" | "generator";
}

/** Result of comparing the declared bump against the required bump. */
export type Outcome = "pass" | "fail" | "warn";

const RANK: Record<Bump, number> = { none: 0, patch: 1, minor: 2, major: 3 };

/** Numeric rank of a bump, `none` lowest. */
export function bumpRank(bump: Bump): number {
  return RANK[bump];
}

/** The highest of the given bumps (`none` for an empty list). */
export function maxBump(bumps: Iterable<Bump>): Bump {
  let highest: Bump = "none";
  for (const bump of bumps) {
    if (RANK[bump] > RANK[highest]) {
      highest = bump;
    }
  }
  return highest;
}

/**
 * Compare what the commits declare with what the code requires:
 *
 *  - declared lower than required → `fail`
 *  - nothing required but the commits declare a release → `warn`
 *  - otherwise → `pass` (declaring more than required is allowed, since behavior
 *    changes can break consumers without touching the public API)
 */
export function compareBumps(declared: Bump, required: Bump): Outcome {
  if (RANK[declared] < RANK[required]) {
    return "fail";
  }
  if (required === "none" && declared !== "none") {
    return "warn";
  }
  return "pass";
}

/**
 * Sort changes highest bump first, keeping the original order within a level,
 * and drop exact duplicate messages.
 */
export function sortChanges(changes: ApiChange[]): ApiChange[] {
  const seen = new Set<string>();
  return changes
    .map((change, index) => ({ change, index }))
    .sort(
      (a, b) => RANK[b.change.bump] - RANK[a.change.bump] || a.index - b.index,
    )
    .map(({ change }) => change)
    .filter((change) => {
      if (seen.has(change.message)) {
        return false;
      }
      seen.add(change.message);
      return true;
    });
}
