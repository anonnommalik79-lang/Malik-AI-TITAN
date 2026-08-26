import { getWorkOS } from "@workos-inc/authkit-nextjs"
import { isMalikAdminEmail, requireMalikAdminAsync } from "@/lib/server/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function roleFor(email?: string | null) {
  const clean = String(email || "").trim().toLowerCase()
  if (clean === "amangeldymalik38@gmail.com") return "creator"
  return isMalikAdminEmail(clean) ? "admin" : "user"
}

export async function GET(request: Request) {
  const guard = await requireMalikAdminAsync(request)
  if (guard.response) return guard.response

  try {
    const result = await getWorkOS().userManagement.listUsers({ limit: 100 })
    const users = result.data.map((user) => {
      const email = user.email.trim().toLowerCase()
      const role = roleFor(email)
      return {
        id: user.id,
        email,
        displayName: user.name || [user.firstName, user.lastName].filter(Boolean).join(" ") || email.split("@")[0],
        role,
        plan: role === "creator" || role === "admin" ? "owner" : "free",
        provider: "workos",
        providers: ["workos"],
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastSignInAt: user.lastSignInAt,
      }
    })

    return Response.json({
      ok: true,
      mode: "workos-users",
      count: users.length,
      requestedBy: guard.access.email,
      users,
    })
  } catch (error) {
    return Response.json({
      ok: false,
      error: "workos_users_unavailable",
      message: error instanceof Error ? error.message : "Unable to list WorkOS users.",
    }, { status: 503 })
  }
}
