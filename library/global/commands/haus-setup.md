Set up this project with haus, conversationally. The person you're helping may
not be a developer — never make them open a terminal or read JSON. You run the
commands; they read plain language and approve.

Do this in order:

1. **Detect.** Run `haus setup-project --fast --json`. Read the JSON yourself —
   do not show it. Translate what was detected into one or two plain sentences,
   e.g. "This looks like a Next.js website using Yarn. I found unit tests but no
   end-to-end tests." If the detection status is `unknown` or `partial`, say so
   honestly ("I couldn't fully recognise this stack, so I'll apply the general
   workflow and security guidance").

2. **Ask the guided questions as chat.** Ask the project's guided questions one
   or two at a time, in plain language. Collect the answers.

3. **Record answers.** Write the answers to `.haus-workflow/setup-answers.json`
   as a flat `{ "question": "answer" }` object (the exact question strings as
   keys). This is what lets setup proceed without re-prompting.

4. **Apply the basics.** Run `haus apply --write`. Read the result. This installs
   the core guardrails and helpers — including the documentation skill haus uses
   in the next step.

5. **Write the project docs (this is what makes the setup smart).** Open and
   follow the instructions in `.claude/skills/writing-documentation/SKILL.md`,
   which step 4 just installed. Following it, do a deep read of the project and:
   - write the project documentation (the `CLAUDE.md` body and `docs/` files).
     NEVER alter the `<!-- HAUS:BEGIN haus-imports … -->` … `<!-- HAUS:END … -->`
     block in `CLAUDE.md`; write around it.
   - write `.haus-workflow/deep-context.json` describing what the deep read found
     (roles, stacks, patterns the quick scan in step 1 could not see).
     If this step can't be completed for any reason, say so plainly and skip to
     step 8 — setup still finishes correctly with the basics from step 4.

6. **Re-check recommendations with the new understanding.** Run `haus recommend`.
   It re-reads `deep-context.json` and may surface extra helpers matching what the
   deep read discovered. You MUST run this before the next apply — `haus apply`
   does not re-calculate recommendations on its own.

7. **Apply the rest.** Run `haus apply --write` again. It only writes what changed,
   so this just adds the newly-matched helpers from step 6.

8. **Confirm.** End with one plain-language line, for example:
   "✅ Your project is configured — I wrote your project docs, added N guardrails
   and M coding helpers (K matched after reading your code in depth). Run
   `/haus-doctor` any time to re-check." Fill the numbers from the apply output.

If anything fails, explain what happened in plain language and what you'll try
next — don't dump raw errors.
