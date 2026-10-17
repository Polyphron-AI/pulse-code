import type { WorkspaceItemRef } from "@t3tools/contracts";
import {
  CalendarDaysIcon,
  FileIcon,
  FolderIcon,
  LinkIcon,
  ListTodoIcon,
  MailIcon,
  MessageCircleIcon,
} from "lucide-react";

export function WorkspaceItemIcon({ item }: { item: WorkspaceItemRef }) {
  const Icon =
    item.type === "provider-resource" && item.provider === "workspace-calendar"
      ? CalendarDaysIcon
      : item.type === "mail"
        ? MailIcon
        : item.type === "file"
          ? FileIcon
          : item.type === "project"
            ? FolderIcon
            : item.type === "url"
              ? LinkIcon
              : item.type === "task"
                ? ListTodoIcon
                : MessageCircleIcon;
  return <Icon aria-hidden />;
}
