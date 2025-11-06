"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import axios from "axios";
import { Send, Loader2, ChevronDown, ChevronUp, BookOpen, Paperclip, X, Copy, Check } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getCurrentUser, createOrUpdateProfile } from "@/lib/supabase";
import { 
  createChatSession, 
  getSessionMessages, 
  saveMessage, 
  updateSessionTitle,
  type ChatMessage 
} from "@/lib/supabase-chat";

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  suggestedQuestions?: string[];
  attachments?: { name: string; type: string; url?: string }[];
  isTyping?: boolean;
  displayedContent?: string;
  progressSteps?: Array<{ step: string; message: string }>;
}

interface ChatInterfaceProps {
  onMenuClick: () => void;
  onTitleGenerated?: (title: string, sessionId: string) => void;
  onSessionCreated?: (oldId: string, newId: string) => void;
  conversationId?: string;
  conversationTitle?: string;
}

function CopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
      title={copied ? "Copied!" : "Copy message"}
    >
      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}

function TypewriterText({ text, onComplete }: { text: string; onComplete: () => void }) {
  const [displayedText, setDisplayedText] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (currentIndex < text.length) {
      const timeout = setTimeout(() => {
        setDisplayedText(prev => prev + text[currentIndex]);
        setCurrentIndex(prev => prev + 1);
      }, 5); // Speed up from 15ms to 5ms
      return () => clearTimeout(timeout);
    } else if (currentIndex === text.length && onComplete) {
      onComplete();
    }
  }, [currentIndex, text, onComplete]);

  return (
    <div className="prose prose-sm max-w-none dark:prose-invert">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {displayedText}
      </ReactMarkdown>
    </div>
  );
}

