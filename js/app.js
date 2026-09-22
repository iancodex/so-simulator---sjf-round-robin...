/**
 * app.js
 * Application state, DOM rendering, and playback control.
 * All scheduling math lives in engine.js (window.Scheduler); this file
 * only decides *when* to call it and how to draw the result.
 */
(function () {
  "use strict";

  const { COLORS, ALGOS, runSchedule, fillIdle } = window.Scheduler;

  // ---------- state ----------

  let processes = [
    { id: 'P1', arrival: 0, burst: 5, priority: 2, type: 'cpu' },
    { id: 'P2', arrival: 1, burst: 3, priority: 1, type: 'io' },
    { id: 'P3', arrival: 2, burst: 8, priority: 3, type: 'cpu' },
    { id: 'P4', arrival: 3, burst: 6, priority: 2, type: 'io' },
  ];
  let nextNum = 5;
  let algo = 'fcfs';
  let quantum = 2;

  let schedule = { segments: [], stats: {} };
  let makespan = 0;
  let playhead = 0;
  let playing = false;
  let speed = 2;
  let lastFrameTime = null;
  let rafId = null;

  function colorFor(id) {
    const idx = processes.findIndex(p => p.id === id);
    return COLORS[idx % COLORS.length] || '#888';
  }

  // ---------- algorithm selector ----------

  function renderAlgoRow() {
    const row = document.getElementById('algoRow');
    row.innerHTML = '';
    ALGOS.forEach(a => {
      const btn = document.createElement('button');
      btn.className = 'algo-btn' + (a.id === algo ? ' active' : '');
      btn.textContent = a.label;
      btn.addEventListener('click', () => {
        algo = a.id;
        recompute();
        renderAlgoRow();
      });
      row.appendChild(btn);
    });
    const current = ALGOS.find(a => a.id === algo);
    document.getElementById('algoDesc').textContent = current.full + ' — ' + current.desc;
    document.getElementById('quantumRow').style.display = (algo === 'rr') ? 'flex' : 'none';
    const usesPriority = (algo === 'prio_np' || algo === 'prio_p');
    document.getElementById('prioHeader').style.opacity = usesPriority ? '1' : '.45';
  }

  // ---------- process table ----------

  function renderProcessTable() {
    const body = document.getElementById('ptableBody');
    body.innerHTML = '';
    processes.forEach((p, i) => {
      const tr = document.createElement('tr');

      const tdId = document.createElement('td');
      const chip = document.createElement('span');
      chip.className = 'pid-chip';
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = COLORS[i % COLORS.length];
      chip.appendChild(dot);
      chip.appendChild(document.createTextNode(p.id));
      tdId.appendChild(chip);
      tr.appendChild(tdId);

      tr.appendChild(numCell(p, 'arrival', 0));
      tr.appendChild(numCell(p, 'burst', 1));
      tr.appendChild(numCell(p, 'priority', 1));

      const tdType = document.createElement('td');
      const tag = document.createElement('span');
      tag.className = 'type-tag';
      tag.textContent = p.type === 'io' ? 'I/O-bound' : 'CPU-bound';
      tdType.appendChild(tag);
      tr.appendChild(tdType);

      const tdRemove = document.createElement('td');
      const rm = document.createElement('button');
      rm.className = 'remove-btn';
      rm.textContent = '✕';
      rm.title = 'Remover ' + p.id;
      rm.addEventListener('click', () => {
        processes = processes.filter(x => x.id !== p.id);
        recompute();
        renderProcessTable();
      });
      tdRemove.appendChild(rm);
      tr.appendChild(tdRemove);

      body.appendChild(tr);
    });
  }

  function numCell(p, field, min) {
    const td = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'number';
    input.min = String(min);
    input.value = p[field];
    input.style.width = '60px';
    input.addEventListener('change', () => {
      let v = parseInt(input.value, 10);
      if (isNaN(v) || v < min) v = min;
      p[field] = v;
      input.value = v;
      recompute();
    });
    td.appendChild(input);
    return td;
  }

  document.getElementById('addBtn').addEventListener('click', () => {
    const arrival = Math.max(0, parseInt(document.getElementById('inArrival').value, 10) || 0);
    const burst = Math.max(1, parseInt(document.getElementById('inBurst').value, 10) || 1);
    const priority = Math.max(1, parseInt(document.getElementById('inPriority').value, 10) || 1);
    const type = document.getElementById('inType').value;
    processes.push({ id: 'P' + nextNum, arrival, burst, priority, type });
    nextNum++;
    renderProcessTable();
    recompute();
  });

  document.getElementById('quantumInput').addEventListener('change', (e) => {
    let v = parseInt(e.target.value, 10);
    if (isNaN(v) || v < 1) v = 1;
    quantum = v;
    e.target.value = v;
    recompute();
  });

  // ---------- gantt rendering ----------

  function renderGantt() {
    const track = document.getElementById('ganttTrack');
    const axis = document.getElementById('ganttAxis');
    track.innerHTML = '';
    axis.innerHTML = '';

    if (schedule.segments.length === 0 || makespan === 0) {
      track.style.width = '100%';
      const empty = document.createElement('div');
      empty.className = 'seg idle';
      empty.style.width = '100%';
      empty.textContent = 'Adicione processos para ver a simulação';
      track.appendChild(empty);
      return;
    }

    const withIdle = fillIdle(schedule.segments);
    const pxPerUnit = Math.max(26, Math.min(60, 900 / makespan));
    const totalWidth = pxPerUnit * makespan;
    track.style.width = totalWidth + 'px';
    track.style.position = 'relative';

    withIdle.forEach(seg => {
      const div = document.createElement('div');
      const dur = seg.end - seg.start;
      div.style.width = (dur * pxPerUnit) + 'px';
      if (seg.pid === null) {
        div.className = 'seg idle';
        div.textContent = dur >= 2 ? 'ocioso' : '';
      } else {
        div.className = 'seg';
        div.style.background = colorFor(seg.pid);
        if (seg.end <= playhead) div.classList.add('past');
        div.textContent = dur * pxPerUnit > 24 ? seg.pid : '';
        div.title = seg.pid + ': ' + seg.start + ' → ' + seg.end;
      }
      track.appendChild(div);
    });

    axis.style.width = totalWidth + 'px';
    axis.style.position = 'relative';
    const step = makespan > 40 ? 5 : (makespan > 20 ? 2 : 1);
    for (let t = 0; t <= makespan; t += step) {
      const tick = document.createElement('div');
      tick.className = 'tick';
      tick.style.left = (t * pxPerUnit) + 'px';
      tick.textContent = t;
      axis.appendChild(tick);
    }

    const ph = document.createElement('div');
    ph.className = 'playhead';
    ph.style.left = Math.min(playhead, makespan) * pxPerUnit + 'px';
    track.appendChild(ph);
  }

  function renderLegend() {
    const legend = document.getElementById('legend');
    legend.innerHTML = '';
    processes.forEach((p, i) => {
      const s = document.createElement('span');
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = COLORS[i % COLORS.length];
      s.appendChild(dot);
      s.appendChild(document.createTextNode(p.id + ' (chegada ' + p.arrival + ', duração ' + p.burst + ')'));
      legend.appendChild(s);
    });
  }

  // ---------- status table + metrics ----------

  function executedBefore(pid, t) {
    let sum = 0;
    for (const s of schedule.segments) {
      if (s.pid !== pid) continue;
      const overlap = Math.max(0, Math.min(s.end, t) - s.start);
      sum += overlap;
    }
    return sum;
  }

  function renderStatusTable() {
    const body = document.getElementById('statusBody');
    body.innerHTML = '';
    processes.forEach(p => {
      const st = schedule.stats[p.id];
      const tr = document.createElement('tr');

      const tdId = document.createElement('td');
      tdId.innerHTML = '<span class="pid-chip"><span class="dot" style="background:' + colorFor(p.id) + '"></span>' + p.id + '</span>';
      tr.appendChild(tdId);

      const executed = executedBefore(p.id, playhead);
      const remaining = Math.max(0, p.burst - executed);
      const running = schedule.segments.some(s => s.pid === p.id && playhead >= s.start && playhead < s.end);

      let statusClass, statusText;
      if (playhead < p.arrival) { statusClass = 'notarrived'; statusText = 'não chegou'; }
      else if (st && st.finish !== null && playhead >= st.finish) { statusClass = 'done'; statusText = 'concluído'; }
      else if (running) { statusClass = 'running'; statusText = 'executando'; }
      else { statusClass = 'waiting'; statusText = 'esperando'; }

      const tdStatus = document.createElement('td');
      tdStatus.innerHTML = '<span class="status-badge ' + statusClass + '">' + statusText + '</span>';
      tr.appendChild(tdStatus);

      const tdRem = document.createElement('td');
      tdRem.style.fontFamily = 'var(--font-mono)';
      tdRem.textContent = playhead < p.arrival ? '—' : remaining;
      tr.appendChild(tdRem);

      const tdWait = document.createElement('td');
      tdWait.style.fontFamily = 'var(--font-mono)';
      const finished = st && st.finish !== null && playhead >= st.finish;
      if (finished) {
        tdWait.textContent = (st.finish - p.arrival - p.burst);
      } else if (playhead >= p.arrival) {
        const elapsedSinceArrival = playhead - p.arrival;
        tdWait.textContent = Math.max(0, elapsedSinceArrival - executed);
      } else {
        tdWait.textContent = '—';
      }
      tr.appendChild(tdWait);

      const tdTurn = document.createElement('td');
      tdTurn.style.fontFamily = 'var(--font-mono)';
      tdTurn.textContent = finished ? (st.finish - p.arrival) : '—';
      tr.appendChild(tdTurn);

      body.appendChild(tr);
    });
  }

  function renderMetrics() {
    const grid = document.getElementById('metricsGrid');
    grid.innerHTML = '';
    const ids = Object.keys(schedule.stats);
    if (ids.length === 0 || ids.some(id => schedule.stats[id].finish === null)) {
      grid.innerHTML = '<div class="metric"><div class="num">—</div><div class="lbl">execute a simulação</div></div>';
      return;
    }
    let waitSum = 0, turnSum = 0;
    ids.forEach(id => {
      const st = schedule.stats[id];
      waitSum += (st.finish - st.arrival - st.burst);
      turnSum += (st.finish - st.arrival);
    });
    const avgWait = (waitSum / ids.length).toFixed(2);
    const avgTurn = (turnSum / ids.length).toFixed(2);
    const throughput = (ids.length / makespan).toFixed(3);

    const metrics = [
      { num: avgWait, lbl: 'espera média' },
      { num: avgTurn, lbl: 'retorno médio' },
      { num: throughput, lbl: 'vazão (proc./unid. tempo)' },
      { num: makespan, lbl: 'tempo total (makespan)' },
    ];
    metrics.forEach(m => {
      const div = document.createElement('div');
      div.className = 'metric';
      div.innerHTML = '<div class="num">' + m.num + '</div><div class="lbl">' + m.lbl + '</div>';
      grid.appendChild(div);
    });
  }

  // ---------- playback ----------

  function setPlayhead(t) {
    playhead = Math.max(0, Math.min(t, makespan));
    document.getElementById('clockVal').textContent = playhead.toFixed(2).replace(/\.00$/, '');
    renderGantt();
    renderStatusTable();
    if (playhead >= makespan) pause();
  }

  function play() {
    if (processes.length === 0 || makespan === 0) return;
    if (playhead >= makespan) playhead = 0;
    playing = true;
    document.getElementById('playBtn').textContent = '⏸ Pausar';
    lastFrameTime = null;
    rafId = requestAnimationFrame(tick);
  }

  function pause() {
    playing = false;
    document.getElementById('playBtn').textContent = '▶ Executar';
    if (rafId) cancelAnimationFrame(rafId);
  }

  function tick(now) {
    if (!playing) return;
    if (lastFrameTime === null) lastFrameTime = now;
    const dt = (now - lastFrameTime) / 1000;
    lastFrameTime = now;
    setPlayhead(playhead + dt * speed);
    if (playing) rafId = requestAnimationFrame(tick);
  }

  document.getElementById('playBtn').addEventListener('click', () => {
    if (playing) pause(); else play();
  });
  document.getElementById('stepBtn').addEventListener('click', () => {
    pause();
    setPlayhead(Math.floor(playhead) + 1);
  });
  document.getElementById('resetBtn').addEventListener('click', () => {
    pause();
    setPlayhead(0);
  });
  document.getElementById('speedInput').addEventListener('input', (e) => {
    speed = parseFloat(e.target.value);
    document.getElementById('speedLabel').textContent = speed + '×';
  });

  // ---------- recompute ----------

  function recompute() {
    pause();
    schedule = runSchedule(processes, algo, quantum);
    makespan = schedule.segments.length ? Math.max(...schedule.segments.map(s => s.end)) : 0;
    playhead = 0;
    document.getElementById('clockVal').textContent = '0';
    renderGantt();
    renderLegend();
    renderStatusTable();
    renderMetrics();
  }

  // ---------- init ----------

  renderAlgoRow();
  renderProcessTable();
  recompute();

})();
