---
name: bf-skill-to-prompt
description: Convert an existing Claude Code skill into a system prompt for another AI agent. Use when you need to extract a skill's instructions as a standalone prompt, export skills for use in other tools, or create agent prompts from SKILL.md files.
---

# Skill to Prompt Converter

Converts Claude Code skills into standalone system prompts that can be used with other AI agents or tools.

## Instructions

### Step 1: Identify the skill to convert

Ask the user which skill they want to convert:
- They may provide a path to a SKILL.md file
- They may provide a skill name (search in `.claude/skills/` and `~/.claude/skills/`)
- They may point to a skill directory

### Step 2: Read and parse the skill

1. Read the SKILL.md file
2. Extract the frontmatter (name, description)
3. Parse the main content (instructions, examples, etc.)

### Step 3: Generate the system prompt

Transform the skill into a system prompt with this structure:

```
# Role and Purpose

You are an AI assistant specialized in [skill name]. [Description from frontmatter]

# Core Instructions

[Main instructions from the skill, reformatted as directives]

# Capabilities

[List capabilities extracted from the skill content]

# Guidelines

[Best practices and constraints from the skill]

# Examples

[Include relevant examples from the skill]

# Response Format

[Specify expected output format based on skill content]
```

### Step 4: Write the output

1. Ask the user where to save the prompt (default: same directory as skill, named `prompt.md`)
2. Write the generated system prompt to the specified file
3. Report success with the file path

## Transformation Rules

When converting skill content to system prompt:

| Skill Section | System Prompt Section |
|---------------|----------------------|
| Description | Role and Purpose |
| Instructions | Core Instructions (as imperatives) |
| Best practices | Guidelines |
| Examples | Examples |
| Quick start | Capabilities summary |

### Language transformation

- "Use this skill when..." → "You specialize in..."
- "Follow these steps..." → "When responding, you must..."
- "The user will..." → "The user may..."
- Passive voice → Active voice directives

## Example

### Input skill (excerpt):

```markdown
---
name: code-reviewer
description: Review code for bugs and style issues. Use when reviewing PRs or checking code quality.
---

# Code Reviewer

## Instructions

1. Read the code carefully
2. Check for common bugs
3. Verify style guidelines
4. Provide actionable feedback
```

### Output system prompt:

```markdown
# Role and Purpose

You are an AI assistant specialized in code review. Your purpose is to review code for bugs and style issues, helping developers improve code quality during PR reviews.

# Core Instructions

When reviewing code, you must:
1. Read the code carefully and understand its purpose
2. Check for common bugs and potential issues
3. Verify adherence to style guidelines
4. Provide actionable, constructive feedback

# Capabilities

- Bug detection and analysis
- Code style verification
- PR review assistance
- Quality improvement suggestions

# Guidelines

- Be specific and actionable in feedback
- Explain the "why" behind suggestions
- Prioritize critical issues over style nitpicks
- Be constructive, not critical

# Response Format

Provide feedback organized by severity:
1. Critical issues (bugs, security)
2. Important improvements
3. Minor suggestions
```

## Output file format

The generated prompt will be saved as a Markdown file with:
- Clear section headers
- Bullet points for lists
- Code blocks for examples
- No frontmatter (pure prompt content)

## Usage

To convert a skill:

1. Run this skill with a path or skill name
2. Review the generated prompt
3. Edit as needed for your target agent/tool
