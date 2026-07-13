const folderInput = document.getElementById("folderInput");
const fileInput = document.getElementById("fileInput");
const fileSummaryEl = document.getElementById("fileSummary");
const uploadBtn = document.getElementById("uploadBtn");
const exportBtn = document.getElementById("exportBtn");
const cancelUploadBtn = document.getElementById("cancelUpload");
const statusEl = document.getElementById("status");
const summaryEl = document.getElementById("summary");
const previewEl = document.getElementById("preview");
const progressPanel = document.getElementById("progressPanel");
const phaseTextEl = document.getElementById("phaseText");
const elapsedTextEl = document.getElementById("elapsedText");
const progressBarEl = document.getElementById("progressBar");
const progressTrackEl = document.getElementById("progressTrack");
const progressDetailEl = document.getElementById("progressDetail");
const channelPanel = document.getElementById("channelPanel");
const channelsEl = document.getElementById("channels");
const groupPanel = document.getElementById("groupPanel");
const groupLabelsEl = document.getElementById("groupLabels");
const rowsPerSlideEl = document.getElementById("rowsPerSlide");
const backgroundEl = document.getElementById("background");
const deckTitleEl = document.getElementById("deckTitle");
const panelLetterEl = document.getElementById("panelLetter");
const figureTypeEl = document.getElementById("figureType");
const layoutModeEl = document.getElementById("layoutMode");
const groupCountEl = document.getElementById("groupCount");
const imagesPerGroupEl = document.getElementById("imagesPerGroup");
const showSampleNameEl = document.getElementById("showSampleName");
const groupLabelSideEl = document.getElementById("groupLabelSide");
const fitModeEl = document.getElementById("fitMode");
const exportFormatEl = document.getElementById("exportFormat");
const ihcSettingsEl = document.getElementById("ihcSettings");
const ihcLowLabelEl = document.getElementById("ihcLowLabel");
const ihcHighLabelEl = document.getElementById("ihcHighLabel");
const ihcRoiXEl = document.getElementById("ihcRoiX");
const ihcRoiYEl = document.getElementById("ihcRoiY");
const ihcRoiWEl = document.getElementById("ihcRoiW");
const ihcRoiHEl = document.getElementById("ihcRoiH");
const ihcDrawConnectorsEl = document.getElementById("ihcDrawConnectors");

let currentJob = null;
let selectedFiles = [];
let progressStartedAt = 0;
let uploadStartedAt = 0;
let uploadFinishedAt = 0;
let progressTimer = null;
let activeUpload = null;
let operationBusy = false;
let ifLayoutMode = layoutModeEl.value;
let ifGroupCount = groupCountEl.value;
let ifImagesPerGroup = imagesPerGroupEl.value;
let ifRowsPerSlide = rowsPerSlideEl.value;

const SESSION_JOB_KEY = "figurelab-fluorescence-job-v1";
const supportedImagePattern = /\.(tif|tiff|png|jpe?g|bmp)$/i;
const channelMemory = new Map();
const groupMemory = new Map();

const defaultLabels = {
  ch00: "DAPI",
  ch01: "Marker",
  ch02: "Marker 2",
  ch03: "Marker 3",
  Merged: "Merge",
};

figureTypeEl.addEventListener("change", () => {
  if (figureTypeEl.value === "ihc") {
    rememberIfLayoutState();
    if (currentJob) {
      const groupCount = Math.max(1, Math.ceil(currentJob.images.length / 2));
      groupCountEl.value = String(groupCount);
      imagesPerGroupEl.value = "2";
      rowsPerSlideEl.value = String(Math.min(groupCount, 4));
    }
  } else {
    layoutModeEl.value = ifLayoutMode;
    if (ifLayoutMode === "manual") {
      groupCountEl.value = ifGroupCount;
      imagesPerGroupEl.value = ifImagesPerGroup;
    } else if (currentJob) {
      groupCountEl.value = String(Math.max(currentJob.groups.length, 1));
      imagesPerGroupEl.value = String(Math.max(currentJob.channels.length, 1));
    }
    rowsPerSlideEl.value = ifRowsPerSlide;
  }
  updateFigureTypeControls();
  updateManualControls();
  refreshLayoutInputs();
});

