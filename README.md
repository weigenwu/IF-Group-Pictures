# 实验室工作台 · IF / IHC 组图

本仓库只维护需要 Python 服务器处理的 IF 荧光 / IHC 组化组图应用。页面使用实验室统一品牌和跨站导航连接计算器门户与 WB 主站；三个应用保持各自适合的数据处理边界，不使用 iframe，也不复制彼此的功能代码。

## 工作台入口

- `https://weigenwu.github.io/ikun-calculator/`：实验室统一入口与计算器，本地计算
- `https://weigenwu.github.io/wb/#studio`：唯一维护的 WB 组图与灰度应用，原图仅在浏览器本地处理
- `/`：IF / IHC 组图，图片上传至当前服务器处理
- `/wb` 与 `/wb/`：兼容旧书签，直接跳转到上述 WB 主站
- `/wb-migrate`：仅用于导出曾保存在当前 Render 域名 IndexedDB 中的旧 WB 自动保存项目；它只读 `blotboard-wb / projects / current`，不包含 WB 编辑或分析功能

如需迁移旧项目，必须使用当时保存项目的同一浏览器打开 Render 站点的 `/wb-migrate`，下载 `.wb-project` 后再到 WB 主站选择“导入项目文件”。迁移页不会上传或改写旧数据。

荧光 / IHC 原图与导出文件位于 Render 临时文件系统。应用会在后续上传时清理超过 24 小时的数据，平台重启或重新部署也可能提前清除；请仅上传允许交由服务器处理的数据。

## 功能

- 文件夹批量上传
- IF 模式：自动识别 `ch00 / ch01 / ch02 / Merged`，或手动设置组别数量和每组图片数
- 图片可按稳定的 `image_id` 拖动重排，并由同一份分配表驱动预览、PPTX 和位图导出
- IHC 模式：按“低倍图 + 高倍图”成对排版，每组可独立设置 ROI 方框和连接线
- 顶部 marker 或倍率列名可编辑
- 侧边组别名称可编辑
- 白底/黑底切换
- 图片方形裁切或完整保留
- 上传进度、上传耗时和服务器处理耗时显示
- 支持选择文件夹或多选图片、取消上传、标签实时预览与标签页内任务恢复
- Nature 单栏（89 mm）、双栏（183 mm）和自定义最终尺寸，支持 300/600 DPI
- 经像素/微米标定的可编辑比例尺（PPTX）和烧录比例尺（位图）
- 导出 `PPTX / PNG / JPG / PDF / TIFF`，图中文字统一使用 Arial（服务器无 Arial 时使用兼容无衬线字体）
- 导出前科学预检；阻断无效映射、规格或比例尺校准
- 上传时记录原图尺寸、格式、位深、文件大小和 SHA-256
- 一键导出便携项目/合规 ZIP，包含未修改原图、设置、预检结果和校验清单

## 科学工作流接口

- `POST /api/preflight`：提交与导出相同的 JSON，返回 `ok`、`errors`、`warnings` 和解析后的输出规格
- `POST /api/export`：预检无阻断项后生成图版；`export_format` 支持 `pptx/png/jpg/pdf/tif/tiff`
- `POST /api/project/export`：随时保存便携项目 ZIP；即使预检未通过也会保留当前设置与预检报告
- `POST /api/compliance/export`：预检通过后生成合规 ZIP，包含未修改原图、项目设置、校验清单与最终导出图版

新工作流使用 `group_order` 与 `assignments: [{image_id, group_key, channel_key}]` 统一指定组别顺序和图片位置。IHC 的逐组 ROI 使用 `ihc_rois: [{group_key, x, y, w, h}]`，坐标范围为 0–1。比例尺需要同时提交 `scale_bar` 和可靠的 `calibrations`；IHC 的 `low`、`high` 通道必须分别提供像素/微米校准，未完整校准的比例尺不会进入正式导出。

## 本地运行

```bash
pip install -r requirements.txt
python app.py
```

打开：

```text
http://127.0.0.1:5055/       # 荧光 / IHC
http://127.0.0.1:5055/wb     # 跳转到 WB 主站
```

## IF 文件命名建议

自动识别模式建议使用类似命名：

```text
HIBEC_ch00.tif
HIBEC_ch01.tif
HIBEC_ch02.tif
HIBEC_Merged.tif
RBE_ch00.tif
RBE_ch01.tif
RBE_ch02.tif
RBE_Merged.tif
```

如果文件名不固定，使用“手动数量”模式更稳定。程序会按文件顺序填入网格。

## IHC 文件顺序建议

IHC 模式下每组默认两张图，按文件顺序填入：

```text
第1张 -> 第1组低倍
第2张 -> 第1组高倍
第3张 -> 第2组低倍
第4张 -> 第2组高倍
```

## 部署说明

当前版本需要 Python 后端处理 TIFF、生成 PPTX/PDF，所以不能直接作为 GitHub Pages 静态网页运行。GitHub 仓库适合作为源码仓库，再连接 Render、Railway、Hugging Face Spaces 或其他支持 Python Web 服务的平台部署。

Render 可用启动命令：

```bash
gunicorn app:app --bind 0.0.0.0:$PORT --timeout 300
```

开发环境已安装 Playwright 与 Edge 时，可运行 `node tests/e2e-shell.cjs` 验证移动端壳层和 IndexedDB 旧项目迁移下载；可通过 `PYTHON`、`BROWSER_EXECUTABLE` 和 `TEST_PORT` 指定本机路径与端口。
