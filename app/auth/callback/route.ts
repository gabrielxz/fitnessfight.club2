import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Check if user needs to be re-initialized after deletion
      const { data: { user } } = await supabase.auth.getUser()
      
      if (user) {
        // Save or update user profile
        const { error: profileError } = await supabase
          .from('user_profiles')
          .upsert({
            id: user.id,
            email: user.email,
            full_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
            avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
            updated_at: new Date().toISOString()
          })
        
        if (profileError) {
          console.error('Error saving user profile:', profileError)
        }
        
        // Check if user has a division assignment
        const { data: userDivision } = await supabase
          .from('user_divisions')
          .select('*')
          .eq('user_id', user.id)
          .single()
        
        if (!userDivision) {
          // User was deleted and is signing in again - assign them to Noodle division
          const { data: noodleDivision } = await supabase
            .from('divisions')
            .select('id')
            .eq('name', 'Noodle')
            .single()
          
          if (noodleDivision) {
            await supabase
              .from('user_divisions')
              .insert({
                user_id: user.id,
                division_id: noodleDivision.id,
                joined_division_at: new Date().toISOString()
              })
          }
        }
      }
      
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}