layoutModeEl.addEventListener("change", () => {
  if (figureTypeEl.value === "if") rememberIfLayoutState();
  updateManualControls();
  refreshLayoutInputs();
});

groupCountEl.addEventListener("change", () => {
  const limit = figureTypeEl.value === "ihc" ? 4 : 6;
  rowsPerSlideEl.value = String(Math.min(clampNumber(groupCountEl.value, 1, 50), limit));
  if (figureTypeEl.value === "if") rememberIfLayoutState();
  refreshLayoutInputs();
});
imagesPerGroupEl.addEventListener("change", () => {
  if (figureTypeEl.value === "if") rememberIfLayoutState();
  refreshLayoutInputs();
});
rowsPerSlideEl.addEventListener("change", () => {
  if (figureTypeEl.value === "if") rememberIfLayoutState();
});
[showSampleNameEl, groupLabelSideEl, fitModeEl, backgroundEl].forEach((input) => {
  input.addEventListener("change", refreshLayoutInputs);
});
[ihcLowLabelEl, ihcHighLabelEl, ihcRoiXEl, ihcRoiYEl, ihcRoiWEl, ihcRoiHEl, ihcDrawConnectorsEl].forEach((input) => {
  input.addEventListener("input", refreshLayoutInputs);
  input.addEventListener("change", refreshLayoutInputs);
});

[folderInput, fileInput].forEach((input) => {
  input.addEventListener("change", () => {
    setSelectedFiles(input.files || []);
    input.value = "";
  });
});

cancelUploadBtn.addEventListener("click", () => activeUpload?.abort());
exportFormatEl.addEventListener("change", syncExportButton);

uploadBtn.addEventListener("click", async () => {
  if (!selectedFiles.length) return;
  setBusy(true, "正在上传并生成预览...");
  cancelUploadBtn.hidden = false;
  startProgress("准备上传", "正在准备文件...");
  const formData = new FormData();
  selectedFiles.forEach((file) => {
    formData.append("files", file, file.webkitRelativePath || file.name);
  });

  try {
    const data = await uploadWithProgress(formData);
    currentJob = data;
    persistCurrentJob();
    if (figureTypeEl.value === "ihc") {
      const groupCount = Math.max(1, Math.ceil(data.images.length / 2));
      groupCountEl.value = String(groupCount);
      imagesPerGroupEl.value = "2";
      rowsPerSlideEl.value = String(Math.min(groupCount, 4));
    } else if (layoutModeEl.value === "manual") {
      groupCountEl.value = ifGroupCount;
      imagesPerGroupEl.value = ifImagesPerGroup;
      rowsPerSlideEl.value = ifRowsPerSlide;
      rememberIfLayoutState();
    } else {
      groupCountEl.value = String(Math.max(data.groups.length, 1));
      imagesPerGroupEl.value = String(Math.max(data.channels.length, 1));
      rowsPerSlideEl.value = String(Math.min(Math.max(data.groups.length, 1), 6));
      rememberIfLayoutState();
    }
    refreshLayoutInputs();
    exportBtn.disabled = false;
    finishProgress(data);
    statusEl.textContent = `识别到 ${groupCountEl.value} 组，${data.image_count} 张图`;
    summaryEl.textContent = figureTypeEl.value === "ihc"
      ? "修改低倍/高倍列名、ROI 和组别名称后导出。"
      : "修改 marker 和组别名称后导出。默认使用白底、顶部 marker、侧边组别。";
  } catch (error) {
    stopProgressTimer();
    const cancelled = error.name === "AbortError";
    setProgress(0, cancelled ? "已取消" : "处理失败", cancelled ? "可重新选择图片后再次上传。" : error.message);
    statusEl.textContent = error.message;
  } finally {
    activeUpload = null;
    cancelUploadBtn.hidden = true;
    setBusy(false);
  }
});

