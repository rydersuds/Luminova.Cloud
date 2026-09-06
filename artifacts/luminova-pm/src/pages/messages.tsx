import * as React from "react"
import { AppLayout } from "@/components/layout/app-layout"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, Send, Paperclip, MoreVertical, ShieldCheck, ChevronLeft, Inbox } from "lucide-react"
import { cn } from "@/lib/utils"

const CHATS = [
  { id: 1, name: "City Electric", unread: 2, lastMessage: "We'll be on site at 7am tomorrow.", time: "10:42 AM", initials: "CE", status: "online", context: "Trade • Downtown Office Reno" },
  { id: 2, name: "Downtown Office Reno", unread: 0, lastMessage: "Client approved the lighting change.", time: "Yesterday", initials: "DR", status: "offline", context: "Project Channel" },
  { id: 3, name: "Sarah Jenkins", unread: 0, lastMessage: "Thanks for the update!", time: "Tuesday", initials: "SJ", status: "offline", context: "Client • Riverstone Clinic" },
  { id: 4, name: "Apex Plumbing", unread: 0, lastMessage: "Invoice submitted to the portal.", time: "Monday", initials: "AP", status: "online", context: "Trade • Riverstone Clinic" },
]

const INITIAL_MESSAGES_DB: Record<number, { id: number, text: string, sender: "me" | "them", time: string }[]> = {
  1: [
    { id: 1, text: "Hey, are the framing guys done on floor 2?", sender: "me", time: "09:15 AM" },
    { id: 2, text: "Almost, they need another couple hours. We can't start rough-in until they clear out.", sender: "them", time: "09:20 AM" },
    { id: 3, text: "Understood. I'll push your start to 1PM. Does that work?", sender: "me", time: "09:25 AM" },
    { id: 4, text: "Yes, that works perfectly. We'll be on site at 7am tomorrow to finish up.", sender: "them", time: "10:42 AM" },
  ],
  2: [
    { id: 1, text: "Client approved the lighting change.", sender: "them", time: "Yesterday" }
  ],
  3: [
    { id: 1, text: "Thanks for the update!", sender: "them", time: "Tuesday" }
  ],
  4: [
    { id: 1, text: "Invoice submitted to the portal.", sender: "them", time: "Monday" }
  ]
}

