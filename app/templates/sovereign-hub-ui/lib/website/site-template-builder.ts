/** Shared standalone-site renderer used only by the separate «Сайты» studio. */
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;")
}

export type SiteDescriptor = {
  name: string
  category: string
  subcategory: string
  preview: string
  accent: string
  headline: string
  tagline: string
  number: string
}

type SiteStory = { eyebrow: string; promise: string; sections: [string, string, string]; questions: [string, string, string]; action: string }

const STORIES: Record<string, SiteStory> = {
  "Автомобили": { eyebrow: "Инженерия движения", promise: "От первого взгляда до последнего поворота — продукт в центре истории.", sections: ["Дизайн, который движется", "Технологии под поверхностью", "Детали для каждого маршрута"], questions: ["Что входит в концепт?", "Можно ли показать комплектации?", "Как связаться с командой?"], action: "Изучить концепт" },
  "Авто": { eyebrow: "Инженерия движения", promise: "От первого взгляда до последнего поворота — продукт в центре истории.", sections: ["Дизайн, который движется", "Технологии под поверхностью", "Детали для каждого маршрута"], questions: ["Что входит в концепт?", "Можно ли показать комплектации?", "Как связаться с командой?"], action: "Изучить концепт" },
  "Роскошь": { eyebrow: "Искусство деталей", promise: "Редкие предметы заслуживают спокойного пространства и точной подачи.", sections: ["Материал и форма", "Процесс создания", "Коллекция без компромиссов"], questions: ["Как устроена коллекция?", "Есть ли персонализация?", "Как запросить детали?"], action: "Открыть коллекцию" },
  "Люкс": { eyebrow: "Искусство деталей", promise: "Редкие предметы заслуживают спокойного пространства и точной подачи.", sections: ["Материал и форма", "Процесс создания", "Коллекция без компромиссов"], questions: ["Как устроена коллекция?", "Есть ли персонализация?", "Как запросить детали?"], action: "Открыть коллекцию" },
  "Красота": { eyebrow: "Ритуал каждый день", promise: "Форма, текстура и внимание к себе — без лишних обещаний.", sections: ["Формула впечатления", "Текстуры и ощущение", "Личный ритуал"], questions: ["Что представлено здесь?", "Как выбрать направление?", "Где узнать состав?"], action: "Исследовать линию" },
  "Мода": { eyebrow: "Новая форма", promise: "Редакционный взгляд на вещи, которые говорят без объяснений.", sections: ["Силуэт сезона", "Материалы и движение", "Гардероб как история"], questions: ["Можно ли добавить каталог?", "Где разместить размерную сетку?", "Как оформить заказ?"], action: "Смотреть коллекцию" },
  "Одежда": { eyebrow: "Новая форма", promise: "Редакционный взгляд на вещи, которые говорят без объяснений.", sections: ["Силуэт сезона", "Материалы и движение", "Гардероб как история"], questions: ["Можно ли добавить каталог?", "Где разместить размерную сетку?", "Как оформить заказ?"], action: "Смотреть коллекцию" },
  "Технологии": { eyebrow: "Технологии для людей", promise: "Показываем сложный продукт просто: задача, решение, результат.", sections: ["Интерфейс без шума", "Система в действии", "Создано для роста"], questions: ["Как устроен продукт?", "Есть ли интеграции?", "Как начать работу?"], action: "Смотреть возможности" },
  "Недвижимость": { eyebrow: "Место имеет значение", promise: "Архитектура, свет и пространство складываются в ощущение дома.", sections: ["Пространство для жизни", "Продуманные детали", "Район и окружение"], questions: ["Как посмотреть планировки?", "Где увидеть расположение?", "Как запросить просмотр?"], action: "Исследовать пространство" },
  "Рестораны": { eyebrow: "Вкус и атмосфера", promise: "История места начинается задолго до первой подачи.", sections: ["Меню с характером", "Атмосфера вечера", "Люди и кухня"], questions: ["Где посмотреть меню?", "Как забронировать стол?", "Есть ли специальные предложения?"], action: "Открыть меню" },
  "Еда": { eyebrow: "Вкус и атмосфера", promise: "История места начинается задолго до первой подачи.", sections: ["Меню с характером", "Атмосфера вечера", "Люди и кухня"], questions: ["Где посмотреть меню?", "Как забронировать стол?", "Есть ли специальные предложения?"], action: "Открыть меню" },
  "Путешествия": { eyebrow: "За пределами привычного", promise: "Направление, впечатление и свобода выбора в одном маршруте.", sections: ["Места, к которым возвращаются", "Маршрут под вас", "Каждый момент важен"], questions: ["Какие направления доступны?", "Можно ли изменить маршрут?", "Как оставить запрос?"], action: "Открыть направления" },
  "Бизнес": { eyebrow: "Ясность в решениях", promise: "Убедительная презентация услуг без выдуманных цифр и громких обещаний.", sections: ["Стратегия и фокус", "Подход к работе", "Результат по задаче"], questions: ["Какие задачи решаются?", "Как проходит работа?", "Как обсудить проект?"], action: "Изучить подход" },
  "Спорт": { eyebrow: "Энергия движения", promise: "Тренировка, восстановление и прогресс — в одном сильном ритме.", sections: ["Двигаться осознанно", "Снаряжение и метод", "Ваш следующий шаг"], questions: ["Как выбрать программу?", "Есть ли расписание?", "Как начать?"], action: "Начать движение" },
  "Бренды": { eyebrow: "Идея в движении", promise: "Продукт, характер и сообщество складываются в узнаваемый мир.", sections: ["Позиция бренда", "Продукт в центре", "Культура движения"], questions: ["Что входит в коллекцию?", "Как найти подходящий продукт?", "Где посмотреть условия?"], action: "Исследовать бренд" },
  "Аромат": { eyebrow: "Невидимая подпись", promise: "Ноты, материалы и настроение превращаются в личную историю.", sections: ["Первое впечатление", "Сердце композиции", "После шлейфа"], questions: ["Какие ноты представлены?", "Как выбрать аромат?", "Есть ли пробники?"], action: "Открыть композицию" },
  "Здоровье": { eyebrow: "Система заботы", promise: "Тренировки и восстановление без обещаний, которые нельзя подтвердить.", sections: ["Движение", "Восстановление", "Ритм каждого дня"], questions: ["Как выбрать программу?", "Нужна ли консультация?", "С чего начать?"], action: "Изучить программу" },
  "Образование": { eyebrow: "Знание в действии", promise: "Путь от первого вопроса до уверенного применения навыка.", sections: ["Программа обучения", "Практика и обратная связь", "Ваш следующий уровень"], questions: ["Чему можно научиться?", "Как проходит обучение?", "Где посмотреть программу?"], action: "Посмотреть программу" },
  "Финансы": { eyebrow: "Ясность в цифрах", promise: "Структура и доверие без неподтверждённых обещаний доходности.", sections: ["Подход к решениям", "Прозрачность процесса", "Долгий горизонт"], questions: ["Какие услуги представлены?", "Как устроен процесс?", "Как обсудить задачу?"], action: "Изучить подход" },
  "Интерьер": { eyebrow: "Пространство с характером", promise: "Материалы, пропорции и свет создают ощущение завершённости.", sections: ["Идея пространства", "Материалы и фактуры", "Детали жизни"], questions: ["Как посмотреть проекты?", "Можно ли выбрать материалы?", "Как начать проект?"], action: "Исследовать пространство" },
  "Архитектура": { eyebrow: "Форма с причиной", promise: "Каждая линия отвечает на вопрос о том, как людям жить и работать.", sections: ["Контекст места", "Структура и свет", "Долгосрочная ценность"], questions: ["Какие проекты представлены?", "Как проходит проектирование?", "Как начать обсуждение?"], action: "Смотреть проекты" },
}

