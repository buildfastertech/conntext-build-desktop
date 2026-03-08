---
name: conntext-playwright
description: Generate Playwright test sheets from ConnText PRDs or run browser tests. Use when the user says "generate test sheets", "create playwright tests", "run browser tests", "test PRDs", or wants to create/run E2E tests from PRD user stories. Supports role-based test separation for multi-user applications.
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Task, AskUserQuestion
---

# ConnText Playwright

This skill generates Playwright-compatible test sheets from ConnText PRD documents or runs existing tests, tracking results in versioned folders.

## Prerequisites: Playwright MCP Installation

**This skill requires the Playwright MCP server to be installed and configured.** Before using this skill, ensure Playwright MCP is set up for your environment.

### Check if Playwright MCP is Already Installed

If you can see `mcp__playwright__browser_*` tools available in Claude Code, you're good to go. If not, follow the installation steps below.

### Installation by Environment

The official package is [`@playwright/mcp`](https://www.npmjs.com/package/@playwright/mcp) from Microsoft. Browser binaries are installed automatically on first use.

#### Claude Code CLI (Terminal)

Add to your `~/.claude/settings.json`:
```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    }
  }
}
```

Then restart Claude Code to load the MCP server.

#### VS Code with Claude Extension

1. **Open VS Code Settings** (Ctrl/Cmd + ,)
2. **Search for** "Claude MCP" or navigate to Extensions → Claude → MCP Servers
3. **Add the Playwright MCP configuration**:
   ```json
   {
     "claude.mcpServers": {
       "playwright": {
         "command": "npx",
         "args": ["-y", "@playwright/mcp@latest"]
       }
     }
   }
   ```
4. **Reload VS Code** (Ctrl/Cmd + Shift + P → "Reload Window")

#### Cursor IDE

1. **Open Cursor Settings** → MCP → Add new MCP Server
2. **Name it** "playwright" (or similar)
3. **Set command type** with command:
   ```
   npx @playwright/mcp@latest
   ```

Or add manually to your MCP config:
```json
{
  "playwright": {
    "command": "npx",
    "args": ["-y", "@playwright/mcp@latest"]
  }
}
```

4. **Restart Cursor**

#### Windows-Specific Notes

- Use **PowerShell** or **Git Bash** for npm commands
- If `npx` isn't recognized, ensure Node.js is in your PATH
- Requires Node.js 18 or newer

#### macOS/Linux Notes

- Requires Node.js 18 or newer
- On macOS, Homebrew users can ensure Node.js is current: `brew upgrade node`

### Verify Installation

After installation and restart, ask Claude: **"Can you take a browser snapshot?"**

If Claude responds with browser tools or attempts to use `mcp__playwright__browser_snapshot`, the installation was successful.

### Troubleshooting

| Issue | Solution |
|-------|----------|
| "Browser not installed" error | Browsers auto-install on first use; check network/firewall |
| MCP tools not appearing | Restart Claude Code/IDE completely |
| npx not found | Install Node.js 18+ from https://nodejs.org |
| Timeout errors | Check firewall/proxy settings |
| Old Node.js version | Upgrade to Node.js 18 or newer |

---

## About This Skill

This skill works with [ConnText](https://conntext.app) PRD documents to:
1. **Generate Test Sheets** - Create markdown test checklists from PRD user stories that Playwright MCP can execute
2. **Run Tests** - Execute full or section-specific browser tests and generate versioned results

## Quick Start

```
/conntext-playwright path/to/prds-folder
```

## Instructions

### Step 1: Get Folder Path

1. **Prompt for PRD folder path** (if not provided):
   - Ask user: "Please provide the path to the folder containing your ConnText PRD files"
   - Accept both absolute and relative paths
   - Validate the folder exists using Bash `ls` command

2. **Store the base path** for use throughout the skill

### Step 2: Ask Primary Action

Use AskUserQuestion tool:

**Question**: "What would you like to do?"
**Header**: "Action"
**Options**:
- **"Generate test sheets"** - Create browser-tests folder with test sheets from PRDs
- **"Run tests"** - Execute Playwright tests from existing test sheets

Store the selection and branch to the appropriate workflow.

---

## Workflow A: Generate Test Sheets

### A.1: Scan PRD Files

1. **Find all PRD markdown files** in the specified folder:
   ```bash
   ls [folder-path]/*.md
   ```

2. **Create the browser-tests folder**:
   ```bash
   mkdir -p [folder-path]/browser-tests
   ```

3. **Announce discovery**:
   - Output: "Found [N] PRD files to process"
   - List each PRD filename

### A.2: Process Each PRD

For each `.md` file in the PRD folder:

1. **Read the PRD file** using Read tool

2. **Extract testable content**:
   - **User Stories**: Look for sections like `## User Stories`, `## As a User`, or bullet points starting with "As a..."
   - **Acceptance Criteria**: Look for `## Acceptance Criteria` or `### Acceptance Criteria`
   - **Functional Requirements**: Look for `## Functional Requirements`
   - **Edge Cases**: Look for `## Edge Cases` or `## Error Handling`

3. **Generate test sheet** with the following structure:

```markdown
# [Feature Name] - Browser Tests

Generated from: [PRD filename]
Generated on: [Current date]

## Test Environment Setup

- [ ] Navigate to application URL
- [ ] Verify page loads successfully
- [ ] Check no console errors on load

## User Story Tests

### [User Story 1 Title]

**Story**: [Full user story text]

**Test Steps**:
- [ ] [Step 1 derived from story]
- [ ] [Step 2 derived from story]
- [ ] [Expected outcome verification]

### [User Story 2 Title]

**Story**: [Full user story text]

**Test Steps**:
- [ ] [Step 1]
- [ ] [Step 2]
- [ ] [Expected outcome]

## Acceptance Criteria Tests

- [ ] [Criterion 1 as testable step]
- [ ] [Criterion 2 as testable step]
- [ ] [Criterion N as testable step]

## Functional Requirement Tests

### [Requirement Category]

- [ ] [Requirement 1 test]
- [ ] [Requirement 2 test]

## Edge Case & Error Handling Tests

- [ ] [Edge case 1 test]
- [ ] [Edge case 2 test]
- [ ] [Error scenario test]

## Data Validation Tests

- [ ] [Input validation test 1]
- [ ] [Input validation test 2]

---
Test sheet generated by conntext-playwright
```

4. **Write the test sheet**:
   - Filename: `[prd-name]-tests.md` (derived from PRD filename)
   - Location: `[folder-path]/browser-tests/`

5. **Announce progress**:
   - Output: "Created test sheet: [filename]"

### A.3: Generate Test Index

Create an index file at `[folder-path]/browser-tests/INDEX.md`:

```markdown
# Browser Test Index

Generated: [Current date]
Source PRDs: [folder-path]

## Test Sheets

| Feature | Test File | Test Count |
|---------|-----------|------------|
| [Feature 1] | [filename-1-tests.md](./filename-1-tests.md) | [N] tests |
| [Feature 2] | [filename-2-tests.md](./filename-2-tests.md) | [N] tests |

## Running Tests

Use Playwright MCP to execute these test sheets:
1. Open a test sheet file
2. Execute each checkbox item as a browser action
3. Mark items complete as tests pass
4. Document failures in the results folder

## Results

Test results are stored in versioned folders:
- `results-v1/` - First test run
- `results-v2/` - Second test run
- etc.
```

### A.4: Completion Report

```
Test Sheet Generation Complete!

Summary:
- [X] PRD files processed
- [X] test sheets created
- [Y] total test cases generated

Test sheets location: [folder-path]/browser-tests/

Next steps:
1. Review generated test sheets
2. Run /conntext-playwright to execute tests
```

---

## Workflow B: Run Tests

### B.1: Locate Test Sheets

1. **Find browser-tests folder**:
   ```bash
   ls [folder-path]/browser-tests/*.md
   ```

2. **If not found**, ask user:
   - "No test sheets found. Would you like to generate them first?"
   - Options: "Yes, generate test sheets" / "No, cancel"

3. **Parse test sheet files** to build a list of available sections

### B.2: Ask Test Scope

Use AskUserQuestion tool:

**Question**: "Would you like to run a full test or test a specific section?"
**Header**: "Scope"
**Options**:
- **"Full test"** - Run all test sheets completely
- **"Specific section"** - Choose which section/feature to test

**If "Full test"** → Skip to B.4

**If "Specific section"** → Continue to B.3

### B.3: Section Selection with Pagination

Since Claude can only show 4 options at a time, implement pagination:

1. **Build section list** from all test sheet files:
   - Each test sheet file = one section
   - Store as array: `["Feature A", "Feature B", "Feature C", ...]`

2. **Calculate pagination**:
   - Page size: 2 sections per page (leaving room for Previous/Next)
   - Total pages: `ceil(section_count / 2)`
   - Current page: Start at 1

3. **Display paginated options**:

   **Question**: "Select a section to test (Page [X] of [Y]):"
   **Header**: "Section"
   **Options** (max 4):

   If NOT on first page:
   - **"<< Previous"** - Go to previous page

   Then show up to 2 sections:
   - **"[Section Name 1]"** - Test [feature description]
   - **"[Section Name 2]"** - Test [feature description]

   If NOT on last page:
   - **"Next >>"** - Go to next page

4. **Handle navigation**:
   - If user selects "Previous" → Decrement page, show options again
   - If user selects "Next" → Increment page, show options again
   - If user selects a section → Store selection, continue to B.4

5. **Loop until section selected** or user cancels

### B.4: Execute Tests

1. **Determine which tests to run**:
   - Full test: All test sheets
   - Specific section: Only the selected test sheet

2. **Create versioned results folder**:
   - Check existing `results-v*` folders in browser-tests
   - Find highest version number
   - Create `results-v[N+1]/`

   ```bash
   # Find existing results folders and determine next version
   ls -d [folder-path]/browser-tests/results-v* 2>/dev/null | sort -V | tail -1
   mkdir -p [folder-path]/browser-tests/results-v[N+1]
   ```

3. **Announce test run**:
   ```
   Starting Test Run: results-v[N]

   Tests to execute:
   - [Test sheet 1]
   - [Test sheet 2]
   ```

4. **For each test sheet**, spawn an agent:

   ```
   Task tool parameters:
   - subagent_type: "general-purpose"
   - description: "Run tests: [feature name]"
   - prompt: See agent prompt template below
   ```

   **Agent prompt template**:
   ```
   You are executing Playwright browser tests from a test sheet.

   ## Test Sheet
   Path: [path to test sheet]

   ## Instructions

   1. Read the test sheet file
   2. For each checkbox item (`- [ ]`):
      - Execute the test step using Playwright MCP
      - If test PASSES: Mark as `- [x]` in your tracking
      - If test FAILS: Document the failure with details
   3. Track all failures with:
      - Test step that failed
      - Expected behavior
      - Actual behavior
      - Error message (if any)
      - Screenshot path (if available)

   ## Output Format

   Return a structured summary:
   - Total tests: [N]
   - Passed: [N]
   - Failed: [N]
   - Failures: [List of failure details]

   DO NOT modify the original test sheet file.
   ```

5. **Collect agent results** and generate result files

### B.5: Generate Results Files

For each test sheet executed, create a results file:

**Location**: `[folder-path]/browser-tests/results-v[N]/[feature-name]-results.md`

**Format**:
```markdown
# [Feature Name] - Test Results

Test Run: results-v[N]
Executed: [Current date and time]
Source: [test-sheet-filename]

## Summary

| Metric | Count |
|--------|-------|
| Total Tests | [N] |
| Passed | [N] |
| Failed | [N] |
| Pass Rate | [X]% |

## Passed Tests

- [x] [Test step 1]
- [x] [Test step 2]

## Failed Tests - Issues to Fix

- [ ] **[Test step that failed]**
  - Expected: [Expected behavior]
  - Actual: [Actual behavior]
  - Error: [Error message]
  - Screenshot: [path if available]

- [ ] **[Another failed test]**
  - Expected: [...]
  - Actual: [...]

## Notes

[Any additional observations or context]

---
Results generated by conntext-playwright
```

### B.6: Generate Run Summary

Create a summary file at `[folder-path]/browser-tests/results-v[N]/SUMMARY.md`:

```markdown
# Test Run Summary - results-v[N]

Executed: [Current date and time]
Scope: [Full test / Specific section: Name]

## Overall Results

| Feature | Total | Passed | Failed | Pass Rate |
|---------|-------|--------|--------|-----------|
| [Feature 1] | [N] | [N] | [N] | [X]% |
| [Feature 2] | [N] | [N] | [N] | [X]% |
| **Total** | **[N]** | **[N]** | **[N]** | **[X]%** |

## Issues to Fix

### [Feature 1]

- [ ] [Issue 1 from feature 1]
- [ ] [Issue 2 from feature 1]

### [Feature 2]

- [ ] [Issue 1 from feature 2]

## Detailed Results

- [Feature 1 Results](./feature-1-results.md)
- [Feature 2 Results](./feature-2-results.md)

---
Summary generated by conntext-playwright
```

### B.7: Completion Report

```
Test Run Complete: results-v[N]

Results:
- [X] test sheets executed
- [Y] tests passed
- [Z] tests failed
- [W]% pass rate

Results location: [folder-path]/browser-tests/results-v[N]/

Issues to fix: [Z] items (see SUMMARY.md)
```

---

## Test Sheet Format Rules

### Extracting User Stories

Look for patterns like:
- `As a [user type], I want to [action] so that [benefit]`
- `## User Stories` section with bullet points
- `### [Story Name]` subsections

Convert each story to testable steps:
1. Identify the user action
2. Identify the expected outcome
3. Create checkbox steps for each

### Extracting Acceptance Criteria

Look for:
- `## Acceptance Criteria` section
- Bullet points starting with "Given", "When", "Then"
- Numbered lists of requirements

Convert each criterion to a test checkbox.

### Extracting Edge Cases

Look for:
- `## Edge Cases` section
- `## Error Handling` section
- Bullet points describing error scenarios

Convert each to a test that verifies proper handling.

---

## Pagination Logic Reference

```
function paginateOptions(sections, currentPage, pageSize = 2):
    totalPages = ceil(sections.length / pageSize)
    startIndex = (currentPage - 1) * pageSize
    endIndex = min(startIndex + pageSize, sections.length)

    options = []

    // Add Previous if not on first page
    if currentPage > 1:
        options.push({label: "<< Previous", action: "prev"})

    // Add sections for this page
    for i from startIndex to endIndex:
        options.push({label: sections[i].name, action: "select", index: i})

    // Add Next if not on last page
    if currentPage < totalPages:
        options.push({label: "Next >>", action: "next"})

    return options
```

---

## Best Practices

1. **Generate before running** - Always generate test sheets from PRDs before running tests
2. **Review generated tests** - Check test sheets for accuracy before execution
3. **Track versions** - Use versioned results folders to compare test runs over time
4. **Fix issues incrementally** - Use the checkbox format in results to track fixes
5. **Re-run after fixes** - Generate new results version after addressing issues

## Notes

- Test sheets use markdown checkbox format compatible with Playwright MCP
- Results folders are versioned incrementally (v1, v2, v3...)
- Each failed test becomes an unchecked task to fix
- The INDEX.md file helps navigate large test suites
- Pagination handles large numbers of test sections gracefully
