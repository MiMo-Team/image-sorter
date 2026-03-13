/**
 * ============================================================
 * 文件立体化处理
 * ============================================================
 *
 * 功能描述：
 * 本脚本用于对 images_input 目录中的文件进行立体化分类处理，
 * 按照文件名的日期信息将文件归类到对应的日期文件夹中。
 *
 * ============================================================================
 * 分类规则
 * ============================================================================
 *
 * 规则1：日期归类
 * ----------------
 * 文件（图片、视频等）根据日期进行归类
 *   - 文件名格式示例：2025_07_28_15_06_03_IMG_5990.png
 *   - 2025是年，07是月，28是日，根据_符号隔开，形成2025.07.28这样的文件夹
 *   - 不限制文件后缀，只要符合日期命名规则即可
 *
 * 规则2：无法归类文件处理
 * ------------------------
 * 如果文件无法归类（不符合日期命名规则）：
 *   - 在当前目录下生成"_mixed"文件夹（如不存在则创建，避免重复生成）
 *   - 将所有无法归类的文件放入该文件夹
 *
 * 规则3：根目录特殊处理
 * ----------------------
 * 如果 images_input 根目录下有需归类的文件：
 *   - 在 images_output 目录下生成"_tmp_other"文件夹
 *   - 将归类好的文件夹及文件都放入"_tmp_other"内
 *
 * ============================================================================
 * 处理流程图示
 * ============================================================================
 *
 * 输入：images_input/                     输出：images_output/
 * ├── 文件夹A/           ────────────>    ├── sorted/
 * │   ├── 子文件夹1/     ────────────>    │   ├── 文件夹A/
 * │   │   ├── a.jpg      ────────────>    │   │   ├── 子文件夹1/
 * │   │   └── b.mov      ────────────>    │   │   │   ├── 2025.06.02/
 * │   └── 子文件夹2/                        │   │   │   │   ├── a.jpg
 * │       ├── c.ppt      ────────────>    │   │   │   │   └── b.mov
 * │       ├── d.txt      ────────────>    │   │   │   └── _mixed/
 * │       └── x.pdf      ────────────>    │   │   │       └── x.pdf
 * ├── e.jpg              ────────────>    │   │   └── 子文件夹2/
 * ├── f.mov              ────────────>    │   │       ├── 2025.06.10/
 * └── g.txt              ────────────>    │   │       │   ├── c.ppt
 *                                         │   │       │   └── _mixed/
 *                                         │   │       │       └── d.txt
 *                                         ├── _mixed/
 *                                         │   └── g.txt
 *                                         └── _tmp_other/
 *                                             └── 2025.07.28/
 *                                                 ├── e.jpg
 *                                                 └── f.mov
 *
 * ============================================================================
 * 归类示例
 * ============================================================================
 *
 * 示例1：符合日期命名规则的文件
 *   输入：2025_07_28_15_06_03_IMG_5990.png
 *   输出位置：images_output/sorted/.../2025.07.28/2025_07_28_15_06_03_IMG_5990.png
 *   说明：提取前3段下划线内容（2025_07_28），转换为2025.07.28作为文件夹名
 *
 * 示例2：符合日期命名规则的非图片文件
 *   输入：2025_06_20_09_17_40.ppt
 *   输出位置：images_output/sorted/.../2025.06.20/2025_06_20_09_17_40.ppt
 *   说明：不限制文件类型，只要符合 YYYY_MM_DD_HH_MM_SS 格式即可
 *
 * 示例3：不符合命名规则的文件
 *   输入：test.jpg, readme.txt, 123.jpg
 *   输出位置：images_output/sorted/.../_mixed/ 或 images_output/_mixed/
 *   说明：无法提取日期信息，放入当前目录的_mixed文件夹
 *
 * 示例4：根目录文件
 *   输入：images_input/2025_07_28_18_00_00_IMG_1000.jpg
 *   输出位置：images_output/_tmp_other/2025.07.28/2025_07_28_18_00_00_IMG_1000.jpg
 *   说明：根目录文件统一收口到 _tmp_other 文件夹内
 *
 * ============================================================================
 * 执行步骤
 * ============================================================================
 *
 * 1、初始化阶段
 *    - 清理并重建 images_output 目录
 *    - 创建 sorted 和 _mixed 基础文件夹
 *
 * 2、目录结构复制
 *    - 遍历 images_input 文件夹结构
 *    - 保持目录层级复制到 images_output/sorted
 *
 * 3、根目录文件处理
 *    - 处理 images_input 根目录下的文件
 *    - 符合规则的放入 _tmp_other/日期文件夹/
 *    - 不符合规则的放入 images_output/_mixed/
 *
 * 4、子目录文件归类
 *    - 递归遍历子目录，找到最内层包含文件的目录
 *    - 按日期归类文件到对应的 YYYY.MM.DD 文件夹
 *    - 无法归类的文件放入当前目录的 _mixed 文件夹
 *
 * ============================================================================
 * 使用方式
 * ============================================================================
 *
 *   npm run sort-solid
 *
 * ============================================================================
 */

var fs = require('fs');
var path = require('path');
const shell = require('shelljs');
const utils = require('./utils');

var inputPath = path.resolve('./images_input');
var outputPath = path.resolve('./images_output');
var sortedPath = path.join(outputPath, 'sorted');
var tmpOtherPath = path.join(outputPath, '_tmp_other');

// 清理并重建输出目录
shell.rm('-rf', outputPath);
fs.mkdirSync(outputPath, { recursive: true });
fs.mkdirSync(sortedPath, { recursive: true });

// 复制目录结构（仅文件夹，从 images_input 复制到 images_output/sorted）
function copyDirectoryStructure(src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true });
      }
      copyDirectoryStructure(srcPath, destPath);
    }
  }
}

