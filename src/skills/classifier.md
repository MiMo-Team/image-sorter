# 图片分类 Skill（classifier）

> **作者**：gaocangxiong
> **更新时间**：2026-09-30
> **适用场景**：家庭 / 人物照片的批量归整（macOS）

> 可复用的图片整理流程：先按「人物 / 对象」分类，再按「日期」二级分类，
> 生成后自动处理文件夹排列，最后校验输出目录结构。

---

## 一、概述

- **目标**：把一批图片，整理成「分类文件夹 → 日期文件夹 → 文件」的四层结构。
- **输入**：`agent_work/file_input`（可含任意层级子目录）。
- **输出**：`agent_work/file_output`，其下按「人物 / 对象」再按「日期」归档。
- **需人工 / 视觉辅助部分**：判断图片里出现的人物 / 对象，决定归属哪个一级文件夹（详见第二节规则）。
- **整体流程**：`准备输入 → ① 一级分类(视觉, sheet_tool.py) → ② 编译分类映射 → ③ 落盘(一级+二级日期, sort-by-category.js, 自动 fix-arrange) → ④ 校验输出`。

### 实现本 Skill 的脚本（工具与 skill 的对应关系）

本 Skill 不是单一脚本，而是一组位于 `src/script/` 下的脚本协同完成。下表建立「流程环节 ↔ 脚本」的映射，使 skill 与脚本明确挂钩：

| 环节 | 脚本 | 说明 |
|------|------|------|
| 一级分类 · 视觉辅助 | `src/script/agent_tmp/sheet_tool.py` | 并行生成缩略图（指纹缓存）+ 主拼接表 + 合并复核表，并把标注编译成 `classification.tsv` |
| 一级分类 · 落盘 | `src/script/sort-by-category.js` | 读 `classification.tsv`，把文件复制到 `file_output/<一级>/<YYYY.MM.DD>/`（一级 + 二级一步完成），并自动触发 fix-arrange |
| 排列处理（自动） | `src/script/fix-arrange.command` | 给生成的文件夹套用「按名称排列」；由 `sort-by-category.js` 自动调用，也可手动 |
| 通用日期拍平（参考） | `src/script/sort-flatten.js` | 通用「按日期拍平」工具（`script_work` 场景），并复用其日期解析逻辑（`utils.findIndex`） |
| 公共工具 | `src/script/utils.js` | `nameCheck` / `findIndex` 等日期解析与校验函数 |

> 分类规则（五个一级文件夹的取值与判定）见第二节；脚本路径均相对于项目根目录，与脚本自身位置解耦（运行时向上查找含 `agent_work` 的根目录）。

---

## 二、一级分类规则（按人物 / 对象）

文件按「图片内容中出现的对象」归入以下 **五个** 一级文件夹之一：

| 一级文件夹 | 归类规则 |
|-----------|---------|
| `高梓皓`  | 图片属于高梓皓相关（按实际人物判定） |
| `高仓雄`  | 图片属于高仓雄相关（按实际人物判定） |
| `朱莉莉`  | **图片中同时出现「成年男性」和「成年女性」** → 归入朱莉莉 |
| `泡芙`    | **图片中出现宠物猫「泡芙」**（蓝金渐层英短，毛色浅咖色）→ 归入泡芙 |
| `其他`    | 不属于以上任一情况（无人 / 无法判定 / 其它对象） |

> 说明：目前唯一明确给定的规则是——
> **若图片里既有「成年男性」又有「成年女性」，则分类为「朱莉莉」**；
> `高梓皓` / `高仓雄` / `泡芙` / `其他` 的具体判定，请沿用「按图中实际对象归属」的同一原则补充。

分类完成后，把文件分别移入对应的 `高梓皓` / `高仓雄` / `朱莉莉` / `泡芙` / `其他` 文件夹。

---

## 三、二级分类规则（按日期）

分别进入上述五个一级文件夹，对里面的文件**按日期**再分一层。

**命名规则**：文件名需形如 `YYYY_MM_DD_HH_MM_SS_xxx.扩展名`
（例：`2025_06_10_21_15_22_IMG_5630.MOV`）。

**操作**：取文件名前 3 个下划线之前的部分（`YYYY_MM_DD`），将下划线替换为点号，
生成日期文件夹 `YYYY.MM.DD`，再把该文件移入。

**示例**：`高梓皓` 文件夹内有
- `2025_06_10_21_15_22_IMG_5630.MOV`
- `2025_06_11_17_18_23_IMG_5635.JPG`

处理后在 `高梓皓` 内创建：
- `2025.06.10/` → 放入 `2025_06_10_21_15_22_IMG_5630.MOV`
- `2025.06.11/` → 放入 `2025_06_11_17_18_23_IMG_5635.JPG`

> 本流水线中，「一级 + 二级日期」归档由 `src/script/sort-by-category.js` 一步完成
> （读取 `classification.tsv` 后，按上述日期规则建 `YYYY.MM.DD` 子目录并落盘）。
> 其日期解析逻辑复用 `src/script/utils.js` 的 `findIndex(filename, '_', 2)`（取第三个下划线位置）；
> `src/script/sort-flatten.js` 是同一规则的通用「拍平」工具，供其它 `script_work` 场景复用。

---

## 四、排列处理（fix-arrange，自动执行）