exportBtn.addEventListener("click", async () => {
  if (!currentJob) return;
  const format = exportFormatEl.value.toUpperCase();
  setBusy(true, `正在生成 ${format}...`);
  startProgress("正在导出", `正在生成 ${format} 文件...`);
  const selectedChannels = Array.from(document.querySelectorAll("[data-channel-check]"))
    .filter((input) => input.checked)
    .map((input) => input.value);
  const labels = {};
  document.querySelectorAll("[data-channel-label]").forEach((input) => {
    labels[input.dataset.channelLabel] = input.value.trim() || input.dataset.defaultLabel || input.dataset.channelLabel;
  });
  const groupLabels = {};
  document.querySelectorAll("[data-group-label]").forEach((input) => {
    groupLabels[input.dataset.groupLabel] = input.value.trim() || input.dataset.defaultLabel || "Group";
  });

  try {
    const response = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job_id: currentJob.job_id,
        title: deckTitleEl.value.trim(),
        panel_letter: panelLetterEl.value.trim(),
        figure_type: figureTypeEl.value,
        export_format: exportFormatEl.value,
        layout_mode: layoutModeEl.value,
        group_count: Number(groupCountEl.value),
        images_per_group: Number(imagesPerGroupEl.value),
        ihc_low_label: ihcLowLabelEl.value.trim(),
        ihc_high_label: ihcHighLabelEl.value.trim(),
        ihc_roi_x: Number(ihcRoiXEl.value),
        ihc_roi_y: Number(ihcRoiYEl.value),
        ihc_roi_w: Number(ihcRoiWEl.value),
        ihc_roi_h: Number(ihcRoiHEl.value),
        ihc_draw_connectors: ihcDrawConnectorsEl.checked,
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
    const data = parseJson(await response.text());
    if (!response.ok) throw new Error(data.error || `导出失败：HTTP ${response.status}`);
    const seconds = elapsedSeconds(progressStartedAt);
    setProgress(100, "导出完成", `${format} 已生成，用时 ${seconds.toFixed(1)}s`);
    stopProgressTimer();
    statusEl.textContent = "已生成 ";
    const downloadLink = document.createElement("a");
    downloadLink.href = data.download_url;
    downloadLink.textContent = data.filename;
    statusEl.appendChild(downloadLink);
    window.location.href = data.download_url;
  } catch (error) {
    stopProgressTimer();
    setProgress(0, "导出失败", error.message);
    statusEl.textContent = error.message;
  } finally {
    setBusy(false);
  }
});

function setBusy(isBusy, message) {
  operationBusy = isBusy;
  uploadBtn.disabled = isBusy || selectedFiles.length === 0;
  exportBtn.disabled = isBusy || !currentJob;
  folderInput.disabled = isBusy;
  fileInput.disabled = isBusy;
  folderInput.parentElement.setAttribute("aria-disabled", String(isBusy));
  fileInput.parentElement.setAttribute("aria-disabled", String(isBusy));
  uploadBtn.setAttribute("aria-busy", String(isBusy));
  exportBtn.setAttribute("aria-busy", String(isBusy));
  if (message) statusEl.textContent = message;
}

function rememberIfLayoutState() {
  ifLayoutMode = layoutModeEl.value;
  ifGroupCount = groupCountEl.value;
  ifImagesPerGroup = imagesPerGroupEl.value;
  ifRowsPerSlide = rowsPerSlideEl.value;
}

function setSelectedFiles(files) {
  if (operationBusy) {
    statusEl.textContent = "当前操作完成后再选择新图片";
    return;
  }
  const candidates = Array.from(files);
  selectedFiles = candidates
    .filter((file) => supportedImagePattern.test(file.name))
    .sort((left, right) => fileDisplayName(left).localeCompare(fileDisplayName(right), "zh-CN", { numeric: true }));
  const skipped = candidates.length - selectedFiles.length;
  const totalBytes = selectedFiles.reduce((sum, file) => sum + file.size, 0);
  const names = selectedFiles.slice(0, 3).map((file) => file.name).join("、");
  const more = selectedFiles.length > 3 ? ` 等 ${selectedFiles.length} 张` : "";
  fileSummaryEl.textContent = selectedFiles.length
    ? `${selectedFiles.length} 张 · ${formatBytes(totalBytes)}${skipped ? ` · 已忽略 ${skipped} 个不支持的文件` : ""} · ${names}${more}`
    : candidates.length ? "所选内容中没有支持的 TIFF、PNG、JPG 或 BMP 图片。" : "可选择整个文件夹，或一次多选图片。";
  uploadBtn.disabled = selectedFiles.length === 0;
  currentJob = null;
  exportBtn.disabled = true;
  sessionStorage.removeItem(SESSION_JOB_KEY);
  channelPanel.hidden = true;
  groupPanel.hidden = true;
  progressPanel.hidden = true;
  previewEl.className = "preview empty";
  previewEl.innerHTML = '<div class="empty-text">上传后会在这里显示内容预览。</div>';
  statusEl.textContent = selectedFiles.length ? `已选择 ${selectedFiles.length} 张图片，等待上传` : "尚未选择图片";
}

