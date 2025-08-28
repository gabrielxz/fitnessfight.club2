# Release 2: UI Redesign - Dark Theme & Glassmorphism

## Overview
This release transforms the Fitness Fight Club UI to match the provided mockup design. The new interface features a dark theme with glassmorphism effects, gradient accents, animated backgrounds, and a modern card-based layout for displaying division standings. The UI emphasizes the competitive aspect with clear promotion/relegation zones and visual hierarchy.

## Design System

### Color Palette
```css
:root {
  --primary: #FF6B35;
  --secondary: #F7931E;
  --dark: #1A1A2E;
  --darker: #0F0F1E;
  --light: #EAEAEA;
  --success: #00D9A3;
  --warning: #FFB800;
  --danger: #FF3E6C;
  --glass: rgba(255, 255, 255, 0.05);
  --glass-border: rgba(255, 255, 255, 0.1);
  --gold: #FFD700;
  --silver: #C0C0C0;
  --bronze: #CD7F32;
}
```

### Typography
- Font: System font stack (-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, etc.)
- Headings: Bold (700-900)
- Body: Regular (400-500)

## Key UI Components to Build

### 1. Update Global Styles (`app/globals.css`)

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --primary: #FF6B35;
  --secondary: #F7931E;
  --dark: #1A1A2E;
  --darker: #0F0F1E;
  --light: #EAEAEA;
  --success: #00D9A3;
  --warning: #FFB800;
  --danger: #FF3E6C;
  --glass: rgba(255, 255, 255, 0.05);
  --glass-border: rgba(255, 255, 255, 0.1);
}

