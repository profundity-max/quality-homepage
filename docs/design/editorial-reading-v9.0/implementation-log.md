# SDD ledger — plan: implementation-plan.md

Base:05efd53
Ruling: Work in current clean main checkout per user AGENTS current-branch commit requirement and approved execution plan; no new worktree.
Pre-flight: Task1 boundary consumed by Task3 and Task4; CSS new style must remain scoped. Task2 root context consumed by Task3, topic stable IDs must match.
Ruling: Task6 production deploy and GitHub/tag publication deferred until explicit deployment approval; implement and locally verify all remaining tasks now.

Tasks 1–4 implementation: scoped tokens and shell boundary; real-root navigation; reading layout/metadata/TOC; shared Markdown/KaTeX/Mermaid updates implemented. Initial failing regressions are recorded in /tmp/qnexus-red-e2e.log, /tmp/qnexus-model-red.log, /tmp/qnexus-math-red.log, /tmp/qnexus-diagram-red.log and /tmp/qnexus-table-red.log. Targeted article/onboarding 13/14 initially (theme action race in test), corrected; then professional reading/protection/editor/navigation/version suite 33/34 (thermal fixture changed old empty-state assumption), fixed by opt-in fixture rather than removing the empty-state assertion.
Task 5 ongoing: 69 files / 415 local tests PASS with maxWorkers=2; 6 files / 19 real PostgreSQL tests PASS; typecheck, format, lint (0 errors, 2 existing warnings), Compose contract PASS. Full browser suite ongoing.
Ruling: ArticleToc accepts optional desktop/compact variant to place the same entries in two responsive locations without changing existing signatures; cost if wrong: maintain both locations together, covered by navigation tests.
Ruling: Run verify constituents separately, with local tests limited to 2 workers and isolated browser data, after unconstrained PGlite workers timed out. No checks removed; cost if wrong: default unconstrained verification can still overload this machine.
Review: independent read-only review found one P2, scoped header switches to compact at1199 while drawer styles began at1100; fix extends scoped drawer styles. 1150px overlay/44px/keyboard regression added. Red reproduction and final green evidence pending.
Pending: original light warning title contrast4.38; plan requires asking before compatibility palette change. Proposed scoped #96672D (4.63) via user-input tool; no color change made without answer.

User decision: approved light Warning title #96672D only within the new article design boundary. Dark theme, accent bar and non-trial pages retain prior colors. Add focused regression and verify RED→GREEN before final commit.
Task 1 committed e9553fc: scoped theme boundary and shared header opt-in; theme/multi-width regressions PASS. Default consumers retain original tokens.
Task 2 committed eedcb21: pure navigation model tests PASS (3/3), real thermal-root and long-title dedicated browser regression PASS.
Task 3 committed 2c504f9: article layout, metadata, compact/desktop TOC. 320–1440px light/dark no document overflow; keyboard anchor focus and 200% text enlargement PASS. Article/onboarding/versions/archived assertions retained and PASS in full suite.
Task 4 committed dbae385: sanitization before trust:false KaTeX, local wide-content regions, theme/content-sensitive serialized strict Mermaid. Markdown tests 11/11 and unsafe input regressions PASS; runtime content replacement, math display, theme changes, bad syntax fallback, professional content/protection PASS.
Final: fixed P2 compact header/drawer breakpoint mismatch — isolated current-code copy without scoped drawer fix reproduced header64→220.1875 at1150px (/tmp/qnexus-review-red2.log), final compact header keyboard/44px regression GREEN; full suite115 PASS/1 fixture skipped, dedicated14/14 PASS.
Final: approved Warning title color correction RED old rgb15410747 vs expected15010345 (/tmp/qnexus-warning-red.log) → GREEN; scoped follow-up confirms title, unchanged bar/dark/inline colors (/tmp/qnexus-warning-scope-final.log). No deferred review minors.

Task 5 committed 4d9bc34: permanent isolated Playwright config and fixtures, reading regressions and updated protection body locators. Final local69/415, PostgreSQL6/19, full browser115 PASS/1 opt-in skip, dedicated14/14 and final Warning scoped follow-up1/1 PASS; build, typecheck, format, lint0 errors (2 existing warnings), compose PASS. Baseline recreated from05efd53 in new temporary directory; actual screenshots copied to docs. Production-mode E2E correctly refused the PGlite test database; guard retained, never counted as passing.
Task 6 local records ready: VERSION9.0, version summary, release/acceptance documents and Excel overview55 + commits49. Application/test range e9553fc–4d9bc34. Deployment, encrypted production backup/acceptance, GitHub push and v9.0 tag remain deferred per approved boundary. No worktree created or removed.
