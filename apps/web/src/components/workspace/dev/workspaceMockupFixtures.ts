import type { ReactNode } from "react";
import {
  EnvironmentId,
  ProjectId,
  ThreadId,
  MailAccountId,
  MailMessageIdHeader,
  WorkspaceItemRef,
  WorkspaceLinkEndpoint,
  WorkspaceLinkOrigin,
  WorkspaceLinkSource,
  WorkspaceLinkId,
} from "@t3tools/contracts";

export type WorkspaceMockupId = "01" | "02" | "03" | "04" | "05" | "06" | "07" | "08";
// Task state recipes stay inside the isolated entry; none reaches live route parsing.
export const workspaceTasksMockupStates = [
  "detail",
  "create",
  "create-dirty",
  "discard",
  "conflict",
  "deleted",
  "read-only",
  "disconnected",
  "menu",
  "phone-return",
  "empty",
  "board",
  "board-move",
  "board-saving",
  "board-conflict",
  "board-page2-conflict",
  "board-partial",
  "board-read-only",
  "board-disconnected",
] as const;
export type WorkspaceTasksMockupState = (typeof workspaceTasksMockupStates)[number];
export const workspaceCalendarHandoffMockupStates = ["no-url", "desktop-reject"] as const;
export const workspaceCalendarMockupStates = [
  "week",
  "picker",
  "dst-fold",
  "dst-gap",
  "week-allday",
  "week-overflow",
  "week-390",
  ...workspaceCalendarHandoffMockupStates,
] as const;
export type WorkspaceCalendarMockupState = (typeof workspaceCalendarMockupStates)[number];
export type WorkspaceMockupArea =
  | "mail"
  | "communications"
  | "tasks"
  | "projects"
  | "drive"
  | "calendar"
  | "notes"
  | "browser"
  | "agents";
export type WorkspaceMockupTab = "files" | "browser" | "agents" | "tasks" | "docs" | "prs";
export type WorkspaceMockupView =
  | "chats"
  | "unread"
  | "later"
  | "upcoming"
  | "recordings"
  | "agenda"
  | "week"
  | "inbox"
  | "all"
  | "open"
  | "done"
  | "projects"
  | "linked";
export type MockupMutation =
  | "link"
  | "unlink"
  | "save"
  | "send"
  | "schedule"
  | "join"
  | "open-thread"
  | "navigate";
export interface WorkspaceMockupRecipe {
  readonly id: WorkspaceMockupId;
  readonly png: string;
  readonly route: string;
  readonly space: "mail" | "communications" | "tasks" | "projects" | "meetings" | "calendar";
  readonly view: WorkspaceMockupView | null;
  readonly centerArea: WorkspaceMockupArea;
  readonly resourceArea: WorkspaceMockupArea | null;
  readonly resourceTab: WorkspaceMockupTab;
  readonly selectedKey: string | null;
  readonly requiredAreas: readonly WorkspaceMockupArea[];
  readonly corrections: readonly ("D03-mail-sender" | "D03-tab" | "D28-date-copy")[];
}
export interface WorkspaceMockupSession {
  readonly id: WorkspaceMockupId;
  readonly taskState: WorkspaceTasksMockupState | null;
  readonly calendarState: WorkspaceCalendarMockupState | null;
  readonly browserState: "external" | null;
  readonly environmentId: EnvironmentId;
  readonly resourceProjectId: ProjectId;
  readonly recipe: WorkspaceMockupRecipe;
  readonly clock: { readonly now: () => Date; readonly today: () => "2026-10-13" };
  readonly locale: "en-GB";
  readonly timeZone: "Africa/Johannesburg" | "America/New_York";
  readonly seed: WorkspaceMockupSeed;
  readonly storage: Pick<Storage, "getItem" | "setItem">;
  readonly operations: ReadonlyArray<{
    readonly kind: MockupMutation;
    readonly item: WorkspaceItemRef | null;
    readonly value: string | null;
  }>;
  readonly record: (kind: MockupMutation, item?: WorkspaceItemRef, value?: string) => Promise<void>;
  readonly settled: () => Promise<void>;
  readonly dispose: () => void;
}
export interface WorkspaceMockupModule {
  readonly area: WorkspaceMockupArea;
  readonly readyRegions: readonly ("center" | "resource")[];
  // Notes retains 07.docs-format/07.docs-comments even with resource ready until
  // those subregions render; each owning wave removes only its completed entry.
  readonly incompleteRegions?: readonly string[];
  readonly settled: () => Promise<void>;
  readonly center?: ReactNode;
  readonly resource?: ReactNode;
  readonly dispose: () => void;
}
export type CreateWorkspaceMockupModule = (
  session: WorkspaceMockupSession,
) => WorkspaceMockupModule;

