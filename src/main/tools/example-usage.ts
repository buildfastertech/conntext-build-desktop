import { query } from "@anthropic-ai/claude-agent-sdk";
import { customToolsServer } from "./index";

/**
 * Example: Using the custom code review tool
 *
 * This demonstrates how to integrate your custom tools with the Agent SDK
 */
async function runCodeReview() {
  console.log("Starting code review with custom tool...\n");

  for await (const message of query({
    prompt: "Review the BuildScreen.tsx file for security issues and best practices",
    options: {
      cwd: process.cwd(),
      // Add your custom MCP server alongside built-in tools
      mcpServers: {
        customTools: customToolsServer
      },
      // Allow the agent to use your custom tool plus built-in tools
      allowedTools: [
        "code_review",  // Your custom tool
        "Read",         // Built-in tools
        "Glob",
        "Grep"
      ]
    }
  })) {
    if ("result" in message) {
      console.log(message.result);
    } else if (message.type === "system" && message.subtype === "init") {
      console.log(`Session ID: ${message.session_id}`);
    }
  }
}

/**
 * Example: Direct file review
 */
async function reviewSpecificFiles() {
  console.log("Reviewing specific files...\n");

  for await (const message of query({
    prompt: "Use the code_review tool to review these files: src/renderer/src/screens/BuildScreen.tsx and src/main/agent-service.ts. Focus on security and performance.",
    options: {
      cwd: process.cwd(),
      mcpServers: {
        customTools: customToolsServer
      },
      allowedTools: ["code_review", "Read"]
    }
  })) {
    if ("result" in message) {
      console.log(message.result);
    }
  }
}

/**
 * Example: Comprehensive project review
 */
async function reviewEntireProject() {
  console.log("Starting comprehensive project review...\n");

  for await (const message of query({
    prompt: `Perform a comprehensive code review of the entire TypeScript codebase.
    Use Glob to find all .ts and .tsx files, then use code_review to analyze them.
    Focus on security, performance, and maintainability issues.`,
    options: {
      cwd: process.cwd(),
      mcpServers: {
        customTools: customToolsServer
      },
      allowedTools: ["code_review", "Read", "Glob", "Grep"],
      maxTurns: 20  // Allow multiple iterations for large reviews
    }
  })) {
    if ("result" in message) {
      console.log(message.result);
    }
  }
}

// Export examples
export { runCodeReview, reviewSpecificFiles, reviewEntireProject };

// Run example if executed directly
if (require.main === module) {
  runCodeReview().catch(console.error);
}
