/** Retry unsupported capture options, never retry a permission denial. */
export async function requestVoiceMicrophone(
  devices: Pick<MediaDevices, "getUserMedia">,
  audio: MediaTrackConstraints,
  isCurrent: () => boolean = () => true,
): Promise<MediaStream> {
  if (!isCurrent()) throw new DOMException("Voice request cancelled", "AbortError")
  try {
    return await devices.getUserMedia({ audio })
  } catch (error) {
    const name = error && typeof error === "object" && "name" in error ? String(error.name) : ""
    if (!["OverconstrainedError", "ConstraintNotSatisfiedError", "NotSupportedError", "TypeError"].includes(name)) throw error
    // A close/reopen must not produce a second permission prompt for an old session.
    if (!isCurrent()) throw new DOMException("Voice request cancelled", "AbortError")
    return devices.getUserMedia({ audio: true })
  }
}
