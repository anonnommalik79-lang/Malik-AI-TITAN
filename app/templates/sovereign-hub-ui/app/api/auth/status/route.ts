import { isMalikAdminEmail } from "@/lib/server/admin"
import { getOptionalWorkOSAuth, isWorkOSConfigured } from "@/lib/auth/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const auth = await getOptionalWorkOSAuth()
  const user = auth.user

  if (!user) {
    return Response.json({ ok: true, configured: isWorkOSConfigured(), authenticated: false, user: null })
  }

  const email = user.email.trim().toLowerCase()
  return Response.json({
    ok: true,
    configured: true,
    authenticated: true,
    sessionId: auth.sessionId,
    user: {
      id: user.id,
      email,
      name: user.name || [user.firstName, user.lastName].filter(Boolean).join(" ") || email.split("@")[0],
      avatar: user.profilePictureUrl || "",
      emailVerified: user.emailVerified,
      isAdmin: isMalikAdminEmail(email),
      role: email === "amangeldymalik38@gmail.com" ? "creator" : isMalikAdminEmail(email) ? "admin" : "user",
    },
  })
}
