import { requireMalikAdminAsync, isMalikAdminEmail } from "@/lib/server/admin"
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/server/supabase-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ProfileRow = {
  id?: string
  email?: string
  display_name?: string
  avatar_url?: string
  plan?: string
  created_at?: string
  updated_at?: string
}

function roleFor(email?: string | null) {
  const clean = String(email || "").trim().toLowerCase()
  if (clean === "amangeldymalik38@gmail.com") return "creator"
  if (isMalikAdminEmail(clean)) return "admin"
  return "user"
}

async function listAuthUsers(client: NonNullable<ReturnType<typeof createSupabaseAdminClient>>) {
  const users: any[] = []
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw error
    const pageUsers = data?.users || []
    users.push(...pageUsers)
    if (pageUsers.length < 100) break
  }
  return users
}

export async function GET(request: Request) {
  const guard = await requireMalikAdminAsync(request)
  if (guard.response) return guard.response

  if (!isSupabaseAdminConfigured()) {
    return Response.json({
      ok: true,
      mode: "service-role-required",
      message: "Set SUPABASE_SERVICE_ROLE_KEY on the server to list every registered user.",
      users: [
        {
          id: "current-admin",
          email: guard.access.email,
          displayName: guard.access.email,
          role: roleFor(guard.access.email),
          plan: "owner",
          provider: guard.access.source,
          createdAt: null,
          lastSignInAt: null,
        },
      ],
    })
  }

  const client = createSupabaseAdminClient()
  if (!client) {
    return Response.json({ ok: false, error: "supabase_admin_unavailable" }, { status: 503 })
  }

  try {
    const [authUsers, profilesResult] = await Promise.all([
      listAuthUsers(client),
      client.from("profiles").select("id,email,display_name,avatar_url,plan,created_at,updated_at"),
    ])

    const profiles = Array.isArray(profilesResult.data) ? profilesResult.data as ProfileRow[] : []
    const profileById = new Map(profiles.filter((p) => p.id).map((p) => [String(p.id), p]))
    const profileByEmail = new Map(profiles.filter((p) => p.email).map((p) => [String(p.email).toLowerCase(), p]))

    const users = authUsers.map((user) => {
      const email = String(user.email || "").toLowerCase()
      const profile = profileById.get(String(user.id)) || profileByEmail.get(email)
      const role = roleFor(email)
      return {
        id: user.id,
        email,
        displayName:
          profile?.display_name ||
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          email.split("@")[0] ||
          "user",
        role,
        plan: role === "creator" || role === "admin" ? "owner" : profile?.plan || "free",
        provider: user.app_metadata?.provider || user.identities?.[0]?.provider || "email",
        providers: Array.isArray(user.identities) ? user.identities.map((item: any) => item.provider).filter(Boolean) : [],
        createdAt: user.created_at || profile?.created_at || null,
        updatedAt: profile?.updated_at || user.updated_at || null,
        lastSignInAt: user.last_sign_in_at || null,
      }
    })

    const knownProfileOnlyUsers = profiles
      .filter((profile) => {
        const email = String(profile.email || "").toLowerCase()
        return email && !users.some((user) => user.email === email)
      })
      .map((profile) => {
        const email = String(profile.email || "").toLowerCase()
        const role = roleFor(email)
        return {
          id: profile.id || email,
          email,
          displayName: profile.display_name || email.split("@")[0],
          role,
          plan: role === "creator" || role === "admin" ? "owner" : profile.plan || "free",
          provider: "profile",
          providers: ["profile"],
          createdAt: profile.created_at || null,
          updatedAt: profile.updated_at || null,
          lastSignInAt: null,
        }
      })

    return Response.json({
      ok: true,
      mode: "supabase-admin",
      count: users.length + knownProfileOnlyUsers.length,
      requestedBy: guard.access.email,
      users: [...users, ...knownProfileOnlyUsers].sort((a, b) => {
        if (a.role === "creator") return -1
        if (b.role === "creator") return 1
        return a.email.localeCompare(b.email)
      }),
      profileSyncError: profilesResult.error?.message || null,
    })
  } catch (error) {
    return Response.json({
      ok: false,
      error: "admin_users_unavailable",
      message: error instanceof Error ? error.message : "Unable to list users.",
    }, { status: 500 })
  }
}
