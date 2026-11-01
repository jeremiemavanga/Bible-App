# Memory and reading update — 1.1.0

Released source: 1 November 2026. Publication depends on the verified GitHub Pages deployment succeeding.

The installed PWA keeps its existing URL, scope and `word-within` IndexedDB database. This update does not clear progress or require reinstallation. Existing valid review summaries and due dates stay in place; the revised scheduling rules apply to subsequent reviews. Existing attempts are retained.

## Practice and progress

- Correct initials reveal full words in flowing Scripture text. Subtle warm text marks word difficulty; word boxes and per-word counters stay out of practice.
- New detailed first-letter attempts record missed word positions and explicit hints separately. Corrections do not erase the original missed word. Resumed older drafts with aggregate-only errors are not given fabricated word history.
- Optional Progress insights use the latest ten detailed attempts per verse, with missed words, hints and an opportunity-weighted first-letter accuracy. These results do not automatically verify every full word.
- Started, Learning, Memorized and Long-term share the same rules across project summaries, Today, Progress and reader markers. Long-term is included in Memorized.
- Memorized means personally marked or earned through long-term recall. An inaccurate or assisted independent review returns the verse to Learning. Historical declarations and milestones remain stored.
- Every verse remains scheduled. Perfect unassisted due recall advances one rung: 1, 2, 4, 7, 14, 30, 60, 90 days. Mistakes/help descend one rung instead of resetting a long interval straight to one day. A ten-minute minimum remains available below daily review. Early successful rehearsals preserve the due date. Long-term requires at least 45 days of spaced independent evidence and a long interval.
- Existing knowledge can be marked in a reader selection or the current practice passage. This creates no fictional test attempt. Undo is available; reader marker details also allow removing a manual mark.

## Reader

Tap the passage reference for a searchable book → chapter → verse picker with recent passages. Exact verse positions are retained, and horizontal chapter swipes complement the previous/next controls. Select one verse or two range endpoints for a contiguous selection. Normal reading has no text shading; selected text uses a neutral shade. Memory markers describe their status and next review; the marker toggle is in reading settings. Project maps expose chapter and verse statuses.

## Updating an existing installation

Verified pushes to `main` now publish through the existing GitHub Pages workflow. Once deployment succeeds, open the installed app while online. Accept its existing update/reload prompt; the updated version labels this action **Update app** and waits for pending draft writes. Close and reopen the app if a prompt has not appeared yet. Keep the existing installation and site data.

New fields are included in encrypted exports and validated on restore. Backups made by 1.1.0 require 1.1.0 or newer; older version 1/2 exports remain supported. Existing aggregate-only scores cannot reveal which individual words were missed.

KJV data and source notices, territorial-rights notes, authorized-import restrictions and the local-only privacy model are unchanged. No account, analytics service, remote progress storage or automatic device sync is introduced.
