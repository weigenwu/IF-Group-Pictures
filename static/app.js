const byId = (id) => document.getElementById(id);

const folderInput = byId("folderInput");
const fileInput = byId("fileInput");
const fileSummaryEl = byId("fileSummary");
const uploadBtn = byId("uploadBtn");
const exportBtn = byId("exportBtn");
const cancelUploadBtn = byId("cancelUpload");
const statusEl = byId("status");
const summaryEl = byId("summary");
const previewEl = byId("preview");
const progressPanel = byId("progressPanel");
const phaseTextEl = byId("phaseText");
const elapsedTextEl = byId("elapsedText");
const progressBarEl = byId("progressBar");
const progressTrackEl = byId("progressTrack");
const progressDetailEl = byId("progressDetail");
const channelPanel = byId("channelPanel");
const channelsEl = byId("channels");
const groupPanel = byId("groupPanel");
const groupLabelsEl = byId("groupLabels");
const rowsPerSlideEl = byId("rowsPerSlide");
const backgroundEl = byId("background");
const deckTitleEl = byId("deckTitle");
const panelLetterEl = byId("panelLetter");
const figureTypeEl = byId("figureType");
const layoutModeEl = byId("layoutMode");
const groupCountEl = byId("groupCount");
const imagesPerGroupEl = byId("imagesPerGroup");
const showSampleNameEl = byId("showSampleName");
const groupLabelSideEl = byId("groupLabelSide");
const fitModeEl = byId("fitMode");
const exportFormatEl = byId("exportFormat");
const exportProfileEl = byId("exportProfile");
const exportWidthEl = byId("exportWidth");
const exportHeightEl = byId("exportHeight");
const exportDpiEl = byId("exportDpi");
const ihcSettingsEl = byId("ihcSettings");
const ihcLowLabelEl = byId("ihcLowLabel");
const ihcHighLabelEl = byId("ihcHighLabel");
const ihcRoiGroupEl = byId("ihcRoiGroup");
const ihcRoiXEl = byId("ihcRoiX");
const ihcRoiYEl = byId("ihcRoiY");
const ihcRoiWEl = byId("ihcRoiW");
const ihcRoiHEl = byId("ihcRoiH");
const ihcDrawConnectorsEl = byId("ihcDrawConnectors");
const resetIhcRoiBtn = byId("resetIhcRoi");
const showScaleBarEl = byId("showScaleBar");
const scaleLengthEl = byId("scaleLength");
const scalePositionEl = byId("scalePosition");
const scaleColorEl = byId("scaleColor");
const scaleThicknessEl = byId("scaleThickness");
const calibrationPixelsEl = byId("calibrationPixels");
const calibrationMicronsEl = byId("calibrationMicrons");
const calibrationTargetEl = byId("calibrationTarget");
const pixelsPerMicronEl = byId("pixelsPerMicron");
const highPixelsPerMicronEl = byId("highPixelsPerMicron");
const highCalibrationFieldEl = byId("highCalibrationField");
const calibrateBtn = byId("calibrateBtn");
const calibrationStatusEl = byId("calibrationStatus");
const imageLibraryPanel = byId("imageLibraryPanel");
const imageGalleryEl = byId("imageGallery");
const mappingSummaryEl = byId("mappingSummary");
const undoBtn = byId("undoBtn");
const redoBtn = byId("redoBtn");
const templateSelectEl = byId("templateSelect");
const saveTemplateBtn = byId("saveTemplateBtn");
const preflightBtn = byId("preflightBtn");
const projectExportBtn = byId("projectExportBtn");
const complianceExportBtn = byId("complianceExportBtn");
const preflightDialog = byId("preflightDialog");
const preflightSummaryEl = byId("preflightSummary");
const preflightResultsEl = byId("preflightResults");
const rerunPreflightBtn = byId("rerunPreflight");

const SESSION_JOB_KEY = "figurelab-fluorescence-job-v2";
const SESSION_STATE_KEY = "figurelab-fluorescence-state-v2";
const TEMPLATE_KEY = "figurelab-fluorescence-templates-v1";
const supportedImagePattern = /\.(tif|tiff|png|jpe?g|bmp)$/i;
const defaultRoi = [0.32, 0.36, 0.30, 0.28];
const profileDefaults = {
  slides: [33.87, 19.05, 300],
  "nature-single": [8.9, 5.0, 600],
  "nature-double": [18.3, 10.3, 600],
};
const stateControlIds = [
  "deckTitle", "panelLetter", "figureType", "layoutMode", "groupCount", "imagesPerGroup",
  "rowsPerSlide", "groupLabelSide", "fitMode", "background", "exportFormat", "showSampleName",
  "exportProfile", "exportWidth", "exportHeight", "exportDpi", "ihcLowLabel", "ihcHighLabel",
  "ihcDrawConnectors", "showScaleBar", "scaleLength", "scalePosition", "scaleColor",
  "scaleThickness", "calibrationTarget", "calibrationPixels", "calibrationMicrons", "pixelsPerMicron", "highPixelsPerMicron",
];
const defaultLabels = { ch00: "DAPI", ch01: "Marker", ch02: "Marker 2", ch03: "Marker 3", Merged: "Merge" };

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
let imageOrder = [];
let assignmentStores = { "if-auto": new Map(), "if-manual": new Map(), ihc: new Map() };
let ihcRois = new Map();
let activeGroups = [];
let activeChannels = [];
let draggedImageId = "";
let roiPointer = null;
let history = [];
let redoHistory = [];
let historyRestoring = false;
let historyTimer = null;

const channelMemory = new Map();
const groupMemory = new Map();

