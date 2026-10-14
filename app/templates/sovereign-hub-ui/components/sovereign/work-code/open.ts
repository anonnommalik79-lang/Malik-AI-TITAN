export const WORK_CODE_OPEN_EVENT = "malik-work-code-open"

/** Opens the Malik Work Code Studio (mounted once by the dashboard). */
export function openWorkCode() {
  window.dispatchEvent(new CustomEvent(WORK_CODE_OPEN_EVENT))
}
