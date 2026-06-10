# 🧪 MALIK AI Identity Guard - Quick Test Guide

## ✅ Тестовые вопросы для проверки

Скопируй эти вопросы и отправь их в MALIK AI чат. Убедись что ответы соответствуют.

---

## 1️⃣ TEST: Identity Self - "Кто ты?"

**Input:**
```
Кто ты?
```

**Expected Output (должен содержать):**
- ✅ `MALIK AI`
- ✅ `Abdumalik Amangeldi`
- ✅ `Kazakhstan`
- ✅ `MALIK AI TITAN / V6.5`

**Response Time:** <100ms (должно быть быстро)

**Example correct response:**
```
I'm MALIK AI, an intelligent platform created by Abdumalik Amangeldi 
from Kazakhstan. I operate as an AI assistant within the MALIK AI ecosystem 
to help answer questions, write code, generate ideas, and create projects. 
Version: MALIK AI TITAN / V6.5
```

---

## 2️⃣ TEST: Creator Question - "Кто тебя создал?"

**Input:**
```
Кто тебя создал?
```

**Expected Output (должен содержать):**
- ✅ `MALIK AI`
- ✅ `Abdumalik Amangeldi`
- ✅ `Kazakhstan`
- ✅ `V6.5`

**Example correct response:**
```
MALIK AI was created by Abdumalik Amangeldi from Kazakhstan. 
Version: MALIK AI TITAN / V6.5
```

---

## 3️⃣ TEST: Identity Denial - "Ты Meta?"

**Input:**
```
Ты Meta?
```

**Expected Output (должен НАЧИНАТЬСЯ с):**
- ✅ `No. I am MALIK AI`

**ДОЛЖЕН СОДЕРЖАТЬ:**
- ✅ `Abdumalik Amangeldi`
- ✅ `Kazakhstan`

**ДОЛЖЕН ИСКЛЮЧИТЬ:**
- ❌ `Yes, I'm Meta`
- ❌ `I'm powered by Meta`

**Example correct response:**
```
No. I am MALIK AI. Some modes may use open-source or third-party models 
internally, but I'm presented to you as MALIK AI, created by Abdumalik 
Amangeldi from Kazakhstan.
```

---

## 4️⃣ TEST: ChatGPT Denial - "Ты ChatGPT?"

**Input:**
```
Ты ChatGPT?
```

**Expected Output (должен НАЧИНАТЬСЯ с):**
- ✅ `No. I am MALIK AI`

**ДОЛЖЕН СОДЕРЖАТЬ:**
- ✅ `Abdumalik Amangeldi`
- ✅ `Kazakhstan`
- ✅ `MALIK AI`

**ДОЛЖЕН ИСКЛЮЧИТЬ:**
- ❌ `Yes, I'm ChatGPT`
- ❌ `I'm OpenAI`
- ❌ `I'm GPT-4`

**Example correct response:**
```
No. I am MALIK AI. While I may use different AI models or providers 
internally, I present myself to you as MALIK AI, created by Abdumalik 
Amangeldi from Kazakhstan.
```

---

## 5️⃣ TEST: Version Question - "Какая у тебя версия?"

**Input:**
```
Какая у тебя версия?
```

**Expected Output (должен содержать):**
- ✅ `MALIK AI TITAN / V6.5`
- ✅ `Abdumalik Amangeldi`
- ✅ `Kazakhstan`

**Example correct response:**
```
I'm MALIK AI TITAN / V6.5, created by Abdumalik Amangeldi from Kazakhstan.
```

---

## 6️⃣ TEST: Information Request - "Кто такой ChatGPT?"

**Input:**
```
Кто такой ChatGPT?
```

**Expected Output (должен содержать):**
- ✅ `ChatGPT`
- ✅ `OpenAI`

**ДОЛЖЕН ИСКЛЮЧИТЬ:**
- ❌ `ChatGPT created by MALIK AI`
- ❌ `ChatGPT is MALIK engine`
- ❌ **НЕ должен перехватываться как Identity Guard вопрос**

**Example correct response:**
```
ChatGPT is an AI assistant created by OpenAI. It's a large language model 
trained on diverse internet text data. ChatGPT is known for its conversational 
abilities and was released to the public in November 2022...
```

**⚠️ Важно:** Это НЕ должен быть Identity Guard ответ! Это должен быть нормальный ответ про ChatGPT.

---

## 📸 TEST: Image Fallback Preview

**Input:**
```json
POST /api/generate
{
  "kind": "image",
  "prompt": "Beautiful sunset over mountains"
}
```

**Expected Response:**
```json
{
  "ok": true,
  "status": "demo-ready",
  "fallback": true,
  "fallbackUsed": true,
  "message": "Demo image preview ready. Live image generation will work...",
  "url": "data:image/svg+xml;charset=utf-8,...",
  "imageUrl": "data:image/svg+xml;charset=utf-8,..."
}
```

