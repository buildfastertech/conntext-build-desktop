import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import { execSync } from "child_process";

/**
 * Code Review Tool — Comprehensive review following the bf-code-review SKILL.md framework.
 * Applies rule-based analysis (A1-A3, C1-C3, D1, P1, F1, E1, N1-N2, R1-R2, U1-U2, L1-L2, S1-S2, V1, PC1-PC2, T1)
 * and returns structured findings tagged with rule IDs.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

interface CodeIssue {
  rule?: string;
  severity: "High" | "Medium" | "Low";
  confidence: "High" | "Medium" | "Low";
  type: string;
  title: string;
  description: string;
  line?: number;
  endLine?: number;
  whyRisky?: string;
  failureScenario?: string;
  fix: string;
  test?: string;
  tldr: string;
}

type ConfidenceLevel = "high" | "medium" | "low";

// ─── Tool Definition ─────────────────────────────────────────────────────────

export const codeReviewTool = tool(
  "code_review",
  `Perform a comprehensive code review following the bf-code-review rules framework.
Analyzes code for authorization issues (A1-A3), concurrency bugs (C1-C3), data integrity (D1),
performance (P1), functional completeness (F1), enum consistency (E1), navigation safety (N1-N2),
resource lifecycle (R1-R2), dead code (U1-U2), API state handling (L1-L2), state sync (S1-S2),
value integrity (V1), pattern consistency (PC1-PC2), and third-party overrides (T1).

Returns a structured report with rule IDs and suggested fixes.`,
  {
    scope: z.enum(["changed", "specific", "all"]).describe(
      "Review scope: 'changed' for uncommitted/unpushed changes, 'specific' for listed files, 'all' for entire codebase"
    ),
    confidence: z.enum(["high", "medium", "low"]).default("high").describe(
      "Minimum confidence level: 'high' = almost certainly bugs, 'medium' = likely problems, 'low' = everything including speculative"
    ),
    files: z.array(z.string()).optional().describe(
      "File paths or glob patterns to review (required when scope is 'specific')"
    ),
    focusAreas: z.array(z.enum([
      "authorization",
      "concurrency",
      "data-integrity",
      "performance",
      "completeness",
      "contracts",
      "navigation",
      "resource-lifecycle",
      "dead-code",
      "api-state",
      "state-sync",
      "value-integrity",
      "pattern-consistency",
      "third-party",
      "security",
      "all"
    ])).optional().describe("Specific rule categories to focus on (defaults to 'all')"),
  },
  async (args, context) => {
    try {
      const { scope, confidence = "high", files: specifiedFiles, focusAreas = ["all"] } = args;
      const workingDir = process.cwd();

      // Step 1: Gather files based on scope
      const filesToReview = await gatherFiles(scope, workingDir, specifiedFiles);

      if (filesToReview.length === 0) {
        return {
          content: [{
            type: "text",
            text: "No files found to review for the selected scope."
          }]
        };
      }

      // Step 2: Get diff info for changed scope
      let diffContent = "";
      if (scope === "changed") {
        diffContent = getDiffContent(workingDir);
      }

      // Step 3: Read and analyze each file
      const allIssues: Map<string, CodeIssue[]> = new Map();
      let filesReviewed = 0;

      for (const filePath of filesToReview) {
        try {
          const fullPath = path.isAbsolute(filePath)
            ? filePath
            : path.resolve(workingDir, filePath);

          // Security: ensure within working directory
          if (!fullPath.startsWith(workingDir)) {
            continue;
          }

          const content = await fs.readFile(fullPath, "utf-8");
          const ext = path.extname(filePath).toLowerCase();
          const relativePath = path.relative(workingDir, fullPath).replace(/\\/g, "/");

          // Skip non-source files
          if (shouldSkipFile(relativePath, ext)) continue;

          const issues = analyzeFile(content, ext, relativePath, focusAreas, confidence);

          if (issues.length > 0) {
            allIssues.set(relativePath, issues);
          }
          filesReviewed++;
        } catch {
          // Skip files that can't be read
        }
      }

      // Step 4: Generate structured report
      const report = generateReport(allIssues, filesReviewed, scope, confidence, diffContent);

      // Step 5: Write suggested-changes.md
      await writeSuggestedChanges(workingDir, allIssues, scope, confidence);

      return {
        content: [{
          type: "text",
          text: report
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error during code review: ${error}`
        }],
        isError: true
      };
    }
  }
);

// ─── File Gathering ──────────────────────────────────────────────────────────

async function gatherFiles(
  scope: string,
  workingDir: string,
  specifiedFiles?: string[]
): Promise<string[]> {
  switch (scope) {
    case "changed":
      return getChangedFiles(workingDir);
    case "specific":
      return specifiedFiles || [];
    case "all":
      return getAllSourceFiles(workingDir);
    default:
      return [];
  }
}

function getChangedFiles(workingDir: string): string[] {
  const files = new Set<string>();
  try {
    // Uncommitted changes (staged + unstaged)
    const staged = execSync("git diff --cached --name-only", { cwd: workingDir, encoding: "utf-8" });
    const unstaged = execSync("git diff --name-only", { cwd: workingDir, encoding: "utf-8" });

    // Unpushed commits
    let unpushed = "";
    try {
      unpushed = execSync(
        'git diff --name-only origin/$(git branch --show-current)..HEAD',
        { cwd: workingDir, encoding: "utf-8", shell: "bash" }
      );
    } catch {
      try {
        unpushed = execSync("git diff --name-only origin/master..HEAD", {
          cwd: workingDir, encoding: "utf-8"
        });
      } catch {
        // No remote tracking
      }
    }

    for (const f of [...staged.split("\n"), ...unstaged.split("\n"), ...unpushed.split("\n")]) {
      const trimmed = f.trim();
      if (trimmed) files.add(trimmed);
    }
  } catch {
    // Fallback: use git status
    try {
      const status = execSync("git status --short", { cwd: workingDir, encoding: "utf-8" });
      for (const line of status.split("\n")) {
        const filePath = line.trim().substring(3).trim();
        if (filePath) files.add(filePath);
      }
    } catch {
      // Not a git repo or git not available
    }
  }
  return Array.from(files);
}

function getAllSourceFiles(workingDir: string): string[] {
  const extensions = [".ts", ".tsx", ".js", ".jsx", ".php", ".py", ".vue", ".svelte"];
  const files: string[] = [];

  try {
    const extPattern = extensions.map(e => `*${e}`).join(" -o -name ");
    const cmd = `find . -type f \\( -name ${extPattern} \\) -not -path "*/node_modules/*" -not -path "*/vendor/*" -not -path "*/dist/*" -not -path "*/build/*" -not -path "*/.git/*" -not -path "*/storage/*" -not -path "*/cache/*"`;
    const result = execSync(cmd, { cwd: workingDir, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
    for (const f of result.split("\n")) {
      const trimmed = f.trim().replace(/^\.\//, "");
      if (trimmed) files.push(trimmed);
    }
  } catch {
    // Fallback: try PowerShell on Windows
    try {
      const exts = extensions.map(e => `'*${e}'`).join(",");
      const cmd = `powershell -Command "Get-ChildItem -Recurse -Include ${exts} -File | Where-Object { $_.FullName -notmatch 'node_modules|vendor|dist|build|\\.git|storage|cache' } | ForEach-Object { $_.FullName }"`;
      const result = execSync(cmd, { cwd: workingDir, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
      for (const f of result.split("\n")) {
        const trimmed = f.trim();
        if (trimmed) {
          files.push(path.relative(workingDir, trimmed).replace(/\\/g, "/"));
        }
      }
    } catch {
      // Give up
    }
  }
  return files;
}

function getDiffContent(workingDir: string): string {
  let diff = "";
  try {
    diff += execSync("git diff --cached", { cwd: workingDir, encoding: "utf-8" });
    diff += execSync("git diff", { cwd: workingDir, encoding: "utf-8" });
    try {
      diff += execSync(
        'git diff origin/$(git branch --show-current)..HEAD',
        { cwd: workingDir, encoding: "utf-8", shell: "bash" }
      );
    } catch {
      try {
        diff += execSync("git diff origin/master..HEAD", { cwd: workingDir, encoding: "utf-8" });
      } catch { /* no remote */ }
    }
  } catch { /* not a git repo */ }
  return diff;
}

