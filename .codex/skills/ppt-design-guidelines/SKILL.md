---
name: ppt-design-guidelines
description: Use when generating or reviewing PPTX presentations via officecli to ensure professional visual design, prevent text overflow, avoid element overlapping, and maintain proper layout spacing. This skill provides binding design constraints that the agent must follow when constructing slide content for officecli.
---

# PPT Design Guidelines for OfficeCLI

## Overview

This skill provides **mandatory design constraints** for any agent generating PPTX content through `officecli`. It addresses common quality issues:

- Text overflowing slide boundaries or becoming invisible
- Text overlapping with other elements
- Elements arranged without visual rhythm or spacing
- Inconsistent font sizes, colors, or layout patterns
- Overcrowded slides that harm readability

All rules below are **binding** whenever the agent produces slide content (prompts, JSON payloads, or structured instructions) destined for `officecli pptx` generation.

---

## 1. Slide Dimensions & Safe Zone

| Property | Standard Value |
|:---|:---|
| Slide aspect ratio | 16:9 (default) or 4:3 |
| Slide dimensions (16:9) | 13.33 × 7.5 inches (33.87 × 19.05 cm) |
| Safe zone margin | ≥ 0.5 inch (1.27 cm) from all edges |
| Critical content area | Central 95% of slide |

**Rules:**

- Never place text or key visuals within 0.5 inch of any slide edge.
- Always assume projectors or screens may crop outer edges.
- For title text, maintain at least 0.75 inch top margin.

---

## 2. Typography Constraints

### 2.1 Font Size Hierarchy

| Element | Minimum Size | Recommended Size | Maximum Size |
|:---|:---|:---|:---|
| Main title (cover) | 36pt | 40–54pt | 60pt |
| Slide title | 28pt | 32–36pt | 44pt |
| Subtitle / section header | 20pt | 24–28pt | 32pt |
| Body text / bullets | 18pt | 20–24pt | 28pt |
| Captions / footnotes | 12pt | 14–16pt | 18pt |

**Rules:**

- **Never** use body text below 18pt. If content cannot fit at 18pt, split into multiple slides.
- **Never** use titles below 28pt.
- Do not rely on "shrink text on overflow" behavior — it produces unreadable micro-text.
- Maintain at least 1.2× line spacing for body text (1.5× preferred).

### 2.2 Font Selection

- Use **sans-serif** fonts for all slide text: Arial, Calibri, Helvetica, Inter, Noto Sans, Source Han Sans.
- Limit to **1–2 font families** per deck (one for headings, one for body is acceptable).
- Use **font weight** (Bold, Semi-Bold, Regular) to create hierarchy rather than mixing many fonts.
- Avoid decorative, script, or novelty fonts unless the user explicitly requests them.

---

## 3. Text Content Density

### 3.1 The 5-5-5 Rule

- Maximum **5 words per bullet line** (ideally keywords/short phrases).
- Maximum **5 bullet points per slide**.
- No more than **5 consecutive text-heavy slides** without a visual break.

### 3.2 Alternative Density Caps

When the 5-5-5 rule is too restrictive for the content, use these hard limits:

| Metric | Hard Limit | Preferred |
|:---|:---|:---|
| Characters per line | 45 chars | 30–40 chars |
| Lines of text per slide | 7 lines | 4–5 lines |
| Total words per slide | 50 words | 25–35 words |
| Text area coverage | ≤ 40% of slide | ≤ 30% of slide |

**Rules:**

- If content exceeds the hard limit, **split into multiple slides** — do not shrink fonts.
- Use bullet points and fragments, not full sentences or paragraphs.
- One core idea per slide.

---

## 4. Layout & Spacing

### 4.1 Element Spacing

| Spacing Type | Minimum | Recommended |
|:---|:---|:---|
| Between title and body | 0.3 inch | 0.4–0.6 inch |
| Between bullet items | 0.15 inch | 0.2–0.3 inch |
| Between columns | 0.4 inch | 0.5–0.8 inch |
| Between image and text | 0.3 inch | 0.4–0.5 inch |
| Element to slide edge | 0.5 inch | 0.6–1.0 inch |

### 4.2 Alignment Rules

- All text boxes and visual elements must align to a consistent grid.
- Use **left-alignment** for body text (never full-justify in presentations).
- Center-alignment is acceptable only for titles and single-line callouts.
- Vertically distribute elements evenly when there are 3+ items in a column.

### 4.3 Whitespace

- Maintain at least **15–20% whitespace** on every slide.
- Whitespace is a design tool — it guides the eye and signals professionalism.
- If a slide feels "full," it is already overcrowded.

---

## 5. Visual & Image Guidelines

### 5.1 Image-to-Text Ratio

- Target approximately **60% visuals / 40% text** for content slides.
- Full-bleed background images are acceptable if text overlays use:
  - Semi-transparent overlay (50–70% opacity dark/light box behind text)
  - Or text is placed in a designated clear area of the image

### 5.2 Image Sizing

- Images must not overlap with text boxes.
- Maintain original aspect ratio — do not stretch or squash images.
- Leave at least 0.3 inch gap between any image edge and adjacent text.