figureTypeEl.addEventListener("change", () => {
  if (figureTypeEl.value === "ihc") {
    rememberIfLayoutState();
    if (currentJob) {
      const count = Math.max(1, Math.ceil(currentJob.images.length / 2));
      groupCountEl.value = String(count);
      imagesPerGroupEl.value = "2";
      rowsPerSlideEl.value = String(Math.min(count, 4));
    }
  } else {
    layoutModeEl.value = ifLayoutMode;
    groupCountEl.value = ifGroupCount;
    imagesPerGroupEl.value = ifImagesPerGroup;
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
  rowsPerSlideEl.value = String(Math.min(clampInteger(groupCountEl.value, 1, 50), limit));
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

[showSampleNameEl, groupLabelSideEl, fitModeEl, backgroundEl].forEach((input) => input.addEventListener("change", refreshLayoutInputs));
[ihcLowLabelEl, ihcHighLabelEl, ihcDrawConnectorsEl].forEach((input) => {
  input.addEventListener("input", refreshLayoutInputs);
  input.addEventListener("change", refreshLayoutInputs);
});
[showScaleBarEl, scaleLengthEl, scalePositionEl, scaleColorEl, scaleThicknessEl, pixelsPerMicronEl, highPixelsPerMicronEl].forEach((input) => {
  input.addEventListener("input", refreshLayoutInputs);
  input.addEventListener("change", refreshLayoutInputs);
});

[ihcRoiXEl, ihcRoiYEl, ihcRoiWEl, ihcRoiHEl].forEach((input) => {
  input.addEventListener("input", () => {
    if (!currentJob || !ihcRoiGroupEl.value) return;
    ihcRois.set(ihcRoiGroupEl.value, normalizedRoiFromInputs());
    renderActivePreview();
  });
});
ihcRoiGroupEl.addEventListener("change", () => syncRoiInputs(ihcRoiGroupEl.value));
resetIhcRoiBtn.addEventListener("click", () => {
  if (!ihcRoiGroupEl.value) return;
  ihcRois.set(ihcRoiGroupEl.value, [...defaultRoi]);
  syncRoiInputs(ihcRoiGroupEl.value);
  renderActivePreview();
  commitHistory();
});

exportProfileEl.addEventListener("change", () => {
  applyProfileDefaults();
  commitHistorySoon();
});
exportFormatEl.addEventListener("change", syncExportButton);
calibrateBtn.addEventListener("click", calculateCalibration);

[folderInput, fileInput].forEach((input) => {
  input.addEventListener("change", () => {
    setSelectedFiles(input.files || []);
    input.value = "";
  });
});

cancelUploadBtn.addEventListener("click", () => activeUpload?.abort());
uploadBtn.addEventListener("click", uploadSelectedFiles);
exportBtn.addEventListener("click", exportFigure);
preflightBtn.addEventListener("click", runPreflight);
rerunPreflightBtn.addEventListener("click", runPreflight);
projectExportBtn.addEventListener("click", () => exportProjectPackage("project"));
complianceExportBtn.addEventListener("click", () => exportProjectPackage("compliance"));
undoBtn.addEventListener("click", undo);
redoBtn.addEventListener("click", redo);
saveTemplateBtn.addEventListener("click", saveTemplate);
templateSelectEl.addEventListener("change", applySelectedTemplate);

document.querySelector(".shell").addEventListener("change", (event) => {
  if (event.target.matches("#folderInput, #fileInput") || historyRestoring) return;
  commitHistory();
  persistSessionSoon();
});

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

imageGalleryEl.addEventListener("dragstart", (event) => {
  const card = event.target.closest("[data-image-card]");
  if (!card) return;
  draggedImageId = card.dataset.imageCard;
  card.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedImageId);
});
imageGalleryEl.addEventListener("dragend", (event) => {
  event.target.closest("[data-image-card]")?.classList.remove("is-dragging");
  clearDropTargets();
  draggedImageId = "";
});
imageGalleryEl.addEventListener("dragover", (event) => {
  if (!event.target.closest("[data-image-card]")) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
});
imageGalleryEl.addEventListener("drop", (event) => {
  const target = event.target.closest("[data-image-card]");
  const sourceId = draggedImageId || event.dataTransfer.getData("text/plain");
  if (!target || !sourceId || sourceId === target.dataset.imageCard) return;
  event.preventDefault();
  moveImageBefore(sourceId, target.dataset.imageCard);
});
imageGalleryEl.addEventListener("change", (event) => {
  const card = event.target.closest("[data-image-card]");
  if (!card || !event.target.matches("select")) return;
  const group = card.querySelector("[data-gallery-group]").value;
  const channel = card.querySelector("[data-gallery-channel]").value;
  if (group && channel) assignImageToSlot(card.dataset.imageCard, group, channel);
  else {
    activeAssignmentStore().delete(card.dataset.imageCard);
    refreshLayoutInputs();
    commitHistory();
  }
});
imageGalleryEl.addEventListener("keydown", (event) => {
  const card = event.target.closest("[data-image-card]");
  if (!card || event.target !== card || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  event.preventDefault();
  moveImageBy(card.dataset.imageCard, event.key === "ArrowLeft" ? -1 : 1);
});

previewEl.addEventListener("dragstart", (event) => {
  const cell = event.target.closest("[data-image-id]");
  if (!cell) return;
  draggedImageId = cell.dataset.imageId;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedImageId);
});
previewEl.addEventListener("dragover", (event) => {
  const cell = event.target.closest("[data-drop-group][data-drop-channel]");
  if (!cell) return;
  event.preventDefault();
  clearDropTargets();
  cell.classList.add("is-drop-target");
  event.dataTransfer.dropEffect = "move";
});
previewEl.addEventListener("dragleave", (event) => {
  if (!event.currentTarget.contains(event.relatedTarget)) clearDropTargets();
});
previewEl.addEventListener("drop", (event) => {
  const cell = event.target.closest("[data-drop-group][data-drop-channel]");
  const imageId = draggedImageId || event.dataTransfer.getData("text/plain");
  if (!cell || !imageId) return;
  event.preventDefault();
  assignImageToSlot(imageId, cell.dataset.dropGroup, cell.dataset.dropChannel);
  clearDropTargets();
});
previewEl.addEventListener("pointerdown", startRoiPointer);
previewEl.addEventListener("pointermove", moveRoiPointer);
previewEl.addEventListener("pointerup", finishRoiPointer);
previewEl.addEventListener("pointercancel", finishRoiPointer);
previewEl.addEventListener("keydown", nudgeRoi);

window.addEventListener("keydown", (event) => {
  const editing = event.target.matches("input, textarea, select, [contenteditable='true']");
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !editing) {
    event.preventDefault();
    event.shiftKey ? redo() : undo();
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y" && !editing) {
    event.preventDefault();
    redo();
  } else if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && currentJob) {
    event.preventDefault();
    runPreflight();
  } else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "e" && currentJob) {
    event.preventDefault();
    exportFigure();
  }
});

window.addEventListener("beforeunload", (event) => {
  persistCurrentJob();
  if (!activeUpload) return;
  event.preventDefault();
  event.returnValue = "";
});

async function uploadSelectedFiles() {
  if (!selectedFiles.length) return;
  setBusy(true, "正在上传并生成预览...");
  cancelUploadBtn.hidden = false;
  startProgress("准备上传", "正在准备文件...");
  const formData = new FormData();
  selectedFiles.forEach((file) => formData.append("files", file, file.webkitRelativePath || file.name));
  try {
    const data = await uploadWithProgress(formData);
    currentJob = data;
    initializeJobState(data);
    if (figureTypeEl.value === "ihc") {
      const count = Math.max(1, Math.ceil(data.images.length / 2));
      groupCountEl.value = String(count);
      imagesPerGroupEl.value = "2";
      rowsPerSlideEl.value = String(Math.min(count, 4));
    } else if (layoutModeEl.value === "manual") {
      groupCountEl.value = ifGroupCount;
      imagesPerGroupEl.value = ifImagesPerGroup;
      rowsPerSlideEl.value = ifRowsPerSlide;
    } else {
      groupCountEl.value = String(Math.max(data.groups.length, 1));
      imagesPerGroupEl.value = String(Math.max(data.channels.length, 1));
      rowsPerSlideEl.value = String(Math.min(Math.max(data.groups.length, 1), 6));
      rememberIfLayoutState();
    }
    refreshLayoutInputs();
    finishProgress(data);
    statusEl.textContent = `识别到 ${groupCountEl.value} 组，${data.image_count || data.images.length} 张图`;
    summaryEl.textContent = figureTypeEl.value === "ihc"
      ? "可逐组拖动或缩放 ROI，检查图片映射与比例尺后导出。"
      : "可拖拽调整图片映射，修改 marker 和组别名称后导出。";
    persistCurrentJob();
    resetHistory();
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
}

async function exportFigure() {
  if (!currentJob || operationBusy) return;
  const format = exportFormatEl.value.toUpperCase();
  setBusy(true, `正在生成 ${format}...`);
  startProgress("正在导出", `正在生成 ${format} 文件...`);
  try {
    const data = await postForDownload("/api/export", buildPayload());
    const seconds = elapsedSeconds(progressStartedAt);
    setProgress(100, "导出完成", `${format} 已生成，用时 ${seconds.toFixed(1)}s`);
    stopProgressTimer();
    showDownloadResult(data, "已生成");
  } catch (error) {
    stopProgressTimer();
    setProgress(0, "导出失败", error.message);
    statusEl.textContent = error.message;
  } finally {
    setBusy(false);
  }
}

async function exportProjectPackage(packageType) {
  if (!currentJob || operationBusy) return;
  const label = packageType === "compliance" ? "投稿合规包" : "项目文件";
  setBusy(true, `正在生成${label}...`);
  startProgress("正在打包", `正在生成${label}...`);
  try {
    const endpoint = packageType === "compliance" ? "/api/compliance/export" : "/api/project/export";
    const data = await postForDownload(endpoint, { ...buildPayload(), package_type: packageType });
    setProgress(100, "打包完成", `${label}已生成`);
    stopProgressTimer();
    showDownloadResult(data, `${label}已生成`);
  } catch (error) {
    stopProgressTimer();
    setProgress(0, "打包失败", error.message);
    statusEl.textContent = error.message;
  } finally {
    setBusy(false);
  }
}

async function runPreflight() {
  if (!currentJob) return;
  if (!preflightDialog.open) {
    if (typeof preflightDialog.showModal === "function") preflightDialog.showModal();
    else preflightDialog.setAttribute("open", "");
  }
  preflightSummaryEl.textContent = "正在检查图片、映射和导出规格…";
  preflightResultsEl.innerHTML = '<li class="preflight-item is-info">正在检查…</li>';
  const localChecks = buildLocalPreflightChecks();
  try {
    const response = await fetch("/api/preflight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload()),
    });
    const data = parseJson(await response.text());
    if (!response.ok) throw new Error(data.error || `预检失败：HTTP ${response.status}`);
    const rawChecks = Array.isArray(data.checks || data.results || data.issues)
      ? (data.checks || data.results || data.issues)
      : [
          ...(Array.isArray(data.errors) ? data.errors.map((item) => ({ ...item, status: "error" })) : []),
          ...(Array.isArray(data.warnings) ? data.warnings.map((item) => ({ ...item, status: "warn" })) : []),
        ];
    renderPreflight([...localChecks, ...rawChecks.map(normalizePreflightCheck)]);
  } catch (error) {
    renderPreflight([...localChecks, { status: "warn", title: "服务器预检未完成", message: error.message }]);
  }
}

