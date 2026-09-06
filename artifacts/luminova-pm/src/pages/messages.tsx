import * as React from "react"
import { AppLayout } from "@/components/layout/app-layout"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Search, Send, Paperclip, MoreVertical, CheckCircle2 } from "lucide-react"

// Dummy data for visual design since no messages hook provided
const CHATS = [
  { id: 1, name: "City Electric", unread: 2, lastMessage: "We'll be on site at 7am tomorrow.", time: "10:42 AM", initials: "CE" },
  { id: 2, name: "Downtown Office Reno", unread: 0, lastMessage: "Client approved the lighting change.", time: "Yesterday", initials: "DR" },
  { id: 3, name: "Sarah Jenkins (Client)", unread: 0, lastMessage: "Thanks for the update!", time: "Tuesday", initials: "SJ" },
  { id: 4, name: "Apex Plumbing", unread: 0, lastMessage: "Invoice submitted to the portal.", time: "Monday", initials: "AP" },
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

  return (
    <AppLayout>
      <div className="flex-1 flex overflow-hidden bg-background">
        
        {/* Chat List (Sidebar) */}
        <div className="w-full md:w-80 border-r border-border bg-card flex flex-col shrink-0">
          <div className="p-4 border-b border-border space-y-4">
            <h2 className="text-xl font-heading font-semibold text-foreground">Messages</h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search messages..." className="pl-9 bg-background" />
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {CHATS.map(chat => (
              <div 
                key={chat.id}
                onClick={() => setActiveChat(chat)}
                className={`p-4 border-b border-border cursor-pointer transition-colors flex items-start gap-3 hover:bg-muted/50 ${activeChat.id === chat.id ? 'bg-muted' : ''}`}
              >
                <Avatar className="mt-0.5">
                  <AvatarFallback className="bg-primary/20 text-primary">{chat.initials}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-1">
                    <h3 className={`font-medium truncate pr-2 ${chat.unread ? 'text-foreground' : 'text-foreground/80'}`}>{chat.name}</h3>
                    <span className="text-xs text-muted-foreground shrink-0">{chat.time}</span>
                  </div>
                  <p className={`text-sm truncate ${chat.unread ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                    {chat.lastMessage}
                  </p>
                </div>
                {chat.unread > 0 && (
                  <div className="shrink-0 h-5 w-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-[10px] font-bold mt-1.5">
                    {chat.unread}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Chat Area */}
        <div className="hidden md:flex flex-col flex-1 bg-background relative">
          {/* Header */}
          <div className="h-16 px-6 border-b border-border flex items-center justify-between bg-card shrink-0 shadow-sm z-10">
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarFallback className="bg-primary/20 text-primary">{activeChat.initials}</AvatarFallback>
              </Avatar>
              <div>
                <h3 className="font-medium text-foreground">{activeChat.name}</h3>
                <p className="text-xs text-success flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-success"></span> Online
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-5 w-5 text-muted-foreground" />
            </Button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 flex flex-col">
            <div className="text-center my-4">
              <span className="text-xs font-medium bg-muted text-muted-foreground px-3 py-1 rounded-full">Today</span>
            </div>
            
            {MESSAGES.map(msg => (
              <div key={msg.id} className={`flex max-w-[75%] ${msg.sender === 'me' ? 'ml-auto justify-end' : ''}`}>
                <div className={`flex flex-col ${msg.sender === 'me' ? 'items-end' : 'items-start'}`}>
                  <div className={`px-4 py-2.5 rounded-2xl ${msg.sender === 'me' ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-card border border-border text-foreground rounded-tl-sm shadow-sm'}`}>
                    <p className="text-sm">{msg.text}</p>
                  </div>
                  <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground px-1">
                    <span>{msg.time}</span>
                    {msg.sender === 'me' && <CheckCircle2 className="h-3 w-3 text-primary" />}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="p-4 bg-card border-t border-border shrink-0">
            <div className="max-w-4xl mx-auto relative flex items-center">
              <Button variant="ghost" size="icon" className="absolute left-2 text-muted-foreground hover:text-foreground">
                <Paperclip className="h-5 w-5" />
              </Button>
              <Input 
                placeholder="Type a message..." 
                className="pl-12 pr-12 h-12 bg-background border-input shadow-sm rounded-full"
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
                className={`absolute right-1.5 h-9 w-9 rounded-full transition-colors ${message ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted'}`}
                disabled={!message}
                onClick={() => setMessage("")}
              >
                <Send className="h-4 w-4 ml-0.5" />
              </Button>
            </div>
          </div>
        </div>

      </div>
    </AppLayout>
  )
}