function storyFor(category: string): SiteStory {
  return STORIES[category] || { eyebrow: "Создано с намерением", promise: "Ясная идея, выразительная форма и место для вашего продукта.", sections: ["Идея", "Возможности", "Следующий шаг"], questions: ["Что это за проект?", "Как он работает?", "Как связаться?"], action: "Исследовать" }
}

export function buildTemplateSite(template: SiteDescriptor, origin = "") {
  const style = { accent: template.accent, headline: template.headline, tagline: template.tagline }
  const story = storyFor(template.category)
  const variant = Math.abs(Number.parseInt(template.number, 10) || template.name.length) % 4
  const number = escapeHtml(template.number)
  const name = escapeHtml(template.name)
  const category = escapeHtml(template.category)
  const subcategory = escapeHtml(template.subcategory)
  const base = origin.replace(/\/+$/, "")
  const previewPath = /^\/sites\/gallery\/[a-z0-9-]+\.webp$/.test(template.preview) ? template.preview : "/sites/gallery/apple-experience.webp"
  const preview = `${base}${previewPath}`
  const features = story.sections.map((title, index) => `<article class="feature"><span>0${index + 1} / ${number}</span><h3>${escapeHtml(title)}</h3><p>${index === 0 ? `${name} — ${escapeHtml(story.promise)}` : index === 1 ? `В основе направления «${subcategory}» — ясная структура и внимание к каждому взаимодействию.` : `Продолжение истории ${name}: пространство для деталей, выбора и следующего шага.`}</p></article>`).join("")
  const faq = story.questions.map((question, index) => `<details><summary>${escapeHtml(question)}</summary><p>${index === 0 ? `Это демонстрационный концепт ${name} для направления «${subcategory}». Содержание и предложения можно настроить под реальный проект.` : index === 1 ? "Да. Дальнейшие разделы, карточки и материалы можно адаптировать в редакторе Malik AI под ваши данные." : "Используйте шаблон в разделе «Сайты» Malik AI, чтобы создать собственную версию с актуальной контактной информацией."}</p></details>`).join("")

  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#050608"><meta name="description" content="${escapeHtml(story.promise)}"><title>${name} — ${category}</title>
<style>
:root{--accent:${/^#[\da-f]{6}$/i.test(style.accent) ? style.accent : "#e8c274"};--bg:#030407;--text:#f6f7f8;--muted:#b7bdc6}
*{box-sizing:border-box}html{scroll-behavior:smooth}html,body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
body{overflow-x:hidden}.hero{position:relative;min-height:100svh;overflow:hidden;background:#020306}
.bg{position:absolute;right:0;top:0;width:78%;height:100%;object-fit:cover;object-position:right center}.shade{position:absolute;inset:0;background:linear-gradient(90deg,#030407 5%,#030407ed 33%,#03040755 71%,#03040722)}
.nav{position:absolute;z-index:5;left:5%;right:5%;top:28px;display:flex;align-items:center;justify-content:space-between}.brand{font-weight:900;letter-spacing:.07em;font-size:18px}.brand:before{content:"//";color:var(--accent);margin-right:10px}
.links{display:flex;align-items:center;gap:30px}.links a{color:#f6f7f8;text-decoration:none;font-size:11px;text-transform:uppercase;letter-spacing:.08em}.menu{display:none;border:1px solid #ffffff2b;background:#080a0dbb;color:#fff;border-radius:9px;width:42px;height:42px}
.copy{position:absolute;z-index:4;left:5%;top:50%;transform:translateY(-47%);width:min(620px,48vw)}.kicker{color:var(--accent);font-weight:900;letter-spacing:.17em;font-size:11px;text-transform:uppercase}
h1{font-size:clamp(62px,7.7vw,132px);line-height:.86;letter-spacing:-.065em;margin:20px 0 18px;text-wrap:balance}.dash{width:58px;height:3px;background:var(--accent);margin-bottom:22px}.copy p{max-width:560px;font-size:16px;line-height:1.55;color:#d8dce1}
.cta{display:inline-flex;align-items:center;gap:35px;margin-top:16px;padding:15px 20px;background:var(--accent);color:#111;text-decoration:none;font-size:11px;font-weight:900;border-radius:7px}
.scroll{position:absolute;z-index:4;left:5%;bottom:28px;font-size:9px;color:#9da4ad;letter-spacing:.12em;text-transform:uppercase}
.section{padding:110px 5%}.section.dark{background:#07080a}.section h2{font-size:clamp(38px,5vw,74px);line-height:.95;letter-spacing:-.045em;margin:0 0 24px}.section p{color:#aeb5bf;line-height:1.7;max-width:760px}
.grid{display:grid;grid-template-columns:1.1fr .9fr;gap:28px;align-items:center}.preview{border:1px solid #2b2e34;border-radius:16px;overflow:hidden;background:#0c0d10;box-shadow:0 26px 80px #0008}.preview img{display:block;width:100%;height:auto}.panel{padding:28px;border:1px solid #25282d;border-radius:16px;background:#0c0d10}.features{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:42px}.feature{min-height:280px;padding:28px;border:1px solid #272b31;background:#0c0e11}.feature span{font-size:10px;letter-spacing:.14em;color:var(--accent)}.feature h3{font-size:clamp(25px,2.5vw,40px);letter-spacing:-.04em;line-height:1.05}.feature p{font-size:14px}
.faq{max-width:860px;margin:auto}.faq details{border-top:1px solid #333;padding:22px 0}.faq details:last-child{border-bottom:1px solid #333}.faq summary{cursor:pointer;font-size:18px;font-weight:650;list-style:none;display:flex;justify-content:space-between}.faq summary:after{content:"+";color:var(--accent)}.faq details[open] summary:after{content:"−"}.faq p{font-size:14px}.contact{display:flex;align-items:end;justify-content:space-between;gap:30px}.footer{padding:30px 5%;border-top:1px solid #1d2025;color:#757c85;font-size:11px;display:flex;justify-content:space-between}
.v1 .bg{width:64%;filter:saturate(.75)}.v1 .copy{top:auto;bottom:13%;transform:none}.v2 .copy{top:43%;width:min(760px,56vw)}.v2 .bg{width:100%;opacity:.68;filter:saturate(.65)}.v2 .shade{background:linear-gradient(90deg,#030407e8,#030407ad 50%,#03040744)}.v3 .hero{min-height:88svh}.v3 .bg{width:58%;border-left:1px solid #ffffff33}.v3 .copy{width:min(560px,40vw)}.v1 .grid{grid-template-columns:.75fr 1.25fr}.v2 .grid{grid-template-columns:1fr 1fr}.v2 .features{grid-template-columns:1.3fr 1fr 1fr}.v3 .features{grid-template-columns:1fr 1fr 1.3fr}
@media(max-width:760px){
  .hero{min-height:820px}.nav{top:18px}.brand{font-size:15px}.links{display:none;position:absolute;top:52px;right:0;left:0;padding:18px;background:#090b0eea;border:1px solid #2a2d33;border-radius:12px;flex-direction:column;align-items:flex-start}.links.open{display:flex}.menu{display:grid;place-items:center}
  .shade{background:linear-gradient(0deg,rgba(0,0,0,.82) 0%,rgba(0,0,0,.45) 56%,rgba(0,0,0,.08) 100%)}
  .copy{left:7%;right:7%;top:auto;bottom:95px;transform:none;width:auto}.kicker{font-size:10px}h1{font-size:58px;margin-top:14px}.copy p{font-size:15px}.cta{padding:14px 17px}.scroll{display:none}
  .bg,.v1 .bg,.v2 .bg,.v3 .bg{width:100%;opacity:.86;object-position:right center}.v1 .copy,.v2 .copy,.v3 .copy{top:auto;bottom:95px;left:7%;right:7%;width:auto;transform:none}.v2 .shade{background:linear-gradient(0deg,#030407eb,#03040766 65%,#03040733)}
  .section{padding:72px 7%}.grid,.v1 .grid,.v2 .grid{grid-template-columns:1fr}.features,.v2 .features,.v3 .features{grid-template-columns:1fr}.feature{min-height:0}.contact{display:block}.contact .cta{margin-top:24px}.footer{display:block;line-height:1.8}
}
</style></head>
<body class="v${variant}">
<section class="hero" id="home">
  <img class="bg" src="${preview}" alt="" onerror="this.src='${base}/sites/gallery/apple-experience.webp'">
  <div class="shade"></div>
  <nav class="nav"><div class="brand">${name}</div>
    <button class="menu" id="menu" aria-label="Меню" aria-expanded="false" aria-controls="links">☰</button>
    <div class="links" id="links"><a href="#home">Главная</a><a href="#design">История</a><a href="#about">Возможности</a><a href="#questions">Вопросы</a></div>
  </nav>
  <div class="copy"><div class="kicker">${category} / ${escapeHtml(story.eyebrow)}</div><h1>${name}</h1><div class="dash"></div>
    <p>${escapeHtml(story.promise)}</p><a class="cta" href="#design"><span>${escapeHtml(story.action)}</span><b>→</b></a>
  </div>
  <div class="scroll">${escapeHtml(style.headline)} · ПРОКРУТИТЕ ВНИЗ ↓</div>
</section>
<section class="section dark" id="design"><div class="grid">
  <div><div class="kicker">${subcategory} / ${number}</div><h2>${escapeHtml(style.headline)}</h2>
  <p>${escapeHtml(style.tagline)} ${escapeHtml(story.promise)}</p><a class="cta" href="#about">УЗНАТЬ БОЛЬШЕ →</a></div>
  <div class="preview"><img src="${preview}" alt="Визуальное направление ${name}" loading="lazy"></div>
</div></section>
<section class="section" id="about"><div class="kicker">${category} / ${subcategory}</div><h2>Что формирует ${name}</h2><div class="features">${features}</div></section>
<section class="section dark" id="questions"><div class="faq"><div class="kicker">Частые вопросы</div><h2>В деталях.</h2>${faq}</div></section>
<section class="section" id="contact"><div class="contact"><div><div class="kicker">${escapeHtml(story.eyebrow)}</div><h2>Ваш следующий шаг.</h2><p>Это демонстрационное направление. Откройте его в Malik AI, чтобы заменить концепт вашими реальными товарами, услугами и контактами.</p></div><a class="cta" href="#home">НАВЕРХ ↑</a></div></section>
<footer class="footer"><span>${name} · Концепт Malik AI ${number}</span><span>Демонстрационный сайт · Desktop / Tablet / Mobile</span></footer>
<script>
const menu=document.getElementById("menu"),links=document.getElementById("links");
menu.addEventListener("click",()=>{links.classList.toggle("open");menu.setAttribute("aria-expanded",links.classList.contains("open"))});
links.querySelectorAll("a").forEach(a=>a.addEventListener("click",()=>{links.classList.remove("open");menu.setAttribute("aria-expanded","false")}));
</script></body></html>`
}
