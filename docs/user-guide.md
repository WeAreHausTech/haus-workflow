# Haus AI — User guide (no coding required)

This guide helps you try **Haus AI** on a real project folder using only **copy-and-paste** steps in a terminal. You do not need to read code or edit program files.

---

## What Haus does (in plain language)

Haus looks at your project the way a technical teammate would: it notices languages, frameworks, and tools, then suggests a **small set of AI helpers** (skills, rules, and safety checks) that fit **your** stack. When you approve, it writes a few standard folders so **Claude Code** (or similar tools) can follow Haus rules and stay safer around secrets and risky commands.

After a successful run you will usually see:

- **`.claude/`** — settings and helper files for Claude in this project
- **`.haus-ai/`** — Haus metadata (what was detected, what was chosen, lock information)

You can delete those folders later if you want to remove Haus from the project (see [Undo Haus](#undo-haus-if-you-want-to-remove-it)).

---

## What you need on your computer

1. **A project folder** on your machine (your app, website, or service — the folder you open when you work on it).

2. **Node.js** (version **22 or newer**).

   - Check: open Terminal (Mac) or Command Prompt / PowerShell (Windows), paste the line below, press Enter, and look at the number at the start (it should be `v22`, `v23`, or higher).

   ```bash
   node --version
   ```

   - If you see an error or a number lower than 22, install Node from [https://nodejs.org](https://nodejs.org) (choose the current LTS if it is 22+, otherwise the “Current” installer). Then open a **new** terminal window and run `node --version` again.

---

## Open a terminal “inside” your project

Haus always runs **from the project folder** you want to set up.

### Mac

1. Open **Terminal** (Spotlight: press Command + Space, type `Terminal`, press Enter).
2. Type `cd ` (with a space after `cd`).
3. In Finder, drag your **project folder** onto the Terminal window. The path appears after `cd `.
4. Press **Enter**. You are now “in” that project for the next commands.

### Windows

1. Open **PowerShell** or **Command Prompt**.
2. Type `cd ` then paste the full path to your project folder (for example `cd C:\Users\You\Documents\my-app`).
3. Press **Enter**.

---

## Install Haus on your machine

Pick **one** path. If someone from Haus already gave you a **`.tgz` file**, use **Option A**. If you are testing from the **Haus AI git folder** on your disk, use **Option B** (or ask a developer to produce a `.tgz` for Option A).

### Option A — Install from a package file (simplest for non-developers)

Your teammate runs `yarn pack` (or `npm pack`) in the Haus AI repo and sends you the **`.tgz` file** that command prints (the exact filename appears in their terminal; it usually contains the version number, for example `haus-ai-0.1.0.tgz`).

1. Save that file somewhere easy to find (for example your **Downloads** folder).

2. In the terminal, go to the folder that contains the file. Example on Mac if the file is in Downloads:

   ```bash
   cd ~/Downloads
   ```

3. Install Haus globally (replace the filename with the real name of your `.tgz` file):

   ```bash
   npm install -g ./YOUR-FILE-NAME.tgz
   ```

4. Confirm the tool is there:

   ```bash
   haus --help
   ```

   You should see a list of commands. If you see “command not found”, close the terminal, open a new one, and try `haus --help` again.

### Option B — Link from a cloned Haus AI repository (for internal testers)

Someone on your team clones the Haus AI repo, installs dependencies, and builds it. Then they tell you the **full path** to that folder (for example `/Users/you/Documents/GitHub/haus-ai-workflow`).

1. In a terminal, go to that Haus AI folder:

   ```bash
   cd /path/to/haus-ai-workflow
   ```

   (Replace with the real path.)

2. Install and build (they may do this once for you):

   ```bash
   corepack enable
   yarn install
   yarn build
   ```

3. Register the tool on your machine:

   ```bash
   npm link
   ```

4. Open a **new** terminal, go to **your project folder** (see previous section), then link Haus into this project:

   ```bash
   cd /path/to/your-project
   npm link @haus/ai
   ```

5. Check:

   ```bash
   haus --help
   ```

If `haus` is still not found, use the full path to the built file (your developer can give you this line). Example:

```bash
node /path/to/haus-ai-workflow/dist/cli.js --help
```

For the rest of this guide, wherever you see `haus`, you can paste that `node …/dist/cli.js` line instead.

---

## Run Haus on your project (recommended path)

These commands must be run **from your project folder** (not from the Haus AI repo folder).

### Step 1 — Guided setup (questions + scan)

Copy and paste:

```bash
haus setup-project
```

- If it asks how you want to set up, choose **guided** if you want a few plain-language questions, or **fast** if you only want a quick scan.
- Answer the questions in your own words (you do not need to name frameworks).
- At the end it may ask whether to **write files**. If you are not ready, say **no**; you can run the write step later (Step 3).

### Step 2 — (Optional) See the plan without writing files

If you skipped writing during setup, you can still preview:

```bash
haus scan --json
haus recommend --json
haus explain-context --json
haus context --task "your task here" --json
haus apply --dry-run
```

`--json` means “machine-readable output”; you can ignore the details or share the output with a teammate.

### Step 3 — Write the Haus files (when you are ready)

```bash
haus apply --write
```

This creates or updates `.claude/` and `.haus-ai/` in **this** project.

To remove those folders later (for example on a throwaway copy), run `haus undo` in the same project folder, or use `haus undo --yes` to skip the confirmation prompt.

### Step 4 — Quick health check

```bash
haus doctor
```

You want to see a line like **HOOKS OK** when settings exist. For a check that only looks at hooks:

```bash
haus doctor --hooks
```

If something failed, see [If something goes wrong](#if-something-goes-wrong).

---

## Using Claude Code after Haus is installed

If your team uses **Claude Code**:

1. Install the Haus plugin once on your machine (a teammate may do this for you):

   ```bash
   haus plugin install
   ```

2. Open your project in Claude Code as usual. The new `.claude` settings tell Claude to use Haus hooks (context, memory, guards) when your team has enabled them.

You do not need to edit hook JSON yourself; Haus keeps it aligned with the shipped **plugin hook file**.

---

## If something goes wrong

| What you see                                                            | What it usually means                             | What to try                                                                                                                               |
| ----------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `command not found: haus`                                               | The tool is not on your PATH                      | Re-open the terminal, or repeat install / link, or use the `node …/dist/cli.js` form your developer gave you                              |
| Error about **plugin/hooks/hooks.json** missing                         | The Haus package on disk is incomplete            | Reinstall from a fresh `.tgz` built with `yarn pack`; only use `HAUS_HOOKS_FALLBACK=1` if a developer tells you to (temporary dev escape) |
| `doctor --hooks` fails after you edited `.claude/settings.json` by hand | The file no longer matches the official hook list | Run `haus apply --write` again to regenerate from the package, or restore from backup                                                     |
| You are not in the right folder                                         | Haus scanned the wrong project                    | `cd` to your real project root (where `package.json` or your main code lives) and run the commands again                                  |

For deeper troubleshooting, share the **exact error text** and which **step** you were on with your team.

---

## Undo Haus (if you want to remove it)

1. Make sure you do not need anything inside `.claude` or `.haus-ai` (ask your team if unsure).
2. Delete the folders **`.claude`** and **`.haus-ai`** from your project (Finder / File Explorer is fine), or run `haus undo` in a terminal opened in that project (`haus undo --yes` skips the prompt).
3. Optionally uninstall the global tool:

   ```bash
   npm uninstall -g @haus/ai
   ```

---

## Short glossary

| Term               | Meaning                                                                              |
| ------------------ | ------------------------------------------------------------------------------------ |
| **Terminal**       | A text window where you run commands by typing (or pasting) lines and pressing Enter |
| **`cd`**           | “Change directory” — go to a folder                                                  |
| **Project folder** | The top-level folder of the product you are working on                               |
| **`haus`**         | The Haus command-line program you installed                                          |
| **`.tgz`**         | A packed software file your team can send you for easy install                       |

---

## Where to read next (optional)

- Technical setup details: [Setup guide](setup-guide.md)
- Command list: [CLI reference](cli.md)
- Why hooks work the way they do: [Plugin](plugin.md) and [Architecture](architecture.md)
