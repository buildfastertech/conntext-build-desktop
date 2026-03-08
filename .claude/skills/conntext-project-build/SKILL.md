---
name: conntext-project-build
description: Build an entire project from a ConnText build plan by iterating through the Implementation Checklist features. Use when the user says "build project", "run build plan", "implement all features", or wants to execute a ConnText project plan with multiple feature PRDs.
---

# ConnText Project Build

This skill orchestrates the implementation of an entire project from a ConnText build plan file. It iterates through the Implementation Checklist, creating a branch for each feature, implementing all tasks from the feature's PRD, and marking features complete as they're finished.

## About ConnText Build Plans

This skill is designed to work with build plan documents created by [ConnText](https://conntext.app). A build plan contains:

- **Project Overview** - High-level description of the project
- **Glossary** - Key terms and definitions
- **Architecture Overview** - System design and components
- **Implementation Checklist** - List of features with links to individual PRD files
- **Development Guidelines** - Coding standards and practices

Each feature in the checklist links to a detailed PRD file with tasks, acceptance criteria, and implementation details.

## Quick Start

```
/conntext-project-build path/to/build-plan.md
```

The skill will:
1. Check permissions and offer to configure them (first run only)
2. Parse the build plan and extract the Implementation Checklist
3. For each unchecked feature (in order):
   - Create a short feature branch
   - Read the linked PRD file
   - Implement all tasks from the PRD using agents
   - Mark the feature complete in the build plan
   - Commit and optionally merge/PR
4. Continue until all features are complete

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
Bash(gh pr *)
Bash(gh api *)
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

4. **If any permissions are missing**, use AskUserQuestion:
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

### Step 1: Get Build Plan Path and Parse

1. **Prompt for build plan path**:
   - Ask user: "Please provide the path to the ConnText build plan file"
   - Accept both absolute and relative paths
   - Validate the file exists using Read tool

2. **Read and parse the build plan**:
   - Use Read tool to load the build plan
   - Locate the "Implementation Checklist" section (headed with `## 4. Implementation Checklist` or similar)
   - Extract all feature items matching the pattern:
     ```
     - [ ] **Feature Name:** Description [View PRD](./feature-prd-file.md)
     ```
     OR the simpler format:
     ```
     - [ ] **Feature Name**: Description [View PRD](./feature-prd.md)
     ```
   - Store the feature name, description, PRD path, and completion status

3. **Determine the base directory**:
   - The PRD paths are relative to the build plan file
   - Calculate absolute paths for each PRD file

4. **Filter incomplete features**:
   - Only process features with `- [ ]` (unchecked)
   - Skip features with `- [x]` (already checked)
   - If all features are complete, inform user and exit

### Step 2: Ask User Preferences

Use AskUserQuestion tool to ask **three questions**:

#### Question 1: Execution Mode

**Question**: "How should features be implemented?"
**Header**: "Execution"
**Options**:
- **"Use agents (Recommended)"** - Spawn agents to implement each feature's PRD tasks. Best for large projects.
- **"Direct execution"** - Implement all features in current context. Risk of context exhaustion.

#### Question 2: Branch Strategy

**Question**: "How should feature branches be handled?"
**Header**: "Branches"
**Options**:
- **"Create branch per feature (Recommended)"** - Create a new branch for each feature, merge/PR when done
- **"Single branch"** - All features on current branch (no branch switching)

#### Question 3: After Feature Completion

**Question**: "What should happen after each feature is complete?"
**Header**: "After feature"
**Options**:
- **"Create PR and continue"** - Create a pull request for the feature branch, then start next feature
- **"Merge to main and continue"** - Merge feature branch to main, then start next feature
- **"Pause for review"** - Stop after each feature for manual review before continuing

### Step 3: Implement Features

For each **unchecked feature** (in order):

---

#### 3.1: Create Feature Branch (if branch strategy selected)

1. **Generate short branch name** (Windows-safe, max 30 chars):
   - Extract key words from feature name
   - Format: `feat/[short-name]`
   - Examples:
     - "Implement Client-Side Caching for Asset Data" → `feat/client-cache`
     - "Asset Preview and Management" → `feat/asset-preview`
     - "Basic Prompt Saving and Loading" → `feat/prompt-save`
   - Remove special characters, use lowercase with hyphens

2. **Create and checkout the branch**:
   ```bash
   git -C "/path/to/project" checkout -b feat/[short-name]
   ```
   Always use `git -C` with the project root path — never `cd /path && git ...`.

3. **Announce the feature**:
   - Output: "🚀 Starting Feature: [Feature Name]"
   - Output: "📁 Branch: feat/[short-name]"
   - Output: "📄 PRD: [PRD filename]"

---

#### 3.2: Read and Parse Feature PRD

1. **Read the PRD file** using the path from the checklist
2. **Extract implementation sections**:
   - Look for checkbox items in sections like:
     - `## Functional Requirements`
     - `## Acceptance Criteria`
     - `## Edge Cases & Error Handling`
     - `## Security Considerations`
   - These become the tasks to implement

---

#### 3.3: Implement Feature Tasks

**If using agents** (recommended):

Spawn an agent using the Task tool:

```
Task tool parameters:
- subagent_type: "coding"
- description: "Implement: [Feature name]"
- prompt: See agent prompt template below
```

**Agent prompt template**:
```
You are implementing a feature from a ConnText project.

## Feature
[Feature name]

## PRD File
Path: [path to PRD file]

Read the PRD file and implement ALL checkbox items found in:
- Functional Requirements
- Acceptance Criteria
- Edge Cases & Error Handling
- Security Considerations

## Instructions

1. Read the full PRD to understand the feature
2. Implement each checkbox requirement
3. After completing EACH requirement, mark it complete in the PRD:
   - Change `- [ ] Requirement` to `- [x] Requirement`
4. Run tests to verify your implementation
5. Report what you implemented and any issues

## Bash Command Rules (CRITICAL)

**NEVER combine `cd` with any other command using `&&`.** Claude Code has a hardcoded security check that blocks `cd && git` and similar compound commands with no option to save approval.

### For git commands — always use `git -C` instead of `cd && git`:

```bash
# ❌ NEVER — triggers unskippable security prompt every time:
cd /path/to/project && git checkout -b feat/branch
cd /path/to/project && git add -A
cd /path/to/project && git commit -m "..."

# ✅ ALWAYS — use git's built-in -C flag:
git -C "/path/to/project" checkout -b feat/branch
git -C "/path/to/project" add -A
git -C "/path/to/project" commit -m "..."
```

### For all other commands — use two separate Bash calls:

```bash
# ❌ NEVER:
cd /path/to/project && php artisan test

# ✅ ALWAYS — two separate Bash calls:
cd /path/to/project
php artisan test
```

The `git -C "/path"` flag tells git to operate as if run from that directory — no `cd` needed at all.

## Project Context
- Follow patterns from existing codebase
- Check CLAUDE.md for project conventions
- Reference the Architecture Overview and Development Guidelines from the build plan

## Error Logging
If you encounter errors, dead ends, or wrong approaches during implementation:
- Track every error, failed approach, and the correct solution you found
- Report ALL errors and resolutions in your completion summary so the orchestrator can log them

DO NOT create git commits - the orchestrator handles that.
```

**If direct execution**:
- Implement each checkbox item directly
- Mark items complete as you go
- Follow existing codebase patterns

---

#### 3.4: Verify and Commit

1. **Verify PRD tasks are complete**:
   - Re-read the PRD file
   - Check all checkbox items are marked `[x]`
   - If incomplete, spawn another agent or ask user

2. **Run tests** (detect from project structure):
   - **Always use two separate Bash calls** — first `cd` to the project root, then run the test command. Never chain them with `&&`.
   - Execute appropriate test commands
   - If tests fail, pause and ask user

3. **Create git commit**:
   - Always use `git -C "/path/to/project"` — never chain `cd && git`
   ```bash
   git -C "/path/to/project" add -A
   git -C "/path/to/project" commit -m "feat: [Feature name]

   Implemented from ConnText PRD:
   - [Key requirement 1]
   - [Key requirement 2]
   - [Key requirement N]

   Co-Authored-By: Claude <noreply@anthropic.com>"
   ```

---

#### 3.5: Mark Feature Complete in Build Plan

Use Edit tool to update the build plan:
- Change `- [ ] **Feature Name**:` to `- [x] **Feature Name**:`

Output: "✅ Feature Complete: [Feature Name]"

---

#### 3.6: Handle Branch (based on user preference)

**If "Create PR and continue"**:
```bash
git -C "/path/to/project" push -u origin feat/[short-name]
gh pr create --title "feat: [Feature name]" --body "Implemented [Feature name] from ConnText PRD"
git -C "/path/to/project" checkout main
git -C "/path/to/project" pull
```

**If "Merge to main and continue"**:
```bash
git -C "/path/to/project" checkout main
git -C "/path/to/project" merge feat/[short-name]
git -C "/path/to/project" push
git -C "/path/to/project" branch -d feat/[short-name]
```

**If "Pause for review"**:
- Ask: "Feature [name] complete. Ready to continue to next feature?"
- Options: "Yes, continue" or "No, stop here"

---

### Step 4: Handle Errors and Blockers

When encountering errors:

1. **Pause and report**:
   - Output: "⚠️ Issue with feature [name]: [Error]"

2. **Ask user**:
   - Options:
     - "Retry the feature" - Spawn new agent to try again
     - "Skip this feature" - Mark as blocked, continue to next
     - "Stop build" - Exit the skill

3. **Document blockers** in build plan:
   ```markdown
   <!-- BLOCKED: [Date] - [Reason] -->
   - [ ] **Feature Name**: ...
   ```

4. **Log errors and resolutions to CLAUDE.md**:
   - After resolving ANY error (whether fixing it yourself, via retry, or with user guidance), immediately update CLAUDE.md
   - If CLAUDE.md does not exist at the project root, create it
   - Add or update a `## Build Errors & Lessons Learned` section at the end of CLAUDE.md
   - For each error, log:
     ```markdown
     ### [Short error description]
     - **Wrong approach**: [What was tried and failed]
     - **Correct approach**: [What actually worked]
     - **Context**: [Which feature/task/file triggered this]
     ```
   - This ensures future agents skip failed approaches and go straight to the correct method

### Step 5: Update CLAUDE.md with All Lessons Learned

After all features are processed (before the final report):

1. **Collect all errors from agent reports and direct execution**
2. **If CLAUDE.md does not exist** at the project root, create it
3. **Add or update the `## Build Errors & Lessons Learned` section** with every error and resolution from the entire build
4. Format each entry as:
   ```markdown
   ### [Short error description]
   - **Wrong approach**: [What was tried and failed]
   - **Correct approach**: [What actually worked]
   - **Context**: [Which feature/task/file triggered this]
   ```
5. If no errors were encountered across all features, skip this step

### Step 6: Final Report

After all features are complete:

```
🎉 Project Build Complete!

Summary:
- [X] features implemented
- [Y] PRD files processed
- [Z] branches created
- All tests passing
- CLAUDE.md updated with [N] error lessons (if any)

The build plan has been updated with all completed features.
```

## Branch Naming Rules

To avoid Windows path length issues, branch names are kept short:

| Feature Name | Branch Name |
|--------------|-------------|
| Implement Client-Side Caching for Asset Data | `feat/client-cache` |
| Introduce Basic Rate Limiting for API Endpoints | `feat/rate-limit` |
| Asset Preview and Management | `feat/asset-preview` |
| Asynchronous Thumbnail Processing with Queue | `feat/async-thumb` |
| Basic Prompt Saving and Loading | `feat/prompt-save` |
| AI-Powered Prompt Optimization | `feat/ai-prompt` |

**Rules**:
- Max 30 characters total
- Prefix: `feat/`
- Use 2-3 key words from feature name
- Lowercase, hyphens only
- No special characters

## Build Plan Format

Expected format for the Implementation Checklist:

```markdown
## 4. Implementation Checklist

- [ ] **Implement Client-Side Caching for Asset Data:** Improve performance by caching asset data. [View PRD](./implement-client-side-caching-prd.md)
- [ ] **Asset Preview and Management:** Allow users to preview and manage assets. [View PRD](./asset-preview-prd.md)
- [x] **Basic Authentication:** User login and registration. [View PRD](./auth-prd.md)
```

## Best Practices

1. **Start with a clean working directory** - No uncommitted changes
2. **Ensure main branch is up to date** before starting
3. **Use agent mode** for projects with many features
4. **Create PRs** for better code review workflow
5. **Run tests frequently** to catch issues early
6. **Keep branches short-lived** - Merge quickly to avoid conflicts
7. **Never use compound Bash commands** - Always use separate `cd` and command calls, never `cd /path && command`. This ensures permission patterns in `.claude/settings.local.json` match correctly on all platforms.

## Notes

- This skill orchestrates the entire project build from a single command
- Each feature gets its own branch for clean git history
- Agents get fresh context per feature, preventing exhaustion
- Build plan is updated in real-time as features complete
- Compatible with GitHub PR workflow via `gh` CLI
