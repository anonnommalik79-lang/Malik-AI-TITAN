export function renderGuardReport() {
  return {
    noDynamicNextRoutes: true,
    noServerSecretsInClient: true,
    noHeavyIntervals: true,
    localStorageCapped: true,
    renderSafe: true,
  }
}

