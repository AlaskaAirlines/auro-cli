# Auro Release Versioning Rules

This guide defines which changes to an Auro component require a major, minor or patch release. It covers:

- The test that decides the bump.
- The full list of changes for each level.
- What doesn't count as a change.
- How to declare the bump in your commits.

It is written for engineers who change Auro components and for the reviewers who approve those changes.

`auro api-diff` applies these rules (see [the README](../README.md#auro-api-diff-baseref-headref)). It will run on every pull request into `dev` once the shared workflow is in place. When a rule here changes, change the check in the same PR, and the other way around.

### Related docs

- [README: `auro api-diff`](../README.md#auro-api-diff-baseref-headref): the command that applies these rules.
- [Verifying Release Versions Against Code Changes](https://github.com/orgs/AlaskaAirlines/discussions/661): the Technical Research Document (TRD) behind the check.
- [Auro CI/CD Pipeline Guide](./ci-cd.md): how releases are built and published.

---

## 1. Why the manifest is the contract

AI tools and other automation build page content from each component's `custom-elements.json` (the manifest). The published TypeScript types come from the same JSDoc. So a change to the manifest is a change to the API, even when runtime behavior stays the same. For example, narrowing a JSDoc type from `string` to `'sm' | 'md' | 'lg'` changes what a tool generates and can stop existing TypeScript code from compiling. It isn't a patch.

### The test

> **Would markup that was valid before the change still be valid, and still work, after it?**

- **No:** major. Something people or tools rely on was removed, renamed, restricted or changed.
- **Yes, and the change adds something or gives tools new information to act on:** minor.
- **Yes, and nothing a consumer or tool can see changed:** patch.

### The check enforces a minimum

The rules set the *smallest* bump a change requires. You can always declare a bigger one. Declare a bigger one whenever behavior changes in a way the manifest can't show. See [What the check can't see](#7-what-the-check-cant-see).

When a pull request has several changes, the highest bump wins.

---

## 2. Major

Release a major when markup, code or tooling that worked before can break.

### Elements and members

| Change | Example |
| --- | --- |
| An element is removed, or its tag name changes | `<auro-menuoption>` disappears from the manifest |
| A public attribute, property, method, event, slot, CSS part or CSS custom property is removed or renamed | Removing the `ondark` attribute |
| A public member is made private or protected | Marking `layout` with `@private` |
| A property becomes a method, or a method becomes a property | `focus` changes from a method to a field |
| An attribute stops reflecting | `hidden` no longer reflects to the DOM |

### Types and defaults

| Change | Example |
| --- | --- |
| A type is narrowed: a value it accepted is removed | `'primary' \| 'secondary' \| 'tertiary'` → `'primary' \| 'secondary'` |
| A type is narrowed from a primitive to specific values | `string` → `'sm' \| 'md' \| 'lg'` |
| A type is replaced | `string` → `number` |
| A default *value* changes | `size` defaults to `"md"` instead of `"lg"` |

### Usage metadata

These fields come from Auro's JSDoc tags (`@requiredWhen`, `@minimum`, `@maximum`, `@readonly`).

| Change | Example |
| --- | --- |
| A requirement is added | `@requiredWhen always` added to `label` |
| A requirement is made broader, or its condition changes | `requiredWhen` changes from `isDropdown` to `always`, or from `isDropdown` to `isModal` |
| A minimum or maximum is added, or tightened | `maximum` goes from `10` to `5` |
| A property becomes read-only | `@readonly` added |

### Methods

| Change | Example |
| --- | --- |
| A parameter is removed | `focus(options)` → `focus()` |
| A required parameter is added | `focus()` → `focus(options)` with `options` required |
| An optional parameter becomes required | `options?` → `options` |
| A parameter's type is narrowed or replaced | As for properties, above |

Parameters are compared by position. Renaming one isn't a change, because JavaScript calls don't use parameter names.

### Package

| Change | Example |
| --- | --- |
| An `exports` entry is removed | Removing `./class` |
| An `exports` field is added where there wasn't one | Every unlisted path stops being importable |
| `main`, `types` or `typings` is removed | |
| A `files` entry is removed | Removing `demo/**/*` |
| A peer or runtime dependency moves to a new major | `lit` from `^2.0.0` to `^3.0.0`. Below 1.0.0, a minor counts: `^0.2.0` → `^0.3.0` |
| An `engines` requirement is added or tightened | `node` from `>=18` to `>=20` |

---

## 3. Minor

Release a minor when nothing that worked before breaks, but there's something new to use, or new information that tools act on.

### Elements and members

| Change | Example |
| --- | --- |
| An element is added | `<auro-accordion-group>` |
| A public attribute, property, method, event, slot, CSS part or CSS custom property is added | A fix that starts firing `auroFormElement-validated` |
| A private or protected member is made public | `focus` was `@private` and is now documented |

### Types and defaults

| Change | Example |
| --- | --- |
| A type is widened: a value is added | `'primary' \| 'secondary'` → `'primary' \| 'secondary' \| 'tertiary'` |
| A type is widened from specific values to their primitive | `'sm' \| 'md'` → `string` |
| A default is documented where none was before | The manifest gains `"default": "false"` for `onDark` |
| A documented default is removed from the docs | |

### Usage metadata

| Change | Example |
| --- | --- |
| A requirement is removed, or narrowed | `requiredWhen` changes from `always` to `isDropdown` |
| A minimum or maximum is removed, or loosened | `maximum` goes from `5` to `10` |
| A read-only property becomes writable | |
| Something is deprecated, or its deprecation is removed | `@deprecated Use appearance instead` |
| `relevantWhen` is added, changed or removed | `@relevantWhen isDropdown` |
| `category` is added, changed or removed | `@category a11y` |

`relevantWhen` and `category` are guidance. Markup that ignores them still works, but tools use them to decide what to generate, so they're minor and not patch.

### Methods

| Change | Example |
| --- | --- |
| An optional parameter is added | `focus()` → `focus(options?)` |
| A required parameter becomes optional | |
| A parameter's type is widened | As for properties, above |

### Package

| Change | Example |
| --- | --- |
| An `exports` entry is added | `./package.json` |

---

## 4. Patch

Release a patch when anything that ships changes but nothing in sections 2 and 3 applies:

- Any change under a `src/` or `demo/` directory, at any depth (so `components/<name>/src/` in auro-formkit counts too).
- Any change to a `README.md`.
- Adding or removing an `exports` entry whose target isn't in the published package. It never resolved, so removing it is a packaging fix. Example: `./package-lock.json`, which npm never publishes.

Bug fixes, refactors, style changes and description edits land here, as long as they don't change the manifest in a way listed above.

---

## 5. No release

A pull request needs no release when it only changes files that aren't published:

- `test/`, `tests/`, `.github/` and `docs/` at the root of the repo.
- Other files outside `src/`, `demo/` and `README.md`, such as `package-lock.json`, lint configs and scripts.

If commits like these declare a release anyway (for example, a `fix:` that only touches tests), the check warns: the release would be unnecessary.

---

## 6. What doesn't count as a change

The check ignores differences that don't change the API.

### Private and internal API

- Members marked `@private` or `@protected`. Privacy is read from the manifest's `privacy` field, never from the name, so `layout` can be private and `_initializeDefaults` can be public.
- Attributes backed by a private property, and members tagged `@internal`.

### Formatting

- Quote style: `'md'`, `"md"` and `` `md` `` are the same value.
- Comma-separated values and unions: `'a', 'b'` is the same as `'a' | 'b'`.
- A lone value in braces: a default of `{'md'}` is the same as `'md'`.
- Wrapper type names: `String`, `Number` and `Boolean` are the same as `string`, `number` and `boolean`.
- A default of `undefined` is the same as no default.
- Attribute name case: HTML attribute names are case-insensitive, so `tIndex` and `tindex` are the same attribute.
- Manifest entries with no name, which the analyzer sometimes produces. The default slot (`""`) is an exception and does count.

### Changes from an auro-cli upgrade

A pull request that upgrades auro-cli (or the CEM analyzer) can change the manifest without touching the component's code, because newer versions write it differently. **These changes count**, because tools read the published manifest whatever produced it. The check marks each one as coming from the upgrade, so the pull request can declare the right bump and reviewers can see why.

---

## 7. What the check can't see

The check compares manifests, `package.json` and file paths. It can't see:

- **Behavior changes.** For example, a property that now only works in one mode, an event that fires at a different time, or a style that looks different.
- **Event payloads, method return types and CSS custom property values.** Only their presence is compared.
- **Description text.** It's prose, and changing it requires only the patch its `src/` change already implies.
- **Path changes.** Changes to `main`, `types` or an export's target, as long as the entry still exists.
- **New or removed dependencies.** Only a dependency moving to a new major counts.

If a change like this can break someone, declare the bump yourself. The check accepts any bump at or above its minimum.

---

## 8. Declaring the bump in your commits

The released version comes from your commit messages, read with the same rules semantic-release uses (`@aurodesignsystem/auro-config/releaserc`). Every non-merge commit in the pull request counts. The pull request title doesn't.

| Commit | Release |
| --- | --- |
| Any type with `!` (`feat!:`, `fix!:`), or a `BREAKING CHANGE:` footer | Major |
| `feat:` | Minor |
| `fix:`, `perf:` | Patch |
| `refactor:`, `style:`, `docs(README):` | Patch (Auro rules) |
| `docs:`, `chore:`, `test:`, `ci:`, `build:` | None |

To declare a major, use `!` and add a `BREAKING CHANGE:` footer that tells consumers what to change. The footer also supplies the release notes.

### What the check does

| Commits declare | Outcome |
| --- | --- |
| Less than the rules require | **Fail.** The comment lists each change that needs the bigger release. Reword the commits, for example from `fix:` to `feat:`, or add `!` and a `BREAKING CHANGE:` footer. |
| A release, when the rules require none | **Warn.** The release would be unnecessary. |
| At least what the rules require | **Pass.** |

Once the check is a required status check in a repo's `Dev` ruleset (Phase 3 in the TRD), a failure blocks the merge. If the check is wrong, or a change needs an exception, add the `semver-override` label with a written reason; it goes through the normal review. Auro Release Managers can also bypass the ruleset in an emergency.
