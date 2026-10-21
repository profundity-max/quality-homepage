export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startLearningRetentionWorker } = await import(
      "@/modules/learning-stats/retention-worker"
    );
    startLearningRetentionWorker();
  }
}
