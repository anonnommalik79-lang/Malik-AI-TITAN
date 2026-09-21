import { createMediaContainer, fetchPermalink, InstagramError, publishMediaContainer } from "@/lib/instagram/client"
import { accessToken, connectionStatus } from "@/lib/instagram/store"
import { readJsonBodyLimited, RequestSafetyError } from "@/lib/server/request-safety"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_BODY_BYTES = 64 * 1024
const MAX_CAPTION_CHARS = 2_200

function json(payload: unknown, status = 200) {
  return Response.json(payload, { status, headers: { "cache-control": "no-store", "x-malik-router": "instagram-publish-v1" } })
}

/**
 * Publishing to a real account under a real name.
 *
 * **This route does not post unless the request says `confirm: true`.** Called
 * without it, it validates everything, reports the account it would post to
 * and the exact caption that would appear, and stops. That is not a formality:
 * an Instagram post is public the instant it exists, the API has no delete,
 * and the assistant is acting as somebody else. A person gets to read what
 * goes out under their name before it does.
 *
 * The image has to be a public https URL because Instagram fetches it itself.
 * That is checked here rather than left to Meta, whose error for a private URL
 * talks about the media rather than about the address.
 */
export async function POST(request: Request) {
  try {
    const entitlement = await resolveRequestEntitlement(request)
    if (!entitlement.authenticated) return json({ ok: false, error: "Войдите в аккаунт, чтобы публиковать в Instagram." }, 401)

    const body = await readJsonBodyLimited<Record<string, unknown>>(request, MAX_BODY_BYTES)
    const imageUrl = String(body?.imageUrl || "").trim()
    const caption = String(body?.caption || "").trim().slice(0, MAX_CAPTION_CHARS)
    const confirmed = body?.confirm === true

    if (!imageUrl) return json({ ok: false, error: "Нужна ссылка на изображение." }, 400)

    let parsed: URL
    try {
      parsed = new URL(imageUrl)
    } catch {
      return json({ ok: false, error: "Ссылка на изображение некорректна." }, 400)
    }
    if (parsed.protocol !== "https:") {
      return json({ ok: false, error: "Instagram скачивает картинку сам, поэтому ссылка должна быть публичной и по https." }, 400)
    }

    const status = await connectionStatus(entitlement.userId)
    if (!status.connected) {
      return json({
        ok: false,
        error: "Instagram не подключён. Откройте /api/instagram/connect и подтвердите доступ в окне Instagram.",
        code: "INSTAGRAM_NOT_CONNECTED",
        connectUrl: "/api/instagram/connect",
      }, 409)
    }

    // The preview. Nothing has been sent to Instagram at this point.
    if (!confirmed) {
      return json({
        ok: true,
        stage: "preview",
        willPostAs: status.username,
        imageUrl,
        caption,
        captionLength: caption.length,
        note: "Ничего не опубликовано. Повторите запрос с confirm: true — после этого пост появится сразу и удалить его через API нельзя.",
      })
    }

    const session = await accessToken(entitlement.userId)
    const creationId = await createMediaContainer({
      accessToken: session.token,
      accountId: session.accountId,
      imageUrl,
      caption,
    })
    const mediaId = await publishMediaContainer({
      accessToken: session.token,
      accountId: session.accountId,
      creationId,
    })
    const permalink = await fetchPermalink(session.token, mediaId)

    return json({
      ok: true,
      stage: "published",
      account: session.username,
      mediaId,
      permalink,
      // A receipt, not a promise: the post exists and this is where it is.
      message: permalink
        ? `Опубликовано в Instagram как @${session.username}: ${permalink}`
        : `Опубликовано в Instagram как @${session.username} (id ${mediaId}).`,
    })
  } catch (error) {
    if (error instanceof InstagramError) return json({ ok: false, error: error.message, code: error.code }, error.status)
    if (error instanceof RequestSafetyError) return json({ ok: false, error: error.message }, error.status)
    console.warn("[MALIK_INSTAGRAM_PUBLISH]", error instanceof Error ? error.message : String(error))
    return json({ ok: false, error: "Не удалось опубликовать в Instagram." }, 503)
  }
}

export async function GET() {
  return Response.json({
    ok: true,
    route: "/api/instagram/publish",
    method: "POST",
    body: { imageUrl: "https://…", caption: "текст", confirm: "true — только после подтверждения человеком" },
  })
}
