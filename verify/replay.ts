// 验收样例重放：互补规范化、最大兼容集、候选三分类、大整数权重。
// 每个场景打印 PASS/FAIL 与关键证据，任一失败则以非零码退出。
import { analyze, parseSpecies, parseSplits } from '../src/lib/splits';

let failures = 0;

function check(name: string, cond: boolean, detail: string): void {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}  ——  ${detail}`);
  if (!cond) failures++;
}

function header(title: string): void {
  console.log(`\n【${title}】`);
}

// ---------------------------------------------------------------- 场景一
header('场景一：互补规范化（互补分裂视为同一项并拒绝重复）');
{
  const sp = parseSpecies('A B C D E');
  const r = parseSplits(['8: C D E', '6: A B', '4: B C'].join('\n'), sp.names);

  const c1 = r.candidates[0];
  check(
    '规范侧选取',
    c1 !== undefined && c1.label === 'C D E' && c1.flipped === false,
    `「8: C D E」规范化为 ${c1?.display ?? '∅'}`,
  );
  check(
    '互补重复拒绝',
    r.lineErrors.length === 1 &&
      r.lineErrors[0].line === 2 &&
      r.lineErrors[0].message.includes('重复') &&
      r.lineErrors[0].text === '6: A B',
    `第 2 行「6: A B」为 #1 的互补，被拒并保留原文`,
  );
  const c2 = r.candidates[1];
  check(
    '取补标记',
    c2 !== undefined && c2.label === 'B C' && c2.flipped === false && r.candidates.length === 2,
    `第 3 行「4: B C」规范化后为 ${c2?.display ?? '∅'}，共 ${r.candidates.length} 个有效候选`,
  );
}

// ---------------------------------------------------------------- 场景二
header('场景二：最大兼容集（逐条高权贪心会堵死更优组合）');
{
  // x=AB(9) 与 y=AC(5)、z=BE(5) 均冲突；y、z、w=DF(2) 两两兼容。
  // 逐条贪心先拿 x 只得 11，精确解为 y+z+w = 12。
  const sp = parseSpecies('A B C D E F');
  const r = parseSplits(['9: A B', '5: A C', '5: B E', '2: D F'].join('\n'), sp.names);
  const an = analyze(
    r.candidates.map((c) => c.mask),
    r.candidates.map((c) => c.weight),
    r.candidates.map((c) => c.label),
    sp.names.length,
  );
  check(
    '总权重最大',
    an.score.weight === 12n,
    `最优总权重 ${an.score.weight}（贪心仅 11：先取 #1 后只剩 #4 可兼容）`,
  );
  check('数量次优', an.score.count === 3, `分裂数量 ${an.score.count}`);
  const chosenLabels = an.chosen.map((i) => r.candidates[i].label);
  check(
    '展示解内容',
    an.chosen.length === 3 &&
      an.chosen.includes(1) &&
      an.chosen.includes(2) &&
      an.chosen.includes(3),
    `展示解 = { ${chosenLabels.join(' ; ')} }（#2 #3 #4，绕开高权陷阱 #1）`,
  );
  check(
    '陷阱候选从不选',
    an.verdicts[0] === 'never',
    `#1 (权重 9) 分类 = ${an.verdicts[0]}`,
  );
}

// ---------------------------------------------------------------- 场景三
header('场景三：候选三分类（必选 / 可选 / 从不选）与字典序展示解');
{
  // r=AB(10) 必选；o1=CD(5) 与 o2=CE(5) 互换（各同优解取其一）；z=AC(12) 与 r 冲突从不选。
  const sp = parseSpecies('A B C D E F');
  const r = parseSplits(['10: A B', '5: C D', '5: C E', '12: A C'].join('\n'), sp.names);
  const an = analyze(
    r.candidates.map((c) => c.mask),
    r.candidates.map((c) => c.weight),
    r.candidates.map((c) => c.label),
    sp.names.length,
  );
  check(
    '最优得分',
    an.score.weight === 15n && an.score.count === 2,
    `总权重 ${an.score.weight}、数量 ${an.score.count}（同优解 {r,o1} 与 {r,o2}）`,
  );
  check(
    '三分类',
    an.verdicts.join(',') === 'required,optional,optional,never',
    `#1=${an.verdicts[0]} #2=${an.verdicts[1]} #3=${an.verdicts[2]} #4=${an.verdicts[3]}`,
  );
  const chosenLabels = an.chosen.map((i) => r.candidates[i].label);
  check(
    '字典序最小展示解',
    chosenLabels.join('|') === 'C D|C D E F',
    `展示解规范序列 = [${chosenLabels.map((s) => `"${s}"`).join(', ')}]，` +
      `小于另一同优解 ["C D E F", "C E"]`,
  );
}

