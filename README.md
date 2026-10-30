# 双环取色

一个把「屏幕取色」和「颜料调色」放在同一块界面上的取色工具：**光色环**用加色规则（红↔青），**颜料环**用 RYB 规则（红↔绿），同一颜色在两套坐标里各有一个位置；取到的色可以存成色卡，并和参照色比对「色相/明度/彩度差多少」。

目标是**相对位置与相对差异**，不是绝对数值——数值折叠在详情里。

## 现在能做什么

- 空心色相环（光 / 颜料双模式，一键切换），只负责色相
- 饱和度、明度两条独立滑杆，轨道颜色随选色实时变化；**滑杆上也有参照色的刻度**
- **导入图片取色**：多张图片、双指缩放、拖动平移、双击复位、点按取色、长按放大镜、1×1/3×3/5×5 取样
- **精调模式**：长按不好使时，点「精调」进入，放大镜常驻，按住拖动微调
- 点色块选参照（色卡 / 11 个预设 / 手输 HEX 或 RGB），环上三角指针 + 夹角弧线，滑杆上同步显示位置
- 色卡：加入、改名、拖拽排序、删除并撤销
- **历史记录**：「保存」把当前图片与色卡存成一条；「历史」里可恢复或删除

## 关于保存

**图片和色卡不会自动保存**——每次打开都是干净的，这是刻意的：避免"上次残留的半成品"混进新工作。

要留存就点色卡右上角的「保存」，它会连同图片一起存进历史记录。存储用的是浏览器 localStorage（约 5 MB），图片会先压到 1600px / JPEG 78% 再存，所以**恢复出来的图会比原图糊一点**，但取色精度足够。

## 三种打开方式

| 方式 | 说明 |
| --- | --- |
| 双击 `双环取色.html` | 单文件版，不需要 Python 和服务，断网可用 |
| 双击 `双环取色.exe` | 静默起本地服务并打开浏览器；需要本机 Python 3.12 |
| `启动取色.bat` | 带控制台，出问题看这里的报错 |

停止服务：`停止取色.bat`（或关掉 bat 窗口）。

## 常用命令

```bash
# 起本地服务（PC）
python -m colorpick --port 8766 --open

# 重新生成单文件 HTML
python tools/build_single.py

# 重新编译启动器 exe（用系统自带 .NET 编译器，不需要联网）
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /nologo /target:winexe ^
  /codepage:65001 /r:System.Windows.Forms.dll /out:双环取色.exe tools\launcher.cs

# 数学一致性验证（JS 内核 vs Python 参考实现，1900+ 项）
python tests/gen_golden.py
node tests/check_color.js
```

## 目录

```
colorpick/
  __main__.py      本地服务（标准库 http.server，8766）
  web/             前端：index.html / style.css / color.js / imageview.js / app.js
android/
  app/             WebView 壳（MainActivity.java）+ 固定签名 keystore
docs/
  PRD-v1.0.md      产品需求（单一事实来源）
  设计方案-色彩模型与比较.md   双环模型的推导与实测数据
  技术方案-框架选型.md        为什么用 Chaquopy + WebView
  PRD-取色App.md   最早的版本，已归档
preview/
  gen_previews.py  色环渲染脚本（也是色彩数学的参考实现）
  01~05*.png       方案对比图
  proto-*.png      原型截图
tests/
  gen_golden.py    生成 golden 向量
  check_color.js   逐项比对
tools/
  build_single.py  打单文件 HTML
  launcher.cs      启动器源码
```

## 四个关键决策

1. **两个环不是"加色/减色"，是"光的混合"与"颜料的混合"**。真正的减色 CMY 补色关系与 RGB 完全相同，做成第二个环等于白做。
2. **颜料环用色相轴重排，不用 RYB 立方体**。立方体只覆盖 40% 的 sRGB（中位误差 ΔE 4.3），"从图取色再定位"会失效。
3. **环只给色相，饱和度/明度独立成条**。半径兼职饱和度时，圆心附近几乎选不准。
4. **比较口径**：色相用当前环的角差（±3°），明度用 L*（±2），彩度用 OKLCH C（±0.015），总差用 ΔE00 兜底。
