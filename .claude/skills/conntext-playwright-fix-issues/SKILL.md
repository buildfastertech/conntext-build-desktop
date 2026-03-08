---
name: conntext-playwright-fix-issues
description: Fix bugs found during Playwright browser testing. Reads SUMMARY.md from test results folders and fixes each issue, logging fixes to a date-specific file in a fixes folder. Use when the user says "fix test bugs", "fix playwright issues", "fix browser test issues", or runs /conntext-playwright-fix-issues.
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, TodoWrite, AskUserQuestion
---

# Fix Playwright Test Issues

This skill fixes bugs identified during Playwright browser testing by the `/conntext-playwright` skill. It reads the issues from a test results `SUMMARY.md` file and fixes them one by one, logging each fix to a date-specific file in a `fixes/` folder within the results directory.

## Quick Start

Run `/conntext-playwright-fix-issues path/to/prd-folder` after running browser tests to fix identified issues.

## Instructions

### Step 1: Validate the base directory

The skill receives a directory path as an argument. This is the PRD/plan folder that contains a `browser-tests` subdirectory.

1. **Check if the path was provided** - If not, ask the user for it
2. **Verify the path exists** using Bash `ls` command
3. **Look for `browser-tests` folder** within the provided path:
   ```bash
   ls "[provided-path]/browser-tests"
   ```

If `browser-tests` folder doesn't exist, inform the user and stop.

### Step 2: Find available results folders

List all results folders in `browser-tests/`:

```bash
# Unix/macOS/Linux/Git Bash
ls -lt "[path]/browser-tests" | grep "results-"

# PowerShell (Windows)
Get-ChildItem "[path]\browser-tests" -Directory | Where-Object { $_.Name -match "^results-" } | Sort-Object LastWriteTime -Descending | Select-Object -First 5 Name, LastWriteTime
```

Results folders follow the naming pattern: `results-v[N]-[role]/` (e.g., `results-v4-council-admin`, `results-v5-school-staff`)

### Step 3: Ask user which results folder to use

**You MUST use AskUserQuestion** to ask which results folder contains the bugs to fix.

Build the options dynamically from the last 3 most recently modified folders:

- **Question**: "Which test results folder contains the bugs to fix?"
- **Header**: "Results folder"
- **Options** (dynamic, up to 3 + Other):
  - **"[folder-1]"** - Most recently modified results folder
  - **"[folder-2]"** - Second most recent
  - **"[folder-3]"** - Third most recent
  - **"Other (specify)"** - Let user type a different folder name

If user selects "Other", ask them to specify the folder name.

### Step 4: Read the SUMMARY.md file

Read the `SUMMARY.md` file from the selected results folder:

```
File path: [base-path]/browser-tests/[selected-folder]/SUMMARY.md
```

If SUMMARY.md doesn't exist, inform the user and stop.

### Step 5: Parse issues from SUMMARY.md

Look for the `## Issues to Fix` section in SUMMARY.md. Issues are organized by priority:

```markdown
## Issues to Fix

### High Priority
- [ ] Issue description here
- [ ] Another issue here

### Medium Priority
- [ ] Issue description here

### Low Priority
- [ ] Issue description here
```

Also check for `### Critical Priority` if present.

Extract all unchecked items (`- [ ]`) from these sections.

### Step 6: Get the current date

Get the user's current local date by running:

```bash
# Unix/macOS/Linux/Git Bash
date +"%Y-%m-%d"

# PowerShell (Windows)
Get-Date -Format "yyyy-MM-dd"
```

Store this date for the fixed items filename.

### Step 7: Ask user for fix preferences

**You MUST use AskUserQuestion** to ask the user two questions:

#### Question 1: Fix Mode

- **Question**: "How would you like to fix the issues?"
- **Header**: "Fix mode"
- **Options**:
  - **"Fix all at once"** - Fix all matching issues without pausing
  - **"Fix one by one"** - Fix each issue and pause for confirmation

