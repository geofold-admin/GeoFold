# GeoFold — Brief Compliance Report

Audit of `UI_UX_Design_Proposal.md` against the shipped code. Every claim below is **measured**
(computed styles, rendered pixels, or contrast maths), not asserted. Where the brief and the
implementation disagree, the disagreement is stated with numbers.

Run the checks yourself:

```bash
npm run build && npm run start -- -p 3100
npm run verify:all              # 58 functional checks
node scripts/audit-brief.mjs    # brief clause-by-clause
node scripts/audit-colour.mjs   # the 60-30-10 proportion, from pixels
```

---

## 1. Colour — the 60-30-10 proportion, measured

The brief specifies a 60-30-10 split. That is testable: render the page, classify every pixel as
neutral / primary / accent by nearest reference colour, and count.

| page | neutral (60) | primary (30) | accent (10) |
|---|---|---|---|
| landing `/` | 79.5% | 20.0% | 0.5% |
| pricing `/pricing` | 87.1% | 11.9% | 0.9% |
| product `/product` | 88.6% | 11.3% | 0.1% |

**Verdict: neutrals dominate as intended; the accent is correctly rationed.** 0.1–0.9% for orange
is the right reading of *"digunakan sangat terbatas"* — it appears on the primary CTA, the survey
pins, and the Premium card's indicator dot, and nowhere else.

