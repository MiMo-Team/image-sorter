#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sheet_tool.py — 媒体拼接表生成 + 分类落盘编译 工具集
（实现 src/skills/classifier.md 这一「图片分类 Skill」的一级分类视觉辅助 + 编译环节）

分类规则见 src/skills/classifier.md（一级取值：高梓皓 / 高仓雄 / 朱莉莉 / 泡芙 / 其他）。

把原先散落在 /tmp 的 make_sheets.py / subset_sheets.py 整合为一个可复用、可版本化的工具。
特性：
  - 缩略图并行生成（线程池），并按「源文件指纹(size+mtime)」缓存，二次运行秒过；
  - 主拼接表（main）：扫描 agent_work/file_input 全部媒体，5×7 网格 + 清单；
  - 合并复核表（verify）：把"待复核文件清单"一次性拼成高清表，替代原先多次往返；
  - 编译（compile）：把模型/人工产出的「文件名→一级分类」TSV 与清单交叉校验后，
    输出 agent_work/classification.tsv，自动报告缺标、未知文件、非法分类。

子命令：
  thumbs   仅（重）生成缩略图缓存
  main     生成主拼接表 + manifest_main.json
  verify   根据 --list 文件清单生成高清复核表 + manifest_verify.json
  compile  把 labels.tsv 编译为 classification.tsv（带校验）
  all      依次执行 thumbs + main

路径解析：脚本从自身所在目录向上查找含 agent_work/ 的项目根，与其位置解耦。
生成产物（sheets/、verify/、.cache/）都放在本脚本目录下，已在 .gitignore 中忽略。

依赖：Pillow（PIL）。macOS 自带 sips / qlmanage（视频抽帧）无需 ffmpeg。

用法示例：
  python3 sheet_tool.py all                       # 生成全部主表
  python3 sheet_tool.py verify --list todo.txt --size 700 --cols 3 --rows 3
  python3 sheet_tool.py compile --manifest manifest_main.json \
        --manifest manifest_verify.json --labels labels.tsv