// 检查目录是否为空（或只包含空子目录）
function isEmptyDir(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  if (entries.length === 0) return true;
  
  for (const entry of entries) {
    if (entry.isFile()) return false;
    if (entry.isDirectory()) {
      const subPath = path.join(dirPath, entry.name);
      if (!isEmptyDir(subPath)) return false;
    }
  }
  return true;
}

// 判断是否为最内层目录（包含文件，且子目录都是空的或没有子目录）
function isInnermostDir(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const subDirs = entries.filter(e => e.isDirectory());
  const files = entries.filter(e => e.isFile());
  
  // 如果有文件，且没有子目录，那它是最内层
  if (files.length > 0 && subDirs.length === 0) {
    return true;
  }
  
  // 如果有子目录，检查子目录是否都是空的
  if (subDirs.length > 0) {
    for (const subDir of subDirs) {
      const subPath = path.join(dirPath, subDir.name);
      if (!isEmptyDir(subPath)) {
        return false;
      }
    }
    // 所有子目录都是空的，且有文件，那就是最内层
    return files.length > 0;
  }
  
  return false;
}

// 处理最内层目录：按日期分类文件
function processInnermostDir(inputDir, outputDir) {
  const entries = fs.readdirSync(inputDir, { withFileTypes: true });
  
  for (const entry of entries) {
    const inputFilePath = path.join(inputDir, entry.name);
    
    if (entry.isFile()) {
      const filename = entry.name;
      
      if (utils.nameCheck(filename)) {
        // 符合命名规则，按日期分类
        var cutIndex = utils.findIndex(filename, '_', 2);
        var classDirName = filename.substring(0, cutIndex).replace(/_/g, ".");
        var dateDirPath = path.join(outputDir, classDirName);
        
        // 创建日期文件夹
        if (!fs.existsSync(dateDirPath)) {
          fs.mkdirSync(dateDirPath, { recursive: true });
        }
        
        // 复制文件到日期文件夹
        shell.cp('-r', inputFilePath, dateDirPath);
        
      } else {
        // 不符合命名规则，在当前输出目录下创建 _mixed 并复制文件
        var localMixedPath = path.join(outputDir, '_mixed');
        if (!fs.existsSync(localMixedPath)) {
          fs.mkdirSync(localMixedPath, { recursive: true });
        }
        shell.cp('-r', inputFilePath, localMixedPath);
      }
      
    } else if (entry.isDirectory()) {
      // 复制空的子目录结构
      const outputSubDir = path.join(outputDir, entry.name);
      if (!fs.existsSync(outputSubDir)) {
        fs.mkdirSync(outputSubDir, { recursive: true });
      }
    }
  }
}

// 递归处理目录
function processDirectory(inputDir, outputDir) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // 检查是否为最内层目录
  if (isInnermostDir(inputDir)) {
    processInnermostDir(inputDir, outputDir);
  } else {
    // 不是最内层，继续递归
    const entries = fs.readdirSync(inputDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const inputSubPath = path.join(inputDir, entry.name);
      const outputSubPath = path.join(outputDir, entry.name);
      
      if (entry.isDirectory()) {
        processDirectory(inputSubPath, outputSubPath);
      }
    }
  }
}

// 处理根目录下的文件（直接放在 images_input 下的文件）
function processRootFiles(inputDir) {
  const entries = fs.readdirSync(inputDir, { withFileTypes: true });
  
  for (const entry of entries) {
    if (entry.isFile()) {
      const inputFilePath = path.join(inputDir, entry.name);
      const filename = entry.name;
      
      if (utils.nameCheck(filename)) {
        // 符合命名规则，按日期分类到 _tmp_other 内
        if (!fs.existsSync(tmpOtherPath)) {
          fs.mkdirSync(tmpOtherPath, { recursive: true });
        }
        
        var cutIndex = utils.findIndex(filename, '_', 2);
        var classDirName = filename.substring(0, cutIndex).replace(/_/g, ".");
        var dateDirPath = path.join(tmpOtherPath, classDirName);
        
        // 创建日期文件夹
        if (!fs.existsSync(dateDirPath)) {
          fs.mkdirSync(dateDirPath, { recursive: true });
        }
        
        // 复制文件到日期文件夹
        shell.cp('-r', inputFilePath, dateDirPath);
        
      } else {
        // 不符合命名规则，在 images_output 根目录下创建 _mixed
        var rootMixedPath = path.join(outputPath, '_mixed');
        if (!fs.existsSync(rootMixedPath)) {
          fs.mkdirSync(rootMixedPath, { recursive: true });
        }
        shell.cp('-r', inputFilePath, rootMixedPath);
      }
    }
  }
}

// 主程序
console.log('开始处理...');

// 第一步：复制目录结构到 sorted
console.log('复制目录结构到 sorted/...');
copyDirectoryStructure(inputPath, sortedPath);

// 第二步：处理根目录下的文件（images_input 根目录）
console.log('处理根目录文件...');
processRootFiles(inputPath);

// 第三步：处理子目录中的文件分类
console.log('处理子目录文件分类...');
const entries = fs.readdirSync(inputPath, { withFileTypes: true });
for (const entry of entries) {
  if (entry.isDirectory()) {
    const inputSubPath = path.join(inputPath, entry.name);
    const outputSubPath = path.join(sortedPath, entry.name);
    processDirectory(inputSubPath, outputSubPath);
  }
}

console.log('文件分类完成！');
console.log('- 已归类文件：images_output/sorted/ 目录下');
console.log('- 无法归类文件：各目录下的 _mixed/ 文件夹内');
console.log('- 根目录归类文件：images_output/_tmp_other/ 目录下');
