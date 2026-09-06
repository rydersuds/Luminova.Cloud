import * as React from "react"
import { AppLayout } from "@/components/layout/app-layout"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, Send, Paperclip, MoreVertical, ShieldCheck, Terminal, Cpu } from "lucide-react"
import { cn } from "@/lib/utils"

// Strict demo data preservation
const CHATS = [
  { id: 1, name: "City Electric", unread: 2, lastMessage: "We'll be on site at 7am tomorrow.", time: "10:42 AM", initials: "CE", status: "online" },
  { id: 2, name: "Downtown Office Reno", unread: 0, lastMessage: "Client approved the lighting change.", time: "Yesterday", initials: "DR", status: "offline" },
  { id: 3, name: "Sarah Jenkins (Client)", unread: 0, lastMessage: "Thanks for the update!", time: "Tuesday", initials: "SJ", status: "offline" },
  { id: 4, name: "Apex Plumbing", unread: 0, lastMessage: "Invoice submitted to the portal.", time: "Monday", initials: "AP", status: "online" },
]

const MESSAGES = [
  { id: 1, text: "Hey, are the framing guys done on floor 2?", sender: "me", time: "09:15 AM" },
  { id: 2, text: "Almost, they need another couple hours. We can't start rough-in until they clear out.", sender: "them", time: "09:20 AM" },
  { id: 3, text: "Understood. I'll push your start to 1PM. Does that work?", sender: "me", time: "09:25 AM" },
  { id: 4, text: "Yes, that works perfectly. We'll be on site at 7am tomorrow to finish up.", sender: "them", time: "10:42 AM" },
]

