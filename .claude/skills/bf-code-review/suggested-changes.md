# Code Review - Suggested Changes

Generated: 2026-02-02
Branch: N/A (inline code review)
Scope: Inline code review (HandoffAssetGenerationController.php)
Confidence: Medium

## Todo List

Run `/bf-fix-issues` to fix these issues automatically.

### Critical

- [ ] **[HandoffAssetGenerationController.php:52-60]** No recovery mechanism for stuck PROCESSING generations (Stuck State)
  - **Rule**: N/A (Cross-layer)
  - **Type**: Stuck State
  - **Severity**: High
  - **Confidence**: High
  - **Description**: The `store()` method checks for active generations before allowing a new one. If `getCurrentForProject()` returns a generation stuck in PROCESSING (due to worker crash, OOM kill, or server restart), the user is permanently blocked from starting new generations.
  - **Why risky**: Unlike cache-based approach with TTL, database records don't expire. Manual DB intervention required to unblock users.
  - **Failure scenario**: Worker crashes mid-job → generation stuck PROCESSING → user tries new generation → 409 forever → requires manual DB fix
  - **Fix**: Add timeout mechanism - auto-fail generations stuck processing for > 30 minutes before the active check
  - **Test**: Test that stuck PROCESSING generation older than timeout allows new generation to start
  - **TL;DR**: Worker crash leaves PROCESSING stuck forever, permanently blocking user

### Warnings

- [ ] **[HandoffAssetGenerationController.php:68-69]** Unused $progressKey variable created but not stored (Rule U1)
  - **Rule**: U1
  - **Type**: Dead Code
  - **Severity**: Medium
  - **Confidence**: High
  - **Description**: A unique `$progressKey` is generated and passed to the job, but never stored on the generation record or returned in response.
  - **Why risky**: If progress key is meant for real-time tracking, clients have no way to retrieve it
  - **Failure scenario**: Frontend cannot poll for real-time progress if $progressKey was the intended cache key
  - **Fix**: Either store it on generation record, return it in response, or remove it if progress tracked via generation record
  - **Test**: Verify progress tracking works end-to-end
  - **TL;DR**: Progress key created but never stored or returned - orphaned value

- [ ] **[HandoffAssetGenerationController.php:52-55]** Race condition in check-then-create pattern (Rule C3)
  - **Rule**: C3
  - **Type**: Potential Bug
  - **Severity**: Medium
  - **Confidence**: Medium
  - **Description**: Check for active generation and creation of new generation isn't atomic. Two simultaneous requests could both pass the check and create duplicate generations.
  - **Why risky**: Two users clicking Generate simultaneously could create two concurrent jobs for same project
  - **Failure scenario**: Request A checks (null) → Request B checks (null) → both create → two jobs running, file conflicts
  - **Fix**: Use database transaction with row lock, or add unique constraint on (project_id, status) for active statuses
  - **Test**: Test concurrent generation requests for same project
  - **TL;DR**: Check-then-create without lock allows duplicate generations

### Informational

No informational issues.

## Files Reviewed

- [x] HandoffAssetGenerationController.php - 3 issues (1 Critical, 2 Warnings)
