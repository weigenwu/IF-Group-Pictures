(() => {
  "use strict";

  const DB_NAME = "blotboard-wb";
  const STORE_NAME = "projects";
  const RECORD_KEY = "current";
  const button = document.querySelector("#exportLegacyProject");
  const status = document.querySelector("#migrateStatus");

  function openExistingDatabase() {
    return new Promise((resolve, reject) => {
      let missing = false;
      const request = indexedDB.open(DB_NAME);
      request.onupgradeneeded = () => {
        missing = true;
        request.transaction.abort();
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error(missing ? "此浏览器中没有旧 WB 自动保存项目。" : "无法读取旧 WB 项目数据库。"));
      request.onblocked = () => reject(new Error("旧 WB 数据库正被其他页面占用，请关闭旧页面后重试。"));
    });
  }

  async function readSnapshot() {
    if (!window.indexedDB) throw new Error("当前浏览器不支持 IndexedDB，无法读取旧项目。");
    const db = await openExistingDatabase();
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      db.close();
      throw new Error("旧 WB 数据库中没有 projects 存储区。");
    }
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(RECORD_KEY);
      let record;
      request.onsuccess = () => { record = request.result; };
      request.onerror = () => reject(new Error("读取旧 WB 自动保存记录失败。"));
      transaction.oncomplete = () => {
        db.close();
        if (!record?.snapshot) reject(new Error("未找到 current 自动保存记录。"));
        else resolve(record.snapshot);
      };
      transaction.onerror = () => { db.close(); reject(new Error("读取旧 WB 自动保存记录失败。")); };
      transaction.onabort = () => { db.close(); reject(new Error("读取旧 WB 自动保存记录已中止。")); };
    });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("原始图片编码失败。"));
      reader.readAsDataURL(blob);
    });
  }

  async function convertSources(entries, label) {
    const portable = [];
    for (const entry of entries || []) {
      if (!entry?.source) {
        portable.push(entry);
        continue;
      }
      const { blob, ...source } = entry.source;
      if (blob instanceof Blob) portable.push({ ...entry, source: { ...source, dataUrl: await blobToDataUrl(blob) } });
      else if (typeof source.dataUrl === "string") portable.push(entry);
      else throw new Error(`${label}缺少可迁移的原图数据。`);
    }
    return portable;
  }

  async function makePortable(snapshot) {
    if (!snapshot || snapshot.kind !== "blotboard-project" || ![1, 2].includes(snapshot.version)) throw new Error("旧记录不是兼容的 WB 项目。");
    return {
      ...snapshot,
      rows: await convertSources(snapshot.rows, "条带行"),
      panels: await convertSources(snapshot.panels, "多面板"),
      savedAt: new Date().toISOString(),
    };
  }

  function downloadProject(project) {
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/T/, "_").slice(0, 15);
    const blob = new Blob([JSON.stringify(project)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `wb-migrated-${stamp}.wb-project`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  button.addEventListener("click", async () => {
    button.disabled = true;
    status.textContent = "正在读取并打包旧项目，请勿关闭页面…";
    try {
      const project = await makePortable(await readSnapshot());
      downloadProject(project);
      status.textContent = "迁移文件已下载。现在可前往 WB 主站导入。";
    } catch (error) {
      status.textContent = error.message || "迁移失败，请确认正在使用保存过旧项目的浏览器。";
    } finally {
      button.disabled = false;
    }
  });
})();
