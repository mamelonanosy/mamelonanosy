/*
 * Shared post-export actions for every PDF produced by the web app.
 *
 * The existing export functions all finish through downloadBlob().  Replacing
 * that final hand-off keeps labels, bons d'enlevement, and daily reports
 * consistent in both the public site and the desktop-served web interface.
 */
(function () {
  'use strict';

  var previousDownloadBlob = window.downloadBlob;
  var pendingPreviewWindows = [];
  var PDF_URL_LIFETIME_MS = 30 * 60 * 1000;

  function isEnglish() {
    return Boolean(window.state && window.state.lang === 'en');
  }

  function label(french, english) {
    return isEnglish() ? english : french;
  }

  function isPdf(blob, filename) {
    var type = String((blob && blob.type) || '').toLowerCase();
    return type.indexOf('application/pdf') !== -1 || /\.pdf(?:$|[?#])/i.test(String(filename || ''));
  }

  function addStyles() {
    if (document.getElementById('pdf-export-actions-style')) return;

    var style = document.createElement('style');
    style.id = 'pdf-export-actions-style';
    style.textContent =
      '.pdf-export-toast{max-width:390px;padding:14px 15px}' +
      '.pdf-export-toast__title{font-weight:800;margin-bottom:3px}' +
      '.pdf-export-toast__filename{font-size:.76rem;opacity:.88;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.pdf-export-toast__actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:11px}' +
      '.pdf-export-toast__button{border:1px solid rgba(255,255,255,.8);border-radius:7px;background:rgba(255,255,255,.12);color:#fff;cursor:pointer;font:inherit;font-size:.78rem;font-weight:700;padding:6px 9px}' +
      '.pdf-export-toast__button:hover,.pdf-export-toast__button:focus{background:#fff;color:#216e2b;outline:none}' +
      '.pdf-export-toast__button--primary{background:#fff;color:#216e2b}';
    document.head.appendChild(style);
  }

  function getToastContainer() {
    var container = document.getElementById('toastContainer');
    if (container) return container;

    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
    return container;
  }

  function removeToast(toast) {
    if (!toast || !toast.parentNode) return;
    toast.classList.add('removing');
    window.setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }

  function notifyPopupBlocked() {
    if (typeof window.showToast === 'function') {
      window.showToast(
        label('Le navigateur a bloqué l’ouverture automatique. Utilisez le bouton Ouvrir.', 'The browser blocked automatic opening. Use the Open button.'),
        'warning'
      );
    }
  }

  function writePreparingPage(previewWindow) {
    if (!previewWindow) return;
    try {
      previewWindow.document.title = label('Préparation du PDF…', 'Preparing PDF…');
      previewWindow.document.body.innerHTML =
        '<div style="font-family:system-ui,sans-serif;padding:32px;color:#2e7d32;font-weight:700">' +
        label('Préparation du PDF…', 'Preparing PDF…') +
        '</div>';
    } catch (error) {
      // The export itself still works if a browser denies access to the blank tab.
    }
  }

  function reservePreviewWindow() {
    var previewWindow = null;
    try {
      previewWindow = window.open('', '_blank');
      if (previewWindow) {
        try { previewWindow.opener = null; } catch (error) { /* browser-managed */ }
        writePreparingPage(previewWindow);
        pendingPreviewWindows.push(previewWindow);
        window.setTimeout(function () {
          var index = pendingPreviewWindows.indexOf(previewWindow);
          if (index !== -1) pendingPreviewWindows.splice(index, 1);
          try {
            if (!previewWindow.closed) previewWindow.close();
          } catch (error) {
            // Closing an already navigated browser tab is intentionally best-effort.
          }
        }, 90 * 1000);
      }
    } catch (error) {
      // A later explicit Open button remains available.
    }
    return previewWindow;
  }

  function takeReservedPreviewWindow() {
    while (pendingPreviewWindows.length) {
      var previewWindow = pendingPreviewWindows.shift();
      try {
        if (previewWindow && !previewWindow.closed) return previewWindow;
      } catch (error) {
        // Continue to the next available reserved window.
      }
    }
    return null;
  }

  function openPdfUrl(url, preferredWindow) {
    var previewWindow = preferredWindow;
    try {
      if (previewWindow && !previewWindow.closed) {
        previewWindow.location.replace(url);
        return previewWindow;
      }
    } catch (error) {
      previewWindow = null;
    }

    try {
      previewWindow = window.open(url, '_blank');
      if (previewWindow) {
        try { previewWindow.opener = null; } catch (error) { /* browser-managed */ }
      }
    } catch (error) {
      previewWindow = null;
    }
    return previewWindow;
  }

  function downloadPdf(session) {
    var anchor = document.createElement('a');
    anchor.href = session.url;
    anchor.download = session.filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }

  function printPdf(session) {
    var previewWindow = session.previewWindow;
    try {
      if (!previewWindow || previewWindow.closed) {
        previewWindow = openPdfUrl(session.url);
        session.previewWindow = previewWindow;
      }
    } catch (error) {
      previewWindow = null;
    }

    if (!previewWindow) {
      notifyPopupBlocked();
      return;
    }

    window.setTimeout(function () {
      try {
        previewWindow.focus();
        previewWindow.print();
      } catch (error) {
        // Browser PDF viewers that own printing still show their own print button.
        if (typeof window.showToast === 'function') {
          window.showToast(
            label('Le PDF est ouvert : utilisez Imprimer dans son lecteur.', 'The PDF is open: use Print in its viewer.'),
            'warning'
          );
        }
      }
    }, 700);
  }

  function showPdfActions(session) {
    addStyles();
    var toast = document.createElement('div');
    toast.className = 'toast success pdf-export-toast';

    var title = document.createElement('div');
    title.className = 'pdf-export-toast__title';
    title.textContent = label('PDF prêt — ouverture automatique', 'PDF ready — opening automatically');
    toast.appendChild(title);

    var filename = document.createElement('div');
    filename.className = 'pdf-export-toast__filename';
    filename.textContent = session.filename;
    toast.appendChild(filename);

    var actions = document.createElement('div');
    actions.className = 'pdf-export-toast__actions';

    function actionButton(text, handler, primary) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'pdf-export-toast__button' + (primary ? ' pdf-export-toast__button--primary' : '');
      button.textContent = text;
      button.addEventListener('click', handler);
      actions.appendChild(button);
    }

    actionButton(label('Ouvrir', 'Open'), function () {
      session.previewWindow = openPdfUrl(session.url, session.previewWindow);
      if (!session.previewWindow) notifyPopupBlocked();
    }, true);
    actionButton(label('Imprimer', 'Print'), function () { printPdf(session); });
    actionButton(label('Télécharger', 'Download'), function () { downloadPdf(session); });
    toast.appendChild(actions);

    getToastContainer().appendChild(toast);
    window.setTimeout(function () { removeToast(toast); }, 20 * 1000);
  }

  function presentPdf(blob, filename) {
    var url = URL.createObjectURL(blob);
    var session = {
      url: url,
      filename: String(filename || 'export.pdf'),
      previewWindow: takeReservedPreviewWindow()
    };

    // Opening is the default.  If a browser blocks an asynchronous popup, the
    // visible Open button below is a direct, user-initiated fallback.
    session.previewWindow = openPdfUrl(url, session.previewWindow);
    showPdfActions(session);
    if (!session.previewWindow) notifyPopupBlocked();

    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, PDF_URL_LIFETIME_MS);
    return session;
  }

  function isExportButton(target) {
    if (!target || !target.closest) return false;
    var button = target.closest('button, a, [role="button"]');
    if (!button) return false;
    var handler = String(button.getAttribute('onclick') || '');
    var id = String(button.id || '');
    return /\bexport(?:All|Selected)(?:Labels|Bon|Report)\s*\(/.test(handler) ||
      /^(btnExpSelLabels|btnExpSelBon)$/.test(id);
  }

  // Reserve a tab during the original click gesture.  This makes the normal
  // automatic opening reliable even after the asynchronous PDF generation.
  document.addEventListener('click', function (event) {
    if (isExportButton(event.target)) reservePreviewWindow();
  }, true);

  // If the Bon agent chooser is cancelled, remove its unused preparation tab.
  if (typeof window.choosePdfAgent === 'function') {
    var originalChoosePdfAgent = window.choosePdfAgent;
    window.choosePdfAgent = function (groups) {
      return originalChoosePdfAgent(groups).then(function (agent) {
        if (!agent) {
          var previewWindow = takeReservedPreviewWindow();
          try {
            if (previewWindow && !previewWindow.closed) previewWindow.close();
          } catch (error) {
            // Best-effort cleanup only.
          }
        }
        return agent;
      });
    };
  }

  window.openExportedPdf = function (url) { return openPdfUrl(url); };
  window.printExportedPdf = function (url) {
    return printPdf({ url: url, filename: 'export.pdf', previewWindow: null });
  };

  window.downloadBlob = function (blob, filename) {
    if (isPdf(blob, filename)) return presentPdf(blob, filename);
    if (typeof previousDownloadBlob === 'function') return previousDownloadBlob(blob, filename);
    return undefined;
  };
}());
