import { isVerifiedOwner } from "@/lib/auth/admin-policy"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"

export const runtime = "nodejs"

export async function POST() {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return Response.json({ ok: false, error: "secure_session_required" }, { status: 401 })

  const email = user.email.trim().toLowerCase()
  return Response.json({
    ok: true,
    provider: "workos",
    profile: {
      id: user.id,
      email,
      displayName: user.name || [user.firstName, user.lastName].filter(Boolean).join(" ") || email.split("@")[0],
      avatar: user.profilePictureUrl || "",
      role: isVerifiedOwner(user) ? "creator" : "user",
    },
  })
}