body {
  background: linear-gradient(135deg, #0F0F1E 0%, #1A1A2E 50%, #2A1A3E 100%);
  min-height: 100vh;
  color: white;
}

@layer components {
  .glass-card {
    @apply backdrop-blur-md border border-white/10 rounded-2xl;
    background: rgba(255, 255, 255, 0.05);
  }
  
  .gradient-text {
    @apply font-bold;
    background: linear-gradient(135deg, #FF6B35, #F7931E);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  
  .btn-primary {
    @apply px-6 py-3 rounded-full font-semibold transition-all duration-300;
    background: linear-gradient(135deg, #FF6B35, #F7931E);
    box-shadow: 0 5px 15px rgba(255, 107, 53, 0.3);
  }
  
  .btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 25px rgba(255, 107, 53, 0.4);
  }
  
  .zone-promotion {
    @apply px-3 py-1 rounded-full text-xs font-semibold;
    background: rgba(0, 217, 163, 0.2);
    color: #00D9A3;
    border: 1px solid rgba(0, 217, 163, 0.3);
  }
  
  .zone-relegation {
    @apply px-3 py-1 rounded-full text-xs font-semibold;
    background: rgba(255, 62, 108, 0.2);
    color: #FF3E6C;
    border: 1px solid rgba(255, 62, 108, 0.3);
  }
  
  .zone-safe {
    @apply px-3 py-1 rounded-full text-xs font-semibold;
    background: rgba(255, 255, 255, 0.05);
    color: #888;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
}
```

### 2. Create Animated Background Component (`app/components/AnimatedBackground.tsx`)

```tsx
'use client'

import { useEffect, useRef } from 'react'

export default function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    
    const particles: Particle[] = []
    const particleCount = 30
    
    class Particle {
      x: number
      y: number
      size: number
      speedX: number
      speedY: number
      opacity: number
      
      constructor() {
        this.x = Math.random() * canvas.width
        this.y = Math.random() * canvas.height
        this.size = Math.random() * 3 + 1
        this.speedX = Math.random() * 0.5 - 0.25
        this.speedY = -Math.random() * 0.5 - 0.1
        this.opacity = Math.random() * 0.3 + 0.1
      }
      
      update() {
        this.x += this.speedX
        this.y += this.speedY
        
        if (this.y < 0) {
          this.y = canvas.height
          this.x = Math.random() * canvas.width
        }
      }
      
      draw() {
        ctx.fillStyle = `rgba(255, 107, 53, ${this.opacity})`
        ctx.beginPath()
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    
    for (let i = 0; i < particleCount; i++) {
      particles.push(new Particle())
    }
    
    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      
      particles.forEach(particle => {
        particle.update()
        particle.draw()
      })
      
      requestAnimationFrame(animate)
    }
    
    animate()
    
    const handleResize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  
  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none opacity-50"
      style={{ zIndex: 0 }}
    />
  )
}
```

### 3. Redesigned Navigation Component (`app/components/Navigation.tsx`)

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavigationProps {
  user: {
    email: string
    name?: string
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
  
  return (
    <nav className="fixed top-0 w-full backdrop-blur-xl bg-slate-900/70 border-b border-white/10 z-50">
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
              <span className="text-sm text-gray-300">{user.email}</span>
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-yellow-500 flex items-center justify-center text-white font-bold text-sm">
                {user.email[0].toUpperCase()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>
  )
}
```

### 4. Division Selector Component (`app/dashboard/DivisionSelector.tsx`)

```tsx
'use client'

import { useState } from 'react'

interface DivisionSelectorProps {
  currentDivision: {
    name: string
    level: number
  }
  onViewChange: (view: 'division' | 'global') => void
}

const divisionIcons = {
  'Bronze': '🥉',
  'Silver': '🥈', 
  'Gold': '🥇',
  'Platinum': '💎',
  'Diamond': '💠',
  'Champion': '👑'
}

export default function DivisionSelector({ currentDivision, onViewChange }: DivisionSelectorProps) {
  const [activeView, setActiveView] = useState<'division' | 'global'>('division')
  
  const handleViewChange = (view: 'division' | 'global') => {
    setActiveView(view)
    onViewChange(view)
  }
  
  return (
    <div className="glass-card p-6 mb-8">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center text-3xl shadow-lg">
            {divisionIcons[currentDivision.name] || '🏆'}
          </div>
          <div>
            <h2 className="text-2xl font-bold gradient-text">
              {currentDivision.name} Division
            </h2>
            <p className="text-gray-400 text-sm mt-1">
              Your competitive group • Top 1 advances • Bottom 1 drops
            </p>
          </div>
        </div>
        
        <div className="flex bg-white/5 rounded-full p-1">
          <button
            onClick={() => handleViewChange('division')}
            className={`px-6 py-2 rounded-full text-sm font-semibold transition-all ${
              activeView === 'division'
                ? 'bg-gradient-to-r from-orange-500 to-yellow-500 text-white shadow-lg'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            My Division
          </button>
          <button
            onClick={() => handleViewChange('global')}
            className={`px-6 py-2 rounded-full text-sm font-semibold transition-all ${
              activeView === 'global'
                ? 'bg-gradient-to-r from-orange-500 to-yellow-500 text-white shadow-lg'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Global
          </button>
        </div>
      </div>
    </div>
  )
}
```

### 5. Athlete Card Component (`app/dashboard/AthleteCard.tsx`)

```tsx
interface AthleteCardProps {
  rank: number
  name: string
  points: number
  hours: number
  zone: 'promotion' | 'safe' | 'relegation'
  isCurrentUser?: boolean
  badges?: Array<{ emoji: string; tier: 'gold' | 'silver' | 'bronze' }>
}

export default function AthleteCard({
  rank,
  name,
  points,
  hours,
  zone,
  isCurrentUser = false,
  badges = []
}: AthleteCardProps) {
  const cardClasses = {
    1: 'border-yellow-500/30 bg-gradient-to-br from-yellow-500/5 to-transparent',
    2: 'border-gray-300/30 bg-gradient-to-br from-gray-300/5 to-transparent',
    3: 'border-orange-600/30 bg-gradient-to-br from-orange-600/5 to-transparent',
  }
  
  const rankEmojis = { 1: '🏆', 2: '🥈', 3: '🥉' }
  
  return (
    <div className={`
      glass-card p-6 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl
      ${cardClasses[rank] || ''}
      ${isCurrentUser ? 'ring-2 ring-orange-500/50' : ''}
    `}>
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className={`
            w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold
            ${rank <= 3 ? 'bg-gradient-to-br from-yellow-500 to-orange-500' : 'bg-white/10'}
          `}>
            {rankEmojis[rank] || name.split(' ').map(n => n[0]).join('')}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-lg">
                {isCurrentUser ? 'You' : name}
              </h3>
              {zone === 'promotion' && <span className="zone-promotion">↑ Promotion Zone</span>}
              {zone === 'relegation' && <span className="zone-relegation">↓ Danger Zone</span>}
              {zone === 'safe' && <span className="zone-safe">Safe Zone</span>}
            </div>
          </div>
        </div>
        <div className="text-3xl font-black text-white/20">
          #{rank}
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-white/5 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-orange-500">{points.toFixed(2)}</div>
          <div className="text-xs text-gray-400 mt-1">Points</div>
        </div>
        <div className="bg-white/5 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-orange-500">{hours.toFixed(2)}h</div>
          <div className="text-xs text-gray-400 mt-1">This Week</div>
        </div>
      </div>
      
      {badges.length > 0 && (
        <div>
          <div className="text-xs text-gray-400 mb-2">Achievements</div>
          <div className="flex flex-wrap gap-2">
            {badges.map((badge, idx) => (
              <div key={idx} className="relative group">
                <span className="text-2xl filter drop-shadow-lg transition-transform group-hover:scale-125">
                  {badge.emoji}
                </span>
                <div className={`
                  absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-900
                  ${badge.tier === 'gold' ? 'bg-gradient-to-br from-yellow-400 to-yellow-600' : ''}
                  ${badge.tier === 'silver' ? 'bg-gradient-to-br from-gray-300 to-gray-500' : ''}
                  ${badge.tier === 'bronze' ? 'bg-gradient-to-br from-orange-600 to-orange-800' : ''}
                `} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

### 6. Updated Dashboard Layout (`app/dashboard/page.tsx`)

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AnimatedBackground from '@/app/components/AnimatedBackground'
import Navigation from '@/app/components/Navigation'
import DivisionSelector from './DivisionSelector'
import DivisionLeaderboard from './DivisionLeaderboard'
import WeekProgress from './WeekProgress'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) redirect('/login')
  
  // Fetch user division and stats
  const { data: userDivision } = await supabase
    .from('user_divisions')
    .select('*, division:divisions(*)')
    .eq('user_id', user.id)
    .single()
  
  return (
    <div className="min-h-screen relative">
      <AnimatedBackground />
      <Navigation user={user} />
      
      <main className="relative z-10 pt-24 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-12 animate-fade-in">
            <h1 className="text-5xl lg:text-7xl font-black mb-4">
              <span className="gradient-text">Fitness Fight Club</span>
            </h1>
            <p className="text-gray-400 text-lg">Compete. Conquer. Champion.</p>
            <div className="inline-flex items-center gap-2 mt-4 px-4 py-2 glass-card">
              <span>📅</span>
              <span className="text-sm text-gray-300">
                Week {getWeekNumber()} of {new Date().getFullYear()}
              </span>
            </div>
          </div>
          
          {/* Division Selector */}
          <DivisionSelector 
            currentDivision={userDivision?.division || { name: 'Bronze', level: 1 }}
            onViewChange={(view) => console.log('View changed to:', view)}
          />
          
          {/* Leaderboard */}
          <DivisionLeaderboard userId={user.id} />
          
          {/* Week Progress */}
          <WeekProgress />
        </div>
      </main>
    </div>
  )
}

function getWeekNumber() {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 1)
  const diff = now.getTime() - start.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24 * 7))
}
```

### 7. Week Progress Component (`app/dashboard/WeekProgress.tsx`)

```tsx
'use client'

import { useEffect, useState } from 'react'

export default function WeekProgress() {
  const [daysRemaining, setDaysRemaining] = useState(0)
  const [progress, setProgress] = useState(0)
  
  useEffect(() => {
    const now = new Date()
    const sunday = new Date()
    sunday.setDate(sunday.getDate() - sunday.getDay() + 7)
    sunday.setHours(23, 59, 59, 999)
    
    const msRemaining = sunday.getTime() - now.getTime()
    const days = Math.ceil(msRemaining / (1000 * 60 * 60 * 24))
    setDaysRemaining(days)
    
    // Calculate week progress (0-100%)
    const weekStart = new Date()
    weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    weekStart.setHours(0, 0, 0, 0)
    
    const weekDuration = 7 * 24 * 60 * 60 * 1000
    const elapsed = now.getTime() - weekStart.getTime()
    setProgress((elapsed / weekDuration) * 100)
  }, [])
  
  return (
    <div className="glass-card p-6 mt-8">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold">Division Competition Progress</h3>
        <span className="text-gray-400 text-sm">
          {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} remaining
        </span>
      </div>
      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-orange-500 to-yellow-500 rounded-full transition-all duration-1000"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}
```

## Mobile Responsiveness

### Tailwind Config Updates (`tailwind.config.ts`)
Ensure responsive breakpoints are properly configured:

```typescript
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in',
        'slide-up': 'slideUp 0.5s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(30px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
```

## Implementation Steps

1. **Install Dependencies** (if needed)
   ```bash
   npm install framer-motion  # Optional for advanced animations
   ```

2. **Update Root Layout** (`app/layout.tsx`)
   - Apply dark background
   - Add AnimatedBackground component
   - Update font settings

3. **Replace Components**
   - Replace existing navigation with new Navigation component
   - Update dashboard page with new layout
   - Replace weekly stats with new card designs

4. **Test Responsive Design**
   - Mobile (< 640px)
   - Tablet (640px - 1024px)
   - Desktop (> 1024px)

5. **Performance Optimization**
   - Lazy load heavy components
   - Optimize animation performance
   - Add loading states with skeleton screens

## Testing Checklist

- [ ] Dark theme applies correctly
- [ ] Glass morphism effects visible
- [ ] Animated background particles render
- [ ] Navigation responsive on all screen sizes
- [ ] Division selector toggles between views
- [ ] Athlete cards display with correct styling
- [ ] Promotion/relegation zones have correct colors
- [ ] Hover effects work on interactive elements
- [ ] Mobile menu functions correctly
- [ ] Page transitions smooth
- [ ] All gradients render correctly
- [ ] Badge tiers display with correct colors

## Browser Compatibility
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Performance Considerations
- Use CSS transforms for animations (GPU accelerated)
- Limit particle count on mobile devices
- Implement virtual scrolling for long leaderboards
- Use Next.js Image component for avatars
- Implement proper loading states

## Accessibility
- Ensure sufficient color contrast (WCAG AA)
- Add proper ARIA labels
- Keyboard navigation support
- Screen reader compatible
- Reduced motion support for animations