function buildLocalPreflightChecks() {
  const missing = missingSlotCount();
  const dpi = Number(exportDpiEl.value);
  const width = Number(exportWidthEl.value);
  const height = Number(exportHeightEl.value);
  const checks = [
    { status: missing ? "error" : "pass", title: "图片映射", message: missing ? `仍有 ${missing} 个预览位置缺少图片。` : "所有当前显示位置均已映射图片。" },
    { status: dpi >= 300 ? "pass" : "error", title: "输出分辨率", message: `${dpi || 0} DPI；投稿图建议不少于 300 DPI。` },
    { status: width > 0 && height > 0 ? "pass" : "error", title: "最终尺寸", message: width > 0 && height > 0 ? `${width} × ${height} cm` : "请填写有效的导出宽度和高度。" },
  ];
  if (showScaleBarEl.checked) {
    const primary = Number(pixelsPerMicronEl.value);
    const high = Number(highPixelsPerMicronEl.value);
    const calibrated = primary > 0 && (figureTypeEl.value !== "ihc" || high > 0);
    checks.push(calibrated
      ? { status: "pass", title: "比例尺标定", message: figureTypeEl.value === "ihc" ? `低倍 ${primary.toFixed(3)}、高倍 ${high.toFixed(3)} px/µm` : `${primary.toFixed(3)} px/µm` }
      : { status: "error", title: "比例尺未完整标定", message: figureTypeEl.value === "ihc" ? "IHC 低倍与高倍必须分别填写准确的 px/µm。" : "请填写准确的 px/µm 后再导出比例尺。" });
  }
  const duplicateNames = duplicateFilenames();
  if (duplicateNames.length) checks.push({ status: "warn", title: "重复文件名", message: `发现同名文件：${duplicateNames.slice(0, 3).join("、")}；请依靠相对路径核对来源。` });
  return checks;
}

function normalizePreflightCheck(check) {
  const raw = String(check.status || check.level || "info").toLowerCase();
  const status = raw === "ok" || raw === "passed" || raw === "success" ? "pass" : raw === "warning" ? "warn" : raw;
  return {
    status: ["pass", "warn", "error", "info"].includes(status) ? status : "info",
    title: check.title || check.name || check.code || "检查结果",
    message: check.message || check.detail || check.description || "",
  };
}

function renderPreflight(checks) {
  const errors = checks.filter((item) => item.status === "error").length;
  const warnings = checks.filter((item) => item.status === "warn").length;
  preflightSummaryEl.textContent = errors ? `${errors} 项必须处理，${warnings} 项建议核对。` : warnings ? `无阻断项，${warnings} 项建议核对。` : "全部检查通过，可以导出。";
  preflightResultsEl.innerHTML = "";
  checks.forEach((check) => {
    const item = document.createElement("li");
    item.className = `preflight-item is-${check.status}`;
    item.innerHTML = `<span class="check-mark" aria-hidden="true">${check.status === "pass" ? "✓" : check.status === "error" ? "!" : check.status === "warn" ? "△" : "i"}</span><div><strong>${escapeHtml(check.title)}</strong><p>${escapeHtml(check.message)}</p></div>`;
    preflightResultsEl.appendChild(item);
  });
}

function buildPayload() {
  const definition = layoutDefinition();
  activeGroups = definition.groups;
  activeChannels = definition.channels;
  normalizeAssignments(activeAssignmentStore(), activeGroups, activeChannels);
  const selectedChannels = figureTypeEl.value === "ihc"
    ? ["low", "high"]
    : Array.from(document.querySelectorAll("[data-channel-check]:checked")).map((input) => input.value);
  const labels = {};
  document.querySelectorAll("[data-channel-label]").forEach((input) => {
    labels[input.dataset.channelLabel] = input.value.trim() || input.dataset.defaultLabel || input.dataset.channelLabel;
  });
  const groupLabels = {};
  document.querySelectorAll("[data-group-label]").forEach((input) => {
    groupLabels[input.dataset.groupLabel] = input.value.trim() || input.dataset.defaultLabel || "Group";
  });
  const store = activeAssignmentStore();
  const assignments = imageOrder.flatMap((imageId) => {
    const target = store.get(imageId);
    return target ? [{ image_id: imageId, group_key: target.group_key, channel_key: target.channel_key }] : [];
  });
  const rois = activeGroups.map((group) => {
    const [x, y, w, h] = roiForGroup(group.key);
    return { group_key: group.key, x, y, w, h };
  });
  const [legacyX, legacyY, legacyW, legacyH] = rois.length ? [rois[0].x, rois[0].y, rois[0].w, rois[0].h] : defaultRoi;
  return {
    job_id: currentJob.job_id,
    title: deckTitleEl.value.trim(),
    panel_letter: panelLetterEl.value.trim(),
    figure_type: figureTypeEl.value,
    export_format: exportFormatEl.value,
    export_profile: exportProfileEl.value,
    export_width_cm: Number(exportWidthEl.value),
    export_height_cm: Number(exportHeightEl.value),
    export_dpi: Number(exportDpiEl.value),
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
    group_order: activeGroups.map((group) => group.key),
    image_order: [...imageOrder],
    assignments,
    ihc_low_label: ihcLowLabelEl.value.trim(),
    ihc_high_label: ihcHighLabelEl.value.trim(),
    ihc_roi_x: legacyX,
    ihc_roi_y: legacyY,
    ihc_roi_w: legacyW,
    ihc_roi_h: legacyH,
    ihc_rois: rois,
    ihc_draw_connectors: ihcDrawConnectorsEl.checked,
    scale_bar: {
      enabled: showScaleBarEl.checked,
      length_um: Number(scaleLengthEl.value),
      position: scalePositionEl.value,
      color: scaleColorEl.value,
      thickness_px: Number(scaleThicknessEl.value),
    },
    calibration: {
      pixels_per_micron: Number(pixelsPerMicronEl.value) || 0,
      known_distance_px: Number(calibrationPixelsEl.value) || 0,
      known_distance_um: Number(calibrationMicronsEl.value) || 0,
    },
    calibrations: {
      default: { pixels_per_micron: Number(pixelsPerMicronEl.value) || 0 },
      by_channel: {
        low: { pixels_per_micron: Number(pixelsPerMicronEl.value) || 0 },
        high: { pixels_per_micron: Number(highPixelsPerMicronEl.value) || 0 },
      },
    },
  };
}