export type WorkspaceMockupDate = `${number}-${number}-${number}`;
export type WorkspaceMockupInstant = `${WorkspaceMockupDate}T${string}+02:00`;
export type WorkspaceMockupPersonId = "maya" | "leo" | "nina" | "alex";
export interface WorkspaceMockupPerson {
  readonly id: WorkspaceMockupPersonId;
  readonly name: string;
  readonly initials: string;
  readonly role: "Admin" | "Member";
  readonly source: "slack";
}
export interface WorkspaceMockupProject {
  readonly id: ProjectId;
  readonly title: string;
  readonly description: string;
  readonly channelCount: number;
  readonly memberCount: number;
  readonly countsComplete: true;
  readonly countsAsOf: WorkspaceMockupInstant;
  readonly driveLinked: boolean;
}
export interface WorkspaceMockupMail {
  readonly id: string;
  readonly messageId: MailMessageIdHeader;
  readonly accountId: MailAccountId;
  readonly accountAddress: string;
  readonly folder: "INBOX";
  readonly uid: number;
  readonly uidValidity: number;
  readonly fromName: string;
  readonly fromAddress: string;
  readonly subject: string;
  readonly preview: string;
  readonly to: readonly string[];
  readonly displayTime: string;
  readonly listDisplayTime: string;
  readonly body: string;
}
export interface WorkspaceMockupChannel {
  readonly id: string;
  readonly title: string;
  readonly group: "general" | "project" | "direct";
  readonly projectId: ProjectId | null;
  readonly personId: WorkspaceMockupPersonId | null;
  readonly knownUnread: number;
  readonly memberCount: number | null;
  readonly memberCountComplete: boolean;
  readonly memberCountAsOf: WorkspaceMockupInstant | null;
  readonly readMarkerMessageId: string | null;
}
export interface WorkspaceMockupMessage {
  readonly id: string;
  readonly channelId: string;
  readonly personId: WorkspaceMockupPersonId;
  readonly displayTime: string;
  readonly text: string;
  readonly replyIds: readonly string[];
  readonly fileId: string | null;
}
export interface WorkspaceMockupTask {
  readonly id: string;
  readonly projectId: ProjectId;
  readonly title: string;
  readonly areaLabel: string | null;
  readonly dueOn: WorkspaceMockupDate | null;
  readonly owner: "environment-owner" | null;
  readonly assigneeDisplayId: WorkspaceMockupPersonId | null;
  readonly completed: boolean;
}
export interface WorkspaceMockupDriveFolder {
  readonly id: string;
  readonly title: string;
  readonly modified: WorkspaceMockupDate;
  readonly childIds: readonly string[];
}
export interface WorkspaceMockupDriveDocument {
  readonly id: string;
  readonly title: string;
  readonly modified: WorkspaceMockupDate;
  readonly mimeType: "application/vnd.google-apps.document";
}
export interface WorkspaceMockupDrive {
  readonly rootId: string;
  readonly connectionId: string;
  readonly folders: readonly WorkspaceMockupDriveFolder[];
  readonly documents: readonly WorkspaceMockupDriveDocument[];
  readonly confirmedFolderId: string;
}
export interface WorkspaceMockupEvent {
  readonly id: string;
  readonly title: string;
  readonly start: WorkspaceMockupInstant;
  readonly durationMinutes: number;
  readonly source: "Google Calendar" | "Google Meet";
  readonly attendeeIds: readonly WorkspaceMockupPersonId[];
  readonly description: string | null;
  readonly joinUrl: string;
  readonly noteId: string;
}
export interface WorkspaceMockupComment {
  readonly id: string;
  readonly personId: WorkspaceMockupPersonId;
  readonly body: string;
}
export interface WorkspaceMockupNote {
  readonly id: string;
  readonly title: string;
  readonly projectId: ProjectId;
  readonly sharingCount: number;
  readonly sharingCountComplete: true;
  readonly body: string;
  readonly comments: readonly WorkspaceMockupComment[];
}
export interface WorkspaceMockupAgent {
  readonly threadId: ThreadId;
  readonly projectId: ProjectId;
  readonly title: string;
  readonly monogram: string;
  readonly status: "working" | "idle";
  readonly activity: string;
}
export interface WorkspaceMockupBrowser {
  readonly url: string;
  readonly title: string;
  readonly heading: string;
  readonly body: string;
  readonly actionLabel: string;
}
export interface WorkspaceMockupLink {
  readonly id: WorkspaceLinkId;
  readonly a: WorkspaceLinkEndpoint;
  readonly b: WorkspaceLinkEndpoint;
  readonly status: "confirmed" | "dismissed" | "suggested";
  readonly origin: WorkspaceLinkOrigin;
  readonly source: WorkspaceLinkSource;
}
export interface WorkspaceMockupSampleCopy {
  readonly tasksFooter: "Shared statuses · One accountable owner · Project followers";
  readonly browserFooter: "synkek.com · Website preview";
  readonly filesSharing: "Shared with the SynKEK team. Files stay in Google Drive.";
  readonly marker: "Design preview · sample data";
  readonly connections: "Sample project connections";
}
export interface WorkspaceMockupSeed {
  readonly environmentId: EnvironmentId;
  readonly resourceProjectId: ProjectId;
  readonly today: "2026-10-13";
  readonly ownerDisplayId: WorkspaceMockupPersonId;
  readonly people: readonly WorkspaceMockupPerson[];
  readonly projects: readonly WorkspaceMockupProject[];
  readonly mail: readonly WorkspaceMockupMail[];
  readonly channels: readonly WorkspaceMockupChannel[];
  readonly messages: readonly WorkspaceMockupMessage[];
  readonly tasks: readonly WorkspaceMockupTask[];
  readonly drive: WorkspaceMockupDrive;
  readonly events: readonly WorkspaceMockupEvent[];
  readonly note: WorkspaceMockupNote;
  readonly agents: readonly WorkspaceMockupAgent[];
  readonly browser: WorkspaceMockupBrowser;
  readonly links: readonly WorkspaceMockupLink[];
  readonly sampleCopy: WorkspaceMockupSampleCopy;
}

