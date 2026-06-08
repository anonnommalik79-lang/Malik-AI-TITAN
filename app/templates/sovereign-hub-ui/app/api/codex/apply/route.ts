export const runtime = "nodejs"

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const selectedFiles = Array.isArray(body.selectedFiles) ? body.selectedFiles : []

  return Response.json({
    ok: true,
    message: "Apply preview ready. Server refuses destructive writes from the browser by design.",
    selectedFiles,
  })
}