### 5.3 Charts & Diagrams

- Chart title font: ≥ 20pt.
- Axis labels and data labels: ≥ 14pt.
- Limit data series to 5–7 per chart for clarity.
- Use contrasting colors for adjacent data series.

---

## 6. Color & Contrast

### 6.1 Palette Rules

- Use a **limited palette** of 3–5 colors plus neutrals (black, white, gray).
- Reserve the most saturated/vibrant color for emphasis (key data, CTAs).
- Assign colors to hierarchy levels consistently across the deck.

### 6.2 Contrast Requirements

- Text-to-background contrast ratio: ≥ 4.5:1 (WCAG AA).
- Title text on colored backgrounds: ≥ 3:1 minimum.
- Avoid placing text on busy or patterned backgrounds without an overlay.

### 6.3 Consistency

- The same type of element (e.g., all slide titles) must use the same color throughout.
- Do not use more than 3 accent colors on a single slide.

---

## 7. Slide Type Templates

### 7.1 Cover / Title Slide

- Title: 40–54pt, centered or left-aligned.
- Subtitle: 20–28pt.
- Maximum 2–3 lines of title text.
- Presenter name / date: 14–16pt at bottom.
- Generous whitespace (≥ 40% of slide area empty).

### 7.2 Section Divider

- Section title: 36–44pt, prominent position.
- Optional subtitle or brief description: 18–24pt.
- Minimal content — this slide signals transition.

### 7.3 Content Slide (Bullets)

- Slide title: 28–36pt at top.
- 3–5 bullet points at 18–24pt.
- Optional single image or icon on the side (max 40% width).
- Remaining space is whitespace.

### 7.4 Two-Column Layout

- Each column: max 45% of slide width.
- Gap between columns: ≥ 0.5 inch (10% of slide width).
- Both columns share the same vertical alignment baseline.
- Total text across both columns still respects 50-word limit.

### 7.5 Image-Focused Slide

- Image: 60–80% of slide area.
- Caption or title: 20–28pt, placed outside image area.
- No body text competing with the image.

### 7.6 Comparison / Table Slide

- Table cells: ≥ 16pt font.
- Table header: Bold, ≥ 18pt.
- Max 5 columns and 6 rows visible per slide.
- If more data is needed, split across slides or use appendix.

### 7.7 Closing / Thank-You Slide

- Similar rules to cover slide.
- Contact info: 14–16pt.
- Keep minimal and clean.

---

## 8. Anti-Patterns to Avoid

The agent **must not** produce content that results in any of these:

| Anti-Pattern | Why It Fails | Fix |
|:---|:---|:---|
| Wall of text (>7 lines) | Audience stops reading | Split into multiple slides |
| Font size < 18pt for body | Unreadable from distance | Increase size, reduce content |
| Text within 0.5in of edge | Gets cropped by projectors | Respect safe zone |
| Overlapping elements | Unreadable, unprofessional | Enforce spacing minimums |
| Inconsistent font sizes | Chaotic visual hierarchy | Use the defined hierarchy |
| > 3 different fonts | Visual noise | Stick to 1–2 families |
| Stretched images | Looks amateur | Maintain aspect ratio |
| No whitespace | Feels overwhelming | Target 15–20% empty space |
| Auto-shrunk text | Signals poor planning | Split content instead |
| Rainbow colors | Distracting, unprofessional | Use 3–5 color palette |

---

## 9. Application to OfficeCLI Workflow

### 9.1 When Constructing officecli Prompts

Before sending any PPTX generation request to `officecli`, the agent must:

1. **Count words per slide** — if any slide concept exceeds 50 words, split it.
2. **Verify hierarchy** — each slide must have a clear title + supporting content structure.
3. **Specify font guidance** — include font size preferences in the prompt or payload when possible.
4. **Limit bullets** — restructure content to max 5 bullets per slide.
5. **Indicate layout preference** — specify whether the slide is text-only, image+text, two-column, etc.

### 9.2 When Using agent-bridge Payloads

When constructing structured JSON payloads for `office.render`:

- Include explicit spacing and margin hints if the schema supports them.
- Set text content to comply with the density limits above.
- Prefer short, keyword-driven content over verbose descriptions.
- If the payload schema allows specifying font sizes, use values from the hierarchy table.

### 9.3 Content Restructuring Strategy

When user-provided content is too dense for a single slide:

1. Identify the core message of the slide.
2. Split supporting details into sub-slides.
3. Use a "Overview → Detail" pattern: first a summary slide, then detail slides.
4. Consider converting bullet lists into visual elements (icons, simple diagrams, numbered steps).

### 9.4 Prompt Engineering for Better Visuals

When writing the prompt or description for `officecli`:

- Always mention the **target audience** (executives, engineers, students, etc.).
- Specify the **tone** (professional, creative, minimalist, corporate).
- Request **consistent styling** across slides.
- If the deck has > 10 slides, request section dividers.
- Explicitly state "do not overcrowd slides" or "prefer whitespace over density."

---

## 10. Quality Checklist

Before finalizing any PPTX generation request, verify:

