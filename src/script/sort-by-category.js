/**
 * sort-by-category.js
 * ------------------------------------------------------------------
 * 一级分类落地脚本：把「人工/视觉模型标注好的 文件名->一级分类」映射，
 * 真正落到磁盘上，形成  file_output/<一级文件夹>/<YYYY.MM.DD>/<文件>  结构，
 * 并自动调用 fix-arrange 套用「按名称排列」。
 *
 * 作者：gaocangxiong
 *
 * 用法：
 *   node src/script/sort-by-category.js [映射文件] [--dry]
 *
 *   映射文件  默认：agent_work/classification.tsv
 *             格式：TSV，每行 `文件名<TAB>一级分类`，# 开头为注释，首行可为表头。
 *             例：
 *               filename	category
 *               2026_01_01_08_25_28_IMG_7941.JPG	高梓皓
 *               2026_01_03_15_55_34_IMG_8007.JPG	其他
 *   --dry     仅打印将要执行的操作，不做任何实际改动（推荐先跑一次）。
 *
 * 一级分类取值（与 src/skills/classifier.md 对齐）：
 *   高梓皓 / 高仓雄 / 朱莉莉 / 泡芙 / 其他
 *
 * 说明：
 *   - 输入源：agent_work/file_input（保留不删除，本脚本用「复制」而非移动）。
 *   - 日期子目录：取文件名前 3 个下划线之前的 YYYY_MM_DD，下划线替换成点。
 *     不符合日期命名的文件，落入该分类下的 `_mixed/` 目录（便于人工复核）。
 *   - 重复/缺失：源文件缺失或目标已存在会打印警告并跳过，不会覆盖。
 *   - 未出现在映射中的源文件会汇总为「未标注」清单，确保不静默丢弃。
 * ------------------------------------------------------------------
 */

var fs = require('fs');
var path = require('path');
var shell = require('shelljs');
var utils = require('./utils');

var ALLOWED = ['高梓皓', '高仓雄', '朱莉莉', '泡芙', '其他'];

