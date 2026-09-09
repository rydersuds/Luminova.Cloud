import * as React from "react"
import {
  getGetProjectConversationsQueryKey,
  useCreateProjectMessage,
  useGetProjectConversations,
  type ProjectConversation,
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { ChevronLeft, Inbox, Search, Send, ShieldCheck } from "lucide-react"
import { AppLayout } from "@/components/layout/app-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

const initialsFor = (title: string) =>
  title.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()

const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

export default function Messages() {
  const queryClient = useQueryClient()
  const requestedId = React.useMemo(
    () => new URLSearchParams(window.location.search).get("conversation"),
    [],
  )
  const { data: conversations = [], isLoading, isError } = useGetProjectConversations()
  const createMessage = useCreateProjectMessage()
  const [activeId, setActiveId] = React.useState<string | null>(requestedId)
  const [message, setMessage] = React.useState("")
  const [isMobileListOpen, setIsMobileListOpen] = React.useState(!requestedId)
  const [searchQuery, setSearchQuery] = React.useState("")
  const messagesEndRef = React.useRef<HTMLDivElement>(null)
  const activeChat = conversations.find((chat) => chat.id === activeId) ?? conversations[0]
  const activeMessages = activeChat?.messages ?? []

  React.useEffect(() => {
    if (activeChat && activeChat.id !== activeId) setActiveId(activeChat.id)
  }, [activeChat, activeId])

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [activeChat?.id, activeMessages.length])

  const selectChat = (chat: ProjectConversation) => {
    setActiveId(chat.id)
    setIsMobileListOpen(false)
    window.history.replaceState(null, "", `/messages?conversation=${encodeURIComponent(chat.id)}`)
  }

  const handleSend = () => {
    const text = message.trim()
    if (!activeChat || !text || createMessage.isPending) return
    createMessage.mutate({ conversationId: activeChat.id, data: { text } }, {
      onSuccess: async () => {
        setMessage("")
        await queryClient.invalidateQueries({ queryKey: getGetProjectConversationsQueryKey() })
      },
    })
  }

  const normalizedSearch = searchQuery.trim().toLowerCase()
  const filteredChats = conversations.filter((chat) =>
    `${chat.title} ${chat.context} ${chat.projectName}`.toLowerCase().includes(normalizedSearch),
  )

  return (
    <AppLayout>
      <div className="dark relative flex flex-1 overflow-hidden bg-background text-foreground">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 bg-[#080808]" />
          <div className="absolute -left-[10%] -top-[20%] h-[60%] w-[60%] animate-pulse rounded-full bg-primary/10 blur-[140px] motion-reduce:animate-none" />
          <div className="absolute -bottom-[20%] -right-[10%] h-[60%] w-[60%] animate-pulse rounded-full bg-primary/5 blur-[140px] motion-reduce:animate-none" />
        </div>
        <div className="relative z-10 mx-auto flex min-w-0 w-full max-w-[1600px] flex-1 gap-6 p-0 md:p-6">
          <div className={cn(
            "absolute inset-0 z-20 flex w-full max-w-full shrink-0 flex-col bg-background md:static md:flex md:w-72 md:translate-x-0 md:bg-transparent lg:w-96",
            isMobileListOpen ? "translate-x-0" : "hidden md:flex",
          )}>
            <div className="flex flex-1 flex-col overflow-hidden md:rounded-3xl md:border md:border-sidebar-border md:bg-sidebar/40 md:shadow-2xl">
              <div className="shrink-0 border-b border-sidebar-border/50 bg-sidebar/80 p-4 backdrop-blur-xl md:p-6">
                <h2 className="font-heading text-2xl font-bold tracking-tight">Messages</h2>
                <div className="relative mt-4">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search channels & people..."
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="h-10 rounded-2xl border-sidebar-border bg-sidebar-accent/50 pl-9"
                  />
                </div>
              </div>
              <div className="custom-scrollbar flex-1 space-y-1 overflow-y-auto p-3">
                {isLoading ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">Loading conversations…</p>
                ) : filteredChats.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                    <Inbox className="mb-3 h-10 w-10 text-muted-foreground" />
                    <p className="text-sm font-medium">{isError ? "Conversations unavailable" : searchQuery ? "No signals found" : "No conversations found"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {searchQuery ? "Try a different search term" : "Project conversations will appear here"}
                    </p>
                  </div>
                ) : filteredChats.map((chat) => {
                  const latest = chat.messages.at(-1)
                  return (
                    <button
                      key={chat.id}
                      type="button"
                      onClick={() => selectChat(chat)}
                      aria-label={`Open channel for ${chat.title}`}
                      aria-current={activeChat?.id === chat.id ? "page" : undefined}
                      className={cn(
                        "flex w-full items-start gap-4 rounded-2xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                        activeChat?.id === chat.id ? "border-border/50 bg-card" : "border-transparent hover:bg-card/50",
                      )}
                    >
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 font-heading text-sm font-bold text-primary">
                        {initialsFor(chat.title)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-semibold">{chat.title}</span>
                          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{latest ? formatTime(latest.createdAt) : ""}</span>
                        </span>
                        <span className="mt-1 block truncate font-mono text-[10px] uppercase tracking-wider text-primary/80">
                          {chat.context} • {chat.projectName}
                        </span>
                        <span className="mt-1 block truncate text-xs text-muted-foreground">{latest?.text ?? "No messages yet"}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {activeChat ? (
            <div className={cn(
              "absolute inset-0 z-30 flex min-w-0 flex-1 flex-col bg-background md:static md:flex md:bg-transparent",
              isMobileListOpen ? "hidden md:flex" : "flex",
            )}>
              <div className="flex min-w-0 flex-1 flex-col overflow-hidden md:rounded-3xl md:border md:border-sidebar-border md:bg-sidebar/30 md:shadow-2xl">
                <header className="flex h-[76px] shrink-0 items-center gap-3 border-b border-sidebar-border/50 bg-sidebar/80 px-4 backdrop-blur-xl md:px-6">
                  <button type="button" onClick={() => setIsMobileListOpen(true)} className="rounded-full p-2 md:hidden" aria-label="Back to conversations">
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/20 bg-primary/10 font-heading text-sm font-bold text-primary">
                    {initialsFor(activeChat.title)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{activeChat.title}</span>
                    <span className="block truncate font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                      {activeChat.context} • {activeChat.projectName}
                    </span>
                  </span>
                </header>
                <div className="custom-scrollbar flex flex-1 flex-col space-y-6 overflow-y-auto p-4 md:p-6">
                  {activeMessages.length === 0 && (
                    <p className="my-auto text-center text-sm text-muted-foreground">No messages yet. Start the conversation below.</p>
                  )}
                  {activeMessages.map((item) => (
                    <div key={item.id} className="group ml-auto flex max-w-[85%] justify-end md:max-w-[70%]">
                      <div className="flex flex-col items-end">
                        <div className="rounded-2xl rounded-tr-sm border border-primary/20 bg-primary px-5 py-3.5 text-sm leading-relaxed text-primary-foreground shadow-lg">
                           <p className="break-words">{item.text}</p>
                        </div>
                        <div className="mt-1.5 flex items-center gap-1.5 px-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          <span>{formatTime(item.createdAt)}</span>
                          <ShieldCheck className="h-3 w-3 text-primary/60" />
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
                <div className="shrink-0 border-t border-sidebar-border/50 bg-sidebar/80 p-4 backdrop-blur-xl md:p-5">
                  <div className="mx-auto flex max-w-4xl items-end gap-2 rounded-3xl border border-sidebar-border bg-sidebar p-1.5 focus-within:border-primary/50">
                    <textarea
                      placeholder="Transmit message..."
                      rows={1}
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault()
                          handleSend()
                        }
                      }}
                      className="custom-scrollbar min-h-[44px] max-h-32 flex-1 resize-none bg-transparent px-3 py-3 text-sm focus-visible:outline-none"
                    />
                    <Button
                      size="icon"
                      onClick={handleSend}
                      disabled={!message.trim() || createMessage.isPending}
                      className="mb-0.5 h-10 w-10 shrink-0 rounded-full"
                      aria-label="Send message"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                  {createMessage.isError && <p role="alert" className="mt-2 text-center text-xs text-destructive">Message could not be sent. Try again.</p>}
                </div>
              </div>
            </div>
          ) : !isLoading ? (
            <div className="hidden flex-1 items-center justify-center text-sm text-muted-foreground md:flex">Select a project conversation</div>
          ) : null}
        </div>
      </div>
    </AppLayout>
  )
}