export interface WorkspaceMockupCaptureManifest {
  readonly version: 1;
  readonly fixtureId: WorkspaceMockupId;
  readonly referencePng: string;
  readonly route: string;
  readonly viewport: {
    readonly width: number;
    readonly height: number;
    readonly deviceScaleFactor: 1;
    readonly zoom: 1;
  };
  readonly locale: "en-GB";
  readonly timeZone: WorkspaceMockupSession["timeZone"];
  readonly resolvedLocale: string;
  readonly resolvedTimeZone: string;
  readonly clock: "2026-10-13T10:30:00+02:00";
  readonly theme: "dark" | "light";
  readonly fontFamily: string;
  readonly resolvedFont: string;
  readonly os: string;
  readonly selectedKey: string | null;
  readonly centerArea: WorkspaceMockupArea;
  readonly resourceArea: WorkspaceMockupArea | null;
  readonly resourceEnvironmentId: EnvironmentId;
  readonly resourceProjectId: ProjectId;
  readonly resourceTab: WorkspaceMockupTab;
  readonly sampleMarker: true;
  readonly corrections: WorkspaceMockupRecipe["corrections"];
  readonly incompleteRegions: readonly string[];
  readonly readiness: "seed-only" | "shell" | "complete";
  readonly captureKind: "synthetic";
  readonly networkRequests: 0;
  readonly pendingOperations: 0;
}