async function postForDownload(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = parseJson(await response.text());
    if (!response.ok) throw new Error(data.error || `请求失败：HTTP ${response.status}`);
    return data;
  }
  if (!response.ok) throw new Error(`请求失败：HTTP ${response.status}`);
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  const filename = decodeURIComponent(disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)/i)?.[1] || "figurelab-export");
  return { blob, filename };
}

function showDownloadResult(data, prefix) {
  statusEl.textContent = `${prefix} `;
  const link = document.createElement("a");
  if (data.download_url) {
    link.href = data.download_url;
  } else if (data.blob) {
    link.href = URL.createObjectURL(data.blob);
    link.addEventListener("click", () => setTimeout(() => URL.revokeObjectURL(link.href), 30_000), { once: true });
  } else {
    throw new Error("服务器未返回下载地址");
  }
  link.download = data.filename || "";
  link.textContent = data.filename || "下载文件";
  statusEl.appendChild(link);
  link.click();
}

function initializeJobState(data) {
  imageOrder = data.images.map(imageKey);
  assignmentStores = { "if-auto": new Map(), "if-manual": new Map(), ihc: new Map() };
  ihcRois = new Map();
  const autoStore = assignmentStores["if-auto"];
  data.groups.forEach((group) => group.images.forEach((image) => {
    autoStore.set(imageKey(image), { group_key: group.key, channel_key: image.channel });
  }));
}

function layoutDefinition() {
  if (!currentJob) return { groups: [], channels: [] };
  if (figureTypeEl.value === "ihc") {
    const count = clampInteger(groupCountEl.value, 1, 50);
    groupCountEl.value = String(count);
    imagesPerGroupEl.value = "2";
    return {
      groups: Array.from({ length: count }, (_, index) => ({ key: `ihc_group_${String(index + 1).padStart(2, "0")}`, display: `Group ${index + 1}` })),
      channels: [{ key: "low", label: ihcLowLabelEl.value || "4X" }, { key: "high", label: ihcHighLabelEl.value || "20X" }],
    };
  }
  if (layoutModeEl.value === "manual") {
    const count = clampInteger(groupCountEl.value, 1, 50);
    const perGroup = clampInteger(imagesPerGroupEl.value, 1, 20);
    groupCountEl.value = String(count);
    imagesPerGroupEl.value = String(perGroup);
    return {
      groups: Array.from({ length: count }, (_, index) => ({ key: `manual_group_${String(index + 1).padStart(2, "0")}`, display: `Group ${index + 1}` })),
      channels: Array.from({ length: perGroup }, (_, index) => ({ key: `slot${String(index + 1).padStart(2, "0")}`, label: `Marker ${index + 1}` })),
    };
  }
  return { groups: currentJob.groups, channels: currentJob.channels };
}

function refreshLayoutInputs() {
  if (!currentJob) return;
  updateFigureTypeControls();
  updateManualControls();
  const definition = layoutDefinition();
  activeGroups = definition.groups;
  activeChannels = definition.channels;
  normalizeAssignments(activeAssignmentStore(), activeGroups, activeChannels);
  if (figureTypeEl.value === "ihc") {
    renderGroupLabels(activeGroups);
    channelPanel.hidden = true;
    ensureIhcRois(activeGroups);
    updateRoiGroupSelect(activeGroups);
  } else {
    renderChannels(activeChannels);
    renderGroupLabels(activeGroups);
  }
  renderActivePreview();
  renderImageGallery();
  syncJobActions();
}

function renderActivePreview() {
  if (!currentJob) return;
  if (figureTypeEl.value === "ihc") renderIhcPreview(activeGroups);
  else renderIfPreview(activeGroups, activeChannels);
}

function renderChannels(channels) {
  const previous = historyRestoring ? new Map() : channelFormState();
  previous.forEach((value, key) => channelMemory.set(key, value));
  channelPanel.hidden = false;
  channelsEl.innerHTML = "";
  channels.forEach((channel) => {
    const saved = previous.get(channel.key) || channelMemory.get(channel.key);
    const defaultLabel = defaultLabels[channel.key] ?? channel.label ?? channel.key;
    const label = saved?.label ?? defaultLabel;
    const row = document.createElement("label");
    row.className = "channel-row";
    row.innerHTML = `<input type="checkbox" data-channel-check value="${escapeHtml(channel.key)}" ${saved?.checked === false ? "" : "checked"} aria-label="显示 ${escapeHtml(channel.key)} 通道"><span>${escapeHtml(channel.key)}</span><input type="text" data-channel-label="${escapeHtml(channel.key)}" data-default-label="${escapeHtml(defaultLabel)}" value="${escapeHtml(label)}" aria-label="${escapeHtml(channel.key)} 的 marker 名称">`;
    channelsEl.appendChild(row);
  });
}

function renderGroupLabels(groups) {
  const previous = historyRestoring ? new Map() : groupFormState();
  previous.forEach((value, key) => groupMemory.set(key, value));
  groupPanel.hidden = false;
  groupLabelsEl.innerHTML = "";
  groups.forEach((group, index) => {
    const defaultLabel = shortGroupName(group.display);
    const value = previous.get(group.key) ?? groupMemory.get(group.key) ?? defaultLabel;
    const row = document.createElement("label");
    row.className = "group-label-row";
    row.innerHTML = `<span>第 ${index + 1} 组</span><input type="text" data-group-label="${escapeHtml(group.key)}" data-default-label="${escapeHtml(defaultLabel)}" value="${escapeHtml(value)}" aria-label="第 ${index + 1} 组名称">`;
    groupLabelsEl.appendChild(row);
  });
}

function renderIfPreview(groups, channels) {
  const visibleChannels = shownChannels(channels);
  const showGroups = showSampleNameEl.checked;
  const labelsOnLeft = groupLabelSideEl.value !== "right";
  preparePreview("figure-preview");
  const figure = document.createElement("div");
  figure.className = "figure-grid";
  figure.style.gridTemplateColumns = `${showGroups && labelsOnLeft ? "96px " : ""}repeat(${Math.max(visibleChannels.length, 1)}, minmax(130px, 1fr))${showGroups && !labelsOnLeft ? " 96px" : ""}`;
  appendHeader(figure, visibleChannels, showGroups, labelsOnLeft);
  groups.forEach((group) => {
    if (showGroups && labelsOnLeft) figure.appendChild(makeGroupLabel(group));
    visibleChannels.forEach((channel) => figure.appendChild(makeImageCell(group.key, channel.key, "figure-cell")));
    if (showGroups && !labelsOnLeft) figure.appendChild(makeGroupLabel(group));
  });
  previewEl.appendChild(figure);
}

function renderIhcPreview(groups) {
  const channels = [
    { key: "low", previewLabel: ihcLowLabelEl.value || "4X" },
    { key: "high", previewLabel: ihcHighLabelEl.value || "20X" },
  ];
  const showGroups = showSampleNameEl.checked;
  const labelsOnLeft = groupLabelSideEl.value !== "right";
  preparePreview("ihc-preview");
  const figure = document.createElement("div");
  figure.className = "ihc-grid";
  figure.style.gridTemplateColumns = `${showGroups && labelsOnLeft ? "96px " : ""}repeat(2, minmax(220px, 1fr))${showGroups && !labelsOnLeft ? " 96px" : ""}`;
  appendHeader(figure, channels, showGroups, labelsOnLeft);
  groups.forEach((group) => {
    if (showGroups && labelsOnLeft) figure.appendChild(makeGroupLabel(group));
    channels.forEach((channel, index) => {
      const cell = makeImageCell(group.key, channel.key, index === 0 ? "ihc-cell ihc-low-cell" : "ihc-cell");
      if (index === 0 && cell.dataset.imageId) appendRoi(cell, group.key);
      figure.appendChild(cell);
    });
    if (showGroups && !labelsOnLeft) figure.appendChild(makeGroupLabel(group));
  });
  previewEl.appendChild(figure);
}

