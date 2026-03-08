import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { codeReviewTool } from "./code-review";

/**
 * Custom MCP Server with all project-specific tools
 */
export const customToolsServer = createSdkMcpServer({
  name: "conntext-custom-tools",
  tools: [
    codeReviewTool,
    // Add more custom tools here as you build them
  ]
});

// Export individual tools for direct use if needed
export { codeReviewTool };
