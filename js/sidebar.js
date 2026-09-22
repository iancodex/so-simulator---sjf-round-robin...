/**
 * sidebar.js
 * Renders the left navigation shared by index.html and every page under
 * docs/. Reads its list of algorithms from window.Scheduler.ALGOS (engine.js)
 * so the nav, the simulator's algorithm selector, and the doc pages can
 * never drift out of sync — add an algorithm to ALGOS once, and it shows
 * up everywhere.
 *
 * Usage:
 *   <script src="js/engine.js"></script>
 *   <script src="js/sidebar.js"></script>
 *   <script>initSidebar('sidebarMount', { fromDocs: false, current: 'index' });</script>
 *
 * From a page under docs/, pass fromDocs: true and current: '<slug>'.
 */
(function (global) {
  "use strict";

  function initSidebar(mountId, opts) {
    opts = opts || {};
    const fromDocs = !!opts.fromDocs;
    const current = opts.current || null;
    const mount = document.getElementById(mountId);
    if (!mount) return;

    const homeHref = fromDocs ? '../index.html' : 'index.html';
    const docsPrefix = fromDocs ? '' : 'docs/';
    const algos = (global.Scheduler && global.Scheduler.ALGOS) || [];

    let html = '';
    html += '<div class="sidebar-brand"><span class="mark">CPU</span><span class="sidebar-title">Escalonador</span></div>';
    html += '<nav class="sidebar-group" aria-label="Navegação principal">';
    html += '<a class="sidebar-link' + (current === 'index' ? ' active' : '') + '" href="' + homeHref + '">Simulador</a>';
    html += '</nav>';
    html += '<nav class="sidebar-group" aria-label="Algoritmos">';
    html += '<div class="sidebar-heading">algoritmos</div>';
    algos.forEach(a => {
      const active = current === a.slug ? ' active' : '';
      html += '<a class="sidebar-link' + active + '" href="' + docsPrefix + a.slug + '.html">' + a.label + '</a>';
    });
    html += '</nav>';

    mount.innerHTML = html;
  }

  global.initSidebar = initSidebar;

})(window);
