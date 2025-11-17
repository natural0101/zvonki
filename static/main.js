// SpeechMP3 UI logic

const textarea = document.getElementById("urls-input");
const limitInput = document.getElementById("limit-input");
const btnSubmit = document.getElementById("btn-submit");
const btnClear = document.getElementById("btn-clear");
const btnClearLog = document.getElementById("btn-clear-log");
const btnCopyTsv = document.getElementById("btn-copy-tsv");
const btnCopyUrls = document.getElementById("btn-copy-urls");

const alertBar = document.getElementById("alert-bar");
const logPanel = document.getElementById("log-panel");

const progressLabel = document.getElementById("progress-label");
const progressBar = document.getElementById("progress-bar");
const statSuccess = document.getElementById("stat-success");
const statPending = document.getElementById("stat-pending");
const statError = document.getElementById("stat-error");

const resultsBody = document.getElementById("results-body");

let currentResults = [];

// --- helpers ---

function showAlert(message, type = "info") {
  if (!message) {
    alertBar.classList.add("hidden");
    alertBar.textContent = "";
    return;
  }
  alertBar.classList.remove("hidden");
  alertBar.textContent = message;

  if (type === "error") {
    alertBar.style.backgroundColor = "rgba(248,113,113,0.12)";
    alertBar.style.borderColor = "rgba(248,113,113,0.7)";
    alertBar.style.color = "#7f1d1d";
  } else {
    alertBar.style.backgroundColor = "rgba(255,255,255,0.9)";
    alertBar.style.borderColor = "rgba(210,182,255,0.9)";
    alertBar.style.color = "#3a2a4f";
  }
}

function appendLog(line) {
  const time = new Date().toLocaleTimeString("ru-RU", { hour12: false });
  const msg = `[${time}] ${line}`;

  if (logPanel.textContent.trim() === "Ждём первую загрузку…") {
    logPanel.textContent = msg;
  } else {
    logPanel.textContent += "\n" + msg;
  }
  logPanel.scrollTop = logPanel.scrollHeight;
}

function setLoading(isLoading) {
  if (isLoading) {
    btnSubmit.disabled = true;
    btnSubmit.classList.add("opacity-60", "cursor-not-allowed");
    btnSubmit.textContent = "Обработка…";
  } else {
    btnSubmit.disabled = false;
    btnSubmit.classList.remove("opacity-60", "cursor-not-allowed");
    btnSubmit.textContent = "Запустить обработку";
  }
}

function resetStats(total) {
  progressLabel.textContent = `0 / ${total}`;
  progressBar.style.width = total > 0 ? "1%" : "0";
  statSuccess.textContent = "0";
  statPending.textContent = String(total);
  statError.textContent = "0";
}

function updateStatsOnSuccess(count) {
  statSuccess.textContent = String(count);
  statPending.textContent = "0";
  progressLabel.textContent = `${count} / ${count}`;
  progressBar.style.width = "100%";
}

function renderResults(data) {
  currentResults = data || [];

  if (!currentResults.length) {
    resultsBody.innerHTML = `
      <tr>
        <td colspan="4" class="px-3 py-4 text-center text-[rgba(233,223,255,0.7)]">
          Пока нет данных. Запусти обработку, чтобы увидеть таблицу.
        </td>
      </tr>
    `;
    return;
  }

  resultsBody.innerHTML = "";

  currentResults.forEach((item, index) => {
    const tr = document.createElement("tr");

    const tdIndex = document.createElement("td");
    tdIndex.className = "px-3 py-2.5 align-top";
    tdIndex.textContent = String(index + 1);

    const tdTalk = document.createElement("td");
    tdTalk.className = "px-3 py-2.5 align-top break-all";
    tdTalk.innerHTML = `<div class="font-medium">${item.talkId}</div>`;

    const tdUrl = document.createElement("td");
    tdUrl.className = "px-3 py-2.5 align-top break-all";
    tdUrl.textContent = item.publicUrl;

    const tdActions = document.createElement("td");
    tdActions.className = "px-3 py-2.5 align-top text-right";

    const btnCopy = document.createElement("button");
    btnCopy.className =
      "text-[10px] px-2.5 py-1.5 rounded-full border border-[rgba(210,182,255,0.9)] bg-[rgba(255,255,255,0.9)] text-[var(--ink)] hover:bg-[rgba(248,236,255,0.98)]";
    btnCopy.textContent = "Копировать";
    btnCopy.addEventListener("click", () => {
      navigator.clipboard.writeText(item.publicUrl).then(
        () => showAlert("Ссылка скопирована в буфер обмена", "info"),
        () => showAlert("Не удалось скопировать ссылку", "error")
      );
    });

    tdActions.appendChild(btnCopy);

    tr.appendChild(tdIndex);
    tr.appendChild(tdTalk);
    tr.appendChild(tdUrl);
    tr.appendChild(tdActions);

    resultsBody.appendChild(tr);
  });
}

