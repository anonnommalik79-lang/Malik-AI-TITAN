// Account-scoped admission lock. Rejected contenders never receive a release function.
export function createUserLock() {
  const running = new Set();
  return {
    acquire(scope) {
      if (running.has(scope)) return null;
      running.add(scope);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        running.delete(scope);
      };
    },
    size() { return running.size; },
  };
}
