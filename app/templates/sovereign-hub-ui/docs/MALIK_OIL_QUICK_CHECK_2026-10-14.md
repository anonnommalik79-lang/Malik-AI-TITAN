# Как проверить Malik Oil после публикации

Это проверка расчётных функций, не настоящего месторождения. Используй обычный чат с навыком Malik Oil AI. Файлы ниже — синтетические примеры. Все величины указаны явно; выдумывать недостающие параметры модель не должна.

## 1. Закачка: короткий запрос без JSON

```text
@Malik Oil AI Рассчитай method=waterflood dataKind=synthetic waterRelPerm=0.2 oilRelPerm=0.8 waterViscosityPaS=0.001 oilViscosityPaS=0.004 injectedReservoirM3=1200 producedReservoirM3=1000 poreVolumeM3=10000
```

Ожидается: mobilityRatio = 1; voidageReplacementRatio = 1.2;
injectedPoreVolumes = 0.12. В отчёте должны быть версия движка, SHA-256,
формула, единицы, численные проверки PASS, ноль вызовов моделей и ограничения.
Не должно быть обещания дополнительной добычи или команды оборудованию.

## 2. Монте-Карло: финансовый сценарий

Вставь после `@Malik Oil AI` весь следующий блок:

```petroleum
{"op":"scientific","input":{"method":"monte-carlo","dataKind":"synthetic","purpose":"finance","currency":"USD","period":"year","discountPerPeriod":0.1,"volumesM3":[10,10],"pricePerM3":{"min":20,"mode":20,"max":20},"volumeScale":{"min":1,"mode":1,"max":1},"variablePerM3":{"min":5,"mode":5,"max":5},"capex":{"min":100,"mode":100,"max":100},"fixedPerPeriod":10,"seed":42,"samples":100,"applicability":"independent-triangular-inputs-not-market-forecast"}}
```

Это намеренно вырожденные распределения для точного эталона: p05 = p50 =
p95 = 142.97520661157024 USD; negativeNpvFraction = 0; draws = 100.
Измени цену на `{"min":10,"mode":20,"max":50}` — появится диапазон.
Одинаковые входы и seed дают те же численные результаты; другой seed меняет
невырожденный сценарий. Это не прогноз рынка и не вероятность успеха проекта.

## 3. ESP по предоставленной кривой

```petroleum
{"op":"scientific","input":{"method":"esp","dataKind":"synthetic","densityKgM3":1000,"referenceRpm":3000,"rpm":3000,"stages":10,"operatingM3Day":100,"curve":[{"qM3Day":0,"headM":20,"efficiency":0.5},{"qM3Day":100,"headM":15,"efficiency":0.75},{"qM3Day":200,"headM":5,"efficiency":0.5}],"applicability":"supplied-pump-curve-affinity-no-gas"}}
```

Ожидается headM = 150, efficiency = 0.75, shaftPowerW ≈ 2270.05787037.
Должна отобразиться кривая с явными координатами и единицами. Измени
operatingM3Day на 201: расчёт должен отказать в экстраполяции, а не придумать
паспортную характеристику. Это не проект подбора насоса для реальной скважины.

## 4. Настоящий экспорт через существующий API

Для авторизованного same-origin запроса:

```text
POST /api/work/skills/run
Content-Type: application/json

{"skill":"petroleum.analyze","task":<объект op/input из примеров>,"language":"ru","format":"xlsx"}
```

`format`: docx, pdf, xlsx, md, json, html. Ответ содержит настоящие байты файла
и Content-Disposition attachment. Для Arabic PDF вернётся честный отказ 422;
используй DOCX/HTML. Подставляемая часть `<объект ...>` — пояснение, не готовый JSON.
Сам факт поддержки HTTP-экспорта не означает добавление новых кнопок в замороженный интерфейс.

## 5. Полный перечень и ограничения

Каталог: `lib/work/petroleum/capability-catalog.ts` — 100 ограниченных численных
областей. 61 научный контракт: `science-schema.ts` и
`science-advanced-schema.ts`. Исполняемые примеры всех методов находятся в
`scripts/fixtures/oil-science.mjs` и `oil-science-advanced.mjs`.

Если сайт ещё на предыдущем коммите, новая версия не появится только от обновления
страницы. Сверь SHA опубликованного приложения с итоговым коммитом. Render этим
изменением вручную не запускается. Реальная авторизация, постоянное хранилище и
валидация на месторождении проверяются отдельно, без обхода входа.