function CollapsibleSources({ sources }: { sources: string[] }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-2 pt-2 border-t border-white/20 dark:border-slate-600">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-xs font-caslon italic opacity-75 hover:opacity-100 transition-opacity w-full"
      >
        <BookOpen className="w-3.5 h-3.5" />
        <span>Sources ({sources.length})</span>
        {isExpanded ? <ChevronUp className="w-3.5 h-3.5 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
      </button>
      
      <div className={`overflow-hidden transition-all duration-300 ease-out ${isExpanded ? 'max-h-96 opacity-100 mt-2' : 'max-h-0 opacity-0'}`}>
        <div className="space-y-1">
          {sources.map((source, i) => (
            <p key={i} className="text-xs font-caslon italic opacity-75 pl-1">• {source}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ChatInterface({ onMenuClick, onTitleGenerated, onSessionCreated, conversationId, conversationTitle }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [titleGenerated, setTitleGenerated] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<Map<number, string>>(new Map());
  const [messageFilePreviews, setMessageFilePreviews] = useState<Map<string, Map<number, string>>>(new Map()); // Store previews by message index
  const [userId, setUserId] = useState<string | null>(null);
  const [welcomeQuestions, setWelcomeQuestions] = useState<string[]>([]);
  const [loadingWelcomeQuestions, setLoadingWelcomeQuestions] = useState(false);
  const [loadingInChatSuggestions, setLoadingInChatSuggestions] = useState(false); // Loading state for in-chat suggestions
  const [processingSteps, setProcessingSteps] = useState<string[]>([]); // Processing steps from backend
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const skipNextInitRef = useRef<boolean>(false);

  const fetchSuggestedQuestions = useCallback(async () => {
    try {
      setLoadingWelcomeQuestions(true);
      console.log('💡 ChatInterface: Fetching suggested questions from backend...');
      
      // Check if user has chat summaries, if yes, generate questions based on summaries
      if (userId) {
        try {
          const { supabase } = await import('@/lib/supabase');
          if (!supabase) {
            throw new Error('Supabase client not available');
          }
          const { data: summaries, error } = await supabase
            .from('chat_summaries')
            .select('summary')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(5);
          
          // Check if we already have cached welcome questions for this user
          const { data: cachedQuestions, error: cacheError } = await supabase
            .from('suggested_questions')
            .select('questions')
            .eq('user_id', userId)
            .eq('source_type', 'welcome')
            .is('session_id', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          
          if (!cacheError && cachedQuestions && cachedQuestions.questions && cachedQuestions.questions.length > 0) {
            console.log('✅ ChatInterface: Using cached welcome questions from database');
            setWelcomeQuestions(cachedQuestions.questions.slice(0, 4));
            return;
          }
          
          if (!error && summaries && summaries.length > 0) {
            // User has chat summaries - generate questions based on them
            console.log('💡 ChatInterface: User has chat summaries, generating questions based on summaries');
            const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
            const summaryText = summaries.map(s => s.summary).join('\n\n');
            
            try {
              const response = await axios.post(`${backendUrl}/v1/generate-questions-from-summaries`, {
                summaries: summaryText,
                user_id: userId
              });
              
              if (response.data?.questions && Array.isArray(response.data.questions)) {
                setWelcomeQuestions(response.data.questions.slice(0, 4));
                console.log('✅ ChatInterface: Generated welcome questions from summaries:', response.data.questions.slice(0, 4));
                return;
              }
            } catch (summaryError) {
              console.warn('⚠️ ChatInterface: Error generating questions from summaries:', summaryError);
            }
          }
        } catch (summaryCheckError) {
          console.warn('⚠️ ChatInterface: Error checking chat summaries:', summaryCheckError);
        }
      }
      
      // Fallback: use generic questions if no summaries or error
      console.log('💡 ChatInterface: Using generic welcome questions');
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
      const response = await axios.get(`${backendUrl}/v1/suggested-questions`);
      
      const questions = Array.isArray(response.data) ? response.data : (response.data?.questions || []);
      
      if (questions.length > 0) {
        setWelcomeQuestions(questions.slice(0, 4));
        console.log('✅ ChatInterface: Loaded welcome questions:', questions.slice(0, 4));
      } else {
        console.log('⚠️ ChatInterface: No suggested questions returned from API. Response:', response.data);
        setWelcomeQuestions([
          "What are the top performing product groups by sales volume?",
          "Which entities have the highest sales in the most recent period?",
          "How do single-location stores compare to multi-location chains?",
          "What is the average sales volume per transaction for each product group?"
        ]);
      }
    } catch (error: any) {
      console.error("❌ ChatInterface: Failed to fetch suggested questions:", error);
      console.error("❌ ChatInterface: Error details:", error.response?.data || error.message);
      setWelcomeQuestions([
        "What are the top performing product groups by sales volume?",
        "Which entities have the highest sales in the most recent period?",
        "How do single-location stores compare to multi-location chains?",
        "What is the average sales volume per transaction for each product group?"
      ]);
    } finally {
      setLoadingWelcomeQuestions(false);
    }
  }, [userId]);

         // Load user and initialize session
         useEffect(() => {
           const initializeUser = async () => {
             try {
               console.log('🔄 ChatInterface: useEffect triggered with conversationId:', conversationId);
               
              // If just promoting a temp session to a real one, keep current UI intact
             if (skipNextInitRef.current) {
               skipNextInitRef.current = false;
               if (conversationId) {
                 setSessionId(conversationId);
               }
               console.log('⏭️ Skipping reset due to session promotion - keeping all UI state');
               return; // CRITICAL: Don't continue execution - keep current messages/state
             } else {
               // Reset state when switching conversations normally (e.g., clicking "New Chat")
               setMessages([]);
               setSessionId(null);
               setTitleGenerated(false);
               setAttachedFiles([]);
             }
               
               const user = await getCurrentUser();
               if (user) {
                 setUserId(user.id);
                 
                 // Create or update user profile
                 await createOrUpdateProfile(user);
                 
                 if (conversationId) {
                   console.log('🔍 ChatInterface: Loading existing conversation:', conversationId);
                   console.log('🔍 ChatInterface: conversationId type:', typeof conversationId);
                   console.log('🔍 ChatInterface: conversationId length:', conversationId?.length);
                   
                   // Load existing conversation from Supabase
                   const dbMessages = await getSessionMessages(conversationId);
                   console.log('📋 ChatInterface: Loaded messages:', dbMessages.length);
                   console.log('📋 ChatInterface: Raw messages data:', dbMessages);
                   
                   if (dbMessages.length > 0) {
                     const formattedMessages = dbMessages.map((msg: ChatMessage) => {
                       // Check if message content indicates file attachments and extract file names
                       let attachments = undefined;
                       if (msg.role === 'user') {
                         const fileMatch = msg.content.match(/\(file attached: (.+?)\)/);
                         if (fileMatch) {
                           // Extract file names from the stored message
                           const fileNames = fileMatch[1].split(", ");
                           attachments = fileNames.map(name => ({ name, type: "file" }));
                           // Clean content to remove the file indicator for display
                           const cleanContent = msg.content.replace(/\(file attached: .+?\)/g, '').trim();
                           return {
                             role: msg.role,
                             content: cleanContent || "(file attached)",
                             sources: msg.sources || undefined,
                             attachments: attachments,
                             isTyping: false
                           };
                         } else if (msg.content === "(file attached)" || msg.content.includes("(file attached)")) {
                           attachments = [{ name: "File attached", type: "file" }];
                         }
                       }
                       
                       return {
                         role: msg.role,
                         content: msg.content,
                         sources: msg.sources || undefined,
                         attachments: attachments,
                         isTyping: false
                       };
                     });
                     console.log('📝 ChatInterface: Formatted messages:', formattedMessages);
                     setMessages(formattedMessages);
                     setSessionId(conversationId);
                     console.log('✅ ChatInterface: Set sessionId to:', conversationId);
                     console.log('✅ ChatInterface: Set messages count:', formattedMessages.length);
                   } else {
                     // New sessions show ChatGPT-style welcome interface (no messages needed)
                  console.log('ℹ️ ChatInterface: New session with no messages, showing welcome interface');
                  if (messages.length === 0) setMessages([]);
                     setSessionId(conversationId);
                     // Fetch welcome questions
                     fetchSuggestedQuestions();
                   }
                 } else {
                  console.log('ℹ️ ChatInterface: No conversationId, showing welcome interface');
                  if (messages.length === 0) setMessages([]);
                   // Fetch welcome questions
                   fetchSuggestedQuestions();
                 }
               } else {
                console.log('❌ ChatInterface: No user found, showing welcome interface');
                if (messages.length === 0) setMessages([]);
               }
             } catch (error) {
              console.error('❌ ChatInterface: Error initializing user:', error);
              if (messages.length === 0) setMessages([]);
             }
           };

           initializeUser();
         }, [conversationId, fetchSuggestedQuestions]);

  // Note: Messages are now saved to Supabase in real-time via saveMessage function

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const createSession = async () => {
    if (!userId) {
      console.error('No user ID available for creating session');
      return;
    }

    try {
      const newSessionId = await createChatSession(userId, 'New Chat');
      if (newSessionId) {
        setSessionId(newSessionId);
      }
    } catch (error) {
      console.error('Error creating session:', error);
    }
  };


  const sendMessage = async (messageText?: string) => {
    const textToSend = messageText || input;
    if ((!textToSend.trim() && attachedFiles.length === 0) || isLoading) return;

    // Use the current session ID (should always exist now)
    let currentSessionId = conversationId || sessionId;
    console.log('ℹ️ ChatInterface: Using session:', currentSessionId);

    // Check if this is a temporary session (not saved to DB yet)
    if (currentSessionId && currentSessionId.startsWith('temp_')) {
      console.log('🆕 ChatInterface: Temporary session detected, creating real session in DB...');
      if (!userId) {
        console.error('No user ID available for creating session');
        return;
      }
      
      const tempId = currentSessionId;
      // Create a real session in the database
      const realSessionId = await createChatSession(userId, 'New Chat');
      if (realSessionId) {
        currentSessionId = realSessionId;
        setSessionId(realSessionId);
        // Notify parent component to update conversation list
        // Prevent initializeUser from wiping the UI on the upcoming conversation change
        skipNextInitRef.current = true;
        if (onSessionCreated) {
          onSessionCreated(tempId, realSessionId);
        }
        console.log('✅ ChatInterface: Real session created:', realSessionId, 'replacing temporary:', tempId);
      } else {
        console.error('Failed to create real session');
        return;
      }
    }

    // Store file previews for this message before clearing
    const messageIndex = messages.length;
    const currentFilePreviews = new Map<number, string>();
    attachedFiles.forEach((file, idx) => {
      const preview = filePreviews.get(idx);
      if (preview) {
        currentFilePreviews.set(idx, preview);
      }
    });
    setMessageFilePreviews(prev => new Map(prev).set(messageIndex.toString(), currentFilePreviews));
    
    const userMessage: Message = {
      role: "user",
      content: textToSend || "(file attached)",
      attachments: attachedFiles.map((f, idx) => ({ 
        name: f.name, 
        type: f.type,
        url: filePreviews.get(idx) || undefined // Store preview URL
      })),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    const filesToSend = attachedFiles;
    setAttachedFiles([]);
    setFilePreviews(new Map()); // Clear previews when sending
    setIsLoading(true);

    // Save user message to Supabase (include file indicator if files were attached)
    if (currentSessionId) {
      const messageContent = filesToSend.length > 0 
        ? `${textToSend || ""}${textToSend ? " " : ""}(file attached: ${filesToSend.map(f => f.name).join(", ")})`
        : textToSend || "(file attached)";
      await saveMessage(currentSessionId, 'user', messageContent);
    }

    // Create assistant message placeholder immediately to show progress
    // Note: assistantMessageIndex should be messages.length + 1 (after user message is added)
    const assistantMessageIndex = messages.length + 1; // +1 because user message was just added
    const assistantMessage: Message = {
      role: "assistant",
      content: "",
      sources: undefined,
      attachments: undefined,
      suggestedQuestions: undefined,
      progressSteps: [],
      isTyping: true,
    };
    
    setMessages((prev) => [...prev, assistantMessage]);
    
    // Initialize processing steps with generic loading message
    setProcessingSteps(['Connecting to backend...']);

    try {
      // Show "analyzing" step while waiting for response
      const analyzeTimer = setTimeout(() => {
        setProcessingSteps(['Connecting to backend...', 'Analyzing your query...']);
      }, 500);

      // Prepare request with files if any
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
      let response;
      if (filesToSend.length > 0) {
        // Use FormData to send files
        const formData = new FormData();
        formData.append('message', textToSend || '');
        formData.append('conversationHistory', JSON.stringify(messages.slice(-5).map(msg => ({
          role: msg.role,
          content: msg.content
        }))));
        
        // Append all files
        filesToSend.forEach((file) => {
          formData.append('files', file);
        });
        
        response = await axios.post(`${backendUrl}/v1/ask`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
      } else {
        // Regular JSON request for text-only messages
        response = await axios.post(`${backendUrl}/v1/ask`, {
          message: textToSend,
          conversationHistory: messages.slice(-5) // Send last 5 messages for context
        });
      }

      // Clear the analyze timer since we got a response
      clearTimeout(analyzeTimer);

      // Animate backend progress steps one by one
      console.log('📊 Full backend response:', response.data);
      console.log('📊 Backend progress steps:', response.data.progress_steps);
      
      if (response.data.progress_steps && Array.isArray(response.data.progress_steps) && response.data.progress_steps.length > 0) {
        const backendSteps = response.data.progress_steps.map((step: any) => {
          if (typeof step === 'string') {
            return step;
          }
          // Format backend step objects to user-friendly messages (text only, no icons)
          const message = step.message || step.step || 'Processing...';
          return message;
        });
        
        console.log('✨ Formatted processing steps:', backendSteps);
        
        // Animate steps appearing one by one with 150ms delay between each
        setProcessingSteps([backendSteps[0]]);
        for (let i = 1; i < backendSteps.length; i++) {
          await new Promise(resolve => setTimeout(resolve, 150));
          setProcessingSteps(prev => [...prev, backendSteps[i]]);
        }
      } else {
        // Fallback if no steps from backend
        setProcessingSteps(['Processing complete']);
      }

      // Update assistant message with response
      // Find the assistant message that was just added (empty content, isTyping: true)
      setMessages((prev) => {
        // Find the last assistant message with empty content (the placeholder we just added)
        const lastAssistantIndex = prev.length - 1;
        if (lastAssistantIndex >= 0 && prev[lastAssistantIndex].role === "assistant" && prev[lastAssistantIndex].content === "") {
          return prev.map((msg, i) => 
            i === lastAssistantIndex 
              ? {
                  ...msg,
                  content: response.data.response,
                  sources: response.data.contextSources > 0 ? [`${response.data.contextSources} data sources used`] : undefined,
                  progressSteps: response.data.progressSteps || [],
                  isTyping: true,
                }
              : msg
          );
        }
        // Fallback: try to find by index
        return prev.map((msg, i) => 
          i === assistantMessageIndex && msg.role === "assistant"
            ? {
                ...msg,
                content: response.data.response,
                sources: response.data.contextSources > 0 ? [`${response.data.contextSources} data sources used`] : undefined,
                progressSteps: response.data.progressSteps || [],
                isTyping: true,
              }
            : msg
        );
      });
      
      // Save assistant message to Supabase
      if (currentSessionId) {
        await saveMessage(currentSessionId, 'assistant', response.data.response, assistantMessage.sources);
      }
      
      // Generate title from first user message (only for new sessions)
      // Check if this is the first message in a new session
      if (!titleGenerated && currentSessionId && onTitleGenerated) {
        // Check if this session has "New Chat" title (indicating it's a new session)
        const isNewSession = conversationTitle === 'New Chat';
        if (isNewSession) {
          console.log('🏷️ ChatInterface: Generating title for new session:', currentSessionId);
          generateTitle(textToSend, currentSessionId);
        }
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      setProcessingSteps(prev => [...prev, 'Error occurred']);
      
      // Remove the placeholder assistant message if it exists
      setMessages((prev) => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.role === "assistant" && !lastMsg.content) {
          return prev.slice(0, -1);
        }
        return prev;
      });
      
      const errorMessage: Message = {
        role: "assistant",
        content: "Sorry, I encountered an error. Please try again.",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      // Clear processing steps after a short delay
      setTimeout(() => {
        setProcessingSteps([]);
      }, 1000);
    }
  };

  const generateTitle = async (firstMessage: string, targetSessionId: string) => {
    try {
      console.log('🏷️ ChatInterface: Generating title for message:', firstMessage.substring(0, 50) + '...');
      
      // Clean the message (remove file references for title generation)
      let cleanMessage = firstMessage;
      if (cleanMessage.includes("(file attached)")) {
        cleanMessage = cleanMessage.replace(/\(file attached\)/g, '').trim();
      }
      // Remove file attachment indicators
      cleanMessage = cleanMessage.replace(/\(file attached: .+?\)/g, '').trim();
      
      // Use the dedicated title generation endpoint that bypasses RAG
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
      const response = await axios.post(`${backendUrl}/v1/generate-title`, {
        message: cleanMessage
      }, {
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      console.log('🏷️ ChatInterface: AI title response:', response.data);
      
      if (response.data.title && onTitleGenerated) {
        // Clean up the title response (from /v1/generate-title endpoint)
        let title = response.data.title.trim();
        
        // Remove "Title:" prefix (case-insensitive, with optional colon and whitespace)
        title = title.replace(/^title:\s*/i, '');
        
        // Remove quotes from start and end (handles both single and double quotes)
        title = title.replace(/^["']+|["']+$/g, '');
        
        // Remove any remaining quotes around the entire string
        title = title.replace(/^["'](.+)["']$/g, '$1');
        
        // Trim again after cleanup
        title = title.trim();
        
        // Limit length
        if (title.length > 50) {
          title = title.substring(0, 47) + '...';
        }
        
        console.log('✅ ChatInterface: AI title generated successfully:', title);
        onTitleGenerated(title, targetSessionId);
        setTitleGenerated(true);
      } else {
        console.log('⚠️ ChatInterface: AI title generation failed or returned empty title');
        // Fallback: use first 50 chars of the message
        if (onTitleGenerated) {
          const fallbackTitle = firstMessage.length > 50 
            ? firstMessage.substring(0, 50) + "..." 
            : firstMessage;
          console.log('🔄 ChatInterface: Using fallback title:', fallbackTitle);
          onTitleGenerated(fallbackTitle, targetSessionId);
          setTitleGenerated(true);
        }
      }
    } catch (error) {
      console.error("❌ ChatInterface: Failed to generate title:", error);
      // Fallback: use first 50 chars of the message
      if (onTitleGenerated) {
        const fallbackTitle = firstMessage.length > 50 
          ? firstMessage.substring(0, 50) + "..." 
          : firstMessage;
        console.log('🔄 ChatInterface: Using error fallback title:', fallbackTitle);
        onTitleGenerated(fallbackTitle, targetSessionId);
        setTitleGenerated(true);
      }
    }
  };

  const generateSuggestedQuestions = async (aiAnswer: string) => {
    if (loadingInChatSuggestions) return; // Prevent multiple simultaneous requests
    
    try {
      setLoadingInChatSuggestions(true);
      console.log('💡 ChatInterface: Fetching cached suggested questions...');
      
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
      const lastUserMessage = messages.filter(msg => msg.role === 'user').slice(-1)[0]?.content || '';
      const currentSessionId = conversationId || sessionId;
      
      if (!currentSessionId) {
        console.warn('⚠️ ChatInterface: No session ID, cannot fetch cached suggestions');
        return;
      }
      
      // Create a hash of the user message for matching (first 200 chars)
      const contextHash = lastUserMessage.substring(0, 200);
      
      // Try to get cached suggestions from database
      try {
        const cachedResponse = await axios.get(`${backendUrl}/v1/get-cached-suggestions`, {
          params: {
            session_id: currentSessionId,
            context_hash: contextHash
          }
        });
        
        if (cachedResponse.data?.cached && cachedResponse.data.questions?.length > 0) {
          console.log('✅ ChatInterface: Using cached suggested questions from database');
          setMessages((prev) => 
            prev.map((msg, index) => 
              index === messages.length - 1 && msg.role === 'assistant'
                ? { ...msg, suggestedQuestions: cachedResponse.data.questions.slice(0, 3) }
                : msg
            )
          );
          return; // Successfully loaded from cache
        }
      } catch (cacheError) {
        console.warn('⚠️ ChatInterface: Error fetching cached suggestions:', cacheError);
      }
      
      // If no cache, generate new questions
      console.log('💡 ChatInterface: No cache found, generating new suggested questions...');
      const url = lastUserMessage 
        ? `${backendUrl}/v1/suggested-questions?user_message=${encodeURIComponent(lastUserMessage)}`
        : `${backendUrl}/v1/suggested-questions`;
      
      const response = await axios.get(url);
      
      const questions = Array.isArray(response.data) ? response.data : (response.data?.questions || []);
      
      if (questions.length > 0) {
        const questionsToStore = questions.slice(0, 3);
        
        // Update UI immediately
        setMessages((prev) => 
          prev.map((msg, index) => 
            index === messages.length - 1 && msg.role === 'assistant'
              ? { ...msg, suggestedQuestions: questionsToStore }
              : msg
          )
        );
        
        // Store in database for future use (only once per user message)
        if (currentSessionId && userId) {
          try {
            const formData = new FormData();
            formData.append('session_id', currentSessionId);
            formData.append('user_id', userId);
            formData.append('questions', JSON.stringify(questionsToStore));
            formData.append('context_hash', contextHash);
            
            await axios.post(`${backendUrl}/v1/store-suggestions`, formData);
            console.log('✅ ChatInterface: Stored suggested questions in database');
          } catch (storeError) {
            console.warn('⚠️ ChatInterface: Failed to store suggestions:', storeError);
          }
        }
        
        console.log('✅ ChatInterface: Added suggested questions to last message');
      } else {
        console.log('⚠️ ChatInterface: No suggested questions returned from API. Response:', response.data);
      }
    } catch (error: any) {
      console.error("❌ ChatInterface: Failed to generate suggested questions:", error);
      console.error("❌ ChatInterface: Error details:", error.response?.data || error.message);
    } finally {
      setLoadingInChatSuggestions(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachedFiles((prev) => {
      const newFiles = [...prev, ...files];
      
      // Generate previews for new files
      files.forEach((file, relativeIndex) => {
        const absoluteIndex = prev.length + relativeIndex;
        generateFilePreview(file, absoluteIndex);
      });
      
      return newFiles;
    });
  };

  const generateFilePreview = (file: File, index: number) => {
    if (file.type.startsWith('image/')) {
      // Create image preview
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setFilePreviews((prev) => new Map(prev).set(index, result));
      };
      reader.readAsDataURL(file);
    } else if (file.type === 'application/pdf') {
      // PDF preview - we'll show a PDF icon, but could also show first page thumbnail
      setFilePreviews((prev) => new Map(prev).set(index, 'pdf-icon'));
    } else if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
      // CSV preview - show first few rows
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const lines = text.split('\n').slice(0, 3).join('\n');
        setFilePreviews((prev) => new Map(prev).set(index, `csv-preview:${lines}`));
      };
      reader.readAsText(file);
    } else if (
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.type === 'application/vnd.ms-excel' ||
      file.name.endsWith('.xlsx') ||
      file.name.endsWith('.xls')
    ) {
      // Excel preview - show icon
      setFilePreviews((prev) => new Map(prev).set(index, 'excel-icon'));
    }
  };

  const removeFile = (index: number) => {
    // Clean up preview URL if it exists
    const preview = filePreviews.get(index);
    if (preview && preview.startsWith('data:')) {
      // Revoke object URL if it's a blob URL
      // Note: data URLs don't need revocation, but we'll clean up the map
    }
    
    setAttachedFiles((prev) => {
      const newFiles = prev.filter((_, i) => i !== index);
      
      // Update preview map indices
      setFilePreviews((prevPreviews) => {
        const newPreviews = new Map<number, string>();
        prevPreviews.forEach((value, key) => {
          if (key < index) {
            newPreviews.set(key, value);
          } else if (key > index) {
            newPreviews.set(key - 1, value);
          }
        });
        return newPreviews;
      });
      
      return newFiles;
    });
  };

  const handleFileUploadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-center px-4 py-3 border-b border-gray-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
        <h2 className="text-lg font-zapfino">
          <ReactMarkdown 
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <span className="inline">{children}</span>,
              strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
              em: ({ children }) => <em className="italic">{children}</em>,
              code: ({ children }) => <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded text-sm">{children}</code>,
            }}
          >
            {conversationTitle || "New chat"}
          </ReactMarkdown>
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((message, index) => (
          <div key={index} className="group">
            {/* Processing steps - show above the last assistant message when loading */}
            {message.role === "assistant" && 
             index === messages.length - 1 && 
             processingSteps.length > 0 && (
              <div className="mb-2 space-y-0.5 text-xs text-gray-600 dark:text-gray-400">
                {processingSteps.map((step, stepIndex) => (
                  <div 
                    key={stepIndex} 
                    className={`flex items-start gap-1.5 transition-all duration-200 ${
                      stepIndex === processingSteps.length - 1 && isLoading
                        ? 'text-blue-600 dark:text-blue-400' 
                        : step.toLowerCase().includes('complete') 
                        ? 'text-green-600 dark:text-green-400'
                        : step.toLowerCase().includes('error')
                        ? 'text-red-600 dark:text-red-400'
                        : 'opacity-75'
                    }`}
                  >
                    <span className={stepIndex === processingSteps.length - 1 && isLoading ? 'animate-pulse' : ''}>
                      {step}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div
              className={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2.5 font-caslon relative ${
                  message.role === "user"
                    ? "bg-black text-white"
                    : "bg-gray-200 dark:bg-slate-700 text-gray-900 dark:text-white"
                }`}
              >
                {/* Copy Button */}
                <div className="absolute top-2 right-2">
                  <CopyButton content={message.content} />
                </div>
                
                {message.role === "assistant" && message.isTyping && message.content ? (
                  <TypewriterText 
                    text={message.content} 
                    onComplete={() => {
                      setMessages(prev => 
                        prev.map((msg, i) => 
                          i === index ? { ...msg, isTyping: false } : msg
                        )
                      );
                    }}
                  />
                ) : message.role === "assistant" && message.content ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {message.content}
                    </ReactMarkdown>
                  </div>
                ) : message.role === "user" ? (
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                ) : (
                  // Assistant bubble placeholder: show subtle typing dots INSIDE the bubble
                  <div className="flex gap-1 py-0.5">
                    <div className="w-2 h-2 bg-gray-500/70 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-2 h-2 bg-gray-500/60 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-2 h-2 bg-gray-500/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                )}
                
                {message.attachments && message.attachments.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {message.attachments.map((file, i) => {
                      // Get preview from stored URL or message previews
                      const storedPreview = messageFilePreviews.get(index.toString())?.get(i);
                      const filePreview = file.url || storedPreview;
                      const isImage = file.type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|bmp|tiff)$/i.test(file.name);
                      const isPDF = file.type === 'application/pdf' || file.name?.endsWith('.pdf');
                      const isCSV = file.type === 'text/csv' || file.name?.endsWith('.csv');
                      const isExcel = file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                                     file.type === 'application/vnd.ms-excel' ||
                                     file.name?.endsWith('.xlsx') || file.name?.endsWith('.xls');
                      
                      return (
                        <div
                          key={i}
                          className="flex items-center gap-2 bg-white/10 dark:bg-white/5 px-3 py-2 rounded-lg text-xs"
                        >
                          {/* File Preview - same style as upload area */}
                          <div className="flex items-center gap-2 min-w-0">
                            {isImage && filePreview && filePreview.startsWith('data:') ? (
                              <img
                                src={filePreview}
                                alt={file.name}
                                className="w-8 h-8 object-cover rounded border border-white/20 flex-shrink-0"
                              />
                            ) : isPDF ? (
                              <div className="w-8 h-8 bg-red-100 dark:bg-red-900/30 rounded border border-red-300 dark:border-red-700 flex items-center justify-center flex-shrink-0">
                                <span className="text-red-600 dark:text-red-400 text-[10px] font-bold">PDF</span>
                              </div>
                            ) : isExcel ? (
                              <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded border border-green-300 dark:border-green-700 flex items-center justify-center flex-shrink-0">
                                <span className="text-green-600 dark:text-green-400 text-[10px] font-bold">XLS</span>
                              </div>
                            ) : isCSV ? (
                              <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded border border-blue-300 dark:border-blue-700 flex items-center justify-center flex-shrink-0">
                                <span className="text-blue-600 dark:text-blue-400 text-[10px] font-bold">CSV</span>
                              </div>
                            ) : (
                              <Paperclip className="w-3 h-3 flex-shrink-0 opacity-75" />
                            )}
                            <span className="max-w-[120px] truncate text-xs opacity-90">{file.name}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                
                {message.sources && message.sources.length > 0 && (
                  <CollapsibleSources sources={message.sources} />
                )}
              </div>
            </div>

            {message.role === "assistant" &&
              message.suggestedQuestions &&
              message.suggestedQuestions.length > 0 &&
              index === messages.length - 1 &&
              !isLoading &&
              !message.isTyping && ( // Only show after typewriting animation finishes
                <div className="mt-3 space-y-2">
                  {message.suggestedQuestions.map((question, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(question)}
                      className="block w-full text-left px-4 py-2 text-sm font-caslon bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              )}
            
            {/* Suggested Questions Button for History Sessions */}
            {message.role === "assistant" &&
              index === messages.length - 1 &&
              !isLoading &&
              !message.isTyping && // Only show after typewriting animation finishes
              conversationId && // Only show for existing sessions
              (!message.suggestedQuestions || message.suggestedQuestions.length === 0) && (
                <div className="mt-3">
                  <button
                    onClick={() => generateSuggestedQuestions(message.content)}
                    disabled={loadingInChatSuggestions}
                    className="inline-flex items-center px-4 py-2 text-sm font-caslon bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-700 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loadingInChatSuggestions ? (
                      <>
                        <svg className="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Generating questions...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Get suggested questions
                      </>
                    )}
                  </button>
                </div>
              )}
          </div>
        ))}

        {/* In-bubble loading animation (keep the classic typing indicator) */}
        {/* Removed separate global typing bubble */}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3">
        {/* Attached Files Preview */}
        {attachedFiles.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {attachedFiles.map((file, index) => {
              const preview = filePreviews.get(index);
              const isImage = file.type.startsWith('image/');
              const isPDF = file.type === 'application/pdf';
              const isCSV = file.type === 'text/csv' || file.name.endsWith('.csv');
              const isExcel = file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                             file.type === 'application/vnd.ms-excel' ||
                             file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
              
              return (
                <div
                  key={index}
                  className="flex items-center gap-2 bg-gray-100 dark:bg-slate-800 px-3 py-2 rounded-lg text-sm relative group"
                >
                  {/* File Preview */}
                  <div className="flex items-center gap-2 min-w-0">
                    {isImage && preview && preview.startsWith('data:') ? (
                      <img
                        src={preview}
                        alt={file.name}
                        className="w-10 h-10 object-cover rounded border border-gray-300 dark:border-slate-600 flex-shrink-0"
                      />
                    ) : isPDF ? (
                      <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded border border-red-300 dark:border-red-700 flex items-center justify-center flex-shrink-0">
                        <span className="text-red-600 dark:text-red-400 text-xs font-bold">PDF</span>
                      </div>
                    ) : isExcel ? (
                      <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded border border-green-300 dark:border-green-700 flex items-center justify-center flex-shrink-0">
                        <span className="text-green-600 dark:text-green-400 text-xs font-bold">XLS</span>
                      </div>
                    ) : isCSV && preview && preview.startsWith('csv-preview:') ? (
                      <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded border border-blue-300 dark:border-blue-700 flex items-center justify-center flex-shrink-0 relative overflow-hidden">
                        <div className="absolute inset-0 p-0.5 text-[7px] leading-tight text-blue-700 dark:text-blue-300 font-mono whitespace-pre overflow-hidden">
                          {preview.replace('csv-preview:', '').substring(0, 80)}
                        </div>
                      </div>
                    ) : (
                      <Paperclip className="w-4 h-4 flex-shrink-0" />
                    )}
                    <span className="max-w-[150px] truncate">{file.name}</span>
                  </div>
                  <button
                    onClick={() => removeFile(index)}
                    className="ml-1 hover:text-red-500 transition-colors flex-shrink-0"
                    title="Remove file"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* ChatGPT-style welcome interface for new chats */}
        {messages.length === 0 && conversationTitle === 'New Chat' ? (
          <div className="relative">
            {/* Floating suggested questions - positioned above input */}
            {loadingWelcomeQuestions ? (
              <div className="absolute bottom-full left-0 right-0 mb-4 flex flex-wrap justify-center gap-2 px-4">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full shadow-sm animate-pulse"
                  >
                    <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
                  </div>
                ))}
              </div>
            ) : welcomeQuestions.length > 0 ? (
              <div className="absolute bottom-full left-0 right-0 mb-4 flex flex-wrap justify-center gap-2 px-4">
                {welcomeQuestions.map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setInput(suggestion);
                      sendMessage(suggestion);
                    }}
                    className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm hover:shadow-md text-sm text-gray-700 dark:text-gray-300 font-medium whitespace-nowrap font-body"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            ) : null}

            {/* Normal input bar */}
            <div className="flex items-end gap-2">
              <button
                onClick={handleFileUploadClick}
                className="p-3 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                title="Attach file"
              >
                <Paperclip className="w-5 h-5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                multiple
                className="hidden"
                accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xlsx"
              />
              <div className="flex-1 relative">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Ask me anything about retail transactions, sales performance, or entity analytics..."
                  rows={1}
                  className="w-full px-4 py-2.5 bg-gray-100 dark:bg-slate-800 rounded-full resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  style={{ maxHeight: "120px" }}
                />
              </div>

              <button
                onClick={() => sendMessage()}
                disabled={(!input.trim() && attachedFiles.length === 0) || isLoading}
                className="p-2.5 bg-black text-white rounded-full hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>
        ) : (
          /* Normal input for existing conversations */
          <div className="flex items-end gap-2">
            <button
              onClick={handleFileUploadClick}
              className="p-3 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors"
              title="Attach file"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              multiple
              className="hidden"
              accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xlsx"
            />
            <div className="flex-1 relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Ask me about retail data, sales trends, or entity performance..."
                rows={1}
                className="w-full px-4 py-2.5 bg-gray-100 dark:bg-slate-800 rounded-full resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                style={{ maxHeight: "120px" }}
              />
            </div>

            <button
              onClick={() => sendMessage()}
              disabled={(!input.trim() && attachedFiles.length === 0) || isLoading}
              className="p-2.5 bg-black text-white rounded-full hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

