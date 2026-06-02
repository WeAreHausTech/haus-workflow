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

4. **Apply.** Run `haus apply --write`. Read the result.

5. **Confirm.** End with one plain-language line, for example:
   "✅ Your project is configured — I added N guardrails and M coding helpers.
   Run `/haus-doctor` any time to re-check." Fill N and M from the apply output.

If anything fails, explain what happened in plain language and what you'll try
next — don't dump raw errors.
