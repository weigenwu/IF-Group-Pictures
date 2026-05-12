const folderInput = document.getElementById("folderInput");
const uploadBtn = document.getElementById("uploadBtn");
const exportBtn = document.getElementById("exportBtn");
const statusEl = document.getElementById("status");
const summaryEl = document.getElementById("summary");
const previewEl = document.getElementById("preview");
const progressPanel = document.getElementById("progressPanel");
const phaseTextEl = document.getElementById("phaseText");
const elapsedTextEl = document.getElementById("elapsedText");
const progressBarEl = document.getElementById("progressBar");
const progressDetailEl = document.getElementById("progressDetail");
const channelPanel = document.getElementById("channelPanel");
const channelsEl = document.getElementById("channels");
const groupPanel = document.getElementById("groupPanel");
const groupLabelsEl = document.getElementById("groupLabels");
const rowsPerSlideEl = document.getElementById("rowsPerSlide");
const backgroundEl = document.getElementById("background");
const deckTitleEl = document.getElementById("deckTitle");
const panelLetterEl = document.getElementById("panelLetter");
const layoutModeEl = document.getElementById("layoutMode");
const groupCountEl = document.getElementById("groupCount");
const imagesPerGroupEl = document.getElementById("imagesPerGroup");
const showSampleNameEl = document.getElementById("showSampleName");
const groupLabelSideEl = document.getElementById("groupLabelSide");
const fitModeEl = document.getElementById("fitMode");
const exportFormatEl = document.getElementById("exportFormat");

let currentJob = null;
let selectedFiles = [];
let progressStartedAt = 0;
let uploadStartedAt = 0;
let uploadFinishedAt = 0;
let progressTimer = null;

const defaultLabels = {
  ch00: "DAPI",
  ch01: "Marker",
  ch02: "Marker 2",
  ch03: "Marker 3",
  Merged: "Merge",
};

layoutModeEl.addEventListener("change", () => {
  updateManualControls();
  refreshLayoutInputs();
});

groupCountEl.addEventListener("change", refreshLayoutInputs);
imagesPerGroupEl.addEventListener("change", refreshLayoutInputs);

folderInput.addEventListener("change", () => {
  selectedFiles = Array.from(folderInput.files || []).filter((file) =>
    /\.(tif|tiff|png|jpe?g|bmp)$/i.test(file.name)
  );
  uploadBtn.disabled = selectedFiles.length === 0;
  exportBtn.disabled = true;
  currentJob = null;
  statusEl.textContent = selectedFiles.length
    ? `已选择 ${selectedFiles.length} 张支持的图片`
    : "没有找到支持的图片";
});

uploadBtn.addEventListener("click", async () => {
  if (!selectedFiles.length) return;
  setBusy(true, "正在上传并生成预览...");
  startProgress("准备上传", "正在准备文件...");
  const formData = new FormData();
  selectedFiles.forEach((file) => {
    formData.append("files", file, file.webkitRelativePath || file.name);
  });

  try {
    const data = await uploadWithProgress(formData);
    currentJob = data;
    groupCountEl.value = String(Math.max(data.groups.length, 1));
    imagesPerGroupEl.value = String(Math.max(data.channels.length, 1));
    rowsPerSlideEl.value = String(Math.min(Math.max(data.groups.length, 1), 6));
    refreshLayoutInputs();
    exportBtn.disabled = false;
    finishProgress(data);
    statusEl.textContent = `识别到 ${data.groups.length} 组，${data.image_count} 张图`;
    summaryEl.textContent = "修改 marker 和组别名称后导出 PPTX。默认使用白底、顶部 marker、侧边组别。";
  } catch (error) {
    stopProgressTimer();
    setProgress(0, "处理失败", error.message);
    statusEl.textContent = error.message;
  } finally {
    setBusy(false);
  }
});

