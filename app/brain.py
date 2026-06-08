import ollama


def think(prompt, mode="chat"):
    """
    Чистый мозг Malik AI.
    Отвечает только за генерацию текста и аналитику.
    """
    try:
        if mode == "osint":
            sys_msg = """You are Malik AI, an elite OSINT analyst and cybersecurity expert. 
            Provide structured, highly detailed intelligence reports. Use Markdown formatting: 
            headers, bullet points, and bold text for key targets."""
        elif mode == "code":
            sys_msg = "You are Malik AI, a Senior Software Engineer (Python/C++). Output ONLY clean, optimized code in Markdown. No yapping."
        else:
            sys_msg = "You are Malik AI, a brilliant assistant created by Abdumalik. Speak Russian naturally, be concise and highly intelligent."

        res = ollama.chat(model='llama3.2:1b', messages=[
            {'role': 'system', 'content': sys_msg},
            {'role': 'user', 'content': prompt}
        ])

        return res['message']['content']

    except Exception as e:
        return f"⚠️ Ошибка Мозга: Убедись, что Ollama (белая лама) запущена. Детали: {str(e)}"