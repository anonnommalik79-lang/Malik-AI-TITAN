/**
 * One language table for the whole translator.
 *
 * The UI used to carry 18 languages while the API validated against its own
 * copy of the same 18, so the two could drift and a language shown in the
 * picker could come back rejected. Both now read this list, and the header's
 * "130+" is a count of it rather than a marketing number.
 */

export type TranslatorLanguage = {
  /** BCP-47-ish code sent to the provider. */
  code: string
  /** Shown in the picker, in the language's own script. */
  label: string
  /** Sent to the model, which reasons better about English names. */
  english: string
}

export const TRANSLATOR_LANGUAGES: TranslatorLanguage[] = [
  { code: "ru", label: "Русский", english: "Russian" },
  { code: "en", label: "English", english: "English" },
  { code: "kk", label: "Қазақша", english: "Kazakh" },
  { code: "uk", label: "Українська", english: "Ukrainian" },
  { code: "be", label: "Беларуская", english: "Belarusian" },
  { code: "ky", label: "Кыргызча", english: "Kyrgyz" },
  { code: "uz", label: "Oʻzbekcha", english: "Uzbek" },
  { code: "tk", label: "Türkmençe", english: "Turkmen" },
  { code: "tg", label: "Тоҷикӣ", english: "Tajik" },
  { code: "az", label: "Azərbaycan", english: "Azerbaijani" },
  { code: "hy", label: "Հայերեն", english: "Armenian" },
  { code: "ka", label: "ქართული", english: "Georgian" },
  { code: "tr", label: "Türkçe", english: "Turkish" },
  { code: "tt", label: "Татарча", english: "Tatar" },
  { code: "ba", label: "Башҡортса", english: "Bashkir" },
  { code: "cv", label: "Чӑвашла", english: "Chuvash" },
  { code: "de", label: "Deutsch", english: "German" },
  { code: "fr", label: "Français", english: "French" },
  { code: "es", label: "Español", english: "Spanish" },
  { code: "it", label: "Italiano", english: "Italian" },
  { code: "pt", label: "Português", english: "Portuguese" },
  { code: "pt-BR", label: "Português (BR)", english: "Brazilian Portuguese" },
  { code: "nl", label: "Nederlands", english: "Dutch" },
  { code: "pl", label: "Polski", english: "Polish" },
  { code: "cs", label: "Čeština", english: "Czech" },
  { code: "sk", label: "Slovenčina", english: "Slovak" },
  { code: "sl", label: "Slovenščina", english: "Slovenian" },
  { code: "hr", label: "Hrvatski", english: "Croatian" },
  { code: "sr", label: "Српски", english: "Serbian" },
  { code: "bs", label: "Bosanski", english: "Bosnian" },
  { code: "mk", label: "Македонски", english: "Macedonian" },
  { code: "bg", label: "Български", english: "Bulgarian" },
  { code: "ro", label: "Română", english: "Romanian" },
  { code: "hu", label: "Magyar", english: "Hungarian" },
  { code: "el", label: "Ελληνικά", english: "Greek" },
  { code: "sq", label: "Shqip", english: "Albanian" },
  { code: "lt", label: "Lietuvių", english: "Lithuanian" },
  { code: "lv", label: "Latviešu", english: "Latvian" },
  { code: "et", label: "Eesti", english: "Estonian" },
  { code: "fi", label: "Suomi", english: "Finnish" },
  { code: "sv", label: "Svenska", english: "Swedish" },
  { code: "no", label: "Norsk", english: "Norwegian" },
  { code: "da", label: "Dansk", english: "Danish" },
  { code: "is", label: "Íslenska", english: "Icelandic" },
  { code: "ga", label: "Gaeilge", english: "Irish" },
  { code: "cy", label: "Cymraeg", english: "Welsh" },
  { code: "gl", label: "Galego", english: "Galician" },
  { code: "ca", label: "Català", english: "Catalan" },
  { code: "eu", label: "Euskara", english: "Basque" },
  { code: "mt", label: "Malti", english: "Maltese" },
  { code: "lb", label: "Lëtzebuergesch", english: "Luxembourgish" },
  { code: "ar", label: "العربية", english: "Arabic" },
  { code: "he", label: "עברית", english: "Hebrew" },
  { code: "fa", label: "فارسی", english: "Persian" },
  { code: "ps", label: "پښتو", english: "Pashto" },
  { code: "ku", label: "Kurdî", english: "Kurdish" },
  { code: "ur", label: "اردو", english: "Urdu" },
  { code: "hi", label: "हिन्दी", english: "Hindi" },
  { code: "bn", label: "বাংলা", english: "Bengali" },
  { code: "pa", label: "ਪੰਜਾਬੀ", english: "Punjabi" },
  { code: "gu", label: "ગુજરાતી", english: "Gujarati" },
  { code: "mr", label: "मराठी", english: "Marathi" },
  { code: "ne", label: "नेपाली", english: "Nepali" },
  { code: "sa", label: "संस्कृतम्", english: "Sanskrit" },
  { code: "ta", label: "தமிழ்", english: "Tamil" },
  { code: "te", label: "తెలుగు", english: "Telugu" },
  { code: "kn", label: "ಕನ್ನಡ", english: "Kannada" },
  { code: "ml", label: "മലയാളം", english: "Malayalam" },
  { code: "si", label: "සිංහල", english: "Sinhala" },
  { code: "th", label: "ไทย", english: "Thai" },
  { code: "lo", label: "ລາວ", english: "Lao" },
  { code: "km", label: "ខ្មែរ", english: "Khmer" },
  { code: "my", label: "မြန်မာ", english: "Burmese" },
  { code: "vi", label: "Tiếng Việt", english: "Vietnamese" },
  { code: "id", label: "Bahasa Indonesia", english: "Indonesian" },
  { code: "ms", label: "Bahasa Melayu", english: "Malay" },
  { code: "tl", label: "Filipino", english: "Filipino" },
  { code: "jv", label: "Basa Jawa", english: "Javanese" },
  { code: "su", label: "Basa Sunda", english: "Sundanese" },
  { code: "ceb", label: "Cebuano", english: "Cebuano" },
  { code: "zh-CN", label: "中文 (简体)", english: "Simplified Chinese" },
  { code: "zh-TW", label: "中文 (繁體)", english: "Traditional Chinese" },
  { code: "yue", label: "粵語", english: "Cantonese" },
  { code: "ja", label: "日本語", english: "Japanese" },
  { code: "ko", label: "한국어", english: "Korean" },
  { code: "mn", label: "Монгол", english: "Mongolian" },
  { code: "bo", label: "བོད་སྐད།", english: "Tibetan" },
  { code: "ug", label: "ئۇيغۇرچە", english: "Uyghur" },
  { code: "sw", label: "Kiswahili", english: "Swahili" },
  { code: "am", label: "አማርኛ", english: "Amharic" },
  { code: "ti", label: "ትግርኛ", english: "Tigrinya" },
  { code: "so", label: "Soomaali", english: "Somali" },
  { code: "ha", label: "Hausa", english: "Hausa" },
  { code: "yo", label: "Yorùbá", english: "Yoruba" },
  { code: "ig", label: "Igbo", english: "Igbo" },
  { code: "zu", label: "isiZulu", english: "Zulu" },
  { code: "xh", label: "isiXhosa", english: "Xhosa" },
  { code: "af", label: "Afrikaans", english: "Afrikaans" },
  { code: "st", label: "Sesotho", english: "Southern Sotho" },
  { code: "sn", label: "chiShona", english: "Shona" },
  { code: "ny", label: "Chichewa", english: "Chichewa" },
  { code: "rw", label: "Kinyarwanda", english: "Kinyarwanda" },
  { code: "lg", label: "Luganda", english: "Luganda" },
  { code: "mg", label: "Malagasy", english: "Malagasy" },
  { code: "wo", label: "Wolof", english: "Wolof" },
  { code: "ff", label: "Fulfulde", english: "Fula" },
  { code: "bm", label: "Bamanankan", english: "Bambara" },
  { code: "ee", label: "Eʋegbe", english: "Ewe" },
  { code: "tw", label: "Twi", english: "Twi" },
  { code: "ak", label: "Akan", english: "Akan" },
  { code: "om", label: "Afaan Oromoo", english: "Oromo" },
  { code: "kri", label: "Krio", english: "Krio" },
  { code: "nso", label: "Sepedi", english: "Northern Sotho" },
  { code: "ts", label: "Xitsonga", english: "Tsonga" },
  { code: "tn", label: "Setswana", english: "Tswana" },
  { code: "haw", label: "ʻŌlelo Hawaiʻi", english: "Hawaiian" },
  { code: "mi", label: "Te Reo Māori", english: "Maori" },
  { code: "sm", label: "Gagana Sāmoa", english: "Samoan" },
  { code: "to", label: "Lea faka-Tonga", english: "Tongan" },
  { code: "fj", label: "Na Vosa Vakaviti", english: "Fijian" },
  { code: "qu", label: "Runa Simi", english: "Quechua" },
  { code: "ay", label: "Aymar aru", english: "Aymara" },
  { code: "gn", label: "Avañeʼẽ", english: "Guarani" },
  { code: "ht", label: "Kreyòl ayisyen", english: "Haitian Creole" },
  { code: "la", label: "Latina", english: "Latin" },
  { code: "eo", label: "Esperanto", english: "Esperanto" },
  { code: "yi", label: "ייִדיש", english: "Yiddish" },
  { code: "gd", label: "Gàidhlig", english: "Scottish Gaelic" },
  { code: "fo", label: "Føroyskt", english: "Faroese" },
  { code: "dv", label: "ދިވެހި", english: "Dhivehi" },
  { code: "sd", label: "سنڌي", english: "Sindhi" },
  { code: "as", label: "অসমীয়া", english: "Assamese" },
  { code: "or", label: "ଓଡ଼ିଆ", english: "Odia" },
  { code: "mai", label: "मैथिली", english: "Maithili" },
  { code: "doi", label: "डोगरी", english: "Dogri" },
  { code: "kok", label: "कोंकणी", english: "Konkani" },
  { code: "mni", label: "ꯃꯤꯇꯩꯂꯣꯟ", english: "Meiteilon" },
]