exportBtn.addEventListener("click", async () => {
  if (!currentJob) return;
  setBusy(true, `正在生成 ${exportFormatEl.value.toUpperCase()}...`);
  const selectedChannels = Array.from(document.querySelectorAll("[data-channel-check]"))
    .filter((input) => input.checked)
    .map((input) => input.value);
  const labels = {};
  document.querySelectorAll("[data-channel-label]").forEach((input) => {
    labels[input.dataset.channelLabel] = input.value.trim() || input.dataset.channelLabel;
  });
  const groupLabels = {};
  document.querySelectorAll("[data-group-label]").forEach((input) => {
    groupLabels[input.dataset.groupLabel] = input.value.trim() || input.dataset.groupLabel;
  });

  try {
    const response = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job_id: currentJob.job_id,
        title: deckTitleEl.value.trim(),
        panel_letter: panelLetterEl.value.trim(),
        export_format: exportFormatEl.value,
        layout_mode: layoutModeEl.value,
        group_count: Number(groupCountEl.value),
        images_per_group: Number(imagesPerGroupEl.value),
        rows_per_slide: Number(rowsPerSlideEl.value),
        background: backgroundEl.value,
        show_sample_name: showSampleNameEl.checked,
        group_label_side: groupLabelSideEl.value,
        fit_mode: fitModeEl.value,
        channel_order: selectedChannels,
        labels,
        group_labels: groupLabels,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "导出失败");
    statusEl.innerHTML = `已生成 <a href="${data.download_url}">${data.filename}</a>`;
    window.location.href = data.download_url;
  } catch (error) {
    statusEl.textContent = error.message;
  } finally {
    setBusy(false);
  }
});

function setBusy(isBusy, message) {
  uploadBtn.disabled = isBusy || selectedFiles.length === 0;
  exportBtn.disabled = isBusy || !currentJob;
  if (message) statusEl.textContent = message;
}

function uploadWithProgress(formData) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.responseType = "json";

    xhr.upload.addEventListener("loadstart", () => {
      uploadStartedAt = performance.now();
      setProgress(0, "上传中", "开始上传文件...");
    });

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total > 0) {
        const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
        setProgress(
          percent,
          "上传中",
          `${formatBytes(event.loaded)} / ${formatBytes(event.total)} (${percent}%)`
        );
      } else {
        setProgress(8, "上传中", `${formatBytes(event.loaded)} 已上传`);
      }
    });

    xhr.upload.addEventListener("load", () => {
      uploadFinishedAt = performance.now();
      setProgress(100, "服务器处理中", "上传完成，正在生成预览和分组...");
    });

    xhr.addEventListener("load", () => {
      const data = xhr.response || parseJson(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
      } else {
        reject(new Error((data && data.error) || `上传失败：HTTP ${xhr.status}`));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("网络错误，上传失败")));
    xhr.addEventListener("abort", () => reject(new Error("上传已取消")));
    xhr.send(formData);
  });
}

function startProgress(phase, detail) {
  progressPanel.hidden = false;
  progressStartedAt = performance.now();
  uploadStartedAt = 0;
  uploadFinishedAt = 0;
  setProgress(0, phase, detail);
  stopProgressTimer();
  progressTimer = window.setInterval(updateElapsedText, 200);
}

function finishProgress(data) {
  const totalSeconds = elapsedSeconds(progressStartedAt);
  const uploadSeconds = uploadFinishedAt ? ((uploadFinishedAt - uploadStartedAt) / 1000) : 0;
  const serverSeconds = Number(data.server_processing_seconds || 0);
  setProgress(
    100,
    "完成",
    `上传 ${uploadSeconds.toFixed(1)}s，服务器处理 ${serverSeconds.toFixed(1)}s，总计 ${totalSeconds.toFixed(1)}s`
  );
  stopProgressTimer();
  elapsedTextEl.textContent = `${totalSeconds.toFixed(1)}s`;
}

function setProgress(percent, phase, detail) {
  phaseTextEl.textContent = phase;
  progressBarEl.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  progressDetailEl.textContent = detail;
  updateElapsedText();
}

function updateElapsedText() {
  if (!progressStartedAt) return;
  elapsedTextEl.textContent = `${elapsedSeconds(progressStartedAt).toFixed(1)}s`;
}

function stopProgressTimer() {
  if (progressTimer) {
    window.clearInterval(progressTimer);
    progressTimer = null;
  }
}