const fixedInstant = "2026-10-13T10:30:00+02:00";
type MailMessageIdHeader = typeof MailMessageIdHeader.Type;
const preview = "Thanks team, sharing the latest ...";

export function createWorkspaceMockupSeed(): WorkspaceMockupSeed {
  const environmentId = EnvironmentId.make("fixture-environment");
  const resourceProjectId = ProjectId.make("fixture-synkek");
  const accountId = MailAccountId.make("fixture-mail-maya");
  const people: WorkspaceMockupPerson[] = [
    { id: "maya", name: "Maya Chen", initials: "MC", role: "Admin", source: "slack" },
    { id: "leo", name: "Leo Martins", initials: "LM", role: "Member", source: "slack" },
    { id: "nina", name: "Nina Patel", initials: "NP", role: "Member", source: "slack" },
    { id: "alex", name: "Alex Morgan", initials: "AM", role: "Member", source: "slack" },
  ];
  const projects: WorkspaceMockupProject[] = [
    {
      id: resourceProjectId,
      title: "SynKEK",
      description: "Brand, website and growth marketing",
      channelCount: 4,
      memberCount: 8,
      countsComplete: true,
      countsAsOf: fixedInstant,
      driveLinked: true,
    },
    {
      id: ProjectId.make("fixture-pulse-website"),
      title: "Pulse website",
      description: "Shared team workspace",
      channelCount: 2,
      memberCount: 4,
      countsComplete: true,
      countsAsOf: fixedInstant,
      driveLinked: true,
    },
    {
      id: ProjectId.make("fixture-brand-studio"),
      title: "Brand studio",
      description: "Shared team workspace",
      channelCount: 2,
      memberCount: 4,
      countsComplete: true,
      countsAsOf: fixedInstant,
      driveLinked: true,
    },
  ];
  const subjects = [
    "SynKEK · October launch review",
    "Your updated homepage designs",
    "SEO report: September results",
    "Product shoot · final selects",
    "Weekly marketing catch-up",
  ];
  const senders = [people[2]!, people[1]!, people[2]!, people[3]!, people[0]!];
  const mail: WorkspaceMockupMail[] = subjects.map((subject, index) => ({
    id: `mail-${index + 1}`,
    messageId: MailMessageIdHeader.make(`<fixture-${index + 1}@synkek.invalid>`),
    accountId,
    accountAddress: "maya@synkek.com",
    folder: "INBOX",
    uid: index + 1,
    uidValidity: 1,
    fromName: senders[index]!.name,
    fromAddress: `${senders[index]!.id}@synkek.com`,
    subject,
    preview,
    to: index === 0 ? ["Maya", "Leo", "me"] : ["me"],
    displayTime: index === 0 ? "10:24 AM" : "Yesterday",
    listDisplayTime: index === 0 ? "10:24" : "Yesterday",
    body:
      index === 0
        ? "Hi team,\n\nWe're ready for the October launch review. I've updated the marketing strategy and added the final product assets to our shared folder.\n\nCould you take a look at the homepage copy and leave your feedback before Thursday? The SEO plan is ready for sign-off too.\n\nEverything is in the SynKEK Drive. Please use the shared files so we're all working from the same version.\n\nThanks,\nNina"
        : preview,
  }));
  const channels: WorkspaceMockupChannel[] = [
    ...["team-updates", "design", "random"].map((title) => ({
      id: `slack-${title}`,
      title,
      group: "general" as const,
      projectId: null,
      personId: null,
      knownUnread: 0,
      memberCount: null,
      memberCountComplete: false,
      memberCountAsOf: null,
      readMarkerMessageId: null,
    })),
    ...["marketing", "website", "seo", "product-launch"].map((title): WorkspaceMockupChannel => ({
      id: `slack-${title}`,
      title,
      group: "project" as const,
      projectId: resourceProjectId,
      personId: null,
      knownUnread: title === "marketing" ? 3 : 0,
      memberCount: title === "marketing" ? 8 : null,
      memberCountComplete: title === "marketing",
      memberCountAsOf: title === "marketing" ? fixedInstant : null,
      readMarkerMessageId: title === "marketing" ? "message-1" : null,
    })),
    ...people.slice(0, 3).map((person) => ({
      id: `dm-${person.id}`,
      title: person.name,
      group: "direct" as const,
      projectId: null,
      personId: person.id,
      knownUnread: 0,
      memberCount: null,
      memberCountComplete: false,
      memberCountAsOf: null,
      readMarkerMessageId: null,
    })),
  ];
  const messages: WorkspaceMockupMessage[] = [
    {
      id: "message-1",
      channelId: "slack-marketing",
      personId: "maya",
      displayTime: "09:12",
      text: "Morning team! The October campaign is ready for review. I've added the strategy and launch checklist to our project Drive.",
      replyIds: ["reply-1", "reply-2"],
      fileId: "doc-strategy",
    },
    {
      id: "message-2",
      channelId: "slack-marketing",
      personId: "leo",
      displayTime: "09:18",
      text: "Homepage is looking good. The new product section is ready for copy review.",
      replyIds: [],
      fileId: null,
    },
    {
      id: "message-3",
      channelId: "slack-marketing",
      personId: "nina",
      displayTime: "09:24",
      text: "I'll review the SEO titles this morning. Let's keep all feedback on the strategy doc so nothing gets lost.",
      replyIds: [],
      fileId: null,
    },
    {
      id: "message-4",
      channelId: "slack-marketing",
      personId: "maya",
      displayTime: "10:04",
      text: "Perfect. I've added the remaining actions to Tasks. We can go through them in our 14:00 catch-up.",
      replyIds: [],
      fileId: null,
    },
    {
      id: "reply-1",
      channelId: "slack-marketing",
      personId: "leo",
      displayTime: "09:14",
      text: "Reply one for fixture review.",
      replyIds: [],
      fileId: null,
    },
    {
      id: "reply-2",
      channelId: "slack-marketing",
      personId: "nina",
      displayTime: "09:16",
      text: "Reply two for fixture review.",
      replyIds: [],
      fileId: null,
    },
  ];
  const taskRows = [
    ["Approve homepage copy", "Marketing", "2026-10-13", "maya"],
    ["Review October keyword plan", "Website", "2026-10-16", "leo"],
    ["Prepare product launch assets", "Marketing", "2026-10-16", "nina"],
    ["Publish campaign landing page", "Website", "2026-10-16", "alex"],
    ["Share weekly performance report", "Marketing", "2026-10-16", "maya"],
  ] as const;
  const tasks: WorkspaceMockupTask[] = taskRows.map(
    ([title, areaLabel, dueOn, assigneeDisplayId], index) => ({
      id: `task-${index + 1}`,
      projectId: resourceProjectId,
      title,
      areaLabel,
      dueOn,
      owner: assigneeDisplayId === "maya" ? "environment-owner" : null,
      assigneeDisplayId,
      completed: index === 4,
    }),
  );
  const drive: WorkspaceMockupDrive = {
    rootId: "drive-synkek",
    connectionId: "fixture-drive",
    confirmedFolderId: "folder-marketing",
    folders: (
      [
        ["seo", "SEO", "2026-10-10"],
        ["marketing", "Marketing", "2026-10-11"],
        ["website", "Website", "2026-10-12"],
        ["products", "Products", "2026-10-13"],
      ] as const
    ).map(([id, title, modified]) => ({ id: `folder-${id}`, title, modified, childIds: [] })),
    documents: (
      [
        ["strategy", "Q4 marketing strategy", "2026-10-12"],
        ["calendar", "October content calendar", "2026-10-11"],
        ["brand", "Brand guidelines", "2026-10-10"],
        ["checklist", "Website launch checklist", "2026-10-09"],
      ] as const
    ).map(([id, title, modified]) => ({
      id: `doc-${id}`,
      title,
      modified,
      mimeType: "application/vnd.google-apps.document",
    })),
  };
  const events: WorkspaceMockupEvent[] = [
    {
      id: "event-standup",
      title: "Marketing stand-up",
      start: "2026-10-13T09:00:00+02:00",
      durationMinutes: 30,
      source: "Google Calendar",
      attendeeIds: ["maya", "leo", "nina"],
      description: null,
      joinUrl: "https://meet.google.com/abc-defg-hij?authuser=2&hs=122",
      noteId: "note-launch-review",
    },
    {
      id: "event-review",
      title: "SynKEK · Launch review",
      start: "2026-10-13T14:00:00+02:00",
      durationMinutes: 45,
      source: "Google Meet",
      attendeeIds: ["maya", "leo", "nina"],
      description: "Campaign readiness, homepage feedback and remaining launch tasks.",
      joinUrl: "https://tenant.zoom.us/j/123456789?pwd=AbC%2B123&tk=exact",
      noteId: "note-launch-review",
    },
    {
      id: "event-handoff",
      title: "Website design handoff",
      start: "2026-10-13T16:30:00+02:00",
      durationMinutes: 30,
      source: "Google Calendar",
      attendeeIds: ["maya", "leo", "nina"],
      description: null,
      joinUrl: "https://teams.microsoft.com/l/meetup-join/19%3Ameeting/thread?context=%7B%7D",
      noteId: "note-launch-review",
    },
  ];
  const note: WorkspaceMockupNote = {
    id: "note-launch-review",
    title: "Launch review · Meeting notes",
    projectId: resourceProjectId,
    sharingCount: 8,
    sharingCountComplete: true,
    body: "Our October focus is a clear product story, a faster website and campaigns that turn interest into action.\n\n## Launch priorities\n\n1. Finish the homepage and product copy.\n2. Review SEO titles and search intent.\n3. Align campaign assets with the product launch.\n\n## Review & next steps\n\nMaya owns final approval. Leo will publish the website after Thursday's review.",
    comments: [
      {
        id: "comment-nina",
        personId: "nina",
        body: "Looks good. Let's include the new keyword targets in the product pages.",
      },
    ],
  };
  const agents: WorkspaceMockupAgent[] = [
    {
      threadId: ThreadId.make("thread-seo"),
      projectId: resourceProjectId,
      title: "SEO analyst",
      monogram: "Sa",
      status: "working",
      activity: "Reviewing keyword opportunities",
    },
    {
      threadId: ThreadId.make("thread-content"),
      projectId: resourceProjectId,
      title: "Content editor",
      monogram: "Ce",
      status: "idle",
      activity: "Ready for your next instruction",
    },
    {
      threadId: ThreadId.make("thread-website"),
      projectId: resourceProjectId,
      title: "Website developer",
      monogram: "Wd",
      status: "idle",
      activity: "Ready for your next instruction",
    },
  ];
  const project: WorkspaceLinkEndpoint = {
    ref: { type: "project", projectId: resourceProjectId },
    title: "SynKEK",
  };
  const folder: WorkspaceLinkEndpoint = {
    ref: { type: "file", provider: "google-drive", fileId: "folder-marketing" },
    title: "Marketing",
  };
  const firstMail: WorkspaceLinkEndpoint = {
    ref: {
      type: "mail",
      accountId,
      messageId: mail[0]!.messageId,
      location: { accountId, mailbox: "INBOX", uid: 1, uidValidity: 1 },
    },
    title: subjects[0]!,
  };
  const pairs: Array<readonly [WorkspaceLinkEndpoint, WorkspaceLinkEndpoint]> = [
    [project, folder],
    [firstMail, project],
    [firstMail, folder],
    [
      {
        ref: {
          type: "provider-resource",
          provider: "slack",
          resourceId: "slack-marketing/message-1",
        },
      },
      {
        ref: { type: "file", provider: "google-drive", fileId: "doc-strategy" },
        title: "Q4 marketing strategy",
      },
    ],
    ...agents.map((agent): readonly [WorkspaceLinkEndpoint, WorkspaceLinkEndpoint] => [
      { ref: { type: "thread", threadId: agent.threadId }, title: agent.title },
      project,
    ]),
    [
      {
        ref: {
          type: "provider-resource",
          provider: "workspace-calendar",
          resourceId: "event-review",
        },
      },
      {
        ref: { type: "provider-resource", provider: "workspace-note", resourceId: note.id },
        title: note.title,
      },
    ],
    [project, { ref: { type: "url", url: "https://dismissed.example.invalid/" } }],
    [project, { ref: { type: "url", url: "https://suggested.example.invalid/" } }],
  ];
  const links: WorkspaceMockupLink[] = pairs.map(([a, b], index) => ({
    id: WorkspaceLinkId.make(`wl_00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`),
    a,
    b,
    status: index === 8 ? "dismissed" : index === 9 ? "suggested" : "confirmed",
    origin: { confirmedAt: fixedInstant, viewing: a },
    source:
      index === 9
        ? { type: "model", model: "fixture", reason: "Fixture suggestion" }
        : { type: "user" },
  }));
  return {
    environmentId,
    resourceProjectId,
    today: "2026-10-13",
    ownerDisplayId: "maya",
    people,
    projects,
    mail,
    channels,
    messages,
    tasks,
    drive,
    events,
    note,
    agents,
    links,
    browser: {
      url: "https://synkek.example.invalid/",
      title: "SynKEK",
      heading: "Built for\nwhat's next.",
      body: "Meet the new collection. Thoughtful products, made for everyday life.",
      actionLabel: "Explore products",
    },
    sampleCopy: {
      tasksFooter: "Shared statuses · One accountable owner · Project followers",
      browserFooter: "synkek.com · Website preview",
      filesSharing: "Shared with the SynKEK team. Files stay in Google Drive.",
      marker: "Design preview · sample data",
      connections: "Sample project connections",
    },
  };
}