function shouldSkipFile(filePath: string, ext: string): boolean {
  const skipDirs = ["node_modules", "vendor", "dist", "build", ".git", "storage", "cache", ".next", "coverage"];
  const skipExts = [".min.js", ".min.css", ".map", ".lock", ".log"];
  const sourceExts = [".ts", ".tsx", ".js", ".jsx", ".php", ".py", ".vue", ".svelte"];

  if (skipDirs.some(d => filePath.includes(`${d}/`))) return true;
  if (skipExts.some(e => filePath.endsWith(e))) return true;
  if (!sourceExts.includes(ext)) return true;
  if (filePath.endsWith(".d.ts")) return true;

  return false;
}

// ─── Analysis Engine ─────────────────────────────────────────────────────────

function analyzeFile(
  content: string,
  ext: string,
  filePath: string,
  focusAreas: string[],
  confidence: ConfidenceLevel
): CodeIssue[] {
  const issues: CodeIssue[] = [];
  const lines = content.split("\n");
  const should = (area: string) => focusAreas.includes("all") || focusAreas.includes(area);

  const isTS = [".ts", ".tsx"].includes(ext);
  const isJS = [".js", ".jsx"].includes(ext);
  const isPHP = ext === ".php";
  const isFrontend = [".tsx", ".jsx", ".vue", ".svelte"].includes(ext);
  const isTSorJS = isTS || isJS;

  // ── A1-A3: Authorization ────────────────────────────────────────────────
  if (should("authorization") || should("security")) {
    checkAuthorization(lines, filePath, issues, isTSorJS, isPHP);
  }

  // ── C1-C3: Concurrency & Atomicity ──────────────────────────────────────
  if (should("concurrency")) {
    checkConcurrency(lines, content, filePath, issues, isTSorJS, isPHP);
  }

  // ── D1: Data Integrity & Scope ──────────────────────────────────────────
  if (should("data-integrity")) {
    checkDataIntegrity(lines, content, filePath, issues, isPHP);
  }

  // ── P1: Performance ─────────────────────────────────────────────────────
  if (should("performance")) {
    checkPerformance(lines, content, filePath, issues, isTSorJS, isPHP, confidence);
  }

  // ── F1: Functional Completeness ─────────────────────────────────────────
  if (should("completeness")) {
    checkCompleteness(lines, content, filePath, issues, isTSorJS, isPHP, confidence);
  }

  // ── E1: Enum/Contract Consistency ───────────────────────────────────────
  if (should("contracts")) {
    checkContracts(lines, content, filePath, issues, isTSorJS, isPHP, confidence);
  }

  // ── N1-N2: Navigation & Redirect Safety ─────────────────────────────────
  if (should("navigation")) {
    checkNavigation(lines, content, filePath, issues, isTSorJS, isPHP);
  }

  // ── R1-R2: Resource Lifecycle ───────────────────────────────────────────
  if (should("resource-lifecycle")) {
    checkResourceLifecycle(lines, content, filePath, issues, isFrontend, isTSorJS);
  }

  // ── U1-U2: Dead Code & Unused ───────────────────────────────────────────
  if (should("dead-code")) {
    checkDeadCode(lines, content, filePath, issues, isTSorJS, isPHP, confidence);
  }

  // ── L1-L2: API Response & State Handling ────────────────────────────────
  if (should("api-state")) {
    checkApiState(lines, content, filePath, issues, isTSorJS);
  }

  // ── S1-S2: Frontend State Sync ──────────────────────────────────────────
  if (should("state-sync") && isFrontend) {
    checkStateSync(lines, content, filePath, issues);
  }

  // ── V1: Value & Unit Integrity ──────────────────────────────────────────
  if (should("value-integrity")) {
    checkValueIntegrity(lines, content, filePath, issues, isPHP, isTSorJS);
  }

  // ── PC1-PC2: Pattern Consistency ────────────────────────────────────────
  if (should("pattern-consistency")) {
    checkPatternConsistency(lines, content, filePath, issues, confidence);
  }

  // ── T1: Third-Party Overrides ───────────────────────────────────────────
  if (should("third-party") && isPHP) {
    checkThirdPartyOverrides(lines, filePath, issues, confidence);
  }

  // ── General Security ────────────────────────────────────────────────────
  if (should("security")) {
    checkSecurity(lines, content, filePath, issues, isTSorJS, isPHP);
  }

  // Filter by confidence level
  return filterByConfidence(issues, confidence);
}

// ─── Rule Checkers ───────────────────────────────────────────────────────────

