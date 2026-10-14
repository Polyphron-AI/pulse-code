import { useState } from "react";
import {
  Bell,
  Bookmark,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  Folder,
  Grid2X2,
  Hash,
  Inbox,
  LayoutList,
  Link2,
  ListTodo,
  MessageSquare,
  Mic,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Settings,
  SlidersHorizontal,
  Star,
  Users,
  Video,
  X,
} from "lucide-react";
import { SidebarInset } from "../ui/sidebar";
import { Button } from "../ui/button";
import { OfficeSubnav } from "./OfficeSubnav";
import { OfficeModuleTabs } from "./OfficeModuleTabs";
import { cn } from "../../lib/utils";

type View = "communications" | "email" | "tasks" | "projects" | "meetings" | "calendar";
const names: Record<View, string> = {
  communications: "Communications",
  email: "Email",
  tasks: "Tasks",
  projects: "Projects",
  meetings: "Meetings",
  calendar: "Calendar",
};
const folders = ["SEO", "Marketing", "Website", "Products"];
const files = [
  "Q4 marketing strategy",
  "October content calendar",
  "Brand guidelines",
  "Website launch checklist",
];
const taskNames = [
  "Approve homepage copy",
  "Review October keyword plan",
  "Prepare product launch assets",
  "Publish campaign landing page",
  "Share weekly performance report",
];
const people = ["Maya Chen", "Leo Martins", "Nina Patel", "Alex Morgan"];
const railItems = {
  communications: [
    { id: "all", label: "Chats", icon: MessageSquare },
    { id: "unread", label: "Unread", icon: Bell },
    { id: "later", label: "Later", icon: Bookmark },
  ],
  email: [
    { id: "all", label: "Inbox", icon: Inbox },
    { id: "unread", label: "Unread", icon: Bell },
    { id: "later", label: "Later", icon: Bookmark },
  ],
  tasks: [
    { id: "all", label: "All tasks", icon: ListTodo },
    { id: "open", label: "Open", icon: Clock },
    { id: "done", label: "Done", icon: Check },
  ],
  projects: [
    { id: "all", label: "Projects", icon: Folder },
    { id: "connected", label: "Linked", icon: Link2 },
  ],
  meetings: [
    { id: "all", label: "Upcoming", icon: CalendarDays },
    { id: "recordings", label: "Recordings", icon: Mic },
  ],
  calendar: [
    { id: "all", label: "Agenda", icon: CalendarDays },
    { id: "week", label: "Week", icon: LayoutList },
  ],
};
function Avatar({ name, small = false }: { name: string; small?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg bg-primary/15 font-medium text-primary",
        small ? "size-6 text-3xs" : "size-9 text-xs",
      )}
    >
      {name
        .split(" ")
        .map((p) => p[0])
        .join("")}
    </span>
  );
}
function SearchField({
  placeholder,
  onChange,
}: {
  placeholder: string;
  onChange?: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-full bg-muted/60 px-3 py-2.5 text-muted-foreground">
      <Search className="size-4 shrink-0" />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
        className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none"
      />
      <SlidersHorizontal className="size-3.5" />
    </label>
  );
}