function fileDisplayName(file) {
  return file.webkitRelativePath || file.name;
}

function syncExportButton() {
  exportBtn.textContent = `导出 ${exportFormatEl.value.toUpperCase()}`;
}

function persistCurrentJob() {
  try {
    sessionStorage.setItem(SESSION_JOB_KEY, JSON.stringify(currentJob));
  } catch {
    // Session recovery is a convenience; upload/export still work without it.
  }
}

function restoreSessionJob() {
  try {
    const data = JSON.parse(sessionStorage.getItem(SESSION_JOB_KEY) || "null");
    if (!data || typeof data.job_id !== "string" || !Array.isArray(data.images) || !Array.isArray(data.groups) || !Array.isArray(data.channels)) return;
    currentJob = data;
    if (figureTypeEl.value === "ihc") {
      const groupCount = Math.max(1, Math.ceil(data.images.length / 2));
      groupCountEl.value = String(groupCount);
      imagesPerGroupEl.value = "2";
      rowsPerSlideEl.value = String(Math.min(groupCount, 4));
    } else {
      groupCountEl.value = String(Math.max(data.groups.length, 1));
      imagesPerGroupEl.value = String(Math.max(data.channels.length, 1));
      rowsPerSlideEl.value = String(Math.min(Math.max(data.groups.length, 1), 6));
      rememberIfLayoutState();
    }
    exportBtn.disabled = false;
    refreshLayoutInputs();
    statusEl.textContent = `已恢复本标签页的上次任务：${data.image_count || data.images.length} 张图`;
    summaryEl.textContent = "已恢复上次预览；若服务器重启后图片失效，请重新上传。";
  } catch {
    sessionStorage.removeItem(SESSION_JOB_KEY);
  }
}

function uploadWithProgress(formData) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    activeUpload = xhr;
    xhr.open("POST", "/api/upload");
    xhr.responseType = "json";
    xhr.timeout = 5 * 60 * 1000;

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
      cancelUploadBtn.hidden = true;
      setProgress(100, "服务器处理中", "上传完成，正在生成预览和分组；此阶段无法取消...");
    });

    xhr.addEventListener("load", () => {
      const data = xhr.response && typeof xhr.response === "object" ? xhr.response : {};
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
      } else {
        reject(new Error((data && data.error) || `上传失败：HTTP ${xhr.status}`));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("网络错误，上传失败")));
    xhr.addEventListener("timeout", () => reject(new Error("上传或服务器处理超时，请减少图片数量后重试")));
    xhr.addEventListener("abort", () => {
      const error = new Error("上传已取消");
      error.name = "AbortError";
      reject(error);
    });
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
  const value = Math.max(0, Math.min(100, percent));
  phaseTextEl.textContent = phase;
  progressBarEl.style.width = `${value}%`;
  progressTrackEl.setAttribute("aria-valuenow", String(Math.round(value)));
  progressTrackEl.setAttribute("aria-valuetext", `${phase}：${detail}`);
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
  const manual = layoutModeEl.value === "manual" || figureTypeEl.value === "ihc";
  document.querySelectorAll(".manual-only").forEach((node) => {
    node.hidden = !manual;
  });
}

