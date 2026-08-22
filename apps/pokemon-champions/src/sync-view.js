// The Sync panel: set a code, see where you stand, move the code to the phone.
import { getCode, setCode, makeCode, getStatus, onStatus, syncNow } from "./sync.js";

const $ = (sel, root = document) => root.querySelector(sel);

const STATE_LABEL = {
  off: "Not syncing",
  idle: "Ready",
  syncing: "Syncing…",
  ok: "In sync",
  error: "Problem"
};

function setupLink(code) {
  const url = new URL(window.location.href);
  url.hash = "";
  url.search = `?sync=${encodeURIComponent(code)}`;
  return url.toString();
}

export function initSyncView() {
  const panel = $("#sync");
  const body = $("#sync-body");
  const pill = $("#btn-sync");
  if (!panel || !body || !pill) return;

  // initSync() already adopted a ?sync=… code (it has to, well before this runs);
  // all that is left is to get it out of the address bar.
  if (new URLSearchParams(window.location.search).get("sync")) {
    history.replaceState(null, "", window.location.pathname + window.location.hash);
  }

  const close = () => panel.classList.remove("open");

  function render() {
    const code = getCode();
    const st = getStatus();
    const link = code ? setupLink(code) : "";
    body.innerHTML = `<div class="detail-card sync-card">
      <button class="detail-close" id="sync-close" aria-label="Close">✕</button>
      <h2 class="sync-title">Sync across devices</h2>
      <p class="sync-lede">Your pins, teams, saved teams, move bans, per-Pokémon bans and
        Damage-lab presets live in this browser only. Give every device the same code and
        they share one set.</p>

      <div class="sync-status s-${st.state}">
        <span class="sync-dot"></span>
        <strong>${STATE_LABEL[st.state] || st.state}</strong>
        ${st.detail ? `<span class="sync-detail">${st.detail}</span>` : ""}
      </div>

      <label class="sync-label" for="sync-code">Sync code</label>
      <div class="sync-row">
        <input id="sync-code" class="sync-input" value="${code}" placeholder="owl-xxxx-xxxx"
               autocomplete="off" autocapitalize="off" spellcheck="false">
        <button class="btn" id="sync-save">Use this code</button>
        <button class="btn" id="sync-new">New code</button>
      </div>

      ${code ? `
        <div class="sync-share">
          <div>
            <p class="sync-label">Get this onto your other devices</p>
            <p class="sync-hint">Send yourself this link — opening it sets the same sync code
              automatically. Or just type the code in by hand; it is short on purpose.</p>
            <div class="sync-row">
              <input class="sync-input" id="sync-link" value="${link}" readonly>
              <button class="btn" id="sync-copy">Copy</button>
            </div>
          </div>
          <div class="sync-code-big">${code}</div>
        </div>
        <div class="sync-actions">
          <button class="btn primary" id="sync-now">Sync now</button>
          <button class="btn danger" id="sync-off">Stop syncing</button>
        </div>
      ` : `<p class="sync-hint">Press <strong>New code</strong> to start, then use the same code
             on your phone and on the other site.</p>`}

      <p class="sync-foot">Anyone with the code can read and change this data, so treat it like
        a password. Nothing else is stored — no account, no email.</p>
    </div>`;

    $("#sync-close", body).addEventListener("click", close);
    $("#sync-new", body).addEventListener("click", () => { $("#sync-code", body).value = makeCode(); });
    $("#sync-save", body).addEventListener("click", async () => {
      setCode($("#sync-code", body).value);
      render();
      if (getCode()) { await syncNow(); render(); }
    });
    $("#sync-copy", body)?.addEventListener("click", async () => {
      const btn = $("#sync-copy", body);
      try {
        await navigator.clipboard.writeText(link);
        btn.textContent = "Copied";
      } catch {
        $("#sync-link", body).select();
        btn.textContent = "Select + copy";
      }
      setTimeout(() => { btn.textContent = "Copy"; }, 1600);
    });
    $("#sync-now", body)?.addEventListener("click", async () => { await syncNow(); render(); });
    $("#sync-off", body)?.addEventListener("click", () => { setCode(""); render(); });
  }

  pill.addEventListener("click", () => { render(); panel.classList.add("open"); });
  panel.addEventListener("click", (e) => { if (e.target === panel) close(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel.classList.contains("open")) close();
  });

  onStatus((st) => {
    pill.dataset.state = st.state;
    pill.title = st.detail ? `Sync — ${st.detail}` : "Sync across devices";
    if (panel.classList.contains("open")) render();
  });
  pill.dataset.state = getStatus().state;
}
