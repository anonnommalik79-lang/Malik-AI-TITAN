import time
import re

# ═══════════════════════════════════════════════════════════════════════════
# 🧠 1. TOOL FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════

def tool_osint(prompt, context, llm):
    system = "Ты аналитик киберразведки. Выведи строгий рапорт: связи, утечки, риски."
    draft = llm.smart_llm(system, prompt, "fast")

    if "[MOCK_DATA]" in str(draft):
        target = prompt.replace("/профайлер", "").strip()
        return f"🔍 OSINT ОТЧЕТ:\nЦель: {target}\nОбнаружены базовые цифровые следы."

    return draft


def tool_cyber(prompt, context, llm):
    system = "Ты эксперт по кибербезопасности. Найди уязвимости и дай фиксы."
    draft = llm.smart_llm(system, prompt, "fast")

    if "[MOCK_DATA]" in str(draft):
        return "🛡️ АУДИТ: обнаружены потенциальные XSS/SQL риски."

    return draft


def tool_chat(prompt, context, llm):
    system = "Ты Malik AI. Отвечай умно, кратко и профессионально."
    full_prompt = f"Контекст:\n{context}\n\nЗапрос:\n{prompt}"

    draft = llm.smart_llm(system, full_prompt, "fast")

    if "[MOCK_DATA]" in str(draft):
        return ""

    return draft


def tool_code(prompt, context, llm):
    system = "Ты senior разработчик. Пиши чистый production код."
    return llm.smart_llm(system, prompt, "fast")


# ═══════════════════════════════════════════════════════════════════════════
# 🧠 2. ORCHESTRATOR (БЕЗ LLMCORE)
# ═══════════════════════════════════════════════════════════════════════════

class Orchestrator:
    def __init__(self):
        # ❌ LLMCore УДАЛЁН
        self.llm = None

        self.registry = {
            "chat": tool_chat,
            "osint": tool_osint,
            "cyber": tool_cyber,
            "code": tool_code
        }

    # 🔥 ВРЕМЕННАЯ ОБЁРТКА (ПРОКСИ В ROUTES)
    def smart_llm(self, system, prompt, mode="fast"):
        """
        Теперь вместо LLMCore — прокидываем запрос наружу.
        """
        return f"[AI_ENGINE_PROXY] {system}\n{prompt}"


    def run(self, user, prompt, mode="fast"):
        start_time = time.time()

        clean_p = re.sub(r'[^\w\s]', '', prompt.lower()).strip()

        if clean_p in ["привет", "hi", "здравствуй"]:
            return "Здравствуйте! Я Malik AI."

        context = ""

        # 🧠 INTENT ROUTING (очень простой)
        if "/osint" in prompt:
            intent = "osint"
        elif "/cyber" in prompt:
            intent = "cyber"
        elif "/code" in prompt:
            intent = "code"
        else:
            intent = "chat"

        # 🔥 EXECUTE TOOL
        tool = self.registry.get(intent, tool_chat)

        try:
            result = tool(prompt, context, self)
        except Exception as e:
            result = f"⚠️ Ошибка выполнения: {str(e)}"

        exec_time = round(time.time() - start_time, 2)

        header = f"""### 🧠 AI ENGINE ACTIVE
User: {user}
Intent: {intent}
Time: {exec_time}s
---

"""

        return header + result


# ═══════════════════════════════════════════════════════════════════════════
# 🔥 GLOBAL ENGINE
# ═══════════════════════════════════════════════════════════════════════════

brain = Orchestrator()