// ---------------------------------------------------------------- 场景四
header('场景四：大整数权重（任意位数正整数，三条候选两两冲突）');
{
  // 物种 A B C D；AB|CD、AC|BD、AD|BC 两两不兼容。
  // 首条权重 1000000007000000001 > 2^53，number 无法精确表示；须无损解析、汇总与展示。
  const BIG = '1000000007000000001';
  const sp = parseSpecies('A B C D');
  const r = parseSplits(
    [`${BIG}: A B | C D`, '900000000: A C | B D', '1: A D | B C'].join('\n'),
    sp.names,
  );
  const an = analyze(
    r.candidates.map((c) => c.mask),
    r.candidates.map((c) => c.weight),
    r.candidates.map((c) => c.label),
    sp.names.length,
  );

  check(
    '候选表保留原始十进制文本且解析无损',
    r.candidates.length === 3 &&
      r.candidates[0].weightText === BIG &&
      r.candidates[0].weight.toString() === BIG,
    `#1 权重文本「${r.candidates[0]?.weightText ?? '∅'}」，解析值 ${r.candidates[0]?.weight ?? '∅'}`,
  );
  check(
    '汇总选择首条分裂且总权重无损',
    an.score.weight.toString() === BIG && an.score.count === 1,
    `最大总权重 ${an.score.weight}（无损显示 ${BIG}），分裂数量 ${an.score.count}`,
  );
  check(
    '展示解为首条分裂',
    an.chosen.length === 1 && an.chosen[0] === 0,
    `展示解 = { ${an.chosen.map((i) => r.candidates[i].display).join(' ; ')} }`,
  );
  check(
    '兼容矩阵三者互斥',
    an.compat.every((row, i) => row.every((ok, j) => (i === j ? ok : !ok))),
    `非对角兼容项 ${an.compat.flat().filter(Boolean).length - 3} 个（应为 0）`,
  );
  check(
    '三分类：首条必选，其余从不选',
    an.verdicts.join(',') === 'required,never,never',
    `#1=${an.verdicts[0]} #2=${an.verdicts[1]} #3=${an.verdicts[2]}`,
  );

  // 相互复算：汇总 = 展示解成员权重之和；展示解两两兼容；三分类与含/不含约束重算一致
  const sumW = an.chosen.reduce((acc, i) => acc + r.candidates[i].weight, 0n);
  const chosenPairwiseOk = an.chosen.every((a, x) =>
    an.chosen.every((b, y) => x >= y || an.compat[a][b]),
  );
  const chosenSet = new Set(an.chosen);
  const verdictsMatchChosen = an.verdicts.every(
    (v, i) => (v !== 'required' || chosenSet.has(i)) && (v !== 'never' || !chosenSet.has(i)),
  );
  check(
    '候选表/汇总/展示解/兼容矩阵/三分类可相互复算',
    sumW === an.score.weight &&
      an.chosen.length === an.score.count &&
      chosenPairwiseOk &&
      verdictsMatchChosen,
    `展示解权重和 ${sumW} = 汇总 ${an.score.weight}，数量 ${an.chosen.length} = ${an.score.count}，` +
      `内部兼容性 ${chosenPairwiseOk ? '一致' : '矛盾'}，三分类与展示解${verdictsMatchChosen ? '一致' : '矛盾'}`,
  );
}

// ---------------------------------------------------------------- 汇总
console.log('\n==================================================');
if (failures === 0) {
  console.log('样例重放全部通过');
} else {
  console.log(`样例重放失败 ${failures} 项`);
}
console.log('==================================================');
process.exit(failures === 0 ? 0 : 1);
