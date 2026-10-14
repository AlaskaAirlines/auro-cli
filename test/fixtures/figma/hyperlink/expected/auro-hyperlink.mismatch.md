<!-- build-mismatch:begin summary -->
# auro-hyperlink — what matches by name and what does not, before translate

Sources: CEM from `origin/main` (auro-hyperlink.cem-map.json) and Figma component sets **Hyperlink/CTA Button** (node 5640:15548), **Hyperlink/Hyperlink-Inline** (node 21546:558), **Hyperlink/Hyperlink-Nav** (node 21546:579). Pairing: exact name equality after lowercasing and trimming, and nothing else. This is the gap before `auro-hyperlink.translate.md`: nothing from that file is applied or noted here, and every item in PART 2 and PART 3 gets a row in it. Scope: attributes and slots only.

Matched by name: 1 of 19 Figma properties (`Type`), with 0 extra state blocks. Design-related code attributes with no Figma counterpart: **5 of 6**; functionality-related ones are listed separately in PART 3 (5 of 5) (1 more excluded as deprecated or private). Figma properties with no code counterpart: **18 of 19**.
<!-- build-mismatch:end summary -->

<!-- build-mismatch:begin addressed -->
# PART 1 — Matched by name (before translate)

1 of 11 bindable attributes (12 in the CEM; 1 deprecated or private excluded) and 0 of 0 slots match a Figma property by name. An attribute can appear more than once if more than one Figma property matches it.

### Attributes

| attribute | matched to | Figma option -> code value | code values NOT covered | flags |
|---|---|---|---|---|
| `variant` | Figma **Hyperlink/CTA Button / Type** (variant) | Primary = `primary`, Secondary = `secondary` | `tertiary`, `ghost`, `flat` | inherited from ComponentBase |

### Slots

_none_

### Figma blocks (name matches only)

- single block, no variant restriction

Every block of a component set also carries that set's non-state matches above.
<!-- build-mismatch:end addressed -->

<!-- build-mismatch:begin not-addressed -->
# PART 2 — NOT matched by name (before translate)

Everything below has no Figma counterpart with an equal name. Each item has a row in `auro-hyperlink.translate.md` (mapped, `n/a` or `TBD`); build-translate adds the missing ones.

## Design-related code attributes with no Figma counterpart

| attribute | kind / values | default | flags |
|---|---|---|---|
| `appearance` | `default`, `inverse` | default | inherited from AuroElement |
| `fluid` | boolean |  | inherited from ComponentBase |
| `shape` | `rounded`, `pill`, `circle`, `square` |  | inherited from AuroElement |
| `size` | `xs`, `sm`, `md`, `lg`, `xl` |  | inherited from AuroElement |
| `type` | `nav`, `cta` |  | inherited from ComponentBase |

## Code attributes excluded by rule (deprecated or private)

| attribute | kind / values | flags |
|---|---|---|
| `ondark` | boolean | deprecated, inherited from ComponentBase |

## Code slots with no Figma counterpart

_none_

## Code enum values with no Figma counterpart (on paired properties)

- `variant`: `tertiary`, `ghost`, `flat` (no Figma `Type` option)

## Figma properties with no code counterpart

| Figma property | type | options / default | why |
|---|---|---|---|
| Hyperlink/CTA Button / Show Icon | BOOLEAN | true | no CEM attribute or slot with this name |
| Hyperlink/CTA Button / Label | TEXT | Hyperlink label | no CEM attribute or slot with this name |
| Hyperlink/CTA Button / ⮑ Icon | INSTANCE_SWAP | 20658:33615 | no CEM attribute or slot with this name |
| Hyperlink/CTA Button / State | VARIANT | Default, Focused, Hover (default Default) | no CEM attribute or slot with this name |
| Hyperlink/CTA Button / Inverse | VARIANT | False, True (default False) | no CEM attribute or slot with this name |
| Hyperlink/CTA Button / Size | VARIANT | Default, Small (default Default) | no CEM attribute or slot with this name |
| Hyperlink/CTA Button / Rounded | VARIANT | Yes, No (default No) | no CEM attribute or slot with this name |
| Hyperlink/Hyperlink-Inline / Label | TEXT | Hyperlink label | no CEM attribute or slot with this name |
| Hyperlink/Hyperlink-Inline / Show Icon | BOOLEAN | true | no CEM attribute or slot with this name |
| Hyperlink/Hyperlink-Inline / ⮑ Icon | INSTANCE_SWAP | 20658:33615 | no CEM attribute or slot with this name |
| Hyperlink/Hyperlink-Inline / State | VARIANT | Default, Focused, Hover (default Default) | no CEM attribute or slot with this name |
| Hyperlink/Hyperlink-Inline / Inverse | VARIANT | No, Yes (default No) | no CEM attribute or slot with this name |
| Hyperlink/Hyperlink-Nav / Label | TEXT | Hyperlink label | no CEM attribute or slot with this name |
| Hyperlink/Hyperlink-Nav / Right Icon | BOOLEAN | true | no CEM attribute or slot with this name |
| Hyperlink/Hyperlink-Nav / ⮑ Icon | INSTANCE_SWAP | 20658:34113 | no CEM attribute or slot with this name |
| Hyperlink/Hyperlink-Nav / Left Icon | BOOLEAN | false | no CEM attribute or slot with this name |
| Hyperlink/Hyperlink-Nav / State | VARIANT | Default, Focused, Hover (default Default) | no CEM attribute or slot with this name |
| Hyperlink/Hyperlink-Nav / Inverse | VARIANT | No, Yes (default No) | no CEM attribute or slot with this name |

## Figma variant options with no code counterpart (all variant properties)

- Hyperlink/CTA Button / State = Default
- Hyperlink/CTA Button / State = Focused
- Hyperlink/CTA Button / State = Hover
- Hyperlink/CTA Button / Inverse = False
- Hyperlink/CTA Button / Inverse = True
- Hyperlink/CTA Button / Size = Default
- Hyperlink/CTA Button / Size = Small
- Hyperlink/CTA Button / Rounded = Yes
- Hyperlink/CTA Button / Rounded = No
- Hyperlink/Hyperlink-Inline / State = Default
- Hyperlink/Hyperlink-Inline / State = Focused
- Hyperlink/Hyperlink-Inline / State = Hover
- Hyperlink/Hyperlink-Inline / Inverse = No
- Hyperlink/Hyperlink-Inline / Inverse = Yes
- Hyperlink/Hyperlink-Nav / State = Default
- Hyperlink/Hyperlink-Nav / State = Focused
- Hyperlink/Hyperlink-Nav / State = Hover
- Hyperlink/Hyperlink-Nav / Inverse = No
- Hyperlink/Hyperlink-Nav / Inverse = Yes
<!-- build-mismatch:end not-addressed -->

<!-- build-mismatch:begin functionality -->
# PART 3 — Functionality-related, NOT matched by name (before translate)

Not design-related: these do not change how the component looks or a state shown in Figma (behaviour, accessibility, form, validation, browser hints). They are not part of the 100% design target.

| attribute | kind / values | default | flags |
|---|---|---|---|
| `download` | boolean |  | inherited from ComponentBase |
| `href` | string |  | inherited from ComponentBase |
| `referrerpolicy` | boolean |  | inherited from ComponentBase |
| `rel` | string |  | inherited from ComponentBase |
| `target` | string |  | inherited from ComponentBase |
<!-- build-mismatch:end functionality -->
