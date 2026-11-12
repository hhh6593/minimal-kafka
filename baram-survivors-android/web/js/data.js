// Classes, skills, hunting grounds. Names follow old Baram (바람의나라 클래식): the four
// classes and their spells, the beginner-to-veteran hunting grounds and their bosses.
// Effect ids (fx) are the magic GIFs from magics/; monster ids are image/ file names.
//
// Skill kinds (see game.js):
//   slash   - the warrior's plain attack: front, then back and sides, several hits
//   blink   - cuts the monster nearest the hero from behind (비영승보)
//   bolt    - flies at the nearest monsters, piercing a few
//   bolt4   - flies up, down, left and right at once (the 첨 spells)
//   strike  - drops on monsters near the hero
//   nova    - bursts around the hero, pushing monsters back
//   orbit   - circles the hero for a while
//   aura    - always around the hero, pushing back and hurting what comes near
//   summon  - calls monsters that fight for the hero for a while
//   heal    - restores health now and then (the 기원 spells)
//   buff    - a short spell on the hero: more damage, unseen, or untouchable

export const CLASSES = [
  { id: 'warrior', name: '전사', hero: '1001', hp: 180, mp: 60, speed: 66, armor: 3, start: 'w_slash', ult: 'w_ult',
    desc: '체력과 방어가 높은 격수. 연속 공격으로 가까운 적을 베어 낸다.' },
  { id: 'rogue', name: '도적', hero: '1002', hp: 130, mp: 80, speed: 80, armor: 1, start: 'r_blink', ult: 'r_ult',
    desc: '빠른 격수. 적의 뒤로 파고들어 베고, 투명해져 숨는다.' },
  { id: 'mage', name: '주술사', hero: '1003', hp: 85, mp: 120, speed: 68, armor: 0, start: 'm_fire', ult: 'm_ult',
    desc: '원거리 공격 주술사. 신수마법으로 적을 태우고 마비시킨다.' },
  { id: 'poet', name: '도사', hero: '1004', hp: 100, mp: 120, speed: 68, armor: 0, start: 'p_orb', ult: 'p_ult',
    revive: true, desc: '회복과 보조의 달인. 몬스터를 불러내고, 한 번은 스스로 부활한다.' },
];

// Spell tiers: a skill's name grows with its level, the way Baram's spells come in grades.
const FIRE = ['화염주', '화염주', '화영열주', '화영열주', '화열참주', '화열참주', '진 화열참주', '극진 화열참주'];
const tier = base => ['', '', ' 2차', ' 2차', ' 3차', ' 3차', ' 4차', ' 5차'].map(t => base + t);

