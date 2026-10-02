import * as React from "react"
import { Link, useLocation, useSearch } from "wouter"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  getGetProjectConversationsQueryKey,
  useCreateProjectMessage,
  useGetProjectConversations,
  useCreateProjectConversation,
  useGetChatOptions,
  type ProjectConversation,
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { ChevronLeft, Inbox, Search, Send, ShieldCheck, Plus, X, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

const initialsFor = (title: string) =>
  title.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()

const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

const errorMessage = (error: unknown, fallback: string) => {
  const candidate = error as { data?: { error?: string }; message?: string }
  return candidate.data?.error || candidate.message || fallback
}

const conversationSchema = z.object({
  type: z.enum(["direct", "project"]),
  participantIds: z.array(z.string()).min(1, "Select at least one participant"),
  projectId: z.string().optional(),
  title: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.type === "project") {
    if (!data.projectId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Project is required for project channels",
        path: ["projectId"],
      })
    }
    if (!data.title?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Title is required for project channels",
        path: ["title"],
      })
    }
  }
})

export default function Messages() {
  const queryClient = useQueryClient()
  const [, setLocation] = useLocation()
  const routeSearch = useSearch()
  const routeQuery = React.useMemo(() => new URLSearchParams(routeSearch), [routeSearch])
  const requestedId = routeQuery.get("conversation")
  const requestedProjectId = routeQuery.get("projectId")

  const { data: conversations = [], isLoading, isError } = useGetProjectConversations()
  const { data: chatOptions, isLoading: areOptionsLoading, isError: areOptionsUnavailable } = useGetChatOptions()
  const currentUserId = chatOptions?.currentUserId

  const createMessage = useCreateProjectMessage()
  const createConversation = useCreateProjectConversation()

  const [drafts, setDrafts] = React.useState<Record<string, string>>({})
  const [isMobileListOpen, setIsMobileListOpen] = React.useState(!requestedId)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [isNewChatOpen, setIsNewChatOpen] = React.useState(false)
  const [participantsOpen, setParticipantsOpen] = React.useState(false)
  const [projectSearch, setProjectSearch] = React.useState("")

  const messagesEndRef = React.useRef<HTMLDivElement>(null)
  const scopedConversations = requestedProjectId ? conversations.filter(chat => chat.projectId === requestedProjectId) : conversations
  // A directed link must never silently open an unrelated conversation.
  const activeChat = requestedId ? scopedConversations.find(chat => chat.id === requestedId)
    : requestedProjectId ? scopedConversations.find(chat => chat.type === "project") ?? scopedConversations[0] : scopedConversations[0]
  const activeId = activeChat?.id
  const message = activeId ? drafts[activeId] ?? "" : ""
  const setMessage = (value: string) => {
    if (activeId) setDrafts(current => ({ ...current, [activeId]: value }))
  }
  const activeMessages = activeChat?.messages ?? []

  const form = useForm<z.infer<typeof conversationSchema>>({
    resolver: zodResolver(conversationSchema),
    defaultValues: {
      type: "direct",
      participantIds: [],
      projectId: "",
      title: "",
    }
  })
  const selectedType = form.watch("type")
  const selectedProjectId = form.watch("projectId")
  const selectedProject = chatOptions?.projects.find((project) => project.id === selectedProjectId)
  const availableParticipants = selectedType === "project" && selectedProject
    ? (chatOptions?.participants ?? []).filter((participant) => selectedProject.eligibleParticipantIds.includes(participant.id))
    : (chatOptions?.participants ?? [])
  const normalizedProjectSearch = projectSearch.trim().toLowerCase()
  const visibleProjects = (chatOptions?.projects ?? []).filter((project) =>
    `${project.name} ${project.clientName}`.toLowerCase().includes(normalizedProjectSearch),
  )

  React.useEffect(() => {
    if (selectedType !== "project" || !selectedProject) return
    const selected = form.getValues("participantIds")
    const eligible = selected.filter((id) => selectedProject.eligibleParticipantIds.includes(id))
    if (eligible.length !== selected.length) {
      form.setValue("participantIds", eligible, { shouldValidate: true })
    }
  }, [form, selectedProject, selectedType])

  React.useEffect(() => {
    if (requestedId) setIsMobileListOpen(false)
    else if (requestedProjectId && !isLoading) setIsMobileListOpen(scopedConversations.length === 0)
  }, [requestedId, requestedProjectId, isLoading, scopedConversations.length])

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [activeChat?.id, activeMessages.length])

  const selectChat = (chat: ProjectConversation) => {
    setIsMobileListOpen(false)
    const query = new URLSearchParams(routeSearch)
    query.set("conversation", chat.id)
    setLocation(`/messages?${query}`)
  }
  const openNewChat = () => {
    const project = chatOptions?.projects.find(project => project.id === requestedProjectId)
    if (project) form.reset({ type: "project", projectId: project.id, participantIds: [], title: `${project.name} updates` })
    setIsNewChatOpen(true)
  }

  const handleSend = () => {
    const text = message.trim()
    if (!activeChat || !text || createMessage.isPending) return
    const conversationId = activeChat.id
    createMessage.mutate({ conversationId, data: { text } }, {
      onSuccess: async () => {
        setDrafts(current => current[conversationId]?.trim() === text ? { ...current, [conversationId]: "" } : current)
        await queryClient.invalidateQueries({ queryKey: getGetProjectConversationsQueryKey() })
      },
    })
  }

  const onCreateSubmit = (data: z.infer<typeof conversationSchema>) => {
    createConversation.mutate({
      data: {
        type: data.type,
        participantIds: data.participantIds,
        projectId: data.projectId || undefined,
        title: data.title || undefined,
      }
    }, {
      onSuccess: async (newChat) => {
        queryClient.setQueryData<ProjectConversation[]>(
          getGetProjectConversationsQueryKey(),
          (current = []) => [newChat, ...current.filter((chat) => chat.id !== newChat.id)],
        )
        setIsMobileListOpen(false)
        const query = new URLSearchParams(routeSearch)
        query.set("conversation", newChat.id)
        if (requestedProjectId) {
          if (newChat.projectId) query.set("projectId", newChat.projectId)
          else query.delete("projectId")
        }
        setLocation(`/messages?${query}`)
        setIsNewChatOpen(false)
        form.reset()
        setProjectSearch("")
        await queryClient.invalidateQueries({ queryKey: getGetProjectConversationsQueryKey() })
      }
    })
  }

  const normalizedSearch = searchQuery.trim().toLowerCase()
  const filteredChats = scopedConversations.filter((chat) =>
    `${chat.title} ${chat.context} ${chat.projectName}`.toLowerCase().includes(normalizedSearch),
  )

  return (
    <>
      <div className="dark relative flex flex-1 overflow-hidden bg-background text-foreground">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 bg-[#080808]" />
          <div className="absolute -left-[10%] -top-[20%] h-[60%] w-[60%] animate-pulse rounded-full bg-primary/10 motion-reduce:animate-none" />
          <div className="absolute -bottom-[20%] -right-[10%] h-[60%] w-[60%] animate-pulse rounded-full bg-primary/5 motion-reduce:animate-none" />
        </div>
        <div className="relative z-10 mx-auto flex min-w-0 w-full max-w-[1600px] flex-1 gap-6 p-0 md:p-6">
          <div className={cn(
            "absolute inset-0 z-20 flex w-full max-w-full shrink-0 flex-col bg-background md:static md:flex md:w-72 md:translate-x-0 md:bg-transparent lg:w-96",
            isMobileListOpen ? "translate-x-0" : "hidden md:flex",
          )}>
            <div className="flex flex-1 flex-col overflow-hidden md:rounded-3xl md:border md:border-sidebar-border md:bg-sidebar/40 md:shadow-2xl">
              <div className="shrink-0 border-b border-sidebar-border/50 bg-sidebar p-4 md:p-6">
                <div className="flex items-center justify-between">
                  <h2 className="font-heading text-2xl font-bold tracking-tight">Messages</h2>
                  <Button size="icon" variant="outline" onClick={openNewChat} className="h-8 w-8 rounded-full border-sidebar-border" data-testid="button-new-conversation">
                    <Plus className="h-4 w-4" />
                    <span className="sr-only">New Conversation</span>
                  </Button>
                </div>
                {requestedProjectId && (
                  <div className="mt-3 space-y-2 text-xs" data-testid="messages-project-context">
                    <p>Project channels: {chatOptions?.projects.find(project => project.id === requestedProjectId)?.name ?? "selected project"}</p>
                    <div className="flex flex-wrap gap-3">
                      <Link className="underline" href={`/projects/${encodeURIComponent(requestedProjectId)}`}>Back to project</Link>
                      <Link className="underline" href="/messages">All messages</Link>
                    </div>
                  </div>
                )}
                {requestedId && !isLoading && !activeChat && (
                  <p role="alert" className="mt-3 text-xs text-destructive">This conversation is unavailable. Choose an available channel instead.</p>
                )}
                <div className="relative mt-4">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search channels & people..."
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="h-10 rounded-2xl border-sidebar-border bg-sidebar-accent/50 pl-9"
                    data-testid="input-search-conversations"
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
                      {searchQuery ? "Try a different search term" : "Start a direct or project chat with New Conversation"}
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
                      data-testid={`button-chat-${chat.id}`}
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
                          <span className="truncate text-sm font-semibold" data-testid={`chat-title-${chat.id}`}>{chat.title}</span>
                          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{latest ? formatTime(latest.createdAt) : ""}</span>
                        </span>
                        <span className="mt-1 block truncate font-mono text-[10px] uppercase tracking-wider text-primary/80">
                          {chat.type === "project" ? `${chat.context || 'Channel'} • ${chat.projectName || 'General'}` : (chat.context || 'Direct Message')}
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
                <header className="flex h-[76px] shrink-0 items-center gap-3 border-b border-sidebar-border/50 bg-sidebar px-4 md:px-6">
                  <button type="button" onClick={() => setIsMobileListOpen(true)} className="rounded-full p-2 md:hidden" aria-label="Back to conversations">
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/20 bg-primary/10 font-heading text-sm font-bold text-primary">
                    {initialsFor(activeChat.title)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-bold" data-testid="active-chat-title">{activeChat.title}</span>
                    <span className="block truncate font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                      {activeChat.type === "project" ? `${activeChat.context || 'Channel'} • ${activeChat.projectName || 'General'}` : (activeChat.context || 'Direct Message')}
                    </span>
                  </span>
                </header>
                <div className="custom-scrollbar flex flex-1 flex-col space-y-6 overflow-y-auto p-4 md:p-6">
                  {activeMessages.length === 0 && (
                    <p className="my-auto text-center text-sm text-muted-foreground">No messages yet. Start the conversation below.</p>
                  )}
                  {activeMessages.map((item) => {
                    const isMe = currentUserId === item.senderId

                    return (
                      <div key={item.id} className={cn("group flex w-full", isMe ? "justify-end" : "justify-start")} data-testid={`message-${item.id}`}>
                        <div className={cn("flex flex-col max-w-[85%] md:max-w-[70%]", isMe ? "items-end" : "items-start")}>
                          {!isMe && (
                            <span className="mb-1 ml-1 text-xs font-medium text-muted-foreground" data-testid={`message-sender-${item.id}`}>
                              {item.sender.name}
                            </span>
                          )}
                          <div className={cn(
                            "rounded-2xl px-5 py-3.5 text-sm leading-relaxed shadow-lg",
                            isMe
                              ? "rounded-tr-sm border border-primary/20 bg-primary text-primary-foreground"
                              : "rounded-tl-sm border border-border bg-card text-card-foreground"
                          )}>
                             <p className="break-words" data-testid={`message-text-${item.id}`}>{item.text}</p>
                          </div>
                          <div className="mt-1.5 flex items-center gap-1.5 px-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                            <span data-testid={`message-time-${item.id}`}>{formatTime(item.createdAt)}</span>
                            {isMe && <ShieldCheck className="h-3 w-3 text-primary/60" />}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <div ref={messagesEndRef} />
                </div>
                <div className="shrink-0 border-t border-sidebar-border/50 bg-sidebar p-4 md:p-5">
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
                      data-testid="input-message"
                    />
                    <Button
                      size="icon"
                      onClick={handleSend}
                      disabled={!message.trim() || createMessage.isPending}
                      className="mb-0.5 h-10 w-10 shrink-0 rounded-full"
                      aria-label="Send message"
                      data-testid="button-send-message"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                  {createMessage.isError && <p role="alert" className="mt-2 text-center text-xs text-destructive">Message could not be sent. Try again.</p>}
                </div>
              </div>
            </div>
          ) : !isLoading ? (
            <div className={cn("flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center text-sm text-muted-foreground", isMobileListOpen && "hidden md:flex")}>
              <p role={requestedId ? "alert" : undefined}>
                {requestedId ? "This conversation is unavailable. Choose an available channel instead." : requestedProjectId ? "No channels are available for this project yet." : "Select a conversation or start a new one"}
              </p>
              <Button variant="outline" onClick={() => setIsMobileListOpen(true)} className="md:hidden">Choose a conversation</Button>
              <Button variant="outline" onClick={openNewChat}>New conversation</Button>
            </div>
          ) : null}
        </div>
      </div>

      <Dialog open={isNewChatOpen} onOpenChange={(open) => {
        setIsNewChatOpen(open)
        if (!open) {
          form.reset()
          setParticipantsOpen(false)
          setProjectSearch("")
        }
      }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>New Conversation</DialogTitle>
            <DialogDescription>Start a direct message or project channel.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onCreateSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Conversation Type</FormLabel>
                    <FormControl>
                      <Tabs value={field.value} onValueChange={(val) => {
                        field.onChange(val)
                        if (val === 'direct') {
                          form.setValue('projectId', '')
                          form.setValue('title', '')
                        }
                      }} className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                          <TabsTrigger value="direct" data-testid="tab-type-direct">Direct Message</TabsTrigger>
                          <TabsTrigger value="project" data-testid="tab-type-project">Project Channel</TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </FormControl>
                  </FormItem>
                )}
              />

              {selectedType === "project" && (
                <>
                  <FormField
                    control={form.control}
                    name="projectId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project</FormLabel>
                        <Input
                          value={projectSearch}
                          onChange={(event) => setProjectSearch(event.target.value)}
                          placeholder="Search projects..."
                          aria-label="Search projects"
                          disabled={areOptionsLoading || areOptionsUnavailable}
                        />
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-project">
                              <SelectValue placeholder="Select a project" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                             {visibleProjects.map(p => (
                              <SelectItem key={p.id} value={p.id} data-testid={`item-project-${p.id}`}>
                                {p.name} <span className="text-muted-foreground">({p.clientName})</span>
                              </SelectItem>
                            ))}
                             {!visibleProjects.length && (
                               <div className="px-3 py-5 text-center text-sm text-muted-foreground">No available projects found.</div>
                             )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Channel Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Site Updates" {...field} data-testid="input-channel-title" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              <FormField
                control={form.control}
                name="participantIds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Participants</FormLabel>
                    <FormControl>
                      <div>
                        <Popover open={participantsOpen} onOpenChange={setParticipantsOpen}>
                          <PopoverTrigger asChild>
                             <Button
                               variant="outline"
                               role="combobox"
                               aria-expanded={participantsOpen}
                               className="w-full justify-between font-normal"
                               data-testid="button-select-participants"
                               disabled={areOptionsLoading || areOptionsUnavailable || (selectedType === "project" && !selectedProject)}
                             >
                               {areOptionsLoading ? "Loading workspace members…" : field.value.length > 0 ? `${field.value.length} selected` : "Select participants..."}
                            </Button>
                          </PopoverTrigger>
                           <PopoverContent className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0" align="start">
                            <Command>
                              <CommandInput placeholder="Search people..." data-testid="input-search-participants" />
                              <CommandList>
                                <CommandEmpty>No one found.</CommandEmpty>
                                <CommandGroup>
                                   {availableParticipants.map(p => {
                                    if (p.id === currentUserId) return null
                                    const isSelected = field.value.includes(p.id)
                                    return (
                                      <CommandItem
                                        key={p.id}
                                        value={`${p.name} ${p.email}`}
                                        onSelect={() => {
                                          if (isSelected) {
                                            field.onChange(field.value.filter((id) => id !== p.id))
                                          } else {
                                            field.onChange([...field.value, p.id])
                                          }
                                        }}
                                        data-testid={`item-participant-${p.id}`}
                                      >
                                        <div className={cn("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border", isSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground opacity-50 [&_svg]:invisible")}>
                                          <Check className="h-4 w-4" />
                                        </div>
                                        <span className="font-medium">{p.name}</span>
                                        <span className="ml-2 text-xs text-muted-foreground">{p.role}</span>
                                      </CommandItem>
                                    )
                                  })}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {field.value.map(id => {
                            const p = chatOptions?.participants.find(x => x.id === id)
                            if (!p) return null
                            return (
                              <div key={id} className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground" data-testid={`tag-participant-${id}`}>
                                {p.name}
                                <button
                                  type="button"
                                  onClick={() => field.onChange(field.value.filter((x) => x !== id))}
                                  className="ml-1 rounded-full p-0.5 hover:bg-secondary-foreground/20"
                                  data-testid={`button-remove-participant-${id}`}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
               {areOptionsUnavailable && (
                 <p role="alert" className="text-sm font-medium text-destructive">Workspace members and projects could not be loaded. Close this dialog and try again.</p>
               )}
               {!areOptionsLoading && !areOptionsUnavailable && chatOptions?.participants.length === 0 && (
                 <p role="status" className="text-sm text-muted-foreground">No other workspace members are available to chat.</p>
               )}
               {createConversation.isError && (
                 <p role="alert" className="text-sm font-medium text-destructive" data-testid="error-create-conversation">
                   {errorMessage(createConversation.error, "Conversation could not be created. Try again.")}
                 </p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsNewChatOpen(false)} data-testid="button-cancel-create">Cancel</Button>
                 <Button type="submit" disabled={createConversation.isPending || areOptionsLoading || areOptionsUnavailable || !chatOptions?.participants.length} data-testid="button-submit-create">
                  {createConversation.isPending ? "Creating..." : "Start Conversation"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  )
}