function makeImageCell(groupKey, channelKey, className) {
  const cell = document.createElement("div");
  cell.className = className;
  cell.dataset.dropGroup = groupKey;
  cell.dataset.dropChannel = channelKey;
  const image = imageForSlot(groupKey, channelKey);
  if (image) {
    cell.dataset.imageId = imageKey(image);
    cell.draggable = true;
    const img = document.createElement("img");
    img.src = image.preview_url;
    img.alt = image.filename;
    img.draggable = false;
    cell.appendChild(img);
    appendScaleBar(cell, image);
  } else {
    cell.innerHTML = '<div class="missing">拖入图片</div>';
  }
  return cell;
}

function appendRoi(cell, groupKey) {
  const [x, y, w, h] = roiForGroup(groupKey);
  const roi = document.createElement("div");
  roi.className = "ihc-roi";
  roi.dataset.roiGroup = groupKey;
  roi.tabIndex = 0;
  roi.setAttribute("role", "application");
  roi.setAttribute("aria-label", `${groupLabelText(groupKey)} ROI；拖动移动，右下角缩放，方向键微调，Shift 加方向键缩放`);
  setRoiStyle(roi, [x, y, w, h]);
  roi.innerHTML = '<span class="roi-resize-handle" aria-hidden="true"></span>';
  cell.appendChild(roi);
}

function appendScaleBar(cell, image) {
  if (!showScaleBarEl.checked) return;
  const length = Math.max(Number(scaleLengthEl.value) || 0, 0.01);
  const channel = activeAssignmentStore().get(imageKey(image))?.channel_key;
  const ppmInput = figureTypeEl.value === "ihc" && channel === "high" ? highPixelsPerMicronEl : pixelsPerMicronEl;
  const ppm = Math.max(Number(ppmInput.value) || 0, 0);
  const sourceWidth = Number(image.width) || 0;
  const sourceHeight = Number(image.height) || 0;
  const cellAspect = figureTypeEl.value === "ihc" ? 1.72 : 1;
  const visibleSourceWidth = fitModeEl.value === "contain" ? sourceWidth : Math.min(sourceWidth, sourceHeight * cellAspect);
  const percent = ppm > 0 && visibleSourceWidth > 0 ? clamp((length * ppm / visibleSourceWidth) * 100, 1, 90) : 18;
  const bar = document.createElement("div");
  bar.className = `scale-bar scale-${scalePositionEl.value} scale-${scaleColorEl.value}`;
  bar.style.setProperty("--scale-width", `${percent}%`);
  bar.style.setProperty("--scale-thickness", `${clampInteger(scaleThicknessEl.value, 1, 12)}px`);
  bar.innerHTML = `<span class="scale-line"></span><span class="scale-label">${escapeHtml(formatNumber(length))} µm</span>`;
  cell.appendChild(bar);
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
    header.textContent = channel.previewLabel || channel.label || channel.key;
    figure.appendChild(header);
  });
  if (showGroups && !labelsOnLeft) figure.appendChild(document.createElement("div"));
}

function makeGroupLabel(group) {
  const label = document.createElement("div");
  label.className = "figure-group-label";
  label.dataset.previewGroup = group.key;
  label.textContent = groupLabelText(group.key) || shortGroupName(group.display);
  return label;
}

function groupLabelText(groupKey) {
  const input = Array.from(document.querySelectorAll("[data-group-label]")).find((item) => item.dataset.groupLabel === groupKey);
  return input?.value.trim() || input?.dataset.defaultLabel || groupMemory.get(groupKey) || "Group";
}

function renderImageGallery() {
  if (!currentJob) {
    imageLibraryPanel.hidden = true;
    return;
  }
  imageLibraryPanel.hidden = false;
  const store = activeAssignmentStore();
  const groupOptions = activeGroups.map((group, index) => `<option value="${escapeHtml(group.key)}">${escapeHtml(groupLabelText(group.key) || `第 ${index + 1} 组`)}</option>`).join("");
  const channelOptions = activeChannels.map((channel) => `<option value="${escapeHtml(channel.key)}">${escapeHtml(channelDisplayLabel(channel))}</option>`).join("");
  imageGalleryEl.innerHTML = "";
  imageOrder.forEach((id, index) => {
    const image = imageById(id);
    if (!image) return;
    const target = store.get(id);
    const card = document.createElement("article");
    card.className = "image-card";
    card.dataset.imageCard = id;
    card.draggable = true;
    card.tabIndex = 0;
    card.setAttribute("role", "listitem");
    card.setAttribute("aria-label", `${index + 1}. ${image.filename}；可拖动排序或用左右方向键移动`);
    card.innerHTML = `<div class="thumb-wrap"><span class="order-badge">${index + 1}</span><img src="${image.preview_url}" alt="${escapeHtml(image.filename)}" loading="lazy" draggable="false"></div><div class="image-name" title="${escapeHtml(image.relative_path || image.filename)}">${escapeHtml(image.filename)}</div><div class="image-assignment"><label>组别<select data-gallery-group aria-label="${escapeHtml(image.filename)} 的组别"><option value="">未分配</option>${groupOptions}</select></label><label>位置<select data-gallery-channel aria-label="${escapeHtml(image.filename)} 的位置"><option value="">未分配</option>${channelOptions}</select></label></div>`;
    card.querySelector("[data-gallery-group]").value = target?.group_key || "";
    card.querySelector("[data-gallery-channel]").value = target?.channel_key || "";
    imageGalleryEl.appendChild(card);
  });
  const assigned = Array.from(store.values()).filter((target) => activeGroups.some((group) => group.key === target.group_key) && activeChannels.some((channel) => channel.key === target.channel_key)).length;
  const slots = activeGroups.length * activeChannels.length;
  mappingSummaryEl.textContent = `${assigned}/${Math.min(imageOrder.length, slots)} 张已映射 · ${Math.max(slots - assigned, 0)} 个空位`;
}

function channelDisplayLabel(channel) {
  const saved = channelMemory.get(channel.key);
  return saved?.label || channel.previewLabel || defaultLabels[channel.key] || channel.label || channel.key;
}

function activeAssignmentKey() {
  if (figureTypeEl.value === "ihc") return "ihc";
  return layoutModeEl.value === "manual" ? "if-manual" : "if-auto";
}

function activeAssignmentStore() {
  const key = activeAssignmentKey();
  if (!assignmentStores[key]) assignmentStores[key] = new Map();
  return assignmentStores[key];
}

function normalizeAssignments(store, groups, channels) {
  const slots = groups.flatMap((group) => channels.map((channel) => ({ group_key: group.key, channel_key: channel.key })));
  const valid = new Set(slots.map(slotKey));
  const occupied = new Set();
  imageOrder.forEach((imageId) => {
    const target = store.get(imageId);
    const key = target && slotKey(target);
    if (!target || !valid.has(key) || occupied.has(key)) store.delete(imageId);
    else occupied.add(key);
  });
  const free = slots.filter((slot) => !occupied.has(slotKey(slot)));
  imageOrder.forEach((imageId) => {
    if (!store.has(imageId) && free.length) store.set(imageId, free.shift());
  });
}