function checkAuthorization(
  lines: string[], filePath: string, issues: CodeIssue[],
  isTSorJS: boolean, isPHP: boolean
): void {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // A1: Object-level authorization — delete/update by ID without auth check
    if (isTSorJS) {
      if (/\.(delete|destroy|remove)\s*\(/.test(line) && /[Bb]y[Ii]d|findOne|find\(/.test(lines.slice(Math.max(0, i - 5), i + 1).join("\n"))) {
        const context = lines.slice(Math.max(0, i - 10), i + 1).join("\n");
        if (!/authorize|permission|can\(|isOwner|belongs|auth|forbidden|unauthorized/i.test(context)) {
          issues.push({
            rule: "A1",
            severity: "High",
            confidence: "Medium",
            type: "Security",
            title: "Possible missing authorization on delete/destroy",
            description: "Resource deleted by ID/reference without visible authorization check nearby",
            line: i + 1,
            whyRisky: "Allows any authenticated user to delete resources they don't own",
            failureScenario: "Attacker deletes other users' resources by guessing IDs",
            fix: "Add authorization check before mutation (e.g., verify ownership or permission)",
            test: "Test that unauthorized user cannot delete another user's resource",
            tldr: "Missing object-level authorization on delete operation"
          });
        }
      }

      // A1: Update by ID without auth
      if (/\.(update|save|patch)\s*\(/.test(line) && /[Bb]y[Ii]d|findOne|find\(|params\.(id|slug)/.test(lines.slice(Math.max(0, i - 5), i + 1).join("\n"))) {
        const context = lines.slice(Math.max(0, i - 10), i + 1).join("\n");
        if (!/authorize|permission|can\(|isOwner|belongs|auth|forbidden|unauthorized|policy/i.test(context)) {
          issues.push({
            rule: "A1",
            severity: "High",
            confidence: "Low",
            type: "Security",
            title: "Possible missing authorization on update",
            description: "Resource updated by ID without visible authorization check",
            line: i + 1,
            whyRisky: "Allows privilege escalation and unauthorized modifications",
            fix: "Add authorization check before mutation",
            test: "Test update with unauthorized user",
            tldr: "Missing object-level authorization on update operation"
          });
        }
      }
    }

    if (isPHP) {
      // A1: PHP delete without authorization
      if (/->delete\(\)|::destroy\(/.test(line)) {
        const context = lines.slice(Math.max(0, i - 10), i + 1).join("\n");
        if (!/authorize|can\(|Gate::|Policy|->authorize|$this->middleware/i.test(context)) {
          issues.push({
            rule: "A1",
            severity: "High",
            confidence: "Medium",
            type: "Security",
            title: "Possible missing authorization on delete",
            description: "PHP model deleted without visible authorization check",
            line: i + 1,
            whyRisky: "Allows unauthorized deletion of resources",
            fix: "Add $this->authorize() or Gate::authorize() before delete",
            test: "Test delete endpoint with unauthorized user returns 403",
            tldr: "Missing object-level authorization on delete"
          });
        }
      }

      // A2: Wrong permission checked
      if (/can\(['"]view/.test(line) || /can\(['"]read/.test(line)) {
        const nearby = lines.slice(i, Math.min(lines.length, i + 5)).join("\n");
        if (/->update|->delete|->approve|->publish|->handoff|->supersede/i.test(nearby)) {
          issues.push({
            rule: "A2",
            severity: "High",
            confidence: "Medium",
            type: "Security",
            title: "Permission check may not match action",
            description: "Checks 'view'/'read' permission but performs a write/privileged action",
            line: i + 1,
            whyRisky: "Users with read-only access can perform write operations",
            failureScenario: "Read-only user modifies data by bypassing permission mismatch",
            fix: "Check the correct permission for the action being performed (e.g., 'update', 'delete', 'approve')",
            test: "Test that user with only view permission cannot perform the write action",
            tldr: "Wrong permission checked for privileged action"
          });
        }
      }
    }

    // A3: Move/copy checks read permission instead of write
    if (/move|copy|transfer/i.test(line) && /accessible|canView|canRead|can\(['"]view/i.test(line)) {
      const nearby = lines.slice(i, Math.min(lines.length, i + 5)).join("\n");
      if (/update|create|insert|save/i.test(nearby)) {
        issues.push({
          rule: "A3",
          severity: "Medium",
          confidence: "Medium",
          type: "Security",
          title: "Move/copy operation checks read access instead of write access on target",
          description: "Resource moved/copied to target, but only checks view/read access instead of create/write",
          line: i + 1,
          whyRisky: "Read-only users can modify resources via move/copy operations",
          fix: "Check write/create permission on the target container",
          test: "Test that read-only user cannot move items to containers they can view but not modify",
          tldr: "Resource scope doesn't match action scope"
        });
      }
    }
  }
}

function checkConcurrency(
  lines: string[], content: string, filePath: string, issues: CodeIssue[],
  isTSorJS: boolean, isPHP: boolean
): void {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // C1: Sequential value generation — max + 1 pattern
    if (/max\s*\(|\.max\(|MAX\(|latest\s*\+\s*1|count\s*\+\s*1|\.length\s*\+\s*1/i.test(line)) {
      const context = lines.slice(Math.max(0, i - 3), Math.min(lines.length, i + 5)).join("\n");
      if (/create|insert|save|new\s+\w+/i.test(context) && !/transaction|lock|FOR UPDATE|atomic|sequence|uuid/i.test(context)) {
        issues.push({
          rule: "C1",
          severity: "High",
          confidence: "High",
          type: "Bug",
          title: "Race condition in sequential value generation",
          description: "Uses max/latest/count + 1 pattern without atomicity guarantee",
          line: i + 1,
          whyRisky: "Concurrent requests generate duplicate values",
          failureScenario: "Two simultaneous requests get the same ID/number, causing constraint violation or data corruption",
          fix: "Use database sequence, UUID, or transaction with row lock (SELECT FOR UPDATE)",
          test: "Create concurrent value generation test",
          tldr: "Sequential value generation is not concurrency-safe"
        });
      }
    }

    // C2: Multi-write without transaction
    if (isTSorJS && /await\s+\w+\.(create|update|save|insert|delete|destroy)\s*\(/.test(line)) {
      const nearbyAfter = lines.slice(i + 1, Math.min(lines.length, i + 10)).join("\n");
      if (/await\s+\w+\.(create|update|save|insert|delete|destroy)\s*\(/.test(nearbyAfter)) {
        const fullContext = lines.slice(Math.max(0, i - 5), Math.min(lines.length, i + 15)).join("\n");
        if (!/transaction|beginTransaction|startTransaction|prisma\.\$transaction|knex\.transaction/i.test(fullContext)) {
          issues.push({
            rule: "C2",
            severity: "Medium",
            confidence: "Medium",
            type: "Logic Error",
            title: "Multi-write operation without transaction",
            description: "Multiple database writes in one operation without transaction boundary",
            line: i + 1,
            whyRisky: "Partial failure leaves database in inconsistent state",
            failureScenario: "First write succeeds, second fails — data is inconsistent",
            fix: "Wrap operations in a database transaction",
            test: "Simulate failure between operations and verify rollback",
            tldr: "Multi-write operation lacks atomicity guarantee"
          });
        }
      }
    }

    if (isPHP) {
      // C2: PHP multi-write without transaction
      if (/->create\(|->save\(|->update\(|->delete\(|::create\(/.test(line)) {
        const nearbyAfter = lines.slice(i + 1, Math.min(lines.length, i + 10)).join("\n");
        if (/->create\(|->save\(|->update\(|->delete\(|::create\(/.test(nearbyAfter)) {
          const fullContext = lines.slice(Math.max(0, i - 5), Math.min(lines.length, i + 15)).join("\n");
          if (!/DB::transaction|DB::beginTransaction|\$this->getConnection\(\)->transaction/i.test(fullContext)) {
            issues.push({
              rule: "C2",
              severity: "Medium",
              confidence: "Medium",
              type: "Logic Error",
              title: "Multi-write operation without transaction",
              description: "Multiple database writes without DB::transaction wrapper",
              line: i + 1,
              whyRisky: "Partial failure leaves inconsistent state",
              fix: "Wrap in DB::transaction(function() { ... })",
              test: "Test that failed second write rolls back the first",
              tldr: "PHP multi-write lacks atomicity"
            });
          }
        }
      }

      // C3: Query-then-act — query outside transaction used inside transaction
      if (/DB::transaction/.test(line) || /->transaction\(/.test(line)) {
        const before = lines.slice(Math.max(0, i - 15), i).join("\n");
        if (/\$\w+\s*=\s*\w+::(?:where|find|get|first|all)\(/.test(before)) {
          const transactionBody = lines.slice(i, Math.min(lines.length, i + 20)).join("\n");
          if (!/FOR UPDATE|lockForUpdate|sharedLock/i.test(transactionBody)) {
            issues.push({
              rule: "C3",
              severity: "Medium",
              confidence: "Medium",
              type: "Bug",
              title: "Query-then-act without locking",
              description: "Data queried outside transaction is used inside transaction — may be stale",
              line: i + 1,
              whyRisky: "Queried data may change between query and transaction execution",
              fix: "Move query inside transaction with lockForUpdate(), or use bulk UPDATE WHERE",
              test: "Test with concurrent modifications between query and transaction",
              tldr: "TOCTOU race — stale data used in transaction"
            });
          }
        }
      }
    }
  }
}

function checkDataIntegrity(
  lines: string[], content: string, filePath: string, issues: CodeIssue[],
  isPHP: boolean
): void {
  if (!isPHP) return;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // D1: Global queries that should be scoped
    if (/::all\(\)|::get\(\)|::where\(/.test(line) && !/workspace|tenant|team|org|company|scope/i.test(line)) {
      // Check if in a controller or service that should be scoped
      if (filePath.includes("Controller") || filePath.includes("Service")) {
        const classContext = lines.slice(0, Math.min(lines.length, 50)).join("\n");
        if (/workspace|tenant|multi/i.test(classContext)) {
          issues.push({
            rule: "D1",
            severity: "High",
            confidence: "Low",
            type: "Security",
            title: "Possible missing tenant/workspace scope on query",
            description: "Query in multi-tenant context may lack workspace scoping",
            line: i + 1,
            whyRisky: "Returns data from all tenants instead of current tenant only",
            fix: "Add workspace/tenant scope to the query",
            test: "Test that query only returns data from the current workspace",
            tldr: "Cross-tenant data exposure risk"
          });
        }
      }
    }
  }
}

function checkPerformance(
  lines: string[], content: string, filePath: string, issues: CodeIssue[],
  isTSorJS: boolean, isPHP: boolean, confidence: ConfidenceLevel
): void {
  // P1: N+1 query patterns
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isTSorJS) {
      // Loop with await query inside
      if (/for\s*\(|\.forEach\(|\.map\(/.test(line)) {
        const loopBody = lines.slice(i, Math.min(lines.length, i + 15)).join("\n");
        if (/await\s+\w+\.(find|get|fetch|query|load)\s*\(/.test(loopBody)) {
          issues.push({
            rule: "P1",
            severity: "Medium",
            confidence: "Medium",
            type: "Performance",
            title: "Potential N+1 query in loop",
            description: "Database/API query inside a loop — runs once per iteration",
            line: i + 1,
            whyRisky: "1000 items = 1001 queries, causing slow response and DB overload",
            fix: "Prefetch all related data before the loop, or use eager loading/joins",
            test: "Monitor query count with multiple items in test",
            tldr: "Loop triggers one query per item"
          });
        }
      }
    }

    if (isPHP) {
      // PHP N+1: accessing relationship in loop without eager loading
      if (/foreach\s*\(|->each\(|->map\(/.test(line)) {
        const loopBody = lines.slice(i, Math.min(lines.length, i + 10)).join("\n");
        if (/\$\w+->\w+(?:->|\()/.test(loopBody) && !/with\(|load\(|eager/i.test(lines.slice(Math.max(0, i - 20), i).join("\n"))) {
          issues.push({
            rule: "P1",
            severity: "Medium",
            confidence: "Low",
            type: "Performance",
            title: "Potential N+1 query in PHP loop",
            description: "Relationship access in loop may trigger lazy loading queries",
            line: i + 1,
            fix: "Add ->with('relationship') or ->load('relationship') before the loop",
            tldr: "Possible N+1 query from lazy-loaded relationship in loop"
          });
        }
      }
    }

    // Sync file ops in async context
    if (isTSorJS && /readFileSync|writeFileSync|appendFileSync|existsSync|mkdirSync/.test(line)) {
      issues.push({
        rule: "P1",
        severity: "Medium",
        confidence: "Medium",
        type: "Performance",
        title: "Synchronous file operation blocks event loop",
        description: `Synchronous file operation found: ${line.trim().substring(0, 80)}`,
        line: i + 1,
        fix: "Use async version (readFile, writeFile, etc.) with await",
        tldr: "Sync file I/O blocks the event loop"
      });
    }
  }
}

function checkCompleteness(
  lines: string[], content: string, filePath: string, issues: CodeIssue[],
  isTSorJS: boolean, isPHP: boolean, confidence: ConfidenceLevel
): void {
  // F1: Event/notification infrastructure exists but dispatch is missing
  if (isPHP) {
    // Check for event classes imported but never dispatched
    const eventImports = content.match(/use\s+App\\Events\\(\w+)/g);
    if (eventImports) {
      for (const imp of eventImports) {
        const eventName = imp.match(/\\(\w+)$/)?.[1];
        if (eventName && !content.includes(`event(new ${eventName}`) && !content.includes(`${eventName}::dispatch`)) {
          issues.push({
            rule: "F1",
            severity: "Medium",
            confidence: "Medium",
            type: "Functional Completeness",
            title: `Event ${eventName} imported but never dispatched`,
            description: `Event class ${eventName} is imported but no dispatch/event() call found in this file`,
            fix: `Add event(new ${eventName}(...)) where the relevant action occurs`,
            test: `Assert ${eventName} is dispatched in the action test`,
            tldr: "Event infrastructure exists but not wired"
          });
        }
      }
    }
  }
}

function checkContracts(
  lines: string[], content: string, filePath: string, issues: CodeIssue[],
  isTSorJS: boolean, isPHP: boolean, confidence: ConfidenceLevel
): void {
  // E1: Hardcoded strings that look like enum values
  if (isTSorJS) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Status comparisons with string literals
      if (/===?\s*['"](?:active|pending|completed|failed|cancelled|draft|published|archived|approved|rejected)['"]/i.test(line)) {
        const enumMatch = line.match(/===?\s*['"](\w+)['"]/);
        if (enumMatch) {
          // Check if the file defines or imports an enum for this
          if (!/enum\s|Status\.|StatusEnum|\.STATUS_/i.test(content)) {
            issues.push({
              rule: "E1",
              severity: "Medium",
              confidence: "Low",
              type: "Logic Error",
              title: "Hardcoded status string comparison",
              description: `Comparing against hardcoded string "${enumMatch[1]}" — may mismatch with backend enum case`,
              line: i + 1,
              fix: "Use an enum constant or shared status type instead of hardcoded string",
              tldr: "Hardcoded string may not match enum/backend value"
            });
          }
        }
      }
    }
  }
}

function checkNavigation(
  lines: string[], content: string, filePath: string, issues: CodeIssue[],
  isTSorJS: boolean, isPHP: boolean
): void {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // N1: Redirect back after delete
    if (isPHP) {
      if (/->delete\(\)|::destroy\(/.test(line)) {
        const after = lines.slice(i, Math.min(lines.length, i + 5)).join("\n");
        if (/redirect\(\)->back\(|return\s+back\(|redirect\(\)\.back/.test(after)) {
          issues.push({
            rule: "N1",
            severity: "Medium",
            confidence: "High",
            type: "Bug",
            title: "Redirect back after delete may 404",
            description: "After deleting a resource, redirecting 'back' may go to the deleted resource's page",
            line: i + 1,
            whyRisky: "If user was on the item's detail page, redirect causes 404",
            failureScenario: "User on /items/123 deletes item, redirect goes back to /items/123 which no longer exists",
            fix: "Redirect to the parent list page instead of back()",
            test: "Test delete from detail page redirects to list page",
            tldr: "Redirect after delete returns to deleted resource URL"
          });
        }
      }
    }

    if (isTSorJS) {
      // N1: history.back() or navigate(-1) after delete
      if (/delete|destroy|remove/i.test(line)) {
        const after = lines.slice(i, Math.min(lines.length, i + 5)).join("\n");
        if (/history\.back|navigate\(-1\)|router\.back|goBack/i.test(after)) {
          issues.push({
            rule: "N1",
            severity: "Medium",
            confidence: "Medium",
            type: "Bug",
            title: "Navigate back after delete may show deleted resource",
            description: "After deleting, navigating back may return to the deleted item's page",
            line: i + 1,
            fix: "Navigate to a safe parent/list page instead of going back",
            tldr: "Back navigation after delete hits deleted page"
          });
        }
      }
    }
  }
}

function checkResourceLifecycle(
  lines: string[], content: string, filePath: string, issues: CodeIssue[],
  isFrontend: boolean, isTSorJS: boolean
): void {
  if (!isTSorJS) return;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // R1: setInterval/setTimeout overwritten without clearing
    if (/(?:Ref\.current|ref\.current)\s*=\s*setInterval\(/.test(line) || /(?:Ref\.current|ref\.current)\s*=\s*setTimeout\(/.test(line)) {
      const before = lines.slice(Math.max(0, i - 5), i).join("\n");
      if (!/clearInterval|clearTimeout/.test(before)) {
        issues.push({
          rule: "R1",
          severity: "Medium",
          confidence: "High",
          type: "Resource Leak",
          title: "Interval/timeout overwritten without clearing previous",
          description: "Ref assigned new interval/timeout without clearing the old one first",
          line: i + 1,
          whyRisky: "Old interval keeps running forever, causing memory leaks and duplicate handlers",
          fix: "Add clearInterval/clearTimeout before assigning new interval",
          test: "Verify only one interval runs after multiple calls",
          tldr: "Resource leak from unclearned interval/timeout"
        });
      }
    }

    // R2: useEffect without cleanup for intervals/subscriptions
    if (/useEffect\s*\(\s*\(\s*\)\s*=>\s*{/.test(line)) {
      // Find the effect body
      let braceCount = 0;
      let effectStart = i;
      let effectEnd = i;
      let foundCleanup = false;
      let hasInterval = false;
      let hasTimeout = false;
      let hasSubscription = false;
      let hasListener = false;

      for (let j = i; j < Math.min(lines.length, i + 50); j++) {
        const effectLine = lines[j];
        braceCount += (effectLine.match(/{/g) || []).length;
        braceCount -= (effectLine.match(/}/g) || []).length;

        if (/setInterval\(/.test(effectLine)) hasInterval = true;
        if (/setTimeout\(/.test(effectLine)) hasTimeout = true;
        if (/subscribe\(|addEventListener\(|\.on\(/.test(effectLine)) hasSubscription = true;
        if (/addEventListener\(/.test(effectLine)) hasListener = true;
        if (/return\s*\(\s*\)\s*=>|return\s*function/.test(effectLine)) foundCleanup = true;

        if (braceCount === 0 && j > i) {
          effectEnd = j;
          break;
        }
      }

      if ((hasInterval || hasTimeout || hasSubscription || hasListener) && !foundCleanup) {
        const resource = hasInterval ? "interval" : hasTimeout ? "timeout" : hasSubscription ? "subscription" : "event listener";
        issues.push({
          rule: "R2",
          severity: "Medium",
          confidence: "High",
          type: "Resource Leak",
          title: `useEffect creates ${resource} without cleanup`,
          description: `useEffect sets up a ${resource} but has no cleanup return function`,
          line: i + 1,
          whyRisky: `${resource} continues running after component unmount, causing memory leaks`,
          fix: `Add cleanup return: return () => { clear${hasInterval ? "Interval" : hasTimeout ? "Timeout" : ""}(...) }`,
          test: "Verify resource is cleaned up on unmount",
          tldr: `Missing cleanup for ${resource} in useEffect`
        });
      }
    }
  }
}

function checkDeadCode(
  lines: string[], content: string, filePath: string, issues: CodeIssue[],
  isTSorJS: boolean, isPHP: boolean, confidence: ConfidenceLevel
): void {
  // U2: Unused imports (TS/JS)
  if (isTSorJS) {
    const importMatches = content.matchAll(/import\s+(?:{([^}]+)}|(\w+))\s+from\s+['"]([^'"]+)['"]/g);
    for (const match of importMatches) {
      const imports = match[1] || match[2];
      if (!imports) continue;

      const names = imports.split(",").map(s => s.trim().split(/\s+as\s+/).pop()!.trim()).filter(Boolean);
      for (const name of names) {
        if (!name || name === "type") continue;
        // Count occurrences (excluding the import line itself)
        const regex = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, "g");
        const occurrences = (content.match(regex) || []).length;
        if (occurrences <= 1) {
          issues.push({
            rule: "U2",
            severity: "Low",
            confidence: "Medium",
            type: "Dead Code",
            title: `Unused import: ${name}`,
            description: `'${name}' is imported but never referenced in the file`,
            fix: `Remove unused import '${name}'`,
            tldr: "Unused import — dead code"
          });
        }
      }
    }
  }

  // U1: Variables assigned but never used (with semantic names)
  if (isPHP) {
    const varAssignments = content.matchAll(/\$(\w+)\s*=\s*.+;/g);
    for (const match of varAssignments) {
      const varName = match[1];
      if (!varName || ["this", "request", "response", "query", "model", "data", "_"].includes(varName)) continue;
      // Only flag semantic names like $count, $filename, $result, $total
      if (!/count|filename|result|total|amount|path|url|name|email|status/i.test(varName)) continue;

      const regex = new RegExp(`\\$${varName}\\b`, "g");
      const occurrences = (content.match(regex) || []).length;
      if (occurrences <= 1) {
        const lineIdx = content.substring(0, match.index).split("\n").length;
        issues.push({
          rule: "U1",
          severity: "Medium",
          confidence: "Medium",
          type: "Dead Code",
          title: `Unused variable with semantic name: $${varName}`,
          description: `$${varName} is assigned a value but never used — may indicate incomplete implementation`,
          line: lineIdx,
          fix: `Either use $${varName} where intended or remove the assignment`,
          tldr: "Variable assigned but never read — possible incomplete implementation"
        });
      }
    }
  }
}

function checkApiState(
  lines: string[], content: string, filePath: string, issues: CodeIssue[],
  isTSorJS: boolean
): void {
  if (!isTSorJS) return;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // L1: Null check used for both success and failure
    if (/===?\s*null|!==?\s*null/.test(line)) {
      const context = lines.slice(Math.max(0, i - 3), Math.min(lines.length, i + 5)).join("\n");
      if (/toast\.success|success.*message|notification.*success/i.test(context) && /fetch|api|poll|current/i.test(context)) {
        issues.push({
          rule: "L1",
          severity: "High",
          confidence: "Medium",
          type: "State Handling",
          title: "Null check may conflate success and failure states",
          description: "Using null to determine completion, but null may mean both success AND failure",
          line: i + 1,
          whyRisky: "Shows success toast even when the operation failed",
          failureScenario: "API returns null for both completed and failed states — user sees 'Success!' on failure",
          fix: "Check actual status field (e.g., status === 'completed') instead of null check",
          test: "Verify error state shows error message, not success",
          tldr: "Success shown for failures — null conflates terminal states"
        });
      }
    }

    // L1: Polling that stops on null without checking final state
    if (/clearInterval|clearTimeout/.test(line) && /null|undefined/.test(lines.slice(Math.max(0, i - 3), i + 1).join("\n"))) {
      const context = lines.slice(Math.max(0, i - 5), Math.min(lines.length, i + 3)).join("\n");
      if (/poll|interval|timer/i.test(context) && !/status|state|error|failed|success/i.test(context)) {
        issues.push({
          rule: "L1",
          severity: "Medium",
          confidence: "Low",
          type: "State Handling",
          title: "Polling stops on null without verifying final state",
          description: "Polling cleared when value becomes null, but null doesn't distinguish success from failure",
          line: i + 1,
          fix: "Check actual completion status before stopping polling",
          tldr: "Polling stops without knowing if operation succeeded or failed"
        });
      }
    }
  }
}

function checkStateSync(
  lines: string[], content: string, filePath: string, issues: CodeIssue[]
): void {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // S1: Partial reload with 'only' that may miss derived state
    if (/only:\s*\[/.test(line) || /reload\(\s*{[^}]*only/.test(line) || /router\.reload\(\s*{[^}]*only/.test(line)) {
      issues.push({
        rule: "S1",
        severity: "Medium",
        confidence: "Low",
        type: "Logic Error",
        title: "Partial reload may miss derived state",
        description: "Using partial/selective reload — ensure all dependent state (counts, aggregates, badges) is included",
        line: i + 1,
        fix: "Include all state derived from the reloaded data in the 'only' list",
        tldr: "Partial reload may leave related UI state stale"
      });
    }

    // S2: Optimistic UI without rollback
    if (/setState|set\w+\(/.test(line)) {
      const after = lines.slice(i + 1, Math.min(lines.length, i + 10)).join("\n");
      if (/fetch\(|axios\.|api\.|\.post\(|\.put\(|\.delete\(/i.test(after)) {
        if (!/catch|\.catch|rollback|revert|previous|old/i.test(after)) {
          issues.push({
            rule: "S2",
            severity: "Medium",
            confidence: "Low",
            type: "Logic Error",
            title: "Possible optimistic update without rollback",
            description: "State updated before API call with no visible error handler to revert on failure",
            line: i + 1,
            fix: "Add error handler that reverts state on API failure",
            tldr: "Optimistic UI may diverge from server state on failure"
          });
        }
      }
    }
  }
}

function checkValueIntegrity(
  lines: string[], content: string, filePath: string, issues: CodeIssue[],
  isPHP: boolean, isTSorJS: boolean
): void {
  if (!isPHP) return;

  // V1: Money/quantity fields assigned in factories or tests
  if (filePath.includes("test") || filePath.includes("Test") || filePath.includes("factory") || filePath.includes("Factory")) {
    const moneyFields = /(?:price|fee|cost|amount|total|balance|rate|charge|deposit)\s*(?:=>|:)\s*(\d+)/gi;
    let match;
    while ((match = moneyFields.exec(content)) !== null) {
      const value = parseInt(match[1]);
      if (value >= 100) {  // Suspicious — might be passing cents when setter expects pounds
        const lineIdx = content.substring(0, match.index).split("\n").length;
        issues.push({
          rule: "V1",
          severity: "High",
          confidence: "Low",
          type: "Value/Unit Mismatch",
          title: "Money field value may be double-converted by model setter",
          description: `Money field assigned value ${value} — verify whether model setter applies transformation (e.g., * 100)`,
          line: lineIdx,
          whyRisky: "If model setter multiplies by 100, the stored value will be 100x too large",
          failureScenario: `Passing ${value} to a setter that multiplies by 100 stores ${value * 100} (wrong amount)`,
          fix: "Trace to the model's setter/cast — pass the value the setter expects (e.g., pounds not pence)",
          test: "Assert the stored value matches the expected minor unit amount",
          tldr: "Money value may be double-converted by setter"
        });
      }
    }
  }
}

function checkPatternConsistency(
  lines: string[], content: string, filePath: string, issues: CodeIssue[],
  confidence: ConfidenceLevel
): void {
  // PC1: Null checks used inconsistently across similar code blocks
  // Look for assertNotNull pattern in test files
  if (filePath.includes("test") || filePath.includes("Test") || filePath.includes("spec")) {
    const nullCheckLines: number[] = [];
    const queryThenAccessLines: number[] = [];

    for (let i = 0; i < lines.length; i++) {
      if (/assertNotNull|expect\(.+\)\.not\.toBeNull|expect\(.+\)\.toBeDefined/.test(lines[i])) {
        nullCheckLines.push(i);
      }
      // Query followed by property access without null check
      if (/->first\(\)|\.findOne\(|\.first\(/.test(lines[i])) {
        const after = lines.slice(i + 1, Math.min(lines.length, i + 3)).join("\n");
        if (/->(?!assertNotNull)\w+|\.(?!toBeNull|toBeDefined)\w+/.test(after) && !/assertNotNull|expect.*not.*toBeNull|expect.*toBeDefined|if\s*\(/.test(after)) {
          queryThenAccessLines.push(i);
        }
      }
    }

    // If some queries have null checks and others don't, flag the inconsistency
    if (nullCheckLines.length > 0 && queryThenAccessLines.length > 0) {
      for (const line of queryThenAccessLines) {
        issues.push({
          rule: "PC1",
          severity: "Medium",
          confidence: "Medium",
          type: "Pattern Inconsistency",
          title: "Inconsistent null check pattern",
          description: "Some query results in this file are null-checked before use, but this one is not",
          line: line + 1,
          fix: "Add null assertion/check consistent with other similar patterns in the file",
          tldr: "Defensive null check applied inconsistently"
        });
      }
    }
  }
}

function checkThirdPartyOverrides(
  lines: string[], filePath: string, issues: CodeIssue[],
  confidence: ConfidenceLevel
): void {
  const thirdPartyModels = [
    { pattern: /use\s+Spatie\\Permission\\Models\\(Role|Permission)/, override: "App\\Models\\$1" },
    { pattern: /use\s+Laravel\\Cashier\\(\w+)/, override: "App\\Models\\$1" },
    { pattern: /use\s+Laravel\\Sanctum\\PersonalAccessToken/, override: "App\\Models\\PersonalAccessToken" },
    { pattern: /use\s+Spatie\\MediaLibrary\\MediaCollections\\Models\\Media/, override: "App\\Models\\Media" },
  ];

  for (let i = 0; i < lines.length; i++) {
    for (const { pattern, override } of thirdPartyModels) {
      if (pattern.test(lines[i])) {
        issues.push({
          rule: "T1",
          severity: "Medium",
          confidence: "Low",
          type: "Wrong Import",
          title: "Third-party model imported directly — check for custom override",
          description: `Importing package model directly. Check if a custom override exists at ${override}`,
          line: i + 1,
          whyRisky: "Custom model may add tenant scoping, relationships, or methods that are bypassed",
          fix: `If ${override} exists, use it instead of the package model`,
          test: "Verify the correct model is used with custom scopes/relationships",
          tldr: "Package model may bypass custom app overrides"
        });
      }
    }
  }
}

function checkSecurity(
  lines: string[], content: string, filePath: string, issues: CodeIssue[],
  isTSorJS: boolean, isPHP: boolean
): void {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Hardcoded secrets
    if (/(?:api[_-]?key|password|secret|token|private[_-]?key)\s*[:=]\s*['"][^'"]{8,}['"]/i.test(line)) {
      // Exclude obvious non-secrets
      if (!/placeholder|example|test|mock|dummy|xxx|changeme|your[_-]?/i.test(line)) {
        issues.push({
          rule: undefined,
          severity: "High",
          confidence: "High",
          type: "Security",
          title: "Potential hardcoded secret",
          description: "Found what appears to be a hardcoded API key, password, or secret",
          line: i + 1,
          whyRisky: "Secrets in source code can be leaked via version control",
          fix: "Use environment variables or a secure configuration management system",
          test: "Add a pre-commit hook to scan for secrets",
          tldr: "Hardcoded credential in source code"
        });
      }
    }

    // eval() usage
    if (/\beval\s*\(/.test(line) && !/\/\//.test(line.substring(0, line.indexOf("eval")))) {
      issues.push({
        rule: undefined,
        severity: "High",
        confidence: "High",
        type: "Security",
        title: "Use of eval() detected",
        description: "eval() can execute arbitrary code and is a security risk",
        line: i + 1,
        whyRisky: "eval() opens the door to code injection attacks",
        failureScenario: "Attacker injects malicious code via user-controlled input passed to eval",
        fix: "Use JSON.parse(), explicit function calls, or a safe alternative",
        test: "Ensure no user input reaches eval",
        tldr: "eval() enables arbitrary code execution"
      });
    }

    // SQL injection
    if (isTSorJS && /query\s*\(\s*['"`].*\$\{|query\s*\(\s*['"`].*\+\s*\w+/.test(line)) {
      issues.push({
        rule: undefined,
        severity: "High",
        confidence: "High",
        type: "Security",
        title: "Potential SQL injection via string concatenation/interpolation",
        description: "SQL query built with string concatenation or template literals",
        line: i + 1,
        whyRisky: "User input in SQL queries enables data theft and manipulation",
        fix: "Use parameterized queries or an ORM",
        test: "Test with SQL injection payloads in input",
        tldr: "SQL injection vulnerability"
      });
    }

    if (isPHP && /DB::raw\s*\(\s*['"].*\$/.test(line)) {
      issues.push({
        rule: undefined,
        severity: "High",
        confidence: "Medium",
        type: "Security",
        title: "Potential SQL injection in DB::raw()",
        description: "PHP variable interpolated inside DB::raw() — may be unsafe",
        line: i + 1,
        whyRisky: "Unescaped user input in raw SQL enables injection attacks",
        fix: "Use query bindings: DB::raw('... ? ...', [$var])",
        test: "Test with SQL injection payloads",
        tldr: "Possible SQL injection in raw query"
      });
    }

    // XSS — dangerouslySetInnerHTML or v-html
    if (/dangerouslySetInnerHTML|v-html/.test(line)) {
      const context = lines.slice(Math.max(0, i - 3), Math.min(lines.length, i + 3)).join("\n");
      if (!/sanitize|DOMPurify|escape|purify/i.test(context)) {
        issues.push({
          rule: undefined,
          severity: "High",
          confidence: "Medium",
          type: "Security",
          title: "Potential XSS via unsanitized HTML injection",
          description: "Using dangerouslySetInnerHTML/v-html without visible sanitization",
          line: i + 1,
          whyRisky: "User-controlled HTML enables script injection",
          fix: "Sanitize HTML with DOMPurify before rendering",
          test: "Test with XSS payloads in the HTML content",
          tldr: "Unsanitized HTML rendering enables XSS"
        });
      }
    }
  }
}

// ─── Confidence Filtering ────────────────────────────────────────────────────

function filterByConfidence(issues: CodeIssue[], level: ConfidenceLevel): CodeIssue[] {
  switch (level) {
    case "high":
      return issues.filter(i => i.confidence === "High");
    case "medium":
      return issues.filter(i => i.confidence === "High" || i.confidence === "Medium");
    case "low":
      return issues; // Return everything
    default:
      return issues;
  }
}

// ─── Report Generation ───────────────────────────────────────────────────────

function generateReport(
  allIssues: Map<string, CodeIssue[]>,
  filesReviewed: number,
  scope: string,
  confidence: string,
  diffContent: string
): string {
  const critical: Array<{ file: string; issue: CodeIssue }> = [];
  const warnings: Array<{ file: string; issue: CodeIssue }> = [];
  const informational: Array<{ file: string; issue: CodeIssue }> = [];

  for (const [file, issues] of allIssues) {
    for (const issue of issues) {
      const entry = { file, issue };
      if (issue.severity === "High") critical.push(entry);
      else if (issue.severity === "Medium") warnings.push(entry);
      else informational.push(entry);
    }
  }

  const totalIssues = critical.length + warnings.length + informational.length;
  const scopeLabel = scope === "changed" ? "Changed files (uncommitted/unpushed)"
    : scope === "specific" ? "Specific files (user-specified)"
    : "Full codebase scan";

  const parts: string[] = [];

  parts.push("# Code Review Report\n");
  parts.push(`**Scope**: ${scopeLabel}`);
  parts.push(`**Confidence level**: ${confidence}`);
  parts.push(`**Files reviewed**: ${filesReviewed}`);
  parts.push(`**Issues found**: ${totalIssues} (Critical: ${critical.length}, Warnings: ${warnings.length}, Informational: ${informational.length})\n`);

  if (totalIssues === 0) {
    parts.push("No issues found at the selected confidence level.\n");
    return parts.join("\n");
  }

  if (critical.length > 0) {
    parts.push("## Critical Issues\n");
    for (const { file, issue } of critical) {
      parts.push(formatIssue(file, issue));
    }
  }

  if (warnings.length > 0) {
    parts.push("## Warnings\n");
    for (const { file, issue } of warnings) {
      parts.push(formatIssue(file, issue));
    }
  }

  if (informational.length > 0) {
    parts.push("## Informational\n");
    for (const { file, issue } of informational) {
      parts.push(formatIssue(file, issue));
    }
  }

  parts.push("---");
  parts.push("Suggested changes written to `.claude/skills/bf-code-review/suggested-changes.md`");

  return parts.join("\n");
}

function formatIssue(file: string, issue: CodeIssue): string {
  const parts: string[] = [];
  const lineRef = issue.line ? (issue.endLine ? `${issue.line}-${issue.endLine}` : `${issue.line}`) : "";

  parts.push(`### [File: ${file}]\n`);
  parts.push(`**Line ${lineRef}**: ${issue.title}${issue.rule ? ` (Rule ${issue.rule})` : ""}`);
  if (issue.rule) parts.push(`- **Rule**: ${issue.rule}`);
  parts.push(`- **Type**: ${issue.type}`);
  parts.push(`- **Severity**: ${issue.severity}`);
  parts.push(`- **Confidence**: ${issue.confidence}`);
  parts.push(`- **Description**: ${issue.description}`);
  if (issue.whyRisky) parts.push(`- **Why risky**: ${issue.whyRisky}`);
  if (issue.failureScenario) parts.push(`- **Failure scenario**: ${issue.failureScenario}`);
  parts.push(`- **Fix**: ${issue.fix}`);
  if (issue.test) parts.push(`- **Test**: ${issue.test}`);
  parts.push(`- **TL;DR**: ${issue.tldr}`);
  parts.push("");

  return parts.join("\n");
}

// ─── Suggested Changes File ─────────────────────────────────────────────────

async function writeSuggestedChanges(
  workingDir: string,
  allIssues: Map<string, CodeIssue[]>,
  scope: string,
  confidence: string
): Promise<void> {
  const outputDir = path.join(workingDir, ".claude", "skills", "bf-code-review");

  try {
    await fs.mkdir(outputDir, { recursive: true });
  } catch { /* already exists */ }

  const critical: Array<{ file: string; issue: CodeIssue }> = [];
  const warnings: Array<{ file: string; issue: CodeIssue }> = [];
  const informational: Array<{ file: string; issue: CodeIssue }> = [];

  for (const [file, issues] of allIssues) {
    for (const issue of issues) {
      const entry = { file, issue };
      if (issue.severity === "High") critical.push(entry);
      else if (issue.severity === "Medium") warnings.push(entry);
      else informational.push(entry);
    }
  }

  const parts: string[] = [];
  parts.push("# Code Review - Suggested Changes\n");
  parts.push(`Generated: ${new Date().toISOString()}`);
  parts.push(`Scope: ${scope}`);
  parts.push(`Confidence: ${confidence}\n`);
  parts.push("## Todo List\n");

  if (critical.length === 0 && warnings.length === 0 && informational.length === 0) {
    parts.push("No issues found.\n");
  }

  if (critical.length > 0) {
    parts.push("### Critical\n");
    for (const { file, issue } of critical) {
      parts.push(formatTodoItem(file, issue));
    }
  }

  if (warnings.length > 0) {
    parts.push("### Warnings\n");
    for (const { file, issue } of warnings) {
      parts.push(formatTodoItem(file, issue));
    }
  }

  if (informational.length > 0) {
    parts.push("### Informational\n");
    for (const { file, issue } of informational) {
      parts.push(formatTodoItem(file, issue));
    }
  }

  await fs.writeFile(path.join(outputDir, "suggested-changes.md"), parts.join("\n"), "utf-8");
}

function formatTodoItem(file: string, issue: CodeIssue): string {
  const lineRef = issue.line ? `:${issue.line}${issue.endLine ? `-${issue.endLine}` : ""}` : "";
  const parts: string[] = [];

  parts.push(`- [ ] **[${file}${lineRef}]** ${issue.title}${issue.rule ? ` (Rule ${issue.rule})` : ""}`);
  if (issue.rule) parts.push(`  - **Rule**: ${issue.rule}`);
  parts.push(`  - **Type**: ${issue.type}`);
  parts.push(`  - **Severity**: ${issue.severity}`);
  parts.push(`  - **Confidence**: ${issue.confidence}`);
  parts.push(`  - **Description**: ${issue.description}`);
  if (issue.whyRisky) parts.push(`  - **Why risky**: ${issue.whyRisky}`);
  if (issue.failureScenario) parts.push(`  - **Failure scenario**: ${issue.failureScenario}`);
  parts.push(`  - **Fix**: ${issue.fix}`);
  if (issue.test) parts.push(`  - **Test**: ${issue.test}`);
  parts.push(`  - **TL;DR**: ${issue.tldr}`);
  parts.push("");

  return parts.join("\n");
}
