/**
 * Identity Guard Tests
 * Verifies that MALIK AI identity responses are consistent and truthful
 */

import {
  detectIdentityQuestion,
  identityAnswerFor,
  sanitizeModelAnswer,
  MALIK_AI_VERSION,
  MALIK_STRICT_SYSTEM_PROMPT,
} from "./identity"

describe("Identity Guard", () => {
  describe("detectIdentityQuestion", () => {
    it("should detect 'Кто ты?' (Who are you?)", () => {
      expect(detectIdentityQuestion("Кто ты?")).toBe(true)
      expect(detectIdentityQuestion("кто ты")).toBe(true)
    })

    it("should detect 'Who are you?'", () => {
      expect(detectIdentityQuestion("Who are you?")).toBe(true)
      expect(detectIdentityQuestion("who are you")).toBe(true)
    })

    it("should detect 'Кто тебя создал?' (Who created you?)", () => {
      expect(detectIdentityQuestion("Кто тебя создал?")).toBe(true)
      expect(detectIdentityQuestion("Кто тебя разработал?")).toBe(true)
    })

    it("should detect 'Who created you?'", () => {
      expect(detectIdentityQuestion("Who created you?")).toBe(true)
      expect(detectIdentityQuestion("Who made you?")).toBe(true)
    })

    it("should detect 'Ты Meta?' (Are you Meta?)", () => {
      expect(detectIdentityQuestion("Ты Meta?")).toBe(true)
      expect(detectIdentityQuestion("Are you Meta?")).toBe(true)
    })

    it("should detect 'Ты ChatGPT?' (Are you ChatGPT?)", () => {
      expect(detectIdentityQuestion("Ты ChatGPT?")).toBe(true)
      expect(detectIdentityQuestion("Are you ChatGPT?")).toBe(true)
    })

    it("should detect 'Какая у тебя версия?' (What is your version?)", () => {
      expect(detectIdentityQuestion("Какая у тебя версия?")).toBe(true)
      expect(detectIdentityQuestion("What is your version?")).toBe(true)
    })

    it("should NOT detect questions about ChatGPT (bypass patterns)", () => {
      expect(detectIdentityQuestion("Что такое ChatGPT?")).toBe(false)
      expect(detectIdentityQuestion("What is ChatGPT?")).toBe(false)
      expect(detectIdentityQuestion("Tell me about ChatGPT")).toBe(false)
    })

    it("should NOT detect questions about OpenAI", () => {
      expect(detectIdentityQuestion("Что такое OpenAI?")).toBe(false)
      expect(detectIdentityQuestion("What is OpenAI?")).toBe(false)
    })
  })

  describe("identityAnswerFor", () => {
    it("should return null for non-identity questions", () => {
      expect(identityAnswerFor("What is 2+2?")).toBeNull()
      expect(identityAnswerFor("How do I write a function?")).toBeNull()
    })

    it("should return answer containing 'MALIK AI' for 'Who are you?'", () => {
      const answer = identityAnswerFor("Who are you?")
      expect(answer).not.toBeNull()
      expect(answer!.toLowerCase()).toContain("malik ai")
    })

    it("should return answer containing creator name for 'Who created you?'", () => {
      const answer = identityAnswerFor("Who created you?")
      expect(answer).not.toBeNull()
      expect(answer!.toLowerCase()).toContain("abdumalik amangeldi")
      expect(answer!).toContain("Абдумалик")
    })

    it("should start with 'No. I am MALIK AI' for 'Are you ChatGPT?'", () => {
      const answer = identityAnswerFor("Are you ChatGPT?")
      expect(answer).not.toBeNull()
      expect(answer!).toMatch(/^No\. I am MALIK AI/i)
    })

    it("should start with 'No. I am MALIK AI' for 'Are you Meta?'", () => {
      const answer = identityAnswerFor("Are you Meta?")
      expect(answer).not.toBeNull()
      expect(answer!).toMatch(/^No\. I am MALIK AI/i)
    })

    it("should start with 'No. I am MALIK AI' for 'Are you Llama?'", () => {
      const answer = identityAnswerFor("Are you Llama?")
      expect(answer).not.toBeNull()
      expect(answer!).toMatch(/^No\. I am MALIK AI/i)
    })

    it("should start with 'No. I am MALIK AI' for 'Are you OpenAI?'", () => {
      const answer = identityAnswerFor("Are you OpenAI?")
      expect(answer).not.toBeNull()
      expect(answer!).toMatch(/^No\. I am MALIK AI/i)
    })

    it("should contain version for 'What is your version?'", () => {
      const answer = identityAnswerFor("What is your version?")
      expect(answer).not.toBeNull()
      expect(answer!).toContain("MALIK AI TITAN / V6.5")
    })

    it("should return null for 'What is ChatGPT?'", () => {
      expect(identityAnswerFor("What is ChatGPT?")).toBeNull()
    })

    it("should return null for 'Who is ChatGPT?'", () => {
      expect(identityAnswerFor("Who is ChatGPT?")).toBeNull()
    })
  })

  describe("sanitizeModelAnswer", () => {
    it("should replace 'I am ChatGPT' with MALIK AI identity", () => {
      const input = "I am ChatGPT, created by OpenAI."
      const output = sanitizeModelAnswer(input)
      expect(output).toContain("MALIK AI")
      expect(output).not.toContain("ChatGPT, created by OpenAI")
    })

    it("should replace 'I'm Llama' with MALIK AI identity", () => {
      const input = "I'm Llama, made by Meta."
      const output = sanitizeModelAnswer(input)
      expect(output).toContain("MALIK AI")
    })

    it("should not break correct information about ChatGPT", () => {
      const input = "ChatGPT is an AI assistant created by OpenAI. I'm MALIK AI."
      const output = sanitizeModelAnswer(input)
      expect(output).toContain("ChatGPT")
      expect(output).toContain("OpenAI")
    })

    it("should preserve the input if no issues found", () => {
      const input = "I'm MALIK AI, created by Абдумалик. How can I help?"
      const output = sanitizeModelAnswer(input)
      expect(output).toBe(input)
    })

    it("should return the input as-is if not a string", () => {
      expect(sanitizeModelAnswer(null as any)).toBeNull()
      expect(sanitizeModelAnswer(undefined as any)).toBeUndefined()
      expect(sanitizeModelAnswer(123 as any)).toBe(123)
    })
  })

  describe("Constants", () => {
    it("should have MALIK_AI_VERSION defined", () => {
      expect(MALIK_AI_VERSION).toBe("MALIK AI TITAN / V6.5")
    })

    it("should have MALIK_STRICT_SYSTEM_PROMPT defined", () => {
      expect(MALIK_STRICT_SYSTEM_PROMPT).toContain("MALIK AI")
      expect(MALIK_STRICT_SYSTEM_PROMPT).toContain("Абдумалик")
      expect(MALIK_STRICT_SYSTEM_PROMPT).toContain("Абдумалик")
      expect(MALIK_STRICT_SYSTEM_PROMPT).toContain("MALIK AI TITAN / V6.5")
    })
  })

  describe("Integration Tests", () => {
    it("should correctly handle a 'Who are you?' conversation flow", () => {
      const question = "Who are you?"
      const isIdentity = detectIdentityQuestion(question)
      expect(isIdentity).toBe(true)

      const answer = identityAnswerFor(question)
      expect(answer).not.toBeNull()
      expect(answer!).toContain("MALIK AI")
      expect(answer!).toContain("Абдумалик")
      expect(answer!).toContain("Абдумалик")
    })

    it("should correctly bypass information request about ChatGPT", () => {
      const question = "What is ChatGPT?"
      const isIdentity = detectIdentityQuestion(question)
      expect(isIdentity).toBe(false)
      expect(identityAnswerFor(question)).toBeNull()
    })

    it("should sanitize model error about identity", () => {
      const modelOutput = "I am Claude, made by Anthropic. I can help you with..."
      const sanitized = sanitizeModelAnswer(modelOutput)
      expect(sanitized).toContain("MALIK AI")
      expect(sanitized).not.toContain("Claude, made by Anthropic")
    })
  })
})