> 本步骤由 `sort-by-category.js` 在写入 `file_output` 完成后**自动执行**，无需事后手动操作。
> 即：完成「一级分类 + 二级日期分类」、把文件写入 `file_output` 之后，
> 脚本自动调用 `src/script/fix-arrange.command` 处理排列，然后再进入「校验」。

macOS 下新文件夹默认不会「按名称排列」，需逐个设置；本步骤一次性自动完成：

- **作用**：把排列基准文件 `template/arrange_name.DS_Store` 复制到输出目录树的每个文件夹中，
  使所有生成目录（仅 `file_output` 下）自动采用「按名称」排列，**不影响系统其它文件夹**。
- **自动触发**：`sort-by-category.js` 在写入 `file_output` 完成后执行
  `bash src/script/fix-arrange.command`（默认处理 `agent_work/file_output`）。
- **手动重跑（可选）**：若需对其它目录或单独刷新，可双击该脚本，或把文件夹拖到其图标上。
- **原理 / 说明**：Finder 会拒绝手写或非法的 `.DS_Store`、且 AppleScript 设排列方式不落盘；
  因此采用「复制 Finder 自身生成的合法 `.DS_Store` 基准」的方式，可靠生效。
- **更换排列**：若想改成其它排列（如按日期修改），把 `template/arrange_name.DS_Store`
  替换为你设好该排列的 `.DS_Store` 文件，再运行脚本即可全量刷新。

---

## 五、输出结构与校验

整理完成后，检查输出目录格式是否正确：

- **最外层**：`agent_work/file_output`
- **第二层**：五个一级文件夹 —— `高梓皓` / `高仓雄` / `朱莉莉` / `泡芙` / `其他`
- **第三层**：按日期分类的文件夹，命名示例：`2026.03.06`
- **最里层**：具体文件

**结构示例**

```
file_output/
├─ 高梓皓/
│   └─ 2026.03.06/
│       └─ xxx.png
├─ 高仓雄/
│   └─ 2026.03.06/
│       └─ zzz.jpg
├─ 朱莉莉/
│   └─ 2026.02.10/
│       └─ yyy.jpg
├─ 泡芙/
│   └─ 2026.02.10/
│       └─ cat.jpg
└─ 其他/
    └─ 2026.01.01/
        └─ www.png
```

---

## 六、执行流程速查（Checklist / 命令）

1. **准备输入**：把待整理图片放入 `agent_work/file_input`（可含子目录）。
2. **一级分类（视觉辅助，用 `sheet_tool.py`）**：
   - 生成拼接表与缩略图缓存：`python3 src/script/agent_tmp/sheet_tool.py all`
     （缩略图并行生成 + 按「源文件 size+mtime」指纹缓存，二次运行直接命中；输出主表 + `manifest_main.json`）。
   - 读图标注：并行读取主表（建议每轮 4–5 张），对每张表产出 `文件名<TAB>一级分类` 的标注行；
     模糊 / 不确定的文件统一汇总到一个清单（如 `todo.txt`）。
   - 合并复核：对 `todo.txt` 跑 `python3 src/script/agent_tmp/sheet_tool.py verify --list todo.txt --size 700 --cols 3 --rows 3`，
     生成一张高清复核表，读完补标。
   - 编译映射：`python3 src/script/agent_tmp/sheet_tool.py compile --manifest manifest_main.json --manifest manifest_verify.json --labels labels.tsv`
     → `agent_work/classification.tsv`（自动报「缺标 / 未知文件 / 非法分类」）。
   - 关键规则：同时含「成年男性」+「成年女性」 → `朱莉莉`；出现宠物猫「泡芙」 → `泡芙`。
3. **落盘（一级 + 二级日期，用 `sort-by-category.js`）**：
   - 预演：`node src/script/sort-by-category.js --dry`
   - 正式：`node src/script/sort-by-category.js`
     读取 `classification.tsv`，把文件复制到 `file_output/<一级>/<YYYY.MM.DD>/`（一级、二级一步完成），
     结束后自动调用 `fix-arrange.command`。
4. **排列处理（自动）**：`sort-by-category.js` 完成后自动执行 `src/script/fix-arrange.command`，
   使所有生成目录按「名称」排列；如需手动刷新：`bash src/script/fix-arrange.command`（详见第四节）。
5. **校验**：确认整体为 `file_output / 五个一级文件夹 / 日期文件夹 / 文件` 的四层结构。
6. **输出**：结果落在 `agent_work/file_output`，可直接使用。

---

## 七、注意事项

- 文件名必须以 `YYYY_MM_DD_HH_MM_SS` 开头，否则无法正确解析日期，会被归入 `_mixed/` 异常目录（见 `sort-by-category.js` / `sort-flatten.js` 的 `mixed` 逻辑）。
- `classification.tsv` 是「视觉分类」与「落盘脚本」之间的桥梁文件：先由 `sheet_tool.py compile` 生成，再被 `sort-by-category.js` 消费。
- `sheet_tool.py` 的缩略图按源文件「size+mtime」指纹缓存；源文件改动会自动重算对应缩略图，未改动则直接命中，无需每次重生成拼接表。
- 一级分类依赖对图片内容的识别（人工或视觉模型），无法纯靠文件名自动完成。
- 每次重新运行整理脚本前，注意备份已有结果，避免被覆盖。
- 处理完毕后，保留输入源头 `agent_work/file_input` 中的内容（不删除）。
