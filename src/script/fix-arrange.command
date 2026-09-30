#!/bin/bash
# fix-arrange.command — 只给“生成的文件夹”套用「按名称排列」，不动全局默认
# 原理：复制一份 Finder 生成的合法 .DS_Store(模板) 到每个生成目录。
#        Finder 接受该文件即采用其中视图(含排列方式)，仅作用于这些文件夹。
# 用法：
#   1) 双击运行         -> 处理下方 DEFAULT 目录
#   2) 把某文件夹拖到图标 -> 处理该文件夹
# 模板说明：TEMPLATE 是“基准” .DS_Store(从你某个已设好「排列方式→名称」的文件夹复制而来，
#           存在独立位置，不再依赖 test_res)。若需更换排列，覆盖该基准文件即可。

DEFAULT="/Users/gaocangxiong/Work/DevProject/image-sorter/agent_work/file_output"
TEMPLATE="/Users/gaocangxiong/Work/DevProject/image-sorter/template/arrange_name.DS_Store"
TARGET="${1:-$DEFAULT}"

if [ ! -d "$TARGET" ]; then echo "目录不存在: $TARGET"; exit 1; fi
if [ ! -f "$TEMPLATE" ]; then echo "模板缺失: $TEMPLATE"; exit 1; fi

echo "目标: $TARGET"
echo "模板: $TEMPLATE"
echo "正在为目录树里每个文件夹套用模板视图..."

n=0
find "$TARGET" -type d | while IFS= read -r d; do
  [ -z "$d" ] && continue
  if [ ! -f "$d/.DS_Store" ]; then
    cp "$TEMPLATE" "$d/.DS_Store"
    n=$((n+1))
  fi
done

echo ""
echo "完成 ✅ 打开 $TARGET 下任意文件夹，应已按『名称』排列（仅影响生成目录）。"
echo "若排列不对，把 TEMPLATE 换成一个你已设好“按名称”的文件夹的 .DS_Store 路径即可。"
sleep 3