#### Question 2: Issue Priority

- **Question**: "Which priority levels do you want to fix?"
- **Header**: "Priority"
- **Options**:
  - **"All priorities"** - Fix all issues (Critical, High, Medium, Low)
  - **"Critical and High only"** - Only fix Critical and High priority issues
  - **"High priority only"** - Only fix High priority issues
  - **"Medium priority only"** - Only fix Medium priority issues

### Step 8: Filter issues based on user selection

Filter the unchecked items based on the priority selection:

- **All priorities**: Include all `- [ ]` items
- **Critical and High only**: Only items under `### Critical Priority` and `### High Priority`
- **High priority only**: Only items under `### High Priority`
- **Medium priority only**: Only items under `### Medium Priority`

### Step 9: Create a todo list

Use TodoWrite to track each issue that needs fixing.

### Step 10: Locate the source code

Before fixing, determine where the source code is located. Common patterns:

1. **Laravel projects**: Look for `app/`, `database/`, `resources/` directories
2. **Check the SUMMARY.md** for hints about file locations (e.g., error messages with file paths)
3. **Ask the user** if the source code location is unclear:
   - **Question**: "Where is the source code for this project located?"
   - **Header**: "Source path"

### Step 11: Fix issues according to selected mode

#### If user selected "Fix all at once":

For each unchecked `- [ ]` item:

1. **Analyze the issue** - Understand what needs to be fixed
2. **Read the relevant source file(s)** mentioned or implied by the issue
3. **Apply the fix** using the Edit tool
4. **Update SUMMARY.md** - Change `- [ ]` to `- [x]`
5. **MANDATORY: Write to the fixes file** (see Step 12)
6. **Continue to next issue**

#### If user selected "Fix one by one":

For each unchecked `- [ ]` item:

1. **Analyze the issue** - Understand what needs to be fixed
2. **Read the relevant source file(s)**
3. **Apply the fix** using the Edit tool
4. **Update SUMMARY.md** - Change `- [ ]` to `- [x]`
5. **MANDATORY: Write to the fixes file** (see Step 12)
6. **Ask user to continue** using AskUserQuestion:
   - **Question**: "Fixed: [issue summary]. Continue to the next issue?"
   - **Header**: "Continue?"
   - **Options**:
     - **"Yes, continue"** - Proceed to next issue
     - **"No, stop here"** - Stop and report progress

### Step 12: Log the fix (MANDATORY)

**YOU MUST** log each fix to a date-specific file in the `fixes/` folder.

**Fixes folder path**: `[base-path]/browser-tests/[results-folder]/fixes/`

**Fixes file path**: `[fixes-folder]/{YYYY-MM-DD}-fixes.md`

#### Procedure:

1. **Create the fixes folder** if it doesn't exist:
   ```bash
   mkdir -p "[base-path]/browser-tests/[results-folder]/fixes"
   ```

2. **Get the current local timestamp**:
   ```bash
   # Unix/macOS/Linux/Git Bash
   date +"%H:%M"

   # PowerShell (Windows)
   Get-Date -Format "HH:mm"
   ```

3. **Construct the filename**: `{YYYY-MM-DD}-fixes.md`
   - Example: `2026-01-31-fixes.md`

4. **Read existing file** (if it exists)

5. **Append or create** the fix entry

**If the file does NOT exist, create it with:**

```markdown
# Browser Test Fixes

Test Results: [results-folder-name]
Date: YYYY-MM-DD
Role: [role from SUMMARY.md]

This file logs all fixes made to address browser test failures.

---

### [HH:MM] [Brief issue title]

**Priority**: [High/Medium/Low/Critical]
**Original Issue**: [Full issue text from SUMMARY.md]

**Files Modified**:
- `path/to/file1.php` - [Brief description of change]
- `path/to/file2.php` - [Brief description of change]

**Summary of Fix**:
[Detailed description of what was changed and why]

**Verification**:
Re-run browser tests for [role] to verify this fix.

---
```

