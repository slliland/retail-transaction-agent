import { createClient } from '@supabase/supabase-js'
import { logger } from "@/lib/logger";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Create a dummy client if env vars aren't set (for development without Supabase)
export const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

// GitHub OAuth login
export const signInWithGitHub = async () => {
  if (!supabase) {
    throw new Error('Supabase is not configured. Please add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your .env.local file.')
  }
  
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`
    }
  })
  
  if (error) {
    logger.error('GitHub login error:', error)
    throw error
  }
  
  return data
}

// Google OAuth login
export const signInWithGoogle = async () => {
  if (!supabase) {
    throw new Error('Supabase is not configured. Please add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your .env.local file.')
  }
  
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`
    }
  })
  
  if (error) {
    logger.error('Google login error:', error)
    throw error
  }
  
  return data
}

// Email/Password login
export const signInWithEmail = async (email: string, password: string) => {
  if (!supabase) {
    throw new Error('Supabase is not configured. Please add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your .env.local file.')
  }
  
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  
  if (error) {
    logger.error('Email login error:', error)
    throw error
  }
  
  return data
}

// Email/Password signup
export const signUpWithEmail = async (email: string, password: string) => {
  if (!supabase) {
    throw new Error('Supabase is not configured. Please add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your .env.local file.')
  }
  
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  })
  
  if (error) {
    logger.error('Email signup error:', error)
    throw error
  }
  
  return data
}

// Sign out
export const signOut = async () => {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }
  
  const { error } = await supabase.auth.signOut()
  
  if (error) {
    logger.error('Sign out error:', error)
    throw error
  }
}

// Get current user
export const getCurrentUser = async () => {
  if (!supabase) {
    return null
  }
  
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// Create or update user profile (only called once from ChatInterface)
export const createOrUpdateProfile = async (user: any) => {
  if (!supabase || !user) {
    return null
  }

  try {
    // First, try to find existing profile by user_id
    const { data: existingProfiles, error: selectError } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)

    if (selectError) {
      logger.error('Error checking for existing profiles:', selectError)
      return null
    }

    // If profile(s) exist, update the first one and delete any duplicates
    if (existingProfiles && existingProfiles.length > 0) {
      const profileToKeep = existingProfiles[0]
      
      // Delete any duplicate profiles (keep only the first one)
      if (existingProfiles.length > 1) {
        const duplicateIds = existingProfiles.slice(1).map(p => p.id)
        const { error: deleteError } = await supabase
          .from('profiles')
          .delete()
          .in('id', duplicateIds)
        
        if (deleteError) {
          logger.error('Error deleting duplicate profiles:', deleteError)
        } else {
          logger.log(`🗑️ Deleted ${duplicateIds.length} duplicate profiles`)
        }
      }

      // Update the profile we're keeping
      const { data, error } = await supabase
        .from('profiles')
        .update({
          username: user.user_metadata?.full_name || user.user_metadata?.name || user.email,
          avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture,
          updated_at: new Date().toISOString()
        })
        .eq('id', profileToKeep.id)
        .select()
        .single()

      if (error) {
        logger.error('Error updating profile:', error)
        return null
      }

      logger.log('✅ Profile updated:', data)
      return data
    } 
    // If no profile exists, create a new one
    else {
      const { data, error } = await supabase
        .from('profiles')
        .insert({
          user_id: user.id,
          username: user.user_metadata?.full_name || user.user_metadata?.name || user.email,
          avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single()

      if (error) {
        logger.error('Error creating profile:', error)
        return null
      }

      logger.log('✅ Profile created:', data)
      return data
    }
  } catch (error) {
    logger.error('Error in createOrUpdateProfile:', error)
    return null
  }
}

// Get user profile
export const getUserProfile = async (userId: string) => {
  if (!supabase) {
    return null
  }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error) {
      logger.error('Error fetching profile:', error)
      return null
    }

    return data
  } catch (error) {
    logger.error('Error in getUserProfile:', error)
    return null
  }
}

