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
      }, 15);
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
  const [userId, setUserId] = useState<string | null>(null);
  const [welcomeQuestions, setWelcomeQuestions] = useState<string[]>([]);
  const [loadingWelcomeQuestions, setLoadingWelcomeQuestions] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchSuggestedQuestions = useCallback(async () => {
    try {
      setLoadingWelcomeQuestions(true);
      console.log('💡 ChatInterface: Fetching suggested questions from backend...');
      
      // Use the new backend API to get suggested questions
      const response = await axios.get('/api/data?action=suggestions');
      
      console.log('💡 ChatInterface: Suggested questions response:', response.data);
      
      // Backend returns an array of questions
      const questions = Array.isArray(response.data) ? response.data : (response.data?.questions || []);
      
      if (questions.length > 0) {
        setWelcomeQuestions(questions.slice(0, 4)); // Take first 4 suggestions
        console.log('✅ ChatInterface: Loaded welcome questions:', questions.slice(0, 4));
      } else {
        console.log('⚠️ ChatInterface: No suggested questions returned from API. Response:', response.data);
        // Fallback to default questions
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
      // Fallback to default questions on error
      setWelcomeQuestions([
        "What are the top performing product groups by sales volume?",
        "Which entities have the highest sales in the most recent period?",
        "How do single-location stores compare to multi-location chains?",
        "What is the average sales volume per transaction for each product group?"
      ]);
    } finally {
      setLoadingWelcomeQuestions(false);
    }
  }, []);

         // Load user and initialize session
         useEffect(() => {
           const initializeUser = async () => {
             try {
               console.log('🔄 ChatInterface: useEffect triggered with conversationId:', conversationId);
               
               // Reset state when switching conversations
               setSessionId(null);
               setTitleGenerated(false);
               setAttachedFiles([]);
               
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
                     const formattedMessages = dbMessages.map((msg: ChatMessage) => ({
                       role: msg.role,
                       content: msg.content,
                       sources: msg.sources || undefined, // Now we have sources from database
                       isTyping: false
                     }));
                     console.log('📝 ChatInterface: Formatted messages:', formattedMessages);
                     setMessages(formattedMessages);
                     setSessionId(conversationId);
                     console.log('✅ ChatInterface: Set sessionId to:', conversationId);
                     console.log('✅ ChatInterface: Set messages count:', formattedMessages.length);
                   } else {
                     // New sessions show ChatGPT-style welcome interface (no messages needed)
                     console.log('ℹ️ ChatInterface: New session with no messages, showing welcome interface');
                     setMessages([]);
                     setSessionId(conversationId);
                     // Fetch welcome questions
                     fetchSuggestedQuestions();
                   }
                 } else {
                   console.log('ℹ️ ChatInterface: No conversationId, showing welcome interface');
                   setMessages([]);
                   // Fetch welcome questions
                   fetchSuggestedQuestions();
                 }
               } else {
                 console.log('❌ ChatInterface: No user found, showing welcome interface');
                 setMessages([]);
               }
             } catch (error) {
               console.error('❌ ChatInterface: Error initializing user:', error);
               setMessages([]);
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
        if (onSessionCreated) {
          onSessionCreated(tempId, realSessionId);
        }
        console.log('✅ ChatInterface: Real session created:', realSessionId, 'replacing temporary:', tempId);
      } else {
        console.error('Failed to create real session');
        return;
      }
    }

    const userMessage: Message = {
      role: "user",
      content: textToSend || "(file attached)",
      attachments: attachedFiles.map(f => ({ name: f.name, type: f.type })),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    const filesToSend = attachedFiles;
    setAttachedFiles([]);
    setIsLoading(true);

    // Save user message to Supabase
    if (currentSessionId) {
      await saveMessage(currentSessionId, 'user', textToSend || "(file attached)");
    }

    try {
      // Use the new backend API
      const response = await axios.post('/api/chat', {
        message: textToSend,
        conversationHistory: messages.slice(-5) // Send last 5 messages for context
      });

      // Check if this is a greeting message to show welcome suggestions
      const isGreeting = /^(hi|hello|hey|good morning|good afternoon|good evening|greetings?)$/i.test(textToSend.trim());
      
      const assistantMessage: Message = {
        role: "assistant",
        content: response.data.response,
        sources: response.data.contextSources > 0 ? [`${response.data.contextSources} data sources used`] : undefined,
        suggestedQuestions: isGreeting ? [
          "What are the top performing product groups by sales volume?",
          "Which entities have the highest sales in the most recent period?",
          "How do single-location stores compare to multi-location chains?",
          "What is the average sales volume per transaction for each product group?",
          "Which entities have the most diverse product offerings?"
        ] : [
          "Tell me more about the sales trends",
          "What are the key insights from this data?",
          "How can I improve performance?",
          "What should I focus on next?"
        ],
        isTyping: true,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      
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
      const errorMessage: Message = {
        role: "assistant",
        content: "Sorry, I encountered an error. Please try again.",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const generateTitle = async (firstMessage: string, targetSessionId: string) => {
    try {
      console.log('🏷️ ChatInterface: Generating title for message:', firstMessage.substring(0, 50) + '...');
      
      // Use the new backend API to generate a title
      const response = await axios.post('/api/chat', {
        message: `Generate a short, descriptive title for this conversation. Return ONLY the title text itself, no prefix like "Title:", no quotes, no labels. Just the title: "${firstMessage}"`
      });
      
      console.log('🏷️ ChatInterface: AI title response:', response.data);
      
      if (response.data.response && onTitleGenerated) {
        // Clean up the title response
        let title = response.data.response.trim();
        
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
    try {
      console.log('💡 ChatInterface: Generating suggested questions for answer:', aiAnswer.substring(0, 100) + '...');
      
      // Get the last user message to generate contextual questions
      const lastUserMessage = messages.filter(msg => msg.role === 'user').slice(-1)[0]?.content || '';
      
      console.log('💡 ChatInterface: Using user message for context:', lastUserMessage.substring(0, 100) + '...');
      
      // Use the new backend API to get suggested questions, passing the user's last message
      const url = lastUserMessage 
        ? `/api/data?action=suggestions&user_message=${encodeURIComponent(lastUserMessage)}`
        : '/api/data?action=suggestions';
      
      const response = await axios.get(url);
      
      console.log('💡 ChatInterface: Suggested questions response:', response.data);
      
      // Backend returns an array of questions (exactly 3 for contextual, 4 for generic)
      const questions = Array.isArray(response.data) ? response.data : (response.data?.questions || []);
      
      if (questions.length > 0) {
        // Update the last assistant message with suggested questions (take first 3)
        setMessages((prev) => 
          prev.map((msg, index) => 
            index === messages.length - 1 && msg.role === 'assistant'
              ? { ...msg, suggestedQuestions: questions.slice(0, 3) } // Take first 3 suggestions
              : msg
          )
        );
        console.log('✅ ChatInterface: Added suggested questions to last message');
      } else {
        console.log('⚠️ ChatInterface: No suggested questions returned from API. Response:', response.data);
      }
    } catch (error: any) {
      console.error("❌ ChatInterface: Failed to generate suggested questions:", error);
      console.error("❌ ChatInterface: Error details:", error.response?.data || error.message);
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
    setAttachedFiles((prev) => [...prev, ...files]);
  };

  const removeFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
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
                
                {message.role === "assistant" && message.isTyping ? (
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
                ) : message.role === "assistant" ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {message.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                )}
                
                {message.attachments && message.attachments.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {message.attachments.map((file, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs opacity-75">
                        <Paperclip className="w-3 h-3" />
                        <span>{file.name}</span>
                      </div>
                    ))}
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
                    className="inline-flex items-center px-4 py-2 text-sm font-caslon bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-700 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Get suggested questions
                  </button>
                </div>
              )}
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-200 dark:bg-slate-700 rounded-2xl px-4 py-3">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3">
        {/* Attached Files Preview */}
        {attachedFiles.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {attachedFiles.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-2 bg-gray-100 dark:bg-slate-800 px-3 py-2 rounded-lg text-sm"
              >
                <Paperclip className="w-4 h-4" />
                <span className="max-w-[150px] truncate">{file.name}</span>
                <button
                  onClick={() => removeFile(index)}
                  className="ml-1 hover:text-red-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ChatGPT-style welcome interface for new chats */}
        {messages.length === 0 && conversationTitle === 'New Chat' ? (
          <div className="relative">
            {/* Floating suggested questions - positioned above input */}
            {!loadingWelcomeQuestions && welcomeQuestions.length > 0 && (
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
            )}

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