function assignImageToSlot(imageId, groupKey, channelKey) {
  const store = activeAssignmentStore();
  const oldTarget = store.get(imageId);
  let occupant = "";
  store.forEach((target, id) => {
    if (id !== imageId && target.group_key === groupKey && target.channel_key === channelKey) occupant = id;
  });
  if (occupant) {
    if (oldTarget) store.set(occupant, oldTarget);
    else store.delete(occupant);
  }
  store.set(imageId, { group_key: groupKey, channel_key: channelKey });
  refreshLayoutInputs();
  commitHistory();
  persistCurrentJob();
}

function imageForSlot(groupKey, channelKey) {
  let id = "";
  activeAssignmentStore().forEach((target, imageId) => {
    if (target.group_key === groupKey && target.channel_key === channelKey) id = imageId;
  });
  return id ? imageById(id) : null;
}

function imageById(id) {
  return currentJob?.images.find((image) => imageKey(image) === id) || null;
}

function imageKey(image) {
  return String(image.image_id || image.relative_path || image.filename);
}

function slotKey(target) {
  return `${target.group_key}\u0000${target.channel_key}`;
}

function moveImageBefore(sourceId, targetId) {
  const from = imageOrder.indexOf(sourceId);
  let to = imageOrder.indexOf(targetId);
  if (from < 0 || to < 0) return;
  imageOrder.splice(from, 1);
  if (from < to) to -= 1;
  imageOrder.splice(to, 0, sourceId);
  renderImageGallery();
  commitHistory();
  persistCurrentJob();
}

function moveImageBy(imageId, delta) {
  const index = imageOrder.indexOf(imageId);
  const target = clampInteger(index + delta, 0, imageOrder.length - 1);
  if (index < 0 || index === target) return;
  imageOrder.splice(index, 1);
  imageOrder.splice(target, 0, imageId);
  renderImageGallery();
  imageGalleryEl.querySelector(`[data-image-card="${cssEscape(imageId)}"]`)?.focus();
  commitHistory();
}

function clearDropTargets() {
  document.querySelectorAll(".is-drop-target").forEach((node) => node.classList.remove("is-drop-target"));
}

function ensureIhcRois(groups) {
  groups.forEach((group) => {
    if (!ihcRois.has(group.key)) ihcRois.set(group.key, [...defaultRoi]);
  });
}

function updateRoiGroupSelect(groups) {
  const selected = ihcRoiGroupEl.value;
  ihcRoiGroupEl.innerHTML = groups.map((group, index) => `<option value="${escapeHtml(group.key)}">${escapeHtml(groupLabelText(group.key) || `第 ${index + 1} 组`)}</option>`).join("");
  ihcRoiGroupEl.value = groups.some((group) => group.key === selected) ? selected : groups[0]?.key || "";
  syncRoiInputs(ihcRoiGroupEl.value);
}

function roiForGroup(groupKey) {
  return ihcRois.get(groupKey) || [...defaultRoi];
}

function normalizedRoiFromInputs() {
  const w = clamp(Number(ihcRoiWEl.value) || defaultRoi[2], 0.05, 1);
  const h = clamp(Number(ihcRoiHEl.value) || defaultRoi[3], 0.05, 1);
  const x = clamp(Number(ihcRoiXEl.value) || 0, 0, 1 - w);
  const y = clamp(Number(ihcRoiYEl.value) || 0, 0, 1 - h);
  return [x, y, w, h];
}

function syncRoiInputs(groupKey) {
  if (!groupKey) return;
  const roi = roiForGroup(groupKey);
  [ihcRoiXEl, ihcRoiYEl, ihcRoiWEl, ihcRoiHEl].forEach((input, index) => { input.value = roi[index].toFixed(3); });
}

function setRoiStyle(element, [x, y, w, h]) {
  element.style.left = `${x * 100}%`;
  element.style.top = `${y * 100}%`;
  element.style.width = `${w * 100}%`;
  element.style.height = `${h * 100}%`;
}

function startRoiPointer(event) {
  const roi = event.target.closest(".ihc-roi");
  if (!roi || event.button !== 0) return;
  event.preventDefault();
  const cell = roi.parentElement;
  roiPointer = {
    pointerId: event.pointerId,
    roi,
    groupKey: roi.dataset.roiGroup,
    resizing: event.target.classList.contains("roi-resize-handle"),
    startX: event.clientX,
    startY: event.clientY,
    startRoi: [...roiForGroup(roi.dataset.roiGroup)],
    rect: cell.getBoundingClientRect(),
  };
  roi.setPointerCapture(event.pointerId);
}

function moveRoiPointer(event) {
  if (!roiPointer || event.pointerId !== roiPointer.pointerId) return;
  const dx = (event.clientX - roiPointer.startX) / Math.max(roiPointer.rect.width, 1);
  const dy = (event.clientY - roiPointer.startY) / Math.max(roiPointer.rect.height, 1);
  let [x, y, w, h] = roiPointer.startRoi;
  if (roiPointer.resizing) {
    w = clamp(w + dx, 0.05, 1 - x);
    h = clamp(h + dy, 0.05, 1 - y);
  } else {
    x = clamp(x + dx, 0, 1 - w);
    y = clamp(y + dy, 0, 1 - h);
  }
  const next = [x, y, w, h];
  ihcRois.set(roiPointer.groupKey, next);
  setRoiStyle(roiPointer.roi, next);
  if (ihcRoiGroupEl.value === roiPointer.groupKey) syncRoiInputs(roiPointer.groupKey);
}

function finishRoiPointer(event) {
  if (!roiPointer || event.pointerId !== roiPointer.pointerId) return;
  if (roiPointer.roi.hasPointerCapture(event.pointerId)) roiPointer.roi.releasePointerCapture(event.pointerId);
  roiPointer = null;
  commitHistory();
  persistCurrentJob();
}