/** Development-only visual fixture. It never calls a provider or writes project data. */
export function OfficeDesignPreview({ view }: { view: View }) {
  const [rail, setRail] = useState("all");
  const [module, setModule] = useState("Files");
  const [folder, setFolder] = useState("");
  const [query, setQuery] = useState("");
  const [fileQuery, setFileQuery] = useState("");
  const [selectedMail, setSelectedMail] = useState(0);
  const [channel, setChannel] = useState("marketing");
  const [done, setDone] = useState<number[]>([4]);
  const [board, setBoard] = useState(false);
  const [draft, setDraft] = useState("");
  const [sent, setSent] = useState<string[]>([]);
  const [selectedDoc, setSelectedDoc] = useState(files[0]!);
  const [notice, setNotice] = useState("");
  const [resourceOpen, setResourceOpen] = useState(true);
  const showNotice = (text: string) => setNotice(text);
  const taskRows = taskNames
    .map((title, id) => ({ title, id }))
    .filter(
      (t) =>
        (rail !== "done" || done.includes(t.id)) &&
        (rail !== "open" || !done.includes(t.id)) &&
        t.title.toLowerCase().includes(query.toLowerCase()),
    );
  const mailSubjects = [
    "SynKEK · October launch review",
    "Your updated homepage designs",
    "SEO report: September results",
    "Product shoot · final selects",
    "Weekly marketing catch-up",
  ];
  const title =
    view === "communications" ? `# ${channel}` : view === "email" ? "Inbox" : names[view];
  const renderTask = ({ title, id }: { title: string; id: number }) => (
    <div key={id} className="flex items-center gap-3 border-b border-border/60 px-1 py-4">
      <input
        type="checkbox"
        aria-label={`Complete ${title}`}
        checked={done.includes(id)}
        onChange={() =>
          setDone((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]))
        }
        className="size-4 accent-primary"
      />
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm", done.includes(id) && "text-muted-foreground line-through")}>
          {title}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          SynKEK <span className="px-1">·</span> {id % 2 === 0 ? "Marketing" : "Website"}
        </p>
      </div>
      <span className="text-xs text-muted-foreground">{id === 0 ? "Today" : "16 Oct"}</span>
      <Avatar name={people[id % 4]!} small />
    </div>
  );
  return (
    <SidebarInset className="min-w-0 overflow-hidden">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-primary/20 bg-primary/5 px-4 text-2xs text-muted-foreground">
        <span>
          SynKEK workspace <span className="mx-2 text-border">/</span> {names[view]}
        </span>
        <span className="font-medium text-primary">Design preview · sample data</span>
      </div>
      <div className="flex min-h-0 flex-1">
        <OfficeSubnav
          label={`${names[view]} views`}
          items={railItems[view]}
          value={rail}
          onChange={setRail}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b px-5">
            <div>
              <h1 className="text-base font-semibold">{title}</h1>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {view === "communications"
                  ? "SynKEK · Slack · 8 members"
                  : view === "email"
                    ? "maya@synkek.com"
                    : view === "tasks"
                      ? "A clear plan for everything that comes next."
                      : "SynKEK · Brand & growth"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => setResourceOpen(!resourceOpen)}>
                <Folder className="size-4" />
                {resourceOpen ? "Resources" : "Open resources"}
              </Button>
              <Avatar name="Maya Chen" small />
            </div>
          </header>
          <div className="flex min-h-0 flex-1">
            {(view === "email" || view === "communications") && (
              <aside className="hidden w-[210px] shrink-0 flex-col border-r bg-muted/10 xl:flex">
                <div className="p-3">
                  <SearchField
                    placeholder={view === "email" ? "Search inbox" : "Find a conversation"}
                    onChange={setQuery}
                  />
                </div>
                {view === "email" ? (
                  mailSubjects
                    .filter((s) => s.toLowerCase().includes(query.toLowerCase()))
                    .map((subject, i) => (
                      <button
                        key={subject}
                        onClick={() => setSelectedMail(i)}
                        className={cn(
                          "border-b px-4 py-4 text-left hover:bg-muted/40",
                          selectedMail === i && "bg-primary/10",
                        )}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <strong>{people[i % 4]}</strong>
                          <span className="text-muted-foreground">
                            {i === 0 ? "10:24" : "Yesterday"}
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-medium">{subject}</p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          Thanks team, sharing the latest updates…
                        </p>
                        <span className="mt-2 inline-block rounded bg-muted px-1.5 py-0.5 text-3xs text-muted-foreground">
                          SynKEK
                        </span>
                      </button>
                    ))
                ) : (
                  <>
                    <p className="px-4 pb-2 pt-3 text-2xs text-muted-foreground">GENERAL</p>
                    {["team-updates", "design", "random"].map((c) => (
                      <button
                        key={c}
                        onClick={() => setChannel(c)}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
                      >
                        <Hash className="size-3.5" />
                        {c}
                      </button>
                    ))}
                    <div className="mb-2 mt-6 flex items-center gap-2 px-4 text-xs font-medium">
                      <ChevronDown className="size-3" />
                      <Folder className="size-4 text-primary" />
                      SynKEK
                    </div>
                    {["marketing", "website", "seo", "product-launch"]
                      .filter((c) => c.includes(query))
                      .map((c) => (
                        <button
                          key={c}
                          onClick={() => setChannel(c)}
                          className={cn(
                            "mx-2 flex items-center gap-2 rounded-md px-3 py-2 text-sm",
                            channel === c
                              ? "bg-primary/15 text-primary"
                              : "text-muted-foreground hover:bg-muted",
                          )}
                        >
                          <Hash className="size-3.5" />
                          {c}
                          {c === "marketing" && <span className="ml-auto text-xs">3</span>}
                        </button>
                      ))}
                    <p className="px-4 pb-2 pt-6 text-2xs text-muted-foreground">DIRECT MESSAGES</p>
                    {people.slice(0, 3).map((name) => (
                      <button
                        key={name}
                        onClick={() => setChannel(name)}
                        className="flex items-center gap-2 px-4 py-2 text-xs"
                      >
                        <Avatar name={name} small />
                        {name}
                      </button>
                    ))}
                  </>
                )}
              </aside>
            )}
            <main className="min-w-0 flex-1 overflow-y-auto">
              {view === "communications" && (
                <div className="flex h-full flex-col">
                  <div className="flex-1 space-y-7 p-5">
                    <div className="flex items-center gap-3 py-1 text-2xs text-muted-foreground">
                      <span className="h-px flex-1 bg-border" />
                      Tuesday, 13 October
                      <span className="h-px flex-1 bg-border" />
                    </div>
                    {[
                      [
                        "Maya Chen",
                        "09:12",
                        "Morning team! The October campaign is ready for review. I've added the strategy and launch checklist to our project Drive.",
                      ],
                      [
                        "Leo Martins",
                        "09:18",
                        "Homepage is looking good. The new product section is ready for copy review.",
                      ],
                      [
                        "Nina Patel",
                        "09:24",
                        "I'll review the SEO titles this morning. Let's keep all feedback on the strategy doc so nothing gets lost.",
                      ],
                      [
                        "Maya Chen",
                        "10:04",
                        "Perfect. I've added the remaining actions to Tasks. We can go through them in our 14:00 catch-up.",
                      ],
                    ].map(([name, time, text], i) => (
                      <div key={time} className="flex gap-3">
                        <Avatar name={name!} />
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-2">
                            <strong className="text-xs">{name}</strong>
                            <span className="text-3xs text-muted-foreground">{time}</span>
                          </div>
                          <p className="mt-1.5 text-sm leading-relaxed">{text}</p>
                          {i === 0 && (
                            <button
                              onClick={() => {
                                setSelectedDoc(files[0]!);
                                setModule("Docs");
                              }}
                              className="mt-3 flex w-full max-w-xs items-center gap-3 rounded-lg border bg-muted/20 p-3 text-left"
                            >
                              <FileText className="size-7 text-primary" />
                              <span>
                                <strong className="block text-xs">Q4 marketing strategy</strong>
                                <span className="text-2xs text-muted-foreground">
                                  Google Docs · SynKEK / Marketing
                                </span>
                              </span>
                            </button>
                          )}
                          <button
                            onClick={() =>
                              showNotice(
                                "Reply stays in the conversation. The resource panel remains open.",
                              )
                            }
                            className="mt-2 text-2xs text-primary"
                          >
                            {i === 0 ? "2 replies" : "Reply"}
                          </button>
                        </div>
                      </div>
                    ))}
                    {sent.map((text, i) => (
                      <div key={i} className="flex gap-3">
                        <Avatar name="Maya Chen" />
                        <p className="text-sm">{text}</p>
                      </div>
                    ))}
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (draft.trim()) {
                        setSent((p) => [...p, draft]);
                        setDraft("");
                      }
                    }}
                    className="m-4 rounded-xl border bg-muted/15 p-3"
                  >
                    <textarea
                      aria-label="Demo message"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder={`Message #${channel}`}
                      className="min-h-16 w-full resize-none bg-transparent text-sm outline-none"
                    />
                    <div className="flex items-center justify-between">
                      <Plus className="size-4 text-muted-foreground" />
                      <Button size="sm" type="submit">
                        <Send className="size-3.5" />
                        Send demo
                      </Button>
                    </div>
                  </form>
                </div>
              )}
              {view === "email" && (
                <div className="p-6">
                  <div className="mb-6 flex items-center justify-between">
                    <span className="rounded-md bg-primary/10 px-2 py-1 text-xs text-primary">
                      SynKEK
                    </span>
                    <div className="flex gap-3 text-muted-foreground">
                      <Star className="size-4" />
                      <MoreHorizontal className="size-4" />
                    </div>
                  </div>
                  <h2 className="text-xl font-semibold leading-snug">
                    {mailSubjects[selectedMail]}
                  </h2>
                  <div className="mt-5 flex items-center gap-3">
                    <Avatar name="Nina Patel" />
                    <div>
                      <p className="text-xs font-medium">
                        Nina Patel{" "}
                        <span className="font-normal text-muted-foreground">
                          &lt;nina@synkek.com&gt;
                        </span>
                      </p>
                      <p className="mt-1 text-2xs text-muted-foreground">
                        to Maya, Leo, me · 10:24 AM
                      </p>
                    </div>
                  </div>
                  <div className="my-7 space-y-5 text-sm leading-7">
                    <p>Hi team,</p>
                    <p>
                      We're ready for the October launch review. I've updated the marketing strategy
                      and added the final product assets to our shared folder.
                    </p>
                    <p>
                      Could you take a look at the homepage copy and leave your feedback before
                      Thursday? The SEO plan is ready for sign-off too.
                    </p>
                    <p>
                      Everything is in the SynKEK Drive. Please use the shared files so we're all
                      working from the same version.
                    </p>
                    <p>
                      Thanks,
                      <br />
                      Nina
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setFolder("Marketing");
                      setModule("Files");
                    }}
                    className="flex items-center gap-3 rounded-lg border bg-muted/20 px-4 py-3 text-left"
                  >
                    <Folder className="size-7 text-primary" />
                    <span className="text-xs">
                      <strong className="block">Marketing · SynKEK</strong>
                      <span className="text-muted-foreground">Open project folder</span>
                    </span>
                    <ChevronRight className="ml-4 size-4" />
                  </button>
                  <div className="mt-8 rounded-xl border p-4">
                    <p className="mb-3 text-xs text-muted-foreground">
                      Reply to Nina, Maya and Leo
                    </p>
                    <textarea
                      aria-label="Demo email reply"
                      className="min-h-20 w-full resize-none bg-transparent text-sm outline-none"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Write your reply…"
                    />
                    <div className="flex items-center justify-between">
                      <Button
                        size="sm"
                        onClick={() =>
                          showNotice(
                            "Demo reply saved locally for this preview. No email was sent.",
                          )
                        }
                      >
                        <Send className="size-3.5" />
                        Send demo
                      </Button>
                      <button
                        onClick={() => {
                          setModule("Files");
                          showNotice("Choose a file in the right panel to insert its link.");
                        }}
                        className="text-xs text-muted-foreground"
                      >
                        Attach from project Drive
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {view === "tasks" && (
                <div className="p-5">
                  <div className="mb-5 flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold">Project tasks</h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {taskNames.length - done.length} open · SynKEK
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setBoard(!board)}>
                      {board ? <LayoutList className="size-4" /> : <Grid2X2 className="size-4" />}
                      {board ? "List" : "Board"}
                    </Button>
                  </div>
                  <SearchField placeholder="Search tasks" onChange={setQuery} />
                  {board ? (
                    <div className="mt-5 grid grid-cols-2 gap-4">
                      {[false, true].map((completed) => (
                        <section key={String(completed)} className="rounded-xl bg-muted/20 p-3">
                          <h3 className="mb-2 text-xs font-semibold">
                            {completed ? "Done" : "In progress"}
                          </h3>
                          {taskRows
                            .filter((t) => done.includes(t.id) === completed)
                            .map(renderTask)}
                        </section>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-4">{taskRows.map(renderTask)}</div>
                  )}
                  <p className="mt-6 text-xs text-muted-foreground">
                    Shared statuses · One accountable owner · Project followers
                  </p>
                </div>
              )}
              {view === "projects" && (
                <div className="p-5">
                  <div className="mb-5 flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold">Your projects</h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Connections, people and work in one place.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() =>
                        showNotice(
                          "This preview has three sample projects. Live project creation is available outside demo mode.",
                        )
                      }
                    >
                      <Plus className="size-4" />
                      New project
                    </Button>
                  </div>
                  <SearchField placeholder="Find a project" onChange={setQuery} />
                  {["SynKEK", "Pulse website", "Brand studio"]
                    .filter((p) => p.toLowerCase().includes(query.toLowerCase()))
                    .map((p, i) => (
                      <button
                        key={p}
                        onClick={() => {
                          setFolder("");
                          showNotice(`${p} selected in this sample workspace.`);
                        }}
                        className={cn(
                          "mt-3 flex w-full items-start gap-4 rounded-lg border px-4 py-5 text-left",
                          i === 0 ? "border-primary/40 bg-primary/5" : "border-border",
                        )}
                      >
                        <Folder className="mt-1 size-7 text-primary" />
                        <div className="flex-1">
                          <h3 className="text-sm font-semibold">{p}</h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {i === 0
                              ? "Brand, website and growth marketing"
                              : "Shared team workspace"}
                          </p>
                          <div className="mt-4 flex flex-wrap gap-3 text-2xs text-muted-foreground">
                            <span>Drive linked</span>
                            <span>Slack · {i === 0 ? "4" : "2"} channels</span>
                            <span>{i === 0 ? "8" : "4"} members</span>
                          </div>
                        </div>
                        <ChevronRight className="mt-1 size-4 text-muted-foreground" />
                      </button>
                    ))}
                  <div className="mt-7">
                    <h3 className="text-sm font-medium">SynKEK members</h3>
                    <div className="mt-3 space-y-3">
                      {people.map((p, i) => (
                        <div key={p} className="flex items-center gap-3">
                          <Avatar name={p} small />
                          <span className="flex-1 text-xs">{p}</span>
                          <span className="text-2xs text-muted-foreground">
                            {i === 0 ? "Admin" : "Member"} · Slack
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {(view === "calendar" || view === "meetings") && (
                <div className="p-5">
                  <div className="mb-6 flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold">
                        {rail === "recordings" ? "Meeting recordings" : "Tuesday, 13 October"}
                      </h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {view === "calendar"
                          ? "Your week · 12 – 18 October 2026"
                          : "Prepare, meet and follow through."}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() =>
                        showNotice("Scheduling preview only. No calendar invitations are sent.")
                      }
                    >
                      <Plus className="size-4" />
                      Schedule
                    </Button>
                  </div>
                  <div className="mb-7 grid grid-cols-7 gap-1">
                    {["M 12", "T 13", "W 14", "T 15", "F 16", "S 17", "S 18"].map((day, i) => (
                      <button
                        key={day}
                        onClick={() => showNotice(`${day} October selected.`)}
                        className={cn(
                          "rounded-lg py-3 text-xs",
                          i === 1
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted/30 text-muted-foreground",
                        )}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                  {["Marketing stand-up", "SynKEK · Launch review", "Website design handoff"].map(
                    (event, i) => (
                      <section key={event} className="mb-5 flex gap-4">
                        <div className="w-12 pt-2 text-xs text-muted-foreground">
                          {["09:00", "14:00", "16:30"][i]}
                        </div>
                        <div className="min-w-0 flex-1 rounded-xl border border-border bg-muted/15 p-4">
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold">{event}</h3>
                            <Video className="size-4 text-primary" />
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {i === 1 ? "45 minutes · Google Meet" : "30 minutes · Google Calendar"}
                          </p>
                          <div className="my-4 flex -space-x-1">
                            {people.slice(0, 3).map((p) => (
                              <Avatar key={p} name={p} small />
                            ))}
                          </div>
                          {i === 1 && (
                            <p className="mb-4 text-xs leading-5 text-muted-foreground">
                              Campaign readiness, homepage feedback and remaining launch tasks.
                            </p>
                          )}
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedDoc("Launch review · Meeting notes");
                                setModule("Docs");
                              }}
                            >
                              Notes & agenda
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                showNotice("Demo meeting. No external meeting is opened.")
                              }
                            >
                              {rail === "recordings" ? "Read transcript" : "Join meeting"}
                            </Button>
                          </div>
                        </div>
                      </section>
                    ),
                  )}
                </div>
              )}
            </main>
          </div>
          {notice && (
            <div
              role="status"
              className="flex items-center justify-between gap-3 border-t bg-muted/50 px-4 py-2 text-xs text-muted-foreground"
            >
              {notice}
              <button aria-label="Dismiss notice" onClick={() => setNotice("")}>
                <X className="size-4" />
              </button>
            </div>
          )}
        </div>
        {resourceOpen && (
          <aside
            aria-label="Workspace resources"
            className="flex w-[420px] max-w-[40vw] shrink-0 flex-col border-l bg-sidebar"
          >
            <div className="flex h-16 shrink-0 items-center justify-between px-5">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Folder className="size-4 text-primary" />
                SynKEK <ChevronDown className="size-3 text-muted-foreground" />
              </div>
              <button
                aria-label="Close resources"
                onClick={() => setResourceOpen(false)}
                className="rounded p-1 hover:bg-muted"
              >
                <X className="size-4 text-muted-foreground" />
              </button>
            </div>
            <OfficeModuleTabs value={module} onChange={setModule} />
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {module === "Files" && (
                <>
                  <SearchField placeholder="Search in Drive" onChange={setFileQuery} />
                  <div className="mb-5 mt-6 flex items-center gap-2">
                    <button onClick={() => setFolder("")} className="text-sm font-medium">
                      Project Drive
                    </button>
                    <ChevronRight className="size-3 text-muted-foreground" />
                    <button onClick={() => setFolder("")} className="text-sm">
                      SynKEK
                    </button>
                    {folder && (
                      <>
                        <ChevronRight className="size-3 text-muted-foreground" />
                        <span className="text-xs">{folder}</span>
                      </>
                    )}
                  </div>
                  <div className="mb-5 flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setFileQuery(fileQuery ? "" : "strategy")}
                    >
                      Type <ChevronDown className="size-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        showNotice("Sample Drive items are shared with the SynKEK team.")
                      }
                    >
                      People <ChevronDown className="size-3" />
                    </Button>
                    <LayoutList className="ml-auto size-4 text-primary" />
                    <Grid2X2 className="size-4 text-muted-foreground" />
                  </div>
                  <div className="flex justify-between border-b px-2 pb-3 text-2xs text-muted-foreground">
                    <span>Name ↑</span>
                    <span>Modified</span>
                  </div>
                  {!folder &&
                    folders
                      .filter((f) => f.toLowerCase().includes(fileQuery.toLowerCase()))
                      .map((name, i) => (
                        <button
                          key={name}
                          onClick={() => setFolder(name)}
                          className="flex w-full items-center gap-3 border-b border-border/60 px-2 py-4 text-left hover:bg-muted/50"
                        >
                          <Folder
                            className={cn(
                              "size-5",
                              i === 1
                                ? "fill-primary/20 text-primary"
                                : "fill-muted text-muted-foreground",
                            )}
                          />
                          <span className="flex-1 text-xs font-medium">{name}</span>
                          <span className="text-3xs text-muted-foreground">{i + 10} Oct</span>
                          <MoreHorizontal className="size-3 text-muted-foreground" />
                        </button>
                      ))}
                  {files
                    .filter((f) => f.toLowerCase().includes(fileQuery.toLowerCase()))
                    .map((name, i) => (
                      <button
                        key={name}
                        onClick={() => {
                          setSelectedDoc(name);
                          setModule("Docs");
                        }}
                        className="flex w-full items-center gap-3 border-b border-border/60 px-2 py-4 text-left hover:bg-muted/50"
                      >
                        <FileText className="size-5 text-primary" />
                        <span className="min-w-0 flex-1 text-xs">{name}</span>
                        <span className="text-3xs text-muted-foreground">{12 - i} Oct</span>
                      </button>
                    ))}
                  <div className="mt-6 flex items-start gap-2 text-2xs leading-5 text-muted-foreground">
                    <Users className="mt-0.5 size-4 shrink-0" />
                    Shared with the SynKEK team. Files stay in Google Drive.
                  </div>
                </>
              )}
              {module === "Tasks" && (
                <>
                  <h2 className="text-base font-semibold">Project tasks</h2>
                  <p className="mb-3 mt-1 text-xs text-muted-foreground">
                    SynKEK · {taskNames.length - done.length} open
                  </p>
                  {taskNames.map((title, id) => renderTask({ title, id }))}
                </>
              )}
              {module === "Agents" && (
                <>
                  <h2 className="mb-1 text-base font-semibold">Project agents</h2>
                  <p className="mb-6 text-xs text-muted-foreground">
                    General agents assigned to SynKEK
                  </p>
                  {["SEO analyst", "Content editor", "Website developer"].map((agent, i) => (
                    <div key={agent} className="border-b py-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={agent} />
                        <div className="flex-1">
                          <h3 className="text-sm font-medium">{agent}</h3>
                          <p className="mt-1 text-2xs text-muted-foreground">
                            {i === 0
                              ? "Reviewing keyword opportunities"
                              : "Ready for your next instruction"}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "size-2 rounded-full",
                            i === 0 ? "bg-primary" : "bg-muted-foreground/50",
                          )}
                        />
                      </div>
                      <button
                        onClick={() =>
                          showNotice(`${agent} conversation selected. Sample agent activity only.`)
                        }
                        className="mt-3 text-xs text-primary"
                      >
                        Open conversation →
                      </button>
                    </div>
                  ))}
                </>
              )}
              {module === "Browser" && (
                <>
                  <SearchField placeholder="Search or enter a URL" />
                  <div className="mt-4 rounded-lg border bg-background p-5">
                    <span className="text-xs font-semibold text-primary">SynKEK</span>
                    <h2 className="mb-4 mt-12 text-3xl font-semibold leading-tight">
                      Built for
                      <br />
                      what's next.
                    </h2>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Meet the new collection. Thoughtful products, made for everyday life.
                    </p>
                    <Button
                      className="mb-12 mt-6"
                      size="sm"
                      onClick={() =>
                        showNotice(
                          "This is an illustrative website inside the demo browser module.",
                        )
                      }
                    >
                      Explore products
                    </Button>
                    <div className="border-t pt-4 text-xs text-muted-foreground">
                      synkek.com · Website preview
                    </div>
                  </div>
                </>
              )}
              {module === "Docs" && (
                <>
                  <div className="mb-4 flex items-center gap-2">
                    <FileText className="size-5 text-primary" />
                    <span className="text-xs font-medium">{selectedDoc}</span>
                  </div>
                  <article className="rounded-lg border bg-background p-5">
                    <p className="text-3xs text-muted-foreground">SynKEK · Shared with 8 people</p>
                    <h2 className="mt-5 text-xl font-semibold leading-snug">{selectedDoc}</h2>
                    <p className="mt-3 text-xs leading-6 text-muted-foreground">
                      Our October focus is a clear product story, a faster website and campaigns
                      that turn interest into action.
                    </p>
                    <h3 className="mb-3 mt-7 text-sm font-semibold">Launch priorities</h3>
                    <ol className="list-decimal space-y-3 pl-4 text-xs leading-6">
                      <li>Finish the homepage and product copy.</li>
                      <li>Review SEO titles and search intent.</li>
                      <li>Align campaign assets with the product launch.</li>
                    </ol>
                    <h3 className="mb-3 mt-7 text-sm font-semibold">Review & next steps</h3>
                    <p className="text-xs leading-6 text-muted-foreground">
                      Maya owns final approval. Leo will publish the website after Thursday's
                      review.
                    </p>
                  </article>
                  <div className="mt-4 border-t pt-4">
                    <p className="text-xs font-medium">Comments · 1</p>
                    <div className="mt-3 flex gap-2">
                      <Avatar name="Nina Patel" small />
                      <p className="text-xs leading-5">
                        Looks good. Let's include the new keyword targets in the product pages.
                      </p>
                    </div>
                  </div>
                </>
              )}
              {module === "PRs" && (
                <>
                  <p className="text-xs text-muted-foreground">synkek / website</p>
                  <h2 className="mt-3 text-lg font-semibold">Update campaign landing page</h2>
                  <span className="my-4 inline-block rounded-full bg-primary/15 px-3 py-1 text-xs text-primary">
                    Open · #42
                  </span>
                  <p className="text-xs leading-6 text-muted-foreground">
                    New homepage copy, product links and campaign tracking.
                  </p>
                  <div className="my-5 rounded-lg border p-4">
                    <p className="text-xs">3 files changed</p>
                    <pre className="mt-4 whitespace-pre-wrap text-2xs leading-6 text-primary">
                      + October campaign headline
                      <br />+ Product collection links
                      <br />+ Updated page description
                    </pre>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      showNotice("Review submitted in the demo only. No GitHub action was taken.")
                    }
                  >
                    Review changes
                  </Button>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 border-t px-4 py-3 text-3xs text-muted-foreground">
              <span className="size-1.5 rounded-full bg-primary" />
              Sample project connections <Settings className="ml-auto size-3" />
            </div>
          </aside>
        )}
      </div>
    </SidebarInset>
  );
}
