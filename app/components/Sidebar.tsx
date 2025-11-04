"use client";

import { useState } from "react";
import { Plus, MessageSquare, X, User, Settings, Trash2, BarChart3 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Conversation {
  id: string;
  title: string;
  timestamp: string;
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  conversations?: Conversation[];
  selectedId?: string | null;
  onSelectConversation?: (id: string) => void;
  onNewChat?: () => void;
  onDeleteConversation?: (id: string) => void;
  onAction?: (action: string) => void;
  currentPage?: string;
  userEmail?: string;
  avatarUrl?: string;
}

export default function Sidebar({
  isOpen,
  onClose,
  conversations = [],
  selectedId = null,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  onAction,
  currentPage,
  userEmail,
  avatarUrl,
}: SidebarProps) {
  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/35 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar Drawer */}
      <div
        className={`fixed top-0 left-0 bottom-0 w-80 z-50 transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Background Image */}
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: "url('https://images.unsplash.com/photo-1601600576337-c1d8a0d1373c?q=80&w=687&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D')"
          }}
        />

        {/* Gradients */}
        <div className="absolute top-0 left-0 right-0 h-48 bg-gradient-to-b from-black/35 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-56 bg-gradient-to-t from-black/35 to-transparent" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 left-4 p-2 text-white z-10"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Content */}
        <div className="relative h-full flex flex-col pt-16 pb-8">
          {/* User Info */}
          {userEmail && (
            <div className="px-6 mb-6">
              <div className="flex items-center gap-3 text-white">
                {avatarUrl ? (
                  <div className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-white/30">
                    <Image 
                      src={avatarUrl} 
                      alt="User avatar" 
                      width={40} 
                      height={40}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-sm font-semibold">
                    {userEmail?.charAt(0).toUpperCase() || "U"}
                  </div>
                )}
                <div>
                  <p className="font-semibold font-caslon">{userEmail.split('@')[0]}</p>
                  <p className="text-xs text-white/70 font-caslon">Retail Assistant</p>
                </div>
              </div>
            </div>
          )}

          {/* Scrollable Conversations */}
          <div className="flex-1 overflow-y-auto px-4">
            <div className="space-y-3">
              {/* New Chat Button */}
              {onNewChat && (
                <button
                  onClick={() => {
                    onNewChat();
                    onClose();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-white bg-white/10 backdrop-blur-md rounded-xl hover:bg-white/20 transition-all"
                >
                  <Plus className="w-5 h-5" />
                  <span className="font-caslon font-medium">New chat</span>
                </button>
              )}

              {/* Conversation List */}
              {conversations.length > 0 && onSelectConversation && onDeleteConversation && (
                <>
                  {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`group relative w-full flex items-start gap-3 px-4 py-3.5 text-left rounded-xl transition-all ${
                    selectedId === conv.id
                      ? "bg-white/25 backdrop-blur-md"
                      : "bg-white/10 backdrop-blur-md hover:bg-white/15"
                  }`}
                >
                  <button
                    onClick={() => {
                      onSelectConversation(conv.id);
                      onClose();
                    }}
                    className="flex items-start gap-3 flex-1 min-w-0"
                  >
                    <MessageSquare className="w-5 h-5 text-white mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-white font-caslon font-medium truncate">
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]}
                          components={{
                            p: ({ children }) => <span className="inline">{children}</span>,
                            strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                            em: ({ children }) => <em className="italic">{children}</em>,
                            code: ({ children }) => <code className="bg-white/10 px-1 rounded text-sm">{children}</code>,
                          }}
                        >
                          {conv.title}
                        </ReactMarkdown>
                      </div>
                      <p className="text-white/60 font-caslon text-xs">{conv.timestamp}</p>
                    </div>
                  </button>
                  
                  {/* Delete Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteConversation(conv.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-white/60 hover:text-white hover:bg-white/20 rounded-lg"
                    title="Delete conversation"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                  ))}
                </>
              )}

              {conversations.length === 0 && onNewChat && (
                <div className="text-center text-white/60 py-8">
                  <p className="text-sm">No conversations yet</p>
                  <p className="text-xs mt-1">Start a new chat to begin</p>
                </div>
              )}

              {/* Navigation for non-chat pages */}
              {onAction && (
                <div className="space-y-2 mt-4">
                  <button
                    onClick={() => {
                      onAction('chat');
                      onClose();
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 text-left rounded-xl transition-all ${
                      currentPage === 'chat' ? 'bg-white/25' : 'bg-white/10 hover:bg-white/15'
                    }`}
                  >
                    <MessageSquare className="w-5 h-5" />
                    <span className="font-caslon font-medium">Chat</span>
                  </button>
                  
                  <button
                    onClick={() => {
                      onAction('reports');
                      onClose();
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 text-left rounded-xl transition-all ${
                      currentPage === 'reports' ? 'bg-white/25' : 'bg-white/10 hover:bg-white/15'
                    }`}
                  >
                    <BarChart3 className="w-5 h-5" />
                    <span className="font-caslon font-medium">Reports</span>
                  </button>
                  
                  <button
                    onClick={() => {
                      onAction('settings');
                      onClose();
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 text-left rounded-xl transition-all ${
                      currentPage === 'settings' ? 'bg-white/25' : 'bg-white/10 hover:bg-white/15'
                    }`}
                  >
                    <Settings className="w-5 h-5" />
                    <span className="font-caslon font-medium">Settings</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Settings Section */}
          <div className="px-4 pt-4 border-t border-white/10">
            <Link href="/settings">
              <button className="w-full flex items-center gap-3 px-4 py-3 text-white bg-white/10 backdrop-blur-md rounded-xl hover:bg-white/15 transition-all">
                <Settings className="w-5 h-5" />
                <span className="font-caslon font-medium">Settings</span>
              </button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}