function elapsedSeconds(startedAt) {
  return (performance.now() - startedAt) / 1000;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function parseJson(text) {
  try {
    return JSON.parse(text || "{}");
  } catch {
    return {};
  }
}

function updateManualControls() {
  const manual = layoutModeEl.value === "manual";
  document.querySelectorAll(".manual-only").forEach((node) => {
    node.hidden = !manual;
  });
}

function refreshLayoutInputs() {
  if (!currentJob) return;
  updateManualControls();
  if (layoutModeEl.value === "manual") {
    const groupCount = clampNumber(groupCountEl.value, 1, 50);
    const imagesPerGroup = clampNumber(imagesPerGroupEl.value, 1, 20);
    groupCountEl.value = String(groupCount);
    imagesPerGroupEl.value = String(imagesPerGroup);
    rowsPerSlideEl.value = String(Math.min(groupCount, 6));
    const manualChannels = Array.from({ length: imagesPerGroup }, (_, index) => ({
      key: `slot${String(index + 1).padStart(2, "0")}`,
      label: `Marker ${index + 1}`,
    }));
    const manualGroups = Array.from({ length: groupCount }, (_, index) => ({
      key: `manual_group_${String(index + 1).padStart(2, "0")}`,
      display: `Group ${index + 1}`,
    }));
    renderChannels(manualChannels);
    renderGroupLabels(manualGroups);
    renderManualPreview(currentJob.images, manualChannels, manualGroups);
  } else {
    renderChannels(currentJob.channels);
    renderGroupLabels(currentJob.groups);
    renderPreview(currentJob);
  }
}

function renderChannels(channels) {
  channelPanel.hidden = false;
  channelsEl.innerHTML = "";
  channels.forEach((channel) => {
    const row = document.createElement("label");
    row.className = "channel-row";
    row.innerHTML = `
      <input type="checkbox" data-channel-check value="${escapeHtml(channel.key)}" checked>
      <span>${escapeHtml(channel.key)}</span>
      <input type="text" data-channel-label="${escapeHtml(channel.key)}" value="${escapeHtml(defaultLabels[channel.key] || channel.label || channel.key)}">
    `;
    channelsEl.appendChild(row);
  });
}

function renderGroupLabels(groups) {
  groupPanel.hidden = false;
  groupLabelsEl.innerHTML = "";
  groups.forEach((group, index) => {
    const row = document.createElement("label");
    row.className = "group-label-row";
    row.innerHTML = `
      <span>第 ${index + 1} 组</span>
      <input type="text" data-group-label="${escapeHtml(group.key)}" value="${escapeHtml(shortGroupName(group.display))}">
    `;
    groupLabelsEl.appendChild(row);
  });
}

function renderPreview(data) {
  const channelOrder = data.channels.map((channel) => channel.key);
  previewEl.className = "preview figure-preview";
  previewEl.innerHTML = "";

  const figure = document.createElement("div");
  figure.className = "figure-grid";
  figure.style.gridTemplateColumns = `96px repeat(${channelOrder.length}, minmax(130px, 1fr))`;

  figure.appendChild(document.createElement("div"));
  channelOrder.forEach((channel) => {
    const header = document.createElement("div");
    header.className = "figure-marker";
    header.textContent = defaultLabels[channel] || channel;
    figure.appendChild(header);
  });

  data.groups.forEach((group) => {
    const label = document.createElement("div");
    label.className = "figure-group-label";
    label.textContent = shortGroupName(group.display);
    figure.appendChild(label);

    const imageMap = new Map(group.images.map((image) => [image.channel, image]));
    channelOrder.forEach((channel) => {
      const image = imageMap.get(channel);
      const cell = document.createElement("div");
      cell.className = "figure-cell";
      if (image) {
        cell.innerHTML = `<img src="${image.preview_url}" alt="${escapeHtml(image.filename)}">`;
      } else {
        cell.innerHTML = `<div class="missing">missing</div>`;
      }
      figure.appendChild(cell);
    });
  });

  previewEl.appendChild(figure);
}

function renderManualPreview(images, channels, groups) {
  previewEl.className = "preview figure-preview";
  previewEl.innerHTML = "";

  const figure = document.createElement("div");
  figure.className = "figure-grid";
  figure.style.gridTemplateColumns = `96px repeat(${channels.length}, minmax(130px, 1fr))`;

  figure.appendChild(document.createElement("div"));
  channels.forEach((channel) => {
    const header = document.createElement("div");
    header.className = "figure-marker";
    header.textContent = channel.label;
    figure.appendChild(header);
  });

  groups.forEach((group, groupIndex) => {
    const label = document.createElement("div");
    label.className = "figure-group-label";
    label.textContent = group.display;
    figure.appendChild(label);

    channels.forEach((channel, columnIndex) => {
      const image = images[groupIndex * channels.length + columnIndex];
      const cell = document.createElement("div");
      cell.className = "figure-cell";
      if (image) {
        cell.innerHTML = `<img src="${image.preview_url}" alt="${escapeHtml(image.filename)}">`;
      } else {
        cell.innerHTML = `<div class="missing">missing</div>`;
      }
      figure.appendChild(cell);
    });
  });

  previewEl.appendChild(figure);
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(Math.max(Math.round(number), min), max);
}

function shortGroupName(value) {
  const parts = String(value).split("/");
  return parts[parts.length - 1] || value;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
