import { petroleumLanguage } from "./report"
/** Advisory guard. No setpoints, kill procedures, PLC instructions or device clients exist in this module. */
export function petroleumSafetyMessage(prompt:string):string|null {
  const hazard=/H2S|H₂S|сероводород|كبريتيد الهيدروجين|well integrity|целостност.*скважин|герметич|fire|пожар|حريق|утечк|leak|تسرب|выброс.*скважин|well\s*control/iu.test(prompt)
  const urgent=/сейчас|срочно|авари|опасност|сработал|alarm|emergency|now|تسرب|طوارئ|إنذار|الآن/iu.test(prompt)
  const control=/(?:управляй|открой|закрой|запусти|исполняй|control|open|close|execute|تحكم|افتح|أغلق)\s.{0,40}(?:клапан|скважин|PLC|DCS|SCADA|valve|well|صمام|بئر)/iu.test(prompt)
  if(!control&&!(hazard&&urgent))return null
  const language=petroleumLanguage(prompt)
  return ({
    ar:"يلزم تدخل المسؤولين المختصين واتباع إجراءات الطوارئ المعتمدة في الموقع. لا تنفّذ إعدادات أو أوامر تشغيل من هذا المحادثة. لا يستطيع Malik Oil AI التحكم في الآبار أو الصمامات أو PLC/DCS/SCADA ولا إثبات سلامة الموقع. إذا كان هناك خطر مباشر، اتصل فوراً بفريق الطوارئ المحلي واتبع إجراءات الإخلاء المعتمدة. التحليل يتطلب بيانات مؤكدة ومراجعة مهندس مخوّل.",
    ru:"Требуется участие ответственных специалистов и выполнение утверждённых процедур объекта. Не применяйте настройки или команды оборудования из чата. Malik Oil AI не управляет скважинами, клапанами или PLC/DCS/SCADA и не подтверждает безопасность объекта. При непосредственной угрозе немедленно свяжитесь с аварийной службой объекта и следуйте утверждённым процедурам эвакуации. Для анализа нужны подтверждённые данные и проверка уполномоченного инженера.",
    kk:"Жауапты мамандардың қатысуы және нысанның бекітілген апаттық рәсімдері қажет. Чаттан жабдық баптаулары мен басқару командаларын қолданбаңыз. Malik Oil AI ұңғымаларды, клапандарды немесе PLC/DCS/SCADA жүйелерін басқармайды және қауіпсіздікті растамайды. Тікелей қауіп болса, нысанның апаттық қызметіне хабарласып, бекітілген эвакуация рәсімдерін орындаңыз. Талдау үшін расталған деректер және уәкілетті инженердің тексеруі қажет.",
    en:"Responsible site specialists and approved operating/emergency procedures are required. Do not apply equipment settings or commands from this chat. Malik Oil AI cannot control wells, valves or PLC/DCS/SCADA or certify site safety. For an immediate threat contact the site emergency team and follow approved evacuation procedures. Analysis requires confirmed data and authorized engineer review.",
  } as const)[language]
}
