'use client'

import { useState, useEffect } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallPrompt() {
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [showInstallPrompt, setShowInstallPrompt] = useState(false)
  const [showIOSInstructions, setShowIOSInstructions] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    // Check if iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window)
    setIsIOS(isIOSDevice)

    // Check if already installed
    const isInStandaloneMode = 
      window.matchMedia('(display-mode: standalone)').matches ||
      ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true)

    setIsStandalone(isInStandaloneMode)

    // Check if user previously dismissed
    const dismissed = localStorage.getItem('pwa-install-dismissed')
    const dismissedTime = dismissed ? parseInt(dismissed) : 0
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000)

    // Show iOS instructions if iOS, not installed, and not recently dismissed
    if (isIOSDevice && !isInStandaloneMode && dismissedTime < oneDayAgo) {
      setShowIOSInstructions(true)
    }

    // Handle install prompt for other browsers
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      
      // Show prompt if not recently dismissed
      if (dismissedTime < oneDayAgo) {
        setShowInstallPrompt(true)
      }
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    // Handle successful installation
    window.addEventListener('appinstalled', () => {
      setShowInstallPrompt(false)
      setDeferredPrompt(null)
    })

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [])

  const handleInstallClick = async () => {
    if (!deferredPrompt) return

    // Show the install prompt
    await deferredPrompt.prompt()

    // Wait for the user's response
    const { outcome } = await deferredPrompt.userChoice

    if (outcome === 'accepted') {
      console.log('User accepted the install prompt')
    } else {
      console.log('User dismissed the install prompt')
    }

    // Clear the deferred prompt
    setDeferredPrompt(null)
    setShowInstallPrompt(false)
  }

  const handleDismiss = () => {
    localStorage.setItem('pwa-install-dismissed', Date.now().toString())
    setShowInstallPrompt(false)
    setShowIOSInstructions(false)
  }

  // Don't show anything if already installed
  if (isStandalone) return null

  // iOS Instructions
  if (isIOS && showIOSInstructions) {
    return (
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-4 z-50 animate-slide-up">
        <div className="max-w-md mx-auto bg-gray-900/95 backdrop-blur-sm rounded-lg p-4 border border-gray-800">
          <div className="flex items-start justify-between mb-3">
            <h3 className="text-white font-semibold">Install Fitness Fight Club</h3>
            <button
              onClick={handleDismiss}
              className="text-gray-400 hover:text-white transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <p className="text-gray-300 text-sm mb-4">
            Install the app for quick access to your fitness stats
          </p>

          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center">
                <span className="text-blue-400">1</span>
              </div>
              <div className="flex items-center gap-2 text-gray-300">
                <span>Tap the share button</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img 
                  src="/ios-share-icon.png" 
                  alt="iOS Share" 
                  className="w-5 h-5 inline-block"
                  style={{ filter: 'invert(60%) sepia(100%) saturate(500%) hue-rotate(190deg)' }}
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center">
                <span className="text-blue-400">2</span>
              </div>
              <div className="text-gray-300">
                Scroll down and tap &quot;Add to Home Screen&quot;
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center">
                <span className="text-blue-400">3</span>
              </div>
              <div className="text-gray-300">
                Tap &quot;Add&quot; to install
              </div>
            </div>
          </div>

          <button
            onClick={handleDismiss}
            className="w-full mt-4 py-2 text-gray-400 text-sm hover:text-white transition-colors"
          >
            Maybe later
          </button>
        </div>
      </div>
    )
  }

  // Android/Desktop Install Prompt
  if (showInstallPrompt && deferredPrompt) {
    return (
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-4 z-50 animate-slide-up">
        <div className="max-w-md mx-auto bg-gray-900/95 backdrop-blur-sm rounded-lg p-4 border border-gray-800">
          <div className="flex items-start gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src="/android-chrome-192x192.png" 
              alt="FFC Logo" 
              className="w-12 h-12 rounded-lg"
            />
            <div className="flex-1">
              <h3 className="text-white font-semibold mb-1">Install Fitness Fight Club</h3>
              <p className="text-gray-300 text-sm mb-3">
                Get quick access to your fitness stats and compete with friends
              </p>
              
              <div className="flex gap-2">
                <button
                  onClick={handleInstallClick}
                  className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-lg font-medium transition-colors"
                >
                  Install App
                </button>
                <button
                  onClick={handleDismiss}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 px-4 rounded-lg font-medium transition-colors"
                >
                  Not Now
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return null
}