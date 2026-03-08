# 🎉 Your First Custom Tool: Code Review

Congratulations! You now have a fully functional custom tool that can be used with your Agent SDK.

## What You Got

### 1. **Code Review Tool** (`code_review`)
Located in: `src/main/tools/code-review.ts`

A comprehensive code analysis tool that checks for:
- 🔒 **Security**: Hardcoded secrets, eval() usage, vulnerabilities
- ⚡ **Performance**: Blocking operations, inefficient patterns
- 🛠️ **Maintainability**: Type safety, error handling
- ✅ **Best Practices**: Logging, TODOs, code organization
- 🐛 **Common Bugs**: Error patterns, async/await issues

### 2. **Custom Tools Server**
Located in: `src/main/tools/index.ts`

Your centralized MCP server that hosts all custom tools.

### 3. **Integration with Agent Service**
Your `agent-service.ts` is now configured to use custom tools automatically!

### 4. **Examples & Documentation**
- `src/main/tools/example-usage.ts` - Usage examples
- `src/main/tools/README.md` - Comprehensive guide
- `test-code-review.ts` - Quick test script

## How to Use It

### Option 1: Use in Your Electron App (Automatic)

Your custom tools are already integrated! Just chat with your agent:

```
"Review BuildScreen.tsx for security issues"
"Check all TypeScript files for performance problems"
"Analyze the codebase for best practices violations"
```

The agent will automatically use the `code_review` tool when appropriate.

### Option 2: Direct Testing

Run the test script to see it in action:

```bash
npx ts-node test-code-review.ts
```

### Option 3: Programmatic Usage

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";
import { customToolsServer } from "./src/main/tools";

for await (const message of query({
  prompt: "Review src/main/agent-service.ts for security",
  options: {
    cwd: process.cwd(),
    mcpServers: { customTools: customToolsServer },
    allowedTools: ["code_review", "Read", "Glob"]
  }
})) {
  if ("result" in message) console.log(message.result);
}
```

## Understanding the "Slash Command" Concept

You asked about `/code-review` as a slash command. Here's how it works:

**In my environment** (where you're using me right now):
- `/code-review` would be a skill that I can invoke
- Skills are part of the CLI environment

**In your Agent SDK app**:
- Custom tools work differently - they're MCP tools
- The agent decides when to use them based on your natural language prompt
- Instead of typing `/code-review file.ts`, you say: "Review file.ts"
- The agent understands the intent and calls the `code_review` tool

### Making It More "Slash Command" Like

If you want explicit slash command syntax in your app, you could:

1. **Parse slash commands in your UI** and map them to tool calls:
```typescript
// In BuildScreen.tsx handleSend()
if (input.startsWith('/code-review ')) {
  const file = input.replace('/code-review ', '').trim();
  return handleCodeReview(file);
}
```

2. **Or use the agent naturally** - it's smarter and more flexible:
```typescript
// Just describe what you want:
"Review this file for bugs"
"Check security in all TypeScript files"
"Analyze performance issues"
```

The agent will automatically choose the right tool!

## Example Prompts That Will Use Your Tool

These prompts will automatically trigger the `code_review` tool:

- ✅ "Review BuildScreen.tsx for security vulnerabilities"
- ✅ "Check all TypeScript files for performance issues"
- ✅ "Analyze the codebase for best practices"
- ✅ "Find security problems in src/main/"
- ✅ "Review my recent changes for bugs"
- ✅ "Check if there are any hardcoded secrets"

## Next Steps: Building More Tools

Now that you have one working tool, you can easily add more:

### Suggested Tools to Build Next:

1. **Documentation Generator**
   ```typescript
   tool("generate_docs", "Generate documentation from code", {...}, async (args) => {
     // Read code files, extract comments, generate docs
   });
   ```

2. **Test Coverage Analyzer**
   ```typescript
   tool("analyze_coverage", "Analyze test coverage", {...}, async (args) => {
     // Run coverage tool, parse results, report gaps
   });
   ```

3. **Dependency Checker**
   ```typescript
   tool("check_deps", "Check for outdated dependencies", {...}, async (args) => {
     // Check package.json, compare with npm registry
   });
   ```

4. **Git Helper**
   ```typescript
   tool("git_summary", "Summarize git changes", {...}, async (args) => {
     // Run git diff, git log, format output
   });
   ```

5. **Database Query Tool**
   ```typescript
   tool("query_db", "Execute database queries", {...}, async (args) => {
     // Connect to DB, run query, return results
   });
   ```

## Architecture Overview

```
Your Electron App
├── BuildScreen (UI)
│   └── User types: "Review this file"
│
├── Agent Service
│   └── Sends to Agent SDK with custom tools
│
├── Agent SDK (Claude)
│   ├── Understands intent
│   ├── Decides to use code_review tool
│   └── Calls your tool function
│
└── Custom Tools (src/main/tools/)
    ├── code_review.ts
    │   └── Analyzes code, returns report
    └── index.ts (MCP Server)
        └── Exposes tools to Agent SDK
```

## Key Concepts

1. **MCP (Model Context Protocol)**: Standard for extending Claude with custom tools
2. **In-Process Tools**: Run in your app's process (fast, easy)
3. **Tool Function**: Your implementation (what the tool does)
4. **Tool Schema**: Zod schema defining parameters
5. **Natural Language**: Agent chooses tools based on intent, not commands

## Troubleshooting

### Tool Not Being Called?
- Check that `code_review` is in `allowedTools` array
- Verify `customToolsServer` is in `mcpServers` config
- Make your prompt more explicit: "Use code_review tool to..."

### Import Errors?
```bash
npm install @anthropic-ai/claude-agent-sdk zod
```

### Want to See Tool Calls?
Add logging in your tool:
```typescript
async (args) => {
  console.log('[code_review] Called with:', args);
  // ... rest of implementation
}
```

## Resources

- 📖 Full documentation: `src/main/tools/README.md`
- 💡 Examples: `src/main/tools/example-usage.ts`
- 🧪 Test it: `npx ts-node test-code-review.ts`
- 📘 Agent SDK Docs: https://github.com/anthropics/claude-agent-sdk-typescript

## Questions?

Common questions:

**Q: Can I call tools directly from my UI?**
A: Yes! Import the tool function and call it. But using the agent is more flexible.

**Q: Can tools call other tools?**
A: Not directly. The agent orchestrates tool calls.

**Q: Can I use external APIs in tools?**
A: Absolutely! Your tools can do anything Node.js can do.

**Q: How do I debug tool execution?**
A: Add `console.log()` statements in your tool function.

**Q: Can I make tools that modify files?**
A: Yes, but be careful with permissions. Use the built-in Edit/Write tools or implement safely.

---

**You're all set!** 🚀 Start building more tools and make your agent even more powerful!
