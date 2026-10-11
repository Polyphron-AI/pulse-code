// Local sample conversations. No messages are sent to connected services.
export interface DemoMessage {
  id: string;
  who: string;
  initials: string;
  color: string;
  time: string;
  text: string;
  attachment?: boolean;
  reactions?: number;
  reacted?: boolean;
  replies?: DemoMessage[];
}
export interface DemoConversation {
  id: string;
  name: string;
  type: string;
  source: string;
  account: string;
  topic: string;
  members: number;
  icon: string;
  section: string;
  intro: string;
  description: string;
  messages: DemoMessage[];
}
export const demoConversations: DemoConversation[] = [
  {
    id: "launch",
    name: "launch",
    type: "channel",
    source: "Discord",
    account: "Pulse team",
    topic: "Launch planning, updates, and the last little details.",
    members: 8,
    icon: "#",
    section: "Launch",
    intro: "The launch room",
    description:
      "A shared place for launch decisions. Messages stay in the original Discord channel.",
    messages: [
      {
        id: "m1",
        who: "Maya Chen",
        initials: "MC",
        color: "",
        time: "9:12 AM",
        text: "Morning team! The launch kit is ready for a final look.\nOne place for the message, product shots, and partner notes.",
        attachment: true,
        reactions: 3,
        replies: [
          {
            id: "sample-reply-1",
            who: "Leo Martins",
            initials: "LM",
            color: "green",
            time: "9:18 AM",
            text: "The product shots look good. I updated the desktop screenshot this morning.",
          },
          {
            id: "sample-reply-2",
            who: "Nina Patel",
            initials: "NP",
            color: "brown",
            time: "9:24 AM",
            text: 'Copy approved from my side. Let\'s use "Your tools. One workspace."',
          },
        ],
      },
      {
        id: "m2",
        who: "Leo Martins",
        initials: "LM",
        color: "green",
        time: "9:31 AM",
        text: "The build is ready. Desktop and web are on the same release candidate. ✅",
        reactions: 2,
        replies: [],
      },
      {
        id: "m3",
        who: "Nina Patel",
        initials: "NP",
        color: "brown",
        time: "9:42 AM",
        text: "@Quinn can you give the announcement a final read?\nPartner approval is in the email conversation. Keeping the recipients there.",
        reactions: 0,
        replies: [],
      },
    ],
  },
  {
    id: "partners",
    name: "partner-launch",
    type: "channel",
    source: "Telegram",
    account: "Quinn · Telegram",
    topic: "Partner coordination and launch day timing.",
    members: 6,
    icon: "#",
    section: "Launch",
    intro: "Partners, in the loop",
    description: "The Telegram group, right here in Pulse. Replies go to its original members.",
    messages: [
      {
        id: "p1",
        who: "Alex Rivera",
        initials: "AR",
        color: "blue",
        time: "9:28 AM",
        text: "Our team is ready for the Thursday announcement. Can we confirm 10:00 UTC?",
        reactions: 1,
        replies: [],
      },
      {
        id: "p2",
        who: "Maya Chen",
        initials: "MC",
        color: "",
        time: "9:36 AM",
        text: "Yes — 10:00 UTC works. I’ll share the approved launch kit here once the last review is done.",
        reactions: 2,
        replies: [],
      },
    ],
  },
  {
    id: "approval",
    name: "launch-approval",
    type: "email",
    source: "Email",
    account: "quinn@pulse.team",
    topic: "Subject: Final approval · Pulse launch",
    members: 4,
    icon: "✉",
    section: "Launch",
    intro: "Final approval · Pulse launch",
    description:
      "An email conversation with Maya, Nina, and Alex. Reply-all keeps the original recipients.",
    messages: [
      {
        id: "e1",
        who: "Alex Rivera",
        initials: "AR",
        color: "blue",
        time: "8:48 AM",
        text: "Hi team,\n\nWe’ve reviewed the announcement and approved the partner quote. Please use the version in the launch kit.\n\nThanks,\nAlex",
        reactions: 0,
        replies: [],
      },
      {
        id: "e2",
        who: "Nina Patel",
        initials: "NP",
        color: "brown",
        time: "9:08 AM",
        text: "Thanks Alex. Confirming we have your approval for Thursday at 10:00 UTC.\n\nQuinn — final copy review is the only remaining item.",
        reactions: 0,
        replies: [],
      },
    ],
  },
  {
    id: "engineering",
    name: "engineering",
    type: "channel",
    source: "Discord",
    account: "Pulse team",
    topic: "Builds, reviews, and shipping together.",
    members: 12,
    icon: "#",
    section: "Team",
    intro: "Engineering",
    description: "Keep the implementation discussion close to the team.",
    messages: [
      {
        id: "g1",
        who: "Leo Martins",
        initials: "LM",
        color: "green",
        time: "8:56 AM",
        text: "Release candidate checks are green. If you spot anything in the launch build, reply here with the steps.",
        reactions: 4,
        replies: [],
      },
    ],
  },
  {
    id: "maya",
    name: "Maya Chen",
    type: "dm",
    source: "Telegram",
    account: "Quinn · Telegram",
    topic: "Direct message · Maya Chen",
    members: 2,
    icon: "MC",
    section: "Direct messages",
    intro: "Maya Chen",
    description: "Your Telegram conversation with Maya.",
    messages: [
      {
        id: "d1",
        who: "Maya Chen",
        initials: "MC",
        color: "",
        time: "9:46 AM",
        text: "Do you have five minutes to look at the announcement together? I’m around until 11.",
        reactions: 0,
        replies: [],
      },
    ],
  },
  {
    id: "leo",
    name: "Leo Martins",
    type: "dm",
    source: "Discord",
    account: "Pulse team",
    topic: "Direct message · Leo Martins",
    members: 2,
    icon: "LM",
    section: "Direct messages",
    intro: "Leo Martins",
    description: "Your Discord conversation with Leo.",
    messages: [
      {
        id: "d2",
        who: "Leo Martins",
        initials: "LM",
        color: "green",
        time: "9:38 AM",
        text: "The latest desktop build is ready for your review. All launch fixes made it in.",
        reactions: 0,
        replies: [],
      },
    ],
  },
];