function recipe(
  id: WorkspaceMockupId,
  png: string,
  space: WorkspaceMockupRecipe["space"],
  view: WorkspaceMockupView,
  selectedKey: string | null,
  resourceTab: WorkspaceMockupTab,
  centerArea: WorkspaceMockupArea,
  resourceArea: WorkspaceMockupArea,
  corrections: WorkspaceMockupRecipe["corrections"] = [],
): WorkspaceMockupRecipe {
  return Object.freeze({
    id,
    png: `docs/superpowers/workspace-mockups/mockups/${png}.png`,
    route: `/workspace?space=${space}&fixture=${id}`,
    space,
    view,
    selectedKey,
    resourceTab,
    centerArea,
    resourceArea,
    requiredAreas: Object.freeze([centerArea, resourceArea]),
    corrections: Object.freeze([...corrections]),
  });
}

export const workspaceMockupRecipes: Readonly<Record<WorkspaceMockupId, WorkspaceMockupRecipe>> =
  Object.freeze({
    "01": recipe("01", "01-email-files", "mail", "inbox", "mail-1", "files", "mail", "drive", [
      "D03-mail-sender",
    ]),
    "02": recipe(
      "02",
      "02-communications-files",
      "communications",
      "chats",
      "slack-marketing",
      "files",
      "communications",
      "drive",
      ["D03-tab", "D28-date-copy"],
    ),
    "03": recipe("03", "03-tasks", "tasks", "all", null, "files", "tasks", "drive"),
    "04": recipe(
      "04",
      "04-projects",
      "projects",
      "projects",
      "fixture-synkek",
      "files",
      "projects",
      "drive",
    ),
    "05": recipe(
      "05",
      "05-browser-module",
      "communications",
      "chats",
      "slack-marketing",
      "browser",
      "communications",
      "browser",
      ["D03-tab", "D28-date-copy"],
    ),
    "06": recipe(
      "06",
      "06-agents-module",
      "communications",
      "chats",
      "slack-marketing",
      "agents",
      "communications",
      "agents",
      ["D03-tab", "D28-date-copy"],
    ),
    "07": recipe(
      "07",
      "07-meetings-notes",
      "meetings",
      "upcoming",
      "event-review",
      "docs",
      "calendar",
      "notes",
      ["D28-date-copy"],
    ),
    "08": recipe(
      "08",
      "08-calendar-tasks",
      "calendar",
      "agenda",
      null,
      "tasks",
      "calendar",
      "tasks",
      ["D28-date-copy"],
    ),
  });