// 解析项目根目录：从脚本所在目录向上查找包含 agent_work / template 的目录
function findProjectRoot(start) {
  var dir = start;
  while (true) {
    if (fs.existsSync(path.join(dir, 'agent_work')) || fs.existsSync(path.join(dir, 'template'))) return dir;
    var parent = path.resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}
var baseDir = findProjectRoot(__dirname);
var inputPath = path.join(baseDir, 'agent_work', 'file_input');
var outputPath = path.join(baseDir, 'agent_work', 'file_output');
var fixArrange = path.join(__dirname, 'fix-arrange.command');

var args = process.argv.slice(2);
var mappingArg = null;
var dryRun = false;
for (var a = 0; a < args.length; a++) {
  if (args[a] === '--dry') dryRun = true;
  else if (!mappingArg) mappingArg = args[a];
}
var mappingPath = mappingArg ? path.resolve(mappingArg) : path.join(baseDir, 'agent_work', 'classification.tsv');

if (!fs.existsSync(mappingPath)) {
  console.error('映射文件不存在: ' + mappingPath);
  console.error('请先生成并填写分类映射（见 agent_work/classification.tsv 模板）。');
  process.exit(1);
}

// 读取并解析映射
function parseMapping(p) {
  var lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  var map = {};
  var order = [];
  lines.forEach(function (line) {
    line = line.trim();
    if (!line || line[0] === '#') return;
    var parts = line.split('\t');
    if (parts.length < 2) return;
    var fn = parts[0].trim();
    var cat = parts[1].trim();
    if (!fn || !cat) return;
    if (fn === 'filename' && cat === 'category') return; // 表头
    map[fn] = cat;
    order.push(fn);
  });
  return { map: map, order: order };
}

var parsed = parseMapping(mappingPath);
var map = parsed.map;
var order = parsed.order;

if (order.length === 0) {
  console.error('映射文件为空或解析失败: ' + mappingPath);
  process.exit(1);
}

// 列出输入目录全部源文件（平铺，含子目录递归，排除 .DS_Store 等隐藏文件）
function listSources(dir) {
  var out = [];
  (function walk(d) {
    fs.readdirSync(d, { withFileTypes: true }).forEach(function (e) {
      if (e.name[0] === '.') return; // 跳过隐藏
      var full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else out.push(full);
    });
  })(dir);
  return out;
}

var sources = listSources(inputPath);
var srcByName = {};
sources.forEach(function (s) { srcByName[path.basename(s)] = s; });

// 统计
var stats = { copied: 0, skippedMissing: 0, skippedDup: 0, badCat: 0, mixed: 0, unmapped: 0 };
var badCats = {};
var missing = [];
var unmappedList = [];

if (!dryRun) {
  if (!fs.existsSync(outputPath)) fs.mkdirSync(outputPath, { recursive: true });
}

order.forEach(function (fn) {
  var cat = map[fn];
  if (ALLOWED.indexOf(cat) === -1) {
    badCats[cat] = (badCats[cat] || 0) + 1;
    stats.badCat++;
    console.error('  ✗ 未知分类「' + cat + '」: ' + fn + '  （应为 ' + ALLOWED.join('/') + '）');
    return;
  }
  var src = srcByName[fn];
  if (!src) {
    stats.skippedMissing++;
    missing.push(fn);
    console.error('  ✗ 源文件缺失: ' + fn);
    return;
  }
  // 日期子目录
  var dateDir;
  if (utils.nameCheck(fn)) {
    var cut = utils.findIndex(fn, '_', 2);
    dateDir = fn.substring(0, cut).replace(/_/g, '.');
  } else {
    dateDir = '_mixed';
    stats.mixed++;
  }
  var destDir = path.join(outputPath, cat, dateDir);
  var destFile = path.join(destDir, fn);
  if (fs.existsSync(destFile)) {
    stats.skippedDup++;
    console.warn('  ! 目标已存在(跳过): ' + cat + '/' + dateDir + '/' + fn);
    return;
  }
  if (dryRun) {
    console.log('  → ' + fn + '  =>  ' + cat + '/' + dateDir + '/');
    stats.copied++;
    return;
  }
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  shell.cp('-n', src, destDir);
  stats.copied++;
});

// 未标注文件
sources.forEach(function (s) {
  var bn = path.basename(s);
  if (!(bn in map)) { stats.unmapped++; unmappedList.push(bn); }
});

console.log('\n==== 汇总 ====');
console.log('映射条目      : ' + order.length);
console.log('已复制        : ' + stats.copied);
console.log('跳过(已存在)  : ' + stats.skippedDup);
console.log('跳过(源缺失)  : ' + stats.skippedMissing);
console.log('跳过(未知分类): ' + stats.badCat + (Object.keys(badCats).length ? '  ' + JSON.stringify(badCats) : ''));
console.log('日期不匹配    : ' + stats.mixed + ' (归入对应分类下的 _mixed/)');
console.log('未标注文件    : ' + stats.unmapped);

if (stats.unmapped) {
  var ul = path.join(baseDir, 'agent_work', 'unmapped.txt');
  fs.writeFileSync(ul, unmappedList.join('\n') + '\n');
  console.log('未标注清单已写出: ' + ul);
}
if (missing.length) {
  var ml = path.join(baseDir, 'agent_work', 'missing.txt');
  fs.writeFileSync(ml, missing.join('\n') + '\n');
  console.log('缺失清单已写出: ' + ml);
}

if (dryRun) {
  console.log('\n[DRY-RUN] 未做任何改动。确认无误后去掉 --dry 重新运行。');
} else {
  // 自动套用 fix-arrange（按名称排列），作用于 file_output
  console.log('\n运行 fix-arrange 套用「按名称排列」...');
  var r = shell.exec('bash "' + fixArrange + '" "' + outputPath + '"', { silent: true });
  console.log(r.stdout || '');
  if (r.code !== 0 && r.stderr) console.error(r.stderr);
  console.log('\n完成 ✅ 输出目录: ' + outputPath);
}
