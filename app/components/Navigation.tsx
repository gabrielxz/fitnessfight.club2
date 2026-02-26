'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { User } from '@supabase/supabase-js'
import { useState } from 'react'
import { createClient as createBrowserSupabase } from '@/lib/supabase/client'

interface NavigationProps {
  user: User | null
}

export default function Navigation({ user }: NavigationProps) {
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const supabase = createBrowserSupabase()

  // Check if user is admin
  const isAdmin = user?.email === 'gabrielbeal@gmail.com' || 
                  user?.user_metadata?.full_name === 'Gabriel Beal' ||
                  user?.user_metadata?.name === 'Gabriel Beal'

  const navItems = [
    { href: '/', label: 'Leaderboard', icon: '🏆' },
    { href: '/rivalries', label: 'Rivalries', icon: '⚔️' },
    { href: '/faq', label: 'FAQ', icon: '📖' },
    ...(user ? [
      { href: '/habits', label: 'Habits', icon: '✅' },
      { href: '/profile', label: 'Profile', icon: '👤' },
      { href: '/stats', label: 'Stats', icon: '📊' },
      { href: '/history', label: 'History', icon: '📜' },
      ...(isAdmin ? [{ href: '/admin', label: 'Admin', icon: '⚙️' }] : [])
    ] : [])
  ]

  const userEmail = user?.email || 'User'
  const userName = user?.user_metadata?.full_name || user?.user_metadata?.name || userEmail

  return (
    <nav className="fixed top-0 w-full border-b z-50" style={{ 
      backgroundColor: 'rgba(15, 23, 42, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.1)',
      backdropFilter: 'blur(20px)', 
      WebkitBackdropFilter: 'blur(20px)' 
    }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2 group">
              <Image
                src="/favicon-32x32.png"
                alt="FFC Logo"
                width={32}
                height={32}
                className="group-hover:scale-110 transition-transform"
              />
              <span className="text-xl font-black gradient-text group-hover:scale-105 transition-transform">
                FFC
              </span>
            </Link>
            
            <div className="hidden md:flex items-center gap-6">
              {navItems.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors relative ${
                    pathname === item.href
                      ? 'text-orange-500'
                      : 'text-gray-300 hover:text-white'
                  }`}
                >
                  <span>{item.icon}</span>
                  {item.label}
                  {pathname === item.href && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-orange-500 to-yellow-500" />
                  )}
                </Link>
              ))}
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-white"
            >
              <span className="sr-only">Open main menu</span>
              {mobileMenuOpen ? (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
            {user ? (
              <>
                <div className="glass-card px-4 py-2 flex items-center gap-3">
                  <span className="text-sm text-gray-300">{userName}</span>
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-yellow-500 flex items-center justify-center text-white font-bold text-sm">
                    {userName[0].toUpperCase()}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Sign out"
                  onClick={async () => {
                    if (signingOut) return
                    setSigningOut(true)
                    try {
                      await supabase.auth.signOut()
                    } catch (e) {
                      // no-op: fall through to redirect regardless
                    } finally {
                      // Use hard redirect to avoid any SW cache oddities
                      window.location.href = '/login'
                    }
                  }}
                  className={`text-gray-400 hover:text-white transition-colors ${signingOut ? 'opacity-60 cursor-not-allowed' : ''}`}
                  disabled={signingOut}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </div>
      
      {/* Mobile menu dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t" style={{ 
          borderColor: 'rgba(255, 255, 255, 0.1)',
          backgroundColor: 'rgba(15, 23, 42, 0.95)'
        }}>
          <div className="px-2 pt-2 pb-3 space-y-1">
            {navItems.map(item => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-3 py-2 rounded-md text-base font-medium transition-colors ${
                  pathname === item.href
                    ? 'text-orange-500 bg-gray-800'
                    : 'text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
              >
                <span className="mr-2">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  )
}
