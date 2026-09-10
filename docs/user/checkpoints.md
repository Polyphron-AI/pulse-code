# Checkpoints

Pulse captures the final file changes when a turn completes or is interrupted. Interim diff updates do not finish the checkpoint: edits made later in the same turn are included when the turn ends.

An interrupted turn stays marked interrupted after its checkpoint is ready. A missing checkpoint does not, by itself, mean the turn was interrupted.

Checkpoint capture proceeds independently of pull-request status refreshes, so a slow remote lookup does not delay saving the turn?s file changes.