function nudgeRoi(event) {
  const roi = event.target.closest(".ihc-roi");
  if (!roi || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
  event.preventDefault();
  let [x, y, w, h] = roiForGroup(roi.dataset.roiGroup);
  const amount = event.altKey ? 0.001 : 0.01;
  const horizontal = event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0;
  const vertical = event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0;
  if (event.shiftKey) {
    w = clamp(w + horizontal, 0.05, 1 - x);
    h = clamp(h + vertical, 0.05, 1 - y);
  } else {
    x = clamp(x + horizontal, 0, 1 - w);
    y = clamp(y + vertical, 0, 1 - h);
  }
  const next = [x, y, w, h];
  ihcRois.set(roi.dataset.roiGroup, next);
  setRoiStyle(roi, next);
  if (ihcRoiGroupEl.value === roi.dataset.roiGroup) syncRoiInputs(roi.dataset.roiGroup);
  commitHistory();
}

function calculateCalibration() {
  const pixels = Number(calibrationPixelsEl.value);
  const microns = Number(calibrationMicronsEl.value);
  if (!(pixels > 0) || !(microns > 0)) {
    calibrationStatusEl.textContent = "请填写大于 0 的像素长度和实际长度。";
    return;
  }
  const result = pixels / microns;
  const high = calibrationTargetEl.value === "high";
  (high ? highPixelsPerMicronEl : pixelsPerMicronEl).value = result.toFixed(4);
  calibrationStatusEl.textContent = `已标定${high ? " IHC 高倍" : " IF / IHC 低倍"}：${result.toFixed(4)} px/µm。请确认同一通道内的倍率、相机和采集设置一致。`;
  refreshLayoutInputs();
  commitHistory();
}

function applyProfileDefaults() {
  const preset = profileDefaults[exportProfileEl.value];
  const custom = exportProfileEl.value === "custom";
  exportWidthEl.readOnly = !custom;
  exportHeightEl.readOnly = !custom;
  if (preset) {
    exportWidthEl.value = preset[0];
    exportHeightEl.value = preset[1];
    exportDpiEl.value = String(preset[2]);
  }
}

function captureState(settingsOnly = false) {
  const controls = {};
  stateControlIds.forEach((id) => {
    const input = byId(id);
    controls[id] = input.type === "checkbox" ? input.checked : input.value;
  });
  const channelState = {};
  channelFormState().forEach((value, key) => { channelState[key] = value; });
  channelMemory.forEach((value, key) => { if (!(key in channelState)) channelState[key] = value; });
  const state = { controls, channel_state: channelState };
  if (settingsOnly) return state;
  const groupState = {};
  groupFormState().forEach((value, key) => { groupState[key] = value; });
  groupMemory.forEach((value, key) => { if (!(key in groupState)) groupState[key] = value; });
  state.group_state = groupState;
  state.image_order = [...imageOrder];
  state.assignment_stores = Object.fromEntries(Object.entries(assignmentStores).map(([key, store]) => [key, Array.from(store.entries())]));
  state.ihc_rois = Array.from(ihcRois.entries());
  return state;
}

function applyState(state) {
  if (!state || typeof state !== "object") return;
  historyRestoring = true;
  try {
    Object.entries(state.controls || {}).forEach(([id, value]) => {
      const input = byId(id);
      if (!input) return;
      if (input.type === "checkbox") input.checked = Boolean(value);
      else input.value = String(value);
    });
    channelMemory.clear();
    Object.entries(state.channel_state || {}).forEach(([key, value]) => channelMemory.set(key, value));
    if (state.group_state) {
      groupMemory.clear();
      Object.entries(state.group_state).forEach(([key, value]) => groupMemory.set(key, value));
    }
    if (state.image_order && currentJob) {
      const validIds = new Set(currentJob.images.map(imageKey));
      imageOrder = state.image_order.filter((id) => validIds.has(id));
      currentJob.images.map(imageKey).forEach((id) => { if (!imageOrder.includes(id)) imageOrder.push(id); });
    }
    if (state.assignment_stores) {
      assignmentStores = { "if-auto": new Map(), "if-manual": new Map(), ihc: new Map() };
      Object.entries(state.assignment_stores).forEach(([key, entries]) => { assignmentStores[key] = new Map(entries); });
    }
    if (state.ihc_rois) ihcRois = new Map(state.ihc_rois);
    ifLayoutMode = figureTypeEl.value === "if" ? layoutModeEl.value : ifLayoutMode;
    ifGroupCount = figureTypeEl.value === "if" ? groupCountEl.value : ifGroupCount;
    ifImagesPerGroup = figureTypeEl.value === "if" ? imagesPerGroupEl.value : ifImagesPerGroup;
    ifRowsPerSlide = figureTypeEl.value === "if" ? rowsPerSlideEl.value : ifRowsPerSlide;
    applyProfileDefaultsReadonlyOnly();
    updateFigureTypeControls();
    updateManualControls();
    syncExportButton();
    if (currentJob) refreshLayoutInputs();
  } finally {
    historyRestoring = false;
  }
}

function applyProfileDefaultsReadonlyOnly() {
  const custom = exportProfileEl.value === "custom";
  exportWidthEl.readOnly = !custom;
  exportHeightEl.readOnly = !custom;
}

function resetHistory() {
  history = currentJob ? [captureState()] : [];
  redoHistory = [];
  syncHistoryButtons();
}

function commitHistorySoon() {
  clearTimeout(historyTimer);
  historyTimer = setTimeout(commitHistory, 80);
}

function commitHistory() {
  if (!currentJob || historyRestoring) return;
  clearTimeout(historyTimer);
  const state = captureState();
  const serialized = JSON.stringify(state);
  if (history.length && JSON.stringify(history[history.length - 1]) === serialized) return;
  history.push(state);
  if (history.length > 50) history.shift();
  redoHistory = [];
  syncHistoryButtons();
}

function undo() {
  if (history.length < 2 || operationBusy) return;
  redoHistory.push(history.pop());
  applyState(history[history.length - 1]);
  syncHistoryButtons();
  persistCurrentJob();
}

function redo() {
  if (!redoHistory.length || operationBusy) return;
  const state = redoHistory.pop();
  history.push(state);
  applyState(state);
  syncHistoryButtons();
  persistCurrentJob();
}

function syncHistoryButtons() {
  undoBtn.disabled = operationBusy || history.length < 2;
  redoBtn.disabled = operationBusy || !redoHistory.length;
}

function loadTemplates() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TEMPLATE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTemplate() {
  const name = window.prompt("模板名称", `设置 ${new Date().toLocaleDateString("zh-CN")}`)?.trim();
  if (!name) return;
  const templates = loadTemplates();
  const existing = templates.find((item) => item.name === name);
  const entry = { id: existing?.id || `${Date.now()}`, name, state: captureState(true), updated_at: new Date().toISOString() };
  const next = [...templates.filter((item) => item.id !== entry.id), entry].slice(-20);
  localStorage.setItem(TEMPLATE_KEY, JSON.stringify(next));
  renderTemplateOptions(entry.id);
  statusEl.textContent = `已在本机保存模板“${name}”`;
}

function renderTemplateOptions(selected = "") {
  const templates = loadTemplates();
  templateSelectEl.innerHTML = '<option value="">设置模板…</option>' + templates.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("");
  templateSelectEl.value = selected;
}

function applySelectedTemplate() {
  const template = loadTemplates().find((item) => item.id === templateSelectEl.value);
  if (!template) return;
  applyState(template.state);
  commitHistory();
  statusEl.textContent = `已应用模板“${template.name}”`;
}

function persistCurrentJob() {
  if (!currentJob) return;
  try {
    sessionStorage.setItem(SESSION_JOB_KEY, JSON.stringify(currentJob));
    sessionStorage.setItem(SESSION_STATE_KEY, JSON.stringify(captureState()));
  } catch {
    // Session recovery is optional; upload/export still work if storage is unavailable.
  }
}

function persistSessionSoon() {
  if (!currentJob) return;
  setTimeout(persistCurrentJob, 100);
}

function restoreSessionJob() {
  try {
    const data = JSON.parse(sessionStorage.getItem(SESSION_JOB_KEY) || "null");
    if (!data || typeof data.job_id !== "string" || !Array.isArray(data.images) || !Array.isArray(data.groups) || !Array.isArray(data.channels)) return;
    currentJob = data;
    initializeJobState(data);
    const savedState = JSON.parse(sessionStorage.getItem(SESSION_STATE_KEY) || "null");
    if (savedState) applyState(savedState);
    else {
      groupCountEl.value = String(Math.max(data.groups.length, 1));
      imagesPerGroupEl.value = String(Math.max(data.channels.length, 1));
      rowsPerSlideEl.value = String(Math.min(Math.max(data.groups.length, 1), 6));
      rememberIfLayoutState();
      refreshLayoutInputs();
    }
    resetHistory();
    statusEl.textContent = `已恢复本标签页的上次任务：${data.image_count || data.images.length} 张图`;
    summaryEl.textContent = "已恢复上次预览；若服务器重启后图片失效，请重新上传。";
  } catch {
    sessionStorage.removeItem(SESSION_JOB_KEY);
    sessionStorage.removeItem(SESSION_STATE_KEY);
  }
}

function setSelectedFiles(files) {
  if (operationBusy) {
    statusEl.textContent = "当前操作完成后再选择新图片";
    return;
  }
  const candidates = Array.from(files);
  selectedFiles = candidates.filter((file) => supportedImagePattern.test(file.name)).sort((a, b) => fileDisplayName(a).localeCompare(fileDisplayName(b), "zh-CN", { numeric: true }));
  const skipped = candidates.length - selectedFiles.length;
  const totalBytes = selectedFiles.reduce((sum, file) => sum + file.size, 0);
  const names = selectedFiles.slice(0, 3).map((file) => file.name).join("、");
  const more = selectedFiles.length > 3 ? ` 等 ${selectedFiles.length} 张` : "";
  fileSummaryEl.textContent = selectedFiles.length
    ? `${selectedFiles.length} 张 · ${formatBytes(totalBytes)}${skipped ? ` · 已忽略 ${skipped} 个不支持的文件` : ""} · ${names}${more}`
    : candidates.length ? "所选内容中没有支持的 TIFF、PNG、JPG 或 BMP 图片。" : "可选择整个文件夹，或一次多选图片。";
  uploadBtn.disabled = selectedFiles.length === 0;
  currentJob = null;
  imageOrder = [];
  assignmentStores = { "if-auto": new Map(), "if-manual": new Map(), ihc: new Map() };
  sessionStorage.removeItem(SESSION_JOB_KEY);
  sessionStorage.removeItem(SESSION_STATE_KEY);
  channelPanel.hidden = true;
  groupPanel.hidden = true;
  imageLibraryPanel.hidden = true;
  progressPanel.hidden = true;
  previewEl.className = "preview empty";
  previewEl.innerHTML = '<div class="empty-text">上传后会在这里显示内容预览。</div>';
  statusEl.textContent = selectedFiles.length ? `已选择 ${selectedFiles.length} 张图片，等待上传` : "尚未选择图片";
  resetHistory();
  syncJobActions();
}

function setBusy(isBusy, message) {
  operationBusy = isBusy;
  uploadBtn.disabled = isBusy || selectedFiles.length === 0;
  folderInput.disabled = isBusy;
  fileInput.disabled = isBusy;
  folderInput.parentElement.setAttribute("aria-disabled", String(isBusy));
  fileInput.parentElement.setAttribute("aria-disabled", String(isBusy));
  uploadBtn.setAttribute("aria-busy", String(isBusy));
  exportBtn.setAttribute("aria-busy", String(isBusy));
  if (message) statusEl.textContent = message;
  syncJobActions();
  syncHistoryButtons();
}

function syncJobActions() {
  [exportBtn, preflightBtn, projectExportBtn, complianceExportBtn].forEach((button) => { button.disabled = operationBusy || !currentJob; });
}

function syncExportButton() {
  exportBtn.textContent = `导出 ${exportFormatEl.value.toUpperCase()}`;
}

function rememberIfLayoutState() {
  ifLayoutMode = layoutModeEl.value;
  ifGroupCount = groupCountEl.value;
  ifImagesPerGroup = imagesPerGroupEl.value;
  ifRowsPerSlide = rowsPerSlideEl.value;
}

function updateManualControls() {
  const manual = layoutModeEl.value === "manual" || figureTypeEl.value === "ihc";
  document.querySelectorAll(".manual-only").forEach((node) => { node.hidden = !manual; });
}

function updateFigureTypeControls() {
  const ihc = figureTypeEl.value === "ihc";
  ihcSettingsEl.hidden = !ihc;
  highCalibrationFieldEl.hidden = !ihc;
  calibrationTargetEl.querySelector('option[value="high"]').hidden = !ihc;
  if (!ihc && calibrationTargetEl.value === "high") calibrationTargetEl.value = "default";
  rowsPerSlideEl.querySelectorAll("option").forEach((option) => { option.disabled = ihc && Number(option.value) > 4; });
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

function channelFormState() {
  const labels = new Map(Array.from(document.querySelectorAll("[data-channel-label]")).map((input) => [input.dataset.channelLabel, input.value]));
  return new Map(Array.from(document.querySelectorAll("[data-channel-check]")).map((input) => [input.value, { checked: input.checked, label: labels.get(input.value) ?? input.value }]));
}

function groupFormState() {
  return new Map(Array.from(document.querySelectorAll("[data-group-label]")).map((input) => [input.dataset.groupLabel, input.value]));
}

function shownChannels(channels) {
  const settings = channelFormState();
  return channels.map((channel) => ({ ...channel, previewLabel: settings.get(channel.key)?.label || defaultLabels[channel.key] || channel.label || channel.key })).filter((channel) => settings.get(channel.key)?.checked !== false);
}

function missingSlotCount() {
  const selected = figureTypeEl.value === "ihc" ? new Set(["low", "high"]) : new Set(Array.from(document.querySelectorAll("[data-channel-check]:checked")).map((input) => input.value));
  let missing = 0;
  activeGroups.forEach((group) => activeChannels.filter((channel) => selected.has(channel.key)).forEach((channel) => { if (!imageForSlot(group.key, channel.key)) missing += 1; }));
  return missing;
}

function duplicateFilenames() {
  if (!currentJob) return [];
  const counts = new Map();
  currentJob.images.forEach((image) => counts.set(image.filename, (counts.get(image.filename) || 0) + 1));
  return Array.from(counts).filter(([, count]) => count > 1).map(([name]) => name);
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
        setProgress(percent, "上传中", `${formatBytes(event.loaded)} / ${formatBytes(event.total)} (${percent}%)`);
      } else setProgress(8, "上传中", `${formatBytes(event.loaded)} 已上传`);
    });
    xhr.upload.addEventListener("load", () => {
      uploadFinishedAt = performance.now();
      cancelUploadBtn.hidden = true;
      setProgress(100, "服务器处理中", "上传完成，正在生成预览和分组；此阶段无法取消...");
    });
    xhr.addEventListener("load", () => {
      const data = xhr.response && typeof xhr.response === "object" ? xhr.response : {};
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error || `上传失败：HTTP ${xhr.status}`));
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
  const uploadSeconds = uploadFinishedAt ? (uploadFinishedAt - uploadStartedAt) / 1000 : 0;
  const serverSeconds = Number(data.server_processing_seconds || 0);
  setProgress(100, "完成", `上传 ${uploadSeconds.toFixed(1)}s，服务器处理 ${serverSeconds.toFixed(1)}s，总计 ${totalSeconds.toFixed(1)}s`);
  stopProgressTimer();
  elapsedTextEl.textContent = `${totalSeconds.toFixed(1)}s`;
}

