export async function GET(request: Request) {
  const assetUrl = new URL("/images/malik-mobile-home-exact.b64", request.url)
  const source = await fetch(assetUrl, { cache: "no-store" })
  if (!source.ok) return new Response("Not found", { status: 404 })

  const base64 = (await source.text()).trim()
  const binary = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))

  return new Response(binary, {
    headers: {
      "Content-Type": "image/avif",
      "Cache-Control": "public, max-age=300, must-revalidate",
      "X-Malik-Mobile-Reference": "exact-8k-v2",
    },
  })
}