/** Offered above the picker because they are what this product's users pick. */
export const QUICK_SOURCE_CODES = ["auto", "ru", "en", "kk"] as const
export const QUICK_TARGET_CODES = ["ru", "en", "kk"] as const

export const AUTO_LANGUAGE = { code: "auto", label: "Авто", english: "auto-detect" }

export const TRANSLATOR_LANGUAGE_COUNT = TRANSLATOR_LANGUAGES.length

/**
 * "130+" rather than the exact 137: the badge is a floor the list can grow past
 * without the number becoming a lie, and it reads as a claim rather than a
 * suspiciously precise stat.
 */
export const TRANSLATOR_LANGUAGE_FLOOR = Math.floor(TRANSLATOR_LANGUAGES.length / 10) * 10

export function languageLabel(code: string) {
  if (code === "auto") return AUTO_LANGUAGE.label
  return TRANSLATOR_LANGUAGES.find((language) => language.code === code)?.label || code
}

export function languageEnglishName(code: string) {
  return TRANSLATOR_LANGUAGES.find((language) => language.code === code)?.english || code
}

export function isSupportedLanguage(code: string) {
  return code === "auto" || TRANSLATOR_LANGUAGES.some((language) => language.code === code)
}

/** Speech synthesis wants a locale, not a bare language code, where we know one. */
export function speechLocale(code: string) {
  const known: Record<string, string> = {
    ru: "ru-RU", en: "en-US", kk: "kk-KZ", uk: "uk-UA", tr: "tr-TR",
    de: "de-DE", fr: "fr-FR", es: "es-ES", it: "it-IT", pt: "pt-PT",
    "pt-BR": "pt-BR", ar: "ar-SA", he: "he-IL", hi: "hi-IN", ja: "ja-JP",
    ko: "ko-KR", "zh-CN": "zh-CN", "zh-TW": "zh-TW", pl: "pl-PL", nl: "nl-NL",
  }
  return known[code] || code
}
