# Custom Tools for ConnText Build

This directory contains custom MCP tools for the ConnText Build Agent SDK.

## Available Tools

### 1. Code Review Tool (`code_review`)

Performs comprehensive code analysis including:
- **Security**: Detects hardcoded secrets, eval() usage, security vulnerabilities
- **Performance**: Identifies blocking operations, inefficient patterns
- **Best Practices**: Checks for proper logging, TODO comments, code organization
- **Maintainability**: Detects `any` types, missing error handling
- **Bugs**: Finds common error patterns

#### Usage

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";
import { customToolsServer } from "./tools";

for await (const message of query({
  prompt: "Review BuildScreen.tsx for security and performance issues",
  options: {
    mcpServers: { customTools: customToolsServer },
    allowedTools: ["code_review", "Read", "Glob"]
  }
})) {
  if ("result" in message) console.log(message.result);
}
```

#### Parameters

- `files` (required): Array of file paths to review
- `focusAreas` (optional): Array of focus areas
  - `"security"` - Security vulnerabilities
  - `"performance"` - Performance issues
  - `"maintainability"` - Code maintainability
  - `"best-practices"` - Best practices
  - `"bugs"` - Common bugs
  - `"all"` - All areas (default)

#### Example Prompts

**Basic Review:**
```
"Use code_review to analyze src/renderer/src/screens/BuildScreen.tsx"
```

**Focused Review:**
```
"Review all TypeScript files in src/main/ focusing on security and performance"
```

**Project-Wide Review:**
```
"Find all .tsx files and review them for best practices and maintainability"
```

## Adding New Custom Tools

1. Create a new file in `src/main/tools/` (e.g., `my-tool.ts`)
2. Define your tool using the `tool()` function:

```typescript
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

export const myTool = tool(
  "my_tool_name",
  "Description of what the tool does",
  {
    // Define parameters with Zod schemas
    param1: z.string().describe("Description of param1"),
    param2: z.number().optional().describe("Optional parameter"),
  },
  async (args, context) => {
    // Your tool implementation
    const { param1, param2 } = args;

    // Do something...

    return {
      content: [
        { type: "text", text: "Result of the tool" }
      ]
    };
  }
);
```

3. Add your tool to `src/main/tools/index.ts`:

```typescript
import { myTool } from "./my-tool";

export const customToolsServer = createSdkMcpServer({
  name: "conntext-custom-tools",
  tools: [
    codeReviewTool,
    myTool,  // Add your new tool here
  ]
});
```

4. Use it in your queries:

```typescript
for await (const message of query({
  prompt: "Use my_tool_name to do something",
  options: {
    mcpServers: { customTools: customToolsServer },
    allowedTools: ["my_tool_name"]
  }
})) {
  if ("result" in message) console.log(message.result);
}
```

## Tool Design Best Practices

1. **Clear Names**: Use descriptive snake_case names (e.g., `code_review`, `fetch_user_data`)
2. **Good Descriptions**: Write clear descriptions so the agent knows when to use the tool
3. **Zod Schemas**: Use detailed `.describe()` for each parameter
4. **Error Handling**: Always wrap tool logic in try-catch and return informative errors
5. **Type Safety**: Use TypeScript types for inputs and outputs
6. **Documentation**: Add examples in your tool description or this README

## Integration with Electron App

To use these tools in your Electron app's agent service:

```typescript
// In src/main/agent-service.ts
import { query } from "@anthropic-ai/claude-agent-sdk";
import { customToolsServer } from "./tools";

// When handling agent requests
for await (const message of query({
  prompt: userMessage,
  options: {
    cwd: workingDirectory,
    mcpServers: {
      customTools: customToolsServer  // Add your custom tools
    },
    allowedTools: [
      "Read", "Write", "Edit", "Bash", "Glob", "Grep",
      "code_review",  // Your custom tool
      // Add more as you build them
    ]
  }
})) {
  // Handle messages...
}
```

## Running Examples

```bash
# Run the example usage file
npm run dev

# Or with ts-node
ts-node src/main/tools/example-usage.ts
```

## Future Tool Ideas

Consider building these tools next:

- **Project Analyzer**: Analyze project structure and dependencies
- **Documentation Generator**: Generate documentation from code
- **Test Coverage Reporter**: Analyze test coverage
- **Dependency Checker**: Check for outdated or vulnerable dependencies
- **Performance Profiler**: Profile code performance
- **Database Query Tool**: Execute and analyze database queries
- **API Tester**: Test API endpoints
- **Deployment Helper**: Assist with deployment tasks

## Notes

- All tools are in-process MCP tools (run in the same process as your app)
- Tools have full access to the file system within the working directory
- The agent will automatically choose which tool to use based on the prompt
- You can combine custom tools with built-in Agent SDK tools
