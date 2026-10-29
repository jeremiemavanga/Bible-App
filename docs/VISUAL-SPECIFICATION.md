Here is the official visual design specification for The Word Within, written so you can copy it directly into Codex. It covers the colors, typography, layout, components, animations, and responsive design.

# THE WORD WITHIN

## Visual Design System & UI/UX Direction — v1.0

### 1. Creative Direction

Design **The Word Within** as a premium, contemplative Scripture memorization application.

The experience should feel like opening a beautifully designed Bible in a quiet study, combined with the precision and usability of a modern Apple application.

**Design keywords:**

- Contemplative
- Minimalist
- Editorial
- Timeless
- Refined
- Warm
- Focused
- Peaceful
- Sophisticated

The aesthetic should combine:

- The elegance and typography of high-quality printed books.
- The simplicity and precision of Apple's native interfaces.
- The restrained warmth of Scandinavian and Japandi design.
- The atmosphere of a quiet, dimly lit library.

**Avoid:** Generic Christian app aesthetics, crosses as decorative elements, religious ornaments, excessive gradients, gamification, bright saturated colors, glassmorphism everywhere, and cluttered dashboards.

The application should feel like a serious tool for lifelong biblical study, not a gamified habit tracker.

---

### 2. Color System

The default appearance is **Contemplative Dark**.

Use deep forest greens, charcoal, warm ivory, and muted sage.

#### Primary palette

| Token            | Hex       | Usage                             |
| ---------------- | --------- | --------------------------------- |
| Background       | `#141B17` | Main application background       |
| Surface          | `#1D2821` | Cards and panels                  |
| Surface Elevated | `#26342B` | Hover states and secondary panels |
| Surface Hover    | `#304036` | Interactive hover states          |
| Primary Text     | `#F2EFE6` | Headings and Scripture            |
| Secondary Text   | `#B4C0B2` | Supporting text                   |
| Muted Text       | `#879789` | Metadata and labels               |
| Sage Accent      | `#A8BEA1` | Active states and progress        |
| Sage Dark        | `#6F8A70` | Secondary accents                 |
| Warm Gold        | `#D2BE91` | Rare meaningful highlights        |
| Border           | `#34443A` | Subtle dividers and outlines      |
| Error            | `#D58B85` | Recall errors                     |
| Success          | `#A8BEA1` | Correct recall and completion     |

Use the warm gold sparingly. It should never dominate the interface.

Avoid pure black backgrounds and pure white typography.

#### CSS tokens

```
:root {
  color-scheme: dark;

  --bg: #141B17;
  --surface: #1D2821;
  --surface-elevated: #26342B;
  --surface-hover: #304036;

  --text-primary: #F2EFE6;
  --text-secondary: #B4C0B2;
  --text-muted: #879789;

  --accent: #A8BEA1;
  --accent-dark: #6F8A70;
  --accent-gold: #D2BE91;

  --border: #34443A;
  --success: #A8BEA1;
  --error: #D58B85;

  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 24px;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
}
```

Ensure accessible contrast for text, controls, focus indicators, and status messages. The palette may be adjusted slightly to satisfy WCAG AA.

---

### 3. Typography

Typography is one of the most important parts of this application.

Use a **serif + sans-serif combination**.

**Scripture and editorial headings:** Source Serif 4 or a similarly refined, highly legible serif.

**Interface text:** Inter or a system sans-serif.

Use locally bundled or system fonts so the interface works offline. Verify font redistribution licenses.

#### Type hierarchy

| Element         | Size    | Style              |
| --------------- | ------- | ------------------ |
| Hero heading    | 36–44px | Serif, regular     |
| Page heading    | 28–32px | Serif, regular     |
| Section heading | 20–24px | Serif              |
| Scripture text  | 22–26px | Serif, regular     |
| Body text       | 15–16px | Sans-serif         |
| UI labels       | 12–14px | Sans-serif, medium |
| Metadata        | 11–12px | Sans-serif         |

Scripture should have generous line height (approximately 1.6–1.8), comfortable line length, and generous paragraph spacing.

Do not use heavy bold text throughout the Bible reader.