// Growth follows D2 Survivors: a run starts with no spell, only the weapon's plain attack, and
// the first level-up offers the class's first-tier spells. Spells open by character level
// (req: 1, 6, 12, 18) and a spell's level can never pass (character level − req + 1). A spell at
// level 8 with its catalyst passive (evo.with) turns, at the next chest, into its evolved form
// (evo.into), once the character has reached that form's req. Evolved spells are never offered
// on cards. dmg is per hit at level 1; evolved forms count as level 8.
export const SKILLS = {
  // 공통
  c_heal: { cls: 'all', req: 1, name: '누리의 기원', kind: 'heal', fx: '150', heal: 10, cd: 11,
    names: ['누리의 기원', '대지의 기원', '바다의 기원', '동해의 기원', '하늘의 기원', '천공의 기원', '구름의 기원', '태양의 기원'],
    desc: '이따금 체력을 회복한다' },

  // 전사: 붙어 싸우는 연속 공격과 체력 비례 필살기
  w_slash: { cls: 'warrior', req: 1, name: '이중공격', kind: 'slash', fx: null, dmg: 12, cd: 0.8,
    names: ['이중공격', '이중공격', '후면 공격', '삼중공격', '측면 공격', '사중공격', '신검합일', '오중공격'],
    evo: { with: 'power', into: 'w_sword' }, desc: '바로 옆 칸의 몬스터를 연달아 벤다' },
  w_tiger: { cls: 'warrior', req: 1, name: '백호참', kind: 'spell', fx: '20', dmg: 18, cd: 3, range: 2, count: 1,
    scaleHp: 0.06, evo: { with: 'life', into: 'w_roar2' }, desc: '두 칸 안의 몬스터 하나를 크게 벤다. 체력이 높을수록 강하다' },
  w_buff: { cls: 'warrior', req: 6, name: '백호령', kind: 'buff', buff: 'power', fx: '138', cd: 14, duration: 4, power: 0.4,
    names: ['백호령', '백호령', '검신검귀', '검신검귀', '대력검신', '대력검신', '대력검신', '대력검신'],
    desc: '잠시 공격력이 크게 오른다' },
  w_roar: { cls: 'warrior', req: 12, name: '동귀어진', kind: 'nova', fx: '141', dmg: 26, cd: 7, radius: 1, stun: 1,
    hpCost: 0.05, desc: '체력을 조금 깎아 내며, 둘러싼 여덟 칸에 큰 피해를 주고 잠시 멈추게 한다' },
  w_sword: { cls: 'warrior', req: 12, evolved: true, name: '어검술', kind: 'nova', fx: '137', dmg: 9, cd: 1, radius: 1,
    desc: '이중공격 8단 + 힘. 검기가 둘러싼 여덟 칸을 쉼 없이 벤다' },
  w_roar2: { cls: 'warrior', req: 18, evolved: true, name: '포효검황', kind: 'nova', fx: '24', dmg: 22, cd: 3.5, radius: 2,
    scaleHp: 0.1, desc: '백호참 8단 + 체력 단련. 포효와 함께 두 칸 안을 모두 벤다' },
  w_ult: { cls: 'warrior', name: '건곤대나이', kind: 'ult', fx: '25', hpCost: 0.3,
    desc: '체력 30%와 마력을 모두 바쳐, 앞쪽 네 칸(폭 세 칸)의 적을 최대 체력에 비례한 일격으로 벤다' },

  // 도적: 파고들기, 투명, 흡혈
  r_blink: { cls: 'rogue', req: 1, name: '비영승보', kind: 'blink', fx: '43', dmg: 12, cd: 1.2, range: 4, count: 1,
    evo: { with: 'speed', into: 'r_dance' }, desc: '네 칸 안의 몬스터 뒤로 순식간에 옮겨 가며 벤다' },
  r_bolt: { cls: 'rogue', req: 1, name: '뇌진주', kind: 'spell', fx: '48', dmg: 12, cd: 1.8, range: 6, count: 1,
    names: tier('뇌진주'), evo: { with: 'haste', into: 'r_storm' }, desc: '신수마법. 몬스터에게 번개를 떨어뜨린다' },
  r_stealth: { cls: 'rogue', req: 6, name: '투명', kind: 'buff', buff: 'stealth', fx: '57', cd: 12, duration: 2.5,
    desc: '잠시 모습을 감춘다. 몬스터가 공격하지 못하고, 그동안 주는 피해가 3배가 된다' },
  r_drain: { cls: 'rogue', req: 6, name: '흡성대법', kind: 'spell', fx: '9', dmg: 16, cd: 2.8, range: 5, count: 1,
    drain: 0.3, weakest: true, desc: '체력이 낮은 몬스터의 기운을 빨아들여 체력을 회복한다' },
  r_clone: { cls: 'rogue', req: 12, name: '분신', kind: 'buff', buff: 'power', fx: '56', cd: 14, duration: 4, power: 1,
    desc: '분신을 만들어 잠시 공격력이 두 배가 된다' },
  r_dance: { cls: 'rogue', req: 12, evolved: true, name: '백호검무', kind: 'blink', fx: '142', dmg: 7, cd: 0.9, range: 5,
    count: 4, desc: '비영승보 8단 + 민첩. 네 몬스터 사이를 오가며 벤다' },
  r_storm: { cls: 'rogue', req: 18, evolved: true, name: '쇄혼비무', kind: 'strike', fx: '46', dmg: 10, cd: 2, range: 6,
    radius: 1, count: 3, hitAt: 0.3, desc: '뇌진주 8단 + 지력. 번개 세 줄기가 몬스터와 그 주위를 친다' },
  r_ult: { cls: 'rogue', name: '필살검무', kind: 'ult', fx: '52', hpCost: 0.2,
    desc: '체력 20%와 마력을 모두 써서, 네 칸 안의 모든 몬스터를 순식간에 베어 낸다' },

  // 주술사: 신수마법과 상태이상
  m_fire: { cls: 'mage', req: 1, name: '화염주', kind: 'spell', fx: '92', dmg: 10, cd: 1.1, range: 7, count: 1,
    names: FIRE, evo: { with: 'haste', into: 'm_fire3' }, desc: '신수마법. 가까운 몬스터를 불태운다' },
  m_ice: { cls: 'mage', req: 1, name: '백열주', kind: 'strike', fx: '146', dmg: 14, cd: 2.4, range: 7, radius: 0, count: 1,
    hitAt: 0.5, slow: 2, names: tier('백열주'), evo: { with: 'area', into: 'm_quake' },
    desc: '신수마법. 얼음 기둥이 솟아 몬스터를 느리게 한다' },
  m_curse: { cls: 'mage', req: 6, name: '저주', kind: 'strike', fx: '61', dmg: 3, cd: 5, range: 7, radius: 1, count: 1,
    hitAt: 0.3, curse: 4, desc: '몬스터와 그 주위의 방어를 깎아 4초 동안 받는 피해가 40% 늘어난다' },
  m_fire4: { cls: 'mage', req: 12, name: '화염주첨', kind: 'spell4', fx: '95', dmg: 10, cd: 2.2, range: 7,
    names: FIRE.map(n => n + '첨'), desc: '상하좌우 네 줄에서 가장 가까운 몬스터를 한꺼번에 태운다' },
  m_para: { cls: 'mage', req: 12, name: '마비', kind: 'strike', fx: '72', dmg: 4, cd: 4.5, range: 7, radius: 1, count: 1,
    hitAt: 0.2, stun: 2, desc: '몬스터와 그 주위를 마비시켜 잠시 움직이지 못하게 한다' },
  m_fire3: { cls: 'mage', req: 12, evolved: true, name: '삼매진화', kind: 'spell', fx: '139', dmg: 6, cd: 0.8, range: 8,
    count: 4, desc: '화염주 8단 + 지력. 진짜 불이 몬스터 넷을 한꺼번에 태운다' },
  m_quake: { cls: 'mage', req: 18, evolved: true, name: '지폭지술', kind: 'strike', fx: '147', dmg: 14, cd: 3, range: 7,
    radius: 2, count: 2, hitAt: 0.4, desc: '백열주 8단 + 공력. 땅이 터지며 두 칸 안을 휩쓴다' },
  m_ult: { cls: 'mage', name: '헬파이어', kind: 'ult', fx: '148', shield: 5,
    desc: '마력을 모두 써서 화면의 몬스터를 불사르고, 5초 동안 받는 피해를 절반으로 줄이는 보호막을 두른다' },

  // 도사: 회복, 결계, 소환
  p_orb: { cls: 'poet', req: 1, name: '자무주', kind: 'spell', fx: '133', dmg: 9, cd: 1.2, range: 7, count: 1,
    names: tier('자무주'), evo: { with: 'area', into: 'p_wave' }, desc: '신수마법. 기운의 구슬로 몬스터를 친다' },
  p_barrier: { cls: 'poet', req: 6, name: '차폐', kind: 'aura', fx: '134', dmg: 3, cd: 0.8,
    desc: '결계를 둘러, 바로 옆 칸의 몬스터가 공격하지 못하고 조금씩 상하게 한다' },
  p_quake: { cls: 'poet', req: 12, name: '지진', kind: 'strike', fx: '121', dmg: 14, cd: 3.6, range: 6, radius: 1, count: 1,
    hitAt: 0.3, evo: { with: 'life', into: 'p_break' }, desc: '몬스터와 그 주위 여덟 칸을 흔든다' },
  p_summon: { cls: 'poet', req: 1, name: '소혼강신', kind: 'summon', fx: '125', dmg: 7, cd: 9, count: 1, duration: 7,
    allies: ['3013', '3012', '1022', '1023'], desc: '불여우와 맹수를 불러 함께 싸우게 한다' },
  p_guard: { cls: 'poet', req: 18, name: '금강불체', kind: 'buff', buff: 'guard', fx: '135', cd: 16, duration: 2,
    desc: '잠시 어떤 공격도 받지 않는 몸이 된다' },
  p_wave: { cls: 'poet', req: 12, evolved: true, name: '노도성황', kind: 'spell', fx: '117', dmg: 7, cd: 0.9, range: 8,
    count: 3, desc: '자무주 8단 + 공력. 기운이 성난 물결처럼 몬스터 셋을 친다' },
  p_break: { cls: 'poet', req: 18, evolved: true, name: '파력무참', kind: 'strike', fx: '144', dmg: 16, cd: 3, range: 6,
    radius: 2, count: 1, hitAt: 0.3, desc: '지진 8단 + 체력 단련. 땅을 부수어 두 칸 안을 친다' },
  p_ult: { cls: 'poet', name: '백호의희원', kind: 'ult', fx: '130', guard: 3,
    desc: '마력을 모두 써서 체력을 가득 회복하고, 3초 동안 금강불체 상태가 된다' },
};

