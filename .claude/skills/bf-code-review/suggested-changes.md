# Code Review - Suggested Changes

Generated: 2026-03-08T12:27:28.060Z
Scope: changed
Confidence: high

## Todo List

### Warnings

- [ ] **[src/renderer/src/App.tsx:32]** useEffect creates timeout without cleanup (Rule R2)
  - **Rule**: R2
  - **Type**: Resource Leak
  - **Severity**: Medium
  - **Confidence**: High
  - **Description**: useEffect sets up a timeout but has no cleanup return function
  - **Why risky**: timeout continues running after component unmount, causing memory leaks
  - **Fix**: Add cleanup return: return () => { clearTimeout(...) }
  - **Test**: Verify resource is cleaned up on unmount
  - **TL;DR**: Missing cleanup for timeout in useEffect

- [ ] **[src/renderer/src/screens/BuildScreen.tsx:218]** Interval/timeout overwritten without clearing previous (Rule R1)
  - **Rule**: R1
  - **Type**: Resource Leak
  - **Severity**: Medium
  - **Confidence**: High
  - **Description**: Ref assigned new interval/timeout without clearing the old one first
  - **Why risky**: Old interval keeps running forever, causing memory leaks and duplicate handlers
  - **Fix**: Add clearInterval/clearTimeout before assigning new interval
  - **Test**: Verify only one interval runs after multiple calls
  - **TL;DR**: Resource leak from unclearned interval/timeout