// --- main actions ---

async function handleSubmit() {
  showAlert("");
  const raw = (textarea.value || "").trim();

  if (!raw) {
    showAlert("Вставь хотя бы одну presigned-ссылку.", "error");
    return;
  }

  // разбираем по строкам, режем по лимиту
  let lines = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

  let limit = parseInt((limitInput.value || "").trim(), 10);
  if (!Number.isNaN(limit) && limit > 0 && limit < lines.length) {
    lines = lines.slice(0, limit);
  }

  if (!lines.length) {
    showAlert("После фильтрации строк не осталось. Проверь ввод.", "error");
    return;
  }

  const body = lines.join("\n");
  resetStats(lines.length);
  appendLog(`Отправлено ${lines.length} ссылок на обработку.`);
  setLoading(true);

  try {
    const resp = await fetch("/upload_urls", {
      method: "POST",
      headers: {
        "Content-Type": "text/plain"
      },
      body
    });

    if (!resp.ok) {
      const text = await resp.text();
      appendLog(`Ошибка ответа сервера: ${resp.status} ${resp.statusText}`);
      showAlert(
        `Ошибка сервера (${resp.status}). Детали: ${text || "нет данных"}`,
        "error"
      );
      statError.textContent = String(lines.length);
      statPending.textContent = "0";
      progressLabel.textContent = `0 / ${lines.length}`;
      progressBar.style.width = "0";
      return;
    }

    const data = await resp.json();
    appendLog(`Успешно получен ответ, файлов: ${data.length}.`);

    updateStatsOnSuccess(data.length);
    renderResults(data);
    showAlert(`Готово. Обработано файлов: ${data.length}.`, "info");
  } catch (err) {
    console.error(err);
    appendLog("Сетевая ошибка при вызове /upload_urls.");
    showAlert("Сетевая ошибка. Проверь соединение или сервер.", "error");
    statError.textContent = String(lines.length);
    statPending.textContent = "0";
    progressLabel.textContent = `0 / ${lines.length}`;
    progressBar.style.width = "0";
  } finally {
    setLoading(false);
  }
}

function handleClear() {
  textarea.value = "";
  showAlert("");
}

function handleClearLog() {
  logPanel.textContent = "Ждём первую загрузку…";
}

async function handleCopyUrls(onlyUrls) {
  if (!currentResults.length) {
    showAlert("Нет данных для копирования. Сначала запусти обработку.", "error");
    return;
  }

  let text;
  if (onlyUrls) {
    text = currentResults.map((r) => r.publicUrl).join("\n");
  } else {
    // TSV: talkId \t publicUrl
    text = currentResults.map((r) => `${r.talkId}\t${r.publicUrl}`).join("\n");
  }

  try {
    await navigator.clipboard.writeText(text);
    showAlert("Данные скопированы в буфер обмена.", "info");
  } catch (e) {
    showAlert("Не удалось скопировать в буфер обмена.", "error");
  }
}

// --- event bindings ---

if (btnSubmit) btnSubmit.addEventListener("click", handleSubmit);
if (btnClear) btnClear.addEventListener("click", handleClear);
if (btnClearLog) btnClearLog.addEventListener("click", handleClearLog);
if (btnCopyUrls) btnCopyUrls.addEventListener("click", () => handleCopyUrls(true));
if (btnCopyTsv) btnCopyTsv.addEventListener("click", () => handleCopyUrls(false));

console.log("SpeechMP3 UI logic initialized");