function updateFigureTypeControls() {
  const ihc = figureTypeEl.value === "ihc";
  ihcSettingsEl.hidden = !ihc;
  channelPanel.hidden = ihc || channelPanel.hidden;
  rowsPerSlideEl.querySelectorAll("option").forEach((option) => {
    option.disabled = ihc && Number(option.value) > 4;
  });
  if (ihc) {
    if (Number(rowsPerSlideEl.value) > 4) rowsPerSlideEl.value = "4";
    layoutModeEl.value = "manual";
    layoutModeEl.disabled = true;
    imagesPerGroupEl.value = "2";
    imagesPerGroupEl.disabled = true;
  } else {
    layoutModeEl.disabled = false;
    imagesPerGroupEl.disabled = false;
  }
}

function refreshLayoutInputs() {
  if (!currentJob) return;
  updateFigureTypeControls();
  updateManualControls();
  if (figureTypeEl.value === "ihc") {
    const groupCount = clampNumber(groupCountEl.value, 1, 50);
    groupCountEl.value = String(groupCount);
    imagesPerGroupEl.value = "2";
    const ihcGroups = Array.from({ length: groupCount }, (_, index) => ({
      key: `ihc_group_${String(index + 1).padStart(2, "0")}`,
      display: `Group ${index + 1}`,
    }));
    renderGroupLabels(ihcGroups);
    channelPanel.hidden = true;
    renderIhcPreview(currentJob.images, ihcGroups);
    return;
  }
  if (layoutModeEl.value === "manual") {
    const groupCount = clampNumber(groupCountEl.value, 1, 50);
    const imagesPerGroup = clampNumber(imagesPerGroupEl.value, 1, 20);
    groupCountEl.value = String(groupCount);
    imagesPerGroupEl.value = String(imagesPerGroup);
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
  const previous = channelFormState();
  previous.forEach((value, key) => channelMemory.set(key, value));
  channelPanel.hidden = false;
  channelsEl.innerHTML = "";
  channels.forEach((channel) => {
    const saved = previous.get(channel.key) || channelMemory.get(channel.key);
    const defaultLabel = defaultLabels[channel.key] ?? channel.label ?? channel.key;
    const label = saved?.label ?? defaultLabel;
    const row = document.createElement("label");
    row.className = "channel-row";
    row.innerHTML = `
      <input type="checkbox" data-channel-check value="${escapeHtml(channel.key)}" ${saved?.checked === false ? "" : "checked"} aria-label="显示 ${escapeHtml(channel.key)} 通道">
      <span>${escapeHtml(channel.key)}</span>
      <input type="text" data-channel-label="${escapeHtml(channel.key)}" data-default-label="${escapeHtml(defaultLabel)}" value="${escapeHtml(label)}" aria-label="${escapeHtml(channel.key)} 的 marker 名称">
    `;
    channelsEl.appendChild(row);
  });
}

function renderGroupLabels(groups) {
  const previous = groupFormState();
  previous.forEach((value, key) => groupMemory.set(key, value));
  groupPanel.hidden = false;
  groupLabelsEl.innerHTML = "";
  groups.forEach((group, index) => {
    const defaultLabel = shortGroupName(group.display);
    const value = previous.get(group.key) ?? groupMemory.get(group.key) ?? defaultLabel;
    const row = document.createElement("label");
    row.className = "group-label-row";
    row.innerHTML = `
      <span>第 ${index + 1} 组</span>
      <input type="text" data-group-label="${escapeHtml(group.key)}" data-default-label="${escapeHtml(defaultLabel)}" value="${escapeHtml(value)}" aria-label="第 ${index + 1} 组名称">
    `;
    groupLabelsEl.appendChild(row);
  });
}

function channelFormState() {
  const labels = new Map(Array.from(document.querySelectorAll("[data-channel-label]")).map((input) => [input.dataset.channelLabel, input.value]));
  return new Map(Array.from(document.querySelectorAll("[data-channel-check]")).map((input) => [
    input.value,
    { checked: input.checked, label: labels.has(input.value) ? labels.get(input.value) : input.value },
  ]));
}

function groupFormState() {
  return new Map(Array.from(document.querySelectorAll("[data-group-label]")).map((input) => [input.dataset.groupLabel, input.value]));
}

function shownChannels(channels) {
  const settings = channelFormState();
  return channels
    .map((channel) => ({ ...channel, previewLabel: settings.get(channel.key)?.label || defaultLabels[channel.key] || channel.label || channel.key }))
    .filter((channel) => settings.get(channel.key)?.checked !== false);
}

function preparePreview(className) {
  previewEl.className = `preview ${className}${backgroundEl.value === "black" ? " is-dark" : ""}${fitModeEl.value === "contain" ? " fit-contain" : ""}`;
  previewEl.innerHTML = "";
}

function appendHeader(figure, channels, showGroups, labelsOnLeft) {
  if (showGroups && labelsOnLeft) figure.appendChild(document.createElement("div"));
  channels.forEach((channel) => {
    const header = document.createElement("div");
    header.className = "figure-marker";
    header.dataset.previewChannel = channel.key;
    header.textContent = channel.previewLabel || channel.label;
    figure.appendChild(header);
  });
  if (showGroups && !labelsOnLeft) figure.appendChild(document.createElement("div"));
}

function makeGroupLabel(group) {
  const label = document.createElement("div");
  label.className = "figure-group-label";
  label.dataset.previewGroup = group.key;
  const input = Array.from(document.querySelectorAll("[data-group-label]")).find((item) => item.dataset.groupLabel === group.key);
  label.textContent = input?.value.trim() || input?.dataset.defaultLabel || shortGroupName(group.display);
  return label;
}

function renderPreview(data) {
  const channels = shownChannels(data.channels);
  const showGroups = showSampleNameEl.checked;
  const labelsOnLeft = groupLabelSideEl.value !== "right";
  preparePreview("figure-preview");

  const figure = document.createElement("div");
  figure.className = "figure-grid";
  figure.style.gridTemplateColumns = `${showGroups && labelsOnLeft ? "96px " : ""}repeat(${channels.length}, minmax(130px, 1fr))${showGroups && !labelsOnLeft ? " 96px" : ""}`;
  appendHeader(figure, channels, showGroups, labelsOnLeft);

  data.groups.forEach((group) => {
    if (showGroups && labelsOnLeft) figure.appendChild(makeGroupLabel(group));

    const imageMap = new Map(group.images.map((image) => [image.channel, image]));
    channels.forEach((channel) => {
      const image = imageMap.get(channel.key);
      const cell = document.createElement("div");
      cell.className = "figure-cell";
      if (image) {
        cell.innerHTML = `<img src="${image.preview_url}" alt="${escapeHtml(image.filename)}">`;
      } else {
        cell.innerHTML = `<div class="missing">missing</div>`;
      }
      figure.appendChild(cell);
    });
    if (showGroups && !labelsOnLeft) figure.appendChild(makeGroupLabel(group));
  });

  previewEl.appendChild(figure);
}

function renderManualPreview(images, channels, groups) {
  const visibleChannels = shownChannels(channels);
  const visibleKeys = new Set(visibleChannels.map((channel) => channel.key));
  const showGroups = showSampleNameEl.checked;
  const labelsOnLeft = groupLabelSideEl.value !== "right";
  preparePreview("figure-preview");

  const figure = document.createElement("div");
  figure.className = "figure-grid";
  figure.style.gridTemplateColumns = `${showGroups && labelsOnLeft ? "96px " : ""}repeat(${visibleChannels.length}, minmax(130px, 1fr))${showGroups && !labelsOnLeft ? " 96px" : ""}`;
  appendHeader(figure, visibleChannels, showGroups, labelsOnLeft);

  groups.forEach((group, groupIndex) => {
    if (showGroups && labelsOnLeft) figure.appendChild(makeGroupLabel(group));

    channels.forEach((channel, columnIndex) => {
      if (!visibleKeys.has(channel.key)) return;
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
    if (showGroups && !labelsOnLeft) figure.appendChild(makeGroupLabel(group));
  });

  previewEl.appendChild(figure);
}

function renderIhcPreview(images, groups) {
  const channels = [
    { key: "low", label: ihcLowLabelEl.value || "4X", previewLabel: ihcLowLabelEl.value || "4X" },
    { key: "high", label: ihcHighLabelEl.value || "20X", previewLabel: ihcHighLabelEl.value || "20X" },
  ];
  const showGroups = showSampleNameEl.checked;
  const labelsOnLeft = groupLabelSideEl.value !== "right";
  preparePreview("ihc-preview");
  const [roiX, roiY, roiW, roiH] = normalizedIhcRoi();

  const figure = document.createElement("div");
  figure.className = "ihc-grid";
  figure.style.gridTemplateColumns = `${showGroups && labelsOnLeft ? "96px " : ""}repeat(2, minmax(220px, 1fr))${showGroups && !labelsOnLeft ? " 96px" : ""}`;
  appendHeader(figure, channels, showGroups, labelsOnLeft);

  groups.forEach((group, groupIndex) => {
    if (showGroups && labelsOnLeft) figure.appendChild(makeGroupLabel(group));

    const lowImage = images[groupIndex * 2];
    const highImage = images[groupIndex * 2 + 1];
    [lowImage, highImage].forEach((image, columnIndex) => {
      const cell = document.createElement("div");
      cell.className = columnIndex === 0 ? "ihc-cell ihc-low-cell" : "ihc-cell";
      if (image) {
        cell.innerHTML = `<img src="${image.preview_url}" alt="${escapeHtml(image.filename)}">`;
        if (columnIndex === 0) {
          const roi = document.createElement("div");
          roi.className = "ihc-roi";
          roi.style.left = `${roiX * 100}%`;
          roi.style.top = `${roiY * 100}%`;
          roi.style.width = `${roiW * 100}%`;
          roi.style.height = `${roiH * 100}%`;
          cell.appendChild(roi);
        }
      } else {
        cell.innerHTML = `<div class="missing">missing</div>`;
      }
      figure.appendChild(cell);
    });
    if (showGroups && !labelsOnLeft) figure.appendChild(makeGroupLabel(group));
  });

  previewEl.appendChild(figure);
}

function normalizedIhcRoi() {
  const clamp = (value, min, max) => Math.min(Math.max(Number.isFinite(value) ? value : min, min), max);
  const width = clamp(Number(ihcRoiWEl.value), 0.05, 1);
  const height = clamp(Number(ihcRoiHEl.value), 0.05, 1);
  const x = clamp(Number(ihcRoiXEl.value), 0, 1 - width);
  const y = clamp(Number(ihcRoiYEl.value), 0, 1 - height);
  return [x, y, width, height];
}

channelsEl.addEventListener("input", (event) => {
  const key = event.target.dataset.channelLabel;
  if (!key) return;
  const saved = channelMemory.get(key) || { checked: true, label: key };
  channelMemory.set(key, { ...saved, label: event.target.value });
  document.querySelectorAll("[data-preview-channel]").forEach((label) => {
    if (label.dataset.previewChannel === key) label.textContent = event.target.value.trim() || event.target.dataset.defaultLabel || key;
  });
});

channelsEl.addEventListener("change", (event) => {
  if (!event.target.matches("[data-channel-check]")) return;
  if (!document.querySelector("[data-channel-check]:checked")) {
    event.target.checked = true;
    statusEl.textContent = "预览和导出至少需要保留一个通道";
    return;
  }
  const saved = channelMemory.get(event.target.value) || { label: event.target.value };
  channelMemory.set(event.target.value, { ...saved, checked: event.target.checked });
  refreshLayoutInputs();
});

groupLabelsEl.addEventListener("input", (event) => {
  const key = event.target.dataset.groupLabel;
  if (!key) return;
  groupMemory.set(key, event.target.value);
  document.querySelectorAll("[data-preview-group]").forEach((label) => {
    if (label.dataset.previewGroup === key) label.textContent = event.target.value.trim() || event.target.dataset.defaultLabel || "Group";
  });
});

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

window.addEventListener("beforeunload", (event) => {
  if (!activeUpload) return;
  event.preventDefault();
  event.returnValue = "";
});

syncExportButton();
updateFigureTypeControls();
updateManualControls();
restoreSessionJob();
