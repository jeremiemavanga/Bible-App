# Automatic first-letter practice

This revision responds to the user's request for less setup and their preference for typing the first letter of each word. The paper, ink and orange design remains. No Bible Memory code, images, branding, translation text or other assets are copied. Its public website was inaccessible from this environment; the user's description informed the interaction direction.

## Daily experience

**Start practice** on Today enters an exercise immediately. There is no method selector, difficulty form, or separate compare/save workflow in the default session. Memory's Practice action, project Adaptive practice, and the reader's selected-passage practice use this route too.

The app selects due reviews before new material from the primary project. Scoped project practice stays within that project. When nothing is due, a familiar passage can be rehearsed; an early successful rehearsal cannot advance a mastery stage or postpone its scheduled review. New material stays within the existing daily budget.

For a new passage, the flow is:

1. Read the KJV passage.
2. Type each word's first letter with the wording visible.
3. Repeat with first-letter cues.
4. Recall with those cues hidden. Words appear as their initials are entered.
5. The app saves the lesson automatically and offers the next passage or a simple finish.

After a completed lesson, the next exercise starts with recall. Difficult or assisted independent recalls bring back the learning steps automatically. First letters remain the default; full-verse typing is an optional action under More options. Incorrect initials do not advance the cursor; requested hints and mistakes are retained. The input keeps focus between learning steps, and its saved value, cue level and remaining passage queue recover after offline reload.

The normal finish is **Done for today**. Reflection and prayer remain available by invitation. They are not mandatory forms between practice and completion. Session duration, starting-passage customization, plan counts, project creation and manual methods are available through disclosures.

## Accuracy and scheduling

First letters cannot prove the full wording was recalled. A guided lesson uses `evidence: "initials"` and `exercise: "guided-learning"`. It preserves previous mastery, independently established accuracy and qualifying recall timestamps. A new lesson invites a later independent check without marking the passage memorized.

An independent first-letter review ends with a single confirmation of the full wording and order. That result is self-assessed (`evidence: "self"`, `exercise: "initials-recall"`). Cues, mistakes and assistance prevent an assisted result from being promoted as unassisted. Later mastery stages retain the existing elapsed-time and due-date requirements.

The optional full-word exercise uses the existing KJV word alignment, omission/substitution/insertion checks, and separate verse/passage/chapter scoring. **Check & save** performs comparison and transactional saving together (`evidence: "typed"`, `exercise: "written-recall"`). Typed accuracy statistics exclude initial-letter training and self-assessed recall.

Existing unfinished typed recalls remain available under Today’s Your saved typed recall disclosure; they do not replace the new automatic Start practice action.

The original six manual memorization methods, Chapter Code, whole-passage/chapter recitation, reference tests, licensed comparisons, listening, journal and backup tools remain available. Choose a memorization method from Memory's More memory tools or the automatic exercise's More options. Whole-passage recitation is under the reader's More passage options.

## Recovery and data compatibility

The new route uses the existing IndexedDB record store and version-2 encrypted backups. Guided drafts add validated optional phase, input, mistake, remaining-queue and token fields. Existing identifiers and histories are retained; version-1 backup imports remain supported. Update the app on a receiving device before importing backups containing this revision's new practice evidence.

Each exercise has a durable attempt token. Verse and complete-passage writes happen in one transaction. Retrying the token after interruption returns the committed result without duplicating attempts or scheduling twice. Failure before commit rolls back the whole review. Failure saving the feedback draft leaves the committed review intact and supports a safe retry after reopening.

All selection, grading and adaptation happen locally. No AI service, microphone, account, analytics or synchronization backend is added. Existing KJV source notices, territorial-rights requirements, authorized-only comparison/audio imports and backup encryption are unchanged.

## Verification

The automated tests cover the complete KJV's word/initial alignment; wrong letters; automatic exercise choice; bounded new material and early rehearsal; initial-letter evidence and preserved mastery; independently graded verse/chapter results; transactional rollback and duplicate prevention; encrypted draft transfer; one-tap entry; decreasing cues; keyboard focus; accessible enlarged layouts; offline input/queue recovery; adaptive hints; and interrupted feedback recovery.

See `RELEASE-NOTES.md` for validation counts. Native WebKit remains a required GitHub verification gate, and physical iPhone/iPad/Mac keyboard, installation and VoiceOver checks remain on the Apple acceptance checklist.
