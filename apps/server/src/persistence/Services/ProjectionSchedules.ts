/**
 * ProjectionScheduleRepository - Projection repository interface for scheduled
 * chats.
 *
 * Owns persistence for schedule rows in the orchestration projection read
 * model. The engine hydrates its command read model from projection tables, so
 * these rows are what let a schedule keep firing across restarts.
 *
 * @module ProjectionScheduleRepository
 */
import {
  IsoDateTime,
  ModelSelection,
  OrchestrationSchedule,
  ScheduleId,
  ScheduleProjectState,
  ScheduleScope,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

import type { ProjectionRepositoryError } from "../Errors.ts";

/** A projected schedule row is the domain schedule verbatim. */
export const ProjectionSchedule = OrchestrationSchedule;
export type ProjectionSchedule = typeof ProjectionSchedule.Type;

/**
 * The row as SQLite holds it: nested contract shapes arrive as JSON text and
 * the tri-state `skipIfDirty` as NULL / 0 / 1. Shared by the repository and the
 * snapshot query so both read the table the same way.
 */
export const ProjectionScheduleDbRow = Schema.Struct({
  id: ScheduleId,
  scope: Schema.fromJsonString(ScheduleScope),
  hourLocal: Schema.Number,
  minuteLocal: Schema.Number,
  timezone: Schema.String,
  prompt: Schema.String,
  workflowScriptRef: Schema.NullOr(Schema.String),
  modelSelection: Schema.NullOr(Schema.fromJsonString(ModelSelection)),
  skipIfDirty: Schema.NullOr(Schema.Number),
  autoPausedReason: Schema.NullOr(Schema.String),
  handoffPathTemplate: Schema.String,
  maxRunMinutes: Schema.Number,
  maxTurnMinutes: Schema.Number,
  pausedAt: Schema.NullOr(IsoDateTime),
  projectStates: Schema.fromJsonString(Schema.Array(ScheduleProjectState)),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  deletedAt: Schema.NullOr(IsoDateTime),
});
export type ProjectionScheduleDbRow = typeof ProjectionScheduleDbRow.Type;

/** SELECT list matching ProjectionScheduleDbRow, for every reader of the table. */
export const PROJECTION_SCHEDULE_COLUMNS = `
  schedule_id AS "id",
  scope_json AS "scope",
  hour_local AS "hourLocal",
  minute_local AS "minuteLocal",
  timezone,
  prompt,
  workflow_script_ref AS "workflowScriptRef",
  model_selection_json AS "modelSelection",
  skip_if_dirty AS "skipIfDirty",
  auto_paused_reason AS "autoPausedReason",
  handoff_path_template AS "handoffPathTemplate",
  max_run_minutes AS "maxRunMinutes",
  max_turn_minutes AS "maxTurnMinutes",
  paused_at AS "pausedAt",
  project_states_json AS "projectStates",
  created_at AS "createdAt",
  updated_at AS "updatedAt",
  deleted_at AS "deletedAt"
`;

export const toProjectionSchedule = (row: ProjectionScheduleDbRow): ProjectionSchedule => ({
  ...row,
  skipIfDirty: row.skipIfDirty === null ? null : row.skipIfDirty === 1,
});

export const GetProjectionScheduleInput = Schema.Struct({
  scheduleId: ScheduleId,
});
export type GetProjectionScheduleInput = typeof GetProjectionScheduleInput.Type;

/**
 * ProjectionScheduleRepositoryShape - Service API for projected schedules.
 */
export interface ProjectionScheduleRepositoryShape {
  /**
   * Insert or replace a projected schedule row, keyed by schedule id.
   */
  readonly upsert: (row: ProjectionSchedule) => Effect.Effect<void, ProjectionRepositoryError>;

  /**
   * Read a projected schedule row by id, including soft-deleted rows.
   */
  readonly getById: (
    input: GetProjectionScheduleInput,
  ) => Effect.Effect<Option.Option<ProjectionSchedule>, ProjectionRepositoryError>;

  /**
   * List every projected schedule row in creation order, including
   * soft-deleted rows so the read model can rebuild exactly.
   */
  readonly listAll: () => Effect.Effect<
    ReadonlyArray<ProjectionSchedule>,
    ProjectionRepositoryError
  >;
}

/**
 * ProjectionScheduleRepository - Service tag for schedule projection
 * persistence.
 */
export class ProjectionScheduleRepository extends Context.Service<
  ProjectionScheduleRepository,
  ProjectionScheduleRepositoryShape
>()("t3/persistence/Services/ProjectionSchedules/ProjectionScheduleRepository") {}
