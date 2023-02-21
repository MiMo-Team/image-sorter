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
 * 图片名称校验
 * @param str
 * @returns {boolean|number|*}
 */
exports.nameCheck = (str) => {
  return str.indexOf("IMG") != -1 && this.getCharCount(str, '_') >= 5
}
