---
name: bf-feature-spec
description: Create user-facing feature specifications for new application features. Use when the user wants to spec out, plan, design, or document a new feature, or says "feature spec", "user stories", "requirements doc", or "acceptance criteria".
---

# Feature Specification

Create clear, structured feature specifications focused on user-facing requirements, user stories, and acceptance criteria.

## When to use

- Planning a new feature before implementation
- Documenting requirements for a feature request
- Creating user stories for sprint planning
- Defining acceptance criteria for QA

## Instructions

### Step 1: Gather context

Before writing the spec, understand:

1. **What problem does this feature solve?** Ask the user to describe the pain point or opportunity.
2. **Who is the target user?** Identify the user persona(s) affected.
3. **What does success look like?** Understand the desired outcome.

If the user hasn't provided this context, ask clarifying questions.

### Step 2: Explore the codebase (if applicable)

If the feature relates to an existing application:

1. Identify relevant existing features or components
2. Understand current user flows that may be affected
3. Note any UI patterns or conventions to follow

### Step 3: Write the specification

Create a markdown file with this structure:

```markdown
# Feature: [Feature Name]

## Overview

**Problem**: [What problem does this solve?]
**Solution**: [High-level description of the feature]
**Target Users**: [Who benefits from this feature?]

## User Stories

### [Story 1 Title]
**As a** [user type]
**I want to** [action]
**So that** [benefit]

#### Acceptance Criteria
- [ ] [Specific, testable criterion]
- [ ] [Another criterion]

### [Story 2 Title]
...

## User Flow

1. [Step 1 - User action]
2. [Step 2 - System response]
3. [Step 3 - Next action]
...

## UI/UX Requirements

### Screens/Components
- **[Screen/Component Name]**: [Description of what it shows and does]

### Interactions
- [Describe key interactions, animations, or feedback]

### States
- **Empty state**: [What users see when there's no data]
- **Loading state**: [What users see during loading]
- **Error state**: [What users see when something goes wrong]
- **Success state**: [What users see on completion]

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| [Edge case 1] | [How the feature should handle it] |
| [Edge case 2] | [How the feature should handle it] |

## Out of Scope

- [What this feature explicitly does NOT include]
- [Future enhancements to consider later]

## Open Questions

- [ ] [Unresolved question that needs stakeholder input]
```

### Step 4: Save the specification

Save the spec to an appropriate location:
- `docs/specs/[feature-name].md` if a docs folder exists
- `specs/[feature-name].md` as an alternative
- Or ask the user where they'd like it saved

## Best practices

### Writing good user stories
- Keep them small and focused on one user action
- Use consistent "As a... I want... So that..." format
- Each story should be independently deliverable

### Writing acceptance criteria
- Make them specific and testable
- Use checkboxes for easy tracking
- Include both positive and negative cases

### Handling uncertainty
- Use the "Open Questions" section for unresolved items
- Don't make assumptions about business logic—ask
- Flag anything that needs stakeholder review

## Example

Here's a condensed example for a "Favorites" feature:

```markdown
# Feature: Favorites List

## Overview

**Problem**: Users can't quickly access items they use frequently.
**Solution**: Allow users to mark items as favorites for quick access.
**Target Users**: All logged-in users.

## User Stories

### Add to Favorites
**As a** logged-in user
**I want to** mark an item as a favorite
**So that** I can quickly find it later

#### Acceptance Criteria
- [ ] Favorite button visible on each item card
- [ ] Clicking toggles favorite state immediately
- [ ] Visual feedback confirms the action
- [ ] Works offline and syncs when back online

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| User not logged in | Show prompt to log in |
| Item deleted by admin | Remove from favorites silently |
| Favorites limit reached | Show message with upgrade option |
```

## Output

After creating the spec, I will:
1. Share the spec content for review
2. Save it to the agreed location
3. Highlight any open questions that need answers
