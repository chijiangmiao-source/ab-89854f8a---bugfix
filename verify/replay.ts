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
header('场景四：大整数权重（任意位数正整数，汇总无损）');
{
  // 三条 4 物种分裂两两冲突；首条权重超过 64 位与 2^53，且 ≡ 1 (mod 1_000_000_007)，
  // 任何取模 / 双精度截断都会让它输给 900000000，正确结论必须无损保留它。
  const BIG = '1000000007000000001';
  const sp = parseSpecies('A B C D');
  const r = parseSplits(
    [`${BIG}: A B | C D`, '900000000: A C | B D', '1: A D | B C'].join('\n'),
    sp.names,
  );
  const c1 = r.candidates[0];
  check(
    '候选表保留原始十进制文本',
    r.candidates.length === 3 && c1 !== undefined && c1.weightText === BIG,
    `#1 权重文本 = ${c1?.weightText ?? '∅'}（${BIG.length} 位，逐字符一致）`,
  );
  check(
    '权重精确解析',
    c1 !== undefined && c1.weight === BigInt(BIG) && c1.weight.toString() === BIG,
    `#1 权重 = ${c1?.weight?.toString() ?? '∅'}（无取模、无截断）`,
  );
  const an = analyze(
    r.candidates.map((c) => c.mask),
    r.candidates.map((c) => c.weight),
    r.candidates.map((c) => c.label),
    sp.names.length,
  );
  check(
    '最大总权重无损',
    an.score.weight === BigInt(BIG) && an.score.weight.toString() === BIG && an.score.count === 1,
    `最大总权重 = ${an.score.weight}、数量 ${an.score.count}（须完整显示 ${BIG}）`,
  );
  check(
    '展示解为首条分裂',
    an.chosen.length === 1 && an.chosen[0] === 0 && r.candidates[0].display === 'C D | A B',
    `展示解 = { ${an.chosen.map((i) => r.candidates[i].display).join(' ; ')} }`,
  );
  check(
    '三分类：首条必选、其余从不选',
    an.verdicts.join(',') === 'required,never,never',
    `#1=${an.verdicts[0]} #2=${an.verdicts[1]} #3=${an.verdicts[2]}`,
  );
  const offDiag = [an.compat[0][1], an.compat[0][2], an.compat[1][2]];
  const diag = [an.compat[0][0], an.compat[1][1], an.compat[2][2]];
  check(
    '兼容矩阵三者互斥',
    offDiag.every((v) => !v) && diag.every((v) => v),
    `非对角 = [${offDiag.join(', ')}]，对角 = [${diag.join(', ')}]`,
  );

  // 相互复算：仅凭候选表权重文本 + 兼容矩阵暴力枚举全部同优解，
  // 重算汇总得分、展示解与三分类，须与报告值一致。
  const m = r.candidates.length;
  const optimal: number[][] = [];
  let bestW = -1n;
  let bestC = -1;
  for (let s = 0; s < 1 << m; s++) {
    const mem: number[] = [];
    for (let i = 0; i < m; i++) if ((s & (1 << i)) !== 0) mem.push(i);
    let ok = true;
    for (let a = 0; a < mem.length && ok; a++) {
      for (let b = a + 1; b < mem.length && ok; b++) {
        if (!an.compat[mem[a]][mem[b]]) ok = false;
      }
    }
    if (!ok) continue;
    const w = mem.reduce((acc, i) => acc + BigInt(r.candidates[i].weightText), 0n);
    if (w > bestW || (w === bestW && mem.length > bestC)) {
      bestW = w;
      bestC = mem.length;
      optimal.length = 0;
      optimal.push(mem);
    } else if (w === bestW && mem.length === bestC) {
      optimal.push(mem);
    }
  }
  const reVerdicts = r.candidates.map((_, i) => {
    const inAll = optimal.every((mem) => mem.includes(i));
    const inSome = optimal.some((mem) => mem.includes(i));
    if (inAll) return 'required';
    if (!inSome) return 'never';
    return 'optional';
  });
  check(
    '相互复算一致（候选表 × 兼容矩阵 → 汇总 / 展示解 / 三分类）',
    bestW === an.score.weight &&
      bestC === an.score.count &&
      optimal.length === 1 &&
      optimal[0].length === 1 &&
      optimal[0][0] === an.chosen[0] &&
      reVerdicts.join(',') === an.verdicts.join(','),
    `复算得分 (${bestW}, ${bestC})，同优解 ${optimal.length} 个，复算分类 = ${reVerdicts.join('/')}`,
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
