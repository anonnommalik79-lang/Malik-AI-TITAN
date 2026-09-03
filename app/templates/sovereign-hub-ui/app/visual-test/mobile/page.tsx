export const metadata = {
  title: "Malik AI Mobile Visual Test",
  robots: { index: false, follow: false },
}

export default function MobileVisualTestPage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        margin: 0,
        background: "#000",
      }}
    >
      <iframe
        title="Malik AI mobile guest preview"
        src="/guest"
        width="430"
        height="739"
        style={{
          display: "block",
          width: 430,
          height: 739,
          border: 0,
          background: "#000",
          colorScheme: "dark",
        }}
      />
    </main>
  )
}
