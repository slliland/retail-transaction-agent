"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import TopNav from "../components/TopNav";
import Sidebar from "../components/Sidebar";
import ChatInterface from "../components/ChatInterface";
import DeleteConfirmationModal from "../components/DeleteConfirmationModal";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { getUserSessions, deleteSession, type ChatSession } from "@/lib/supabase-chat";
import { useUser } from "@/app/contexts/UserContext";

export default function ChatPage() {
  const router = useRouter();
  const { userEmail: contextUserEmail, avatarUrl: contextAvatarUrl, userId: contextUserId } = useUser();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState<Array<{id: string, title: string, timestamp: string}>>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<{id: string, title: string} | null>(null);

         // Load conversations from Supabase on mount
         useEffect(() => {
           const loadConversations = async () => {
             if (!contextUserId) return;
             
             try {
               console.log('🔍 ChatPage: Loading conversations...');
               console.log('👤 ChatPage: User ID from context:', contextUserId);
               const dbSessions = await getUserSessions(contextUserId);
               console.log('📋 ChatPage: Retrieved sessions:', dbSessions.length);
               if (dbSessions.length > 0) {
                 const formattedConversations = dbSessions.map((session: ChatSession) => {
                   // Smart title logic: use AI title if available, otherwise use timestamp
                   let title = session.title;
                   console.log('🏷️ ChatPage: Processing session title:', { 
                     sessionId: session.id, 
                     originalTitle: session.title,
                     hasTitle: !!(title && title.trim() !== '' && title !== 'New Chat')
                   });
                   
                  if (!title || title.trim() === '' || title === 'New Chat') {
                    const date = new Date(session.created_at);
                    // Use user's locale for timezone-aware formatting
                    const timeStr = date.toLocaleTimeString(undefined, { 
                      hour: '2-digit', 
                      minute: '2-digit',
                      hour12: true 
                    });
                    const dateStr = date.toLocaleDateString(undefined, { 
                      month: 'short', 
                      day: 'numeric' 
                    });
                    title = `Chat ${dateStr} ${timeStr}`;
                    console.log('🔄 ChatPage: Using timestamp fallback title:', title);
                  } else {
                    console.log('✅ ChatPage: Using AI-generated title:', title);
                  }
                   
                   return {
                     id: session.id,
                     title: title,
                     timestamp: new Date(session.created_at).toLocaleString(),
                   };
                 });
                 console.log('✅ ChatPage: Setting conversations:', formattedConversations.length);
                 setConversations(formattedConversations);
                 // Set the most recent conversation as selected
                 setSelectedConversationId(formattedConversations[0].id);
               } else {
                 console.log('ℹ️ ChatPage: No sessions found for user');
               }
             } catch (error) {
               console.error("❌ ChatPage: Error loading conversations:", error);
             }
           };

           loadConversations();
         }, [contextUserId]);

  // Note: Conversations are now managed by Supabase, no localStorage needed
  // User data is now managed by UserContext, no need for local auth checking here
  // Just redirect if user is not authenticated
  useEffect(() => {
    if (!contextUserEmail && typeof window !== 'undefined') {
      const savedAuth = localStorage.getItem("userEmail");
      if (!savedAuth) {
        router.push("/login");
      }
    }
  }, [router, contextUserEmail]);

  const handleNewChat = async () => {
    console.log('🆕 ChatPage: Creating new chat (temporary, not saved to DB yet)...');
    
    // Create a temporary session ID that will be created in DB only when user sends first message
    const tempSessionId = `temp_${Date.now()}`;
    
    const newConv = {
      id: tempSessionId,
      title: 'New Chat',
      timestamp: new Date().toLocaleString(),
    };
    
    setConversations([newConv, ...conversations]);
    setSelectedConversationId(tempSessionId);
    console.log('✅ ChatPage: Temporary new chat created (not in DB):', tempSessionId);
  };

  const handleSessionCreated = (tempId: string, realId: string) => {
    console.log('🔄 ChatPage: Replacing temporary session:', tempId, 'with real session:', realId);
    
    // Update the conversations list to replace temp ID with real ID
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === tempId
          ? { ...conv, id: realId }
          : conv
      )
    );
    
    // Update selected conversation ID
    setSelectedConversationId(realId);
    console.log('✅ ChatPage: Session replacement complete');
  };

  const handleTitleGenerated = async (title: string, sessionId: string) => {
    console.log('🏷️ ChatPage: Title generated:', title);
    console.log('🏷️ ChatPage: For session:', sessionId);
    
    // Update the session title in the database using the provided sessionId
    try {
      const { updateSessionTitle } = await import('@/lib/supabase-chat');
      const success = await updateSessionTitle(sessionId, title);
      if (success) {
        console.log('✅ ChatPage: Title updated in database successfully');
      } else {
        console.error('❌ ChatPage: Failed to update title in database');
      }
    } catch (error) {
      console.error('❌ ChatPage: Error updating session title in database:', error);
    }
    
    // Update the local conversations list immediately
    setConversations((prev) => {
      const exists = prev.some(c => c.id === sessionId);
      if (!exists) {
        // If for some reason the session isn't in state yet, prepend it
        return [{ id: sessionId, title, timestamp: new Date().toLocaleString() }, ...prev];
      }
      return prev.map((conv) =>
        conv.id === sessionId
          ? { ...conv, title, timestamp: new Date().toLocaleString() }
          : conv
      );
    });
    
    // If this is the currently selected conversation, keep it selected
    if (selectedConversationId !== sessionId) {
      setSelectedConversationId(sessionId);
    }
    
    console.log('✅ ChatPage: Local conversations list updated with new title');
  };


  const handleDeleteConversation = (id: string) => {
    const conversation = conversations.find(conv => conv.id === id);
    if (conversation) {
      setConversationToDelete({ id, title: conversation.title });
      setDeleteModalOpen(true);
    }
  };

  const confirmDeleteConversation = async () => {
    if (!conversationToDelete) return;
    
    const { id } = conversationToDelete;
    
    try {
      // Delete from Supabase
      const success = await deleteSession(id);
      if (success) {
        // Remove from conversations list
        setConversations((prev) => prev.filter((conv) => conv.id !== id));
        
        // If the deleted conversation was selected, select the first remaining conversation or create a new one
        if (selectedConversationId === id) {
          const remainingConversations = conversations.filter((conv) => conv.id !== id);
          if (remainingConversations.length > 0) {
            setSelectedConversationId(remainingConversations[0].id);
          } else {
            // Create a new conversation if no conversations remain
            const newConv = {
              id: Date.now().toString(),
              title: "New chat",
              timestamp: "Just now",
            };
            setConversations([newConv]);
            setSelectedConversationId(newConv.id);
          }
        }
      } else {
        console.error('Failed to delete conversation from database');
      }
    } catch (error) {
      console.error('Error deleting conversation:', error);
    }
    
    // Reset modal state
    setDeleteModalOpen(false);
    setConversationToDelete(null);
  };

  return (
    <div className="h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <TopNav 
        onMenuClick={() => setIsSidebarOpen(true)} 
      />
      
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        conversations={conversations}
        selectedId={selectedConversationId}
        onSelectConversation={setSelectedConversationId}
        onNewChat={handleNewChat}
        onDeleteConversation={handleDeleteConversation}
        userEmail={contextUserEmail || undefined}
        avatarUrl={contextAvatarUrl || undefined}
      />

      <div className="pt-16 h-full">
        <ChatInterface 
          onMenuClick={() => setIsSidebarOpen(true)} 
          onTitleGenerated={handleTitleGenerated}
          onSessionCreated={handleSessionCreated}
          conversationId={(() => {
            console.log('🔍 ChatPage: Passing conversationId to ChatInterface:', selectedConversationId);
            return selectedConversationId || undefined;
          })()}
          conversationTitle={conversations.find(c => c.id === selectedConversationId)?.title}
        />
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setConversationToDelete(null);
        }}
        onConfirm={confirmDeleteConversation}
        conversationTitle={conversationToDelete?.title || ""}
      />
    </div>
  );
}

