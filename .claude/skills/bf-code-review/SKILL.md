---
name: bf-code-review
description: Review unpushed commits and uncommitted changes for bugs, logic errors, security vulnerabilities, and code quality issues. Use when the user says "review pending", "check my changes", "review commits", "review before push", "code review", or wants to find bugs in staged/unstaged changes. Supports "all" parameter to scan entire project. Follows the white rabbit to trace bugs that chain across files.
allowed-tools: Bash, Read, Grep, Glob, Task, TodoWrite, Write, mcp__customTools__ask_user
---

# Code Review

Reviews code for bugs, logic errors, security vulnerabilities, and code quality issues. Can review either pending changes or the entire codebase.

## Quick Start

- Run `/bf-code-review` to start a code review (you'll be asked what to review)
- Run `/bf-fix-issues` to fix issues found in the last review

**Common use cases:**
- Review pending changes before push: Choose "Changed files only"
- Review commits after push: Choose "Previous commits" and select which commits to review
- Review specific module or feature: Choose "Specific files" and specify patterns like `src/auth/**/*.ts`
- Deep security audit: Choose "Entire codebase" with high confidence

## Review Rules Framework

This skill applies a comprehensive set of security and code quality rules. Each finding is tagged with a rule ID for traceability.

### 1️⃣ Authorization Invariants

**Rule A1 — Object-level authorization**

Any state change to a specific resource must verify the actor is authorized to modify that resource.

Flag if:
- A record is updated/deleted by ID or reference
- No explicit permission check is visible near the mutation
- UI-only gating is relied on

**Severity**: High
**Catches**: BOLA, privilege escalation, unauthorized updates

**Rule A2 — Action-level authorization**

Privileged business actions must enforce server-side permission checks for the action itself, not just related permissions.

Flag if:
- Code checks "can view" or "can create X"
- But performs a different privileged action (handoff, approve, supersede, publish)
- No dedicated permission exists for that action

**Severity**: High
**Catches**: BFLA, PRD role violations

**Rule A3 — Resource scope must match action scope**

When an action moves/copies/creates resources in a target location, authorization must check write permission on the TARGET, not just read permission.

Flag if:
- Action moves items to a different parent/container (board, folder, project)
- Authorization only checks if user can ACCESS the target (view/read)
- No check for user can MODIFY the target (create/write)
- Similar actions elsewhere in codebase check the correct permission

**Severity**: Medium
**Catches**: Read-only users modifying resources via move/copy, permission bypass

Example anti-pattern:
```
// BAD: Only checks view access to target container
function moveToContainer(targetId) {
    target = Container.findAccessibleBy(user, targetId)  // View access only!
    items.update({ containerId: target.id })  // But this modifies the container
}

// GOOD: Check write permission on target
function moveToContainer(targetId) {
    target = Container.find(targetId)
    if (!user.canCreate('item', target)) {  // Proper write check
        throw ForbiddenError()
    }
    items.update({ containerId: target.id })
}
```

Compare with similar actions in the codebase to find inconsistent permission checks.

### 2️⃣ Concurrency & Atomicity

**Rule C1 — Sequential value generation must be atomic**

Any "read current state → derive next value → write" operation must be concurrency-safe.

Flag if:
- Uses `max + 1`, `latest + 1`, `count + 1`
- No transaction + lock OR DB sequence OR unique+retry

**Severity**: High
**Catches**: duplicate references, race conditions

**Rule C2 — Multi-write operations must be atomic**

A logical unit of work spanning multiple writes must succeed or fail as one.

Flag if:
- 2+ creates/updates/deletes in one operation
- No transaction boundary or compensating rollback

**Severity**: Medium (High if side effects exist)
**Catches**: partial writes, inconsistent state

**Rule C3 — Query-then-act must lock or re-verify inside transaction**

When code queries data, then later uses that data inside a transaction to perform updates, the queried data may be stale by the time the transaction runs.

Flag if:
- Data is fetched OUTSIDE a transaction/lock
- That data is used to determine WHAT to update inside the transaction
- No re-query with lock (SELECT FOR UPDATE) or optimistic locking (version check)

**Severity**: Medium
**Catches**: TOCTOU races, stale reads causing incorrect updates, count mismatches

Example anti-pattern:
```
// BAD: items fetched outside transaction
items = db.query("SELECT * FROM items WHERE parent_id = ?", sourceId)
count = len(items)

db.transaction(function() {
    // By now, items may have been deleted or moved by another request
    for item in items:
        db.update(item.id, { parent_id: targetId })  // Updates stale data
})
return "Moved " + count + " items"  // Count is wrong if items changed
```

Fix patterns:
- Move query inside transaction with row locking (SELECT ... FOR UPDATE)
- Use bulk UPDATE ... WHERE directly without fetching first
- Add optimistic locking with version/timestamp column

### 3️⃣ Data Integrity & Scope

**Rule D1 — Scope / tenant boundaries must be enforced**

Mutations must be scoped to the actor's allowed domain (tenant, project, org).

Flag if:
- Updates/deletes lack clear scoping
- Resource lookup is global when it should be scoped

**Severity**: High / Medium
**Catches**: cross-tenant data corruption

### 4️⃣ Performance & Efficiency

**Rule P1 — Avoid N+1 query patterns**

When iterating over a collection, related data must be prefetched.

Flag if:
- Loop accesses related data per item
- Relationship was not eagerly loaded / included

**Severity**: Low / Medium
**Catches**: slow pages, DB overload

### 5️⃣ Functional Completeness

**Rule F1 — Required side effects must be wired**

Implemented infrastructure (notifications, events, broadcasts) must be dispatched when required by spec.

Flag if:
- Event/notification classes exist
- Frontend handlers exist
- No emit/dispatch occurs in workflow

**Severity**: Medium
**Catches**: silent feature failures, dead code

### 6️⃣ Contract & Enum Consistency

**Rule E1 — Enum/value contracts must match**

Enum-like values must be consistent across system boundaries.

Flag if:
- Hard-coded strings duplicate enum values
- Case/value mismatch between producer and consumer
- Comparisons rely on exact string equality

**Severity**: Medium
**Catches**: silent logic failures, UX bugs

### 7️⃣ Navigation & Redirect Safety

**Rule N1 — Redirect after delete must not return to deleted resource**

When deleting a resource, redirecting "back" or to the resource's own page causes a 404.

Flag if:
- Delete action uses redirect-back, `history.back()`, or referer-based redirect
- The "back" URL could be the deleted resource's show/detail page
- Framework treats 404 as error, breaking success callbacks (especially SPA frameworks)

**Severity**: Medium
**Catches**: 404 after delete, broken UX flows, failed success handlers

Example anti-pattern:
```
// BAD: If user was on item detail page, this 404s
function deleteItem(item) {
    db.delete(item)
    return redirectBack()  // Back to /items/123 which no longer exists
}

// GOOD: Redirect to safe parent/list page
function deleteItem(item) {
    parent = item.parent
    db.delete(item)
    return redirect("/parents/" + parent.id)  // Safe destination
}
```

Also flag when changing FROM explicit route TO redirect-back — this is often a regression.

**Rule N2 — Redirect destination must exist and be accessible**

Redirects must lead to pages the user can actually view.

Flag if:
- Redirect goes to a resource the user may not have access to
- Redirect assumes a parent/related resource still exists
- No fallback for edge cases (orphaned resources, permission changes)

**Severity**: Low
**Catches**: redirect loops, access denied errors, broken flows

### 8️⃣ Resource Lifecycle Management

**Rule R1 — Clear existing resources before creating new ones**

When starting a new interval, timeout, subscription, or event listener that replaces a previous one, the old resource must be cleared first.

Flag if:
- `setInterval` / `setTimeout` is called and stored in a ref/variable
- The same ref/variable is overwritten without first calling `clearInterval` / `clearTimeout`
- Event listeners added without corresponding removal
- Subscriptions created without unsubscribe logic

**Severity**: Medium
**Catches**: memory leaks, duplicate handlers, runaway intervals, zombie subscriptions

Example anti-pattern:
```javascript
// BAD: Old interval keeps running forever
function handleGenerate() {
    pollingRef.current = setInterval(() => pollStatus(), 1000)  // Overwrites without clearing!
}

// GOOD: Clear before starting new
function handleGenerate() {
    if (pollingRef.current) {
        clearInterval(pollingRef.current)
    }
    pollingRef.current = setInterval(() => pollStatus(), 1000)
}
```

Also flag:
- `useEffect` that creates interval/subscription but missing cleanup return
- Event listeners added in loops without tracking for removal
- WebSocket/SSE connections opened without close handling

**Rule R2 — Cleanup on unmount/exit**

Components and services must clean up resources when they unmount or exit.

Flag if:
- `useEffect` creates interval/timeout/subscription but has no cleanup function
- Class component creates resources in `componentDidMount` but no `componentWillUnmount`
- Service/singleton creates connections but no dispose/destroy method

**Severity**: Medium
**Catches**: memory leaks on navigation, zombie processes, connection exhaustion

### 9️⃣ Dead Code & Unused Assignments

**Rule U1 — Assigned variables must be used**

Variables that are assigned a value but never read indicate dead code or incomplete implementation.

Flag if:
- Variable is assigned from a function call, computation, or extraction
- Variable is never referenced after assignment
- Variable name suggests semantic purpose (e.g., `$filename`, `$count`, `$result`)

**Severity**: Medium (Low if assigned from constant/literal)
**Catches**: incomplete implementations, copy-paste errors, refactoring leftovers

Example anti-pattern:
```php
// BAD: Variable assigned but never used
$zipFilename = basename($zipPath);  // Comment says "for storage"
// ... but then passes $zipPath instead of $zipFilename
$this->markAsCompleted($zipPath);  // Should this be $zipFilename?

// BAD: Count computed but unused
$featureCount = $project->features()->count();  // Comment: "for progress tracking"
// ... but never passed to job or used anywhere
dispatch(new GenerateJob($project));  // Missing $featureCount?
```

When flagging, ask: **Was this variable meant to be used somewhere?** Check:
- Comments describing the variable's purpose
- Similar patterns nearby that DO use equivalent variables
- Function signatures that might expect this value

**Rule U2 — Imports and requires must be used**

Imported modules, classes, or functions that are never referenced are dead code.

Flag if:
- Import statement exists but identifier never used in file
- `require` assigned to variable that's never accessed

**Severity**: Low
**Catches**: refactoring leftovers, copy-paste imports

### 🔟 API Response & State Handling

**Rule L1 — API responses must distinguish all terminal states**

When checking API responses, code must handle success, failure, and edge cases distinctly. A single condition (like `null`) that conflates multiple states leads to wrong behavior.

Flag if:
- Polling/checking for completion uses a condition that's true for BOTH success AND failure
- Success feedback (toast, redirect, UI update) shown without verifying actual success
- Error state conflated with "not found" or "completed" state

**Severity**: High
**Catches**: false success messages, silent failures, misleading user feedback

Example anti-pattern:
```javascript
// BAD: null means "completed" OR "failed" - can't tell which!
const { current } = await fetchCurrentGeneration();
if (current === null) {
    // Generation finished... but did it succeed or fail?
    toast.success('Ready for download!');  // WRONG if it failed!
}

// GOOD: Check actual status, not just presence
const { generation } = await fetchGeneration(id);
if (generation.status === 'completed') {
    toast.success('Ready for download!');
} else if (generation.status === 'failed') {
    toast.error('Generation failed: ' + generation.error);
}
```

Also flag:
- Polling that stops when resource becomes `null` without checking final state
- Optimistic assumptions about what `null`/`undefined`/empty means
- Missing error state handling in status checks

**Rule L2 — Scoped queries hide terminal states**

When an API uses scoped queries (e.g., `active()`, `pending()`), completed or failed records disappear from results. Consumers must not assume "not in scope" means "succeeded".

Flag if:
- Query uses scope that excludes terminal states (completed, failed, cancelled)
- Consumer interprets "no results" as success without checking actual outcome
- No separate endpoint or field to check final status

**Severity**: High
**Catches**: false positives on completion checks, lost error states

Example anti-pattern:
```php
// Backend: active() scope excludes completed AND failed
public function scopeActive($query) {
    return $query->whereIn('status', ['pending', 'processing']);
}

// API returns null for both success AND failure
public function getCurrent($projectId) {
    return Generation::active()->where('project_id', $projectId)->first();
    // Returns null if completed successfully OR if failed!
}
```

```javascript
// Frontend assumes null = success (WRONG!)
if (current === null) {
    toast.success('Done!');  // Could be showing success for a failure
}
```

### 1️⃣1️⃣ Frontend State Synchronization

**Rule S1 — Partial reloads must include all affected state**

When using partial/selective data reloading (Inertia `only`, React Query invalidation, SWR revalidation, Apollo cache updates), all state derived from the changed data must be refreshed.

Flag if:
- Partial reload updates a list/collection (e.g., items list)
- Other state depends on that data (counts, aggregates, summaries, badges)
- Those dependent values are NOT included in the reload/invalidation
- UI displays the stale dependent data elsewhere (dialogs, headers, sidebars)

**Severity**: Medium (Low if purely cosmetic)
**Catches**: stale counts, mismatched UI state, confusing user experience

Example anti-pattern:
```
// BAD: items updated but itemCounts stays stale
function handleMoveComplete() {
    reloadData({ only: ['items'] })  // counts not refreshed!
}

// Later in component...
<MoveDialog itemCount={itemCounts.total} />  // Shows old count "Move 5 items"
// But items list only shows 2 items - mismatch!

// GOOD: Include all derived state
function handleMoveComplete() {
    reloadData({ only: ['items', 'itemCounts'] })
    // OR invalidate all related queries
    // OR do full page refresh
}
```

**Rule S2 — Optimistic UI must handle rollback**

When updating UI optimistically before server confirmation, failed requests must revert the UI state.

Flag if:
- UI state updated before API call completes
- No error handler to revert on failure
- No loading/pending state to indicate uncertainty

**Severity**: Medium
**Catches**: phantom updates, UI/server state divergence

### 1️⃣2️⃣ Value & Unit Integrity

**Rule V1 — Model setters/casts may transform input values**

When code assigns values to model attributes (especially in tests), the reviewer must trace how the model stores that value. Setters, mutators, casts, and accessors can silently transform data — a value that looks correct at assignment may be wrong after storage.

Flag if:
- Money/currency fields are assigned values without verifying setter behavior (e.g., `ticket_price = 1500` — is 1500 pounds or pence?)
- Model has `set` mutator, `casts`, or attribute accessor that transforms the value (e.g., multiplies by 100 for minor units)
- Test asserts a value without accounting for the setter transformation
- CLAUDE.md or project docs specify a storage convention (e.g., "stored as cents/pence") but code passes values without clarity on whether transformation has already been applied

**Severity**: High
**Catches**: Double-conversion bugs (£15 stored as £1500), wrong amounts in payments/invoices/reports, silent data corruption

Example anti-pattern:
```php
// Model has a setter that converts pounds to pence:
public function setTicketPriceAttribute($value) {
    $this->attributes['ticket_price'] = $value * 100;
}

// Test: Passes 1500 thinking it's pence, but setter makes it 150000
$event = Event::factory()->create(['ticket_price' => 1500]);
// Stored value: 150000 (£1500.00 instead of £15.00!)

// GOOD: Pass the value the setter expects (pounds)
$event = Event::factory()->create(['ticket_price' => 15]);
// Stored value: 1500 (£15.00 ✓)
```

**How to check**:
1. Find money/quantity fields being assigned (look for `price`, `fee`, `cost`, `amount`, `total`, `balance`, `rate`)
2. Trace to the model class — check for `set[Field]Attribute()` mutator, `$casts`, or attribute accessors
3. Cross-reference CLAUDE.md for storage conventions (e.g., "minor units", "cents", "pence")
4. Verify the value being passed accounts for any transformation the setter applies

### 1️⃣3️⃣ Pattern Consistency

**Rule PC1 — Defensive patterns must be applied consistently within a file**

When a defensive coding pattern (null check, type guard, error boundary, validation) is used in one place within a file, all similar cases in that file should apply the same pattern. Inconsistent application suggests copy-paste errors or incomplete implementation.

Flag if:
- A null/existence check is performed before using a value in one test case or method, but omitted in similar test cases or methods in the same file
- Error handling (try-catch, validation, guard clause) is present in one code path but missing from parallel code paths doing the same kind of operation
- Assertion patterns differ between similar test cases without clear reason (e.g., first test asserts response structure fully, others skip checks)

**Severity**: Medium
**Catches**: Incomplete defensive coding, copy-paste errors, missing null checks in edge cases, inconsistent test coverage

Example anti-pattern:
```php
// Test 1: Correctly checks for null before assertion (line 106)
$booking = Booking::where('event_id', $event->id)->first();
$this->assertNotNull($booking);
$this->assertEquals($user->id, $booking->user_id);

// Test 2: MISSING null check — will give misleading error if booking doesn't exist
$booking = Booking::where('event_id', $event->id)->first();
// No assertNotNull! If $booking is null, next line gives confusing error
$this->assertEquals($user->id, $booking->user_id);  // "Accessing property of null"
```

**How to check**:
1. When reviewing a file, identify defensive patterns used (null checks, type guards, validation, assertions)
2. Scan for all similar operations in the same file
3. Flag any instance where the pattern is missing

**Rule PC2 — Similar code blocks must use consistent approaches**

When a file contains multiple similar operations (e.g., multiple test cases, multiple handlers, multiple API calls), they should follow the same structural approach unless there's a clear reason to differ.

Flag if:
- Multiple test cases test similar functionality but use different setup/assertion approaches without justification
- Multiple event handlers follow different error handling patterns
- Multiple API routes use different validation/authorization approaches for the same entity type

**Severity**: Low
**Catches**: Code drift, maintenance burden, missed edge cases in some paths

### 1️⃣4️⃣ Third-Party Model & Class Overrides

**Rule T1 — Verify custom overrides exist before importing third-party models directly**

When code imports a model or class directly from a third-party package, the reviewer must check whether the project has a custom override (usually in `app/Models/` or similar). Many frameworks encourage extending third-party models to add custom behavior, scopes, or relationships.

Flag if:
- Code imports a model directly from a third-party package namespace (e.g., `Spatie\Permission\Models\Role`, `Laravel\Cashier\Subscription`)
- A corresponding custom model exists in the project (e.g., `App\Models\Role`)
- The custom model adds behavior (scopes, relationships, methods) that would be missed by using the package model directly
- Tests use the package model instead of the app model, potentially bypassing factory definitions, custom scopes, or relationships

**Severity**: Medium (High if custom model adds authorization scopes or tenant filtering)
**Catches**: Bypassed custom behavior, missing scopes/relationships, test factories not working, tenant isolation bypass

Example anti-pattern:
```php
// BAD: Imports directly from third-party package
use Spatie\Permission\Models\Role;

$role = Role::findByName('admin');  // Misses any custom scopes, relationships, or overrides

// GOOD: Use the app's custom model
use App\Models\Role;

$role = Role::findByName('admin');  // Gets custom tenant scoping, relationships, etc.
```

**How to check**:
1. When you see an import from a well-known package namespace (Spatie, Laravel, Stripe, etc.), search for a custom override:
   - Use Grep to search for `class Role extends` or `class Subscription extends` in the project
   - Check `app/Models/`, `src/Models/`, or equivalent directories
2. If a custom model exists, flag any direct import of the package model
3. Pay special attention in test files — they frequently import package models directly

Common packages with frequently overridden models:
- `Spatie\Permission\Models\Role` / `Permission`
- `Laravel\Cashier\Subscription`
- `Laravel\Sanctum\PersonalAccessToken`
- `Illuminate\Foundation\Auth\User` (almost always overridden)
- `Spatie\MediaLibrary\MediaCollections\Models\Media`

### 🔎 Meta-Rule: Think Like an Attacker

**If a bug does not throw errors, does not break tests, but violates a system invariant, it is still a bug.**

When reviewing, assume:
- **Untrusted input** - All user input is malicious
- **Concurrent execution** - Multiple requests happen simultaneously
- **Partial failure** - Operations can fail halfway through
- **UI can be bypassed** - Direct API calls bypass frontend checks

### 🐇 Follow the White Rabbit

**Changes don't exist in isolation. A bug in one file can chain into catastrophic failures elsewhere.**

When you see a change, trace its ripple effects:

1. **Trace Exports/Imports** - If a function signature, return type, or behavior changes, find all callers
2. **Trace Data Flow** - If a data structure changes, follow where that data flows downstream
3. **Trace API Contracts** - If an API response changes, find frontend consumers and downstream services
4. **Trace Event Chains** - If an event payload changes, find all subscribers/handlers
5. **Trace Inheritance** - If a base class/interface changes, check all implementations
6. **Trace Configuration** - If config schema changes, verify all consumers handle new/removed fields

**When to follow the rabbit:**

- Function signature changed (parameters, return type)
- Data model/schema changed (added/removed/renamed fields)
- API contract changed (request/response shape)
- Event payload changed
- Shared utility behavior changed
- Type/interface definition changed
- Environment variable or config key changed
- Error handling behavior changed

**How deep to go:**

- **Minimum**: One hop - direct callers/consumers of changed code
- **Standard**: Two hops - callers of callers, for high-severity changes
- **Deep dive**: Three+ hops - for changes to core utilities, base classes, or shared types

**What to look for when following:**

- Callers passing wrong argument types after signature change
- Consumers accessing fields that no longer exist
- Type mismatches that TypeScript/compiler won't catch (runtime types, JSON)
- Missing null checks for newly optional fields
- Hardcoded assumptions about removed values
- Event handlers expecting old payload shape
- Tests mocking old behavior that mask the real bug

### 🔬 Cross-Layer System Analysis

**Code doesn't exist in isolation. Frontend logic makes assumptions about backend behavior. Those assumptions can be wrong.**

After reviewing individual files, perform cross-layer analysis to catch bugs that only appear when you understand how the whole system works together.

#### 1. Trace API Contracts to Reality

When you see frontend code handling an API response, **trace to the backend** to understand what it actually returns:

```javascript
// Frontend code
const current = await fetchCurrentGeneration();  // Calls /api/.../current
if (current && current.status.value === 'completed') {
    toast.success('Done!');
}
```

**Ask**: What does `/current` actually return?
- Find the backend controller/route
- Find the query/scope being used
- Determine what values are actually possible

```php
// Backend: uses active() scope
public function getCurrent($projectId) {
    return Generation::active()->where('project_id', $projectId)->first();
}

public function scopeActive($query) {
    return $query->whereIn('status', ['pending', 'processing']);  // ONLY these!
}
```

**Bug found**: The frontend checks for `status === 'completed'`, but the `active()` scope means `current` is NEVER completed - it returns null when completed. This code block is unreachable dead code.

**Flag if:**
- Frontend handles values the API cannot return (dead code)
- Frontend fails to handle values the API can return (missing handling)
- Assumptions about null/empty don't match reality

#### 2. State Machine Completeness Analysis

For any stateful entity (job status, order state, generation progress), verify the state machine is complete:

**Ask these questions:**
1. **Can every state transition to completion?** Or can states get stuck?
2. **What happens on unclean failure?** (worker crash, network timeout, OOM kill)
3. **Is there a timeout/recovery mechanism?** Or does stuck = stuck forever?
4. **Who/what can unstick a stuck state?** Manual DB intervention is a red flag.

```php
// State machine: pending → processing → completed/failed
// But what if worker crashes mid-processing?
public function store(Request $request) {
    $current = Generation::active()->first();  // Includes PROCESSING
    if ($current) {
        return response()->json(['error' => 'Generation in progress'], 409);
    }
    // If PROCESSING is stuck, user is permanently blocked!
}
```

**Bug found**: No recovery mechanism for stuck PROCESSING state. Worker crash = permanent block requiring manual DB fix.

**Flag if:**
- States can become stuck with no exit path
- No timeout mechanism for "waiting" states (processing, pending, queued)
- Clean failure handled but unclean failure (crash) not handled
- Recovery requires manual intervention rather than automatic timeout

#### 3. Semantic Dead Code Detection

Beyond syntactic unreachability, look for **semantically unreachable** code - code that CAN execute but NEVER will based on system behavior:

**Patterns to check:**
- Condition checks values that upstream logic already filtered out
- Error handling for errors the called function cannot throw
- Status checks for statuses the API cannot return
- Null checks where null is impossible (or vice versa)

```javascript
// This entire block is semantically dead:
if (current && (current.status.value === 'completed' || current.status.value === 'failed')) {
    // current comes from /current endpoint
    // /current uses active() scope
    // active() only returns pending/processing
    // Therefore status is NEVER completed/failed here
    clearInterval(pollingRef.current);  // Never executes
    toast.success('Done!');  // Never executes
}
```

**Ask**: Given where this data comes from, can this condition ever be true?

#### 4. Implicit Contract Violations

Look for assumptions that aren't explicitly enforced:

- **Time assumptions**: "This should complete within X seconds" without timeout
- **Order assumptions**: "A always happens before B" without verification
- **Uniqueness assumptions**: "There can only be one active X" without constraint
- **Existence assumptions**: "Parent must exist" without foreign key

**Flag if:**
- Business rule exists only in comments/documentation, not in code
- Constraint relies on "correct usage" rather than enforcement
- Assumption worked in original context but breaks in new usage

#### How to Perform Cross-Layer Analysis

1. **Identify API calls** in frontend code (fetch, axios, useSWR, React Query, Inertia)
2. **Trace to backend** - find the route, controller, and data source
3. **Understand what's actually returned** - check scopes, queries, transformations
4. **Compare to frontend assumptions** - does the code handle reality?
5. **For stateful entities** - map the state machine, find stuck states
6. **Look for dead code** - conditions that can't be true given the data source

## Instructions

### Step 1: Ask user review preferences

**You MUST use mcp__customTools__ask_user** to ask the user TWO questions before proceeding:

#### Question 1: Review Scope

- **Question**: "What would you like to review?"
- **Header**: "Review scope"
- **Options**:
  - **"Changed files only (Recommended)"** - Review only unpushed commits and uncommitted changes. This is faster and uses fewer tokens.
  - **"Previous commits"** - Review one or more commits that have already been pushed. Good for post-push review or investigating specific changes.
  - **"Specific files"** - Review only the files or patterns you specify (e.g., "src/auth/**/*.ts" or "payment.js config.py")
  - **"Entire codebase"** - Scan ALL source files in the project. Warning: This can be a lengthy process and will use significantly more tokens.

#### Question 2: Confidence Level

- **Question**: "What confidence level of issues should be reported?"
- **Header**: "Confidence"
- **Options**:
  - **"High confidence only (Recommended)"** - Only report issues that are almost certainly bugs or vulnerabilities. Fewer false positives.
  - **"Medium confidence"** - Include issues that are likely problems but may have edge cases where they're intentional. More thorough.
  - **"Low confidence (Everything)"** - Report all potential issues including speculative ones. May include false positives but catches subtle bugs.

### Step 2: Gather files based on user selection

#### If user selected "Changed files only":

Collect all pending changes:

1. **Get unpushed commits**:
   ```bash
   # Unix/macOS/Linux/Git Bash
   git log @{u}..HEAD --oneline 2>/dev/null || git log origin/$(git branch --show-current)..HEAD --oneline 2>/dev/null || git log origin/master..HEAD --oneline

   # PowerShell (Windows)
   git log "origin/$(git branch --show-current)..HEAD" --oneline
   # If no upstream, use: git log origin/master..HEAD --oneline
   ```

2. **Get uncommitted changes** (staged and unstaged):
   ```bash
   # Works on all platforms
   git status --short
   git diff --name-only
   git diff --cached --name-only
   ```

3. **Get the actual diff content**:
   ```bash
   # Unix/macOS/Linux/Git Bash - For unpushed commits
   git diff @{u}..HEAD 2>/dev/null || git diff origin/$(git branch --show-current)..HEAD 2>/dev/null || git diff origin/master..HEAD

   # PowerShell (Windows) - For unpushed commits
   git diff "origin/$(git branch --show-current)..HEAD"
   # If no upstream, use: git diff origin/master..HEAD

   # For uncommitted changes (works on all platforms)
   git diff
   git diff --cached
   ```

Then proceed to Step 3.

#### If user selected "Previous commits":

Let the user choose which commit(s) to review:

1. **Show recent commits** (last 15-20):
   ```bash
   git log --oneline -20
   ```

2. **Ask user to select commits** using mcp__customTools__ask_user or natural language:
   - "Which commit(s) would you like to review?"
   - Accept formats:
     - **Single commit**: `abc1234` or `HEAD~1`
     - **Commit range**: `abc1234..def5678` or `HEAD~5..HEAD~2`
     - **Last N commits**: "last 3 commits" → `HEAD~3..HEAD`
     - **By message**: "the auth refactor commit" → find matching commit

3. **Get the diff for selected commit(s)**:
   ```bash
   # Single commit - show what that commit changed
   git show <commit> --stat
   git show <commit> --no-stat

   # Commit range - show all changes in range
   git diff <start>..<end>
   git diff <start>..<end> --stat

   # List files changed
   git diff <start>..<end> --name-only
   ```

4. **Get the files changed**:
   ```bash
   # For single commit
   git show <commit> --name-only --pretty=format:""

   # For range
   git diff <start>..<end> --name-only
   ```

5. **Read the full content** of each changed file (for context beyond the diff)

6. **Note in the report** which commit(s) are being reviewed

Then proceed to Step 3.

#### If user selected "Specific files":

Ask the user which files or patterns to review, then gather those files:

1. **Ask user for file specification** using natural language:
   - If the user mentioned files in their original request, use those
   - Otherwise, ask: "Which files or patterns would you like to review?"
   - Accept multiple formats:
     - **File paths**: `src/auth/login.ts`, `payment.js`
     - **Glob patterns**: `src/auth/**/*.ts`, `**/*.py`
     - **Directory paths**: `src/controllers/`, `lib/`
     - **Mixed**: `auth.js src/models/**/*.ts config/`

2. **Parse the file specification**:
   - Split on whitespace or commas
   - For each specification:
     - If it's a glob pattern (contains `*` or `**`), use Glob tool
     - If it's a directory path (ends with `/`), use Glob with `path/**/*` pattern
     - If it's a file path, verify it exists and add to list

3. **Collect the files**:
   ```bash
   # Verify each file exists
   ls path/to/file.ts
   ```
   - Use Glob tool for patterns: `**/*.ts`, `src/auth/**/*.js`
   - Build final list of files to review

4. **Exclude non-source files** from the list:
   - Skip generated files, lock files, minified files
   - Skip `node_modules/`, `vendor/`, `dist/`, etc.

5. **Read the full content** of each specified file (since user chose specific files, review entire file)

6. **Note in the report** that this is a targeted file review

Then proceed to Step 3.

#### If user selected "Entire codebase":

Gather all source files:

1. **Identify source code files** using Glob tool with patterns like:
   - `**/*.php` (PHP files)
   - `**/*.ts`, `**/*.tsx` (TypeScript files)
   - `**/*.js`, `**/*.jsx` (JavaScript files)
   - `**/*.py` (Python files)
   - Other relevant extensions for the project

2. **Exclude non-source directories**:
   - `vendor/`, `node_modules/` (dependencies)
   - `storage/`, `cache/`, `.cache/` (generated files)
   - `public/build/`, `dist/`, `build/` (compiled assets)
   - `.git/` (version control)
   - Any other generated or third-party directories

3. **Create a file list** of all source files to review

4. **Note in the report** that this is a full project scan

Then proceed to Step 3.

### Step 3: Create review checklist

Create a todo list to track the review systematically:

1. Identify all files to review
2. Review each file for issues
3. Compile findings into a report
4. Write suggested changes to `suggested-changes.md`

### Step 4: Analyse files for issues

Apply **both** the Review Rules Framework AND the confidence level filter when analyzing code.

#### Rule-Based Analysis

For each code change or file, systematically check against these rule categories:

1. **Authorization (A1, A2, A3)** - Check all state mutations for authorization, including move/copy operations
2. **Concurrency (C1, C2, C3)** - Identify race conditions, atomicity issues, and query-then-act patterns
3. **Data Integrity (D1)** - Verify tenant/scope boundaries
4. **Performance (P1)** - Find N+1 query patterns
5. **Completeness (F1)** - Check for missing side effects
6. **Contracts (E1)** - Verify enum/value consistency
7. **Navigation (N1, N2)** - Check redirects after mutations, especially deletes
8. **Resource Lifecycle (R1, R2)** - Check intervals/subscriptions cleared before replacement, cleanup on unmount
9. **Dead Code (U1, U2)** - Check for unused variables (especially with semantic names), unused imports
10. **API State Handling (L1, L2)** - Check polling/status logic distinguishes success from failure states
11. **State Sync (S1, S2)** - Check partial reloads include all derived state
12. **Value & Unit Integrity (V1)** - Trace model setters/casts when money or quantity fields are assigned, especially in tests
13. **Pattern Consistency (PC1, PC2)** - Check defensive patterns (null checks, guards, assertions) are applied consistently across similar code blocks in the same file
14. **Third-Party Overrides (T1)** - When third-party package models are imported directly, verify no custom app override exists

#### Cross-Layer System Analysis

After rule-based analysis, perform deeper system-level analysis (see 🔬 Cross-Layer System Analysis section):

12. **API Contract Reality** - Trace API calls to backend, verify frontend handles what API actually returns (not assumed)
13. **Semantic Dead Code** - Identify code that handles impossible cases based on upstream filtering/scoping
14. **State Machine Completeness** - For stateful entities, verify all states have exit paths and stuck-state recovery
15. **Implicit Contract Violations** - Find assumptions that exist only in comments, not enforced in code

When a rule violation is found, **tag it with the rule ID** (e.g., A1, C1, N1, R1, U1, L1) in the report.

#### High Confidence Issues (Always Report)

Issues that are almost certainly bugs or security problems:

- **Rule A1/A2/A3 violations**: Missing authorization checks, wrong permission scope (High severity)
- **Rule C1 violations**: Race conditions in sequential value generation (High severity)
- **Rule D1 violations**: Missing tenant scoping (High severity)
- **Rule L1/L2 violations**: Success shown for failures, scoped queries hiding error states (High severity)
- **Rule V1 violations**: Money/unit values double-converted or wrong due to model setter behavior (High severity)
- **Semantic dead code**: Code handling values that upstream API/query cannot return (High severity)
- **Stuck state with no recovery**: Stateful entity can get stuck permanently with no timeout/recovery mechanism (High severity)
- **Definite bugs**: Syntax errors, missing required parameters, calling non-existent methods
- **Clear security vulnerabilities**: SQL injection with raw user input, XSS with unsanitised output
- **Runtime errors**: Null reference on definitely-null values, type errors, infinite loops
- **API misuse**: Wrong number of arguments, incorrect return types

#### Medium Confidence Issues (Report if Medium or Low selected)

Issues that are likely problems but may be intentional in some contexts:

- **Rule C2 violations**: Missing transactions for multi-write operations (Medium severity)
- **Rule C3 violations**: Query-then-act without locking (Medium severity)
- **Rule F1 violations**: Missing event dispatches (Medium severity)
- **Rule E1 violations**: Enum/value contract mismatches (Medium severity)
- **Rule P1 violations**: N+1 query patterns (Low/Medium severity)
- **Rule N1 violations**: Redirect back after delete (Medium severity)
- **Rule R1/R2 violations**: Interval/subscription not cleared before replacement, missing cleanup (Medium severity)
- **Rule U1 violations**: Unused variable with semantic name or from function call (Medium severity)
- **Rule S1 violations**: Partial reload missing derived state (Medium severity)
- **Rule PC1 violations**: Defensive pattern (null check, guard, assertion) used in one place but missing from similar code in same file (Medium severity)
- **Rule T1 violations**: Third-party package model imported when custom app override exists (Medium severity, High if override adds scoping/auth)
- **Potential null references**: Accessing properties without null checks where null is possible
- **Missing error handling**: No try-catch around operations that could throw
- **Validation gaps**: Validation rules that don't fully cover business requirements
- **Race conditions**: Async operations without proper synchronisation
- **Logic gaps**: Conditional logic that may not handle all cases

#### Low Confidence Issues (Report only if Low selected)

Speculative issues that may be false positives:

- **Rule U2 violations**: Unused imports (Low severity)
- **Rule PC2 violations**: Similar code blocks using inconsistent approaches without clear justification (Low severity)
- **Code smells**: Overly complex logic, duplicated code, inconsistent naming
- **Performance concerns**: Potential N+1 queries without clear evidence
- **Missing best practices**: No type hints, missing documentation
- **Defensive suggestions**: Additional validation that "might" be needed
- **Style issues**: Things that could be cleaner but work correctly

### Step 5: Read and analyse each file

For each file:

1. Read the full file to understand context
2. For "Changed files only" mode: Focus on the changed lines (from diff)
3. For "Entire codebase" mode: Review the entire file
4. Understand what the code is trying to accomplish
5. Check if the implementation achieves the intent correctly
6. Look for edge cases not handled
7. **Apply the confidence filter** - only include issues that meet the selected threshold

### Step 5.5: Follow the White Rabbit 🐇

**For "Changed files only" and "Previous commits" modes, this step is CRITICAL.** After analyzing changed files, trace the impact of changes to find chained bugs in other files.

#### Identify what changed that needs tracing

Look for these high-impact change types in the diff:

1. **Signature changes**: Functions with added/removed/renamed parameters, changed return types
2. **Data structure changes**: New/removed fields, renamed properties, type changes
3. **API changes**: Modified request/response shapes, changed endpoints
4. **Behavioral changes**: Different error handling, new exceptions thrown, changed side effects
5. **Type/interface changes**: Modified type definitions that others depend on

#### For each traceable change:

**Step A: Find direct consumers**

Use Grep to find all references to the changed entity:

```bash
# For function/method changes - find all callers
rg "functionName\(" --type ts --type js -l

# For exported types/interfaces - find all imports
rg "import.*TypeName" --type ts -l

# For API endpoints - find frontend calls
rg "/api/endpoint" --type ts --type js -l

# For event names - find emitters and handlers
rg "eventName" --type ts --type js -l
```

**Step B: Read and analyze each consumer**

For each file that references the changed code:

1. Read the relevant sections of the consumer file
2. Check if the consumer's usage is compatible with the new behavior
3. Look for:
   - Arguments that don't match new parameter list
   - Field accesses that assume old structure
   - Error handling that doesn't catch new exceptions
   - Type annotations that conflict with new types
   - Mocks/stubs that encode old behavior

**Step C: Document chained issues**

When you find a bug caused by the change, document it as a **chained issue**:

```markdown
**Line X-Y**: [Issue title] (Chained from path/to/changed-file.ts:45)
- **Chain**: Changed function in `original-file.ts` → Called by this file
- **Type**: Type Mismatch / Missing Field / Broken Contract
- ...rest of issue format
```

#### Example: Following a signature change

Changed file (`src/services/user.ts`):
```diff
- async function getUser(id: string): Promise<User>
+ async function getUser(id: string, includeProfile?: boolean): Promise<User | null>
```

Trace steps:
1. Grep for `getUser(` across codebase
2. Found in `src/controllers/auth.ts:34`
3. Read that file, see: `const user = await getUser(userId); return user.name;`
4. **Bug found**: No null check after `getUser` call (return type changed to include `null`)
5. Report as chained issue linking back to the original change

#### How deep to trace

- **High severity changes** (auth, payments, data integrity): Trace 2-3 hops
- **Medium severity changes** (business logic): Trace 1-2 hops
- **Low severity changes** (utilities, helpers): Trace 1 hop

#### Skip tracing for

- Pure internal changes (no exported API affected)
- Additive-only changes (new optional fields with defaults)
- Test file changes
- Documentation/comment-only changes

### Step 5.6: Cross-Layer System Analysis 🔬

After file-level analysis and white rabbit tracing, perform deeper cross-layer analysis. This catches bugs that only appear when you understand how frontend and backend work together.

#### When to perform cross-layer analysis

- **Always** for code that calls APIs (fetch, axios, useSWR, React Query, Inertia)
- **Always** for stateful entities (jobs, orders, generations with status fields)
- **When reviewing full codebase or specific features** - more thorough analysis

#### Analysis checklist

1. **Trace API calls to backend reality**
   - For each API call in frontend code, find the backend route/controller
   - Check what the endpoint actually returns (scopes, filters, transformations)
   - Compare to what the frontend assumes it returns
   - Flag dead code handling impossible values

2. **Verify state machine completeness**
   - For stateful entities, map all possible states
   - Verify every state has an exit path (no stuck states)
   - Check for timeout/recovery mechanisms on "waiting" states
   - Flag states that can only be unstuck via manual DB intervention

3. **Find semantic dead code**
   - Code that handles values upstream logic already filtered out
   - Status checks for statuses the API cannot return
   - Error handling for errors the function cannot throw

4. **Check implicit contracts**
   - Business rules that exist only in comments/docs
   - Assumptions that rely on "correct usage" not enforcement
   - Time-based assumptions without timeout enforcement

#### Document cross-layer issues

```markdown
**Line X-Y**: [Issue title]
- **Type**: Semantic Dead Code / Stuck State / Contract Mismatch
- **Severity**: High/Medium/Low
- **Confidence**: High/Medium/Low
- **Cross-layer trace**: Frontend assumes X, but backend returns Y because [reason]
- **Description**: What's wrong
- **Why risky**: Impact
- **Fix pattern**: How to fix
```

### Step 6: Generate report

Compile findings into a structured report displayed to the user. **Include rule IDs** for all rule-based findings.

```markdown
## Review Summary

**Scope**: X unpushed commits, Y uncommitted files
**Confidence level**: High/Medium/Low
**Files reviewed**: Z
**Files traced (white rabbit)**: W
**Issues found**: N (Critical: X, Warnings: Y, Informational: Z, Chained: C)

## Critical Issues

Issues that will likely cause bugs or security problems.

### [File: path/to/file.php]

**Line X-Y**: [Issue title]
- **Rule**: A1, C1, D1, etc. (if applicable)
- **Type**: Security/Bug/Logic Error
- **Severity**: High
- **Confidence**: High/Medium/Low
- **Description**: What's wrong
- **Why risky**: Security/functional impact explanation
- **Failure scenario**: Concrete example of how this could be exploited or fail
- **Fix pattern**: Generic fix approach
- **Test to prevent regression**: Suggested test to catch this

## Warnings

Issues that may cause problems or indicate code smell.

### [File: path/to/file.tsx]

**Line X**: [Issue title]
- **Rule**: C2, F1, E1, etc. (if applicable)
- **Type**: Potential Bug/Logic Error
- **Severity**: Medium
- **Confidence**: High/Medium/Low
- **Description**: What's concerning
- **Why risky**: Potential impact
- **Fix pattern**: Recommended change

## Informational

Minor improvements or style suggestions.

### [File: path/to/file.js]

**Line X**: [Issue title]
- **Rule**: P1 (if applicable)
- **Type**: Code Quality/Performance
- **Severity**: Low
- **Confidence**: Low
- **Description**: What could be improved
- **Fix pattern**: Recommended change

## Chained Issues 🐇

Issues found by following the white rabbit from changed files into their consumers.

### [File: path/to/consumer.ts] (Chained from path/to/changed.ts:45)

**Line X-Y**: [Issue title]
- **Chain**: `changedFunction` in `changed.ts` → called by `consumerFunction` in this file
- **Type**: Type Mismatch / Broken Contract / Missing Null Check
- **Severity**: High/Medium/Low
- **Confidence**: High/Medium/Low
- **Description**: How the consumer is incompatible with the change
- **Why risky**: What will break at runtime
- **Failure scenario**: Concrete example of the failure
- **Fix pattern**: How to update the consumer

## Files Reviewed

- [x] path/to/file1.php - 2 issues
- [x] path/to/file2.tsx - No issues
- [ ] path/to/file3.js - Skipped (generated file)
```

**For previous commits**, update the scope line:
```markdown
**Scope**: Previous commits
**Commits**: abc1234 "Refactor auth flow", def5678 "Add task moving"
**Confidence level**: High/Medium/Low
**Files reviewed**: Z
**Files traced (white rabbit)**: W
**Issues found**: N (Critical: X, Warnings: Y, Informational: Z, Chained: C)
```

**For specific file reviews**, update the scope line:
```markdown
**Scope**: Specific files (user-specified patterns/files)
**Files**: path/to/file1.ts, src/auth/**/*.ts, config.py
**Confidence level**: High/Medium/Low
**Files reviewed**: Z
**Issues found**: N (Critical: X, Warnings: Y, Informational: Z)
```

**For full codebase scans**, update the scope line:
```markdown
**Scope**: Full codebase scan (all source files)
**Confidence level**: High/Medium/Low
**Files reviewed**: Z
**Issues found**: N (Critical: X, Warnings: Y, Informational: Z)
```

### Step 7: Write suggested changes to todo file

**IMPORTANT**: After generating the report, write all actionable issues to `.claude/skills/bf-code-review/suggested-changes.md` as a todo list.

Use the Write tool to create/overwrite the file with this format:

```markdown
# Code Review - Suggested Changes

Generated: [current date/time]
Branch: [branch name]
Scope: [X commits, Y uncommitted files] OR [Previous commits: abc1234, def5678] OR [Specific files: patterns/paths] OR [Full codebase scan]
Confidence: [High/Medium/Low]

## Todo List

Run `/bf-fix-issues` to fix these issues automatically.

### Critical

- [ ] **[path/to/file:45-48]** Missing authorization check (Rule A1)
  - **Rule**: A1
  - **Type**: Security
  - **Severity**: High
  - **Confidence**: High
  - **Description**: Record updated by ID without authorization check
  - **Why risky**: Allows privilege escalation and unauthorized access
  - **Failure scenario**: Any authenticated user could modify any record by guessing IDs
  - **Fix**: Add authorization check before mutation
  - **Test**: Create test with unauthorized user attempting to update another user's resource
  - **TL;DR**: Missing object-level authorization allows privilege escalation

- [ ] **[path/to/file:67-70]** Race condition in ID generation (Rule C1)
  - **Rule**: C1
  - **Type**: Bug
  - **Severity**: High
  - **Confidence**: High
  - **Description**: Uses `max(id) + 1` without atomicity guarantee
  - **Why risky**: Concurrent requests can generate duplicate IDs
  - **Failure scenario**: Two simultaneous requests get same ID, causing constraint violation or data corruption
  - **Fix**: Use database sequence, UUID, or transaction with row lock
  - **Test**: Create test with concurrent ID generation requests
  - **TL;DR**: Sequential value generation is not concurrency-safe

### Warnings

- [ ] **[path/to/file:23-28]** Multi-write without transaction (Rule C2)
  - **Rule**: C2
  - **Type**: Logic Error
  - **Severity**: Medium
  - **Confidence**: Medium
  - **Description**: Creates order and inventory records separately without transaction
  - **Why risky**: Partial failure leaves inconsistent state
  - **Failure scenario**: Order created but inventory update fails, causing overselling
  - **Fix**: Wrap both operations in database transaction
  - **Test**: Create test that simulates failure between operations
  - **TL;DR**: Multi-write operation lacks atomicity guarantee

- [ ] **[path/to/file:89]** N+1 query pattern (Rule P1)
  - **Rule**: P1
  - **Type**: Performance
  - **Severity**: Medium
  - **Confidence**: Medium
  - **Description**: Loops through users, fetching profile for each one
  - **Why risky**: Causes database overload with many records
  - **Fix**: Use eager loading or join to fetch profiles in single query
  - **Test**: Monitor query count in test with multiple users
  - **TL;DR**: Loop triggers one query per item

### Informational

- [ ] **[path/to/file:100]** Missing event dispatch (Rule F1)
  - **Rule**: F1
  - **Type**: Functional Completeness
  - **Severity**: Low
  - **Confidence**: Low
  - **Description**: UserCreated event class exists but never dispatched
  - **Fix**: Add event dispatch after user creation
  - **Test**: Assert event was dispatched in user creation test
  - **TL;DR**: Required side effect not wired

### Chained Issues 🐇

Issues found by tracing from changed files to their consumers.

- [ ] **[path/to/consumer.ts:78]** Null access after nullable return (Chained from src/services/user.ts:45)
  - **Chain**: `getUser()` return type → `handleAuth()` caller
  - **Type**: Potential Bug
  - **Severity**: High
  - **Confidence**: High
  - **Description**: `getUser()` now returns `User | null` but caller accesses `.name` without null check
  - **Why risky**: Runtime crash when user not found
  - **Failure scenario**: User lookup returns null, `null.name` throws TypeError
  - **Fix**: Add null check: `if (!user) return notFound()`
  - **Test**: Test auth handler when user doesn't exist
  - **TL;DR**: Consumer not updated for nullable return type
```

**File path**: `.claude/skills/bf-code-review/suggested-changes.md`

Each todo item MUST include:
- `[ ]` checkbox (unchecked)
- `**[file:line]**` - exact file path and line number(s)
- Issue title with rule ID in parentheses (if applicable)
- For chained issues: `(Chained from path/to/source.ts:line)` after the title
- **Chain**: (for chained issues only) Source entity → Consumer relationship
- **Rule**: Rule ID (A1, C1, etc.) - include if issue maps to a specific rule
- **Type**: Issue type
- **Severity**: High/Medium/Low
- **Confidence**: High/Medium/Low
- **Description**: What's wrong
- **Why risky**: Impact explanation
- **Failure scenario**: Concrete failure example (for Critical/Warnings)
- **Fix** or **Fix pattern**: How to fix
- **Test** or **Test to prevent regression**: Suggested test
- **TL;DR**: One sentence summary

**Valid Type values**:
- `Security` - Security vulnerabilities (authorization, injection, etc.)
- `Bug` - Definite bugs that will cause errors
- `Logic Error` - Flawed logic that produces incorrect results
- `Potential Bug` - Code that may cause bugs under certain conditions
- `Resource Leak` - Intervals, subscriptions, connections not cleaned up (R1, R2)
- `Dead Code` - Unused variables, imports, or unreachable code (U1, U2)
- `Semantic Dead Code` - Code handling values that API/upstream cannot return (cross-layer)
- `State Handling` - API response states not properly distinguished (L1, L2)
- `Stuck State` - State machine can get stuck with no recovery mechanism (cross-layer)
- `Contract Mismatch` - Frontend assumptions don't match backend reality (cross-layer)
- `Value/Unit Mismatch` - Money or quantity values wrong due to setter/cast transformations (V1)
- `Pattern Inconsistency` - Defensive pattern applied in some places but not others in same file (PC1, PC2)
- `Wrong Import` - Third-party package model used when custom app override exists (T1)
- `Performance` - Performance issues (N+1, slow operations)
- `Functional Completeness` - Missing side effects or wiring
- `Code Quality` - Style, maintainability, or best practice issues

### Step 8: Prioritise findings

Order issues by severity in both the report and the todo file:

1. **Critical**: Security vulnerabilities, definite bugs, data loss risks
2. **Warnings**: Potential bugs, logic issues, missing error handling
3. **Informational**: Code quality, style, minor improvements

## Confidence Level Examples

### High Confidence (almost certainly a bug)

These issues will cause errors or security vulnerabilities:

```javascript
// Rule A1 - Missing authorization (High severity)
async function deleteOrder(orderId) {
  const order = await Order.findById(orderId)
  await order.delete()  // No check if user owns this order
}

// Rule A2 - Wrong permission checked (High severity)
async function approveDocument(docId) {
  if (!user.can('view', doc)) return  // Checks view, not approve
  await doc.approve()  // Performs privileged action
}

// Rule C1 - Race condition in ID generation (High severity)
async function createInvoice() {
  const latest = await Invoice.max('invoiceNumber')
  const next = latest + 1  // Two requests get same number
  return await Invoice.create({ invoiceNumber: next })
}

// Rule D1 - Missing tenant scope (High severity)
async function getOrders(userId) {
  return await Order.where({ userId })  // Missing tenantId filter
}

// Rule A3 - Wrong permission scope on move (Medium severity)
async function moveToFolder(items, targetFolderId) {
  const folder = await Folder.findAccessibleBy(user, targetFolderId)  // Read access!
  await items.update({ folderId: folder.id })  // But this is a write operation
}
// Should check: user.can('create', folder)

// Rule L1 - Success shown for both success AND failure (High severity)
const { current } = await fetchCurrentGeneration();
if (current === null) {
  // BUG: null means completed OR failed - can't distinguish!
  toast.success('Ready for download!');  // Shows success even on failure
}

// Rule L2 - Scoped query hides failure state (High severity)
// Backend uses active() scope that excludes completed AND failed
const generation = await Generation.active().where('project_id', id).first();
// Returns null for success AND failure - consumer can't tell the difference

// Semantic dead code - code handling impossible values (High severity)
// This entire block can NEVER execute:
const current = await fetchCurrentGeneration();  // Uses active() scope
if (current && (current.status.value === 'completed' || current.status.value === 'failed')) {
    // active() only returns pending/processing, NEVER completed/failed
    // This code is semantically unreachable
    clearInterval(pollingRef.current);  // Never runs
    toast.success('Done!');  // Never runs
}
// Trace: fetchCurrentGeneration → /current endpoint → active() scope → only pending/processing

// Stuck state with no recovery (High severity)
// Backend: worker crash leaves generation stuck in PROCESSING forever
public function store(Request $request) {
    $current = Generation::active()->first();  // Includes PROCESSING
    if ($current) {
        return response()->json(['error' => 'Generation in progress'], 409);
    }
    // If worker crashed, PROCESSING is stuck forever
    // User permanently blocked from starting new generation
    // No timeout mechanism, no recovery path except manual DB fix
}

// Rule V1 - Money value double-converted by model setter (High severity)
// Model setter: setTicketPriceAttribute($v) { $this->attributes['ticket_price'] = $v * 100; }
// CLAUDE.md says: "Money stored as integers in minor units (cents/pence)"
$event = Event::factory()->create(['ticket_price' => 1500]);
// BUG: Setter multiplies by 100, so stored value = 150000 (£1500 not £15!)
// Should pass 15 (pounds) and let setter convert to 1500 (pence)

// Rule T1 - Wrong model import when custom override exists (Medium/High severity)
use Spatie\Permission\Models\Role;  // Package model
// But App\Models\Role exists with custom tenant scoping!
$role = Role::findByName('admin');  // Misses tenant scope → returns roles from ALL tenants

// Wrong number of arguments
calculateTotal(price)  // Function requires 2 parameters: price and quantity

# Null/undefined access without check
user.profile.name  // user.profile could be null/undefined

# SQL injection
query("SELECT * FROM users WHERE id = " + id)  // Direct string concatenation

# Division by zero
total / count  // count could be 0

# Array index out of bounds
items[items.length]  // Off-by-one error, should be length - 1
```

### Medium Confidence (likely a problem)

These issues are probably bugs but may be intentional:

```javascript
// Rule C2 - Missing transaction (Medium severity)
async function transferFunds(fromId, toId, amount) {
  await Account.decrement(fromId, amount)  // First operation
  await Account.increment(toId, amount)    // Second operation - could fail
}  // If second fails, money disappears

// Rule E1 - Enum mismatch (Medium severity)
// Backend enum
enum Status { ACTIVE = "active", PENDING = "pending" }

// Frontend comparison
if (user.status === "Active") {  // Case mismatch, always false
  // ...
}

// Rule F1 - Missing event dispatch (Medium severity)
async function createOrder(data) {
  const order = await Order.create(data)
  // OrderCreated event exists but not dispatched
  return order  // Email notification never sent
}

// Missing error handling
response = await fetch(url)  // No try-catch, no error check

# Unchecked return value
file = openFile(path)  // File might not exist, return not checked
file.read()

# Race condition
if (!exists(file)) {
    create(file)  // Another process might create it between check and create
}

# Resource leak
connection = database.connect()
result = connection.query(sql)
return result  // Connection never closed

# Off-by-one in loops
for (i = 0; i <= array.length; i++)  // Should be < not <=

// Rule PC1 - Inconsistent null check pattern (Medium severity)
// Test 1 does it correctly:
$booking = Booking::where('event_id', $event->id)->first();
$this->assertNotNull($booking);  // ✓ Defensive check
$this->assertEquals($user->id, $booking->user_id);

// Test 2 in SAME FILE skips the check:
$booking = Booking::where('event_id', $event->id)->first();
// Missing assertNotNull! If null, next line gives confusing "property of null" error
$this->assertEquals($user->id, $booking->user_id);  // BUG if booking is null

// Rule C3 - Query outside transaction (Medium severity)
items = db.query("SELECT * FROM items WHERE status = 'pending'")
db.transaction(() => {
  for (item of items) {
    item.update({ status: 'processed' })  // Items may have changed!
  }
})

// Rule N1 - Redirect back after delete (Medium severity)
function deleteItem(item) {
  db.delete(item)
  return redirectBack()  // If on item's page, this 404s
}

// Rule S1 - Partial reload missing derived state (Medium severity)
function onMoveComplete() {
  reload({ only: ['items'] })  // itemCounts not included!
}
// Dialog shows stale count from itemCounts

// Rule R1 - Interval not cleared before starting new one (Medium severity)
function handleGenerate() {
  // BUG: If polling already active, old interval keeps running forever!
  pollingRef.current = setInterval(() => pollStatus(), 1000);
}
// Fix: clearInterval(pollingRef.current) before starting new one

// Rule R2 - Missing cleanup on unmount (Medium severity)
useEffect(() => {
  const interval = setInterval(() => poll(), 1000);
  // BUG: No cleanup function - interval runs forever after unmount
}, []);
// Fix: return () => clearInterval(interval);

// Rule U1 - Unused variable with semantic purpose (Medium severity)
$zipFilename = basename($zipPath);  // Comment: "Extract filename for storage"
// ... later passes $zipPath instead of $zipFilename
$this->markAsCompleted($zipPath);  // Was $zipFilename meant to be used here?

// Rule U1 - Unused computation suggests incomplete implementation (Medium severity)
$featureCount = $project->features()->count();  // Comment: "for progress tracking"
dispatch(new GenerateJob($project));  // $featureCount never passed or used
```

### Low Confidence (speculative)

These might be issues depending on context:

```javascript
// Rule P1 - N+1 query (Low/Medium severity)
async function getUsersWithProfiles() {
  const users = await User.all()
  for (const user of users) {
    user.profile = await Profile.findByUserId(user.id)  // N+1 query
  }
  return users
}
// Fix: Use eager loading or join

# Duplicated logic
// Same 10 lines appear in multiple places - could extract to shared function

# Magic numbers
if (status == 3)  // What does 3 mean? Consider using a constant

# Deep nesting
if (a) {
    if (b) {
        if (c) {  // Hard to follow - consider early returns

# Large function
function processOrder() {
    // 200+ lines - might benefit from being split up

// Rule U2 - Unused import (Low severity)
import { formatDate, parseDate } from 'date-utils';  // parseDate never used
// Just dead code, not a bug - but should be cleaned up

# Simple unused variable (no semantic indicator - Low severity)
result = calculate()  // 'result' is never used, but no comment or context
// Compare to U1 which has comments/names suggesting intent
```

## Best Practices

- For "Changed files only" mode: Focus on the **changed code**, not pre-existing issues
- For "Previous commits" mode: Focus on the **changes in those commits**, trace to find chained bugs
- For "Specific files" mode: Review the **entire content** of each specified file (user deliberately chose these files)
- For "Entire codebase" mode: Review all code in each file
- Consider the **context** of surrounding code
- **Respect the confidence level** selected by the user
- Provide **actionable suggestions**, not vague complaints
- Skip generated files, vendor directories, and lock files
- Don't nitpick style issues that linters would catch
- **Always write to `suggested-changes.md`** even if no issues found (write "No issues found")
- **Always output the full absolute path** to the suggested-changes.md file in a fenced code block at the end of your response, so the user can easily find and open it
- **Always follow the white rabbit** 🐇 for changed files and previous commits modes - trace signature changes, type changes, and behavioral changes to find bugs in consumer files
- **Report chained issues separately** with clear links back to the originating change

## What This Skill Does NOT Do

- Modify source code files (only writes to `suggested-changes.md`)
- Run tests
- Apply fixes automatically

## Example Output

```
## Review Summary

**Scope**: 3 unpushed commits, 2 uncommitted files
**Confidence level**: Medium
**Files reviewed**: 5
**Files traced (white rabbit)**: 3
**Issues found**: 7 (Critical: 2, Warnings: 2, Informational: 1, Chained: 2)

## Critical Issues

### [File: src/controllers/order.ts]

**Line 34-38**: Missing authorization check (Rule A1)
- **Rule**: A1
- **Type**: Security
- **Severity**: High
- **Confidence**: High
- **Description**: Order is deleted by ID without verifying user owns the order
- **Why risky**: Allows any user to delete other users' orders
- **Failure scenario**: Attacker deletes all orders by iterating order IDs
- **Fix pattern**: Add check: `if (order.userId !== currentUser.id) throw UnauthorizedError`
- **Test to prevent regression**: Test that user cannot delete another user's order
- **TL;DR**: Missing object-level authorization on delete operation

### [File: src/services/invoice.ts]

**Line 67-72**: Race condition in invoice number generation (Rule C1)
- **Rule**: C1
- **Type**: Bug
- **Severity**: High
- **Confidence**: High
- **Description**: Uses `max(invoiceNumber) + 1` without transaction lock
- **Why risky**: Concurrent invoice creation produces duplicate numbers
- **Failure scenario**: Two simultaneous orders get INV-1001, violating uniqueness
- **Fix pattern**: Use DB sequence or transaction with SELECT FOR UPDATE
- **Test to prevent regression**: Create concurrent invoice generation test
- **TL;DR**: Sequential number generation not concurrency-safe

## Warnings

### [File: src/services/order.ts]

**Line 89-95**: Multi-write without transaction (Rule C2)
- **Rule**: C2
- **Type**: Logic Error
- **Severity**: Medium
- **Confidence**: Medium
- **Description**: Creates order record and updates inventory without transaction
- **Why risky**: Inventory may not update if order creation succeeds
- **Fix pattern**: Wrap both operations in database transaction with rollback
- **TL;DR**: Multi-write lacks atomicity guarantee

### [File: src/api/users.ts]

**Line 120-125**: N+1 query in user list (Rule P1)
- **Rule**: P1
- **Type**: Performance
- **Severity**: Medium
- **Confidence**: High
- **Description**: Loops through users fetching profile for each one
- **Why risky**: 1000 users = 1001 queries, causing slow response
- **Fix pattern**: Add .include('profile') or use join/eager loading
- **TL;DR**: Loop triggers one query per item

## Informational

### [File: src/events/order-created.ts]

**Line 45**: Missing event dispatch (Rule F1)
- **Rule**: F1
- **Type**: Functional Completeness
- **Severity**: Low
- **Confidence**: Medium
- **Description**: OrderShipped event handler exists but event never dispatched
- **Fix pattern**: Add `this.events.dispatch(new OrderShipped(order))` after status update
- **TL;DR**: Side effect infrastructure exists but not wired

## Chained Issues 🐇

### [File: src/controllers/auth.ts] (Chained from src/services/user.ts:34)

**Line 78-82**: Missing null check after getUser (Chained from src/services/user.ts:34)
- **Chain**: `getUser()` return type changed → `handleLogin()` caller
- **Type**: Potential Bug
- **Severity**: High
- **Confidence**: High
- **Description**: `getUser()` now returns `User | null` but this caller accesses `.email` without null check
- **Why risky**: TypeError crash when user lookup fails
- **Failure scenario**: Login with non-existent email causes `null.email` crash instead of "user not found" error
- **Fix pattern**: Add `if (!user) return res.status(404).json({ error: 'User not found' })`
- **TL;DR**: Caller not updated for nullable return type change

### [File: src/api/profile.ts] (Chained from src/models/user.ts:12)

**Line 45**: Accessing removed field `user.avatarUrl` (Chained from src/models/user.ts:12)
- **Chain**: `avatarUrl` removed from User model → `getProfile()` consumer
- **Type**: Bug
- **Severity**: High
- **Confidence**: High
- **Description**: User model no longer has `avatarUrl` field (moved to `user.profile.avatar`) but this file still accesses it
- **Why risky**: Returns undefined instead of actual avatar URL
- **Failure scenario**: Profile page shows broken/missing avatar image
- **Fix pattern**: Change `user.avatarUrl` to `user.profile?.avatar`
- **TL;DR**: Consumer accesses field that was moved/removed

---

Suggested changes written to:

\`\`\`
/full/absolute/path/to/project/.claude/skills/bf-code-review/suggested-changes.md
\`\`\`

Run `/bf-fix-issues` to fix these issues automatically.
```