Primary reads 11–20% rather than exactly 30%. This is a deliberate deviation and worth stating
plainly: a *literal* 30% of blue on a page would mean large blue fields, which the brief's own
first principle rules out (*"antarmuka harus bersih, minim distraksi, dan fokus pada peta serta
data"*). The blue is used as the brief actually describes it — navigation, active states, and
structural components — which on a text-and-cards page is a smaller area than a third. The 60-30-10
rule is a ratio of *emphasis*, not a pixel quota.

## 2. Colour — the brief's own hexes, each verified

| Brief role | Hex | Shipped | Verified |
|---|---|---|---|
| GEOFOLD Blue | `#014AB5` | ✓ | 7.93:1 on white (brief claims 7.92:1 — the brief is right to 1dp) |
| Blue Hover | `#013A8F` | ✓ | used on interactive hover |
| Blue Soft | `#EFF5FF` | ✓ | active-state wash, `--accent-soft` / `--mk-blue-soft` |
| Blue Deep | `#0A192F` | ✓ | the hero plate |
| GEOFOLD Orange | `#F35D19` | ✓ | survey marker + the one primary CTA per view |
| Orange Hover | `#D6450A` | ✓ | CTA hover |
| Surface | `#FFFFFF` | ✓ | panels, sidebar, cards |
| Canvas / Paper | `#F3F4F6` | ✓ | page ground **and the map canvas** |
| Line | `#E5E7EB` | ✓ | hairline borders |
| Ink — heading | `#111827` | ✓ | 17.74:1 |
| Ink — label | `#6B7280` | ✓ | 4.83:1 |
| Ink — hint | `#9CA3AF` | ⚠ | see below |

### Two corrections the brief needs

**(a) `#9CA3AF` cannot carry information.** It measures **2.54:1** on white and **2.31:1** on the
canvas — both far below the 4.5:1 the brief itself claims to respect. The brief then assigns it to
*offline status* (§6), which on a field app is not decoration; it is the one thing a surveyor must
be able to read when they have no signal.

**Shipped:** the *dot* and the dimmed states use `#9CA3AF` as the brief intends, and the *text*
uses `#6B7280` (4.83:1), the nearest AA-safe neighbour of the same hue. The state is also carried by
the icon, so meaning never rests on colour alone. Documented at `globals.css` §Sync status.

**(b) `#6B7280` fails on the canvas.** It is 4.83:1 on white but **4.39:1** on `#F3F4F6`, so it is
AA on a card and just under AA on the page ground. **Shipped:** label text sits on panel surfaces
where the brief's value is used verbatim; text directly on the canvas uses `#5E6A7B` (4.99:1).

**(c) White on orange fails.** `#FFFFFF` on `#F35D19` is **3.29:1** — fine for large text, below AA
for the CTA's 14–16px label. **Shipped:** the orange controls use `#0A192F` on the fill
(**5.36:1**), which is the brief's own Blue Deep. This is the single most important colour decision
in the whole re-skin: the brief names the orange as its accent and never specifies the ink that
goes *on* it, and the obvious choice (white) is the wrong one.

## 3. Typography — verified from computed styles

| Role | Face | Where | Verified |
|---|---|---|---|
| Heading / display | Archivo | hero `h1`, section `h2` | ✓ |
| Body & app chrome | Barlow | body copy, nav, app | ✓ |
| Data / figures / labels | Barlow Condensed | stats, price figures, column heads | ✓ |
| Code & system readouts | Space Mono | coordinates, system logs | ✓ |

The hero coordinate readout renders `0°04′32″ N / 111°29′43″ E` in Space Mono, read from
`SITE_LOCATION` so it cannot drift from the globe's marker.

## 4. Layout & micro-interactions

| Clause | Status | Evidence |
|---|---|---|
| 0px radius on panels, buttons, images | ✓ | `--card-radius: 0px`; the previous layer's hardcoded 6/8/10/100px radii were mapped from the CSS and squared |
| "+" registration marks at card corners | ✓ | 8 gradient arms on `.pg-cell-art::after` / `.pg-row-art::after` |
| Decrypted / Tech text | ✓ | `TechText` on the hero coordinate readout |
| Scroll reveal + scroll velocity | ✓ | GSAP reveals on every section; velocity skew measured at **1.50° on feature headings** (cap 1.5) and **3.00° on the audience band** (cap 3.0), settling to 0.000° when the page stops |
| Star Border / Laser Flow | ✓ | `StarBorder` on the Premium CTA — exactly one on the page |
| Pixel Swap / Dither Veil | ✓ | `DitherVeil` on all five bento figures |
| Glow Cursor | ✓ | one delegated listener scoped to `[data-glow-zone]` (the bento grid, exactly as the brief specifies); fine-pointer only; inside the `prefers-reduced-motion: no-preference` block |

## 5A. Landing page

| Clause | Status | Evidence |
|---|---|---|
| Hero on `#0A192F`, Archivo, white type | ✓ | headline is `rgb(255,255,255)` in Archivo 600; measured 16.03:1 against the plate |
| Primary CTA in orange | ✓ | `--mk-marker` fill, `#0A192F` label |
| Bento grid, hairline borders, square | ✓ | `.pg-bento` |
| Dither Veil on figure hover | ✓ | 5 instances |
| Globe right / giant `#111827` type left | ✓ | globe on the light plate, caption "Sintang, West Kalimantan" |
| Premium card highlighted in blue | ✓ | measured `rgb(1,74,181)`, 1px border |
| Free card blends with the background | ✓ | transparent over the page ground |

## 5B. App chrome

| Clause | Status | Evidence |
|---|---|---|
| Sidebar white `#FFFFFF` | ✓ | measured `rgb(255,255,255)` |
| Icons stroke 1.5px | ✓ | measured `stroke-width: 1.5px` |
| Active item in GEOFOLD Blue + left ribbon | ✓ | `rgb(1,74,181)` text and icon; 2px left ribbon |
| Mobile bottom bar white | ✓ | measured `rgb(255,255,255)`; links 51px tall |
| Connection status clear in the header | ✓ | `SyncStatus` in the mobile header and the sidebar foot |
| Map canvas neutral `#F3F4F6` | ✓ | **was `rgb(221,221,221)`** — see §7 |
| Survey markers absolutely `#F35D19` | ✓ | `rgb(243,93,25)` |

## 6. Accessibility

| Clause | Status |
|---|---|
| GEOFOLD Blue on white = 7.92:1 | ✓ measured 7.93:1 |
| Offline state indicated | ✓ in the header, AA-safe text, icon carries state |
| WCAG AA on all body text | ✓ see §2 for the two brief values that needed adjusting |

## 7. Defects found by this audit and fixed

1. **The map canvas was never the brief's grey.** It rendered `rgb(221,221,221)` — leaflet.css's own
   `#ddd` default. The project has never carried a single `.leaflet-container` rule, and the two
   greys are close enough to pass an eyeball check. Now `rgb(243,244,246)`, verified.
2. **It needed specificity, not just placement.** `leaflet.css` is imported from inside
   `MapView.tsx`, so Next emits it into a separate chunk that the browser appends *after*
   `globals.css`. Equal specificity meant the later sheet won. The rule is now `html
   .leaflet-container` (0,1,1) — the same fix, for the same reason, as the `body:has()` rule in
   `blueprint.css` §3.
3. **Two `var()` references to tokens that do not exist** (`--font-sans`, `--shadow-2`; the real
   names are `--font-body` and `--shadow`). A `var()` with no fallback kills the whole declaration
   silently — this is the third time this class of bug has appeared in this project.
4. **A wrong number in my own CSS comment.** I had written that the orange pin measures 3.11:1 on
   the brief's grey. Measured, it is **2.99:1** — which is *below* the 3:1 non-text threshold, so the
   original claim was both wrong and load-bearing. The comment now states the real figures and
   explains what actually makes the pin legible: its white collar and dark ring, not the ground.
5. **Leaflet's attribution was set to 10px.** That row contains a link, so it is interactive text
   and takes the project's 11px floor, not the 10px reserved for non-interactive smallprint.
6. **The scroll-velocity effect was only on the marquee band, not on the feature headings.** The
   brief asks for it on headings explicitly (*"digunakan untuk heading fitur di marketing page"*).
   It now drives both, at different angles — 1.5° for a heading, 3° for the band — because a
   heading is the line you are reading at the moment you are scrolling, and it was also made to
   settle to square on a hard stop, which the original did not do: `onUpdate` only fires while the
   scroll position changes, so releasing a scrollbar drag left the page resting permanently skewed.
7. **A false bug report of my own, caught by measurement.** My first two probes of that effect
   reported `0.00deg` and I nearly "fixed" working code. The fault was in the probe: it read
   `p[1]` of the transform matrix, which is the rotation term, not the skew term. See §9.

## 8. Leaflet chrome, re-cut

Leaflet's defaults were the last rounded, "social app" shapes on the page: a 30px-radius control
pill, a 12px-radius popup, and a blue-on-white attribution bar. All squared, re-inked from the
project's tokens, and scoped under the map container so they outrank `leaflet.css`.

## 9. Two measurement traps this audit hit

Recorded because both produced a confident, wrong number, and both are now permanent rules in
`references/ui-rules.md`:

**Parsing a computed transform.** To verify the scroll-velocity skew I read the transform matrix
and took `p[1]`. That is the rotation term, always 0 for a skew, so a working effect measured as
exactly `0.00deg` — twice. The correct indices are `atan2(p[2], p[0])` for `matrix()` and
`atan2(p[4], p[0])` for `matrix3d()`. Compounding it: GSAP writes `translate3d()`, so a skewed
element computes to `matrix3d`, which does not contain the substring `matrix(` — a 2D-only regex
silently finds nothing. Printing the raw string (`matrix(1, 0, 0.0008, 1, 0, 0)`) made the error
obvious in one line. **A non-match is an error, never a zero: `0.00deg` must mean "measured zero",
not "could not measure".**

**A `MutationObserver` beats polling computed styles.** When the probe reported zero, watching the
`style` attribute showed GSAP writing `skew(0.1deg)` while the poll was still reporting nothing.
That is what located the fault in the probe rather than in the page, and it is the cheaper check.

---

*Prepared as part of the Blueprint re-skin. Every figure above is reproducible with the three
commands at the top of this file.*
