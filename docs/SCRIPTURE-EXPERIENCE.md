# Scripture, daily practice and lasting recall

This revision implements the agreed UX recommendations while preserving the paper/ink/orange design, all six memorization methods, the 66-book KJV library, and the existing licensing and local-first privacy model.

## Reading and context

The Bible opens in continuous reading layout. Navigation/search and reading preferences are closed disclosures; verse-by-verse layout and authorized translation comparison remain available. The reading layout, chapter and text size stay on this device. Verse-number buttons select passages, revealing project, practice and meditation actions. Reference searches can open the surrounding whole chapter.

Practice and meditation include **Read in context**, displaying the actual KJV chapter with the selected passage marked. The reading invitation is editorial UI, visually separate from the biblical text. No paraphrase, commentary, generated theology, or third-party study notes are bundled. Opening context before grading counts as assistance for that attempt.

## Daily rhythm and spoken recall

Today leads with Scripture and Continue Practice. The live date remains, with an expandable practice calendar. A five-minute choice changes the current session only; the user's saved routine remains intact. New users can choose one passage and begin a short session without configuring the other tools.

A completed guided session offers optional reflection followed by prayer. Users can skip writing or leave immediately. Unfinished reflections recover through the existing private draft mechanism; keeping a reflection explicitly creates a journal entry. Prayer has no timer, score, recording or stored completion record.

Recite aloud hides the passage until the user reveals it for comparison. No microphone or speech-recognition service is used. The user assesses accuracy and, for multi-verse passages, whether transitions were recalled in order. These attempts carry `evidence: "self"`; approximate scores are scheduling inputs, not automatic word checks. Typed attempts carry `evidence: "typed"`. The displayed typed-accuracy statistic excludes spoken estimates.

The first comparison after an oral reveal is self-assessed. Hints, visible cues during recall, and contextual reading remain assistance. All six original methods remain selectable. Reference testing and additional practice tools are optional disclosures.

## Retention evidence

Scheduler version 2 records the first independent successful recall and the last qualifying spaced recall. Rehearsals before the due date or within 24 hours of a qualifying recall are saved in history but cannot advance a stage or postpone the scheduled review.

Promotion requires at least 97% accuracy, no hints, confident self-assessment and suitable difficulty. Verse scores and complete passage/chapter scores remain independent. Spoken accuracy is the user's assessment and is always identified as such.

Minimum elapsed spans from the first independent success are:

| Stage              | Minimum span, plus due and spaced successful reviews |
| ------------------ | ---------------------------------------------------- |
| Familiar           | Initial independent success                          |
| Learning           | 1 day                                                |
| Memorized          | 4 days                                               |
| Established        | 14 days                                              |
| Long-term retained | 45 days                                              |

These are conservative product rules, not a scientifically calibrated memory model. The actual route can take longer because the learner must return when reviews are due. Established and long-term stages remain in the review rotation. Failures still adjust the next interval; missed days alone do not lower a stage or create duplicate review debt.

On opening an existing installation or restoring a backup, old review summaries are rebuilt from their durable attempts under the new rules. Attempts, record identifiers, projects, notes and media are preserved. A previously inflated stage or next-review date may change. Summaries without retained attempts are capped at Familiar until new evidence is collected. IndexedDB's schema stays version 1; additional scheduler fields are optional and validated. Encrypted backup envelopes remain version 2 and version 1 imports remain supported.

Progress emphasizes observed typed accuracy and established verses. The heuristic retention percentage is inside an explanation that explicitly describes its limits. Recall statistics do not measure spiritual maturity.

## Safekeeping and release checks

Today shows that personal data belongs to this device, whether an encrypted backup download has been requested, and how to open Backup & transfer. Download initiation does not prove that a file was retained. Settings explains export, saving the encrypted file, manual device transfer, preview, restoration and verification. Copies on different devices remain independent; there is no automatic synchronization.

Core reading, practice, context, draft recovery and personal media continue to work offline after initial provisioning. Licensing restrictions, authorized-only imports, original source notices and backup encryption remain unchanged.

Automated checks cover scheduling across days/weeks, early repetitions, assisted recalls, old-history reconstruction, idempotent database upgrades, encrypted transfer of new fields, reading hierarchy and passage selection, context assistance offline, oral evidence, optional reflection/prayer and transfer guidance. Physical Safari, installation, VoiceOver, touch keyboard and OS storage behavior still require the checklist in `APPLE-INSTALL.md`. Native WebKit remains a required CI release gate.
