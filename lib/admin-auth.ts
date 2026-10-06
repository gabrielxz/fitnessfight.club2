import type { User } from '@supabase/supabase-js'

export const ADMIN_EMAIL = 'gabrielbeal@gmail.com'

/**
 * Admin is decided by the verified account email only. user_metadata (full_name,
 * name) is writable by the user through supabase.auth.updateUser, so it must
 * never grant admin access.
 */
export function isAdminUser<T extends Pick<User, 'email'>>(user: T | null | undefined): user is T {
  return user?.email === ADMIN_EMAIL
}
