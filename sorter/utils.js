/**
 * 找到指定出现次数的字符换在文本中出现的位置索引
 * @param str
 * @param cha
 * @param num
 * @returns {*}
 */
exports.findIndex = (str, cha, num) => {
  let x = str.indexOf(cha);
  for (let i = 0; i < num; i++) {
    x = str.indexOf(cha, x + 1);
  }
  return x;
}

/**
 * 得到字符串含有某个字符的个数
 * @param str
 * @param char
 * @returns {number|*}
 */
exports.getCharCount = (str, char) => {
  let regex = new RegExp(char, 'g'); // 使用g表示整个字符串都要匹配
  let result = str.match(regex);          //match方法可在字符串内检索指定的值，或找到一个或多个正则表达式的匹配。
  const count = !result ? 0 : result.length;
  return count;
}


/**
 * 文件名称校验 - 检查是否符合 YYYY_MM_DD_HH_MM_SS 日期格式
 * @param str
 * @returns {boolean}
 */
exports.nameCheck = (str) => {
  // 匹配 YYYY_MM_DD_HH_MM_SS 格式（年月日时分秒）
  // 例如：2025_07_28_15_06_03_IMG_5990.png 或 2025_06_20_09_17_40.ppt
  return /^\d{4}_\d{2}_\d{2}_\d{2}_\d{2}_\d{2}/.test(str);
}
