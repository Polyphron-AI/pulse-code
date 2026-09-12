import * as Arr from "effect/Array";
import type { OrchestrationShellSnapshot, OrchestrationShellStreamEvent } from "@t3tools/contracts";

/**
 * Reduce a single shell stream event into an existing snapshot, returning a new
 * snapshot with the event's changes applied. This is a pure reducer that both
 * web and mobile can use to keep their local shell snapshot in sync.
 *
 * Returns the original snapshot reference unchanged if the event is not
 * recognized (forward-compatible).
 */
export function applyShellStreamEvent(
  snapshot: OrchestrationShellSnapshot,
  event: OrchestrationShellStreamEvent,
): OrchestrationShellSnapshot {
  if (event.sequence <= snapshot.snapshotSequence) return snapshot;

  switch (event.kind) {
    case "project-upserted": {
      const projects = snapshot.projects.some((p) => p.id === event.project.id)
        ? Arr.map(snapshot.projects, (p) => (p.id === event.project.id ? event.project : p))
        : Arr.append(snapshot.projects, event.project);
      return { ...snapshot, projects, snapshotSequence: event.sequence };
    }
    case "project-removed":
      return {
        ...snapshot,
        projects: Arr.filter(snapshot.projects, (p) => p.id !== event.projectId),
        snapshotSequence: event.sequence,
      };
    case "thread-upserted": {
      const threads = snapshot.threads.some((t) => t.id === event.thread.id)
        ? Arr.map(snapshot.threads, (t) => (t.id === event.thread.id ? event.thread : t))
        : Arr.append(snapshot.threads, event.thread);
      return { ...snapshot, threads, snapshotSequence: event.sequence };
    }
    case "thread-removed":
      return {
        ...snapshot,
        threads: Arr.filter(snapshot.threads, (t) => t.id !== event.threadId),
        snapshotSequence: event.sequence,
      };
    case "schedule-upserted": {
      const schedules = snapshot.schedules ?? [];
      const nextSchedules = schedules.some((schedule) => schedule.id === event.schedule.id)
        ? Arr.map(schedules, (schedule) =>
            schedule.id === event.schedule.id ? event.schedule : schedule,
          )
        : Arr.append(schedules, event.schedule);
      return { ...snapshot, schedules: nextSchedules, snapshotSequence: event.sequence };
    }
    case "schedule-removed":
      return {
        ...snapshot,
        schedules: Arr.filter(
          snapshot.schedules ?? [],
          (schedule) => schedule.id !== event.scheduleId,
        ),
        snapshotSequence: event.sequence,
      };
    case "manager-upserted": {
      const managers = snapshot.managers ?? [];
      const nextManagers = managers.some((manager) => manager.id === event.manager.id)
        ? Arr.map(managers, (manager) =>
            manager.id === event.manager.id ? event.manager : manager,
          )
        : Arr.append(managers, event.manager);
      return { ...snapshot, managers: nextManagers, snapshotSequence: event.sequence };
    }
    case "assistant-upserted": {
      // One assistant per environment, and it is never removed, so an upsert
      // either replaces the record or is the first one.
      const assistants = snapshot.assistants ?? [];
      const nextAssistants = assistants.some((assistant) => assistant.id === event.assistant.id)
        ? Arr.map(assistants, (assistant) =>
            assistant.id === event.assistant.id ? event.assistant : assistant,
          )
        : Arr.append(assistants, event.assistant);
      return { ...snapshot, assistants: nextAssistants, snapshotSequence: event.sequence };
    }
    case "manager-removed":
      return {
        ...snapshot,
        managers: Arr.filter(snapshot.managers ?? [], (manager) => manager.id !== event.managerId),
        snapshotSequence: event.sequence,
      };
    default:
      return snapshot;
  }
}
