/**
 * Quick test script for the code_review tool
 *
 * Run with: npx ts-node test-code-review.ts
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { customToolsServer } from "./src/main/tools";

async function testCodeReview() {
  console.log("🔍 Testing Code Review Tool\n");
  console.log("=" .repeat(60));
  console.log("\n");

  try {
    // Test 1: Review a specific file
    console.log("📝 Test 1: Reviewing BuildScreen.tsx for all issues\n");

    for await (const message of query({
      prompt: `Use the code_review tool to analyze src/renderer/src/screens/BuildScreen.tsx.
      Look for security issues, performance problems, and best practices violations.`,
      options: {
        cwd: process.cwd(),
        mcpServers: {
          customTools: customToolsServer
        },
        allowedTools: ["code_review", "Read", "Glob"],
        maxTurns: 5
      }
    })) {
      if ("result" in message) {
        console.log("\n✅ Review Complete!\n");
        console.log(message.result);
      } else if (message.type === "system" && message.subtype === "init") {
        console.log(`Session started: ${message.session_id}\n`);
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("\n");

    // Test 2: Natural language request
    console.log("📝 Test 2: Natural language code review request\n");

    for await (const message of query({
      prompt: "Review the agent-service.ts file in src/main/ and tell me if there are any security or performance issues",
      options: {
        cwd: process.cwd(),
        mcpServers: {
          customTools: customToolsServer
        },
        allowedTools: ["code_review", "Read", "Glob"],
        maxTurns: 5
      }
    })) {
      if ("result" in message) {
        console.log("\n✅ Review Complete!\n");
        console.log(message.result);
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("\n");

    // Test 3: Project-wide security scan
    console.log("📝 Test 3: Security-focused scan of all TypeScript files\n");

    for await (const message of query({
      prompt: `Find all TypeScript files (.ts and .tsx) in the src/ directory and review them
      using the code_review tool with focus on security issues only.`,
      options: {
        cwd: process.cwd(),
        mcpServers: {
          customTools: customToolsServer
        },
        allowedTools: ["code_review", "Read", "Glob", "Grep"],
        maxTurns: 10
      }
    })) {
      if ("result" in message) {
        console.log("\n✅ Security Scan Complete!\n");
        console.log(message.result);
      }
    }

    console.log("\n🎉 All tests completed successfully!\n");

  } catch (error) {
    console.error("\n❌ Error during testing:", error);
    process.exit(1);
  }
}

// Run the tests
testCodeReview();
