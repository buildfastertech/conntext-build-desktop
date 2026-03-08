import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

// ─── Pending Question Registry ──────────────────────────────────────────────
// When the agent calls ask_user, we store a pending Promise here.
// The main process resolves it when the renderer sends back user selections.

interface PendingQuestion {
  resolve: (response: string) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

const pendingQuestions = new Map<string, PendingQuestion>();

// Timeout for unanswered questions (5 minutes)
const QUESTION_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Register a pending question and return a Promise that resolves
 * when the user responds via the renderer UI.
 */
function waitForUserResponse(questionId: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    pendingQuestions.set(questionId, {
      resolve,
      reject,
      timestamp: Date.now(),
    });

    // Auto-reject after timeout
    setTimeout(() => {
      if (pendingQuestions.has(questionId)) {
        pendingQuestions.delete(questionId);
        reject(new Error("Question timed out — user did not respond within 5 minutes."));
      }
    }, QUESTION_TIMEOUT_MS);
  });
}

/**
 * Called by the main process IPC handler when the renderer
 * sends back the user's selections.
 */
export function resolveUserQuestion(questionId: string, response: string): boolean {
  console.log(`[ask_user] resolveUserQuestion called | questionId: ${questionId} | pending count: ${pendingQuestions.size}`);
  console.log(`[ask_user] pending question IDs:`, [...pendingQuestions.keys()]);
  const pending = pendingQuestions.get(questionId);
  if (!pending) {
    console.error(`[ask_user] Question NOT found in pending map!`);
    return false;
  }

  console.log(`[ask_user] Resolving question ${questionId} with response length: ${response.length}`);
  pending.resolve(response);
  pendingQuestions.delete(questionId);
  return true;
}

/**
 * Check if there's a pending question waiting for a response.
 */
export function hasPendingQuestion(questionId: string): boolean {
  return pendingQuestions.has(questionId);
}

// ─── Notification callback ──────────────────────────────────────────────────
// The MCP tool needs to notify the renderer that a question is pending.
// This callback is set by the agent service when it starts processing.

type QuestionNotifier = (questionData: {
  questionId: string;
  questions: Array<{
    question: string;
    options?: Array<{ label: string; description?: string }>;
    multiSelect?: boolean;
    freeText?: boolean;
  }>;
}) => void;

let activeNotifier: QuestionNotifier | null = null;

export function setQuestionNotifier(notifier: QuestionNotifier | null): void {
  activeNotifier = notifier;
}

// ─── Tool Definition ────────────────────────────────────────────────────────

export const askUserTool = tool(
  "ask_user",
  `Ask the user one or more questions via an interactive UI dialog. This tool BLOCKS until the user responds.

IMPORTANT: This tool collects user input and returns their answers. When this tool returns successfully, the return value IS the user's final answer. Do NOT call this tool again with the same questions — the user has already answered. Proceed with the task using the returned answers.

The return value is a JSON object with the user's selections. Parse it and use the answers directly.`,
  {
    questions: z.array(z.object({
      question: z.string().describe("The question text to display to the user"),
      options: z.array(z.object({
        label: z.string().describe("Short label for this option"),
        description: z.string().optional().describe("Longer description explaining this option"),
      })).optional().describe("Predefined options for the user to choose from. Omit for free-text input."),
      multiSelect: z.boolean().optional().default(false).describe("Allow selecting multiple options (checkbox style). Defaults to single-select (radio style)."),
      freeText: z.boolean().optional().default(false).describe("Allow free-text input in addition to or instead of options."),
    })).min(1).max(6).describe("Array of questions to ask the user (1-6 questions)"),
  },
  async ({ questions }) => {
    const questionId = `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    console.log(`[ask_user] Tool invoked | questionId: ${questionId} | questions: ${questions.length}`);
    console.log(`[ask_user] Pending questions BEFORE adding: ${pendingQuestions.size}`);

    // Notify the renderer to show the question UI
    if (activeNotifier) {
      activeNotifier({
        questionId,
        questions,
      });
    } else {
      console.error(`[ask_user] No notifier — UI not connected`);
      return {
        content: [{ type: "text" as const, text: "Error: Question UI not available." }],
        isError: true,
      };
    }

    try {
      console.log(`[ask_user] Waiting for user response... | pendingQuestions size: ${pendingQuestions.size}`);
      const response = await waitForUserResponse(questionId);
      console.log(`[ask_user] Got response! Length: ${response.length}`);
      // Return proper MCP CallToolResult format
      return {
        content: [{ type: "text" as const, text: response }],
        isError: false,
      };
    } catch (error) {
      console.error(`[ask_user] Error:`, error);
      return {
        content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : "Failed to get user response."}` }],
        isError: true,
      };
    }
  }
);