// Passive upgrades, named after the stats and spells of the game. item: icon (manifest items).
export const PASSIVES = {
  life: { name: '체력 단련', item: 'p_life', max: 5, desc: '최대 체력 +20' },
  power: { name: '힘', item: 'p_power', max: 5, desc: '모든 피해 +10%' },
  haste: { name: '지력', item: 'p_haste', max: 5, desc: '기술 재사용 대기 -8%' },
  speed: { name: '민첩', item: 'p_speed', max: 5, desc: '이동 속도 +8%' },
  area: { name: '공력', item: 'p_area', max: 5, desc: '마법이 닿는 거리와 범위가 늘어난다' },
  magnet: { name: '노획', item: 'magnet', max: 5, desc: '떨어진 돈과 물건을 더 멀리서 줍는다' },
  armor: { name: '무장', item: 'p_armor', max: 5, desc: '받는 피해 -1' },
  mana: { name: '공력증강', item: 'potion', max: 5, desc: '마력 회복 +25%' },
};

export const MAX_SKILLS = 6;
export const MAX_PASSIVES = 6;
export const MAX_SKILL_LEVEL = 8;
export const MAX_PASSIVE_LEVEL = 5;

// Hunting grounds, in the order a new character works through them. monsters: image ids,
// or pages: hunting-ground page numbers from the image download. lv: the level range players
// hunted there. terrain: how the ground is drawn (game.js).
// bgm: the tune for the ground, by the number of the game's MIDI music (see README).
export const STAGES = [
  { id: 'novice', bgm: '11', name: '왕초보사냥터', lv: '1~6', terrain: 'field', map: 'world_1', at: [0.12, 0.9],
    monsters: ['1001', '1002', '1003', '1004'], boss: { id: '1003', name: '우두머리 사슴', scale: 1.8 },
    intro: '다람쥐와 토끼가 뛰노는 첫 사냥터' },
  { id: 'rat', bgm: '07', name: '쥐굴', lv: '6~16', terrain: 'cave', map: 'world_1', at: [0.27, 0.86],
    monsters: ['1005', '1007', '1008', '1009', '1010', '1011', '1012', '1013'],
    mini: { id: '1015', name: '흡혈박쥐' }, boss: { id: '1014', name: '서생원', scale: 1.8 },
    intro: '쥐와 박쥐가 우글거리는 굴' },
  { id: 'snake', bgm: '07', name: '뱀굴', lv: '17~20', terrain: 'cave', map: 'world_1', at: [0.38, 0.72],
    monsters: ['1016', '1018', '1019', '1020', '1021', '12016', '12017'],
    mini: { id: '12013', name: '구렁이', scale: 1.4 }, boss: { id: '12014', name: '왕구렁이', scale: 2 },
    intro: '쥐굴 끝자락과 이어진 뱀들의 소굴' },
  { id: 'deer', bgm: '07', name: '사슴굴', lv: '20~40', terrain: 'cave', map: 'world_1', at: [0.14, 0.62],
    monsters: ['1028', '1029', '1030', '1031', '1003', '1004'], boss: { id: '1032', name: '광록지수', scale: 1.7 },
    intro: '청순록, 적순록, 흑광록, 백광록이 사는 굴' },
  { id: 'pig', bgm: '06', name: '돼지굴', lv: '20~50', terrain: 'cave', map: 'world_1', at: [0.33, 0.55],
    monsters: ['12020', '12021', '12022', '12023'], mini: { id: '12025', name: '돼지 장수' },
    boss: { id: '12024', name: '홍돼지', scale: 1.7 }, intro: '산돼지와 숲돼지가 먼저 덤벼드는 굴' },
  { id: 'bear', bgm: '06', name: '곰·호랑이굴', lv: '20~40', terrain: 'cave', map: 'world_1', at: [0.5, 0.42],
    monsters: ['1022', '1023', '1027', '1036', '1037'], boss: { id: '1025', name: '진웅', scale: 1.6 },
    intro: '곰과 호랑이가 지키는 깊은 굴' },
  { id: 'fox', bgm: '06', name: '여우굴', lv: '30~45', terrain: 'cave', map: 'world_1', at: [0.25, 0.4],
    monsters: ['3012', '3013', '12009', '12003'], mini: { id: '3013', name: '불구미호', scale: 1.6 },
    boss: { id: '12008', name: '구미호', scale: 1.6 }, intro: '꼬리 아홉 달린 여우가 숨어 사는 굴' },
  { id: 'haunt', bgm: '01', name: '흉가', lv: '99', terrain: 'house', map: 'world_1', at: [0.47, 0.3],
    pages: [312, 1001], intro: '원혼이 떠도는 버려진 집. 일반성의 마지막 사냥터' },
  { id: 'goblin', bgm: '05', name: '도깨비굴', lv: '80~99', terrain: 'cave', map: 'world_1', at: [0.67, 0.25],
    pages: [801, 802, 804], intro: '도깨비들이 방망이를 휘두르는 굴' },
  { id: 'bandit', bgm: '09', name: '산적굴', lv: '90~99', terrain: 'cave', map: 'world_1', at: [0.2, 0.25],
    pages: [808, 809, 810, 811], intro: '도적질하는 산적 무리의 소굴' },
  { id: 'japan', bgm: '10', name: '일본', lv: '99+', terrain: 'field2', map: 'world_1', at: [0.78, 0.48],
    pages: [601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612], intro: '바다 건너 낯선 땅의 무사와 요괴들' },
  { id: 'sea', bgm: '12', name: '바닷속', lv: '99+', terrain: 'sea', map: 'world_1', at: [0.85, 0.7],
    pages: [701, 702, 703, 704, 705, 706, 707, 708], intro: '거대한 게와 오징어가 사는 바다 밑' },
  { id: 'island', bgm: '02', name: '환상의 섬', lv: '99+', terrain: 'island', map: 'world_4', at: [0.3, 0.55],
    pages: [1401, 1403, 1405, 1407, 1409, 1604, 1606, 1607, 1608, 1609, 1610, 1611], intro: '원시 부족과 괴물이 사는 남쪽 섬' },
  { id: 'volcano', bgm: '05', name: '환상의 섬 화산', lv: '99+', terrain: 'lava', map: 'world_4', at: [0.68, 0.18],
    pages: [1703, 1704, 1707], intro: '불의 정령이 들끓는 화산' },
];

