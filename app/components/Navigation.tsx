'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { User } from '@supabase/supabase-js'

interface NavigationProps {
  user: User | {
    email?: string | null
    user_metadata?: {
      full_name?: string
      name?: string
    }
  }
}

export default function Navigation({ user }: NavigationProps) {
  const pathname = usePathname()
  
  const navItems = [
    { href: '/dashboard', label: 'Leaderboard', icon: '🏆' },
    { href: '/profile', label: 'Profile', icon: '👤' },
    { href: '/stats', label: 'Stats', icon: '📊' },
    { href: '/history', label: 'History', icon: '📜' },
  ]
  
  const userEmail = 'email' in user && user.email ? user.email : 'User'
  const userName = user.user_metadata?.full_name || user.user_metadata?.name || userEmail
  
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
            <Link href="/dashboard" className="flex items-center gap-2 group">
              <span className="text-2xl">⚔️</span>
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
            <div className="glass-card px-4 py-2 flex items-center gap-3">
              <span className="text-sm text-gray-300">{userName}</span>
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-yellow-500 flex items-center justify-center text-white font-bold text-sm">
                {userName[0].toUpperCase()}
              </div>
            </div>
            
            <form action="/auth/signout" method="POST">
              <button
                type="submit"
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      </div>
    </nav>
  )
}