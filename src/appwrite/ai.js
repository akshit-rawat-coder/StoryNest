import { Client, Functions } from "appwrite";
import conf from "../conf/conf";

const FUNCTION_ID = "6a89cfbb000658325527";
// Maximum input text length (characters) to avoid payload/timeout issues.
// ~100k chars ≈ ~25k tokens, well within Gemini 1.5 Flash's 1M token limit.
const MAX_INPUT_LENGTH = 100000;

class AiService {
  constructor() {
    this.client = new Client();
    this.client.setEndpoint(conf.appwriteUrl).setProject(conf.appwriteProjectId);
    this.functions = new Functions(this.client);
  }

  /**
   * Strip HTML tags from TinyMCE content to get plain text for AI processing.
   * The AI function returns plain text, which we set back via setValue().
   */
  stripHtml(html) {
    if (!html) return "";
    return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }

  /**
   * Validate input length and throw a user-friendly error if too large.
   */
  validateInputLength(text, action) {
    if (text.length > MAX_INPUT_LENGTH) {
      const error = new Error(
        `Content is too long for ${action} (${text.length} characters). ` +
        `Maximum supported length is ${MAX_INPUT_LENGTH.toLocaleString()} characters. ` +
        `Please split your content into smaller sections.`
      );
      error.code = "INPUT_TOO_LARGE";
      error.inputLength = text.length;
      error.maxLength = MAX_INPUT_LENGTH;
      throw error;
    }
  }

  async callAiFunction(text, action) {
    try {
      const payload = { text, action };
      const bodyJson = JSON.stringify(payload);
      console.log(`AiService :: ${action} :: input length: ${text.length} chars, payload size: ${bodyJson.length} chars`);

      // Use object-style params (recommended in Appwrite SDK v26+)
      const execution = await this.functions.createExecution({
        functionId: FUNCTION_ID,
        body: bodyJson,
        async: false,
        xpath: "/",
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      console.log(`AiService :: ${action} :: execution status: ${execution.status}, statusCode: ${execution.statusCode}, responseBody length: ${(execution.responseBody || "").length}`);

      if (execution.status === "failed" || (execution.statusCode && execution.statusCode >= 400)) {
        // Log detailed diagnostic info (NOT the content or API keys)
        // Print FULL responseBody to diagnose the actual backend error
        const fullResponseBody = execution.responseBody || "";
        const fullStderr = execution.stderr || "";
        console.error(`AiService :: ${action} :: FAILED`, {
          status: execution.status,
          statusCode: execution.statusCode,
          responseBody: fullResponseBody,
          stderr: fullStderr,
          duration: execution.duration,
          responseHeaders: execution.responseHeaders,
          errors: execution.errors,
        });
        // Also log as string for visibility in copied console output
        console.error(`AiService :: ${action} :: FAILED responseBody:`, fullResponseBody);
        console.error(`AiService :: ${action} :: FAILED stderr:`, fullStderr);

        // Check for quota/rate limit error in the responseBody even when execution failed
        if (fullResponseBody) {
          try {
            const response = JSON.parse(fullResponseBody);
            if (response?.message) {
              const geminiError = JSON.parse(response.message);
              if (geminiError?.error?.code === 429 || geminiError?.error?.status === "RESOURCE_EXHAUSTED") {
                const retryDelay = geminiError?.error?.details?.find(d => d["@type"]?.includes("RetryInfo"))?.retryDelay || "a while";
                throw new Error(`AI quota exceeded. Please try again in ${retryDelay}. (Free tier limit: 20 requests/day)`);
              }
            }
          } catch (e) {
            // If parsing fails, fall through to generic error
          }
        }
        throw new Error("AI function execution failed.");
      }

      const bodyStr = execution.responseBody || "";
      if (!bodyStr) {
        throw new Error("Empty response from AI assistant.");
      }

      const response = JSON.parse(bodyStr);
      if (response && response.success && response.result) {
        return response.result;
      } else {
        // Check for quota/rate limit error in the response
        const errorMessage = response?.error || "AI action returned no result.";
        if (response?.message) {
          try {
            const geminiError = JSON.parse(response.message);
            if (geminiError?.error?.code === 429 || geminiError?.error?.status === "RESOURCE_EXHAUSTED") {
              const retryDelay = geminiError?.error?.details?.find(d => d["@type"]?.includes("RetryInfo"))?.retryDelay || "a while";
              throw new Error(`AI quota exceeded. Please try again in ${retryDelay}. (Free tier limit: 20 requests/day)`);
            }
          } catch (e) {
            // If parsing fails, fall through to generic error
          }
        }
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error(`AiService :: callAiFunction :: error (${action}) :: input length: ${text.length}`, error);
      throw error;
    }
  }

  /**
   * Improve writing quality. Sends HTML content stripped to plain text.
   * Returns plain text (the caller is responsible for setting it back into the editor).
   */
  async improveText(htmlContent) {
    const plainText = this.stripHtml(htmlContent);
    this.validateInputLength(plainText, "improve");
    return this.callAiFunction(plainText, "improve");
  }

  /**
   * Generate a 2-3 sentence summary of the blog content.
   */
  async summarizeText(htmlContent) {
    const plainText = this.stripHtml(htmlContent);
    this.validateInputLength(plainText, "summarize");
    return this.callAiFunction(plainText, "summarize");
  }

  /**
   * Generate 5 title suggestions for the blog content.
   * Returns an array of title strings with numbering stripped.
   */
  async generateTitles(htmlContent) {
    const plainText = this.stripHtml(htmlContent);
    this.validateInputLength(plainText, "title");
    const result = await this.callAiFunction(plainText, "title");
    if (!result) return [];

    return result
      .split("\n")
      .map((line) => line.replace(/^\d+[\.\)\-]\s*/, "").trim())
      .filter(Boolean);
  }
}

const aiService = new AiService();
export default aiService;
