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
          // New user or deleted user signing in - assign them to bottom division
          console.log(`No division found for user ${user.id}, assigning to bottom division (level 1)`)

          const { data: bottomDivision, error: divError } = await supabase
            .from('divisions')
            .select('id')
            .eq('level', 1)
            .single()

          if (divError) {
            console.error('Error fetching bottom division:', divError)
          }

          if (bottomDivision) {
            const { error: insertError } = await supabase
              .from('user_divisions')
              .insert({
                user_id: user.id,
                division_id: bottomDivision.id,
                joined_division_at: new Date().toISOString()
              })

            if (insertError) {
              console.error('Error assigning user to division:', insertError)
            } else {
              console.log(`Successfully assigned user ${user.id} to bottom division (level 1)`)
            }
          }
        }
      }
      
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}