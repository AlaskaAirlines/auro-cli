<!-- build-mismatch:begin summary -->
# auro-button — what matches by name and what does not, before translate

Sources: CEM from `origin/main` (auro-button.cem-map.json) and Figma component set **Button** (node 1571:3356). Pairing: exact name equality after lowercasing and trimming, and nothing else. This is the gap before `auro-button.translate.md`: nothing from that file is applied or noted here, and every item in PART 2 and PART 3 gets a row in it. Scope: attributes and slots only.

Matched by name: 2 of 10 Figma properties (`Type`, `State`), with 2 extra state blocks. Design-related code attributes with no Figma counterpart: **6 of 9**; functionality-related ones are listed separately in PART 3 (9 of 9) (2 more excluded as deprecated or private). Figma properties with no code counterpart: **8 of 10**.
<!-- build-mismatch:end summary -->

<!-- build-mismatch:begin addressed -->
# PART 1 — Matched by name (before translate)

3 of 18 bindable attributes (20 in the CEM; 2 deprecated or private excluded) and 0 of 3 slots match a Figma property by name. An attribute can appear more than once if more than one Figma property matches it.

### Attributes

| attribute | matched to | Figma option -> code value | code values NOT covered | flags |
|---|---|---|---|---|
| `variant` | Figma **Type** (variant) | Primary = `primary`, Secondary = `secondary`, Tertiary = `tertiary`, Ghost = `ghost` | `flat` |  |
| `loading` | Figma **State** = Loading (own block) | bare `loading` attribute | n/a |  |
| `disabled` | Figma **State** = Disabled (own block) | bare `disabled` attribute | n/a |  |

### Slots

_none_

### Figma blocks (name matches only)

- `variant: { 'State': 'Default' }` (baseline, no added attribute)
- `variant: { 'State': 'Loading' }` + bare `loading`
- `variant: { 'State': 'Disabled' }` + bare `disabled`

Every block also carries the 1 non-state match above.
<!-- build-mismatch:end addressed -->

<!-- build-mismatch:begin not-addressed -->
# PART 2 — NOT matched by name (before translate)

Everything below has no Figma counterpart with an equal name. Each item has a row in `auro-button.translate.md` (mapped, `n/a` or `TBD`); build-translate adds the missing ones.

## Design-related code attributes with no Figma counterpart

| attribute | kind / values | default | flags |
|---|---|---|---|
| `shape` | `rounded`, `pill`, `circle`, `square` | rounded | inherited from AuroElement |
| `size` | `xs`, `sm`, `md`, `lg`, `xl` | md | inherited from AuroElement |
| `fluid` | boolean | false |  |
| `type` | `submit`, `reset`, `button` |  |  |
| `layout` | string | default | inherited from AuroElement |
| `appearance` | `default`, `inverse` | default | inherited from AuroElement |

## Code attributes excluded by rule (deprecated or private)

| attribute | kind / values | flags |
|---|---|---|
| `loadingtext` | string | deprecated |
| `ondark` | boolean | deprecated, inherited from AuroElement |

## Code slots with no Figma counterpart

- `(default)`
- `ariaLabel`
- `ariaLabel.loading`

## Code enum values with no Figma counterpart (on paired properties)

- `variant`: `flat` (no Figma `Type` option)

## Figma properties with no code counterpart

| Figma property | type | options / default | why |
|---|---|---|---|
| Label | TEXT | Button label | no CEM attribute or slot with this name |
| ⮑ Icon Right Type | INSTANCE_SWAP | 20658:35554 | no CEM attribute or slot with this name |
| ⮑ Icon Left Type | INSTANCE_SWAP | 20658:35554 | no CEM attribute or slot with this name |
| Icon Left | BOOLEAN | false | no CEM attribute or slot with this name |
| Icon Right | BOOLEAN | false | no CEM attribute or slot with this name |
| Inverse | VARIANT | True, False (default False) | no CEM attribute or slot with this name |
| Size | VARIANT | X-Large [72px], Large [56px], Default [48px], Small [36px], X-Small [24px] (default Default [48px]) | no CEM attribute or slot with this name |
| Rounded | VARIANT | False, True (default False) | no CEM attribute or slot with this name |

## Figma variant options with no code counterpart (all variant properties)

- State = Hover
- State = Focused
- Inverse = True
- Inverse = False
- Size = X-Large [72px]
- Size = Large [56px]
- Size = Default [48px]
- Size = Small [36px]
- Size = X-Small [24px]
- Rounded = False
- Rounded = True
<!-- build-mismatch:end not-addressed -->

The boolean `rounded` attribute is also deprecated. It is not in the CEM, so it is not listed or counted. Figma `Rounded` is bound to `shape` instead.

<!-- build-mismatch:begin functionality -->
# PART 3 — Functionality-related, NOT matched by name (before translate)

Not design-related: these do not change how the component looks or a state shown in Figma (behaviour, accessibility, form, validation, browser hints). They are not part of the 100% design target.

| attribute | kind / values | default | flags |
|---|---|---|---|
| `autofocus` | boolean | false |  |
| `tindex` | string |  |  |
| `tabindex` | string |  |  |
| `title` | string |  |  |
| `value` | string |  |  |
| `buttonhref` | string |  |  |
| `buttontarget` | string |  |  |
| `buttonrel` | string |  |  |
| `static` | boolean | false |  |
<!-- build-mismatch:end functionality -->
