# 组图神器

支持 IF 荧光图和 IHC 组化图，选择整个文件夹后自动生成论文组图版式，并导出为 `PPTX / PNG / JPG / PDF`。

## 功能

- 文件夹批量上传
- IF 模式：自动识别 `ch00 / ch01 / ch02 / Merged`，或手动设置组别数量和每组图片数
- IHC 模式：按“低倍图 + 高倍图”成对排版，自动绘制 ROI 方框和连接线
- 顶部 marker 或倍率列名可编辑
- 侧边组别名称可编辑
- 白底/黑底切换
- 图片方形裁切或完整保留
- 上传进度、上传耗时和服务器处理耗时显示
- 导出 `PPTX / PNG / JPG / PDF`

## 本地运行

```bash
pip install -r requirements.txt
python app.py
```

打开：

```text
http://127.0.0.1:5055/
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