**Scripture must always be the visual focal point.**

---

### 4. Layout Philosophy

The interface should feel spacious, structured, and intentional.

Use generous negative space.

Avoid putting every function inside a card.

**Desktop:**

- Left sidebar navigation, approximately 240px.
- Centered main reading/practice content.
- Maximum reading column width of approximately 720px.
- Optional contextual right panel for study tools or memory progress.
- Comfortable outer margins.

**iPad:**

- Collapsible sidebar or adaptive split view.
- Wide reading area.
- Side-by-side translation comparison where space allows.

**iPhone:**

- Bottom navigation.
- Single-column content.
- Comfortable thumb-friendly controls.
- Minimum 44×44px touch targets.
- Respect safe areas and dynamic text sizes.

Use an 8px-based spacing rhythm with 4px refinements.

Cards should have subtle borders, minimal shadows, and 12–20px corner radii.

Avoid overly rounded, bubbly interfaces.

---

### 5. Navigation

The application has five primary destinations:

1. **Today** — Daily Scripture and practice.
2. **Bible** — Scripture reader, translations, and search.
3. **Memory** — Projects, memorization exercises, Chapter Code, and review.
4. **Meditate** — Scripture reflection, cross-references, and notes.
5. **Progress** — Retention, accuracy, completion, and practice history.

Settings, backups, audio downloads, and preferences belong in a secondary menu.

Use Lucide icons with consistent 1.5–1.75px strokes.

Icons should support labels, not replace them unnecessarily.

---

### 6. Home Screen — Today's Scripture

The home screen should feel calm and welcoming.

**Hierarchy:**

1. Small date and greeting.
2. Editorial heading: "Today's Scripture".
3. Current memory project, e.g. "The Epistle of James".
4. Prominent "Continue Practice" action.
5. Due reviews and upcoming learning.
6. Quick access to Scripture, Chapter Code, meditation, and audio.

Use a restrained progress indicator.

Do not dominate the home screen with statistics, streaks, achievement badges, or motivational quotes.

A typical main card should have:

- Small uppercase eyebrow label.
- Large serif passage or project title.
- Short contextual description.
- Thin sage-colored progress line.
- Clear primary action.

---

### 7. Bible Reader

The Bible reader is the most important screen.

It must feel like reading an elegant printed Bible.

**Design requirements:**

- Distraction-free reading mode.
- Large, readable serif Scripture.
- Small, muted verse numbers.
- Comfortable paragraph spacing.
- Optional chapter headings.
- Minimal controls.
- Easily adjustable font size.
- KJV as the default text.

The translation switcher must make RVR1960 accessible in one tap when licensed.

On wider screens, provide an optional side-by-side KJV/RVR1960 layout.

On mobile, switch translations without losing the current reference.

Use subtle text selection states and understated highlighting.

Do not insert unnecessary icons between Bible verses.

---

### 8. Memorization Interface

The memorization interface should focus on one task at a time.

During recall, reduce visual distractions.

**Recommended layout:**

- Small reference at the top.
- Central Scripture exercise.
- Contextual hint controls.
- Progress through the current passage.
- Primary action near the bottom.

The same visual framework should support:

- Read and repeat.
- Progressive word hiding.
- First-letter recall.
- Type from memory.
- Cumulative recitation.
- Chapter Code.

Use muted sage for correct answers and restrained dusty red for incorrect answers.

Never rely on color alone to communicate correctness.

Accuracy feedback should clearly identify omitted, substituted, added, and correctly recalled words.

Avoid confetti, excessive celebration, punitive streaks, or aggressive animations.

---

### 9. Chapter Code Visual System

The Chapter Code should feel like a personal memory atlas.

Use:

- Chapter overview maps.
- Section-based memory locations.
- Connected verse anchors.
- Optional visual memory cards.
- Keywords and verse-number cues.
- A clear path showing the sequence of a chapter.

Keep the map structured and easy to understand.

Avoid complex 3D environments or decorative illustrations that distract from Scripture.

Memory locations can use uploaded images or simple cards.

Visual associations must always remain connected to the correct biblical text and reference.

