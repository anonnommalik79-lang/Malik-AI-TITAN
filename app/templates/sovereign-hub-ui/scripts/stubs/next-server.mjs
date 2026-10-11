// Stand-in for next/server in verification scripts: `after()` work is
// collected so a test can await it the way Next.js does after a response.
export const afterTasks = []
export function after(task) {
  afterTasks.push(Promise.resolve().then(typeof task === "function" ? task : () => task))
}
globalThis.__malikAfterTasks = afterTasks
