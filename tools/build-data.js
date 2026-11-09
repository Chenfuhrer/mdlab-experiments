/* 把 data/*.json 包成 <script> 可直接加载的 .js（支持双击 file:// 打开） */
const fs = require("fs"), path = require("path");
const D = path.join(__dirname, "../data");
const wrap = (json, out, name) => fs.writeFileSync(path.join(D, out), `window.${name} = ${fs.readFileSync(path.join(D, json), "utf8")};\n`);
wrap("reference.json", "reference.js", "REF");
if (fs.existsSync(path.join(D, "validation.json"))) wrap("validation.json", "validation.js", "VALID");
console.log("ok");