export default function Messages() {
  const [activeChat, setActiveChat] = React.useState(CHATS[0])
  const [message, setMessage] = React.useState("")
  const messagesEndRef = React.useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [activeChat])

  return (
    <AppLayout>
      <div className="comms-link flex-1 flex overflow-hidden bg-background bg-tech-grid-dense relative text-white">
        {/* Decorative Grid Overlay */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent via-background/50 to-background z-0"></div>

        <div className="flex-1 flex w-full max-w-[1600px] mx-auto z-10 relative border-l border-r border-border/30 shadow-2xl">
          
          {/* Channels Sidebar */}
          <div className="w-full md:w-80 border-r border-border/50 glass-panel-dark flex flex-col shrink-0">
            <div className="p-5 border-b border-border/50 space-y-4 bg-black/40">
              <div className="flex items-center gap-2">
                <Terminal className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-heading font-bold text-white tracking-tight uppercase">Comms Link</h2>
              </div>
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/60 group-focus-within:text-primary transition-colors" />
                <Input 
                  placeholder="Intercept signal..." 
                  className="pl-9 bg-black/50 border-border/50 text-white placeholder:text-white/50 focus-visible:ring-primary/50 font-mono text-xs h-9 rounded-none"
                />
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {CHATS.map(chat => (
                <div 
                  key={chat.id}
                  onClick={() => setActiveChat(chat)}
                  className={cn(
                    "p-4 border-b border-border/30 cursor-pointer transition-all duration-300 flex items-start gap-4 relative overflow-hidden group",
                    activeChat.id === chat.id 
                      ? "bg-primary/10 border-l-2 border-l-primary" 
                      : "hover:bg-white/5 border-l-2 border-l-transparent"
                  )}
                >
                  {/* Active highlight glow */}
                  {activeChat.id === chat.id && (
                    <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent pointer-events-none"></div>
                  )}

                  <div className={cn(
                    "h-10 w-10 shrink-0 flex items-center justify-center font-heading font-bold text-sm border relative z-10 transition-colors",
                    activeChat.id === chat.id ? "bg-primary text-primary-foreground border-primary gold-glow" : "bg-black/60 text-primary border-primary/30 group-hover:border-primary/60"
                  )}>
                    {chat.initials}
                    {chat.status === "online" && (
                      <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-success border-2 border-background"></span>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0 z-10">
                    <div className="flex justify-between items-baseline mb-1">
                      <h3 className={cn(
                        "font-medium truncate pr-2 font-mono text-sm tracking-tight",
                        chat.unread || activeChat.id === chat.id ? "text-white" : "text-white/75"
                      )}>
                        {chat.name}
                      </h3>
                      <span className="text-[10px] font-mono text-white/60 shrink-0">{chat.time}</span>
                    </div>
                    <p className={cn(
                      "text-xs truncate font-mono",
                      chat.unread ? "font-bold text-primary" : "text-white/60"
                    )}>
                      {chat.lastMessage}
                    </p>
                  </div>
                  {chat.unread > 0 && (
                    <div className="absolute top-1/2 -translate-y-1/2 right-4 h-5 w-5 bg-primary text-primary-foreground rounded-sm flex items-center justify-center text-[10px] font-bold shadow-[0_0_10px_rgba(var(--primary),0.5)] z-10">
                      {chat.unread}
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            {/* System Status footer */}
            <div className="p-3 bg-black/60 border-t border-border/50 flex items-center justify-between text-[10px] font-mono uppercase text-white/65">
              <span className="flex items-center gap-1.5"><ShieldCheck className="h-3 w-3 text-success" /> Encrypted</span>
              <span>Port: 443</span>
            </div>
          </div>

          {/* Active Terminal Area */}
          <div className="hidden md:flex flex-col flex-1 bg-black/40 backdrop-blur-md relative border-l border-border/20">
            {/* Terminal Header */}
            <div className="h-16 px-6 border-b border-border/50 flex items-center justify-between bg-card/60 backdrop-blur-xl shrink-0 shadow-sm z-20">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 flex items-center justify-center font-heading font-bold text-sm bg-primary text-primary-foreground border border-primary/50 gold-glow">
                  {activeChat.initials}
                </div>
                <div>
                  <h3 className="font-bold text-white font-mono tracking-tight flex items-center gap-2">
                    {activeChat.name}
                  </h3>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-success flex items-center gap-1.5 mt-0.5">
                    <span className="w-1.5 h-1.5 bg-success animate-pulse shadow-[0_0_5px_currentColor]"></span> 
                    Secure Link Established
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="hidden lg:flex items-center gap-2 text-[10px] font-mono text-white/60 bg-black/40 px-3 py-1.5 border border-border/30 rounded-none mr-2">
                  <Cpu className="h-3 w-3" /> Latency: 12ms
                </div>
                <Button variant="ghost" size="icon" className="text-white/65 hover:text-primary hover:bg-primary/10 rounded-none">
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </div>
            </div>

            {/* Message Feed */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 flex flex-col custom-scrollbar relative">
              <div className="absolute inset-0 bg-tech-grid-dense opacity-20 pointer-events-none"></div>
              
              <div className="text-center my-6 relative z-10 flex items-center justify-center">
                <div className="h-px bg-border/50 flex-1"></div>
                <span className="text-[10px] font-mono uppercase tracking-widest bg-black/60 text-white/65 px-4 py-1 border border-border/50 shadow-sm">
                  Session Log — Today
                </span>
                <div className="h-px bg-border/50 flex-1"></div>
              </div>
              
              {MESSAGES.map(msg => (
                <div key={msg.id} className={cn("flex max-w-[85%] z-10 relative", msg.sender === 'me' ? 'ml-auto justify-end' : '')}>
                  <div className={cn("flex flex-col", msg.sender === 'me' ? 'items-end' : 'items-start')}>
                    <div className={cn(
                      "px-5 py-3 text-sm font-mono leading-relaxed tech-clip backdrop-blur-md shadow-lg",
                      msg.sender === 'me' 
                        ? 'bg-primary text-primary-foreground border border-primary/80 gold-glow' 
                        : 'bg-card/80 border border-border/60 text-white'
                    )}>
                      <p>{msg.text}</p>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2 text-[10px] font-mono uppercase text-white/65 px-1">
                      <span>{msg.time}</span>
                      {msg.sender === 'me' && <ShieldCheck className="h-3 w-3 text-primary drop-shadow-[0_0_3px_rgba(var(--primary),0.5)]" />}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Console */}
            <div className="p-5 bg-card/60 backdrop-blur-xl border-t border-border/50 shrink-0 z-20">
              <div className="max-w-5xl mx-auto relative flex items-center bg-black/40 border border-border/50 p-1 focus-within:border-primary/50 focus-within:shadow-[0_0_15px_rgba(var(--primary),0.1)] transition-all">
                <Button variant="ghost" size="icon" className="text-white/65 hover:text-primary rounded-none h-10 w-10 shrink-0">
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Input 
                  placeholder="Transmit message..." 
                  className="flex-1 bg-transparent border-none text-white placeholder:text-white/50 focus-visible:ring-0 shadow-none font-mono text-sm px-2"
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && message) {
                      setMessage("")
                    }
                  }}
                />
                <Button 
                  size="icon" 
                  className={cn(
                    "h-10 w-10 rounded-none transition-all duration-300 shrink-0",
                    message 
                      ? "bg-primary text-primary-foreground gold-glow hover:bg-primary/90" 
                      : "bg-white/10 text-white/45 hover:bg-white/15"
                  )}
                  disabled={!message}
                  onClick={() => setMessage("")}
                >
                  <Send className="h-4 w-4 ml-0.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>

      </div>
    </AppLayout>
  )
}