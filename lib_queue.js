// lib_queue.js — универсальная очередь concurrency=1 для background.
// Использование: const q = self.makeQueue(240000); q.enqueue(asyncFn);
self.makeQueue = function (jobTimeoutMs) {
  const q = { jobs: [], running: false, timeout: jobTimeoutMs || 0 };
  q.enqueue = function (fn) {
    return new Promise((resolve, reject) => {
      q.jobs.push({ fn: fn, resolve: resolve, reject: reject });
      q.process();
    });
  };
  q.process = async function () {
    if (q.running) return;
    q.running = true;
    while (q.jobs.length) {
      const job = q.jobs.shift();
      try {
        if (q.timeout) {
          await Promise.race([job.fn(), new Promise(r => setTimeout(r, q.timeout))]);
        } else {
          await job.fn();
        }
        job.resolve();
      } catch (e) {
        job.reject(e);
      }
    }
    q.running = false;
  };
  return q;
};
