# V40 automatic title retry

Source `fc262f1a2` adds two retries to automatic first-turn title generation, with exponential delays of 2 and 4 seconds. Successful generation still rereads the thread and checks its current title against the default or client seed before updating it. Explicit title regeneration and branch naming retain their existing behavior. Exhausted failures use the existing warning path and do not fail the provider turn.

A synthetic TestClock test exercises both retry delays and waits for the persisted title-update event before asserting the snapshot. Existing first-turn generation, custom-title preservation and reformatted client-seed tests are included in the focused check. No providers or runtime clients were launched.
