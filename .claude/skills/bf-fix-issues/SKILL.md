---
name: bf-fix-issues
description: Fix bugs found by /bf-code-review. Reads suggested-changes.md and fixes each issue, logging all fixes to date-specific fixed items files. Use when the user says "fix code review bugs", "fix review issues", "fix review", or runs /bf-fix-issues.
allowed-tools: Bash, Read, Write, Edit, Glob, TodoWrite, AskUserQuestion
---

# Fix Code Review Issues

This skill fixes bugs identified by the `/bf-code-review` skill. It reads the pending issues from `suggested-changes.md` and fixes them one by one, logging each fix to a date-specific file (`YYYY-MM-DD-fixed-items.md`).

## Quick Start

Run `/bf-fix-issues` after running `/bf-code-review` to fix all identified issues.

## Instructions

### Step 1: Get the current date

**FIRST**, get the user's current local date by running:

```bash
# Unix/macOS/Linux/Git Bash
date +"%Y-%m-%d"

# PowerShell (Windows)
Get-Date -Format "yyyy-MM-dd"
```

Store this date - you will use it for the fixed items filename (e.g., `2026-01-10-fixed-items.md`).

### Step 2: Read the suggested changes file

Read `.claude/skills/bf-code-review/suggested-changes.md` to find unchecked items (`- [ ]`).

```
File path: .claude/skills/bf-code-review/suggested-changes.md
```

### Step 3: Ask user for fix preferences

**You MUST use AskUserQuestion** to ask the user two questions before proceeding:

#### Question 1: Fix Mode

Ask the user how they want to fix issues:

- **Question**: "How would you like to fix the issues?"
- **Header**: "Fix mode"
- **Options**:
  - **"Fix all at once"** - Fix all matching issues without pausing between each one
  - **"Fix one by one"** - Fix each issue and pause for user confirmation before moving to the next

#### Question 2: Issue Types

Ask the user which types of issues to fix:

- **Question**: "Which types of issues do you want to fix?"
- **Header**: "Issue types"
- **Options**:
  - **"All (Critical, Warnings and Informational)"** - Fix all issue types
  - **"Critical issues only"** - Only fix issues under the "### Critical" section
  - **"Warnings only"** - Only fix issues under the "### Warnings" section
  - **"Informational only"** - Only fix issues under the "### Informational" section

### Step 4: Filter issues based on user selection

Based on the user's answer to Question 2, filter the unchecked items:

- **All**: Include all `- [ ]` items from Critical, Warnings, and Informational sections
- **Critical issues only**: Only include `- [ ]` items under the `### Critical` heading
- **Warnings only**: Only include `- [ ]` items under the `### Warnings` heading
- **Informational only**: Only include `- [ ]` items under the `### Informational` heading

### Step 5: Create a todo list

Use TodoWrite to track each issue that needs fixing based on the filtered list.

### Step 6: Fix issues according to selected mode

#### If user selected "Fix all at once":

For each unchecked `- [ ]` item in the filtered list:

1. **Read the source file** mentioned in the issue
2. **Apply the fix** using the Edit tool
3. **Update suggested-changes.md** - change `- [ ]` to `- [x]`
4. **MANDATORY: Write to the date-specific fixed items file** - append an entry for the fix (see Step 7)
5. **Continue to next issue** without pausing

#### If user selected "Fix one by one":

For each unchecked `- [ ]` item in the filtered list:

1. **Read the source file** mentioned in the issue
2. **Apply the fix** using the Edit tool
3. **Update suggested-changes.md** - change `- [ ]` to `- [x]`
4. **MANDATORY: Write to the date-specific fixed items file** - append an entry for the fix (see Step 7)
5. **Ask user to continue** using AskUserQuestion:
   - **Question**: "Fixed [issue title]. Continue to the next issue?"
   - **Header**: "Continue?"
   - **Options**:
     - **"Yes, continue"** - Proceed to the next issue
     - **"No, stop here"** - Stop fixing and report progress so far

### Step 7: Log the fix to date-specific fixed items file (MANDATORY)

**YOU MUST** append an entry to the date-specific fixed items file after EVERY fix. This is NOT optional.

**File path**: `.claude/skills/bf-code-review/{YYYY-MM-DD}-fixed-items.md`

⚠️ **FILENAME FORMAT**: Date comes FIRST! `{YYYY-MM-DD}-fixed-items.md`
- ✅ `2026-01-25-fixed-items.md` (CORRECT)
- ❌ `fixed-items-2026-01-25.md` (WRONG - date must be first)

Where `{YYYY-MM-DD}` is the date obtained in Step 1 (e.g., `2026-01-10-fixed-items.md`).

**Procedure**:
1. **Get the current local timestamp** by running:
   ```bash
   # Unix/macOS/Linux/Git Bash
   date +"%H:%M"

   # PowerShell (Windows)
   Get-Date -Format "HH:mm"
   ```
   (You already have the date from Step 1)