export function parseWorkspaceMockupRequest(url: URL, dev: boolean): WorkspaceMockupId | null {
  if (!dev || !url.searchParams.has("fixture")) return null;
  const keys = [...url.searchParams.keys()];
  if (
    keys.some((key) => !["fixture", "space", "state", "theme"].includes(key)) ||
    new Set(keys).size !== keys.length
  )
    throw new Error("Fixture state is in memory only.");
  const id = url.searchParams.get("fixture");
  if (
    url.pathname !== "/workspace" ||
    url.hash ||
    !id ||
    !Object.hasOwn(workspaceMockupRecipes, id)
  )
    throw new Error("Unknown fixture.");
  const selected = workspaceMockupRecipes[id as WorkspaceMockupId];
  const state = url.searchParams.get("state");
  if (
    state !== null &&
    !(
      ((id === "03" || id === "08") &&
        workspaceTasksMockupStates.some((value) => value === state)) ||
      (id === "08" && workspaceCalendarMockupStates.some((value) => value === state)) ||
      (id === "07" && workspaceCalendarHandoffMockupStates.some((value) => value === state)) ||
      (id === "05" && state === "external")
    )
  )
    throw new Error("Unknown fixture state.");
  const theme = url.searchParams.get("theme");
  if (theme !== null && theme !== "light" && theme !== "dark")
    throw new Error("Unknown fixture theme.");
  const space = url.searchParams.get("space");
  if (space !== null && space !== selected.space)
    throw new Error(`Fixture space does not match recipe ${id}.`);
  return selected.id;
}

