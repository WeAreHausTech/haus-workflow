Set up this project with haus, conversationally. The person you're helping may
not be a developer — never make them open a terminal or read JSON. You run the
commands; they read plain language and approve.

Do this in order:

1. **Detect.** Run `haus setup-project --json`. Read the JSON yourself —
   do not show it. Translate what was detected into one or two plain sentences,
   e.g. "This looks like a Next.js website using Yarn. I found unit tests but no
   end-to-end tests." If the detection status is `unknown` or `partial`, say so
   honestly ("I couldn't fully recognise this stack, so I'll apply the general
   workflow and security guidance").

2. **Apply the basics.** Run `haus apply --write`. Read the result. This installs
   the core guardrails and helpers — including the documentation skill haus uses
   in the next step.

3. **Write the project docs.** Open and follow the instructions in
   `.claude/skills/writing-documentation/SKILL.md`, which step 2 just installed.
   Following it, do a deep read of the project and:
   - write the project documentation (the `CLAUDE.md` body and `docs/` files).
     NEVER alter the `<!-- HAUS:BEGIN haus-imports … -->` … `<!-- HAUS:END … -->`
     block in `CLAUDE.md`; write around it.
   - write `.haus-workflow/deep-context.json` describing what the deep read found
     (roles, stacks, patterns the quick scan in step 1 could not see).
     If this step can't be completed for any reason, say so plainly and skip to
     step 6 — setup still finishes correctly with the basics from step 2.

4. **Re-check recommendations with the new understanding.** Run `haus recommend`.
   It re-reads `deep-context.json` and may surface extra helpers matching what the
   deep read discovered. You MUST run this before the next apply — `haus apply`
   does not re-calculate recommendations on its own.

5. **Offer optional helpers.** Read `.haus-workflow/recommendation.json` yourself
   (never show the JSON). Two kinds of optional extras may be listed; offer only
   the ones present, all **unchecked** by default — these are opt-in:
   - **Optional skills & agents** (`optInEligible[]`): workflow/ops/review/design
     helpers that don't auto-install for this stack. Group them by their
     `optInGroup` label and present one `AskUserQuestion` option per group
     (use each item's `purpose` and `tokenEstimate` to describe it in plain
     language, e.g. "Code review workflow — request/receive structured reviews").
     Collect the item ids from **all** the groups the user picked into one list
     and run a **single** `haus recommend --include <id> <id> …` (one command with
     every chosen id). Don't run it once per group — each run rewrites
     `recommendation.json`, so repeated calls would drop the earlier includes.
   - **Project config** (entries in `recommended[]` with `install: false`, e.g.
     Haus ESLint / Prettier baselines): offer each as a plain choice ("Add the
     Haus ESLint baseline"). On confirm, run `haus scaffold <id>`. `haus scaffold`
     **preserves existing config files by default** and tells you when a file
     already exists — only re-run with `haus scaffold <id> --force` if the user
     explicitly chooses to **replace** their current config.

   If neither list has anything, skip this step silently — don't ask an empty
   question.

6. **Apply the rest.** Run `haus apply --write` again. It only writes what changed,
   so this adds the newly-matched helpers from step 4 plus any opt-ins from step 5.

7. **Confirm.** End with one plain-language line, for example:
   "✅ Your project is configured — I wrote your project docs, added N guardrails
   and M coding helpers (K matched after reading your code in depth), plus the J
   optional helpers you chose: <name them>. Run `/haus-doctor` any time to
   re-check." Fill the numbers from the apply output, and name the opt-ins the
   user picked in step 5 (omit that clause if they chose none).

If anything fails, explain what happened in plain language and what you'll try
next — don't dump raw errors.
