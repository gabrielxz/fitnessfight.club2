'use client'

import { useState, useEffect } from 'react'
import { deleteUser, assignBadge, removeBadge, changeDivision } from './actions'
import HabitSummaryGenerator from './HabitSummaryGenerator'
import SummaryParticipantsManager from './SummaryParticipantsManager'
import CompetitionResetSection from './CompetitionResetSection'
import UserDiagnosticsSection from './UserDiagnosticsSection'

interface User {
  user_id: string
  strava_id: string
  display_name: string
  email: string
  has_strava: boolean
  has_division: boolean
  created_at: string
}

interface Badge {
  id: string
  code: string
  name: string
  emoji: string
}

interface Division {
  id: string
  name: string
  level: number
  emoji: string
}

interface UserDivision {
  user_id: string
  division_id: string
}

interface UserBadge {
  id: string
  user_id: string
  badge_id: string
  tier: string
}

interface AdminDashboardProps {
  users: User[]
  badges: Badge[]
  divisions: Division[]
  userDivisions: UserDivision[]
  userBadges: UserBadge[]
}

export default function AdminDashboard({ 
  users, 
  badges, 
  divisions, 
  userDivisions,
  userBadges 
}: AdminDashboardProps) {
  const [selectedUser, setSelectedUser] = useState<string>('')
  const [selectedBadge, setSelectedBadge] = useState<string>('')
  const [selectedTier, setSelectedTier] = useState<'bronze' | 'silver' | 'gold'>('bronze')
  const [selectedDivision, setSelectedDivision] = useState<string>('')
  const [deleteConfirm, setDeleteConfirm] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [notification])

  const getUserDivision = (userId: string) => {
    const userDiv = userDivisions.find(ud => ud.user_id === userId)
    if (userDiv) {
      const division = divisions.find(d => d.id === userDiv.division_id)
      return division ? `${division.emoji || ''} ${division.name || ''}`.trim() : 'Not Assigned'
    }
    return 'Not Assigned'
  }

  const getUserBadges = (userId: string) => {
    return userBadges.filter(ub => ub.user_id === userId)
  }

  const handleDeleteUser = async (userId: string) => {
    if (deleteConfirm !== userId) {
      setDeleteConfirm(userId)
      setTimeout(() => setDeleteConfirm(''), 5000)
      return
    }

    setLoading(true)
    try {
      await deleteUser(userId)
      setNotification({ message: 'User deleted successfully', type: 'success' })
      setTimeout(() => window.location.reload(), 1500)
    } catch (error) {
      console.error('Error deleting user:', error)
      setNotification({ message: 'Failed to delete user', type: 'error' })
    }
    setLoading(false)
    setDeleteConfirm('')
  }

  const handleAssignBadge = async () => {
    if (!selectedUser || !selectedBadge) {
      setNotification({ message: 'Please select a user and badge', type: 'error' })
      return
    }

    setLoading(true)
    try {
      await assignBadge(selectedUser, selectedBadge, selectedTier)
      const user = users.find(u => u.user_id === selectedUser)
      const badge = badges.find(b => b.id === selectedBadge)
      setNotification({ 
        message: `${badge?.emoji} ${badge?.name} (${selectedTier}) assigned to ${user?.display_name}`, 
        type: 'success' 
      })
      setTimeout(() => window.location.reload(), 1500)
    } catch (error) {
      console.error('Error assigning badge:', error)
      setNotification({ message: 'Failed to assign badge', type: 'error' })
    }
    setLoading(false)
  }

  const handleRemoveBadge = async (userBadgeId: string) => {
    setLoading(true)
    try {
      await removeBadge(userBadgeId)
      setNotification({ message: 'Badge removed successfully', type: 'success' })
      setTimeout(() => window.location.reload(), 1500)
    } catch (error) {
      console.error('Error removing badge:', error)
      setNotification({ message: 'Failed to remove badge', type: 'error' })
    }
    setLoading(false)
  }

  const handleChangeDivision = async () => {
    if (!selectedUser || !selectedDivision) {
      setNotification({ message: 'Please select a user and division', type: 'error' })
      return
    }

    setLoading(true)
    try {
      await changeDivision(selectedUser, selectedDivision)
      const user = users.find(u => u.user_id === selectedUser)
      const division = divisions.find(d => d.id === selectedDivision)
      setNotification({ 
        message: `${user?.display_name} moved to ${division?.emoji} ${division?.name}`, 
        type: 'success' 
      })
      setTimeout(() => window.location.reload(), 1500)
    } catch (error) {
      console.error('Error changing division:', error)
      setNotification({ message: 'Failed to change division', type: 'error' })
    }
    setLoading(false)
  }

  return (
    <div className="relative z-10 pt-24 pb-12 px-4 sm:px-6 lg:px-8">
      {/* Notification Toast */}
      {notification && (
        <div
          className={`fixed top-20 right-4 z-50 px-6 py-3 rounded-lg shadow-lg transition-all duration-300 ${
            notification.type === 'success' 
              ? 'bg-green-600 text-white' 
              : 'bg-red-600 text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <span className="font-medium">{notification.message}</span>
          </div>
        </div>
      )}
      
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-8">Admin Dashboard</h1>
        
        {/* User Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="glass-card p-4">
            <div className="text-gray-400 text-sm mb-1">Total Users</div>
            <div className="text-2xl font-bold text-white">{users.length}</div>
          </div>
          <div className="glass-card p-4">
            <div className="text-gray-400 text-sm mb-1">Strava Connected</div>
            <div className="text-2xl font-bold text-green-500">
              {users.filter(u => u.has_strava).length}
            </div>
          </div>
          <div className="glass-card p-4">
            <div className="text-gray-400 text-sm mb-1">Not Connected</div>
            <div className="text-2xl font-bold text-gray-500">
              {users.filter(u => !u.has_strava).length}
            </div>
          </div>
        </div>
        
        {/* User Management Section */}
        <div className="glass-card p-6 mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">User Management</h2>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="pb-3 text-gray-400">Name</th>
                  <th className="pb-3 text-gray-400">Email</th>
                  <th className="pb-3 text-gray-400">Strava</th>
                  <th className="pb-3 text-gray-400">Division</th>
                  <th className="pb-3 text-gray-400">Badges</th>
                  <th className="pb-3 text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.user_id} className="border-b border-white/5">
                    <td className="py-4 text-white">{user.display_name}</td>
                    <td className="py-4 text-gray-300 text-sm">{user.email}</td>
                    <td className="py-4">
                      {user.has_strava ? (
                        <span className="text-green-500" title="Connected">✅</span>
                      ) : (
                        <span className="text-gray-500" title="Not Connected">❌</span>
                      )}
                    </td>
                    <td className="py-4 text-white">
                      {getUserDivision(user.user_id)}
                      {getUserDivision(user.user_id) === 'Not Assigned' && (
                        <button
                          onClick={async () => {
                            // Find bottom division ID (level 1)
                            const bottomDiv = divisions.find(d => d.level === 1)
                            if (bottomDiv) {
                              setLoading(true)
                              try {
                                await changeDivision(user.user_id, bottomDiv.id)
                                setNotification({
                                  message: `${user.display_name} assigned to ${bottomDiv.emoji} ${bottomDiv.name}`,
                                  type: 'success'
                                })
                                setTimeout(() => window.location.reload(), 1500)
                              } catch (error) {
                                console.error('Error assigning to bottom division:', error)
                                setNotification({ message: 'Failed to assign to bottom division', type: 'error' })
                              }
                              setLoading(false)
                            }
                          }}
                          disabled={loading}
                          className="ml-2 text-xs px-2 py-1 bg-orange-600 hover:bg-orange-700 rounded text-white disabled:opacity-50"
                        >
                          Assign to Bottom Division
                        </button>
                      )}
                    </td>
                    <td className="py-4">
                      <div className="flex gap-2 flex-wrap">
                        {getUserBadges(user.user_id).map(ub => {
                          const badge = badges.find(b => b.id === ub.badge_id)
                          if (!badge) return null
                          return (
                            <div key={ub.id} className="group relative">
                              <span className="text-2xl cursor-pointer" title={`${badge.name} (${ub.tier})`}>
                                {badge.emoji}
                              </span>
                              <button
                                onClick={() => handleRemoveBadge(ub.id)}
                                disabled={loading}
                                className="absolute -top-2 -right-2 hidden group-hover:block bg-red-600 text-white rounded-full w-4 h-4 text-xs leading-none"
                              >
                                ×
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </td>
                    <td className="py-4">
                      <button
                        onClick={() => handleDeleteUser(user.user_id)}
                        disabled={loading}
                        className={`px-4 py-2 rounded text-white font-medium transition-colors ${
                          deleteConfirm === user.user_id
                            ? 'bg-red-700 hover:bg-red-800'
                            : 'bg-red-600 hover:bg-red-700'
                        }`}
                      >
                        {deleteConfirm === user.user_id ? 'Confirm Delete?' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Badge Assignment Section */}
        <div className="glass-card p-6 mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">Assign Badge</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="bg-white/10 border border-white/20 rounded px-4 py-2 text-white [&>option]:text-black [&>option]:bg-white"
            >
              <option value="">Select User</option>
              {users.map(user => (
                <option key={user.user_id} value={user.user_id}>
                  {user.display_name}
                </option>
              ))}
            </select>

            <select
              value={selectedBadge}
              onChange={(e) => setSelectedBadge(e.target.value)}
              className="bg-white/10 border border-white/20 rounded px-4 py-2 text-white [&>option]:text-black [&>option]:bg-white"
            >
              <option value="">Select Badge</option>
              {badges.map(badge => (
                <option key={badge.id} value={badge.id}>
                  {badge.emoji} {badge.name}
                </option>
              ))}
            </select>

            <select
              value={selectedTier}
              onChange={(e) => setSelectedTier(e.target.value as 'bronze' | 'silver' | 'gold')}
              className="bg-white/10 border border-white/20 rounded px-4 py-2 text-white [&>option]:text-black [&>option]:bg-white"
            >
              <option value="bronze">Bronze</option>
              <option value="silver">Silver</option>
              <option value="gold">Gold</option>
            </select>

            <button
              onClick={handleAssignBadge}
              disabled={loading}
              className="bg-green-600 hover:bg-green-700 text-white font-medium px-4 py-2 rounded transition-colors"
            >
              Assign Badge
            </button>
          </div>
        </div>

        {/* Division Management Section */}
        <div className="glass-card p-6 mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">Change Division</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="bg-white/10 border border-white/20 rounded px-4 py-2 text-white [&>option]:text-black [&>option]:bg-white"
            >
              <option value="">Select User</option>
              {users.map(user => (
                <option key={user.user_id} value={user.user_id}>
                  {user.display_name}
                </option>
              ))}
            </select>

            <select
              value={selectedDivision}
              onChange={(e) => setSelectedDivision(e.target.value)}
              className="bg-white/10 border border-white/20 rounded px-4 py-2 text-white [&>option]:text-black [&>option]:bg-white"
            >
              <option value="">Select Division</option>
              {divisions.map(division => (
                <option key={division.id} value={division.id}>
                  {division.emoji} {division.name} (Level {division.level})
                </option>
              ))}
            </select>

            <button
              onClick={handleChangeDivision}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded transition-colors"
            >
              Change Division
            </button>
          </div>
        </div>

        {/* WhatsApp Habit Summary Section */}
        <div className="glass-card p-6 mb-8">
          <h2 className="text-2xl font-bold text-white mb-6">WhatsApp Habit Summary</h2>
          <HabitSummaryGenerator />
        </div>

        {/* Summary Participants Management Section */}
        <div className="glass-card p-6 mb-8">
          <h2 className="text-2xl font-bold text-white mb-6">Manage Summary Participants</h2>
          <SummaryParticipantsManager users={users} />
        </div>

        {/* User Diagnostics & Repair Section */}
        <div className="glass-card p-6 mb-8">
          <h2 className="text-2xl font-bold text-white mb-6">🔧 User Diagnostics & Repair</h2>
          <UserDiagnosticsSection users={users} />
        </div>

        {/* Competition Reset Section - DANGER ZONE */}
        <div className="border-4 border-red-600 rounded-lg p-2 bg-red-950/20">
          <div className="bg-gradient-to-r from-red-900/50 to-red-800/50 p-1 rounded">
            <h2 className="text-2xl font-bold text-red-400 text-center mb-2">⚠️ DANGER ZONE ⚠️</h2>
          </div>
          <CompetitionResetSection />
        </div>
      </div>
    </div>
  )
}