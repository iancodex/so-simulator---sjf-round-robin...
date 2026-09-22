/**
 * engine.js
 * Pure CPU-scheduling algorithms. No DOM access here — every function takes
 * a list of processes (and, where relevant, a quantum) and returns a
 * { segments, stats } schedule object:
 *
 *   segments: [{ pid, start, end }, ...]   — contiguous execution slices
 *   stats:    { [pid]: { arrival, burst, start, finish } }
 *
 * This separation means the six algorithms can be unit-tested or reused
 * (e.g. in a CLI or a different UI) without touching app.js.
 */
(function (global) {
  "use strict";

  const COLORS = ['#33618C', '#E0972E', '#5F8F6E', '#8A5FA8', '#B7503F', '#3E8E8E', '#A34A7C', '#7C8C3E'];

  const ALGOS = [
    { id: 'fcfs', label: 'FCFS', full: 'First-Come, First-Served',
      desc: 'Executa os processos na ordem de chegada, sem interrupções. Simples, mas pode fazer processos curtos esperarem atrás de processos longos.' },
    { id: 'sjf', label: 'SJF', full: 'Shortest Job First (não preemptivo)',
      desc: 'A cada escolha, roda o processo pronto com a menor duração total até o fim, sem interromper. Minimiza a espera média, mas pode postergar processos longos indefinidamente.' },
    { id: 'srtf', label: 'SRTF', full: 'SJF Preemptivo (Shortest Remaining Time First)',
      desc: 'Como o SJF, mas pode interromper o processo em execução se um recém-chegado tiver um tempo restante menor. Reage rápido a processos curtos, ao custo de mais trocas de contexto.' },
    { id: 'rr', label: 'Round-Robin', full: 'Round-Robin',
      desc: 'Cada processo roda por no máximo um quantum de tempo, depois volta para o fim da fila. Garante que todos avancem, mas processos longos levam mais tempo para terminar.' },
    { id: 'prio_np', label: 'Prioridade', full: 'Prioridade (não preemptivo)',
      desc: 'Executa o processo pronto de maior prioridade (número menor = mais prioritário) até o fim, sem interromper.' },
    { id: 'prio_p', label: 'Prioridade Preemptiva', full: 'Prioridade (preemptiva)',
      desc: 'Como a prioridade não preemptiva, mas um processo em execução é interrompido assim que chega alguém com prioridade mais alta.' },
  ];

  // Comparators used to pick the next process to run. Every one falls back
  // to arrival time, then insertion order, so ties are always resolved
  // deterministically.
  const Comparators = {
    arrival:   (a, b) => a.arrival - b.arrival || a.order - b.order,
    burst:     (a, b) => a.burst - b.burst || a.arrival - b.arrival || a.order - b.order,
    remaining: (a, b) => a.remaining - b.remaining || a.arrival - b.arrival || a.order - b.order,
    priority:  (a, b) => (a.priority ?? 999) - (b.priority ?? 999) || a.arrival - b.arrival || a.order - b.order,
  };

  function withOrder(list) {
    return list.map((p, i) => ({ ...p, order: i, remaining: p.burst }));
  }

  /** Non-preemptive dispatch: once picked, a process runs to completion. */
  function simulateNonPreemptive(list, cmp) {
    let procs = withOrder(list);
    let time = 0, segments = [], stats = {}, done = 0;
    while (done < procs.length) {
      let avail = procs.filter(p => p.remaining > 0 && p.arrival <= time);
      if (avail.length === 0) {
        let arrivals = procs.filter(p => p.remaining > 0).map(p => p.arrival);
        time = Math.min(...arrivals);
        continue;
      }
      avail.sort(cmp);
      let p = avail[0];
      let start = time, end = time + p.remaining;
      segments.push({ pid: p.id, start, end });
      stats[p.id] = { arrival: p.arrival, burst: p.burst, start, finish: end };
      p.remaining = 0;
      time = end;
      done++;
    }
    return { segments, stats };
  }

  /**
   * Preemptive dispatch driven by re-evaluating `cmp` every single time
   * unit (used for SRTF and preemptive Priority). Adjacent slices for the
   * same process are merged into one segment.
   */
  function simulateTickPreemptive(list, cmp) {
    let procs = withOrder(list);
    let time = 0, segments = [], stats = {};
    while (procs.some(p => p.remaining > 0)) {
      let avail = procs.filter(p => p.remaining > 0 && p.arrival <= time);
      if (avail.length === 0) {
        let arrivals = procs.filter(p => p.remaining > 0).map(p => p.arrival);
        time = Math.min(...arrivals);
        continue;
      }
      avail.sort(cmp);
      let p = avail[0];
      if (!stats[p.id]) stats[p.id] = { arrival: p.arrival, burst: p.burst, start: null, finish: null };
      if (stats[p.id].start === null) stats[p.id].start = time;
      let last = segments[segments.length - 1];
      if (last && last.pid === p.id && last.end === time) {
        last.end += 1;
      } else {
        segments.push({ pid: p.id, start: time, end: time + 1 });
      }
      p.remaining -= 1;
      time += 1;
      if (p.remaining === 0) stats[p.id].finish = time;
    }
    return { segments, stats };
  }

  /** Round-Robin: queue-based, quantum-bounded slices. */
  function simulateRR(list, quantum) {
    let procs = withOrder(list).sort((a, b) => a.arrival - b.arrival || a.order - b.order);
    let time = 0, segments = [], stats = {};
    let queue = [], idx = 0;
    const n = procs.length;

    function enqueueArrivals(upto) {
      while (idx < n && procs[idx].arrival <= upto) { queue.push(procs[idx]); idx++; }
    }

    enqueueArrivals(0);
    if (queue.length === 0 && idx < n) { time = procs[idx].arrival; enqueueArrivals(time); }

    while (queue.length > 0) {
      let p = queue.shift();
      if (!stats[p.id]) stats[p.id] = { arrival: p.arrival, burst: p.burst, start: null, finish: null };
      if (stats[p.id].start === null) stats[p.id].start = time;
      let run = Math.min(quantum, p.remaining);
      let start = time;
      time += run;
      p.remaining -= run;
      segments.push({ pid: p.id, start, end: time });
      // Arrivals during this slice join the queue before the preempted
      // process re-enters it — the standard Round-Robin convention.
      enqueueArrivals(time);
      if (p.remaining > 0) queue.push(p);
      else stats[p.id].finish = time;
      if (queue.length === 0 && idx < n) { time = procs[idx].arrival; enqueueArrivals(time); }
    }
    return { segments, stats };
  }

  /** Dispatches to the right engine for a given algorithm id. */
  function runSchedule(processes, algo, quantum) {
    if (processes.length === 0) return { segments: [], stats: {} };
    switch (algo) {
      case 'fcfs': return simulateNonPreemptive(processes, Comparators.arrival);
      case 'sjf': return simulateNonPreemptive(processes, Comparators.burst);
      case 'srtf': return simulateTickPreemptive(processes, Comparators.remaining);
      case 'rr': return simulateRR(processes, quantum);
      case 'prio_np': return simulateNonPreemptive(processes, Comparators.priority);
      case 'prio_p': return simulateTickPreemptive(processes, Comparators.priority);
      default: return simulateNonPreemptive(processes, Comparators.arrival);
    }
  }

  /** Inserts explicit idle blocks ({ pid: null }) into any gaps between segments. */
  function fillIdle(segments) {
    if (segments.length === 0) return [];
    let out = [], cursor = segments[0].start;
    for (const s of segments) {
      if (s.start > cursor) out.push({ pid: null, start: cursor, end: s.start });
      out.push(s);
      cursor = s.end;
    }
    return out;
  }

  global.Scheduler = {
    COLORS,
    ALGOS,
    Comparators,
    simulateNonPreemptive,
    simulateTickPreemptive,
    simulateRR,
    runSchedule,
    fillIdle,
  };

})(window);
