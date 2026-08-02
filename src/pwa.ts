import { registerSW } from 'virtual:pwa-register'

export const registerPwa = () => {
  const pwaEnabled = import.meta.env.VITE_ENABLE_PWA === 'true'
  if (!pwaEnabled) {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
          void registration.unregister()
        })
      })
    }

    return
  }

  registerSW({
    immediate: true,
    onOfflineReady() {
      console.info('Disc Golf app is ready for offline use.')
    },
  })
}