// The clock of a hunting ground, as D2 Survivors' acts: the boss comes at 6:00; a named
// leader (with followers) at 2:15 and 4:45; a pack of champions every 90 seconds.
export const BOSS_AT = 6 * 60;
export const MINI_AT = [135, 285];
export const CHAMPIONS_AT = [90, 180, 270];

// Shared effects: hit spark, death puff, level-up, heal, shield and the ghost a dead hero becomes.
export const FX = { hit: '29', death: '29', levelup: '131', heal: '150', ghost: '151', shield: '132', summon: '125' };

/** A skill's name at a level. */
export function skillName(id, level) {
  const s = SKILLS[id];
  return s.names ? s.names[Math.min(level, s.names.length) - 1] : s.name;
}

/** What a skill does at a level: base values grown by level and the hero's passives. */
export function skillStats(id, level, p) {
  const s = SKILLS[id];
  const s0 = SKILLS[id];
  if (s0.evolved) level = 8;
  const l = level - 1;
  return {
    dmg: (s.dmg || 0) * Math.pow(1.22, l) * (1 + 0.1 * p.power),
    cd: s.cd * Math.pow(0.93, l) * Math.pow(0.92, p.haste),
    // Tiles: reach grows by one every three levels, and with 공력.
    range: (s.range || 0) + Math.floor(l / 3) + Math.floor(p.area / 2),
    radius: s.radius === undefined ? 0 : s.radius + Math.floor(level / 4) + Math.floor(p.area / 3),
    count: (s.count || 1) + (level >= 3) + (level >= 5) + (level >= 7),
    duration: (s.duration || 0) * (1 + 0.1 * l),
    heal: (s.heal || 0) * (1 + 0.45 * l),
  };
}

/** What the next level brings, for the level-up choices. */
export function levelText(id, level) {
  const s = SKILLS[id];
  if (level === 1) return s.desc + (s.evo ? ` (8단 + ${PASSIVES[s.evo.with].name} → ${SKILLS[s.evo.into].name})` : '');
  if (s.kind === 'slash') {
    return ['', '피해 +22%', '뒤쪽 칸도 함께 벤다', '세 번 연달아 벤다', '양옆 칸도 함께 벤다', '네 번 연달아 벤다',
      '공격력 +30%', '다섯 번 연달아 벤다'][level - 1];
  }
  if (s.kind === 'heal') return '회복량 +45%, 재사용 -7%';
  if (s.kind === 'buff') return '지속 시간 +10%, 재사용 -7%';
  const parts = ['피해 +22%', '재사용 -7%'];
  if (level === 3 || level === 5 || level === 7) parts.push(s.kind === 'summon' ? '소환 +1' : '대상 +1');
  if (s.range && (level - 1) % 3 === 0) parts.push('거리 +1칸');
  if (s.radius !== undefined && level % 4 === 0) parts.push('범위 +1칸');
  return parts.join(', ');
}
