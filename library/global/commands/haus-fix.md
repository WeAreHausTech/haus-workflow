Diagnose and fix this project's haus setup.

1. Run `haus doctor` and read the verdict.
2. If the project is already healthy, say so in one line and stop.
3. Otherwise, for each item that needs attention, run the exact fix command the
   doctor named (commonly `haus apply --write` or `haus apply --refill-config`).
4. Re-run `haus doctor` to confirm the verdict is now green.
5. Report what you changed in plain language — what was wrong, what you ran, and
   that it's now resolved.

Only run haus commands and the fixes the doctor suggests. If a fix needs a
decision you can't make safely, stop and ask in plain language.