- [ ] No slide exceeds 50 words of body text
- [ ] All font sizes meet minimum requirements (body ≥ 18pt, title ≥ 28pt)
- [ ] Each slide has one clear main idea
- [ ] Bullet points are ≤ 5 per slide
- [ ] Safe zone margins are respected (0.5in from edges)
- [ ] Visual elements do not overlap text
- [ ] Color palette is limited and consistent (3–5 colors)
- [ ] Whitespace is ≥ 15% on every slide
- [ ] Font families ≤ 2 across the deck
- [ ] Slide count is reasonable (not cramming content to reduce slides)

---

## 11. Template Modification Rules

When modifying an existing PPTX template (as opposed to generating from scratch), the agent **must** follow these additional constraints:

### 11.1 Measure Before Writing

- Before inserting text into any text box, use `officecli get <file> <path>` to read the target text box's **width**, **height**, and **font size**.
- Never assume a text box can hold arbitrary-length content. The template's layout is fixed; the content must fit the container, not the other way around.
- If the text box has `autoFit=shape` or `autoFit=normal`, text will shrink or overflow silently — treat these as hard boundaries, not elastic containers.

### 11.2 Calculate Character Capacity

Use these estimates to determine maximum content length per text box:

| Font Size | Approx. Chinese chars per cm width | Approx. Latin chars per cm width |
|:---|:---|:---|
| 10pt | ~2.8 | ~5.6 |
| 14pt | ~2.0 | ~4.0 |
| 18pt | ~1.6 | ~3.1 |
| 20pt | ~1.4 | ~2.8 |
| 24pt | ~1.2 | ~2.4 |

**Rules:**

- Convert text box width from EMU to cm: `width_cm = width_emu / 914400 × 2.54`
- Max characters per line = `width_cm × chars_per_cm` (use the table above)
- Max lines = `height_cm / (fontSize_pt × 0.0353 × lineSpacing)` (approximate)
- If the calculated content exceeds capacity, **shorten the text** — do not rely on auto-shrink.
- For Chinese text, count each CJK character as 1 unit; for mixed text, count Latin characters as 0.5 units.

### 11.3 Respect Existing Layout

- **Do not reposition or resize** template text boxes unless explicitly asked.
- If a text box is too small for the desired content, split the content across slides or use a shorter phrasing — never force long content into a small container.
- When template text boxes are arranged in a grid or card layout (multiple small boxes), limit content to **short keywords or phrases** (2–6 characters for Chinese labels, 1–3 words for English).
- For text boxes narrower than 3cm, use **single words or very short phrases only**.

### 11.4 Replace ALL Placeholders

Before delivering the modified file, the agent must:

1. Run `officecli view <file> text` to scan all text content.
2. Search for common placeholder patterns:
   - English: "Text here", "Supporting text", "keyword", "Copy paste fonts", "Unified fonts"
   - Chinese: "您的内容打在这里", "在此录入", "输入关键字"
3. Every placeholder text **must** be replaced with relevant content or removed.
4. If a placeholder text box serves a purely decorative or structural role that has no matching content, set it to an empty string or a single relevant word — never leave template boilerplate visible.

### 11.5 Verify After Modification

After all batch modifications, the agent must:

1. Run `officecli view <file> text` and confirm:
   - No template placeholder text remains
   - No content appears truncated or nonsensical
2. Run `officecli view <file> outline` to verify slide count and structure.
3. If possible, visually check (via screenshot or preview) that:
   - No text overflows its container
   - No elements overlap
   - Navigation tabs and labels are all consistent

### 11.6 Batch Modification Strategy

When performing batch text replacements on a template:

1. **Query first**: Use `officecli query` with `:contains()` selectors to find exact element paths before modifying.
2. **Validate IDs exist**: Not all shape IDs from one slide exist on others — always verify paths per slide.
3. **Group by slide**: Process modifications slide-by-slide to catch errors early.
4. **Test with short content first**: If unsure about box capacity, set a brief test string, verify it renders correctly, then finalize with full content.
5. **Prefer keywords over sentences**: Template card layouts are designed for keywords. Use full sentences only in wide, dedicated content areas (width > 8cm).

### 11.7 Common Template Pitfalls

| Pitfall | Symptom | Prevention |
|:---|:---|:---|
| Long text in narrow box | Text stacks vertically, becomes unreadable | Measure width first, use ≤ max chars |
| Unmodified placeholder | "Text here" or "您的内容打在这里" visible | Full-text scan after all edits |
| Overlapping text layers | Description text covers card elements | Check z-order; use only the appropriate text box |
| Mixed content density | Some cards have 3 words, others have 30 | Keep parallel elements at consistent length |
| Missing nav-tab updates | Old section names remain in tab labels | Query all tab-shaped elements and update consistently |

---

## References

Design principles sourced from:

- MIT Communication Lab presentation guidelines
- Carnegie Mellon University slide design resources
- McGill University presentation best practices
- iSpring Solutions professional slide design guide
- SlideModel layout and typography standards
- Microsoft PowerPoint design documentation
- WCAG 2.1 contrast accessibility requirements
