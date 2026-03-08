import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { codeReviewTool } from "./code-review";
import { askUserTool } from "./ask-user";

/**
 * Custom MCP Server with all project-specific tools
 */
export const customToolsServer = createSdkMcpServer({
  name: "conntext-custom-tools",
  tools: [
    codeReviewTool,
    askUserTool,
  ]
});

// Export individual tools for direct use if needed
export { codeReviewTool };
export { askUserTool };