**If the file DOES exist, append:**

```markdown

### [HH:MM] [Brief issue title]

**Priority**: [High/Medium/Low/Critical]
**Original Issue**: [Full issue text from SUMMARY.md]

**Files Modified**:
- `path/to/file1.php` - [Brief description of change]

**Summary of Fix**:
[Detailed description of what was changed and why]

**Verification**:
Re-run browser tests for [role] to verify this fix.

---
```

### Step 13: Report completion

Tell the user:
- How many issues were fixed
- How many issues remain (if stopped early or filtered out)
- What priority levels were included/excluded
- The path to the fixes file
- Suggestion to re-run browser tests to verify fixes

## Example Workflow

1. User runs: `/conntext-playwright-fix-issues path/to/move-safe-conntext-plan`

2. Skill finds `browser-tests/` folder

3. Lists results folders:
   - `results-v6-platform-admin` (Jan 31 15:30)
   - `results-v5-school-staff` (Jan 31 14:45)
   - `results-v4-council-admin` (Jan 31 12:00)

4. User selects: `results-v5-school-staff`

5. Reads `SUMMARY.md`:
   ```markdown
   ## Issues to Fix

   ### Critical Priority
   - [ ] Fix SchoolArrivalsBoard.php:182 TypeError

   ### High Priority
   - [ ] School Staff sees data from all schools
   ```

6. User selects: "Fix one by one", "Critical and High only"

7. Skill fixes SchoolArrivalsBoard.php:182:
   - Reads the file
   - Adds null check
   - Updates SUMMARY.md to `- [x]`
   - Writes to `fixes/2026-01-31-fixes.md`

8. Asks: "Fixed: SchoolArrivalsBoard TypeError. Continue?"

9. User selects: "Yes, continue"

10. Continues to next issue...

11. Reports: "Fixed 2 issues. 3 low priority issues remain. Fixes logged to `results-v5-school-staff/fixes/2026-01-31-fixes.md`. Re-run `/conntext-playwright` to verify."

## File Organization

```
browser-tests/
├── results-v4-council-admin/
│   ├── SUMMARY.md
│   ├── 02-filament-journey-progression-results.md
│   └── fixes/
│       ├── 2026-01-30-fixes.md
│       └── 2026-01-31-fixes.md
├── results-v5-school-staff/
│   ├── SUMMARY.md
│   └── fixes/
│       └── 2026-01-31-fixes.md
└── INDEX.md
```

## Issue Types in Browser Tests

Browser test issues typically fall into these categories:

| Type | Description | Common Fixes |
|------|-------------|--------------|
| **500 Error** | Server-side exception | Null checks, type hints, error handling |
| **403 Forbidden** | Permission denied | Policy updates, role permissions |
| **404 Not Found** | Missing route/resource | Add routes, fix URLs |
| **Missing UI Element** | Expected button/field not present | Add Filament action, update resource |
| **Data Filtering** | Wrong data shown to user | Fix query scopes, policies |
| **Feature Missing** | Expected feature not implemented | Implement the feature |

## CRITICAL REMINDERS

### After Every Fix

After EVERY fix, you MUST:
1. Update `SUMMARY.md` (mark issue as `[x]`)
2. **USE THE WRITE TOOL** to append to `{YYYY-MM-DD}-fixes.md`

Do NOT skip writing to the fixes file. This is mandatory for tracking.

### Source Code Location

Always verify the source code location before attempting fixes. Common patterns:
- Laravel app code: `app/`, `database/migrations/`, `resources/views/`
- Filament resources: `app/Filament/Resources/`, `app/Filament/Pages/`
- Policies: `app/Policies/`
- Models: `app/Models/`

### Testing Fixes

After fixing issues, remind the user to:
1. Re-run the browser tests for the affected role
2. Check the console for any new errors
3. Verify the fix addresses the original issue