export function createWorkspaceMockupSession(
  id: WorkspaceMockupId,
  taskState: WorkspaceTasksMockupState | null = null,
  calendarState: WorkspaceCalendarMockupState | null = null,
  browserState: "external" | null = null,
): WorkspaceMockupSession {
  if (!Object.hasOwn(workspaceMockupRecipes, id)) throw new Error("Unknown fixture.");
  const seed = createWorkspaceMockupSeed();
  const days = [
    seed.today,
    ...seed.tasks.flatMap((task) => (task.dueOn ? [task.dueOn] : [])),
    ...seed.drive.folders.map((folder) => folder.modified),
    ...seed.drive.documents.map((document) => document.modified),
  ];
  for (const day of days) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day
    )
      throw new Error("Invalid fixture date.");
  }
  for (const instant of [
    fixedInstant,
    ...seed.events.map((event) => event.start),
    ...seed.projects.map((project) => project.countsAsOf),
  ]) {
    if (!instant.endsWith("+02:00") || !Number.isFinite(Date.parse(instant)))
      throw new Error("Invalid fixture instant.");
  }
  const storage = new Map<string, string>();
  const operations: Array<WorkspaceMockupSession["operations"][number]> = [];
  let disposed = false;
  return {
    id,
    taskState,
    calendarState,
    browserState,
    environmentId: seed.environmentId,
    resourceProjectId: seed.resourceProjectId,
    recipe:
      calendarState &&
      calendarState !== "picker" &&
      calendarState !== "no-url" &&
      calendarState !== "desktop-reject"
        ? { ...workspaceMockupRecipes[id], view: "week" }
        : workspaceMockupRecipes[id],
    seed,
    clock: { now: () => new Date(fixedInstant), today: () => "2026-10-13" },
    locale: "en-GB",
    timeZone:
      calendarState === "dst-fold" || calendarState === "dst-gap"
        ? "America/New_York"
        : "Africa/Johannesburg",
    storage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => {
        if (disposed) throw new Error("Fixture session is disposed.");
        storage.set(key, value);
      },
    },
    operations,
    record: async (kind, item, value) => {
      if (disposed) throw new Error("Fixture session is disposed.");
      operations.push({ kind, item: item ?? null, value: value ?? null });
    },
    settled: async () => {},
    dispose: () => {
      disposed = true;
      storage.clear();
      operations.length = 0;
    },
  };
}
