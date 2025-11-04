import { supabase } from './supabase';

export interface ChatSession {
  id: string;
  user_id?: string;
  title?: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  created_at: string;
}

// Create a new chat session
export async function createChatSession(userId: string, title: string = 'New Chat'): Promise<string | null> {
  try {
    if (!supabase) {
      console.error('❌ Supabase client not initialized');
      return null;
    }
    
    console.log('🔧 Creating session for user:', userId);
    
    const { data, error } = await supabase
      .from('sessions')
      .insert({ user_id: userId })
      .select('id')
      .single();

    if (error) {
      console.error('❌ Error creating session:', error);
      return null;
    }

    console.log('✅ Session created successfully:', data.id);
    return data.id;
  } catch (error) {
    console.error('❌ Exception creating session:', error);
    return null;
  }
}

// Get all sessions for a user
export async function getUserSessions(userId: string): Promise<ChatSession[]> {
  try {
    if (!supabase) {
      console.error('❌ Supabase client not initialized');
      return [];
    }
    
    console.log('🔍 Fetching sessions for user:', userId);
    
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching sessions:', error);
      return [];
    }

    console.log('✅ Found sessions:', data?.length || 0, 'sessions');
    return data || [];
  } catch (error) {
    console.error('❌ Exception fetching sessions:', error);
    return [];
  }
}

// Get messages for a session
export async function getSessionMessages(sessionId: string): Promise<ChatMessage[]> {
  try {
    if (!supabase) {
      console.error('❌ Supabase client not initialized');
      return [];
    }
    
    console.log('🔍 getSessionMessages: Fetching messages for session:', sessionId);
    console.log('🔍 getSessionMessages: Session ID type:', typeof sessionId);
    console.log('🔍 getSessionMessages: Session ID length:', sessionId?.length);
    
    // Check if sessionId is a valid UUID format (temporarily disabled for debugging)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(sessionId)) {
      console.warn('⚠️ Session ID format warning:', sessionId, 'but continuing anyway...');
      // return []; // Temporarily disabled
    }
    
    // First, let's check if the session exists
    console.log('🔍 getSessionMessages: Checking if session exists...');
    const { data: sessionCheck, error: sessionError } = await supabase
      .from('sessions')
      .select('id')
      .eq('id', sessionId)
      .single();
    
    if (sessionError) {
      console.error('❌ Session check error:', sessionError);
    } else {
      console.log('✅ Session exists:', sessionCheck);
    }
    
    // Now try to get messages
    console.log('🔍 getSessionMessages: Fetching messages...');
    const { data, error } = await supabase
      .from('messages')
      .select('id, session_id, role, content, sources, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('❌ Error fetching messages:', error);
      console.error('❌ Error details:', JSON.stringify(error, null, 2));
      return [];
    }

    console.log('✅ getSessionMessages: Found messages:', data?.length || 0);
    console.log('✅ getSessionMessages: Raw messages data:', data);
    return data || [];
  } catch (error) {
    console.error('❌ Exception fetching messages:', error);
    return [];
  }
}

// Save a message to the database
export async function saveMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  sources?: string[]
): Promise<boolean> {
  try {
    if (!supabase) {
      console.error('❌ Supabase client not initialized');
      return false;
    }
    
    console.log('💾 saveMessage: Saving message with sources:', sources);
    
    const messageData: any = {
      session_id: sessionId,
      role: role,
      content: content
    };
    
    // Only add sources if they exist and it's an assistant message
    if (sources && sources.length > 0 && role === 'assistant') {
      messageData.sources = sources;
    }
    
    const { error } = await supabase
      .from('messages')
      .insert(messageData);

    if (error) {
      console.error('❌ Error saving message:', error);
      return false;
    }

    console.log('✅ Message saved successfully with sources');
    return true;
  } catch (error) {
    console.error('❌ Exception saving message:', error);
    return false;
  }
}

// Update session title
export async function updateSessionTitle(sessionId: string, title: string): Promise<boolean> {
  try {
    if (!supabase) {
      console.error('❌ Supabase client not initialized');
      return false;
    }
    
    const { error } = await supabase
      .from('sessions')
      .update({ title: title })
      .eq('id', sessionId);

    if (error) {
      console.error('Error updating session title:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error updating session title:', error);
    return false;
  }
}

// Delete a session and all its messages
export async function deleteSession(sessionId: string): Promise<boolean> {
  try {
    if (!supabase) {
      console.error('❌ Supabase client not initialized');
      return false;
    }
    
    // First delete all messages
    const { error: messagesError } = await supabase
      .from('messages')
      .delete()
      .eq('session_id', sessionId);

    if (messagesError) {
      console.error('Error deleting messages:', messagesError);
      return false;
    }

    // Then delete the session
    const { error: sessionError } = await supabase
      .from('sessions')
      .delete()
      .eq('id', sessionId);

    if (sessionError) {
      console.error('Error deleting session:', sessionError);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error deleting session:', error);
    return false;
  }
}