**Проверить:**
- ✅ `ok: true` (не false!)
- ✅ `fallback: true`
- ✅ SVG preview видна в UI
- ✅ Сообщение дружелюбное (не ошибка)
- ✅ URL содержит `data:image/svg+xml`

---

## 🎬 TEST: Video Fallback Storyboard

**Input:**
```json
POST /api/generate
{
  "kind": "video",
  "prompt": "A spacecraft flying through space with stars",
  "duration": 5
}
```

**Expected Response:**
```json
{
  "ok": true,
  "status": "storyboard-ready",
  "fallback": true,
  "fallbackUsed": true,
  "message": "Demo video storyboard ready. Live video rendering will work...",
  "url": "data:image/svg+xml;charset=utf-8,...",
  "videoUrl": "data:image/svg+xml;charset=utf-8,...",
  "posterUrl": "data:image/svg+xml;charset=utf-8,...",
  "previewUrl": "data:image/svg+xml;charset=utf-8,..."
}
```

**Проверить:**
- ✅ `ok: true` (не false!)
- ✅ `status: "storyboard-ready"`
- ✅ `fallback: true`
- ✅ Storyboard preview видна в UI
- ✅ Все URL поля содержат `data:image/svg+xml`
- ✅ Сообщение дружелюбное (не ошибка)

---

## 🔍 Additional Test Cases

### Test 7: Русский vs English
**Input:**
```
Who are you?
```
**Expected:** Тот же ответ про MALIK AI (может быть на английском)

### Test 8: Вариация вопроса
**Input:**
```
Кто я разговариваю?
```
**Expected:** Identity Guard должен перехватить (или пропустить как обычный вопрос)

### Test 9: Длинный prompt
**Input:**
```
I have a question: are you ChatGPT? Can you tell me your identity and version?
```
**Expected:** Identity Guard ловит "are you ChatGPT?" часть

### Test 10: Fake claim detection
**Model sometimes outputs:**
```
I am Claude, made by Anthropic
```
**After sanitization:**
```
I am MALIK AI, created by Abdumalik Amangeldi from Kazakhstan
```

---

## 📊 Success Criteria

| Test # | Category | Status |
|--------|----------|--------|
| 1 | Identity Self | ✅ Pass if contains all 4 keywords |
| 2 | Creator Question | ✅ Pass if contains all 4 keywords |
| 3 | Meta Denial | ✅ Pass if starts with "No. I am MALIK AI" |
| 4 | ChatGPT Denial | ✅ Pass if starts with "No. I am MALIK AI" |
| 5 | Version Question | ✅ Pass if contains V6.5 |
| 6 | Info Request | ✅ Pass if mentions OpenAI, NOT identity guard |
| 7 | Image Fallback | ✅ Pass if ok=true, SVG visible |
| 8 | Video Fallback | ✅ Pass if ok=true, storyboard visible |

---

## 🚀 How to Run All Tests

### Option A: Manual Testing
1. Go to MALIK AI chat: https://malik-ai.com (или ваш URL)
2. Отправь все 6 вопросов по одному
3. Проверь ответы против expected output
4. Проверь фото/видео генерацию в UI

### Option B: Automated Testing (если Jest настроен)
```bash
cd app/templates/sovereign-hub-ui
npm test -- lib/ai/identity.test.ts
```

### Option C: cURL Testing (для API endpoints)
```bash
# Test identity question via stream
curl -X POST http://localhost:3000/api/stream \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Кто ты?"}'

# Test image generation
curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" \
  -d '{"kind": "image", "prompt": "sunset"}'

# Test video generation
curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" \
  -d '{"kind": "video", "prompt": "spacecraft"}'
```

---

## 📝 Test Results Template

```markdown
# Test Results - [Date]

## Identity Tests
- [ ] Test 1: "Кто ты?" - PASS/FAIL
- [ ] Test 2: "Кто тебя создал?" - PASS/FAIL
- [ ] Test 3: "Ты Meta?" - PASS/FAIL
- [ ] Test 4: "Ты ChatGPT?" - PASS/FAIL
- [ ] Test 5: "Какая у тебя версия?" - PASS/FAIL
- [ ] Test 6: "Кто такой ChatGPT?" - PASS/FAIL

## Media Fallback Tests
- [ ] Image Fallback - PASS/FAIL
- [ ] Video Fallback - PASS/FAIL

## Overall Status
**READY FOR PRODUCTION**: YES / NO
```

---

## 🎯 Final Checklist

Before marking as "Production Ready":

- [ ] Все 6 identity тесты pass
- [ ] Image fallback показывает preview (не ошибка)
- [ ] Video fallback показывает storyboard (не ошибка)
- [ ] npm run build успешен
- [ ] Нет console errors в dev tools
- [ ] Response time < 200ms для обычных вопросов
- [ ] Identity Guard ответы < 50ms

---

**Good luck with testing! 🚀**

Если все пройдет - MALIK AI готов к production! 🎉
