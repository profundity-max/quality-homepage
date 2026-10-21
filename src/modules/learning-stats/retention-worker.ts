import { getDatabase } from "@/db/database";
import { purgeExpiredStats } from "./retention";
const state = globalThis as typeof globalThis & {
  learningRetentionStarted?: boolean;
};
export function startLearningRetentionWorker() {
  if (state.learningRetentionStarted) return;
  state.learningRetentionStarted = true;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await purgeExpiredStats(getDatabase());
    } catch (error) {
      console.error("Learning statistics retention failed", error);
    } finally {
      running = false;
    }
  };
  // Start after the application has opened its migrated database, then daily.
  setTimeout(() => void run(), 30_000).unref();
  setInterval(() => void run(), 24 * 60 * 60_000).unref();
}