export default function Messages() {
  const [activeChat, setActiveChat] = React.useState(CHATS[0])
  const [message, setMessage] = React.useState("")
  const [isMobileListOpen, setIsMobileListOpen] = React.useState(true)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [messagesDb, setMessagesDb] = React.useState(INITIAL_MESSAGES_DB)
  const messagesEndRef = React.useRef<HTMLDivElement>(null)

  const activeMessages = messagesDb[activeChat.id] || []

  // Auto-scroll on new message or chat change
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [activeChat.id, activeMessages.length])

  const handleChatSelect = (chat: typeof CHATS[0]) => {
    setActiveChat(chat)
    setIsMobileListOpen(false)
  }

  const handleBackToList = () => {
    setIsMobileListOpen(true)
  }

  const handleSend = () => {
    if (message.trim()) {
      const newMessage = {
        id: Date.now(),
        text: message.trim(),
        sender: "me" as const,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }

      setMessagesDb(prev => ({
        ...prev,
        [activeChat.id]: [...(prev[activeChat.id] || []), newMessage]
      }))

      setMessage("")
    }
  }

  const filteredChats = CHATS.filter(chat =>
    chat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    chat.context.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <AppLayout>
      <div className="dark flex-1 flex overflow-hidden bg-background relative text-foreground">
        {/* Deep atmospheric background */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
          <div className="absolute inset-0 bg-[#080808]" />
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-sidebar-border/20 to-transparent" />
          <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] bg-primary/10 rounded-full blur-[140px] animate-pulse motion-reduce:animate-none" style={{ animationDuration: '8s' }} />
          <div className="absolute -bottom-[20%] -right-[10%] w-[60%] h-[60%] bg-primary/5 rounded-full blur-[140px] animate-pulse motion-reduce:animate-none" style={{ animationDuration: '12s' }} />
        </div>

        <div className="flex-1 flex w-full max-w-[1600px] mx-auto z-10 relative p-0 md:p-6 gap-6">
          
          {/* List Panel */}
          <div className={cn(
            "w-full md:w-80 lg:w-96 flex flex-col shrink-0 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] md:translate-x-0 md:static absolute inset-0 z-20 bg-background md:bg-transparent motion-reduce:transition-none",
            isMobileListOpen ? "translate-x-0 opacity-100" : "hidden md:flex md:opacity-100 md:pointer-events-auto"
          )}>
            <div className="flex-1 flex flex-col md:glass-panel-dark md:rounded-3xl overflow-hidden border-0 md:border md:border-sidebar-border md:shadow-2xl relative bg-transparent md:bg-sidebar/40">

              <div className="p-4 md:p-6 border-b border-sidebar-border/50 bg-sidebar/80 backdrop-blur-xl shrink-0">
                <h2 className="text-2xl font-heading font-bold text-foreground tracking-tight">Messages</h2>
                <div className="mt-4 relative group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input
                    placeholder="Search channels & people..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 bg-sidebar-accent/50 border-sidebar-border rounded-2xl focus-visible:ring-primary/50 h-10 shadow-sm transition-all focus-within:shadow-md text-foreground placeholder:text-muted-foreground"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1 bg-transparent md:bg-sidebar-accent/10">
                {filteredChats.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-6 opacity-60">
                    <Inbox className="h-10 w-10 text-muted-foreground mb-3" />
                    <p className="text-sm font-medium text-foreground">No signals found</p>
                    <p className="text-xs text-muted-foreground mt-1">Try a different search term</p>
                  </div>
                ) : (
                  filteredChats.map(chat => (
                    <button
                      key={chat.id}
                      onClick={() => handleChatSelect(chat)}
                      aria-label={`Open channel for ${chat.name}`}
                      aria-current={activeChat.id === chat.id ? "page" : undefined}
                      className={cn(
                        "w-full text-left p-3 rounded-2xl transition-all duration-300 flex items-start gap-4 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                        activeChat.id === chat.id
                          ? "bg-card shadow-sm border border-border/50"
                          : "hover:bg-card/50 border border-transparent"
                      )}
                    >
                      <div className="relative shrink-0">
                        <div className={cn(
                          "h-12 w-12 rounded-full flex items-center justify-center font-heading font-bold text-sm transition-colors border shadow-inner",
                          activeChat.id === chat.id
                            ? "bg-primary text-primary-foreground border-primary/20 gold-glow"
                            : "bg-sidebar-accent text-muted-foreground border-sidebar-border group-hover:bg-primary/10 group-hover:text-primary group-hover:border-primary/20"
                        )}>
                          {chat.initials}
                        </div>
                        {chat.status === "online" && (
                          <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full bg-success border-2 border-card md:border-sidebar shadow-sm"></span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="flex justify-between items-baseline mb-1">
                          <h3 className="font-semibold truncate pr-2 text-sm tracking-tight text-foreground group-hover:text-primary transition-colors">
                            {chat.name}
                          </h3>
                          <span className="text-[10px] font-mono text-muted-foreground shrink-0">{chat.time}</span>
                        </div>
                        <p className="text-[10px] font-mono text-primary/80 truncate mb-1 opacity-80 uppercase tracking-wider">
                          {chat.context}
                        </p>
                        <p className={cn(
                          "text-xs truncate transition-colors",
                          chat.unread ? "font-bold text-foreground" : "text-muted-foreground group-hover:text-foreground/80"
                        )}>
                          {chat.lastMessage}
                        </p>
                      </div>
                      {chat.unread > 0 && (
                        <div className="h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold self-center shadow-[0_0_10px_rgba(var(--primary),0.3)]">
                          {chat.unread}
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Detail Panel */}
          <div className={cn(
            "flex-1 flex flex-col min-w-0 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] md:translate-x-0 md:static absolute inset-0 z-30 bg-background md:bg-transparent motion-reduce:transition-none",
            !isMobileListOpen ? "translate-x-0" : "hidden md:flex md:pointer-events-auto"
          )}>
            <div className="flex-1 flex flex-col md:glass-panel-dark md:rounded-3xl overflow-hidden border-0 md:border md:border-sidebar-border md:shadow-2xl relative bg-transparent md:bg-sidebar/30">

              {/* Header */}
              <div className="h-[76px] px-4 md:px-6 border-b border-sidebar-border/50 flex items-center justify-between bg-sidebar/80 backdrop-blur-xl shrink-0 z-20">
                <div className="flex items-center gap-3">
                  <button
                    className="md:hidden p-2 -ml-2 text-muted-foreground hover:text-foreground rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    onClick={handleBackToList}
                    aria-label="Back to conversations"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <div className="h-10 w-10 rounded-full flex items-center justify-center font-heading font-bold text-sm bg-primary/10 text-primary border border-primary/20 shadow-[inset_0_0_10px_rgba(var(--primary),0.1)]">
                    {activeChat.initials}
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground tracking-tight">
                      {activeChat.name}
                    </h3>
                    <p className="text-[11px] font-mono text-muted-foreground mt-0.5 flex items-center gap-1.5 opacity-80 uppercase tracking-widest">
                      <span className={cn("w-1.5 h-1.5 rounded-full shadow-sm", activeChat.status === 'online' ? 'bg-success shadow-success/50' : 'bg-muted-foreground')} />
                      {activeChat.context}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground rounded-full hover:bg-sidebar-accent" aria-label="Channel options">
                    <MoreVertical className="h-5 w-5" />
                  </Button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 flex flex-col custom-scrollbar relative bg-transparent md:bg-transparent">
                <div className="text-center my-4 relative z-10 flex items-center justify-center">
                  <div className="h-px bg-sidebar-border/50 flex-1"></div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground px-4 py-1 bg-sidebar/50 backdrop-blur-sm rounded-full border border-sidebar-border shadow-sm mx-4">
                    Session Log — Today
                  </span>
                  <div className="h-px bg-sidebar-border/50 flex-1"></div>
                </div>

                {activeMessages.map(msg => (
                  <div key={msg.id} className={cn("flex max-w-[85%] md:max-w-[70%] z-10 relative group", msg.sender === 'me' ? 'ml-auto justify-end' : '')}>
                    <div className={cn("flex flex-col", msg.sender === 'me' ? 'items-end' : 'items-start')}>
                      <div className={cn(
                        "px-5 py-3.5 text-sm leading-relaxed shadow-lg transition-transform duration-200",
                        msg.sender === 'me'
                          ? 'bg-primary text-primary-foreground rounded-2xl rounded-tr-sm border border-primary/20'
                          : 'bg-card border border-border/40 text-foreground rounded-2xl rounded-tl-sm'
                      )}>
                        <p>{msg.text}</p>
                      </div>
                      <div className={cn(
                        "flex items-center gap-1.5 mt-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground px-2 transition-opacity motion-reduce:opacity-100",
                        "opacity-100 md:opacity-0 md:group-hover:opacity-100"
                      )}>
                        <span>{msg.time}</span>
                        {msg.sender === 'me' && <ShieldCheck className="h-3 w-3 text-primary/60" />}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} className="h-1" />
              </div>

              {/* Input */}
              <div className="p-4 md:p-5 bg-sidebar/80 backdrop-blur-xl border-t border-sidebar-border/50 shrink-0 z-20">
                <div className="max-w-4xl mx-auto relative flex items-end gap-2 bg-sidebar border border-sidebar-border p-1.5 rounded-3xl focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all shadow-[inset_0_2px_5px_rgba(0,0,0,0.2)]">
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground rounded-full h-10 w-10 shrink-0 self-end mb-0.5" aria-label="Attach file">
                    <Paperclip className="h-5 w-5" />
                  </Button>
                  <textarea
                    placeholder="Transmit message..."
                    className="flex-1 bg-transparent border-none text-foreground placeholder:text-muted-foreground focus-visible:outline-none resize-none py-3 px-2 min-h-[44px] max-h-32 text-sm leading-relaxed custom-scrollbar font-sans"
                    rows={1}
                    value={message}
                    onChange={e => {
                      setMessage(e.target.value)
                      e.target.style.height = 'auto';
                      e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSend()
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    className={cn(
                      "h-10 w-10 rounded-full transition-all duration-300 shrink-0 self-end mb-0.5",
                      message.trim()
                        ? "bg-primary text-primary-foreground shadow-[0_0_15px_rgba(var(--primary),0.3)] hover:bg-primary/90 hover:scale-105"
                        : "bg-sidebar-accent text-muted-foreground opacity-50 cursor-not-allowed border border-sidebar-border"
                    )}
                    disabled={!message.trim()}
                    onClick={handleSend}
                    aria-label="Send message"
                  >
                    <Send className="h-4 w-4 ml-0.5" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </AppLayout>
  )
}
