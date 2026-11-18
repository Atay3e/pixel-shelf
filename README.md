# 像素作品货架

一个用代码搭出来的像素风玩具柜。光标扫过摆件会晃一下，点开后，摆件飞到前面，画面一圈圈变清楚，切到那件作品自己的片段。右下角最后落下的，是缩小一号的柜子自己。

柜子和摆件都是 [Three.js](https://threejs.org/) 用几何体拼的，没有导入现成模型。适合在浏览器里本地打开。

## 怎么运行

需要电脑上已安装 Python 3，以及能跑 WebGL 的现代浏览器（Chrome、Safari、Firefox、Edge 都可以）。

```bash
git clone https://github.com/Atay3e/pixel-shelf.git
cd pixel-shelf
python3 -m http.server
```

然后用浏览器打开：<http://localhost:8000/网页/>

不要直接双击 `网页/index.html`。这个项目用了 JavaScript 模块和相对路径，用文件方式打开会打不开。

如果 8000 端口被占用，可以换一个，例如 `python3 -m http.server 8080`，再打开 <http://localhost:8080/网页/>。

## 想换成自己的作品

- **点开后的作品画面**：把 `clips/作品画面/` 里同名的 `.webm` 换成自己的视频，文件名保持不变（例如 `唱片机.webm`）。
- **增减货架上的摆件**：改 `网页/main.js` 里的 `SHELF` 列表。加一行就能上架；`clip` 对应上面那个不带后缀的文件名。
- **换摆件的三维造型**：每个摆件的样子写在 `main.js` 的 `BUILD` 函数里，需要改或新写这一段几何体代码，不是把照片拖到柜子里就行。

## 目录

```
网页/                 页面和脚本
  index.html
  main.js             场景、货架清单、点开动画
  palette.js          配色
  three.module.js     Three.js 库
clips/作品画面/       点开后播放的作品片段
```

## 说明

`three.module.js` 来自 Three.js，使用 MIT 许可证。
