export function startVisibilityAwarePolling(
  task,
  intervalMs,
  { immediate = false, visibilityTarget = document } = {}
) {
  let timer = null;
  let running = false;
  let stopped = false;

  const schedule = () => {
    if (stopped || visibilityTarget.hidden) return;
    timer = setTimeout(run, intervalMs);
  };

  const run = async () => {
    timer = null;
    if (stopped || visibilityTarget.hidden || running) return;
    running = true;
    try {
      await task();
    } catch (error) {
      console.error('Erreur lors d’une vérification périodique Botora :', error);
    } finally {
      running = false;
      schedule();
    }
  };

  const handleVisibilityChange = () => {
    if (visibilityTarget.hidden) {
      clearTimeout(timer);
      timer = null;
      return;
    }

    clearTimeout(timer);
    timer = null;
    if (!running) run();
  };

  visibilityTarget.addEventListener('visibilitychange', handleVisibilityChange);
  if (immediate) run();
  else schedule();

  return () => {
    stopped = true;
    clearTimeout(timer);
    visibilityTarget.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}