---

### 10. Meditation Interface

The meditation screen should be even calmer than the memorization interface.

Display Scripture prominently, followed by optional reflection prompts.

The user must be able to meditate freely without completing a questionnaire.

Provide an optional writing area for notes and prayers.

Use subtle separators, generous whitespace, and minimal formatting controls.

Personal notes should visually resemble a private journal.

Avoid turning meditation into a scored or timed productivity exercise.

---

### 11. Progress Dashboard

The dashboard should be informative but restrained.

Show:

- Long-term retention estimates.
- Chapter and book completion.
- Recitation accuracy.
- Practice calendar.
- Number of memorized verses.
- Weakest passages.

Use simple line charts, horizontal progress indicators, small calendar heatmaps, and clear typography.

Charts should use sage and muted neutral colors.

Avoid brightly colored dashboards or excessive analytics.

The emphasis is on faithfulness and retention, not competitive achievement.

---

### 12. Buttons and Interactive Components

**Primary button:**

- Sage background.
- Dark text.
- Medium font weight.
- Approximately 12px corner radius.
- Clear hover, pressed, focus, and disabled states.

**Secondary button:**

- Transparent or dark surface.
- Subtle border.
- Warm ivory text.

**Inputs:**

- Dark elevated background.
- Clear labels.
- Visible focus outline.
- Comfortable touch dimensions.

**Cards:**

- Minimal elevation.
- Subtle borders.
- Consistent spacing.
- No unnecessary decorative icons.

**Dialogs:**

- Focused, calm, and concise.
- Explicit confirmation for destructive actions.
- Clear backup and restore warnings.

---

### 13. Motion and Transitions

Motion should be understated and purposeful.

Use:

- Short opacity transitions.
- Gentle slide transitions between reading and recall states.
- Smooth progress changes.
- Subtle hover and pressed feedback.

Typical durations: 150–250ms.

Avoid dramatic page transitions, bouncing elements, unnecessary parallax, and constant animation.

Respect `prefers-reduced-motion`.

---

### 14. Audio Player

Design a compact, persistent Scripture audio player.

Include:

- Play/pause.
- Previous/next passage.
- Repeat.
- Playback speed.
- Progress/scrubbing.
- Current Bible reference.

Use a minimal bottom player on mobile and an unobtrusive player panel on desktop.

Clearly distinguish audio that is available offline from audio that requires downloading or licensing.

---

### 15. Empty, Loading and Error States

Every screen needs purposeful states.

**Empty state:** Explain what the user can do next without guilt-inducing language.

**Loading:** Use subtle skeletons or progress indicators, not large animated spinners everywhere.

**Offline:** Show a quiet, informative indicator only when relevant.

**Errors:** Explain the problem and provide a clear recovery action.

**Backup warnings:** Be explicit about local storage limitations and the importance of exporting encrypted backups.

---

### 16. Accessibility

Target WCAG 2.2 AA where applicable.

Requirements:

- Sufficient contrast.
- Keyboard navigation.
- Visible focus indicators.
- Screen-reader labels.
- Semantic controls.
- Adjustable Scripture font size.
- Reduced-motion support.
- Touch targets of at least 44×44px.
- No color-only feedback.
- Proper responsive behavior with larger text settings.

---

### 17. Final Design Principle

The Word Within should feel like a **quiet digital sanctuary for Scripture study**, not a social network, fitness tracker, or productivity dashboard.

The interface should fade into the background so that Scripture remains central.

**Final visual identity:**

Deep forest green backgrounds. Warm ivory Scripture typography. Muted sage interactions. Elegant serif headings. Precise sans-serif navigation. Spacious layouts. Minimal ornamentation. Quiet transitions. Exceptional readability.

Build a cohesive, production-quality design system with reusable components and consistent behavior across iPhone, iPad, and Mac.

Do not use generic dashboard templates or placeholder styling. Implement this visual direction throughout the entire application.

This is the visual specification to send to Codex alongside the functional requirements. It keeps the dark, refined, contemplative style you selected while giving Codex concrete design tokens and UI rules rather than leaving the visual interpretation open.