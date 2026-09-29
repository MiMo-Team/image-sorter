/**
 * sort-flatten.js
 * ------------------------------------------------------------------
 * 功能：把多层嵌套目录中的图片/文件“拍平”，并按文件名中的日期重新分类。
 *
 * 作者（@author）：<请填写，例如 gaocangxiong>
 *
 * 用法（Usage）：
 *   1. 输入目录为 sorter/ 同级的 script_work/images_input，
 *      把待整理的图片/文件放进去，可以包含任意层级的子目录（脚本会递归遍历）。
 *   2. 运行：node sorter/sort-flatten.js
 *      （路径基于脚本自身所在目录 sorter/ 解析，与工作目录无关，任意位置运行均可）
 *   3. 运行结束后查看 script_work/images_output 目录。
 *
 * 输入（Input）：
 *   script_work/images_input/
 *     ├─ a.png
 *     ├─ sub1/
 *     │   ├─ 2025_07_28_15_06_03_IMG_5990.png
 *     │   └─ 2025_06_20_09_17_40.ppt
 *     └─ sub2/deep/2025_01_01_00_00_00.jpg
 *   注意：输入/输出路径通过 path.resolve(__dirname, '../script_work/...') 解析，
 *         即 sorter/ 目录的同级目录 script_work/ 下的 images_input / images_output。
 *
 * 输出（Output）：
 *   script_work/images_output/        —— 每次运行都会先删除再重建（shell.rm -rf）
 *     ├─ sorted/                      —— 符合日期命名规范的文件，按日期分目录存放
 *     │   ├─ 2025.07.28/
 *     │   │   ├─ 2025_07_28_15_06_03_IMG_5990.png
 *     │   │   └─ ...
 *     │   ├─ 2025.06.20/
 *     │   │   └─ 2025_06_20_09_17_40.ppt
 *     │   └─ 2025.01.01/
 *     │       └─ 2025_01_01_00_00_00.jpg
 *     └─ mixed/                       —— 不符合日期命名规范的文件，原样收集到这里
 *         ├─ a.png
 *         └─ ...
 *
 * 命名规范（由 utils.nameCheck 校验）：
 *   文件名需以 YYYY_MM_DD_HH_MM_SS 开头，例如 2025_07_28_15_06_03_IMG_5990.png
 *   其中前三个下划线之前的部分会被当作“日期分类”，下划线替换为点号后
 *   生成形如 2025.07.28 的输出子目录。
 *
 * 依赖：
 *   - shelljs    （用于 rm / cp）
 *   - ./utils.js （nameCheck / findIndex 等工具函数）
 * ------------------------------------------------------------------
 */

var fs = require('fs');
var path = require('path');
var shell = require('shelljs');
var utils = require('./utils');
// 解析需要遍历的输入/输出文件夹（基于脚本所在目录 sorter/，指向同级 script_work/）
var inputPath = path.resolve(__dirname, '../script_work/images_input');
var outputPath = path.resolve(__dirname, '../script_work/images_output');
var outputSortedPath = path.resolve(__dirname, '../script_work/images_output/sorted');
var outputMixedPath = path.resolve(__dirname, '../script_work/images_output/mixed');

// 每次运行前清空并重建输出目录，保证结果是“从输入重新生成”的
shell.rm('-rf', outputPath);

fs.mkdirSync(outputPath);
fs.mkdirSync(outputSortedPath);
fs.mkdirSync(outputMixedPath);

// 开始递归遍历输入目录
fileDisplay(inputPath);

/**
 * 递归遍历目录：对文件分类拷贝，对子目录继续递归。
 * @param {string} filePath 当前要遍历的目录路径
 */
function fileDisplay(filePath) {
  // 读取目录，返回文件/子目录名称列表
  fs.readdir(filePath, function (err, files) {
    if (err) {
      console.warn(err);
      return;
    }

    // 遍历读取到的每一个条目
    files.forEach(function (filename) {
      // 拼出当前条目的绝对路径
      var filedir = path.join(filePath, filename);

      // 获取文件信息（判断是文件还是目录）
      fs.stat(filedir, function (eror, stats) {
        if (eror) {
          console.warn('获取文件stats失败');
          return;
        }

        var isFile = stats.isFile();   // 是否为文件
        var isDir = stats.isDirectory(); // 是否为文件夹

        // 是文件：根据命名规范分类拷贝
        if (isFile) {
          if (utils.nameCheck(filename)) {
            // 截断位置：找到第三个下划线 '_' 所在索引
            var cutIndex = utils.findIndex(filename, '_', 2);
            // 取前三个下划线之前的部分（YYYY_MM_DD），下划线替换为点号作为分类目录名
            var classDirName = filename.substring(0, cutIndex).replace(/_/g, '.');
            // 输出文件夹路径与文件全路径
            var outputDirPath = `${outputSortedPath}/${classDirName}`;
            var outputFullPath = `${outputDirPath}/${filename}`;

            // 若按日期命名的分类目录不存在，则创建
            if (!fs.existsSync(outputDirPath)) {
              fs.mkdirSync(outputDirPath);
            }

            if (fs.existsSync(outputFullPath)) {
              console.log('存在');
              console.log(outputFullPath);
            }

            // 把符合命名规范的文件拷贝到对应日期分类目录
            shell.cp('-r', filedir, outputDirPath);

          } else {
            console.log(filename);
            // 不符合命名规范的文件，统一拷贝到 mixed 目录
            shell.cp('-r', filedir, outputMixedPath);
          }
        }

        // 是文件夹：递归继续遍历
        if (isDir) {
          fileDisplay(filedir);
        }
      });
    });
  });
}
