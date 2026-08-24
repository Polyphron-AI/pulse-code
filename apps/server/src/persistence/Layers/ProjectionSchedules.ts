import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { toPersistenceSqlError } from "../Errors.ts";
import {
  GetProjectionScheduleInput,
  PROJECTION_SCHEDULE_COLUMNS,
  ProjectionSchedule,
  ProjectionScheduleDbRow,
  ProjectionScheduleRepository,
  toProjectionSchedule,
  type ProjectionScheduleRepositoryShape,
} from "../Services/ProjectionSchedules.ts";

const makeProjectionScheduleRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const upsertProjectionScheduleRow = SqlSchema.void({
    Request: ProjectionSchedule,
    execute: (row) =>
      sql`
        INSERT INTO projection_schedules (
          schedule_id,
          scope_json,
          hour_local,
          minute_local,
          timezone,
          prompt,
          workflow_script_ref,
          model_selection_json,
          skip_if_dirty,
          auto_paused_reason,
          handoff_path_template,
          max_run_minutes,
          max_turn_minutes,
          paused_at,
          project_states_json,
          created_at,
          updated_at,
          deleted_at
        )
        VALUES (
          ${row.id},
          ${JSON.stringify(row.scope)},
          ${row.hourLocal},
          ${row.minuteLocal},
          ${row.timezone},
          ${row.prompt},
          ${row.workflowScriptRef ?? null},
          ${row.modelSelection ? JSON.stringify(row.modelSelection) : null},
          ${row.skipIfDirty === null || row.skipIfDirty === undefined ? null : row.skipIfDirty ? 1 : 0},
          ${row.autoPausedReason ?? null},
          ${row.handoffPathTemplate},
          ${row.maxRunMinutes},
          ${row.maxTurnMinutes},
          ${row.pausedAt},
          ${JSON.stringify(row.projectStates)},
          ${row.createdAt},
          ${row.updatedAt},
          ${row.deletedAt}
        )
        ON CONFLICT (schedule_id)
        DO UPDATE SET
          scope_json = excluded.scope_json,
          hour_local = excluded.hour_local,
          minute_local = excluded.minute_local,
          timezone = excluded.timezone,
          prompt = excluded.prompt,
          workflow_script_ref = excluded.workflow_script_ref,
          model_selection_json = excluded.model_selection_json,
          skip_if_dirty = excluded.skip_if_dirty,
          auto_paused_reason = excluded.auto_paused_reason,
          handoff_path_template = excluded.handoff_path_template,
          max_run_minutes = excluded.max_run_minutes,
          max_turn_minutes = excluded.max_turn_minutes,
          paused_at = excluded.paused_at,
          project_states_json = excluded.project_states_json,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          deleted_at = excluded.deleted_at
      `,
  });

  const getProjectionScheduleRow = SqlSchema.findOneOption({
    Request: GetProjectionScheduleInput,
    Result: ProjectionScheduleDbRow,
    execute: ({ scheduleId }) =>
      sql`
        SELECT ${sql.literal(PROJECTION_SCHEDULE_COLUMNS)}
        FROM projection_schedules
        WHERE schedule_id = ${scheduleId}
      `,
  });

  const listProjectionScheduleRows = SqlSchema.findAll({
    Request: Schema.Void,
    Result: ProjectionScheduleDbRow,
    execute: () =>
      sql`
        SELECT ${sql.literal(PROJECTION_SCHEDULE_COLUMNS)}
        FROM projection_schedules
        ORDER BY created_at ASC, schedule_id ASC
      `,
  });

  const upsert: ProjectionScheduleRepositoryShape["upsert"] = (row) =>
    upsertProjectionScheduleRow(row).pipe(
      Effect.mapError(toPersistenceSqlError("ProjectionScheduleRepository.upsert:query")),
    );

  const getById: ProjectionScheduleRepositoryShape["getById"] = (input) =>
    getProjectionScheduleRow(input).pipe(
      Effect.map(Option.map(toProjectionSchedule)),
      Effect.mapError(toPersistenceSqlError("ProjectionScheduleRepository.getById:query")),
    );

  const listAll: ProjectionScheduleRepositoryShape["listAll"] = () =>
    listProjectionScheduleRows().pipe(
      Effect.map((rows) => rows.map(toProjectionSchedule)),
      Effect.mapError(toPersistenceSqlError("ProjectionScheduleRepository.listAll:query")),
    );

  return {
    upsert,
    getById,
    listAll,
  } satisfies ProjectionScheduleRepositoryShape;
});

export const ProjectionScheduleRepositoryLive = Layer.effect(
  ProjectionScheduleRepository,
  makeProjectionScheduleRepository,
);