"""
import os
import sys
import json
import argparse
import hashlib
import subprocess
from concurrent.futures import ThreadPoolExecutor

from PIL import Image, ImageDraw, ImageFont

# 与 classifier.md 对齐的一级分类取值
ALLOWED = ['高梓皓', '高仓雄', '朱莉莉', '泡芙', '其他']

IMAGE_EXTS = {'.jpg', '.jpeg', '.png', '.heic', '.heif', '.ico'}
VIDEO_EXTS = {'.mov', '.mp4'}
MEDIA_EXTS = IMAGE_EXTS | VIDEO_EXTS


# ----------------------------------------------------------------------------
# 路径解析
# ----------------------------------------------------------------------------
def find_project_root(start):
    d = start
    while True:
        if os.path.isdir(os.path.join(d, 'agent_work')):
            return d
        p = os.path.dirname(d)
        if p == d:
            break
        d = p
    return start


SELF_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = find_project_root(SELF_DIR)
INPUT_DEFAULT = os.path.join(ROOT, 'agent_work', 'file_input')
OUTPUT_DEFAULT = os.path.join(ROOT, 'agent_work', 'classification.tsv')

SHEET_DIR = os.path.join(SELF_DIR, 'sheets')
VERIFY_DIR = os.path.join(SELF_DIR, 'verify')
CACHE_DIR = os.path.join(SELF_DIR, '.cache', 'thumbs')


# ----------------------------------------------------------------------------
# 缩略图（并行 + 指纹缓存）
# ----------------------------------------------------------------------------
def fingerprint(src):
    st = os.stat(src)
    return '%d_%d' % (st.st_size, st.st_mtime_ns)


def cache_key(src, size):
    h = hashlib.sha1(os.path.abspath(src).encode('utf-8')).hexdigest()[:16]
    return '%s_%d_%s.jpg' % (h, size, fingerprint(src))


def sips_thumb(src, dst, size):
    r = subprocess.run(
        ['sips', '-s', 'format', 'jpeg', '-Z', str(size), src, '--out', dst],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return r.returncode == 0 and os.path.exists(dst)


def ql_thumb(src, dst, size):
    tmpdir = os.path.join(CACHE_DIR, '_ql')
    os.makedirs(tmpdir, exist_ok=True)
    r = subprocess.run(
        ['qlmanage', '-t', '-s', str(size), '-o', tmpdir, src],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    png = os.path.join(tmpdir, os.path.basename(src) + '.png')
    if r.returncode == 0 and os.path.exists(png):
        try:
            Image.open(png).convert('RGB').save(dst)
            os.remove(png)
            return True
        except Exception:
            return False
    return False


def placeholder(dst, size, text):
    img = Image.new('RGB', (size, size), (210, 210, 210))
    d = ImageDraw.Draw(img)
    f = ImageFont.load_default(size=max(16, size // 18))
    d.text((size // 12, size // 2), text, fill=(90, 90, 90), font=f)
    img.save(dst)


def make_thumb(src, size):
    """生成单张缩略图到缓存；命中则直接返回。"""
    ext = os.path.splitext(src)[1].lower()
    dst = os.path.join(CACHE_DIR, str(size), cache_key(src, size))
    if os.path.exists(dst):
        return dst
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    tmp = dst + '.tmp'
    if ext in VIDEO_EXTS:
        ok = ql_thumb(src, tmp, size)
        if not ok:
            placeholder(tmp, size, 'VIDEO (no frame)')
    else:
        ok = sips_thumb(src, tmp, size)
        # ico 等 sips 不支持的格式，回退到 qlmanage
        if not ok and ext in ('.ico',):
            ok = ql_thumb(src, tmp, size)
        if not ok:
            placeholder(tmp, size, 'IMG (decode fail)')
    if os.path.exists(tmp):
        os.replace(tmp, dst)
    return dst


def gen_thumbs(sources, size, workers=8):
    os.makedirs(os.path.join(CACHE_DIR, str(size)), exist_ok=True)
    targets, hits = [], 0
    for s in sources:
        dst = os.path.join(CACHE_DIR, str(size), cache_key(s, size))
        if os.path.exists(dst):
            hits += 1
        else:
            targets.append(s)
    print('  thumb cache: %d hit, %d to generate' % (hits, len(targets)), flush=True)
    if not targets:
        return
    with ThreadPoolExecutor(max_workers=workers) as ex:
        list(ex.map(lambda s: make_thumb(s, size), targets))


# ----------------------------------------------------------------------------
# 拼接表
# ----------------------------------------------------------------------------
def wrap(text, font, max_w):
    lines, cur = [], ''
    for ch in text:
        if font.getlength(cur + ch) > max_w:
            lines.append(cur)
            cur = ch
        else:
            cur += ch
    if cur:
        lines.append(cur)
    return lines


def build_sheets(sources, out_dir, size, cols, rows, name_prefix, label_font=18):
    thumbs = [make_thumb(s, size) for s in sources]
    CW = size + 20
    CH = size + 70
    IMG_BOX = size
    font = ImageFont.load_default(size=label_font)
    sheets = []
    idx = sheet_idx = 0
    os.makedirs(out_dir, exist_ok=True)
    while idx < len(sources):
        batch_src = sources[idx:idx + cols * rows]
        batch_th = thumbs[idx:idx + cols * rows]
        W, H = cols * CW, rows * CH
        sheet = Image.new('RGB', (W, H), (255, 255, 255))
        d = ImageDraw.Draw(sheet)
        for c, (orig, tp) in enumerate(zip(batch_src, batch_th)):
            col = c % cols
            row = c // cols
            x = col * CW
            y = row * CH
            d.rectangle([x, y, x + CW - 1, y + CH - 1], outline=(190, 190, 190))
            try:
                im = Image.open(tp).convert('RGB')
                im.thumbnail((IMG_BOX, IMG_BOX))
            except Exception:
                im = Image.new('RGB', (IMG_BOX, IMG_BOX), (220, 220, 220))
            sheet.paste(im, (x + (CW - IMG_BOX) // 2, y + 4))
            d.text((x + 4, y + 4), str(c), fill=(200, 0, 0), font=font)
            name = os.path.basename(orig)
            ty = y + IMG_BOX + 8
            for ln in wrap(name, font, CW - 16)[:3]:
                d.text((x + 8, ty), ln, fill=(0, 0, 0), font=font)
                ty += 20
        path = os.path.join(out_dir, '%s_%03d.png' % (name_prefix, sheet_idx))
        sheet.save(path)
        sheets.append(batch_src)
        sheet_idx += 1
        idx += cols * rows
    return sheets


def collect_media(input_dir):
    files = []
    for root, _, fs in os.walk(input_dir):
        for f in fs:
            if os.path.splitext(f)[1].lower() in MEDIA_EXTS:
                files.append(os.path.join(root, f))
    files.sort()
    return files


# ----------------------------------------------------------------------------
# 子命令
# ----------------------------------------------------------------------------
def cmd_thumbs(args):
    sources = collect_media(args.input)
    print('thumbs: %d media @ %d px' % (len(sources), args.size), flush=True)
    gen_thumbs(sources, args.size, args.workers)


def cmd_main(args):
    sources = collect_media(args.input)
    if not sources:
        print('main: no media found in', args.input)
        return
    print('main: %d media, building @ %d px' % (len(sources), args.size), flush=True)
    gen_thumbs(sources, args.size, args.workers)
    sheets = build_sheets(sources, SHEET_DIR, args.size, args.cols, args.rows, 'sheet')
    manifest = os.path.join(SELF_DIR, 'manifest_main.json')
    json.dump(sheets, open(manifest, 'w'), ensure_ascii=False)
    print('main: wrote %d sheets -> %s' % (len(sheets), SHEET_DIR))
    print('main: manifest -> %s' % manifest)
    if args.show:
        _show_manifest(sheets)


def cmd_verify(args):
    files = [l.strip() for l in open(args.list, 'r', encoding='utf-8') if l.strip()]
    missing = [p for p in files if not os.path.exists(p)]
    files = [p for p in files if os.path.exists(p)]
    if missing:
        print('verify: MISSING (skipped): %s' % ', '.join(os.path.basename(m) for m in missing[:30]))
    if not files:
        print('verify: empty list')
        return
    print('verify: %d files @ %d px' % (len(files), args.size), flush=True)
    gen_thumbs(files, args.size, args.workers)
    sheets = build_sheets(files, VERIFY_DIR, args.size, args.cols, args.rows, 'verify')
    manifest = os.path.join(SELF_DIR, 'manifest_verify.json')
    json.dump(sheets, open(manifest, 'w'), ensure_ascii=False)
    print('verify: wrote %d sheets -> %s' % (len(sheets), VERIFY_DIR))
    print('verify: manifest -> %s' % manifest)


def cmd_compile(args):
    manifests = []
    for m in args.manifest:
        manifests.extend(json.load(open(m, 'r', encoding='utf-8')))
    known = {}
    for sheet in manifests:
        for p in sheet:
            known[os.path.basename(p)] = p

    labels = {}
    for line in open(args.labels, 'r', encoding='utf-8'):
        line = line.rstrip('\n')
        if not line or line.startswith('#'):
            continue
        parts = line.split('\t')
        if len(parts) < 2:
            continue
        fn, cat = parts[0].strip(), parts[1].strip()
        if fn:
            labels[fn] = cat

    unknown = [fn for fn in labels if fn not in known]
    bad_cat = [fn for fn in labels if fn in known and labels[fn] not in ALLOWED]
    missing = [fn for fn in known if fn not in labels]

    if unknown:
        print('compile: %d UNKNOWN files (not in any manifest): %s'
              % (len(unknown), unknown[:20]))
    if bad_cat:
        print('compile: %d INVALID categories: %s'
              % (len(bad_cat), [(fn, labels[fn]) for fn in bad_cat[:20]]))
    if missing:
        print('compile: %d UNLABELED files (in manifest, no category): %s'
              % (len(missing), missing[:20]))

    with open(args.output, 'w', encoding='utf-8') as f:
        f.write('#filename\tcategory\n')
        for fn, _ in known.items():
            f.write('%s\t%s\n' % (fn, labels.get(fn, '')))

    print('compile: wrote %s (%d rows; %d unlabeled, %d errors)'
          % (args.output, len(known), len(missing), len(unknown) + len(bad_cat)))


def cmd_all(args):
    cmd_thumbs(args)
    cmd_main(args)


def _show_manifest(sheets):
    for i, sheet in enumerate(sheets):
        print('--- sheet %03d ---' % i)
        for c, p in enumerate(sheet):
            print('  %2d  %s' % (c, os.path.basename(p)))


# ----------------------------------------------------------------------------
# CLI
# ----------------------------------------------------------------------------
def build_parser():
    p = argparse.ArgumentParser(description='media contact-sheet & classification toolkit')
    sub = p.add_subparsers(dest='cmd', required=True)

    pt = sub.add_parser('thumbs', help='generate thumbnail cache')
    pt.add_argument('--input', default=INPUT_DEFAULT)
    pt.add_argument('--size', type=int, default=360)
    pt.add_argument('--workers', type=int, default=8)
    pt.set_defaults(func=cmd_thumbs)

    pm = sub.add_parser('main', help='build main contact sheets + manifest')
    pm.add_argument('--input', default=INPUT_DEFAULT)
    pm.add_argument('--size', type=int, default=360)
    pm.add_argument('--cols', type=int, default=5)
    pm.add_argument('--rows', type=int, default=7)
    pm.add_argument('--workers', type=int, default=8)
    pm.add_argument('--show', action='store_true', help='print manifest after building')
    pm.set_defaults(func=cmd_main)

    pv = sub.add_parser('verify', help='build high-res verification sheets from a file list')
    pv.add_argument('--list', required=True, help='text file, one source path per line')
    pv.add_argument('--size', type=int, default=700)
    pv.add_argument('--cols', type=int, default=3)
    pv.add_argument('--rows', type=int, default=3)
    pv.add_argument('--workers', type=int, default=8)
    pv.set_defaults(func=cmd_verify)

    pc = sub.add_parser('compile', help='compile labels.tsv -> classification.tsv with validation')
    pc.add_argument('--manifest', action='append', required=True,
                    help='manifest json (repeatable, e.g. main + verify)')
    pc.add_argument('--labels', required=True, help='TSV: filename<TAB>category')
    pc.add_argument('--output', default=OUTPUT_DEFAULT)
    pc.set_defaults(func=cmd_compile)

    pa = sub.add_parser('all', help='thumbs + main')
    pa.add_argument('--input', default=INPUT_DEFAULT)
    pa.add_argument('--size', type=int, default=360)
    pa.add_argument('--cols', type=int, default=5)
    pa.add_argument('--rows', type=int, default=7)
    pa.add_argument('--workers', type=int, default=8)
    pa.set_defaults(func=cmd_all)
    return p


if __name__ == '__main__':
    args = build_parser().parse_args()
    args.func(args)