2. **Construct the filename**: `.claude/skills/bf-code-review/{date}-fixed-items.md`
   - Format: `{YYYY-MM-DD}-fixed-items.md` (date FIRST, then `-fixed-items.md`)
   - Example: `.claude/skills/bf-code-review/2026-01-10-fixed-items.md`
   - NOT: `fixed-items-2026-01-10.md` (this is wrong!)

3. Try to Read the existing file for today's date

4. If it exists, append your new entry to the existing content

5. If it doesn't exist, create it with the header plus your entry

6. Use the Write tool to save the file

**IMPORTANT**: Always use the `date` command (Unix) or `Get-Date` (PowerShell) to get accurate local date/time. Do NOT guess.

**If the file does NOT exist, create it with this content:**

```markdown
# Code Review - Fixed Items

Date: YYYY-MM-DD

This file logs all code review fixes made on this date.

---

### [HH:MM] filename.ext

**Issue**: [Issue title from suggested-changes.md]
**Type**: [Security/Bug/Logic Error/Potential Bug/Code Quality]
**Line(s)**: [Line number(s) from the issue]

**Summary of Fix**:
[Brief description of what you changed to fix the issue]

---
```

**If the file DOES exist, append this to the end:**

```markdown

### [HH:MM] filename.ext

**Issue**: [Issue title from suggested-changes.md]
**Type**: [Security/Bug/Logic Error/Potential Bug/Code Quality]
**Line(s)**: [Line number(s) from the issue]

**Summary of Fix**:
[Brief description of what you changed to fix the issue]

---
```

### Step 8: Repeat until complete or stopped

Continue until:
- All filtered `- [ ]` items are fixed (for "Fix all at once" mode)
- User selects "No, stop here" (for "Fix one by one" mode)
- All filtered items are processed

### Step 9: Report completion

Tell the user:
- How many issues were fixed
- How many issues remain (if stopped early or filtered)
- What issue types were included/excluded
- The filename where fixes were logged (e.g., `2026-01-10-fixed-items.md`)

## Example Workflow

1. Get current date:
   ```bash
   date +"%Y-%m-%d"
   ```
   Result: `2026-01-10`

2. Read `suggested-changes.md`:
   ```markdown
   ### Critical
   - [ ] **[app/Services/PaymentService.php:45]** SQL Injection

   ### Warnings
   - [ ] **[app/Services/TicketService.php:45]** Missing null check

   ### Informational
   - [ ] **[app/Utils/helpers.php:100]** Duplicated logic
   ```

3. Ask user preferences:
   - User selects "Fix one by one"
   - User selects "Warnings only"

4. Filter to only warnings:
   - `app/Services/TicketService.php:45` - Missing null check

5. Read `app/Services/TicketService.php`

6. Apply fix using Edit tool

7. Update `suggested-changes.md`:
   ```markdown
   - [x] **[app/Services/TicketService.php:45]** Missing null check
   ```

8. Get current time:
   ```bash
   date +"%H:%M"
   ```
   Result: `15:30`

9. **Write to `2026-01-10-fixed-items.md`**:
   ```markdown
   # Code Review - Fixed Items

   Date: 2026-01-10

   This file logs all code review fixes made on this date.

   ---

   ### [15:30] app/Services/TicketService.php

   **Issue**: Missing null check
   **Type**: Potential Bug
   **Line(s)**: 45

   **Summary of Fix**:
   Added null check using optional chaining operator (`?->`) before accessing the property.

   ---
   ```

10. Ask user: "Fixed Missing null check. Continue to the next issue?"
    - User selects "No, stop here"

11. Report: "Fixed 1 warning. 1 critical issue and 1 informational issue remain (excluded by filter). Fixes logged to `2026-01-10-fixed-items.md`."

## File Organization

Fixed items are organized by date for easier tracking:

```
.claude/skills/bf-code-review/
├── suggested-changes.md          # Current issues to fix
├── 2026-01-08-fixed-items.md     # Fixes from Jan 8
├── 2026-01-09-fixed-items.md     # Fixes from Jan 9
├── 2026-01-10-fixed-items.md     # Fixes from Jan 10 (today)
└── ...
```

This makes it easy to:
- Review what was fixed on a specific day
- Track progress over time
- Avoid constantly growing single files

## CRITICAL REMINDERS

### Fixed Items Filename Format (MANDATORY)

**The filename MUST be `{YYYY-MM-DD}-fixed-items.md`** — date FIRST, then `-fixed-items.md`.

✅ CORRECT: `2026-01-25-fixed-items.md`
❌ WRONG: `fixed-items-2026-01-25.md`
❌ WRONG: `fixed-items.md`
❌ WRONG: `2026-1-25-fixed-items.md` (must zero-pad month/day)

**Pattern**: `{4-digit-year}-{2-digit-month}-{2-digit-day}-fixed-items.md`

### After Every Fix

After EVERY fix, you MUST:
1. Update `suggested-changes.md` (mark as `[x]`)
2. **USE THE WRITE TOOL** to append to `{YYYY-MM-DD}-fixed-items.md` (date-first format!)

Do NOT skip writing to the fixed items file. This is mandatory for tracking fix history.