function setProgress(percent, phase, detail) {
  const value = clamp(percent, 0, 100);
  phaseTextEl.textContent = phase;
  progressBarEl.style.width = `${value}%`;
  progressTrackEl.setAttribute("aria-valuenow", String(Math.round(value)));
  progressTrackEl.setAttribute("aria-valuetext", `${phase}：${detail}`);
  progressDetailEl.textContent = detail;
  updateElapsedText();
}

function updateElapsedText() {
  if (progressStartedAt) elapsedTextEl.textContent = `${elapsedSeconds(progressStartedAt).toFixed(1)}s`;
}

function stopProgressTimer() {
  if (progressTimer) window.clearInterval(progressTimer);
  progressTimer = null;
}

function elapsedSeconds(startedAt) {
  return (performance.now() - startedAt) / 1000;
}

function fileDisplayName(file) {
  return file.webkitRelativePath || file.name;
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
  try { return JSON.parse(text || "{}"); } catch { return {}; }
}

function clamp(value, min, max) {
  const number = Number(value);
  return Math.min(Math.max(Number.isFinite(number) ? number : min, min), max);
}

function clampInteger(value, min, max) {
  return Math.round(clamp(value, min, max));
}

function formatNumber(value) {
  return Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 3 });
}

function shortGroupName(value) {
  const parts = String(value).split("/");
  return parts[parts.length - 1] || value;
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function cssEscape(value) {
  return window.CSS?.escape ? CSS.escape(value) : String(value).replaceAll('"', '\\"');
}

syncExportButton();
applyProfileDefaultsReadonlyOnly();
updateFigureTypeControls();
updateManualControls();
renderTemplateOptions();
restoreSessionJob();
syncJobActions();
