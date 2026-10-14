# auro-button — translation of unaddressed options

Judgement-based translations, not name-matched ones, so none of this is bound in `auro-button.figma.ts` yet. `n/a` means there is no code equivalent. Source: PART 2 of `auro-button.mismatch.md`. Items marked **verify** are lower confidence and should be checked against the design or the component source before binding.

## Figma variant options -> code

| Figma property | Figma option | Translation (attribute = value) | Notes |
|---|---|---|---|
| State | Hover | n/a | Pseudo-state (`:hover`), not an attribute. Cannot be expressed in code. |
| State | Focused | n/a | Pseudo-state (`:focus-visible`), not an attribute. |
| Inverse | True | `appearance="inverse"` | Figma `Inverse` is the on-dark treatment. Replaces the deprecated `ondark`. |
| Inverse | False | `appearance="default"` | |
| Size | X-Large [72px] | `size="xl"` | |
| Size | Large [56px] | `size="lg"` | |
| Size | Default [48px] | `size="md"` | `md` is the code default, so the attribute can be omitted. |
| Size | Small [36px] | `size="sm"` | |
| Size | X-Small [24px] | `size="xs"` | |
| Rounded | False | n/a | Figma `Rounded` mirrors the deprecated boolean `rounded` attribute, which is not in the CEM. Do not emit `rounded`; use `shape` instead. `False` has no confirmed `shape` value, so nothing is emitted. Figma `Rounded` is deprecated in favour of a Shape choice in AB#1660228. |
| Rounded | True | `shape="rounded"` | Same note. `rounded` is the code default, so the attribute can be omitted. Replaced by the Shape choice in AB#1660228. |

## Code enum values on paired attributes -> Figma

| Attribute | Code value | Translation (Figma property = option) | Notes |
|---|---|---|---|
| `variant` | `flat` | n/a | No Figma `Type` option for it. AB#1660228 adds Flat as a Figma Shape value, but in code `flat` is a variant, not a shape, so it will not pair until the team agrees how to handle it. |
| `appearance` | `inverse` | `Inverse = True` | Moves `appearance` from the `State` variant to the `Inverse` variant. Today it is bound to `State = Default`, which is coincidental. <!-- build-translate: prune candidate: the name-match rules now cover this, so it is no longer a gap (keep it if it is an intentional override of that match) --> |

## Code enum attributes with no Figma counterpart -> Figma

| Attribute | Code value | Translation (Figma property = option) | Notes |
|---|---|---|---|
| `shape` | `rounded` | `Rounded = True` | Not deprecated. Only the boolean `rounded` attribute is. |
| `shape` | `pill` | n/a | Figma only has a two-way `Rounded` toggle. A Shape choice is planned in AB#1660228. |
| `shape` | `circle` | n/a | Same (AB#1660228). |
| `shape` | `square` | n/a | Same (AB#1660228). |
| `size` | `xs` | `Size = X-Small [24px]` | |
| `size` | `sm` | `Size = Small [36px]` | |
| `size` | `md` | `Size = Default [48px]` | |
| `size` | `lg` | `Size = Large [56px]` | |
| `size` | `xl` | `Size = X-Large [72px]` | |
| `type` | `submit` | n/a | Native HTML button behaviour, no visual difference in Figma. |
| `type` | `reset` | n/a | Same. |
| `type` | `button` | n/a | Same. |
| `autofocus` | `true` | TBD |  |
| `fluid` | `true` | TBD |  |
| `tindex` | `(any)` | TBD |  |
| `tabindex` | `(any)` | TBD |  |
| `title` | `(any)` | TBD |  |
| `value` | `(any)` | TBD |  |
| `buttonhref` | `(any)` | TBD |  |
| `buttontarget` | `(any)` | TBD |  |
| `buttonrel` | `(any)` | TBD |  |
| `static` | `true` | TBD |  |
| `layout` | `(any)` | TBD |  |
| `appearance` | `default` | TBD |  |
| `appearance` | `inverse` | TBD |  |

## Code slots with no Figma counterpart -> Figma

| Slot | Translation (n/a; a slot a Figma text property maps to is in the text table) | Notes |
|---|---|---|
| `(default)` | TBD |  |
| `ariaLabel` | TBD |  |
| `ariaLabel.loading` | TBD |  |

## Figma text properties -> slots

| Figma property | Slot (or n/a) | Notes |
|---|---|---|
| Label | TBD |  |

## Figma boolean and instance properties -> code

| Figma property | Translation (n/a for now) | Notes |
|---|---|---|
| ⮑ Icon Right Type | TBD |  |
| ⮑ Icon Left Type | TBD |  |
| Icon Left | TBD |  |
| Icon Right | TBD |  |
