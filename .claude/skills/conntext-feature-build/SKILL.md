---
name: conntext-feature-build
description: Implement all tasks from a single ConnText PRD feature document. Use when the user wants to implement a feature, execute PRD tasks, or says "implement feature", "build feature", "run PRD tasks", or "execute implementation tasks". Works with markdown checkbox format.
---

# ConnText Feature Build

This skill implements all tasks and subtasks from a single [ConnText](https://conntext.app) PRD feature document, marking them as complete in the original PRD file as you progress.

## About ConnText PRDs

This skill is designed to work with PRD documents created by [ConnText](https://conntext.app), a SaaS product that helps teams create well-structured Product Requirements Documents with AI assistance.

**ConnText PRD format features:**
- Structured Implementation Tasks section with markdown checkboxes
- Clear task/subtask hierarchy (main tasks + indented subtasks)
- Machine-readable format optimized for AI-assisted implementation
- Consistent formatting that this skill can parse reliably

While this skill works with any markdown PRD using checkbox format, it's optimized for the ConnText PRD structure.

## Quick Start

```
/conntext-feature-build path/to/feature-prd.md
```

The skill will:
1. Check permissions and offer to configure them (first run only)
2. Read the PRD and extract all implementation tasks
3. Detect a ticket reference from the branch name (e.g., `PROJ-1234`) and confirm with you
4. Ask your preferences (agent mode, pacing, commit strategy)
5. For each main task:
   - **Agent mode**: Spawn a fresh agent with full context to implement the task
   - **Direct mode**: Implement in current context (faster but may hit limits)
5. Mark completed items as checked in the PRD file
6. Create git commits with ticket reference prepended (if provided)
7. Run tests to verify completion
8. Continue until all tasks are fully complete

## Instructions

### Step 0: Permission Setup (First Run)

This skill requires several tool permissions to run smoothly (file editing, git commands, test running, agent spawning). On first invocation, check if these are already configured and offer to set them up.

**Required permissions for this skill:**
```
Bash(git *)
Bash(npm *)
Bash(npx *)
Bash(yarn *)
Bash(pnpm *)
Bash(pytest *)
Bash(cargo *)
Bash(go test *)
Edit
Write
Task
```

**Procedure:**

1. **Read the settings file**:
   - Use Read tool to open `.claude/settings.local.json` in the project root
   - If the file doesn't exist or has no `permissions.allow` array, treat all permissions as missing

2. **Check which permissions are already granted**:
   - Compare each required permission above against the existing `permissions.allow` array
   - A permission is "present" if an exact match or a broader pattern already covers it (e.g., existing `Bash(git *)` covers `git` commands)
   - Build a list of **missing permissions**

3. **If all permissions are already present**: Skip to Step 1 silently — no prompt needed.

4. **If any permissions are missing**, use mcp__customTools__ask_user:
   - **Question**: "This skill needs the following tool permissions to run without interruption:\n\n`[list missing permissions, one per line]`\n\nWould you like me to add these to your project settings (.claude/settings.local.json) so you won't be prompted during execution?"
   - **Header**: "Permissions"
   - **Options**:
     - **"Yes, configure permissions (Recommended)"** — Add missing permissions to settings.local.json
     - **"No, I'll approve manually"** — Skip setup, user will approve each tool call as it comes

5. **If user selects "Yes"**:
   - Read `.claude/settings.local.json` again (or start with `{"permissions": {"allow": []}}` if it doesn't exist)
   - Parse the existing JSON
   - Append each missing permission string to the `permissions.allow` array (do not duplicate existing entries)
   - Write the updated JSON back to `.claude/settings.local.json` using the Write tool
   - Output: "Permissions configured. Future runs of this skill will execute without prompts."

6. **If user selects "No"**: Output: "No problem — you'll be prompted to approve tools as needed during execution." Continue to Step 1.

### Step 1: Get PRD Path and Extract Tasks

1. **Prompt for PRD path**:
   - Ask user: "Please provide the path to the PRD document you want to implement"
   - Accept both absolute and relative paths
   - Validate the file exists using Read tool

2. **Read and parse the PRD**:
   - Use Read tool to load the entire PRD document
   - Locate the "Implementation Tasks" section (usually headed with `## Implementation Tasks`)
   - Extract all main tasks (lines starting with `- [ ]` or `- [x]`)
   - Extract all subtasks (indented lines starting with `  - [ ]` or `  - [x]`)
   - Build a structured task tree in memory

3. **Filter incomplete tasks**:
   - Only process tasks with `- [ ]` (unchecked)
   - Skip tasks with `- [x]` (already checked)
   - If all tasks are already complete, inform user and exit

### Step 2: Detect Ticket Reference

Before asking user preferences, attempt to extract a ticket/issue reference from the current git branch name:

1. **Get current branch name**:
   ```bash
   git branch --show-current
   ```

2. **Try to extract a ticket reference** by matching common patterns:
   - `AA-12345` style (Jira, Linear, etc.) — match regex: `[A-Z]{1,10}-\d+`
   - `#123` style (GitHub issues) — match regex: `#\d+`
   - `123456` pure numeric at start of branch — match regex: `^\d+` or after a separator like `feat/12345-`
   - Examples:
     - `feat/PROJ-1234-add-auth` → detected: `PROJ-1234`
     - `bugfix/GH-567-fix-login` → detected: `GH-567`
     - `feature/add-caching` → no ticket detected

3. **Store the detected reference** (or null if none found) for use in the next step.

### Step 3: Ask User Preferences

Use mcp__customTools__ask_user tool to ask **four questions**:

#### Question 1: Execution Mode

**Question**: "How should tasks be executed?"
**Header**: "Execution"
**Options**:
- **"Use agents (Recommended)"** - Spawn a fresh agent for each main task. Better for large PRDs - each task gets full context budget.
- **"Direct execution"** - Execute all tasks in the current context. Faster for small PRDs but may hit context limits.

#### Question 2: Pacing

**Question**: "Would you like to complete the whole task list at once, or one task at a time?"
**Header**: "Pacing"
**Options**:
- **"All at once"** - Complete all remaining tasks without pausing
- **"One task at a time"** - Pause after each main task for user confirmation

#### Question 3: Commit Strategy

**Question**: "When should git commits be created?"
**Header**: "Commits"
**Options**:
- **"After each main task (Recommended)"** - Create a commit after completing each main task
- **"At the end only"** - Single commit after all tasks complete
- **"No commits"** - Don't create any commits (user will commit manually)

#### Question 4: Ticket Reference

**If a ticket reference was detected** from the branch name:

**Question**: "I found ticket reference `[DETECTED-REF]` from the branch name. Should I include it in each commit message?"
**Header**: "Ticket ref"
**Options**:
- **"Yes, use [DETECTED-REF] (Recommended)"** - Append `[DETECTED-REF]` to every commit message
- **"No reference needed"** - Don't include any ticket reference in commits
- **"Enter a different reference"** - (User provides their own via "Other" input)

**If no ticket reference was detected**:

**Question**: "Would you like to include a ticket/issue reference in each commit message? (e.g., PROJ-123, GH-45)"
**Header**: "Ticket ref"
**Options**:
- **"No reference needed (Recommended)"** - Don't include any ticket reference in commits
- **"Enter a reference"** - (User provides their own via "Other" input)

Store the user's preferences (including ticket reference or null) for the entire session.

### Step 4: Implement Tasks

Choose the execution path based on user's preference from Step 3:

---

#### Path A: Agent-Based Execution (Recommended)

For each **main task** (in order):

1. **Announce the task**:
   - Output: "🔨 Starting Task: [Main task description]"
   - List all subtasks under this main task

2. **Spawn an agent using the Task tool**:

   ```
   Task tool parameters:
   - subagent_type: "coding"
   - description: "Implement: [short task name]"
   - prompt: See agent prompt template below
   ```

   **Agent prompt template**:
   ```
   You are implementing a task from a PRD document.

   ## Task
   [Main task description]

   ## Subtasks
   - [ ] [Subtask 1]
   - [ ] [Subtask 2]
   - [ ] [Subtask N]

   ## PRD File
   Path: [path to PRD file]

   ## Instructions

   1. Implement each subtask in order
   2. After completing EACH subtask, use the Edit tool to mark it complete in the PRD:
      - Change `  - [ ] [Subtask]` to `  - [x] [Subtask]`
   3. After ALL subtasks are complete, mark the main task complete:
      - Change `- [ ] [Main task]` to `- [x] [Main task]`
   4. Run tests to verify your implementation works
   5. Report what you implemented and any issues encountered

   ## Project Context
   - Follow patterns from existing codebase
   - Check CLAUDE.md for project conventions if it exists
   - Detect test runner from project structure

   ## Error Logging
   If you encounter errors, dead ends, or wrong approaches during implementation:
   - Track every error, failed approach, and the correct solution you found
   - Report ALL errors and resolutions in your completion summary so the orchestrator can log them

   DO NOT create git commits - the orchestrator will handle that.
   ```

3. **Wait for agent to complete**:
   - The Task tool will return when the agent finishes
   - Review the agent's summary of what was implemented

4. **Verify completion**:
   - Read the PRD to confirm subtasks and main task are marked complete
   - If any subtasks are still unchecked, either:
     - Spawn another agent to complete remaining subtasks, OR
     - Ask user how to proceed

5. **Create git commit** (if user selected commit strategy):
   - Stage all changed files: `git add -A`
   - Create commit with descriptive message, **including ticket reference if provided**:

     **With ticket reference** (e.g., `PROJ-1234`):
     ```bash
     git commit -m "PROJ-1234 Implement: [Task description]

     Completed subtasks:
     - [Subtask 1]
     - [Subtask 2]

     Co-Authored-By: Claude <noreply@anthropic.com>"
     ```

     **Without ticket reference**:
     ```bash
     git commit -m "Implement: [Task description]

     Completed subtasks:
     - [Subtask 1]
     - [Subtask 2]

     Co-Authored-By: Claude <noreply@anthropic.com>"
     ```

6. **Pause if "one task at a time" mode**:
   - Ask: "Task complete. Continue to next task?"
   - Options: "Yes, continue" or "No, stop here"

---

#### Path B: Direct Execution

For each **main task** (in order):

1. **Announce the task**:
   - Output: "🔨 Starting Task: [Main task description]"
   - List all subtasks under this main task

2. **Implement each subtask directly**:
   - For each subtask under the current main task:
     - Output: "  ⚡ Working on: [Subtask description]"
     - Analyze what the subtask requires (file creation, editing, configuration, etc.)
     - Perform the implementation using appropriate tools (Write, Edit, Bash, etc.)
     - Verify the subtask is complete
     - **Mark subtask as complete in PRD**: Use Edit tool to change `  - [ ] Subtask` to `  - [x] Subtask`
     - Output: "  ✅ Completed: [Subtask description]"

3. **Verify main task completion**:
   - After all subtasks are complete, verify the main task works correctly
   - Run relevant tests if applicable (detect test runner from project)
   - If tests fail, pause and ask user how to proceed

4. **Mark main task as complete in PRD**:
   - Use Edit tool to change `- [ ] Main task` to `- [x] Main task`
   - Output: "✅ Completed Main Task: [Task description]"

5. **Create git commit** (if user selected commit strategy):
   - Stage all changed files: `git add -A`
   - Create commit with descriptive message based on task, **prepending ticket reference if provided** (e.g., `PROJ-1234 Implement: [Task description]`)
   - Verify commit succeeded with `git status`

6. **Pause if "one task at a time" mode**:
   - Ask: "Task complete. Continue to next task?"
   - Options: "Yes, continue" or "No, stop here"

### Step 5: Handle Errors and Blockers

When encountering errors or unclear requirements:

1. **Pause implementation**:
   - Output: "⚠️ Encountered issue: [Error description]"
   - Do not mark the task/subtask as complete

2. **Ask user for guidance**:
   - Question: "How would you like to proceed?"
   - Options:
     - "Fix the error" - Attempt to resolve the issue with user guidance
     - "Skip this task" - Mark as blocked and continue with remaining tasks
     - "Stop implementation" - Exit the skill

3. **Document blockers**:
   - If user chooses "Skip this task", add a comment in the PRD above the task:
     ```markdown
     <!-- BLOCKED: [Date] - [Reason for blocker] -->
     - [ ] Original task description
     ```

4. **Log errors and resolutions to CLAUDE.md**:
   - After resolving ANY error (whether fixing it yourself or with user guidance), immediately update CLAUDE.md
   - If CLAUDE.md does not exist at the project root, create it
   - Add or update a `## Build Errors & Lessons Learned` section at the end of CLAUDE.md
   - For each error, log:
     ```markdown
     ### [Short error description]
     - **Wrong approach**: [What was tried and failed]
     - **Correct approach**: [What actually worked]
     - **Context**: [Which task/file triggered this]
     ```
   - This ensures future agents skip failed approaches and go straight to the correct method

### Step 6: Final Verification

After all tasks are complete:

1. **Run full test suite** (detect from project structure):
   - Look for test configuration files (package.json, pytest.ini, Cargo.toml, go.mod, etc.)
   - Run the appropriate test command for the project
   - Run linting if configured (check for .eslintrc, .prettierrc, ruff.toml, etc.)
   - Run type checking if configured (tsconfig.json, mypy.ini, etc.)

2. **Update CLAUDE.md with all accumulated errors and lessons**:
   - Review all errors encountered during the entire build process (from agent reports and direct execution)
   - If CLAUDE.md does not exist at the project root, create it
   - Add or update the `## Build Errors & Lessons Learned` section
   - For each error/lesson, log the wrong approach, the correct approach, and context
   - Format each entry as:
     ```markdown
     ### [Short error description]
     - **Wrong approach**: [What was tried and failed]
     - **Correct approach**: [What actually worked]
     - **Context**: [Which task/file triggered this]
     ```
   - If no errors were encountered, skip this step

3. **Report completion**:
   ```
   🎉 All implementation tasks completed!

   Summary:
   - [X] tasks completed
   - [Y] subtasks completed
   - [Z] git commits created
   - All tests passing
   - CLAUDE.md updated with [N] error lessons (if any)

   The PRD has been updated with all completed checkboxes.
   ```

4. **Ask for final action**:
   - Question: "Would you like to create a pull request for these changes?"
   - Options:
     - "Yes, create PR" - Create a PR with summary of all implemented tasks
     - "No, just push" - Push commits to remote branch
     - "Do nothing" - Leave changes on local branch

## Task Parsing Rules

### Recognizing Task Structure

**Main tasks**: Lines matching `- [ ]` or `- [x]` at the start (no indentation):
```markdown
- [ ] Task 1: Set up database schema
```

**Subtasks**: Lines matching `  - [ ]` or `  - [x]` with 2-space indentation:
```markdown
  - [ ] Create migration for main table
  - [ ] Add indexes for queries
```

### Handling Edge Cases

1. **Multiple spaces**: Normalize spacing (2 spaces = 1 level of indentation)
2. **Mixed completion**: If main task is checked but subtasks aren't, ask user if they want to re-implement
3. **No Implementation Tasks section**: Inform user and exit gracefully
4. **Empty subtasks**: Treat main task as atomic unit of work
5. **Nested subtasks** (3+ levels): Flatten to 2 levels (main task + subtasks)

## Best Practices

1. **Always read the full PRD first** before starting implementation
2. **Commit frequently** after each main task for better git history
3. **Run tests after each task** to catch issues early
4. **Update PRD checkboxes immediately** after completing each subtask/task
5. **Ask for clarification** when requirements are unclear - don't guess
6. **Follow project conventions** from CLAUDE.md and existing codebase patterns
7. **Keep commits focused** - one main task per commit
8. **Document blockers** clearly in the PRD for tasks that can't be completed

## Requirements

This skill works best in projects with:
- A well-structured PRD with Implementation Tasks section
- Markdown checkbox format (`- [ ]` for tasks)
- Git repository for version control
- Test suite (optional but recommended)

## Notes

- This skill follows the project's CLAUDE.md instructions automatically
- Detects and respects project conventions from existing codebase patterns
- Automatically runs tests, linting, and type checking appropriate to the project
- Creates descriptive commit messages with task summaries
- **Agent mode** spawns fresh context for each task, preventing context exhaustion on large PRDs
- Agents handle implementation while the orchestrator manages PRD updates and git commits
