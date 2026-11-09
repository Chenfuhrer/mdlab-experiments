# 模电虚拟实验室 · Analog Lab

《低频（模拟）电子线路实验》的浏览器端虚拟实验台。打开网页就能做实验：在原理图上点节点接探头、拖滑块改参数，示波器、万用表、扫频仪实时显示结果。教案中的每一张数据表都可以一键仿真测量，并和 ngspice 的结果对照。

纯静态网站，没有后端，也不需要构建步骤。

## 实验内容

| 编号 | 实验 | 实验台上能做什么 |
|---|---|---|
| P | 元器件识别与仪器使用 | 信号源"高阻 / 50 Ω"设置对读数的影响，色环电阻读数器 |
| 1 | 单级共射放大电路（I） | 静态工作点、Au、相位；改 R4、R5 和 C3 位置；幅频特性 |
| 2 | 单级共射放大电路（II） | 带载 Au、Ro、Ri 测量；Q 点偏高/偏低时的饱和与截止失真 |
| 3 | 运放：比例、求和 | 跟随器、反相、同相、求和、加减；输出摆幅削顶 |
| 4 | 运放：积分、微分 | 正弦 ±90°、方波转三角波和尖脉冲；积分漂移、微分振铃 |
| 5 | 运放：有源滤波器 | Sallen-Key 低通/高通，Rf 对 Q 和截止频率的影响 |

## 本地打开

直接双击 `index.html` 即可（公式渲染和字体需要联网加载 CDN，断网时会退回系统字体，公式显示为源码）。

也可以起一个本地服务器：

```bash
python3 -m http.server 8000
```

然后访问 <http://localhost:8000>。

在线版本：<https://chenfuhrer.github.io/mdlab-experiments/>

## 部署到 GitHub Pages

1. 把本目录推送到一个 GitHub 仓库的 `main` 分支。
2. 在仓库的 **Settings → Pages** 中，Source 选 **Deploy from a branch**，Branch 选 `main`，目录选 `/ (root)`。
3. 等一两分钟，访问 `https://<用户名>.github.io/<仓库名>/`。

仓库里已经放了 `.nojekyll`，GitHub 会原样发布文件。

## 仿真引擎

代码在 `js/engine.js`，是一个手写的电路仿真器：

- 改进节点分析法（MNA）+ Newton-Raphson 迭代，并带 pn 结电压限幅和电源步进
- 瞬态分析使用定步长 Gear-2（BDF2）；交流小信号分析在工作点处线性化
- 器件模型：2N5551 用 Gummel-Poon 模型，LM358 用行为级宏模型（Aol 100 dB、GBW 0.68 MHz、SR 0.3 V/µs）

### 精度校验

```bash
node tools/validate.js --full
```

这条命令在 Node.js 里重算 95 个工况，再与 `data/reference.json` 里的 ngspice-47 结果对比。目前的最大相对偏差是 **0.18%**，明细见 `data/validation.json`，网站首页也有展示。ngspice 网表在 `spice/` 目录。

已知局限：

- BJT 模型没有结电容，所以 MHz 级的高频响应不准确。
- LM358 宏模型不含交越失真。

这两点都不影响课程的测试频率。实测与仿真之间的偏差主要会来自器件参数的离散性，例如 β。

## 目录结构

```
index.html            首页
lab.html              实验页（?e=p|1|2|3|4|5）
css/                  样式
js/engine.js          仿真引擎
js/circuits.js        各实验电路网表与测量流程
js/schematics.js      原理图 SVG（可点击探头）
js/instruments.js     示波器、扫频仪
js/experiments.js     实验台配置与教案数据表
js/content.js         原理讲解、易错点、思考题
data/                 ngspice 参考结果与校验结果
spice/                ngspice 模型与网表
downloads/            PDF 版实验报告与教程解析
tools/                校验脚本、数据打包脚本、原理图图库
```

## 说明

本站所有数据都是电路仿真结果，用于预习和对照。课程报告请以实验室的实测数据为准。标注［待核对］的内容依赖具体仪器型号，未经核实。
