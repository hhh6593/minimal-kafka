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
  { id: 'warrior', name: '전사', hero: '1001', hp: 180, dmgK: 1.6, mp: 60, speed: 66, armor: 3, start: 'w_slash', ult: 'w_ult',
    desc: '체력과 방어가 높은 격수. 연속 공격으로 가까운 적을 베어 낸다.' },
  { id: 'rogue', name: '도적', hero: '1002', hp: 130, dmgK: 1.5, mp: 80, speed: 80, armor: 1, start: 'r_blink', ult: 'r_ult',
    desc: '빠른 격수. 적의 뒤로 파고들어 베고, 투명해져 숨는다.' },
  // dmgK 1.4: the 주술사's first weapon used to count as 태염무신's 11등급 (×2.32, avatar.js WRITTEN),
  // and its 왕초보 balance was set on that; at its true 0등급 bot clears of 왕초보 fell from 3/3 to
  // 1/5 (smart.js bot), 5/6 at 1.4. (도적·도사 kept theirs: 도사 3/4, and the 도적's losses
  // were the bot's rushing, the same at 1.9 and 2.6.)
  { id: 'mage', name: '주술사', hero: '1003', hp: 110, dmgK: 1.4, mp: 120, speed: 68, armor: 1, start: 'm_fire', ult: 'm_ult',
    desc: '원거리 공격 주술사. 신수마법으로 적을 태우고 마비시킨다.' },
  { id: 'poet', name: '도사', hero: '1004', hp: 100, mp: 120, speed: 68, armor: 0, start: 'p_orb', ult: 'p_ult',
    revive: true, desc: '회복과 보조의 달인. 몬스터를 불러내고, 한 번은 스스로 부활한다.' },
  // 바람의나라 연's 궁사 (Job_6): its figure, bows, skills and sounds come only from 연's resources.
  { id: 'archer', name: '궁사', hero: '1002', hp: 155, mp: 100, speed: 74, armor: 2, start: 'a_shot', ult: 'a_ult',
    desc: '활을 쏘는 원거리 격수. 멀리서 화살로 꿰뚫고, 터뜨리고, 비처럼 쏟아붓는다.' },
  // 바람의나라 연's 무사 (Job_7): spear, figure, skills and sounds only from 연's resources.
  { id: 'lancer', name: '무사', hero: '1001', hp: 160, dmgK: 1.25, mp: 80, speed: 70, armor: 2, start: 'l_moon', ult: 'l_ult',
    desc: '창을 다루는 근접 격수. 일렬로 꿰찌르고, 넓게 휘두르고, 돌진하며 쓸어 낸다.' },
  // 바람의나라 연's 격투가 (Job_5): fists, figure, skills and sounds only from 연's resources.
  { id: 'monk', name: '격투가', hero: '1001', hp: 210, dmgK: 2.1, mp: 70, speed: 76, armor: 3, start: 'mk_bung', ult: 'mk_ult',
    desc: '맨주먹의 근접 격수. 파고들어 두들기고, 혈을 짚어 묶고, 땅을 갈라 터뜨린다.' },
  // 바람의나라 연's 마도사 (Job_11): 단봉, figure, skills and sounds only from 연's resources.
  { id: 'magus', name: '마도사', hero: '1003', hp: 105, dmgK: 0.55, mp: 130, speed: 68, armor: 1, start: 'md_sphere', ult: 'md_ult',
    desc: '금기된 마력을 다루는 원거리 술사. 기공구슬로 얼리고 태우고, 광폭기로 화면을 휩쓴다.' },
  // 바람의나라 연's 천인 (Job_8): 호리병·포, figure, skills and sounds only from 연's resources.
  { id: 'celestial', name: '천인', hero: '1003', hp: 190, dmgK: 0.52, mp: 110, speed: 72, armor: 2, start: 'cl_boom', ult: 'cl_ult',
    desc: '하늘의 힘을 다루는 술사. 불꽃과 번개를 떨어뜨리고, 몬스터 사이로 뛰어들어 휩쓴다.' },
  // 바람의나라 연's 도깨비 (Job_9): 방망이, figure, skills and sounds only from 연's resources.
  { id: 'dokkaebi', name: '도깨비', hero: '1001', hp: 210, dmgK: 2.0, mp: 70, speed: 66, armor: 3, start: 'dk_repel', ult: 'dk_ult',
    desc: '방망이를 휘두르는 근접 장사. 후려치고 메치고, 일격필살로 강한 적을 내리찍는다.' },
  // 바람의나라 연's 차사 (Job_10): 백도, figure, skills and sounds only from 연's resources.
  { id: 'reaper', name: '차사', hero: '1002', hp: 180, dmgK: 1.6, mp: 90, speed: 74, armor: 3, start: 'rp_cut', ult: 'rp_ult',
    desc: '저승의 백도를 든 근접 격수. 베고 파고들며, 영혼의 화살과 업화로 넓게 거둔다.' },
];

// Spell tiers: a skill's name grows with its level, the way Baram's spells come in grades.
const FIRE = ['화염주', '화염주', '화영열주', '화영열주', '화열참주', '화열참주', '진 화열참주', '극진 화열참주'];
const tier = base => ['', '', ' 2차', ' 2차', ' 3차', ' 3차', ' 4차', ' 5차'].map(t => base + t);

// The spell tree follows the old game's 승급 (the site's list: 일반, then 1차 to 4차 승급).
// 일반 spells are on the cards from the start (opening by character level, req 1/6/12/18, as
// in D2 Survivors). A 승급 spell (promo: 1-4) joins the cards once the class has that 승급,
// which comes from conquering 쥐굴, 사슴굴, 흉가 and 도깨비굴 with it (PROMOS). Some spells
// grow into a higher 승급's spell of the same line (up: 백호참 → 극백호참): at 8단, with that
// 승급, at the next chest. Grown spells (evolved) are never on the cards and count as 8단 for
// reach; their damage grows as 5단 would. dmg is per hit at 1단. A spell's 단 can never pass
// (character level − req + 1).
export const SKILLS = {
  // 공통: 기원 — 누리, 대지, 바다 … 구름 (태양의기원 is the mage's 1차 승급 of its own).
  c_heal: { fxs: ['3', '4', '64', '32', '10', '42', '79', '79'], cls: 'all', req: 1, name: '누리의 기원', kind: 'heal', fx: '3', heal: 10, cd: 11,
    names: ['누리의 기원', '대지의 기원', '바다의 기원', '동해의 기원', '하늘의 기원', '천공의 기원', '구름의 기원', '구름의 기원'],
    desc: '이따금 체력을 회복한다' },

  // 전사 — 일반: 이중공격 계열(후면·측면·삼중·사중·오중은 이중공격의 단), 백호령 계열, 동귀어진, 건곤대나이
  w_slash: { cls: 'warrior', req: 1, name: '이중공격', kind: 'slash', fx: null, dmg: 12, cd: 0.8,
    names: ['이중공격', '이중공격', '후면 공격', '삼중공격', '측면 공격', '사중공격', '신검합일', '오중공격'],
    desc: '바라보는 앞 칸을 두 번 벤다. 단이 오르면 뒤(후면)·양옆(측면)도 함께, 최대 다섯 번(오중)' },
  w_buff: { fxs: ['6', '6', '11', '11', '15', '15', '16', '16'], cls: 'warrior', req: 6, name: '백호령', kind: 'buff', buff: 'power', fx: '6',
    cd: 14, duration: 4, power: 0.4, names: ['백호령', '백호령', '검신검귀', '검신검귀', '대력검신', '대력검신', '대력검신', '대력검신'],
    desc: '잠시 공격력이 크게 오른다' },
  w_roar: { cls: 'warrior', req: 12, name: '동귀어진', kind: 'cleave', fx: '19', dmg: 60, cd: 6, depth: 1, stun: 1, scaleHp: 0.12,
    hpCost: 0.08, desc: '체력을 깎아 바치며 정면 한 칸의 몬스터에게 아주 큰 피해를 준다' },
  // 1차 승급
  w_tiger: { promo: 1, cls: 'warrior', req: 6, name: '백호참', kind: 'cleave', fx: '20', dmg: 20, cd: 2.6, radius: 0, scaleHp: 0.05,
    up: 'w_roar2', desc: '정면 한 칸을 크게 벤다. 4단부터 앞쪽 역삼각형으로 넓어진다. 체력이 높을수록 강하다' },
  // 2차 승급
  w_fly: { promo: 2, cls: 'warrior', req: 10, name: '어검술', kind: 'cleave', fx: '22', dmg: 16, cd: 2.4, depth: 2, max: 4,
    scaleHp: 0.04, desc: '검을 날려 앞쪽 ㅜ자 역삼각형(네 칸)의 몬스터 넷을 벤다' },
  w_jin: { promo: 2, cls: 'warrior', req: 10, name: '진백호령', kind: 'buff', buff: 'power', fx: '15', cd: 16, duration: 5, power: 0.8,
    desc: '백호의 힘이 깃들어, 잠시 공격력이 두 배 가까이 된다' },
  // 3차 승급
  w_howl: { promo: 3, cls: 'warrior', req: 14, name: '포효검황', kind: 'screen', fx: '25', dmg: 16, cd: 6, falloff: 0.08,
    desc: '포효와 함께 화면의 모든 몬스터를 친다. 한 칸 멀어질수록 8%씩 약하다' },
  w_sword: { promo: 3, cls: 'warrior', req: 14, name: '쇄혼비무', kind: 'slash', fx: '23', dmg: 14, cd: 1.4, dash: 4, hitsMax: 3,
    desc: '바라보는 쪽 네 칸 안의 몬스터에게 날아들어 앞뒤 양옆을 세 번 벤다' },
  w_chohon: { promo: 3, cls: 'warrior', req: 14, name: '초혼비무', kind: 'nova', fx: '24', dmg: 18, cd: 3, radius: 0,
    desc: '혼을 부르는 검무로 둘러싼 칸을 벤다' },
  // 4차 승급
  w_roar2: { promo: 4, cls: 'warrior', req: 18, evolved: true, name: '극백호참', kind: 'cleave', fx: '140', dmg: 24, cd: 3, radius: 0, max: 9,
    scaleHp: 0.08, desc: '백호참 8단 + 4차 승급. 앞쪽 역삼각형(아홉 칸)의 몬스터 아홉을 한꺼번에 벤다' },
  w_blood: { promo: 4, cls: 'warrior', req: 18, name: '혈겁만파', kind: 'screen', fx: '141', dmg: 20, cd: 5, curse: 3,
    desc: '피의 물결이 화면을 덮어 모든 몬스터를 치고 저주한다' },
  w_talm: { promo: 4, cls: 'warrior', req: 18, name: '탈명사식\'염', kind: 'strike', fx: '139', dmg: 44, cd: 3.5, range: 7, radius: 1,
    count: 1, hitAt: 0.3, shape: 'plus', strongest: true, desc: '불의 탈명사식. 가장 강한 몬스터(보스를 먼저)와 그 상하좌우를 불사른다' },
  w_ult: { cls: 'warrior', name: '건곤대나이', kind: 'ult', fx: '14', hpCost: 0.3,
    desc: '체력 30%와 마력을 모두 바쳐, 앞쪽 네 칸(폭 세 칸)의 적을 최대 체력에 비례한 일격으로 벤다' },

  // 도적 — 일반: 비영승보, 뇌진주(신수마법), 투명, 흡성대법, 분신, 필살검무
  r_blink: { cls: 'rogue', req: 1, name: '비영승보', kind: 'blink', fx: null, dmg: 12, cd: 1.2, range: 4, count: 1,
    desc: '바라보는 쪽 네 칸 안의 몬스터 등 뒤로 순식간에 옮겨 가며 벤다' },
  r_bolt: { elem: 'thunder', fxs: ['31', '31', '38', '38', '46', '46', '48', '89'], cls: 'rogue', req: 1, name: '뇌진주', kind: 'spell', fx: '31',
    dmg: 12, cd: 1.8, range: 6, count: 1, names: tier('뇌진주'), up: 'r_storm', desc: '신수마법. 몬스터에게 번개를 떨어뜨린다' },
  r_stealth: { cls: 'rogue', req: 6, name: '투명', kind: 'buff', buff: 'stealth', fx: '36', cd: 10, duration: 5,
    desc: '5초 동안 모습을 감춰 몬스터가 놓치고 헤맨다. 잠시 다가간 뒤 가장 강한 기술로 암습해 3.5배로 치명타를 넣고, 이어 3초 동안 모든 공격이 배후 공격(피해 +50%)이 된다' },
  r_drain: { cls: 'rogue', req: 6, name: '흡성대법', kind: 'spell', fx: '49', dmg: 16, cd: 2.8, range: 5, count: 1,
    drain: 0.3, weakest: true, desc: '체력이 낮은 몬스터의 기운을 빨아들여 체력을 회복한다' },
  r_clone: { cls: 'rogue', req: 12, name: '분신', kind: 'buff', buff: 'power', fx: '33', cd: 14, duration: 4, power: 1,
    desc: '분신을 만들어 잠시 공격력이 두 배가 된다' },
  // 1차 승급
  r_dance: { promo: 1, cls: 'rogue', req: 6, name: '백호검무', kind: 'blink', fx: '52', dmg: 8, cd: 1.6, range: 5, count: 3,
    desc: '바라보는 쪽의 몬스터에게 날아들어 세 번 벤다' },
  // 2차 승급
  r_flysword: { promo: 2, cls: 'rogue', req: 10, name: '이기어검', kind: 'blink', fx: '53', dmg: 13, cd: 1.8, range: 5, count: 2,
    curse: 2, desc: '바라보는 쪽 다섯 칸 안의 몬스터 뒤로 날아들어 두 번 베고 저주를 건다' },
  r_budong: { promo: 2, cls: 'rogue', req: 10, name: '부동력', kind: 'buff', buff: 'guard', fx: '57', cd: 18, duration: 1.5,
    desc: '잠시 어떤 공격에도 꿈쩍하지 않는다' },
  // 3차 승급
  r_formless: { promo: 3, cls: 'rogue', req: 14, name: '무형검', kind: 'line', fx: '55', dmg: 15, cd: 1.8, depth: 4,
    desc: '보이지 않는 검이 바라보는 쪽 일렬 네 칸을 꿰뚫는다' },
  // 4차 승급
  r_heaven: { promo: 4, cls: 'rogue', req: 18, name: '파천검무', kind: 'line', fx: '144', dmg: 18, cd: 2, depth: 6, dash: true,
    desc: '바라보는 쪽 일렬 여섯 칸을 지나가며 모두 벤다' },
  r_storm: { promo: 4, cls: 'rogue', req: 18, evolved: true, name: '탈명사식\'뇌', kind: 'strike', fx: '143', dmg: 10, cd: 2, range: 6,
    radius: 1, count: 3, hitAt: 0.3, shape: 'plus', desc: '뇌진주 8단 + 4차 승급. 번개 세 줄기가 몬스터와 그 상하좌우를 친다' },
  r_bunhon: { promo: 4, cls: 'rogue', req: 18, name: '분혼경천', kind: 'screen', fx: '145', dmg: 10, cd: 7, stun: 1,
    desc: '혼을 흩어 하늘을 놀라게 한다. 화면의 모든 몬스터를 치고 잠시 멈춘다' },
  r_ult: { cls: 'rogue', name: '필살검무', kind: 'ult', fx: '43', hpCost: 0.2,
    desc: '체력 20%와 마력을 모두 써서, 네 칸 안의 모든 몬스터를 순식간에 베어 낸다' },

  // 주술사 — 일반: 신수마법(화염주·백열주), 화염주첨, 저주, 마비, 헬파이어
  m_fire: { elem: 'fire', fxs: ['7', '7', '12', '12', '92', '92', '96', '96'], cls: 'mage', req: 1, name: '화염주', kind: 'spell', fx: '7',
    dmg: 14, cd: 1.1, range: 7, count: 1, names: FIRE, up: 'm_fire3', desc: '신수마법. 가까운 몬스터를 불태운다' },
  m_ice: { elem: 'earth', fxs: ['29', '29', '51', '51', '49', '49', '56', '56'], cls: 'mage', req: 1, name: '백열주', kind: 'strike', fx: '29',
    dmg: 19, cd: 2.1, range: 7, radius: 0, count: 1, hitAt: 0.5, slow: 2, names: tier('백열주'), up: 'm_quake',
    desc: '신수마법. 백호의 땅 기운으로 몬스터를 치고 느리게 한다' },
  m_curse: { cls: 'mage', req: 6, name: '저주', kind: 'strike', fx: '84', dmg: 3, cd: 5, range: 7, radius: 1, count: 1,
    hitAt: 0.3, curse: 4, desc: '몬스터와 그 주위의 방어를 깎아 4초 동안 받는 피해가 40% 늘어난다' },
  m_fire4: { elem: 'fire', fxs: ['92', '92', '94', '94', '96', '96', '144', '144'], cls: 'mage', req: 1, name: "화염주'첨", kind: 'spell4', fx: '92',
    dmg: 10, cd: 2.2, range: 5, names: FIRE.map(n => n.replace(' ', '') + "'첨"), desc: '상하좌우 네 줄에서 가장 가까운 몬스터를 한꺼번에 태운다(사정거리가 짧다)' },
  m_para: { cls: 'mage', req: 12, name: '마비', kind: 'strike', fx: '85', dmg: 4, cd: 4.5, range: 7, radius: 1, count: 1,
    hitAt: 0.2, stun: 2, desc: '몬스터와 그 주위를 마비시켜 잠시 움직이지 못하게 한다' },
  // 1차 승급
  m_sun: { promo: 1, cls: 'mage', req: 6, name: '태양의 기원', kind: 'heal', fx: '93', heal: 18, cd: 13, mana: 0.3,
    desc: '태양의 기운으로 체력을 크게 회복하고 마력도 조금 채운다' },
  // 2차 승급
  m_sammae: { promo: 2, cls: 'mage', req: 10, name: '삼매진화', kind: 'spell4', fx: '94', dmg: 22, cd: 3, range: 6, pierce: true,
    desc: '상하좌우 네 줄로 헬파이어를 쏘아 줄 위를 모두 태운다' },
  m_hoche: { promo: 2, cls: 'mage', req: 10, name: '호체주술', kind: 'buff', buff: 'shield', fx: '95', cd: 15, duration: 4,
    desc: '주술로 몸을 감싸 잠시 받는 피해를 절반으로 줄인다' },
  // 3차 승급
  m_quake: { promo: 3, cls: 'mage', req: 14, evolved: true, name: '지폭지술', kind: 'screen', fx: '96', dmg: 14, cd: 5, slow: 2,
    desc: '백열주 8단 + 3차 승급. 땅이 터지며 화면의 모든 몬스터를 치고 느리게 한다' },
  m_magi: { promo: 3, cls: 'mage', req: 14, name: '마기지체', kind: 'buff', buff: 'haste', fx: '98', cd: 14, duration: 4,
    desc: '마기를 몸에 둘러, 잠시 모든 마법이 1.6배 빨리 돈다' },
  m_nodo: { promo: 3, cls: 'mage', req: 14, name: '노도성황', kind: 'screen', fx: '97', dmg: 6, cd: 8, stun: 1.2,
    desc: '노한 물결이 화면의 모든 몬스터를 치고 잠시 멈춘다' },
  // 4차 승급
  m_fire3: { promo: 4, cls: 'mage', req: 18, evolved: true, name: '폭류유성', kind: 'screen', fx: '148', dmg: 12, cd: 4,
    desc: '화염주 8단 + 4차 승급. 유성이 쏟아져 화면의 모든 몬스터를 친다' },
  m_talm: { promo: 4, cls: 'mage', req: 18, name: '탈명사식\'지', kind: 'strike', fx: '147', dmg: 26, cd: 3.5, range: 7, radius: 1,
    count: 2, hitAt: 0.3, shape: 'plus', desc: '땅의 탈명사식. 몬스터 둘과 그 상하좌우를 땅에서 터뜨린다' },
  m_ult: { cls: 'mage', name: '헬파이어', kind: 'ult', fx: '92', shield: 5,
    desc: '마력을 모두 써서 화면의 몬스터를 불사르고, 5초 동안 받는 피해를 절반으로 줄이는 보호막을 두른다' },

  // 도사 — 일반: 신수마법(자무주), 차폐, 소혼강신, 지진, 금강불체, 태양의희원
  p_orb: { elem: 'water', fxs: ['31', '31', '38', '38', '46', '46', '48', '89'], cls: 'poet', req: 1, name: '자무주', kind: 'spell', fx: '31',
    dmg: 11, cd: 1.2, range: 7, count: 1, names: tier('자무주'), desc: '신수마법. 현무의 물 기운으로 몬스터를 친다' },
  p_summon: { cls: 'poet', req: 1, name: '소혼강신', kind: 'summon', fx: null, dmg: 8, cd: 9, count: 1, duration: 9,
    allies: ['3013', '3012', '1022', '1023'], beasts: [null, null, 'jinmyo', 'saryeong', 'heukhwa', 'kurakan', 'garuda', 'ganesha'],
    desc: '불여우와 맹수를 불러 함께 싸우게 한다. 3단부터는 괴수(진묘수·사령웅·흑화랑·쿠라칸·가루다·가네샤)를 부른다' },
  p_barrier: { cls: 'poet', req: 6, name: '차폐', kind: 'aura', fx: '25', dmg: 3, cd: 0.8,
    desc: '바로 옆 칸의 몬스터가 공격하지 못하게 막고 조금씩 상하게 한다' },
  p_quake: { cls: 'poet', req: 12, name: '지진', kind: 'strike', fx: '123', dmg: 14, cd: 3.6, range: 6, radius: 1, count: 1,
    hitAt: 0.3, shape: 'plus', up: 'p_break', desc: '몬스터와 그 상하좌우(+자)를 흔든다. 단이 오를수록 길어진다' },
  p_guard: { cls: 'poet', req: 18, name: '금강불체', kind: 'buff', buff: 'guard', fx: '126', cd: 16, duration: 2,
    desc: '잠시 어떤 공격도 받지 않는 몸이 된다' },
  // 1차 승급
  p_baekho: { promo: 1, cls: 'poet', req: 6, name: '백호의희원', kind: 'heal', fx: '130', heal: 20, cd: 12,
    desc: '백호의 힘으로 체력을 크게 회복한다' },
  // 2차 승급
  p_reflect: { promo: 2, cls: 'poet', req: 10, name: '반탄공', kind: 'buff', buff: 'reflect', fx: '132', cd: 12, duration: 4,
    desc: '잠시 때린 몬스터에게 받은 피해의 세 배를 되돌린다' },
  p_spirit: { promo: 2, cls: 'poet', req: 10, name: '신령의기원', kind: 'heal', fx: '131', heal: 22, cd: 14, shieldT: 3, up: 'p_phoenix',
    desc: '체력을 크게 회복하고 3초 동안 받는 피해를 절반으로 줄인다' },
  // 3차 승급
  p_aegis: { promo: 3, cls: 'poet', req: 14, name: '신령지익진', kind: 'buff', buff: 'shield', fx: '135', cd: 14, duration: 5,
    desc: '진을 펼쳐 잠시 받는 피해를 절반으로 줄인다' },
  p_wave: { promo: 3, cls: 'poet', req: 14, name: '파력무참진', kind: 'nova', fx: '134', dmg: 12, cd: 1.8, radius: 1,
    desc: '발밑에 진을 펼쳐 둘레 두 칸 안의 몬스터를 친다' },
  // 4차 승급
  p_phoenix: { promo: 4, cls: 'poet', req: 18, evolved: true, name: '봉황의기원', kind: 'heal', fx: '150', heal: 30, cd: 12, guard: 1.5,
    desc: '신령의기원 8단 + 4차 승급. 봉황이 날아올라 체력을 크게 채우고 잠시 어떤 공격도 받지 않는다' },
  p_break: { promo: 4, cls: 'poet', req: 18, evolved: true, name: '귀염추혼소', kind: 'screen', fx: '120', dmg: 12, cd: 5, curse: 4,
    desc: '지진 8단 + 4차 승급. 화면의 모든 몬스터에 혼마술을 걸어 받는 피해를 늘리고 친다' },
  p_talm: { promo: 4, cls: 'poet', req: 18, name: '탈명사식\'풍', kind: 'strike', fx: '24', dmg: 22, cd: 3.5, range: 7, radius: 1,
    count: 2, hitAt: 0.3, shape: 'plus', desc: '바람의 탈명사식. 몬스터 둘과 그 상하좌우를 휩쓴다' },
  p_ult: { cls: 'poet', name: '태양의희원', kind: 'ult', fx: '124', guard: 3,
    desc: '마력을 모두 써서 체력을 가득 회복하고, 3초 동안 어떤 공격도 받지 않는다' },

  // 5차~7차 승급: today's client's skills (the 신화 기술능력부여 lists by class; 8차·9차 left out:
  // 흑룡광참, 멸화의검, 뇌격구, 섬광 … are 8차). Which of 5·6·7차 each was is not listed, so they
  // stand by strength. The 7차 skills show today's effects.
  w_rush: { promo: 5, cls: 'warrior', req: 21, name: '회선돌격', kind: 'line', fx: '22', dmg: 22, cd: 2.2, depth: 5,
    desc: '회오리치며 바라보는 쪽 일렬 다섯 칸을 꿰뚫는다' },
  w_stone: { promo: 5, cls: 'warrior', req: 21, name: '석갑', kind: 'buff', buff: 'shield', fx: '21', cd: 15, duration: 4,
    desc: '몸을 돌처럼 굳혀 잠시 받는 피해가 절반이 된다' },
  w_dragon: { promo: 6, cls: 'warrior', req: 24, name: '황룡승천', kind: 'nova', fx: '140', dmg: 30, cd: 4, radius: 2,
    desc: '황룡이 솟구쳐 둘레 두 칸 안의 몬스터를 모두 친다' },
  w_frenzy: { promo: 6, cls: 'warrior', req: 24, name: '광폭', kind: 'buff', buff: 'power', fx: '25', cd: 18, duration: 5, power: 1,
    desc: '광폭해져 잠시 공격력이 두 배가 된다' },
  w_thunder: { promo: 7, cls: 'warrior', req: 27, name: '천둥낙뢰', kind: 'screen', fx: '141', modern: 'new_w_talm', dmg: 34, cd: 7,
    stun: 0.8, falloff: 0.04, desc: '하늘에서 천둥이 떨어져 화면의 모든 몬스터를 치고 잠시 멈추게 한다' },
  w_flash: { promo: 7, cls: 'warrior', req: 27, name: '섬광일섬', kind: 'line', fx: '139', modern: 'new_w_blood', dmg: 40, cd: 3, depth: 8,
    desc: '빛처럼 한 번 베어 바라보는 쪽 일렬 여덟 칸을 가른다' },
  r_venom: { promo: 5, cls: 'rogue', req: 21, name: '맹독표창', kind: 'spell', fx: '53', dmg: 14, cd: 1.6, range: 7, count: 3, curse: 3,
    desc: '독 묻은 표창 셋을 던져 맞은 몬스터가 받는 피해를 늘린다' },
  r_phantom: { promo: 5, cls: 'rogue', req: 21, name: '환영분신', kind: 'buff', buff: 'power', fx: '51', cd: 16, duration: 5, power: 0.8,
    desc: '환영 분신이 함께 싸워 잠시 공격력이 크게 오른다' },
  r_shuriken: { promo: 6, cls: 'rogue', req: 24, name: '묵마십자수리검', kind: 'strike', fx: '145', dmg: 22, cd: 2.8, range: 6, radius: 2,
    count: 2, hitAt: 0.3, shape: 'plus', desc: '거대한 십자 수리검이 몬스터 둘과 그 상하좌우 두 칸을 친다' },
  r_hidden: { promo: 6, cls: 'rogue', req: 24, name: '은형참절도', kind: 'blink', fx: '144', dmg: 16, cd: 1.8, range: 5, count: 4,
    desc: '모습을 감춘 채 바라보는 쪽 몬스터에게 날아들어 네 번 벤다' },
  r_bloom: { promo: 7, cls: 'rogue', req: 27, name: '화무십일홍', kind: 'screen', fx: '145', modern: 'new_r_storm', dmg: 34, cd: 6.5,
    falloff: 0.04, desc: '꽃잎처럼 흩날리는 검기가 화면의 모든 몬스터를 벤다' },
  r_kill: { promo: 7, cls: 'rogue', req: 27, name: '대살격', kind: 'cleave', fx: '144', modern: 'new_r_heaven', dmg: 40, cd: 3,
    radius: 0, max: 9, desc: '앞쪽 역삼각형(아홉 칸)의 몬스터를 단숨에 벤다' },
  m_frost: { promo: 5, cls: 'mage', req: 21, name: '서리한파', kind: 'screen', fx: '96', dmg: 18, cd: 5, slow: 3,
    desc: '서리 바람이 화면을 덮어 모든 몬스터를 치고 느리게 한다' },
  m_wisdom: { promo: 5, cls: 'mage', req: 21, name: '술사의지혜', kind: 'buff', buff: 'haste', fx: '98', cd: 16, duration: 6,
    desc: '지혜가 깨어 잠시 기술을 훨씬 빨리 쓴다' },
  m_desert: { promo: 6, cls: 'mage', req: 24, name: '열사지대', kind: 'strike', fx: '148', dmg: 20, cd: 3.5, range: 7, radius: 2, count: 1,
    hitAt: 0.3, curse: 3, desc: '불타는 모래땅을 펼쳐 넓은 곳을 태우고 받는 피해를 늘린다' },
  m_twin: { promo: 6, cls: 'mage', req: 24, name: '천뢰마옥쌍구', kind: 'spell', fx: '89', dmg: 22, cd: 2, range: 7, count: 3,
    desc: '천뢰의 구슬 셋이 가까운 몬스터 셋을 친다' },
  m_cross: { promo: 7, cls: 'mage', req: 27, name: '십자소상파환겁', kind: 'strike', fx: '147', modern: 'new_m_talm', dmg: 34, cd: 4,
    range: 8, radius: 3, count: 2, hitAt: 0.35, shape: 'plus', desc: '거대한 십자 불꽃이 몬스터 둘과 그 상하좌우 세 칸을 태운다' },
  m_inferno: { promo: 7, cls: 'mage', req: 27, name: '염화지옥', kind: 'screen', fx: '148', modern: 'new_m_fire3', dmg: 38, cd: 7,
    falloff: 0.03, desc: '지옥의 불길이 화면의 모든 몬스터를 태운다' },
  p_judge: { promo: 5, cls: 'poet', req: 21, name: '천벌', kind: 'strike', fx: '149', dmg: 18, cd: 2.5, range: 7, radius: 1, count: 3,
    hitAt: 0.3, desc: '하늘의 벌이 몬스터 셋과 그 둘레에 떨어진다' },
  p_wargod: { promo: 5, cls: 'poet', req: 21, name: '무신의가호', kind: 'buff', buff: 'power', fx: '132', cd: 16, duration: 6, power: 0.6,
    desc: '무신의 가호로 잠시 공격력이 오른다' },
  p_burst: { promo: 6, cls: 'poet', req: 24, name: '천광폭기', kind: 'spell', fx: '131', dmg: 18, cd: 2.2, range: 7, count: 4,
    desc: '하늘빛이 터지며 가까운 몬스터 넷을 친다' },
  p_realm: { promo: 6, cls: 'poet', req: 24, name: '선인의영역', kind: 'heal', fx: '135', heal: 30, cd: 13, guard: 1.5,
    desc: '선인의 영역을 펼쳐 크게 회복하고 잠시 공격을 받지 않는다' },
  p_bagua: { promo: 7, cls: 'poet', req: 27, name: '천신팔괘진', kind: 'screen', fx: '134', dmg: 30, cd: 6,
    falloff: 0.04, desc: '팔괘진을 펼쳐 화면의 모든 몬스터를 친다' },
  p_dragongod: { promo: 7, cls: 'poet', req: 27, name: '용신의가호', kind: 'buff', buff: 'shield', fx: '150', modern: 'new_p_phoenix',
    cd: 15, duration: 6, desc: '용신의 가호로 오래 받는 피해가 절반이 된다' },

  // 8차·9차 승급: today's client's own (the 8차 비급 list at 습득레벨 800-850, the 9차 list at 900),
  // three a class each; each 9차 ends in the class's 궁극기 with today's effect.
  w_blackdragon: { promo: 8, cls: 'warrior', req: 30, name: '흑룡광참', kind: 'nova', fx: '141', dmg: 32, cd: 2.4, radius: 1,
    desc: '검은 용의 칼바람이 몸 둘레를 휘감아 벤다' },
  w_sentence: { promo: 8, cls: 'warrior', req: 30, name: '사형선고', kind: 'strike', fx: '20', dmg: 28, cd: 3.5, range: 6, radius: 1,
    count: 1, hitAt: 0.3, stun: 2, desc: '몬스터와 그 둘레에 사형을 선고해 붙잡아 두고 벤다' },
  w_dawn: { promo: 8, cls: 'warrior', req: 30, name: '조광', kind: 'buff', buff: 'power', fx: '21', cd: 18, duration: 6, power: 1.2,
    desc: '아침 햇살 같은 기세로 잠시 공격력이 두 배를 넘는다' },
  w_swords: { promo: 9, cls: 'warrior', req: 33, name: '호기어검', kind: 'spell', fx: '22', dmg: 30, cd: 1.5, range: 7, count: 4,
    desc: '떠도는 검 넷이 가까운 몬스터 넷을 쉼 없이 벤다' },
  w_advance: { promo: 9, cls: 'warrior', req: 33, name: '압도적진격', kind: 'line', fx: '139', dmg: 42, cd: 3, depth: 6,
    desc: '압도적인 기세로 바라보는 쪽 일렬 여섯 칸을 짓밟는다' },
  w_myriad: { promo: 9, cls: 'warrior', req: 33, name: '만검귀종', kind: 'screen', fx: '141', modern: 'new_w_roar2', dmg: 62, cd: 9,
    falloff: 0.03, desc: '궁극기. 만 개의 검이 화면의 모든 몬스터를 벤다' },
  r_flamesword: { promo: 8, cls: 'rogue', req: 30, name: '멸화의검', kind: 'blink', fx: '144', dmg: 30, cd: 1.6, range: 5, count: 2,
    desc: '불꽃을 두른 검으로 바라보는 쪽 몬스터에게 날아들어 두 번 벤다' },
  r_shadowstar: { promo: 8, cls: 'rogue', req: 30, name: '그림자표창', kind: 'spell', fx: '53', dmg: 24, cd: 1.4, range: 7, count: 3,
    desc: '그림자 표창 셋을 던져 가까운 몬스터 셋을 맞힌다' },
  r_shadowclone: { promo: 8, cls: 'rogue', req: 30, name: '그림자분신', kind: 'buff', buff: 'power', fx: '33', cd: 18, duration: 6, power: 1,
    desc: '그림자 분신이 함께 싸워 잠시 공격력이 두 배가 된다' },
  r_bloodslash: { promo: 9, cls: 'rogue', req: 33, name: '묵혈파광참', kind: 'cleave', fx: '145', dmg: 42, cd: 2.6, radius: 0, max: 9,
    curse: 3, desc: '검은 피의 빛으로 앞쪽 역삼각형을 베고 받는 피해를 늘린다' },
  r_chainstar: { promo: 9, cls: 'rogue', req: 33, name: "묵마수리검'쇄", kind: 'strike', fx: '145', dmg: 30, cd: 3, range: 6, radius: 2,
    count: 3, hitAt: 0.3, shape: 'plus', desc: '사슬 수리검 셋이 몬스터와 그 상하좌우 두 칸을 휘감는다' },
  r_gale: { promo: 9, cls: 'rogue', req: 33, name: '질풍난무', kind: 'screen', fx: '144', modern: 'new_r_bunhon', dmg: 62, cd: 9,
    falloff: 0.03, desc: '궁극기. 질풍처럼 화면을 누비며 모든 몬스터를 벤다' },
  m_thunderball: { promo: 8, cls: 'mage', req: 30, name: '뇌격구', kind: 'spell', fx: '89', dmg: 34, cd: 1.6, range: 7, count: 2,
    desc: '번개 구슬 둘이 가까운 몬스터 둘을 지진다' },
  m_shift: { promo: 8, cls: 'mage', req: 30, name: '이형환위', kind: 'blink', fx: '98', dmg: 24, cd: 2, range: 5, count: 1,
    desc: '바라보는 쪽 몬스터 너머로 몸을 옮기며 친다' },
  m_coldveil: { promo: 8, cls: 'mage', req: 30, name: '한랭장막', kind: 'screen', fx: '96', dmg: 20, cd: 7, slow: 3, stun: 0.6,
    desc: '차가운 장막이 화면을 덮어 모든 몬스터를 얼리고 느리게 한다' },
  m_gale: { promo: 9, cls: 'mage', req: 33, name: '회선격풍', kind: 'strike', fx: '24', dmg: 34, cd: 2.4, range: 7, radius: 2, count: 2,
    hitAt: 0.3, desc: '회오리바람 둘이 몬스터와 그 둘레 두 칸을 찢는다' },
  m_shards: { promo: 9, cls: 'mage', req: 33, name: '서리파편', kind: 'spell', fx: '96', dmg: 22, cd: 1.5, range: 7, count: 5,
    desc: '서리 파편 다섯이 가까운 몬스터 다섯을 꿰뚫는다' },
  m_kalpa: { promo: 9, cls: 'mage', req: 33, name: '겁화', kind: 'screen', fx: '148', modern: 'new_raid_fire', dmg: 66, cd: 9,
    falloff: 0.03, desc: '궁극기. 세상을 태우는 겁화가 화면의 모든 몬스터를 삼킨다' },
  p_flash: { promo: 8, cls: 'poet', req: 30, name: '섬광', kind: 'spell', fx: '131', dmg: 28, cd: 1.6, range: 7, count: 2, drain: 0.15,
    desc: '섬광이 몬스터 둘을 치고 그 빛으로 체력을 조금 되찾는다' },
  p_bind: { promo: 8, cls: 'poet', req: 30, name: '결박', kind: 'strike', fx: '117', dmg: 18, cd: 4, range: 7, radius: 1, count: 2,
    hitAt: 0.3, stun: 2.5, desc: '몬스터 둘과 그 둘레를 묶어 움직이지 못하게 한다' },
  p_warmth: { promo: 8, cls: 'poet', req: 30, name: '신의온기', kind: 'heal', fx: '125', heal: 34, cd: 12,
    desc: '신의 온기로 체력을 크게 회복한다' },
  p_thunderbomb: { promo: 9, cls: 'poet', req: 33, name: '폭렬천뢰탄', kind: 'line', fx: '149', dmg: 36, cd: 2.2, depth: 6,
    desc: '천뢰탄이 바라보는 쪽 일렬 여섯 칸을 터뜨리며 퍼진다' },
  p_skyspirit: { promo: 9, cls: 'poet', req: 33, name: '천신의기운', kind: 'heal', fx: '135', heal: 30, cd: 12, mana: 0.4,
    desc: '천신의 기운이 체력과 마력을 함께 채운다' },
  p_taiji: { promo: 9, cls: 'poet', req: 33, name: '태극팔괘진', kind: 'screen', fx: '134', modern: 'new_p_talm', dmg: 58, cd: 9,
    falloff: 0.03, desc: '궁극기. 태극팔괘진이 화면의 모든 몬스터를 짓누른다' },

  // 대격변: the rest of the original lists (oldbaram skill list, with each skill's own picture),
  // beside the ones already here as another skill's 단 (신검합일, 검신검귀, 대력검신, 후면·측면).
  c_kick: { cls: 'all', req: 3, name: '금강퇴', kind: 'cleave', fx: '137', dmg: 11, cd: 1.6, radius: 0,
    desc: '누구나 배우는 발차기. 정면 한 칸을 걷어찬다' },
  w_bless: { cls: 'warrior', req: 5, name: '신의축복', kind: 'buff', buff: 'shield', fx: '6', cd: 14, duration: 3,
    desc: '신의 축복으로 잠시 받는 피해가 절반이 된다' },
  w_lion: { cls: 'warrior', req: 16, name: '사자후', kind: 'screen', fx: '25', dmg: 7, cd: 9, stun: 1.2, falloff: 0.05,
    desc: '사자처럼 울부짖어 화면의 몬스터를 잠시 얼어붙게 한다' },
  w_ungong: { promo: 4, cls: 'warrior', req: 18, name: '운공체식', kind: 'heal', fx: '138', heal: 26, cd: 15, mana: 0.5,
    desc: '기를 돌려 체력과 마력을 크게 되찾는다' },
  r_muyoung: { cls: 'rogue', req: 4, name: '무영보법', kind: 'blink', fx: '33', dmg: 8, cd: 1.1, range: 3, count: 1,
    desc: '그림자 없는 걸음으로 바라보는 쪽 세 칸 안의 몬스터에게 붙어 벤다' },
  r_nuri: { cls: 'rogue', req: 8, name: '누리의힘', kind: 'buff', buff: 'power', fx: '29', cd: 15, duration: 4, power: 0.5,
    desc: '누리의 힘을 빌려 잠시 공격력이 절반 오른다' },
  r_forget: { cls: 'rogue', req: 10, name: '망각', kind: 'strike', fx: '86', dmg: 4, cd: 5, range: 6, radius: 1, count: 1,
    hitAt: 0.2, stun: 1.5, desc: '몬스터와 그 주위가 싸우던 것을 잊고 잠시 멈춰 선다' },
  r_jiok: { promo: 3, cls: 'rogue', req: 14, name: '지옥무영', kind: 'screen', fx: '98', dmg: 15, cd: 5.5, falloff: 0.06,
    desc: '지옥의 그림자가 화면을 휩쓸어 모든 몬스터를 벤다' },
  r_gimun: { promo: 3, cls: 'rogue', req: 14, name: '기문방술', kind: 'buff', buff: 'shield', fx: '57', cd: 13, duration: 3.5,
    desc: '기문의 진법으로 몸을 감춰 잠시 받는 피해가 절반이 된다' },
  r_gaehyeol: { promo: 4, cls: 'rogue', req: 18, name: '개혈체식', kind: 'heal', fx: '142', heal: 22, cd: 14, mana: 0.4,
    desc: '혈도를 열어 체력과 마력을 되찾는다' },
  m_gongryeok: { cls: 'mage', req: 3, name: '공력증강', kind: 'heal', fx: '78', heal: 4, cd: 14, mana: 0.5,
    desc: '공력을 끌어올려 마력을 절반 채운다' },
  m_arm: { cls: 'mage', req: 8, name: '무장', kind: 'buff', buff: 'power', fx: '61', cd: 16, duration: 5, power: 0.45,
    desc: '무기에 주술을 걸어 잠시 공격력이 오른다' },
  m_toema: { cls: 'mage', req: 9, name: '퇴마주', kind: 'spell', fx: '81', dmg: 12, cd: 2, range: 6, count: 2,
    desc: '마를 물리치는 주문으로 가까운 몬스터 둘을 친다' },
  m_poison: { cls: 'mage', req: 10, name: '중독', kind: 'strike', fx: '83', dmg: 6, cd: 4, range: 7, radius: 1, count: 1,
    hitAt: 0.3, curse: 4, slow: 2, desc: '독을 퍼뜨려 몬스터와 그 주위를 느리게 하고 받는 피해를 늘린다' },
  m_despair: { cls: 'mage', req: 14, name: '절망', kind: 'strike', fx: '86', dmg: 5, cd: 6, range: 7, radius: 2, count: 1,
    hitAt: 0.3, curse: 5, desc: '넓은 곳에 절망을 드리워 오래 받는 피해를 늘린다' },
  m_chaos: { cls: 'mage', req: 16, name: '혼돈', kind: 'screen', fx: '121', dmg: 8, cd: 8, stun: 1,
    desc: '혼돈에 빠뜨려 화면의 몬스터를 잠시 멈추게 한다' },
  m_manpa: { promo: 4, cls: 'mage', req: 18, name: '만파지독', kind: 'screen', fx: '84', dmg: 18, cd: 5.5, curse: 3, slow: 2,
    desc: '만 갈래 독이 화면을 덮어 모든 몬스터를 치고 느리게 하며 피해를 늘린다' },
  m_sage: { promo: 4, cls: 'mage', req: 18, name: '현자의기원', kind: 'heal', fx: '146', heal: 28, cd: 14, mana: 0.6,
    desc: '현자의 기원으로 체력과 마력을 크게 회복한다' },
  p_toema: { cls: 'poet', req: 4, name: '퇴마주', kind: 'spell', fx: '81', dmg: 10, cd: 1.8, range: 6, count: 1,
    desc: '마를 물리치는 주문으로 가까운 몬스터를 친다' },
  p_protect: { cls: 'poet', req: 8, name: '보호', kind: 'buff', buff: 'shield', fx: '77', cd: 15, duration: 3,
    desc: '보호의 주문으로 잠시 받는 피해가 절반이 된다' },
  p_pahon: { cls: 'poet', req: 9, name: '파혼술', kind: 'strike', fx: '117', dmg: 6, cd: 4.5, range: 6, radius: 1, count: 1,
    hitAt: 0.3, stun: 1.5, desc: '혼을 흩어 몬스터와 그 주위를 잠시 멈추게 한다' },
  p_sky: { cls: 'poet', req: 10, name: '천공의희원', kind: 'heal', fx: '111', heal: 16, cd: 10,
    desc: '하늘의 기운으로 체력을 회복한다' },
  p_weaken: { cls: 'poet', req: 14, name: '무력화', kind: 'strike', fx: '127', dmg: 6, cd: 6, range: 7, radius: 2, count: 1,
    hitAt: 0.3, curse: 5, desc: '넓은 곳의 몬스터를 무력하게 해 받는 피해를 늘린다' },
  p_life: { cls: 'poet', req: 16, name: '생명의기원', kind: 'heal', fx: '125', heal: 28, cd: 15,
    desc: '생명의 기원으로 체력을 크게 회복한다' },
  p_baekho2: { promo: 3, cls: 'poet', req: 14, name: "백호의희원'첨", kind: 'heal', fx: '133', heal: 26, cd: 11, guard: 1,
    desc: '백호의희원의 더 높은 단. 크게 회복하고 1초 동안 공격을 받지 않는다' },

  // 바람의나라 연's own spells, each with its effect, icon and sound out of 연's client (fx k_<id>):
  // more shapes for every class — a sword rain on a spot, a pulling chain, a shuriken spread,
  // twin cuts, a meteor, a blast that shoves, a thunder cloud, roots, a phoenix's flight ...
  w_jinseom: { promo: 1, cls: 'warrior', req: 8, name: '진섬격', kind: 'cleave', fx: '20', dmg: 17, cd: 2.6, depth: 2, max: 4,
    desc: '앞쪽 두 칸의 몬스터를 크게 벤다' },
  w_bigeom: { promo: 2, cls: 'warrior', req: 10, name: '비검술', kind: 'strike', fx: '22', dmg: 15, cd: 2.6, range: 6, radius: 1, count: 1,
    desc: '날아드는 검으로 대상과 그 주위의 몬스터를 벤다' },
  w_roar3: { promo: 3, cls: 'warrior', req: 14, name: "동귀어진'첨", kind: 'cleave', fx: '19', dmg: 72, cd: 7, depth: 1, stun: 1, scaleHp: 0.14,
    hpCost: 0.1, desc: '많은 체력을 바쳐 정면 한 칸의 몬스터에게 치명적인 피해를 주고 잠시 기절시킨다' },
  w_chohonjin: { promo: 6, cls: 'warrior', req: 24, name: '초혼진무', kind: 'nova', fx: '24', dmg: 26, cd: 4.5, radius: 2,
    desc: '사슬로 주위의 몬스터를 휘감아 피해를 준다' },
  r_pajin: { promo: 1, cls: 'rogue', req: 8, name: '파진표창', kind: 'spell', fx: '53', dmg: 9, cd: 1.8, range: 6, count: 3,
    desc: '표창을 여러 개 던져 가까운 몬스터들을 맞힌다' },
  r_pilgeom: { promo: 5, cls: 'rogue', req: 21, name: '필살검강', kind: 'line', fx: '22', dmg: 24, cd: 2.4, depth: 5,
    desc: '유형화한 검기로 앞쪽 한 줄의 몬스터를 가른다' },
  r_suhyo: { promo: 5, cls: 'rogue', req: 21, name: '수효도검', kind: 'nova', fx: '24', dmg: 20, cd: 2.6, radius: 1,
    desc: '잠재력을 터뜨려 좌우의 몬스터를 한꺼번에 벤다' },
  r_amsal: { promo: 6, cls: 'rogue', req: 24, name: '암살', kind: 'strike', fx: '145', dmg: 60, cd: 5, range: 6, radius: 0, count: 1,
    desc: '연막 속에서 한 몬스터의 급소를 찔러 아주 큰 피해를 준다' },
  m_cheonggi: { promo: 2, cls: 'mage', req: 10, name: '청기폭렬', kind: 'strike', fx: '68', dmg: 16, cd: 2.6, range: 6, radius: 1, count: 1,
    desc: '푸른 기운을 터뜨려 대상과 그 주위의 몬스터에게 피해를 준다' },
  m_seongryeo: { promo: 3, cls: 'mage', req: 14, name: '성려멸주', kind: 'strike', fx: '148', dmg: 24, cd: 3.2, range: 7, radius: 1, count: 1,
    desc: '대상에게 운석을 떨어뜨려 주위까지 피해를 준다' },
  m_hyeongsang: { promo: 4, cls: 'mage', req: 18, name: '형상기억', kind: 'nova', fx: '148', dmg: 22, cd: 4, radius: 2,
    desc: '큰 폭발을 일으켜 주위의 몬스터에게 피해를 준다' },
  m_jiokchak: { promo: 6, cls: 'mage', req: 24, name: '지옥착화', kind: 'strike', fx: '147', dmg: 30, cd: 3, range: 7, radius: 1, count: 1,
    curse: 3, desc: '지옥의 흑염으로 대상을 불살라 피해를 주고 받는 피해를 늘린다' },
  p_jiroe: { promo: 2, cls: 'poet', req: 10, name: '지뢰진', kind: 'strike', fx: '131', dmg: 14, cd: 2.4, range: 6, radius: 1, count: 1,
    desc: '대상과 그 주위의 몬스터에게 피해를 준다' },
  p_noejeon: { promo: 3, cls: 'poet', req: 14, name: '뇌전운무', kind: 'spell', fx: '89', dmg: 14, cd: 2.6, range: 6, count: 3,
    desc: '벼락을 품은 구름을 불러 주위의 몬스터에게 벼락을 내린다' },
  p_daeseon: { promo: 4, cls: 'poet', req: 18, name: '대선지법', kind: 'screen', fx: '134', dmg: 12, cd: 6, slow: 2,
    desc: '화면의 몬스터 모두에게 피해를 주고 혼을 어지럽혀 느리게 한다' },
  p_geomok: { promo: 5, cls: 'poet', req: 21, name: '거목재생', kind: 'strike', fx: '115', dmg: 20, cd: 3, range: 6, radius: 2, count: 1,
    stun: 1, desc: '거대한 나무뿌리로 대상과 주위의 몬스터를 묶고 피해를 준다' },
  p_bonghwang: { promo: 5, cls: 'poet', req: 21, name: '봉황신법', kind: 'line', fx: '150', dmg: 22, cd: 2.4, depth: 5,
    desc: '봉황 형태의 불꽃이 앞으로 날아가며 몬스터를 태운다' },
  p_cheonseon: { promo: 6, cls: 'poet', req: 24, name: '천선파동', kind: 'nova', fx: '135', dmg: 24, cd: 4, radius: 2,
    desc: '하늘의 이치를 담은 마법진을 펼쳐 주위의 몬스터를 공격한다' },
  p_daejijin: { promo: 7, cls: 'poet', req: 27, name: '대지진', kind: 'screen', fx: '134', dmg: 34, cd: 7,
    desc: '거대한 지진을 일으켜 화면의 몬스터 모두에게 피해를 준다' },

  // 궁사 (바람의나라 연 Job_6): its own skill list (Skills_Player 2061xxxx 일반, 2062xxxx 승급), each with
  // the effect, icon and sound of that 연 record (fx k_<id>, tools/yeon_archer_skills.json). 연's
  // 1차~6차 tiers are its own (명궁·현궁·진탄·심안·신궁·천궁); 연 has no 7차~9차 for the 궁사, so those
  // take its remaining 일반 techniques (연폭화살, 독수리소환, 신궁합일 ...). The fx here is only the
  // old effect a build without 연's resources falls back to.
  a_shot: { cls: 'archer', req: 1, name: '활쏘기', kind: 'spell', fx: '53', dmg: 15, cd: 0.75, range: 6, count: 1,
    desc: '바라보는 쪽 가까운 몬스터에게 화살을 쏜다. 단이 오르면 더 멀리, 4·7단에 화살이 하나씩 는다' },
  a_aim: { cls: 'archer', req: 1, name: '조준 활쏘기', kind: 'spell', fx: '55', dmg: 32, cd: 2.4, range: 8, count: 1,
    desc: '잠시 집중한 뒤 멀리 있는 몬스터에게 강한 화살을 쏜다' },
  a_spiral: { cls: 'archer', req: 1, name: '나선화살', kind: 'line', fx: '22', dmg: 18, cd: 1.8, depth: 6,
    desc: '나선으로 도는 화살이 앞쪽 일렬 여섯 칸의 몬스터를 꿰뚫는다' },
  a_ice: { cls: 'archer', req: 6, name: '얼음바르기', kind: 'buff', buff: 'power', fx: '68', cd: 14, duration: 4, power: 0.5,
    desc: '화살 강화. 화살에 얼음을 발라 잠시 모든 피해가 늘어난다' },
  a_firewall: { cls: 'archer', req: 6, name: '화염장벽', kind: 'strike', fx: '92', dmg: 14, cd: 3, range: 6, radius: 1, count: 1,
    hitAt: 0.3, curse: 2, desc: '대상의 자리에 불화살을 쏘아 화염 장벽을 세운다. 대상과 그 주위를 태운다' },
  a_flame: { cls: 'archer', req: 12, name: '염시투사', kind: 'cleave', fx: '148', dmg: 20, cd: 2.8, depth: 2, max: 6,
    desc: '앞쪽 넓은 범위에 불화살을 연달아 퍼부어 몬스터를 밀쳐 낸다' },
  // 1차 명궁
  a_bomb: { promo: 1, cls: 'archer', req: 6, name: '마탄', kind: 'strike', fx: '147', dmg: 22, cd: 2.6, range: 7, radius: 1, count: 1,
    hitAt: 0.265, desc: '특별한 화살을 쏘아 대상과 그 주위를 터뜨린다' },
  a_freeze: { promo: 1, cls: 'archer', req: 6, name: '급냉화살', kind: 'strike', fx: '68', dmg: 14, cd: 3.2, range: 6, radius: 1, count: 2,
    hitAt: 0.3, stun: 1.2, desc: '빙결 화살로 몬스터 둘과 그 주위를 잠시 얼린다' },
  a_coverfire: { promo: 1, cls: 'archer', req: 6, name: '화염시', kind: 'buff', buff: 'haste', fx: '7', cd: 15, duration: 4,
    desc: '화살 강화. 화살에 화염의 힘을 담아 잠시 모든 기술이 빨리 돈다' },
  // 2차 현궁
  a_storm: { promo: 2, cls: 'archer', req: 10, name: '폭류마탄시', kind: 'strike', fx: '148', dmg: 16, cd: 3, range: 7, radius: 2, count: 1,
    hitAt: 0.4, up: 'a_allwhirl', desc: '하늘로 쏘아 올린 화살이 대상과 그 주위에 비처럼 쏟아진다' },
  a_silence: { promo: 2, cls: 'archer', req: 10, name: '시즉무성', kind: 'line', fx: '55', dmg: 18, cd: 2.6, depth: 7, stun: 1,
    desc: '빠른 화살이 앞쪽 일렬 일곱 칸을 가로질러 몬스터를 침묵시킨다(잠시 멈춤)' },
  // 3차 진탄
  a_breakair: { promo: 3, cls: 'archer', req: 14, name: '대기파열', kind: 'strike', fx: '24', dmg: 20, cd: 3, range: 7, radius: 1, count: 2,
    hitAt: 0.3, curse: 3, shape: 'plus', desc: '대기를 찢는 화살로 대상과 그 상하좌우를 약화시키고 피해를 준다' },
  a_tempest: { promo: 3, cls: 'archer', req: 14, name: '폭풍시', kind: 'spell', fx: '89', dmg: 14, cd: 1.8, range: 7, count: 3,
    desc: '화살 강화. 폭풍의 힘을 담은 화살이 몬스터 셋을 추가로 타격한다' },
  // 4차 심안
  a_thunder: { promo: 4, cls: 'archer', req: 18, name: '천기충전', kind: 'buff', buff: 'haste', fx: '89', cd: 16, duration: 4,
    desc: '천기를 모아 잠시 모든 기술의 재사용 대기 시간이 빨리 지난다' },
  a_whirl: { promo: 4, cls: 'archer', req: 18, name: '선풍화우', kind: 'strike', fx: '24', dmg: 26, cd: 3.4, range: 7, radius: 2, count: 1,
    hitAt: 0.35, desc: '돌풍과 꽃잎 속에 화살이 휘몰아쳐 대상과 그 주위를 친다' },
  a_allwhirl: { promo: 4, cls: 'archer', req: 18, evolved: true, name: '폭풍화우', kind: 'screen', fx: '24', dmg: 16, cd: 4.5,
    desc: '폭류마탄시 8단 + 4차 승급. 꽃잎 폭풍 속 화살이 화면의 모든 몬스터에게 쏟아진다' },
  // 5차 신궁
  a_inferno: { promo: 5, cls: 'archer', req: 21, name: '염화마탄시', kind: 'line', fx: '148', dmg: 34, cd: 3.2, depth: 8,
    desc: '궁사의 궁극오의. 잠력과 심력을 터뜨려 앞쪽 일렬 여덟 칸에 화염 화살을 쏜다' },
  a_fetter: { promo: 5, cls: 'archer', req: 21, name: '족쇄화살', kind: 'strike', fx: '115', dmg: 20, cd: 3.2, range: 7, radius: 2, count: 1,
    hitAt: 0.3, slow: 3, desc: '적 주변에 족쇄를 쏘아 피해를 주고 둔화시킨다' },
  a_bloodsuck: { promo: 5, cls: 'archer', req: 21, name: '혈기흡수', kind: 'heal', fx: '125', heal: 24, cd: 13, shieldT: 3,
    desc: '적의 기운을 흡수해 체력을 회복하고 잠시 보호막을 두른다' },
  // 6차 천궁
  a_chase: { promo: 6, cls: 'archer', req: 24, name: '추격', kind: 'line', fx: '144', dmg: 30, cd: 3, depth: 6, dash: true,
    desc: '앞으로 빠르게 달려 나가며 지나는 일렬 여섯 칸의 몬스터에게 화살을 퍼붓는다' },
  // 7차~9차: 연's other 궁사 techniques
  a_chain: { promo: 7, cls: 'archer', req: 27, name: '연폭화살', kind: 'spell', fx: '147', dmg: 30, cd: 2, range: 7, count: 4,
    desc: '탄성이 강한 화살이 몬스터 사이를 튕기며 넷을 터뜨린다' },
  a_shadow: { promo: 7, cls: 'archer', req: 27, name: '그림자방패', kind: 'buff', buff: 'shield', fx: '33', cd: 15, duration: 5,
    desc: '대신 맞아 주는 그림자 분신을 불러 잠시 받는 피해를 절반으로 줄인다' },
  a_eagle: { promo: 8, cls: 'archer', req: 30, name: '독수리소환', kind: 'spell', fx: '52', dmg: 30, cd: 2.2, range: 7, count: 3, stun: 0.5,
    desc: '동반자 독수리를 불러 몬스터 셋을 덮친다' },
  a_weebo: { promo: 8, cls: 'archer', req: 30, name: '위위비보', kind: 'buff', buff: 'guard', fx: '57', cd: 16, duration: 1.5,
    desc: '깃털처럼 가볍게 물러나며 잠시 무적이 된다' },
  a_bless: { promo: 8, cls: 'archer', req: 30, name: '신궁합일', kind: 'buff', buff: 'power', fx: '15', cd: 18, duration: 6, power: 1.2,
    desc: '활에 혼을 불어넣어 잠시 공격력이 크게 오른다' },
  a_air: { promo: 9, cls: 'archer', req: 33, name: '허공람시', kind: 'spell', fx: '55', dmg: 34, cd: 1.4, range: 8, count: 3,
    desc: '미리 장전한 화살을 조준 없이 연달아 쏘아 몬스터 셋을 꿰뚫는다' },
  a_blood5: { promo: 9, cls: 'archer', req: 33, name: '투혈오식', kind: 'screen', fx: '141', dmg: 60, cd: 9,
    desc: '궁극기. 피를 태운 다섯 번째 화살이 화면의 모든 몬스터를 꿰뚫는다' },
  a_ult: { cls: 'archer', name: '일환탄시', kind: 'ult', fx: '144', hpCost: 0.15,
    desc: '체력 15%와 마력을 모두 써서, 화면의 몬스터에게 강력한 일격을 가한다' },

  // 무사 (바람의나라 연 Job_7): its own skill list (Skills_Player 2071xxxx 일반, 2072xxxx 승급; icons by
  // the older 10xxxx numbers the records name), each with the effect, icon and sound of that 연
  // record (fx k_<id>, tools/yeon_lancer_skills.json). 1차~6차 are 연's own (창객·창제·창황·창성·
  // 신창·창극); 연 has no 7차~9차 for the 무사, so those take its remaining 일반 techniques
  // (맹룡승천, 무형투창, 신창합일, 월하멸섬 ...). The fx here is only the old fallback.
  l_moon: { cls: 'lancer', req: 1, name: '월하일섬', kind: 'line', fx: '55', dmg: 15, cd: 0.8, depth: 3,
    desc: '창을 내질러 몬스터가 가장 많은 쪽 일렬 세 칸을 꿰찌른다' },
  l_halfmoon: { cls: 'lancer', req: 1, name: '반월참', kind: 'cleave', fx: '20', dmg: 18, cd: 2, depth: 2, max: 5,
    desc: '창을 반달처럼 휘둘러 앞쪽 역삼각형의 몬스터 다섯을 벤다' },
  l_phantom: { cls: 'lancer', req: 1, name: '환영창', kind: 'spell', fx: '53', dmg: 20, cd: 1.6, range: 6, count: 1,
    desc: '창의 환영을 던져 가까운 몬스터를 꿰뚫는다. 4·7단에 환영이 하나씩 는다' },
  l_wind: { cls: 'lancer', req: 6, name: '풍운보', kind: 'buff', buff: 'haste', fx: '7', cd: 14, duration: 4,
    desc: '바람과 구름처럼 몸이 가벼워져 잠시 모든 기술이 빨리 돈다' },
  l_meteor: { cls: 'lancer', req: 6, name: '유성창', kind: 'strike', fx: '147', dmg: 24, cd: 2.6, range: 6, radius: 1, count: 1,
    hitAt: 0.3, desc: '유성처럼 창을 내리꽂아 대상과 그 주위를 친다' },
  l_rise: { cls: 'lancer', req: 12, name: '잠룡승천', kind: 'strike', fx: '24', dmg: 22, cd: 3, range: 5, radius: 0, count: 2,
    hitAt: 0.25, stun: 1, desc: '잠든 용이 솟구치듯 몬스터 둘을 창끝으로 띄워 잠시 멈춘다' },
  // 1차 창객
  l_spiral: { promo: 1, cls: 'lancer', req: 6, name: '나선창', kind: 'line', fx: '22', dmg: 20, cd: 2, depth: 5,
    up: 'l_firedragon', desc: '나선으로 도는 창날이 몬스터가 가장 많은 쪽 일렬 다섯 칸을 꿰뚫는다' },
  l_illusion: { promo: 1, cls: 'lancer', req: 6, name: '환영참', kind: 'cleave', fx: '20', dmg: 22, cd: 2.4, depth: 2, max: 6,
    desc: '환영과 함께 앞쪽을 크게 베어 몬스터 여섯을 친다' },
  // 2차 창제
  l_release: { promo: 2, cls: 'lancer', req: 10, name: '뇌기방출', kind: 'nova', fx: '89', dmg: 20, cd: 3, radius: 1, stun: 0.6,
    desc: '몸에 모은 뇌기를 터뜨려 둘러싼 몬스터를 치고 잠시 멈춘다' },
  l_extinct: { promo: 2, cls: 'lancer', req: 10, name: '멸화참', kind: 'strike', fx: '148', dmg: 18, cd: 3, range: 6, radius: 2, count: 1,
    hitAt: 0.35, curse: 2, desc: '불꽃의 고리로 대상과 그 주위를 태우고 약화시킨다' },
  l_innate: { promo: 2, cls: 'lancer', req: 10, name: '선천기공', kind: 'heal', fx: '125', heal: 20, cd: 13, shieldT: 2,
    desc: '타고난 기공을 돌려 체력을 회복하고 잠시 보호막을 두른다' },
  // 3차 창황
  l_waves: { promo: 3, cls: 'lancer', req: 14, name: '만경창파', kind: 'cleave', fx: '24', dmg: 22, cd: 3, depth: 3, max: 9,
    desc: '만 겹의 물결처럼 창을 휘몰아 앞쪽 넓은 범위의 몬스터 아홉을 친다' },
  l_rush: { promo: 3, cls: 'lancer', req: 14, name: '환영쇄도', kind: 'line', fx: '144', dmg: 24, cd: 2.6, depth: 5, dash: true,
    desc: '환영과 함께 바라보는 쪽으로 돌진하며 지나는 일렬 다섯 칸을 찌른다' },
  l_burst: { promo: 3, cls: 'lancer', req: 14, name: '환영지폭', kind: 'strike', fx: '147', dmg: 20, cd: 3.4, range: 7, radius: 2, count: 1,
    hitAt: 0.4, desc: '하늘에서 쏟아지는 창의 환영이 대상과 그 주위를 터뜨린다' },
  // 4차 창성
  l_unity: { promo: 4, cls: 'lancer', req: 18, name: '혼연체식', kind: 'buff', buff: 'power', fx: '15', cd: 15, duration: 5, power: 0.6,
    desc: '몸과 창이 하나가 되어 잠시 모든 피해가 크게 늘어난다' },
  l_firedragon: { promo: 4, cls: 'lancer', req: 18, evolved: true, name: '화룡멸진', kind: 'line', fx: '140', dmg: 26, cd: 2.4, depth: 7,
    desc: '나선창 8단 + 4차 승급. 불의 용이 몬스터가 가장 많은 쪽 일렬 일곱 칸을 태운다' },
  l_genesis: { promo: 4, cls: 'lancer', req: 18, name: '천지개벽', kind: 'screen', fx: '141', dmg: 18, cd: 6,
    desc: '하늘에서 빛의 기둥이 쏟아져 화면의 모든 몬스터를 친다' },
  // 5차 신창
  l_extinct2: { promo: 5, cls: 'lancer', req: 21, name: '극멸화참', kind: 'nova', fx: '148', dmg: 34, cd: 3.2, radius: 2, curse: 3,
    desc: '무사의 궁극오의. 거대한 불꽃 고리로 둘레 두 칸의 몬스터를 태우고 약화시킨다' },
  l_formless: { promo: 5, cls: 'lancer', req: 21, name: '무형지창', kind: 'strike', fx: '115', dmg: 26, cd: 3.2, range: 7, radius: 2, count: 1,
    hitAt: 0.3, slow: 3, desc: '형체 없는 창을 대상 주위에 꽂아 피해를 주고 둔화시킨다' },
  l_guard: { promo: 5, cls: 'lancer', req: 21, name: '진기보호', kind: 'buff', buff: 'shield', fx: '33', cd: 15, duration: 5,
    desc: '진기로 몸을 감싸 잠시 받는 피해를 절반으로 줄인다' },
  // 6차 창극
  l_annihil: { promo: 6, cls: 'lancer', req: 24, name: '화룡사멸', kind: 'strike', fx: '139', dmg: 40, cd: 3, range: 7, radius: 1, count: 3,
    hitAt: 0.525, strongest: true, desc: '하늘에서 화룡의 불기둥 셋을 가장 강한 몬스터들(보스를 먼저)과 그 주위에 내리꽂는다' },
  // 7차~9차: 연's other 무사 techniques
  l_dragon: { promo: 7, cls: 'lancer', req: 27, name: '맹룡승천', kind: 'strike', fx: '24', dmg: 34, cd: 2.4, range: 6, radius: 1, count: 3,
    hitAt: 0.25, stun: 0.6, desc: '용처럼 솟구치는 창격이 몬스터 셋과 그 주위를 띄워 친다' },
  l_spirit: { promo: 7, cls: 'lancer', req: 27, name: '패기발산', kind: 'nova', fx: '25', dmg: 30, cd: 3.4, radius: 2,
    desc: '패기를 터뜨려 둘레 두 칸의 몬스터를 밀쳐 낸다' },
  l_javelin: { promo: 8, cls: 'lancer', req: 30, name: '무형투창', kind: 'spell', fx: '55', dmg: 32, cd: 1.8, range: 8, count: 3,
    desc: '보이지 않는 창을 던져 몬스터 셋을 꿰뚫는다' },
  l_thunder: { promo: 8, cls: 'lancer', req: 30, name: '뇌신화', kind: 'buff', buff: 'haste', fx: '89', cd: 16, duration: 5,
    desc: '뇌신의 힘을 몸에 받아 잠시 모든 기술이 빨리 돈다' },
  l_union: { promo: 8, cls: 'lancer', req: 30, name: '신창합일', kind: 'buff', buff: 'power', fx: '15', cd: 18, duration: 6, power: 1.2,
    desc: '창과 혼이 하나가 되어 잠시 공격력이 크게 오른다' },
  l_reflect: { promo: 9, cls: 'lancer', req: 33, name: '반탄강기', kind: 'buff', buff: 'guard', fx: '57', cd: 16, duration: 1.5,
    desc: '강기를 둘러 잠시 어떤 공격도 튕겨 낸다(무적)' },
  l_moonfull: { promo: 9, cls: 'lancer', req: 33, name: '월하멸섬', kind: 'screen', fx: '141', dmg: 60, cd: 9,
    desc: '궁극기. 달빛 아래 번개를 두른 창격이 화면의 모든 몬스터를 벤다' },
  l_ult: { cls: 'lancer', name: '백월난격', kind: 'ult', fx: '144', hpCost: 0.2,
    desc: '체력 20%와 마력을 모두 써서, 화면의 몬스터에게 흰 달의 난격을 퍼붓는다' },

  // 격투가 (바람의나라 연 Job_5): its own skill list (Skills_Player 2051xxxx 일반, 2052xxxx 승급), each with
  // the effect, icon and sound of that 연 record (fx k_<id>, tools/yeon_monk_skills.json). 1차~6차 are
  // 연's own (권사·권호·권왕·권제·권신·권극); 연 has no 7차~9차 for the 격투가, so those take its remaining
  // 일반 techniques (정신집중, 허허실실, 점혈:통, 권법의기원, 권신강림의 추가타). Most of its 일반 records
  // carry no sound of their own: they take the 격투가's fist sounds (fx_skill_deathfist, _thunderfist,
  // _fightspirit, _quake) and its 승급 SFX_Fighter_* clips. The fx here is only the old fallback.
  mk_bung: { cls: 'monk', req: 1, name: '붕권', kind: 'slash', fx: '19', dmg: 14, cd: 0.6,
    desc: '곁의 몬스터를 주먹으로 친다. 단이 오르면 더 여러 번, 앞뒤 양옆까지 친다' },
  mk_sudden: { cls: 'monk', req: 1, name: '전광석화', kind: 'blink', fx: '52', dmg: 16, cd: 1.3, range: 4, count: 2,
    desc: '번개처럼 몬스터 등 뒤로 파고들며 두 번 친다' },
  mk_smash: { cls: 'monk', req: 1, name: '비연격', kind: 'cleave', fx: '20', dmg: 20, cd: 1.8, depth: 1, max: 6,
    desc: '제비처럼 날아올라 앞쪽 몬스터 여섯을 걷어찬다' },
  mk_body: { cls: 'monk', req: 6, name: '철산고', kind: 'line', fx: '144', dmg: 22, cd: 2.4, depth: 3, dash: true, stun: 0.5,
    desc: '어깨로 들이받으며 바라보는 쪽 일렬 세 칸을 밀고 나간다' },
  mk_quake: { cls: 'monk', req: 6, name: '천지파동', kind: 'nova', fx: '25', dmg: 24, cd: 2.6, radius: 1, stun: 0.5,
    desc: '땅을 내려쳐 둘러싼 몬스터를 치고 잠시 멈춘다' },
  mk_switch: { cls: 'monk', req: 12, name: '혈도개방', kind: 'buff', buff: 'power', fx: '6', cd: 14, duration: 4, power: 0.5,
    desc: '혈도를 열어 잠시 모든 피해가 늘어난다' },
  // 1차 권사
  mk_pointblue: { promo: 1, cls: 'monk', req: 6, name: '점혈:기', kind: 'spell', fx: '53', dmg: 16, cd: 2.2, range: 5, count: 2, stun: 0.8,
    desc: '몬스터 둘의 혈을 짚어 잠시 기를 막는다(멈춤)' },
  mk_uppercut: { promo: 1, cls: 'monk', req: 6, name: '격풍권', kind: 'strike', fx: '24', dmg: 24, cd: 2.6, range: 4, radius: 0, count: 2,
    hitAt: 0.2, stun: 0.6, desc: '바람을 일으키는 올려치기로 몬스터 둘을 띄운다' },
  // 2차 권호
  mk_pointlight: { promo: 2, cls: 'monk', req: 10, name: '점혈:광', kind: 'strike', fx: '147', dmg: 20, cd: 2.8, range: 6, radius: 2, count: 1,
    hitAt: 0.3, up: 'mk_buddha', desc: '혈을 짚은 몬스터에게서 기가 터져 그 주위를 친다' },
  mk_endure: { promo: 2, cls: 'monk', req: 10, name: '인고의시간', kind: 'buff', buff: 'guard', fx: '57', cd: 16, duration: 1.5,
    desc: '고통을 참아 내며 잠시 어떤 공격에도 쓰러지지 않는다(무적)' },
  mk_spirit: { promo: 2, cls: 'monk', req: 10, name: '투혼', kind: 'buff', buff: 'haste', fx: '7', cd: 15, duration: 4,
    desc: '투혼을 불태워 잠시 모든 기술이 빨리 돈다' },
  // 3차 권왕
  mk_pointburst: { promo: 3, cls: 'monk', req: 14, name: '점혈:폭', kind: 'strike', fx: '147', dmg: 22, cd: 3, range: 6, radius: 1, count: 2,
    hitAt: 0.3, stun: 1, desc: '짚은 혈을 터뜨려 몬스터 둘과 그 주위를 기절시킨다' },
  mk_resonance: { promo: 3, cls: 'monk', req: 14, name: '공명권', kind: 'line', fx: '22', dmg: 22, cd: 2.4, depth: 5,
    desc: '울림이 퍼지는 주먹이 몬스터가 가장 많은 쪽 일렬 다섯 칸을 꿰뚫는다' },
  mk_rupture: { promo: 3, cls: 'monk', req: 14, name: '천지파열', kind: 'nova', fx: '25', dmg: 24, cd: 3.4, radius: 2,
    desc: '대지를 갈라 둘레 두 칸의 몬스터를 터뜨린다' },
  // 4차 권제
  mk_diamond: { promo: 4, cls: 'monk', req: 18, name: '금강불괴', kind: 'buff', buff: 'shield', fx: '33', cd: 15, duration: 5,
    desc: '금강 같은 몸이 되어 잠시 받는 피해를 절반으로 줄인다' },
  mk_wolf: { promo: 4, cls: 'monk', req: 18, name: '낭아권', kind: 'cleave', fx: '140', dmg: 26, cd: 2.6, depth: 2, max: 6,
    desc: '이리의 송곳니 같은 연타로 앞쪽 몬스터 여섯을 물어뜯는다' },
  mk_buddha: { promo: 4, cls: 'monk', req: 18, evolved: true, name: '여래신장', kind: 'screen', fx: '141', dmg: 18, cd: 6,
    desc: '점혈:광 8단 + 4차 승급. 하늘에서 내려찍는 거대한 손바닥이 화면의 모든 몬스터를 친다' },
  // 5차 권신
  mk_combo: { promo: 5, cls: 'monk', req: 21, name: '연속필살권무', kind: 'strike', fx: '148', dmg: 30, cd: 3.2, range: 5, radius: 1, count: 2,
    hitAt: 0.3, desc: '격투가의 궁극오의. 쉴 새 없는 권무로 몬스터 둘과 그 주위를 두들긴다' },
  mk_technique: { promo: 5, cls: 'monk', req: 21, name: '권신기법', kind: 'buff', buff: 'power', fx: '15', cd: 15, duration: 5, power: 0.7,
    desc: '권신의 기법을 깨쳐 잠시 공격력이 크게 오른다' },
  mk_advent: { promo: 5, cls: 'monk', req: 21, name: '권신강림', kind: 'strike', fx: '115', dmg: 26, cd: 3.4, range: 7, radius: 2, count: 1,
    hitAt: 0.35, curse: 3, desc: '권신을 불러 대상과 그 주위를 내리치고 약화시킨다' },
  // 6차 권극
  mk_kyokushin: { promo: 6, cls: 'monk', req: 24, name: '극진권', kind: 'line', fx: '144', dmg: 34, cd: 3, depth: 6, dash: true,
    desc: '극에 이른 주먹으로 바라보는 쪽 일렬 여섯 칸을 뚫고 나간다' },
  // 7차~9차: 연's other 격투가 techniques
  mk_focus: { promo: 7, cls: 'monk', req: 27, name: '정신집중', kind: 'heal', fx: '125', heal: 24, cd: 13, shieldT: 3,
    desc: '정신을 모아 체력을 회복하고 잠시 보호막을 두른다' },
  mk_feint: { promo: 7, cls: 'monk', req: 27, name: '허허실실', kind: 'buff', buff: 'stealth', fx: '36', cd: 14, duration: 2.5,
    desc: '허와 실을 뒤섞어 잠시 몬스터의 눈을 피하고, 그동안 주는 피해가 커진다' },
  mk_point: { promo: 8, cls: 'monk', req: 30, name: '점혈:통', kind: 'spell', fx: '55', dmg: 32, cd: 1.8, range: 6, count: 3, curse: 2,
    desc: '몬스터 셋의 통혈을 짚어 피해를 주고 약화시킨다' },
  mk_origin: { promo: 8, cls: 'monk', req: 30, name: '권법의기원', kind: 'buff', buff: 'power', fx: '15', cd: 18, duration: 6, power: 1.2,
    desc: '권법의 근원에 닿아 잠시 공격력이 크게 오른다' },
  mk_aventhit: { promo: 9, cls: 'monk', req: 33, name: '권신강림 추가타', kind: 'screen', fx: '141', dmg: 60, cd: 9,
    desc: '궁극기. 강림한 권신이 화면의 모든 몬스터를 다시 내려친다' },
  mk_ult: { cls: 'monk', name: '필살권무', kind: 'ult', fx: '144', hpCost: 0.2,
    desc: '체력 20%와 마력을 모두 써서, 화면의 몬스터에게 쉴 새 없는 권무를 퍼붓는다' },

  // 마도사 (바람의나라 연 Job_11): its own skill list (Skills_Player 230xxxxx), each with the effect, icon
  // and sound of that 연 record (fx k_<id>, tools/yeon_magus_skills.json). 연 numbers the 마도사's
  // skills in one run; those after its 승급의 힘 (23001600) are taken three a tier, 1차~4차
  // (마학사·마현선·마광사·마진선), 혈마광폭열파 at 5차 (마선사); its 광폭 forms of the 일반 orbs and beams
  // (광폭십자광선, 광폭신장, 광폭파장) fill 5차~6차 (마천선), and 7차~9차 take its remaining 일반 techniques.
  md_sphere: { cls: 'magus', req: 1, name: '마력구회격', kind: 'spell', fx: '31', dmg: 11, cd: 1.1, range: 7, count: 2,
    desc: '마력의 구슬을 날려 가까운 몬스터 둘을 따로따로 친다. 4·7단에 구슬이 하나씩 는다' },
  md_arrow: { cls: 'magus', req: 1, name: '마력화살', kind: 'spell', fx: '53', dmg: 18, cd: 1.8, range: 7, count: 2,
    desc: '마력의 화살 둘이 몬스터를 꿰뚫는다' },
  md_orbice: { cls: 'magus', req: 1, name: '기공구슬\'수', kind: 'strike', fx: '68', dmg: 10, cd: 2.6, range: 7, radius: 1, count: 2,
    hitAt: 0.3, slow: 2, desc: '물의 기공구슬이 몬스터 둘과 그 주위를 얼려 느리게 한다. 4·7단에 하나씩 는다' },
  md_orblight: { cls: 'magus', req: 6, name: '기공구슬\'뇌', kind: 'spell', fx: '89', dmg: 16, cd: 2.4, range: 7, count: 3, stun: 0.6,
    desc: '번개의 기공구슬이 몬스터 셋을 이어 치며 잠시 마비시킨다' },
  md_orbfire: { cls: 'magus', req: 6, name: '기공구슬\'화', kind: 'strike', fx: '147', dmg: 14, cd: 3, range: 7, radius: 1, count: 2,
    hitAt: 0.3, desc: '불의 기공구슬이 몬스터 둘과 그 주위를 터뜨린다. 4·7단에 하나씩 는다' },
  md_enhance: { cls: 'magus', req: 12, name: '마법강화', kind: 'buff', buff: 'power', fx: '15', cd: 14, duration: 4, power: 0.5,
    desc: '마법을 강화해 잠시 모든 피해가 늘어난다' },
  md_heal: { cls: 'magus', req: 12, name: '금기의기원', kind: 'heal', fx: '125', heal: 18, cd: 12,
    desc: '금기된 기원으로 이따금 체력을 회복한다' },
  // 1차 마학사
  md_spirit: { promo: 1, cls: 'magus', req: 6, name: '마령소환', kind: 'line', fx: '144', dmg: 20, cd: 2.4, depth: 6,
    desc: '마령을 불러 몬스터가 가장 많은 쪽 일렬 여섯 칸을 휩쓴다' },
  md_amulet: { promo: 1, cls: 'magus', req: 6, name: '광폭보호부', kind: 'buff', buff: 'shield', fx: '33', cd: 15, duration: 5,
    desc: '광폭의 보호부를 둘러 잠시 받는 피해를 절반으로 줄인다' },
  md_frenzyexp: { promo: 1, cls: 'magus', req: 6, name: '광폭기폭사', kind: 'nova', fx: '25', dmg: 20, cd: 3, radius: 1,
    desc: '광폭기를 터뜨려 둘러싼 몬스터를 밀쳐 낸다' },
  // 2차 마현선
  md_cross: { promo: 2, cls: 'magus', req: 10, name: '기공십자광선', kind: 'strike', fx: '24', dmg: 22, cd: 3, range: 7, radius: 2, count: 1,
    hitAt: 0.3, shape: 'plus', up: 'md_exfrenzy', desc: '십자로 뻗는 기공광선이 대상과 그 상하좌우를 꿰뚫는다' },
  md_decay: { promo: 2, cls: 'magus', req: 10, name: '광폭부패', kind: 'spell', fx: '115', dmg: 16, cd: 2.6, range: 7, count: 3, curse: 3,
    desc: '몬스터 셋을 썩게 하여 피해를 주고 약화시킨다' },
  md_recovery: { promo: 2, cls: 'magus', req: 10, name: '광폭즉축기', kind: 'heal', fx: '125', heal: 22, cd: 13, shieldT: 2,
    desc: '광폭기를 거두어 체력을 회복하고 잠시 보호막을 두른다' },
  // 3차 마광사
  md_wave: { promo: 3, cls: 'magus', req: 14, name: '마력파장', kind: 'nova', fx: '25', dmg: 22, cd: 3.2, radius: 2,
    desc: '마력의 물결이 둘레 두 칸의 몬스터를 친다' },
  md_silence: { promo: 3, cls: 'magus', req: 14, name: '광폭침묵염파', kind: 'strike', fx: '148', dmg: 24, cd: 3.4, range: 7, radius: 2, count: 1,
    hitAt: 0.4, stun: 1, desc: '침묵의 불길이 대상과 그 주위를 태우고 잠시 멈춘다' },
  md_bust: { promo: 3, cls: 'magus', req: 14, name: '광폭기대방출', kind: 'strike', fx: '147', dmg: 30, cd: 2.8, range: 7, radius: 0, count: 2,
    hitAt: 0.25, desc: '광폭기를 한꺼번에 내리꽂아 몬스터 둘에게 큰 피해를 준다' },
  // 4차 마진선
  md_ray: { promo: 4, cls: 'magus', req: 18, name: '광폭기조사', kind: 'line', fx: '22', dmg: 26, cd: 2.6, depth: 7,
    desc: '광폭기의 빛줄기가 몬스터가 가장 많은 쪽 일렬 일곱 칸을 꿰뚫는다' },
  md_absorb: { promo: 4, cls: 'magus', req: 18, name: '광폭체마', kind: 'spell', fx: '49', dmg: 20, cd: 2.8, range: 6, count: 1,
    drain: 0.3, weakest: true, desc: '몬스터의 체력과 마력을 빨아들여 체력을 회복한다' },
  md_exfrenzy: { promo: 4, cls: 'magus', req: 18, evolved: true, name: '광폭멸천강', kind: 'screen', fx: '141', dmg: 18, cd: 6, darken: 0.8,
    desc: '기공십자광선 8단 + 4차 승급. 하늘을 멸하는 광폭기가 화면의 모든 몬스터에게 떨어진다' },
  // 5차 마선사
  md_bloodbat: { promo: 5, cls: 'magus', req: 21, name: '혈마광폭열파', kind: 'line', fx: '144', dmg: 32, cd: 3, depth: 7,
    curse: 3, desc: '마도사의 궁극오의. 피의 박쥐떼가 일렬 일곱 칸을 휩쓸며 약화시킨다' },
  md_crossfrenzy: { promo: 5, cls: 'magus', req: 21, name: '광폭십자광선', kind: 'strike', fx: '24', dmg: 28, cd: 3.2, range: 7, radius: 2, count: 1,
    hitAt: 0.3, shape: 'plus', desc: '광폭기를 실은 십자광선이 대상과 그 상하좌우를 불사른다' },
  // 6차 마천선
  md_stormfrenzy: { promo: 6, cls: 'magus', req: 24, name: '광폭신장', kind: 'strike', fx: '89', dmg: 30, cd: 2.8, range: 7, radius: 1, count: 3,
    hitAt: 0.3, desc: '광폭의 신장이 몬스터 셋과 그 주위를 내리친다' },
  // 7차~9차: 연's other 마도사 techniques
  md_storm: { promo: 7, cls: 'magus', req: 27, name: '기공신장', kind: 'strike', fx: '89', dmg: 32, cd: 2.2, range: 7, radius: 1, count: 3,
    hitAt: 0.3, desc: '기공의 신장이 몬스터 셋과 그 주위를 친다' },
  md_boundary: { promo: 7, cls: 'magus', req: 27, name: '질서결계', kind: 'buff', buff: 'guard', fx: '57', cd: 16, duration: 1.5,
    desc: '질서의 결계를 쳐 잠시 어떤 공격도 받지 않는다(무적)' },
  md_yinyang: { promo: 8, cls: 'magus', req: 30, name: '오행구슬', kind: 'heal', fx: '125', heal: 30, cd: 12, shieldT: 3,
    desc: '오행의 구슬이 체력을 회복하고 잠시 보호막을 두른다' },
  md_resonance: { promo: 8, cls: 'magus', req: 30, name: '마도공명', kind: 'spell', fx: '98', dmg: 30, cd: 1.8, range: 8, count: 3, curse: 3,
    desc: '마도의 공명으로 몬스터 셋에게 피해를 주고 약화시킨다' },
  md_frenetic: { promo: 8, cls: 'magus', req: 30, name: '광폭화', kind: 'buff', buff: 'power', fx: '15', cd: 18, duration: 6, power: 1.2,
    desc: '광폭해져 잠시 공격력이 크게 오른다' },
  md_manafill: { promo: 9, cls: 'magus', req: 33, name: '마력증폭', kind: 'buff', buff: 'haste', fx: '7', cd: 16, duration: 5,
    desc: '마력을 증폭해 잠시 모든 기술이 빨리 돈다' },
  md_wavefrenzy: { promo: 9, cls: 'magus', req: 33, name: '광폭파장', kind: 'screen', fx: '141', dmg: 60, cd: 9, darken: 0.8,
    desc: '궁극기. 광폭의 파장이 화면의 모든 몬스터를 덮친다' },
  md_ult: { cls: 'magus', name: '광폭구회격', kind: 'ult', fx: '144', hpCost: 0.1, darken: 0.8,
    desc: '체력 10%와 마력을 모두 써서, 화면의 몬스터에게 광폭의 구슬을 퍼붓는다' },

  // 천인 (바람의나라 연 Job_8): its own skill list (Skills_Player 2081xxxx 일반, 2082xxxx 승급), each with the
  // effect, icon and sound of that 연 record (fx k_<id>, tools/yeon_celestial_skills.json). A caster that
  // dives: its magic falls on the field (spell, strike, screen) and its charges (비암격, 찰나, 예리함'극,
  // 범아귀) carry it through the foes as blinks. 1차~6차 are 연's own (천랑·천무·천군·천위·재천·천신; the
  // 1차~3차 by its 비급 books); 연 has no 7차~9차 for the 천인, so those take its remaining 일반 techniques
  // (수호구미호, 홍무기, 깨달음, 완전방어, 강림술'신록). The fx here is only the old fallback.
  cl_boom: { cls: 'celestial', req: 1, name: '염화', kind: 'spell', fx: '7', dmg: 12, cd: 1.1, range: 7, count: 2,
    desc: '불꽃을 피워 가까운 몬스터 둘을 따로따로 태운다. 4·7단에 하나씩 는다' },
  cl_crow: { cls: 'celestial', req: 1, name: '삼족오', kind: 'spell', fx: '52', dmg: 15, cd: 2, range: 7, count: 2,
    desc: '세 발 까마귀를 날려 몬스터 둘을 쪼아 댄다' },
  cl_ago: { cls: 'celestial', req: 1, name: '비암격', kind: 'blink', fx: '53', dmg: 16, cd: 2.2, range: 5, count: 2,
    desc: '바위를 일으키며 몬스터에게 돌진해 두 번 친다' },
  cl_armor: { cls: 'celestial', req: 6, name: '갑옷파괴', kind: 'strike', fx: '147', dmg: 18, cd: 2.6, range: 7, radius: 1, count: 2,
    hitAt: 0.3, curse: 3, desc: '번개의 기둥이 몬스터 둘과 그 주위의 갑옷을 깨뜨린다(약화)' },
  cl_moment: { cls: 'celestial', req: 6, name: '찰나', kind: 'blink', fx: '52', dmg: 20, cd: 1.8, range: 5, count: 1,
    desc: '찰나에 몬스터 등 뒤로 파고들어 친다' },
  cl_storm: { cls: 'celestial', req: 12, name: '불가살이선풍', kind: 'strike', fx: '24', dmg: 16, cd: 3.4, range: 7, radius: 2, count: 1,
    hitAt: 0.35, ticks: 3, up: 'cl_thunder', desc: '불가살이가 일으킨 소용돌이가 대상 자리에 남아 그 주위를 거듭 휩쓴다' },
  cl_blood: { cls: 'celestial', req: 12, name: '혈류강탈', kind: 'spell', fx: '49', dmg: 18, cd: 2.8, range: 6, count: 1,
    drain: 0.3, weakest: true, desc: '몬스터의 피를 빼앗아 체력을 회복한다' },
  // 1차 천랑
  cl_acumen: { promo: 1, cls: 'celestial', req: 6, name: '예리함\'극', kind: 'blink', fx: '144', dmg: 14, cd: 1.8, range: 5, count: 3,
    desc: '날카로운 기운을 두르고 몬스터 사이를 누비며 세 번 벤다' },
  cl_yeorae: { promo: 1, cls: 'celestial', req: 6, name: '여래의장', kind: 'buff', buff: 'shield', fx: '33', cd: 15, duration: 5,
    desc: '여래의 장막을 둘러 잠시 받는 피해를 절반으로 줄인다' },
  // 2차 천무
  cl_wall: { promo: 2, cls: 'celestial', req: 10, name: '철옹벽', kind: 'buff', buff: 'guard', fx: '57', cd: 16, duration: 1.5,
    desc: '쇠 항아리 같은 벽을 세워 잠시 어떤 공격도 받지 않는다(무적)' },
  cl_brilliant: { promo: 2, cls: 'celestial', req: 10, name: '빙글번쩍', kind: 'nova', fx: '89', dmg: 20, cd: 3, radius: 1, stun: 0.5,
    desc: '빙글 돌며 번쩍이는 번개로 둘러싼 몬스터를 치고 잠시 멈춘다' },
  cl_blood2: { promo: 2, cls: 'celestial', req: 10, name: '혈류강탈\'극', kind: 'spell', fx: '49', dmg: 18, cd: 2.6, range: 6, count: 3,
    drain: 0.15, desc: '몬스터 셋의 피를 한꺼번에 빼앗아 체력을 회복한다' },
  // 3차 천군
  cl_slam: { promo: 3, cls: 'celestial', req: 14, name: '지열각', kind: 'line', fx: '144', dmg: 24, cd: 2.6, depth: 5, dash: true, stun: 0.5,
    desc: '땅을 가르며 바라보는 쪽 일렬 다섯 칸을 짓밟고 나아간다' },
  cl_storm2: { promo: 3, cls: 'celestial', req: 14, name: '불가살이장군폭풍', kind: 'strike', fx: '24', dmg: 18, cd: 3.4, range: 7, radius: 2, count: 2,
    hitAt: 0.35, ticks: 2, desc: '불가살이 장군의 폭풍이 몬스터 둘의 자리에 머물며 그 주위를 거듭 휩쓴다' },
  cl_bind: { promo: 3, cls: 'celestial', req: 14, name: '영역속박', kind: 'screen', fx: '115', dmg: 10, cd: 6, stun: 1,
    desc: '영역을 묶어 화면의 모든 몬스터를 치고 잠시 멈춘다' },
  // 4차 천위
  cl_claw: { promo: 4, cls: 'celestial', req: 18, name: '용조수', kind: 'blink', fx: '144', dmg: 24, cd: 2.4, range: 6, count: 3,
    desc: '용의 발톱으로 몬스터 사이를 누비며 세 번 할퀸다' },
  cl_thunder: { promo: 4, cls: 'celestial', req: 18, evolved: true, name: '뇌격룡', kind: 'screen', fx: '141', dmg: 18, cd: 6,
    desc: '불가살이선풍 8단 + 4차 승급. 번개의 용이 화면의 모든 몬스터를 내리친다' },
  // 5차 재천
  cl_tiger: { promo: 5, cls: 'celestial', req: 21, name: '범아귀', kind: 'blink', fx: '144', dmg: 30, cd: 2.6, range: 6, count: 3,
    desc: '천인의 궁극오의. 범의 아가리처럼 몬스터 사이로 뛰어들어 세 번 물어뜯는다' },
  cl_crowfire: { promo: 5, cls: 'celestial', req: 21, name: '삼족오\'염화발출', kind: 'strike', fx: '148', dmg: 26, cd: 3, range: 7, radius: 1, count: 3,
    hitAt: 0.3, desc: '삼족오가 불꽃을 뿜어 몬스터 셋과 그 주위를 태운다' },
  cl_bagua: { promo: 5, cls: 'celestial', req: 21, name: '영혼방패\'팔괘진', kind: 'heal', fx: '125', heal: 24, cd: 13, shieldT: 3,
    desc: '팔괘진의 영혼방패로 체력을 회복하고 잠시 보호막을 두른다' },
  // 6차 천신
  cl_ego: { promo: 6, cls: 'celestial', req: 24, name: '자아파괴', kind: 'strike', fx: '115', dmg: 34, cd: 3, range: 7, radius: 2, count: 2,
    hitAt: 0.3, curse: 3, desc: '몬스터 둘과 그 주위의 자아를 부수어 큰 피해를 주고 약화시킨다' },
  // 7차~9차: 연's other 천인 techniques
  cl_gumiho: { promo: 7, cls: 'celestial', req: 27, name: '수호구미호', kind: 'strike', fx: '52', dmg: 32, cd: 2.4, range: 7, radius: 1, count: 3,
    hitAt: 0.25, desc: '아홉 꼬리의 수호 구미호를 불러 몬스터 셋과 그 주위를 휘감는다' },
  cl_snake: { promo: 7, cls: 'celestial', req: 27, name: '홍무기', kind: 'spell', fx: '37', dmg: 30, cd: 1.8, range: 7, count: 3, slow: 2,
    desc: '붉은 뱀을 풀어 몬스터 셋을 물고 느리게 한다' },
  cl_intrep: { promo: 8, cls: 'celestial', req: 30, name: '깨달음', kind: 'buff', buff: 'power', fx: '15', cd: 18, duration: 6, power: 1.2,
    desc: '깨달음을 얻어 잠시 공격력이 크게 오른다' },
  cl_defense: { promo: 8, cls: 'celestial', req: 30, name: '완전방어', kind: 'buff', buff: 'shield', fx: '33', cd: 15, duration: 6,
    desc: '완전한 방어로 잠시 받는 피해를 절반으로 줄인다' },
  cl_reindeer: { promo: 9, cls: 'celestial', req: 33, name: '강림술\'신록', kind: 'screen', fx: '141', dmg: 60, cd: 9,
    desc: '궁극기. 하늘의 신록이 강림해 화면의 모든 몬스터를 짓밟는다' },
  cl_ult: { cls: 'celestial', name: '전의상실', kind: 'ult', fx: '144', hpCost: 0.15,
    desc: '체력 15%와 마력을 모두 써서, 화면의 몬스터의 전의를 꺾는 일격을 가한다' },

  // 도깨비 (바람의나라 연 Job_9): its own skill list (Skills_Player 2091xxxx 일반, 2092xxxx 승급), each with the
  // effect, icon and sound of that 연 record (fx k_<id>, tools/yeon_dokkaebi_skills.json). 1차~3차 are its
  // 비급 books' (귀명·귀제·귀황), 4차~6차 by 연's numbering (귀성·신각·귀극); 연 has no 7차~9차 for the 도깨비, so
  // those take its remaining 일반 techniques (금은보화로구나, 귀체, 권선징악, 도깨비의 격노). 평탄화, 일격필살'괴력난신
  // and 도깨비폭풍 are particle effects in 연, which this renderer does not draw: they show the 도깨비's own
  // 금나와라 swing, 천벌 club and 쥐불놀이 wheel instead. The fx here is only the old fallback.
  dk_repel: { cls: 'dokkaebi', req: 1, name: '퇴격', kind: 'cleave', fx: '20', dmg: 17, cd: 0.8, depth: 1, max: 4,
    desc: '방망이를 휘둘러 앞쪽 몬스터 넷을 밀쳐 낸다' },
  dk_paddle: { cls: 'dokkaebi', req: 1, name: '밭다리걸기', kind: 'cleave', fx: '19', dmg: 16, cd: 2.2, depth: 1, max: 2, stun: 1,
    desc: '다리를 걸어 앞의 몬스터 둘을 넘어뜨린다(멈춤)' },
  dk_wisp: { cls: 'dokkaebi', req: 1, name: '도깨비불\'염류', kind: 'spell', fx: '7', dmg: 16, cd: 1.6, range: 6, count: 2,
    desc: '도깨비불을 날려 몬스터 둘을 태운다. 4·7단에 불이 하나씩 는다' },
  dk_strength: { cls: 'dokkaebi', req: 6, name: '완력', kind: 'buff', buff: 'power', fx: '6', cd: 14, duration: 4, power: 0.5,
    desc: '타고난 완력을 끌어올려 잠시 모든 피해가 늘어난다' },
  dk_punish: { cls: 'dokkaebi', req: 6, name: '일격필살\'징벌', kind: 'strike', fx: '139', dmg: 40, cd: 3.4, range: 4, radius: 0, count: 1,
    hitAt: 0.3, strongest: true, up: 'dk_super', desc: '가장 강한 몬스터(보스를 먼저)에게 징벌의 일격을 내리친다' },
  dk_hat: { cls: 'dokkaebi', req: 12, name: '도깨비감투', kind: 'buff', buff: 'stealth', fx: '36', cd: 14, duration: 2.5,
    desc: '도깨비감투를 써서 잠시 모습을 감춘다. 그동안 주는 피해가 커진다' },
  // 1차 귀명
  dk_roar: { promo: 1, cls: 'dokkaebi', req: 6, name: '괴성격', kind: 'cleave', fx: '20', dmg: 22, cd: 2.4, depth: 2, max: 6, stun: 0.5,
    desc: '괴성과 함께 앞쪽을 크게 후려쳐 몬스터 여섯을 친다' },
  dk_throw: { promo: 1, cls: 'dokkaebi', req: 6, name: '업어던지기', kind: 'strike', fx: '24', dmg: 26, cd: 2.8, range: 3, radius: 1, count: 1,
    hitAt: 0.3, stun: 1, desc: '몬스터를 업어 메쳐 그 자리와 주위를 친다' },
  // 2차 귀제
  dk_whirl: { promo: 2, cls: 'dokkaebi', req: 10, name: '회전회오리', kind: 'nova', fx: '25', dmg: 22, cd: 2.8, radius: 1,
    desc: '방망이를 들고 회오리처럼 돌아 둘러싼 몬스터를 친다' },
  dk_wispexp: { promo: 2, cls: 'dokkaebi', req: 10, name: '도깨비불\'폭살', kind: 'strike', fx: '147', dmg: 20, cd: 2.8, range: 6, radius: 1, count: 2,
    hitAt: 0.3, desc: '도깨비불을 터뜨려 몬스터 둘과 그 주위를 태운다' },
  // 3차 귀황
  dk_judgment: { promo: 3, cls: 'dokkaebi', req: 14, name: '일격필살\'천벌', kind: 'strike', fx: '139', dmg: 46, cd: 3.4, range: 5, radius: 1, count: 1,
    hitAt: 0.35, strongest: true, desc: '하늘의 벌로 가장 강한 몬스터와 그 주위를 내리찍는다' },
  dk_shock: { promo: 3, cls: 'dokkaebi', req: 14, name: '도깨비불\'뇌격', kind: 'spell', fx: '89', dmg: 18, cd: 2.4, range: 7, count: 3, stun: 0.6,
    hitAt: 0.48, desc: '번개 도깨비불이 몬스터 셋을 치고 잠시 마비시킨다' },
  dk_flatten: { promo: 3, cls: 'dokkaebi', req: 14, name: '평탄화', kind: 'screen', fx: '141', dmg: 14, cd: 6, stun: 0.5,
    desc: '땅을 평평하게 내리쳐 화면의 모든 몬스터를 치고 잠시 멈춘다' },
  // 4차 귀성
  dk_fan: { promo: 4, cls: 'dokkaebi', req: 18, name: '도깨비부채', kind: 'line', fx: '22', dmg: 24, cd: 2.6, depth: 6,
    desc: '도깨비부채를 부쳐 몬스터가 가장 많은 쪽 일렬 여섯 칸을 날려 버린다' },
  dk_super: { promo: 4, cls: 'dokkaebi', req: 18, evolved: true, name: '일격필살\'괴력난신', kind: 'strike', fx: '139', dmg: 60, cd: 3.4, range: 5, radius: 1, count: 2,
    hitAt: 0.3, strongest: true, desc: '일격필살\'징벌 8단 + 4차 승급. 괴력으로 가장 강한 몬스터 둘과 그 주위를 부순다' },
  // 5차 신각
  dk_hamstring: { promo: 5, cls: 'dokkaebi', req: 21, name: '오금걸이', kind: 'strike', fx: '115', dmg: 28, cd: 3, range: 5, radius: 1, count: 2,
    hitAt: 0.3, slow: 3, desc: '오금을 걸어 몬스터 둘과 그 주위에 가시를 솟게 하고 둔화시킨다' },
  dk_firebat: { promo: 5, cls: 'dokkaebi', req: 21, name: '쥐불놀이', kind: 'spell', fx: '148', dmg: 30, cd: 2.4, range: 7, count: 3,
    desc: '도깨비의 궁극오의. 쥐불을 돌려 몬스터 셋에 불을 붙인다' },
  dk_weight: { promo: 5, cls: 'dokkaebi', req: 21, name: '천근추', kind: 'nova', fx: '25', dmg: 30, cd: 3.4, radius: 2, stun: 1,
    desc: '천 근의 무게로 내려앉아 둘레 두 칸의 몬스터를 짓누르고 멈춘다' },
  // 6차 귀극
  dk_storm: { promo: 6, cls: 'dokkaebi', req: 24, name: '도깨비폭풍', kind: 'nova', fx: '25', dmg: 36, cd: 3.4, radius: 2,
    desc: '불타는 바퀴처럼 몰아치는 폭풍으로 둘레 두 칸의 몬스터를 휩쓴다' },
  // 7차~9차: 연's other 도깨비 techniques
  dk_goldhit: { promo: 7, cls: 'dokkaebi', req: 27, name: '금은보화로구나', kind: 'strike', fx: '147', dmg: 32, cd: 2.4, range: 6, radius: 1, count: 3,
    hitAt: 0.3, desc: '방망이에서 쏟아진 금은보화가 몬스터 셋과 그 주위를 친다' },
  dk_body: { promo: 7, cls: 'dokkaebi', req: 27, name: '귀체', kind: 'heal', fx: '125', heal: 30, cd: 12, shieldT: 3,
    desc: '도깨비불을 몸에 받아들여 체력을 회복하고 잠시 보호막을 두른다' },
  dk_nemesis: { promo: 8, cls: 'dokkaebi', req: 30, name: '권선징악', kind: 'strike', fx: '139', dmg: 52, cd: 2.8, range: 5, radius: 1, count: 2,
    hitAt: 0.3, strongest: true, desc: '악을 벌하는 일격이 가장 강한 몬스터 둘과 그 주위를 친다' },
  dk_rage: { promo: 9, cls: 'dokkaebi', req: 33, name: '도깨비의 격노', kind: 'screen', fx: '141', dmg: 60, cd: 9,
    desc: '궁극기. 격노한 도깨비의 방망이가 화면의 모든 몬스터를 내리찍는다' },
  dk_ult: { cls: 'dokkaebi', name: '금나와라,뚝딱', kind: 'ult', fx: '144', hpCost: 0.2,
    desc: '체력 20%와 마력을 모두 써서, 도깨비방망이로 화면의 몬스터를 두들긴다' },

  // 차사 (바람의나라 연 Job_10): its own skill list (Skills_Player 210xxxxx), each with the effect, icon and
  // sound of that 연 record (fx k_<id>, tools/yeon_reaper_skills.json). 연 numbers the 차사's skills in one
  // run; its 승급 tiers come from its sound names (SFX_Reaper_1st_ … 6th_): 1차 수라마검·역공, 2차 풍혼일섬 (with
  // 흡기공·영혼걸음), 3차 무간업화·대영살·영검, 4차 분쇄섬·나선광륜, 5차 영기방출·영기부활, 6차 살극 (사자·사명자·
  // 사저·천명사·월직·일직). 연 has no 7차~9차 for the 차사: those take its remaining 일반 techniques (영혼족쇄,
  // 영기방벽, 개안, 저승문). 절섬, 나선광륜, 영기방출 and 저승문 are particle or broken-alpha effects in 연's
  // bundle: they show the 차사's own 풍혼일섬 swing, 살극 rings, 영기 spirit and 대영살 burst. The fx here
  // is only the old fallback.
  rp_cut: { cls: 'reaper', req: 1, name: '절섬', kind: 'cleave', fx: '20', dmg: 18, cd: 0.75, depth: 1, max: 6,
    desc: '백도로 앞쪽을 베어 몬스터 여섯을 끊어 낸다' },
  rp_flash: { cls: 'reaper', req: 1, name: '진섬\'연', kind: 'blink', fx: '52', dmg: 16, cd: 1.6, range: 5, count: 2,
    desc: '번쩍이며 몬스터 등 뒤로 파고들어 두 번 벤다' },
  rp_shot: { cls: 'reaper', req: 1, name: '영살', kind: 'spell', fx: '53', dmg: 18, cd: 1.8, range: 6, count: 2,
    desc: '영혼의 화살로 몬스터 둘을 꿰뚫는다. 4·7단에 하나씩 는다' },
  rp_walk: { cls: 'reaper', req: 6, name: '영혼걸음', kind: 'buff', buff: 'haste', fx: '7', cd: 14, duration: 4,
    desc: '혼의 걸음으로 잠시 모든 기술이 빨리 돈다' },
  rp_spiral: { cls: 'reaper', req: 6, name: '나선회륜', kind: 'nova', fx: '25', dmg: 24, cd: 2.4, radius: 1,
    desc: '백도를 나선으로 돌려 둘러싼 몬스터를 벤다' },
  rp_drain: { cls: 'reaper', req: 12, name: '흡기공', kind: 'heal', fx: '125', heal: 18, cd: 12,
    desc: '혼의 기운을 빨아들여 이따금 체력을 회복한다' },
  // 1차 사자
  rp_asura: { promo: 1, cls: 'reaper', req: 6, name: '수라마검', kind: 'cleave', fx: '20', dmg: 22, cd: 2.2, depth: 2, max: 6,
    up: 'rp_crush', desc: '수라의 검으로 앞쪽을 크게 베어 몬스터 여섯을 친다' },
  rp_counter: { promo: 1, cls: 'reaper', req: 6, name: '역공', kind: 'nova', fx: '25', dmg: 18, cd: 3, radius: 1, stun: 0.5,
    desc: '받아치는 혼의 기운으로 둘러싼 몬스터를 치고 잠시 멈춘다' },
  // 2차 사명자
  rp_wind: { promo: 2, cls: 'reaper', req: 10, name: '풍혼일섬', kind: 'line', fx: '22', dmg: 22, cd: 2.4, depth: 5,
    desc: '바람의 혼을 실은 일섬이 몬스터가 가장 많은 쪽 일렬 다섯 칸을 벤다' },
  // 3차 사저
  rp_inferno: { promo: 3, cls: 'reaper', req: 14, name: '무간업화', kind: 'strike', fx: '148', dmg: 18, cd: 3.4, range: 6, radius: 2, count: 1,
    hitAt: 0.35, ticks: 2, desc: '무간지옥의 업화를 대상 자리에 피워 그 주위를 거듭 태운다' },
  rp_arrow: { promo: 3, cls: 'reaper', req: 14, name: '대영살', kind: 'strike', fx: '147', dmg: 26, cd: 3, range: 7, radius: 1, count: 2,
    hitAt: 0.3, desc: '큰 영혼의 화살이 몬스터 둘과 그 주위를 터뜨린다' },
  rp_soulbuff: { promo: 3, cls: 'reaper', req: 14, name: '영검', kind: 'buff', buff: 'power', fx: '15', cd: 15, duration: 5, power: 0.6,
    desc: '백도에 영혼을 깃들여 잠시 모든 피해가 크게 늘어난다' },
  // 4차 천명사
  rp_crush: { promo: 4, cls: 'reaper', req: 18, evolved: true, name: '분쇄섬', kind: 'cleave', fx: '140', dmg: 28, cd: 2.6, depth: 3, max: 9,
    desc: '수라마검 8단 + 4차 승급. 앞쪽 넓은 범위의 몬스터 아홉을 부수듯 벤다' },
  rp_madness: { promo: 4, cls: 'reaper', req: 18, name: '나선광륜', kind: 'nova', fx: '25', dmg: 26, cd: 3.2, radius: 2,
    desc: '광기의 고리를 휘돌려 둘레 두 칸의 몬스터를 벤다' },
  // 5차 월직
  rp_burst: { promo: 5, cls: 'reaper', req: 21, name: '영기방출', kind: 'strike', fx: '115', dmg: 30, cd: 3, range: 6, radius: 1, count: 3,
    hitAt: 0.3, curse: 3, desc: '차사의 궁극오의. 모은 영기를 풀어 몬스터 셋과 그 주위를 치고 약화시킨다' },
  rp_resurrect: { promo: 5, cls: 'reaper', req: 21, name: '영기부활', kind: 'heal', fx: '125', heal: 28, cd: 13, shieldT: 3,
    desc: '영기로 몸을 되살려 체력을 회복하고 잠시 보호막을 두른다' },
  // 6차 일직
  rp_deadly: { promo: 6, cls: 'reaper', req: 24, name: '살극', kind: 'strike', fx: '139', dmg: 48, cd: 3, range: 5, radius: 1, count: 2,
    hitAt: 0.3, strongest: true, desc: '가장 강한 몬스터 둘(보스를 먼저)에게 죽음의 일격을 내리친다' },
  // 7차~9차: 연's other 차사 techniques
  rp_chain: { promo: 7, cls: 'reaper', req: 27, name: '영혼족쇄', kind: 'spell', fx: '115', dmg: 30, cd: 1.8, range: 7, count: 3, slow: 3,
    desc: '영혼의 족쇄로 몬스터 셋을 묶어 피해를 주고 느리게 한다' },
  rp_barrier: { promo: 7, cls: 'reaper', req: 27, name: '영기방벽', kind: 'buff', buff: 'shield', fx: '33', cd: 15, duration: 6,
    desc: '영기의 방벽을 둘러 잠시 받는 피해를 절반으로 줄인다' },
  rp_eye: { promo: 8, cls: 'reaper', req: 30, name: '개안', kind: 'buff', buff: 'power', fx: '15', cd: 18, duration: 6, power: 1.2,
    desc: '저승의 눈을 떠 잠시 공격력이 크게 오른다' },
  rp_gate: { promo: 9, cls: 'reaper', req: 33, name: '저승문', kind: 'screen', fx: '141', dmg: 60, cd: 9, slow: 2,
    desc: '궁극기. 저승의 문을 열어 화면의 모든 몬스터를 끌어들여 친다' },
  rp_ult: { cls: 'reaper', name: '차사강림', kind: 'ult', fx: '144', hpCost: 0.2,
    desc: '체력 20%와 마력을 모두 써서, 저승차사의 힘으로 화면의 몬스터를 벤다' },
};

// 차수별 고유 기술 (TIER_SKILLS): each a mechanic of its own (game.js TIER_KINDS), so a class has more
// than "a bigger blow" to pick at every 승급. Names are the class's own 연 records (Skills_Player and
// its older numbering: 유인, 사슬벼락, 연사, 회천, 뇌기지체 ...), 연's shared techniques where the class
// has no more of its own (청명파살, 운화, 백열장, 약육강식, 분골쇄신, 호신강기, 폭화분격) and, for the 차사's
// 9차, the name of 연's 원혼소환 (a monster technique in 연; the 차사 has no tenth record). Icons and
// effects: tools/yeon_tier_skills.json (k_<id> where 연 has the effect; else fx names one already in
// the build). ck: the plain kind a companion casts it as (tierKit, memberTierCast); none = left out.
// fx2: a second picture (the blow, the burst, the orb). Damage and waits sit on each tier's curve.
const TIER_SKILLS = {
  // 전사
  w_lure: { cls: 'warrior', req: 4, name: '유인', kind: 'taunt', fx: 'k_w_roar', hit: 8, cd: 10, range: 4, duration: 3,
    desc: '네 칸 안의 몬스터를 곁으로 끌어모아 치고, 잠시 받는 피해가 절반이 된다' },
  w_will: { cls: 'warrior', req: 9, name: '의지의외침', kind: 'cleanse', fx: 'k_w_bless', hit: 10, cd: 12, duration: 3, stun: 0.8, radius: 1,
    desc: '외침으로 몸에 걸린 해로운 상태를 모두 떨치고, 곁의 몬스터를 기절시키며 잠시 모든 기술이 빨리 돈다' },
  w_gale: { promo: 1, cls: 'warrior', req: 6, name: '영풍진격', kind: 'charge', fx: 'k_w_rush', fx2: 'k_w_tiger', dmg: 22, cd: 3, range: 5, radius: 1, stun: 0.8, ck: 'nova',
    desc: '무적이 되어 몬스터가 가장 많이 모인 곳으로 돌진해 내리찍고 둘레를 기절시킨다' },
  w_tarok: { promo: 6, cls: 'warrior', req: 24, name: '타력광풍', kind: 'spin', fx: 'k_w_chohon', dmg: 30, cd: 5, radius: 1, ticks: 8, tick: 0.3, ck: 'nova',
    desc: '광풍처럼 몸을 돌려 2.4초 동안 둘레의 몬스터를 거듭 베며, 도는 사이에도 움직일 수 있다' },
  w_gwangya: { promo: 7, cls: 'warrior', req: 27, name: '광야건곤', kind: 'execute', fx: 'k_w_flash', dmg: 36, cd: 3.5, depth: 3, below: 0.3, ck: 'cleave', max: 9,
    desc: '앞쪽 역삼각형을 가른다. 체력이 30% 아래인 몬스터는 단숨에 쓰러지고, 상처가 깊을수록 더 아프다' },
  w_hogi: { promo: 9, cls: 'warrior', req: 33, name: '호기방출', kind: 'gust', fx: 'k_w_blackdragon', hit: 34, cd: 14, duration: 5, radius: 1, tick: 0.4, power: 0.2,
    desc: '호기의 바람을 5초 동안 두른다. 바람이 둘레의 몬스터를 거듭 치고 밀어내며, 그동안 피해가 20% 는다' },
  // 도적
  r_chamgan: { promo: 7, cls: 'rogue', req: 27, name: '참간맹습', kind: 'hop', fx: 'k_r_dance', dmg: 30, cd: 3, range: 5, count: 4, stun: 0.5, ck: 'blink',
    desc: '몬스터에서 몬스터로 번개처럼 옮겨 다니며 넷을 차례로 베고 잠시 멈춘다' },
  r_hyeoldok: { promo: 8, cls: 'rogue', req: 30, name: '혈독주입', kind: 'zone', fx: 'g_poison_purple', fx2: 'y_hyeoldok', dmg: 26, cd: 6, radius: 2, duration: 4, tick: 0.5, k: 0.3, at: 'self', dot: 'venom', ck: 'strike',
    desc: '발밑에 피의 독을 퍼뜨린다. 4초 동안 독에 닿은 몬스터는 거듭 피해를 입고 맹독에 걸린다' },
  r_tudo: { promo: 9, cls: 'rogue', req: 33, name: '투도멸진', kind: 'mark', fx: 'g_curse_zod', fx2: 'k_r_amsal', dmg: 42, cd: 4.5, range: 5, count: 6, radius: 1, delay: 2, weak: 0.25, ck: 'strike',
    desc: '몬스터 여섯의 약점을 드러내 2초 동안 받는 피해를 25% 늘린 뒤, 약점이 한꺼번에 터진다' },
  // 주술사
  m_chain: { promo: 6, cls: 'mage', req: 24, name: '사슬벼락', kind: 'chain', fx: 'k_p_noejeon', dmg: 26, cd: 2.4, range: 7, count: 5, jump: 3, decay: 0.82, stun: 0.4, ck: 'spell',
    desc: '벼락이 몬스터에서 몬스터로 사슬처럼 튀어 다섯을 친다. 한 번 튈 때마다 조금씩 약해진다' },
  m_instant: { promo: 7, cls: 'mage', req: 27, name: '즉발시전', kind: 'reset', fx: 'k_m_magi', cd: 16, duration: 2,
    desc: '다른 모든 마법의 재사용 대기를 거의 끝내고, 잠시 모든 마법이 빨리 돈다' },
  m_seonsim: { promo: 9, cls: 'mage', req: 33, name: '선심단멸', kind: 'detonate', fx: 'k_m_manpa', fx2: 'k_m_curse', dmg: 34, cd: 3, range: 7, radius: 2, curse: 4, per: 0.35, ck: 'strike',
    desc: '대상 둘레에 저주를 내리고 터뜨린다. 저주·둔화·마비·중독처럼 걸린 상태가 많을수록 더 크게 터진다' },
  // 도사
  p_honma: { promo: 6, cls: 'poet', req: 24, name: '혼마기', kind: 'stack', fx: 'k_p_daeseon', fx2: 'k_p_jiroe', dmg: 20, cd: 1.8, range: 7, count: 3, stacks: 4, per: 0.25, ck: 'spell',
    desc: '혼을 어지럽혀 몬스터 셋에 혼마를 쌓는다. 쌓일수록 아프고, 넷이 쌓이면 혼이 터져 둘레까지 친다' },
  p_saint: { promo: 8, cls: 'poet', req: 30, name: '신성제마술', kind: 'cleanse', fx: 'k_p_judge', heal: 26, cd: 15, duration: 2, party: true, ck: 'heal',
    desc: '자신과 동료에게 걸린 해로운 상태를 모두 걷어 내고 체력을 채우며, 잠시 어떤 공격도 받지 않는다' },
  p_seongi: { promo: 9, cls: 'poet', req: 33, name: '선기전도', kind: 'wave', fx: 'k_p_wave', dmg: 40, cd: 6, radius: 5, push: 2, shieldT: 3, ck: 'nova',
    desc: '선기가 둥글게 퍼져 다섯 칸까지 차례로 몬스터를 치고 밀어내며, 자신은 잠시 보호막을 두른다' },
  // 궁사
  a_cheong: { cls: 'archer', req: 3, name: '청명파살', kind: 'lance', fx: 'k_a_spiral', fx2: 'k_a_cheong', dmg: 16, cd: 2.2, depth: 9, grow: 0.12, ck: 'line',
    desc: '푸른 빛의 화살이 아홉 칸을 꿰뚫는다. 꿰뚫을 때마다 12%씩 강해진다' },
  a_cloud: { cls: 'archer', req: 8, name: '운상미보', kind: 'evade', fx: 'k_a_weebo', fx2: 'k_a_shot', hit: 14, cd: 7, count: 3, guard: 0.6, range: 6,
    desc: '구름 위를 걷듯 가까운 몬스터에게서 세 칸 물러나며 잠시 무적이 되고, 물러나며 셋에게 화살을 쏜다' },
  a_rapid: { promo: 1, cls: 'archer', req: 6, name: '연사', kind: 'flurry', fx: 'k_a_shot', dmg: 14, cd: 2.4, range: 6, hits: 6, k: 0.4, ck: 'spell',
    desc: '한 몬스터에게 화살 여섯 발을 쉴 새 없이 쏜다. 4·7단에 한 발씩 는다' },
  a_rod: { promo: 6, cls: 'archer', req: 24, name: '낙뢰충전', kind: 'totem', fx: 'k_a_thunder', fx2: 'k_dk_shock', hit: 26, cd: 8, range: 5, duration: 5, every: 0.6, k: 0.45, ck: 'strike', radius: 0,
    desc: '벼락을 모은 화살을 땅에 꽂는다. 5초 동안 둘레 다섯 칸의 몬스터에게 벼락이 잇달아 떨어진다' },
  a_tuhyeol4: { promo: 7, cls: 'archer', req: 27, name: '투혈사식', kind: 'mark', fx: 'g_nura_bleed', fx2: 'k_a_tuhyeol4', dmg: 40, cd: 4, range: 7, count: 3, radius: 1, delay: 1.5, hpCost: 0.04, strongest: true, ck: 'strike',
    desc: '피를 태워(체력 4%) 가장 강한 몬스터 셋에 피의 화살을 박는다. 1.5초 뒤 화살이 터져 둘레까지 친다' },
  a_unhwa: { promo: 9, cls: 'archer', req: 33, name: '운화', kind: 'rain', fx: 'y_baram', fx2: 'k_a_storm', dmg: 36, cd: 5, range: 7, radius: 3, drops: 10, dur: 2.5, k: 0.55, ck: 'strike',
    desc: '몬스터가 가장 많은 곳 위에 구름 문을 열어 2.5초 동안 화살 열 줄기를 쏟는다' },
  // 무사
  l_hoecheon: { cls: 'lancer', req: 3, name: '회천', kind: 'boomerang', fx: 'k_l_hoecheon', dmg: 14, cd: 2.2, depth: 5, ck: 'line',
    desc: '창을 회전시켜 던진다. 다섯 칸을 날아갔다 돌아오며 오가는 길의 몬스터를 두 번 친다' },
  l_noegi: { cls: 'lancer', req: 9, name: '뇌기지체', kind: 'orbit', fx: 'g_astra', fx2: 'h_hit_light', hit: 12, cd: 12, duration: 6, n: 3, k: 0.4, ck: 'nova', radius: 1,
    desc: '뇌기의 구슬 셋이 6초 동안 몸 둘레를 돌며 닿는 몬스터를 친다' },
  l_noegichim: { promo: 1, cls: 'lancer', req: 6, name: '뇌기침투', kind: 'knock', fx: 'k_x_l_meteor_shot', dmg: 22, cd: 2.6, depth: 4, push: 2, stun: 0.5, ck: 'line',
    desc: '뇌기를 실은 창끝으로 앞 네 칸을 꿰찔러 몬스터를 두 칸 밀어내고 잠시 멈춘다' },
  l_revenge: { promo: 6, cls: 'lancer', req: 24, name: '복수', kind: 'thorns', fx: 'k_l_reflect', fx2: 'h_ml_burst', hit: 30, cd: 14, duration: 6, radius: 1, tick: 0.5, k: 0.35, curse: 2,
    desc: '6초 동안 곁에서 덤비는 몬스터에게 복수의 분노로 거듭 되갚아 치고 약화시킨다' },
  l_weebo: { promo: 7, cls: 'lancer', req: 27, name: '위위비보', kind: 'evade', fx: 'k_a_weebo', fx2: 'k_l_spirit', hit: 34, cd: 8, guard: 1, radius: 1, after: true,
    desc: '깃털처럼 세 칸 물러나며 1초 동안 무적이 되고, 서 있던 자리에 남긴 잔상이 터져 둘레를 친다' },
  l_ungi: { promo: 9, cls: 'lancer', req: 33, name: '운기', kind: 'regen', fx: 'k_l_innate', hot: 3, cd: 18, duration: 6, mana: 0.2, ck: 'heal',
    desc: '기운을 모아 6초 동안 매 0.5초 최대 체력의 3%씩 회복하고 마력을 채운다' },
  // 격투가
  mk_whitepalm: { cls: 'monk', req: 3, name: '백열장', kind: 'knock', fx: 'k_mk_whitepalm', dmg: 18, cd: 2, depth: 3, push: 2, ck: 'line',
    desc: '하얀 장풍으로 앞 세 칸의 몬스터를 두 칸 밀쳐 낸다. 밀리다 막힌 몬스터는 잠시 멈춘다' },
  mk_whirl: { cls: 'monk', req: 9, name: '회오리', kind: 'vortex', fx: 'k_dk_whirl', dmg: 16, cd: 4, depth: 5, dur: 1.2, k: 0.35, ck: 'line',
    desc: '회오리를 앞으로 보내 다섯 칸을 휩쓴다. 곁의 몬스터를 길 위로 빨아들이며 거듭 친다' },
  mk_air: { promo: 1, cls: 'monk', req: 6, name: '허공답보', kind: 'charge', fx: 'k_mk_air', fx2: 'k_mk_quake', dmg: 24, cd: 3, range: 5, radius: 1, stun: 0.6, ck: 'nova',
    desc: '허공을 밟고 뛰어올라 몬스터가 가장 많은 곳에 내려앉으며 둘레를 친다' },
  mk_muhan: { promo: 6, cls: 'monk', req: 24, name: '무한류', kind: 'flurry', fx: 'h_ml_punch', fx2: 'k_mk_bung', dmg: 34, cd: 3, range: 2, hits: 10, k: 0.3, stun: 0.8, melee: true, ck: 'slash',
    desc: '앞의 한 몬스터에게 주먹 열 번을 끝없이 퍼붓고, 마지막 일격으로 띄워 잠시 멈춘다' },
  mk_stack: { promo: 8, cls: 'monk', req: 30, name: '권기중첩', kind: 'stack', fx: 'k_mk_pointblue', fx2: 'k_mk_pointburst', dmg: 30, cd: 1.8, range: 4, count: 3, stacks: 4, per: 0.25, ck: 'spell',
    desc: '권기를 몬스터 셋에 겹겹이 쌓는다. 쌓일수록 아프고, 넷이 쌓이면 권기가 터져 둘레까지 친다' },
  mk_yuk: { promo: 9, cls: 'monk', req: 33, name: '약육강식', kind: 'execute', fx: 'k_mk_kyokushin', dmg: 42, cd: 3, depth: 2, below: 0.35, ck: 'cleave', max: 6,
    desc: '약한 자는 강한 자의 먹이. 앞쪽을 쳐서 체력이 35% 아래인 몬스터는 단숨에 쓰러뜨린다' },
  // 마도사
  md_fice: { promo: 6, cls: 'magus', req: 24, name: '광폭구슬\'수', kind: 'zone', fx: 'y_seori', fx2: 'k_md_orbice', dmg: 26, cd: 5, range: 7, radius: 2, duration: 4, tick: 0.5, k: 0.3, slow: 2, ck: 'strike',
    desc: '물의 광폭구슬을 던져 대상 둘레를 4초 동안 얼음 땅으로 만든다. 그 위의 몬스터는 거듭 피해를 입고 느려진다' },
  md_flight: { promo: 7, cls: 'magus', req: 27, name: '광폭구슬\'뇌', kind: 'chain', fx: 'k_md_orblight', dmg: 30, cd: 2.4, range: 7, count: 5, jump: 3, decay: 0.85, stun: 0.4, ck: 'spell',
    desc: '전기의 광폭구슬이 맞은 몬스터에서 곁의 몬스터로 다섯 번 전파된다' },
  md_ffire: { promo: 9, cls: 'magus', req: 33, name: '광폭구슬\'화', kind: 'mark', fx: 'k_md_orbfire', fx2: 'k_md_bust', dmg: 46, cd: 3.5, range: 7, count: 2, radius: 2, delay: 1.2, ck: 'strike',
    desc: '불의 광폭구슬을 몬스터 둘에 붙인다. 1.2초 뒤 구슬이 터져 둘레 두 칸을 크게 태운다' },
  // 천인
  cl_gray: { promo: 6, cls: 'celestial', req: 24, name: '회색지대', kind: 'vortex', fx: 'g_grab_ghost', dmg: 30, cd: 4, depth: 6, dur: 1.4, k: 0.35, slow: 3, ck: 'line',
    desc: '거대한 회색 그림자가 앞으로 여섯 칸을 지나가며 닿는 몬스터를 끌어들여 치고 느리게 한다' },
  cl_wedge: { promo: 8, cls: 'celestial', req: 30, name: '그림자쐐기', kind: 'trap', fx: 'g_curse_zod', fx2: 'k_cl_armor', dmg: 34, cd: 6, range: 4, count: 5, radius: 1, duration: 8, stun: 1, ck: 'strike',
    desc: '몬스터 곁의 그림자 다섯 곳에 쐐기를 박는다. 8초 안에 몬스터가 다가오면 쐐기가 솟아 치고 묶는다' },
  cl_shatter: { promo: 9, cls: 'celestial', req: 33, name: '분골쇄신', kind: 'sacrifice', fx: 'k_cl_shatter', fx2: 'k_cl_slam', dmg: 40, cd: 6, radius: 2, hpCost: 0.12, k: 1.5, ck: 'nova',
    desc: '몸을 부수듯 체력 12%를 바쳐 둘레 두 칸을 내리친다. 바친 체력이 클수록 피해가 커진다' },
  // 도깨비
  dk_walk: { cls: 'dokkaebi', req: 4, name: '도깨비걸음', kind: 'charge', fx: 'k_x_dk_firebat_cast', fx2: 'k_dk_paddle', dmg: 18, cd: 3, range: 4, radius: 1, slow: 2, ck: 'nova',
    desc: '누구도 따라올 수 없는 걸음으로 몬스터 무리 한가운데 뛰어들어 둘레를 치고 느리게 한다' },
  dk_wisp1: { cls: 'dokkaebi', req: 9, name: '도깨비불 1성', kind: 'orbit', fx: 'g_flame', fx2: 'h_hit_fire', hit: 12, cd: 11, duration: 6, n: 2, k: 0.45, dot: 'burn', ck: 'nova', radius: 1,
    desc: '도깨비불 둘이 6초 동안 몸 둘레를 돌며 닿는 몬스터를 태운다(화상)' },
  dk_mook: { promo: 1, cls: 'dokkaebi', req: 6, name: '메밀묵섭취', kind: 'regen', fx: 'k_dk_body', hot: 2.5, cd: 16, duration: 5, shieldT: 3, ck: 'heal',
    desc: '아껴 둔 메밀묵을 먹어 5초 동안 체력을 조금씩 채우고, 잠시 받는 피해가 절반이 된다' },
  dk_wisp2: { promo: 6, cls: 'dokkaebi', req: 24, name: '도깨비불 2성', kind: 'totem', fx: 'k_dk_wisp', tint: 'sepia(1) saturate(5) hue-rotate(-30deg)', fxk: 1.35, fx2: 'h_hit_fire', hit: 28, cd: 8, range: 5, duration: 6, every: 0.5, k: 0.35, dot: 'burn', ck: 'strike', radius: 0,
    desc: '도깨비불 화로를 세운다. 6초 동안 둘레 다섯 칸의 몬스터에게 불덩이를 잇달아 날린다' },
  dk_maryu: { promo: 8, cls: 'dokkaebi', req: 30, name: '마류귀체', kind: 'thorns', fx: 'k_dk_strength', fx2: 'h_hit_fire', hit: 32, cd: 14, duration: 6, radius: 1, tick: 0.5, k: 0.35, drain: 0.01,
    desc: '6초 동안 곁에서 덤비는 몬스터를 거듭 되받아치며, 칠 때마다 체력을 조금씩 되찾는다' },
  dk_wisp3: { promo: 9, cls: 'dokkaebi', req: 33, name: '도깨비불 3성', kind: 'barrage', fx: 'g_sinsu_jujak_fire', fx2: 'k_dk_wispexp', dmg: 38, cd: 3.5, depth: 6, n: 7, k: 0.6, radius: 1, ck: 'spell', count: 3, range: 6,
    desc: '도깨비불 일곱을 부채꼴로 날린다. 몬스터에 닿은 불은 터져 둘레까지 태운다' },
  // 차사
  rp_convert: { cls: 'reaper', req: 4, name: '영기변환', kind: 'stack', fx: 'k_rp_shot', fx2: 'k_rp_burst', dmg: 14, cd: 1.8, range: 5, count: 2, stacks: 4, per: 0.25, ck: 'spell',
    desc: '베어 낸 영기를 몬스터 둘에 쌓는다. 쌓일수록 아프고, 넷이 쌓이면 영기가 터져 둘레까지 친다' },
  rp_nether: { promo: 1, cls: 'reaper', req: 6, name: '저승의기원', kind: 'regen', fx: 'k_rp_resurrect', hot: 2.5, cd: 15, duration: 4, shieldT: 2, ck: 'heal',
    desc: '저승의 기운으로 4초 동안 체력을 조금씩 채우고, 잠시 보호막을 두른다' },
  rp_resonate: { promo: 2, cls: 'reaper', req: 10, name: '영혼공명', kind: 'orbit', fx: 'g_jinhon', fx2: 'k_rp_shot', hit: 14, cd: 12, duration: 6, n: 3, k: 0.45, slow: 1, ck: 'nova', radius: 1,
    desc: '공명하는 영혼 셋이 6초 동안 몸 둘레를 돌며 닿는 몬스터를 치고 느리게 한다' },
  rp_guard: { promo: 4, cls: 'reaper', req: 18, name: '호신강기', kind: 'shieldburst', fx: 'k_cl_wall', fx2: 'k_rp_madness', hit: 30, cd: 12, duration: 4, radius: 2, stun: 0.6,
    desc: '강기를 둘러 4초 동안 받는 피해가 절반이 되고, 강기가 풀릴 때 터져 둘레 두 칸을 치고 멈춘다' },
  rp_bomb: { promo: 6, cls: 'reaper', req: 24, name: '폭화분격', kind: 'mark', fx: 'g_god_of_fire', fx2: 'k_rp_bomb', dmg: 42, cd: 4, range: 6, count: 3, radius: 1, delay: 1.4, dot: 'burn', ck: 'strike',
    desc: '몬스터 셋에 업화의 불씨를 심는다. 1.4초 뒤 불씨가 터져 둘레까지 태운다(화상)' },
  rp_wraith: { promo: 9, cls: 'reaper', req: 33, name: '원혼소환', kind: 'totem', fx: 'k_rp_soulbuff', fx2: 'k_rp_shot', hit: 36, cd: 8, range: 6, duration: 6, every: 0.45, k: 0.35, shots: 2, ck: 'strike', radius: 0,
    desc: '원혼을 불러 세운다. 6초 동안 원혼이 둘레 여섯 칸의 몬스터 둘씩에게 혼의 화살을 잇달아 쏜다' },
};
Object.assign(SKILLS, TIER_SKILLS);
// The late ones come by 계승 in the place of a spell of their line (PRE below).
const TIER_PRE = {
  w_tarok: 'w_chohon', w_gwangya: 'w_roar3', w_hogi: 'w_tarok', r_chamgan: 'r_dance', r_hyeoldok: 'r_drain', r_tudo: 'r_jiok',
  m_chain: 'm_cheonggi', m_instant: 'm_magi', m_seonsim: 'm_curse', p_honma: 'p_weaken', p_saint: 'p_baekho2', p_seongi: 'p_daeseon',
  a_rod: 'a_freeze', a_tuhyeol4: 'a_breakair', a_unhwa: 'a_storm', l_revenge: 'l_innate', l_weebo: 'l_wind', l_ungi: 'l_revenge',
  mk_muhan: 'mk_uppercut', mk_stack: 'mk_pointburst', mk_yuk: 'mk_kyokushin', md_fice: 'md_orbice', md_flight: 'md_orblight',
  md_ffire: 'md_orbfire', cl_gray: 'cl_storm', cl_wedge: 'cl_bind', cl_shatter: 'cl_slam', dk_wisp2: 'dk_wisp1', dk_maryu: 'dk_body',
  dk_wisp3: 'dk_wisp2', rp_bomb: 'rp_inferno', rp_wraith: 'rp_bomb',
};
// 승급: each class's own conquests, in order. 1차 쥐굴, 2차 사슴굴, 3차 흉가, 4차 도깨비굴, 5차 요괴굴, 6차 왕궁, 7차 무신의 탑, 8차 기린산, 9차 타계 마령굴.
// 승급: each class's own conquests, in order. 1차 쥐굴, 2차 사슴굴, 3차 흉가, 4차 도깨비굴.
// The spell tree: three 계열 a class, each running from the first spells to the 9차; a spell of
// 5차 and beyond comes on the cards only once the one before it in its 계열 is at 3단 in this
// hunt (pre), and each class's 9차 궁극기 is the awakening of its 7차 spell at 8단 (up).
export const BRANCHES = {
  warrior: [
    { name: '검기', note: '일렬·돌진으로 뚫는다', ids: ['w_slash', 'w_fly', 'w_sword', 'w_rush', 'w_flash', 'w_advance', 'w_swords'] },
    { name: '백호', note: '범위로 베어 쓸어낸다', ids: ['w_tiger', 'w_howl', 'w_roar2', 'w_dragon', 'w_thunder', 'w_blackdragon', 'w_myriad'] },
    { name: '투혼', note: '기세를 올리고 붙잡는다', ids: ['w_buff', 'w_jin', 'w_lion', 'w_stone', 'w_frenzy', 'w_sentence', 'w_dawn'] },
  ],
  rogue: [
    { name: '검무', note: '날아들어 연달아 벤다', ids: ['r_blink', 'r_dance', 'r_flysword', 'r_hidden', 'r_bloom', 'r_flamesword', 'r_bloodslash', 'r_gale'] },
    { name: '암기', note: '던지고 꿰뚫는다', ids: ['r_bolt', 'r_formless', 'r_venom', 'r_shuriken', 'r_kill', 'r_shadowstar', 'r_chainstar'] },
    { name: '그림자', note: '숨고 분신으로 싸운다', ids: ['r_stealth', 'r_clone', 'r_budong', 'r_phantom', 'r_shadowclone'] },
  ],
  mage: [
    { name: '화염', note: '태워 없앤다', ids: ['m_fire', 'm_sammae', 'm_fire3', 'm_desert', 'm_inferno', 'm_kalpa'] },
    { name: '빙뢰', note: '얼리고 번개로 친다', ids: ['m_ice', 'm_quake', 'm_frost', 'm_twin', 'm_cross', 'm_coldveil', 'm_thunderball', 'm_shards', 'm_gale'] },
    { name: '주술', note: '저주하고 묶고 빠르게', ids: ['m_curse', 'm_para', 'm_magi', 'm_wisdom', 'm_shift'] },
  ],
  poet: [
    { name: '기원', note: '살리고 채운다', ids: ['c_heal', 'p_baekho', 'p_spirit', 'p_phoenix', 'p_realm', 'p_warmth', 'p_skyspirit'] },
    { name: '천벌', note: '하늘의 벌로 친다', ids: ['p_orb', 'p_quake', 'p_judge', 'p_burst', 'p_flash', 'p_thunderbomb'] },
    { name: '진법', note: '진을 펼쳐 지키고 누른다', ids: ['p_barrier', 'p_aegis', 'p_wave', 'p_wargod', 'p_bagua', 'p_dragongod', 'p_bind', 'p_taiji'] },
  ],
  archer: [
    { name: '사격', note: '멀리서 꿰뚫는다', ids: ['a_shot', 'a_spiral', 'a_silence', 'a_tempest', 'a_inferno', 'a_chase', 'a_chain', 'a_air', 'a_blood5'] },
    { name: '마탄', note: '터뜨리고 쏟아붓는다', ids: ['a_aim', 'a_firewall', 'a_flame', 'a_bomb', 'a_freeze', 'a_storm', 'a_breakair', 'a_whirl', 'a_allwhirl', 'a_fetter', 'a_eagle'] },
    { name: '궁술', note: '화살을 강화하고 몸을 지킨다', ids: ['a_ice', 'a_coverfire', 'a_thunder', 'a_bloodsuck', 'a_shadow', 'a_weebo', 'a_bless'] },
  ],
  lancer: [
    { name: '창술', note: '일렬로 꿰찌른다', ids: ['l_moon', 'l_phantom', 'l_spiral', 'l_rush', 'l_firedragon', 'l_annihil', 'l_javelin', 'l_moonfull'] },
    { name: '창격', note: '휘두르고 내리꽂는다', ids: ['l_halfmoon', 'l_meteor', 'l_rise', 'l_illusion', 'l_extinct', 'l_waves', 'l_burst', 'l_genesis', 'l_extinct2', 'l_formless', 'l_dragon', 'l_release', 'l_spirit'] },
    { name: '기공', note: '기를 돌려 몸을 지킨다', ids: ['l_wind', 'l_innate', 'l_unity', 'l_guard', 'l_thunder', 'l_union', 'l_reflect'] },
  ],
  monk: [
    { name: '권법', note: '파고들어 두들긴다', ids: ['mk_bung', 'mk_sudden', 'mk_smash', 'mk_body', 'mk_uppercut', 'mk_wolf', 'mk_combo', 'mk_kyokushin', 'mk_resonance'] },
    { name: '점혈', note: '혈을 짚어 묶고 터뜨린다', ids: ['mk_pointblue', 'mk_pointlight', 'mk_pointburst', 'mk_buddha', 'mk_quake', 'mk_rupture', 'mk_advent', 'mk_point', 'mk_aventhit'] },
    { name: '내공', note: '기를 돌려 몸을 지킨다', ids: ['mk_switch', 'mk_endure', 'mk_spirit', 'mk_diamond', 'mk_technique', 'mk_focus', 'mk_feint', 'mk_origin'] },
  ],
  magus: [
    { name: '기공', note: '구슬과 광선으로 친다', ids: ['md_sphere', 'md_arrow', 'md_orbice', 'md_orblight', 'md_orbfire', 'md_cross', 'md_ray', 'md_exfrenzy', 'md_crossfrenzy', 'md_storm', 'md_stormfrenzy'] },
    { name: '광폭', note: '광폭기로 휩쓴다', ids: ['md_spirit', 'md_frenzyexp', 'md_decay', 'md_wave', 'md_silence', 'md_bust', 'md_absorb', 'md_bloodbat', 'md_resonance', 'md_wavefrenzy'] },
    { name: '금기', note: '결계와 기원으로 버틴다', ids: ['md_enhance', 'md_heal', 'md_amulet', 'md_recovery', 'md_boundary', 'md_yinyang', 'md_frenetic', 'md_manafill'] },
  ],
  celestial: [
    { name: '천벌', note: '하늘의 불꽃과 번개를 떨어뜨린다', ids: ['cl_boom', 'cl_crow', 'cl_armor', 'cl_storm', 'cl_storm2', 'cl_bind', 'cl_thunder', 'cl_crowfire', 'cl_ego', 'cl_gumiho', 'cl_reindeer'] },
    { name: '질주', note: '몬스터 사이로 뛰어든다', ids: ['cl_ago', 'cl_moment', 'cl_acumen', 'cl_brilliant', 'cl_slam', 'cl_claw', 'cl_tiger'] },
    { name: '수호', note: '피를 빼앗고 몸을 지킨다', ids: ['cl_blood', 'cl_yeorae', 'cl_wall', 'cl_blood2', 'cl_bagua', 'cl_snake', 'cl_intrep', 'cl_defense'] },
  ],
  dokkaebi: [
    { name: '일격', note: '강한 적을 내리찍는다', ids: ['dk_punish', 'dk_throw', 'dk_judgment', 'dk_super', 'dk_hamstring', 'dk_nemesis', 'dk_rage'] },
    { name: '방망이', note: '휘두르고 휩쓴다', ids: ['dk_repel', 'dk_paddle', 'dk_roar', 'dk_whirl', 'dk_flatten', 'dk_fan', 'dk_weight', 'dk_storm', 'dk_goldhit'] },
    { name: '도깨비불', note: '불을 날리고 몸을 감춘다', ids: ['dk_wisp', 'dk_strength', 'dk_hat', 'dk_wispexp', 'dk_shock', 'dk_firebat', 'dk_body'] },
  ],
  reaper: [
    { name: '검술', note: '베고 파고든다', ids: ['rp_cut', 'rp_flash', 'rp_asura', 'rp_wind', 'rp_crush', 'rp_deadly', 'rp_spiral', 'rp_madness', 'rp_counter'] },
    { name: '영혼', note: '혼을 쏘고 불태운다', ids: ['rp_shot', 'rp_inferno', 'rp_arrow', 'rp_burst', 'rp_chain', 'rp_gate'] },
    { name: '저승', note: '기운을 빨고 몸을 지킨다', ids: ['rp_walk', 'rp_drain', 'rp_soulbuff', 'rp_resurrect', 'rp_barrier', 'rp_eye'] },
  ],
};
// The 차수별 기술 in their 계열 (index of the class's branch above).
const TIER_BRANCH = {
  w_gale: 0, w_gwangya: 0, w_tarok: 1, w_hogi: 1, w_lure: 2, w_will: 2,
  r_chamgan: 0, r_tudo: 1, r_hyeoldok: 1,
  m_seonsim: 2, m_chain: 1, m_instant: 2,
  p_saint: 0, p_honma: 1, p_seongi: 2,
  a_cheong: 0, a_rapid: 0, a_unhwa: 1, a_rod: 1, a_tuhyeol4: 1, a_cloud: 2,
  l_hoecheon: 0, l_noegichim: 0, l_weebo: 1, l_noegi: 2, l_revenge: 2, l_ungi: 2,
  mk_whitepalm: 0, mk_muhan: 0, mk_yuk: 0, mk_whirl: 1, mk_stack: 1, mk_air: 2,
  md_fice: 0, md_flight: 0, md_ffire: 1,
  cl_shatter: 0, cl_gray: 1, cl_wedge: 2,
  dk_walk: 1, dk_wisp1: 2, dk_wisp2: 2, dk_wisp3: 2, dk_mook: 2, dk_maryu: 2,
  rp_convert: 0, rp_bomb: 1, rp_wraith: 1, rp_resonate: 1, rp_nether: 2, rp_guard: 2,
};
for (const [id, i] of Object.entries(TIER_BRANCH)) BRANCHES[SKILLS[id].cls][i].ids.push(id);

const PRE = {
  w_rush: 'w_sword', w_flash: 'w_rush', w_advance: 'w_flash', w_swords: 'w_flash',
  w_dragon: 'w_howl', w_thunder: 'w_dragon', w_blackdragon: 'w_thunder',
  w_stone: 'w_jin', w_frenzy: 'w_stone', w_sentence: 'w_lion', w_dawn: 'w_frenzy',
  r_hidden: 'r_flysword', r_bloom: 'r_hidden', r_flamesword: 'r_hidden', r_bloodslash: 'r_flamesword',
  r_venom: 'r_bolt', r_shuriken: 'r_venom', r_kill: 'r_formless', r_shadowstar: 'r_shuriken', r_chainstar: 'r_shadowstar',
  r_phantom: 'r_clone', r_shadowclone: 'r_phantom',
  m_desert: 'm_sammae', m_inferno: 'm_desert',
  m_frost: 'm_ice', m_twin: 'm_frost', m_cross: 'm_twin', m_coldveil: 'm_frost', m_thunderball: 'm_twin',
  m_shards: 'm_coldveil', m_gale: 'm_thunderball', m_wisdom: 'm_magi', m_shift: 'm_wisdom',
  p_realm: 'p_spirit', p_warmth: 'p_realm', p_skyspirit: 'p_warmth',
  p_judge: 'p_orb', p_burst: 'p_judge', p_flash: 'p_burst', p_thunderbomb: 'p_flash',
  p_wargod: 'p_aegis', p_bagua: 'p_wave', p_dragongod: 'p_wargod', p_bind: 'p_wave',
  a_inferno: 'a_tempest', a_chase: 'a_inferno', a_chain: 'a_chase', a_air: 'a_chain',
  a_fetter: 'a_whirl', a_eagle: 'a_fetter',
  a_bloodsuck: 'a_thunder', a_shadow: 'a_bloodsuck', a_weebo: 'a_shadow', a_bless: 'a_shadow',
  l_extinct2: 'l_extinct', l_annihil: 'l_rush', l_dragon: 'l_annihil', l_javelin: 'l_dragon', l_formless: 'l_burst',
  l_guard: 'l_unity', l_thunder: 'l_guard', l_union: 'l_guard', l_reflect: 'l_union', l_spirit: 'l_release',
  mk_combo: 'mk_wolf', mk_kyokushin: 'mk_combo', mk_advent: 'mk_rupture', mk_point: 'mk_advent', mk_technique: 'mk_diamond',
  mk_focus: 'mk_technique', mk_feint: 'mk_focus', mk_origin: 'mk_feint',
  md_bloodbat: 'md_silence', md_crossfrenzy: 'md_ray', md_stormfrenzy: 'md_crossfrenzy', md_storm: 'md_stormfrenzy', md_resonance: 'md_bloodbat',
  md_boundary: 'md_recovery', md_yinyang: 'md_boundary', md_frenetic: 'md_yinyang', md_manafill: 'md_frenetic',
  cl_tiger: 'cl_claw', cl_crowfire: 'cl_storm2', cl_bagua: 'cl_blood2', cl_ego: 'cl_crowfire', cl_gumiho: 'cl_ego',
  cl_snake: 'cl_bagua', cl_intrep: 'cl_snake', cl_defense: 'cl_intrep',
  dk_hamstring: 'dk_judgment', dk_firebat: 'dk_shock', dk_weight: 'dk_fan', dk_storm: 'dk_weight', dk_goldhit: 'dk_storm',
  dk_body: 'dk_firebat', dk_nemesis: 'dk_hamstring',
  rp_burst: 'rp_arrow', rp_resurrect: 'rp_soulbuff', rp_deadly: 'rp_madness', rp_chain: 'rp_deadly', rp_barrier: 'rp_resurrect',
  rp_eye: 'rp_barrier',
};
const AWAKEN = { w_thunder: 'w_myriad', r_bloom: 'r_gale', m_inferno: 'm_kalpa', p_bagua: 'p_taiji', a_chain: 'a_blood5', l_dragon: 'l_moonfull', mk_point: 'mk_aventhit', md_storm: 'md_wavefrenzy', cl_gumiho: 'cl_reindeer', dk_nemesis: 'dk_rage', rp_chain: 'rp_gate' };
for (const [id, from] of Object.entries(PRE)) SKILLS[id].pre = [from, 3];
for (const [id, from] of Object.entries(TIER_PRE)) SKILLS[id].pre = [from, 3];
for (const [from, into] of Object.entries(AWAKEN)) {
  SKILLS[from].up = into;
  SKILLS[into].evolved = true;
  SKILLS[into].desc = `${SKILLS[from].name} 8단 + 9차 승급. ` + SKILLS[into].desc;
}
// The 5차+ spells' own looks. The old site has an effect for every spell up to 4차; past that
// the game borrows them, so each spell here picks its own (some from effects no spell used)
// and its own colour, drawn as a canvas/CSS filter over the effect and its icon: no two read
// alike. [effect, colour, size]. c(h): recolour to hue h; h(d): turn the hues by d degrees.
// 8·9차 spells also carry the real icon from the game's own skill window (assets/skillicon/).
const c = h => `sepia(1) saturate(5) hue-rotate(${h - 40}deg)`;
const LOOKS = {
  w_rush: ['22', c(205), 1.3], w_stone: ['9', c(35), 1.2], w_dragon: ['140', c(55), 1.3],
  w_frenzy: ['25', c(0), 1], w_thunder: ['141', c(55), 1], w_flash: ['139', c(200), 1],
  w_blackdragon: ['141', c(350), 1.25], w_sentence: ['20', c(170), 1.2], w_dawn: ['42', c(15), 1.3],
  w_swords: ['22', c(185), 1.4], w_advance: ['121', c(45), 1.2],
  r_venom: ['37', c(110), 1.2], r_phantom: ['33', c(275), 1.2], r_shuriken: ['145', c(0), 0.9],
  r_hidden: ['144', c(260), 1], r_bloom: ['145', c(330), 1], r_kill: ['144', c(0), 1],
  r_flamesword: ['144', c(290), 1.2], r_shadowstar: ['37', c(270), 1.4], r_shadowclone: ['33', c(215), 1.3],
  r_bloodslash: ['145', c(350), 1.2], r_chainstar: ['145', c(240), 1.1],
  m_frost: ['68', c(195), 1.3], m_wisdom: ['115', c(280), 1], m_desert: ['148', c(40), 1],
  m_twin: ['89', c(275), 1.2], m_cross: ['147', c(200), 1], m_inferno: ['148', c(10), 1],
  m_thunderball: ['118', c(205), 1], m_shift: ['98', c(210), 1], m_coldveil: ['96', c(220), 1.2],
  m_gale: ['24', c(150), 1.3], m_shards: ['129', c(185), 1.2],
  p_judge: ['89', c(50), 1.2], p_wargod: ['132', c(0), 1], p_burst: ['131', c(45), 1.1],
  p_realm: ['13', c(120), 1.3], p_bagua: ['134', c(50), 1.4], p_dragongod: ['150', c(200), 1],
  p_flash: ['68', c(190), 1.2], p_bind: ['115', c(50), 1.2], p_warmth: ['125', c(205), 1],
  p_thunderbomb: ['89', c(40), 1.3], p_skyspirit: ['135', c(185), 1.1],
};
for (const [id, [fx, tint, k]] of Object.entries(LOOKS)) Object.assign(SKILLS[id], { fx, tint, fxk: k });
// 바람의나라 연's own effects (the official 5차 승급 skill previews, the 마도사's, 주작 and 현무; previews
// with the test character standing in them are left out):
// where one matches a spell, it is that spell's picture, untinted. A build without them keeps
// the looks above (game.js checks M.fx).
export const YEON_FX = {
  w_rush: 'y_gwangya', w_stone: 'y_baram', w_frenzy: 'y_frenzy', w_sentence: 'y_pilsal', w_advance: 'y_geukmyeol',
  w_swords: 'y_muhyeong', w_dragon: 'y_gwonmu',
  r_venom: 'y_hyeoldok', r_chainstar: 'y_chains', r_bloodslash: 'y_hyeolgi',
  r_flamesword: 'y_jujak',
  m_cross: 'y_sipja', m_shift: 'y_magisun', m_coldveil: 'y_honma', m_desert: 'y_yeomhwa', m_thunderball: 'y_gwangpok',
  m_frost: 'y_hyeonmu',
  p_realm: 'y_seongi', p_bind: 'y_roots', p_wargod: 'y_gwonsin',
  p_skyspirit: 'y_jeongi',
  // 4차 승급 previews (the official 4차 승급 notice) and 6차 승급 (its patch notes).
  w_ungong: 'y_ungong', w_roar2: 'y_geukbaekho', r_gaehyeol: 'y_gaehyeol', p_phoenix: 'y_phoenix', p_guard: 'y_geumgang',
  m_twin: 'y_saseul', r_hidden: 'y_chimyeong', m_inferno: 'y_jiok', p_bagua: 'y_bagua',
  w_blood: 'y_geukjin', r_shuriken: 'y_hwasal', w_dragon: 'y_hwaryong', r_kill: 'y_jaa',
  // m_shards keeps its tinted shards: 연's 서리 preview has the whole field and a character in it,
  // and p_thunderbomb its lightning (연's 봉황 is a phoenix, not a thunderbolt).
};

// ================================================================ 스킬 2차 개편 (2차 피드백)
// What players found wrong, and what this block does about it (audit: README "스킬 2차 개편"):
//  · another class's picture or name on a class's card (연's 5차 previews lent across classes: 황룡승천 wore
//    the 무사's 화룡사멸, 대살격 the 천인's 자아파괴, 무신의가호 the 격투가's 권신 …; 청명파살·운화·백열장·약육강식·
//    분골쇄신·호신강기·폭화분격·원혼소환 are every class's or a monster's, not the class's own) — each card now wears
//    its own class's 연 picture and a name from that class's own 연/원작 records, or is merged away;
//  · the same spell twice under two names (혈겁만파 and 만검귀종 were one picture; 분혼경천 and 질풍난무, 사슬벼락 and
//    천뢰마옥쌍구, 혈독주입 and 맹독표창 …) — one of each pair is merged into the other (SKILL_ALIAS keeps a saved
//    build's slot) or moved up into the 필살기 ladder below;
//  · the 필살기 one spell for all of 승급, the normal spell blown up — ULT_TIERS: four 필살기 a class, by 승급 band
//    (0~2차, 3~5차, 6~8차, 9차), each its own way of striking (game.js ULT_MECH) in its own layered 연 pictures;
//  · the area spells coming round too fast — AOE_CD below: a floor on their wait (and they quicken less a 단),
//    their blow raised to keep the hunt's pace.

// Merged away: [the skill, the one it lives on as]. A saved build's slot goes to that one (game.js).
const RETIRE = {
  // into the 필살기 ladder (ULT_TIERS)
  w_blood: 'w_howl', w_myriad: 'w_blackdragon', r_bunhon: 'r_jiok', r_gale: 'r_tudo', m_fire3: 'm_seongryeo', m_kalpa: 'm_cross',
  p_break: 'p_daeseon', p_daejijin: 'p_cheonseon', p_taiji: 'p_seongi', a_allwhirl: 'a_whirl', a_eagle: 'a_chain', a_blood5: 'a_air',
  l_genesis: 'l_burst', l_dragon: 'l_annihil', l_moonfull: 'l_javelin', mk_buddha: 'mk_pointburst', mk_rupture: 'mk_quake',
  mk_advent: 'mk_combo', mk_aventhit: 'mk_point', md_exfrenzy: 'md_crossfrenzy', md_bloodbat: 'md_silence', md_wavefrenzy: 'md_wave',
  cl_thunder: 'cl_storm2', cl_tiger: 'cl_claw', cl_reindeer: 'cl_gumiho', dk_super: 'dk_judgment', dk_storm: 'dk_weight', dk_rage: 'dk_nemesis',
  rp_madness: 'rp_spiral', rp_deadly: 'rp_crush', rp_gate: 'rp_chain',
  // another class's (or everyone's) name, or a picture borrowed from another class
  c_kick: null, a_unhwa: 'a_storm', a_rod: 'a_thunder', a_tuhyeol4: 'a_chain', mk_whitepalm: 'mk_body', mk_yuk: 'mk_kyokushin',
  rp_guard: 'rp_barrier', rp_bomb: 'rp_inferno', rp_wraith: 'rp_burst', l_weebo: 'l_reflect', l_ungi: 'l_innate',
  w_dragon: 'w_chohonjin', w_advance: 'w_gale', w_swords: 'w_bigeom', r_flamesword: 'r_flysword', r_chainstar: 'r_shuriken',
  r_kill: 'r_pilgeom', r_bloodslash: 'r_pilgeom', m_thunderball: 'm_chain', m_desert: 'm_jiokchak', m_inferno: 'm_jiokchak',
  p_wargod: 'p_aegis', p_bind: 'p_geomok', p_realm: 'p_spirit', p_skyspirit: 'p_spirit', p_bagua: 'p_cheonseon',
  // the same spell twice: one name kept
  w_stone: 'w_bless', md_storm: 'md_stormfrenzy', w_thunder: 'w_howl', w_flash: 'w_gwangya', w_dawn: 'w_frenzy', r_phantom: 'r_clone', r_shadowclone: 'r_clone',
  r_shadowstar: 'r_shuriken', r_bloom: 'r_hidden', m_twin: 'm_chain', m_wisdom: 'm_magi', m_gale: 'm_cross', m_shards: 'm_frost',
  p_burst: 'p_flash', p_dragongod: 'p_aegis', p_warmth: 'p_life', dk_mook: 'dk_body', rp_nether: 'rp_resurrect',
};
export const SKILL_ALIAS = {};
for (const [id, to] of Object.entries(RETIRE)) {
  const s = SKILLS[id];
  Object.assign(s, { retired: true, was: s.cls, cls: '-', pre: undefined, up: undefined });
  if (to) SKILL_ALIAS[id] = to;
}
// No spell grows into one merged away.
for (const s of Object.values(SKILLS)) if (s.up && SKILLS[s.up].retired) delete s.up;

// Each card's own look and way, where it changes. fx: its class's own 연 strip (k_<id>, or a layer k_u_<name>,
// tools/yeon_skill2_skills.json). fxCast · fxHit · fxAfter: the stages of a high-tier spell (game.js cast()).
// pattern: how a screen-wide spell goes (game.js 'screen').
const REWORK = {
  // 전사 — 백호의 검사: 정면을 쪼개고(검기), 둘레를 쓸고(백호), 버틴다(투혼). Its 필살기 are its great cleaves.
  w_lion: { name: '난공불락', kind: 'buff', buff: 'shield', fx: 'k_w_lion', cd: 16, duration: 4, aura: 9, auraR: 1, fxHit: 'k_u_w_wave', dmg: 0, stun: 0, falloff: 0,
    desc: '난공불락의 기세로 4초 동안 받는 피해가 절반이 되고, 곁에서 덤비는 몬스터를 거듭 베어 낸다' },
  w_buff: { up: 'w_jin', desc: '잠시 공격력이 크게 오른다. 8단 + 2차 승급이면 진백호령이 된다' },
  w_jin: { evolved: true, power: 0.8, crit: 0.15, desc: '백호령 8단 + 2차 승급. 백호의 힘이 깃들어 잠시 공격력이 두 배 가까이 되고 치명타가 잦아진다' },
  w_howl: { pattern: 'ring', fxHit: 'k_w_roar', desc: '포효가 몸에서부터 물결처럼 퍼져 화면의 몬스터를 차례로 친다. 멀어질수록 약하다' },
  w_frenzy: { power: 0.6, alsoHaste: true, desc: '광폭해져 잠시 공격력이 오르고 모든 기술이 빨리 돈다' },
  w_roar: { up: 'w_roar3', desc: '체력을 깎아 바치며 정면 한 칸의 몬스터에게 아주 큰 피해를 준다. 8단 + 3차 승급이면 동귀어진\'첨이 된다' },
  w_roar3: { evolved: true, desc: '동귀어진 8단 + 3차 승급. 많은 체력을 바쳐 정면 한 칸의 몬스터에게 치명적인 피해를 주고 잠시 기절시킨다' },
  // (사용자 2026-11-23: 근접기인데 투사체로 나갔다 — 앞쪽 베기(cleave)로)
  w_fly: { kind: 'cleave', depth: 2, max: 4, desc: '검기를 휘둘러 앞쪽 네 칸의 몬스터를 벤다' },
  w_rush: { fxHit: 'k_u_w_wave', fxAfter: 'k_w_tiger', desc: '회오리치며 바라보는 쪽 일렬 다섯 칸을 꿰뚫고, 지난 자리에 검기가 남는다' },
  // (사용자 2026-11-23: 몬스터를 묶는 기술인데 영웅 둘레에 크게 떴다 → 연의 보라 사슬 하나를 가장 몰린 곳에 3칸으로 놓고,
  // 그 안으로 둘레 두 칸의 몬스터를 모아 묶는다: game.js snare)
  w_chohonjin: { fxCast: 'none', snare: true, range: 4, stun: 1.2, desc: '혼을 부르는 사슬을 몬스터가 가장 몰린 곳에 던져 둘레의 몬스터를 그 안으로 끌어모아 1.2초 동안 묶고 조인다' },
  w_tarok: { fxHit: 'k_u_w_wave' },
  w_gwangya: { fxCast: 'k_w_gale', fxHit: 'k_w_jinseom', fxAfter: 'k_w_tiger' },
  // (그림: 1320 #18 검붉은 소용돌이, 작은 회오리에서 큰 회오리로 — tools/s9_stamps.py heukgwang. 사용자 결정 2026-11-23:
  // 다섯 칸을 무조건 꿰뚫지 않고, 몬스터에 닿으면 그 자리에서 1.2초 동안 돌며 둘레를 끌어들여 벤다)
  w_blackdragon: { kind: 'vortex', depth: 5, dur: 1.2, k: 0.4, radius: 0, ck: 'line', fxHit: 'k_w_fly', dmg: 32, cd: 5.5,
    fx: 'o_w_heukgwang', yeon: true, swirl: { fx: 'o_w_heukgwangloop', dur: 1.2, every: 0.3 },
    desc: '검은 용의 회오리가 앞으로 다섯 칸까지 휘몰아쳐 나가다 몬스터에 닿으면 그 자리에 머물러 돌며, 둘레의 몬스터를 끌어들여 거듭 벤다' },
  w_sentence: { kind: 'mark', fx: 'h_hit_tiger', fx2: 'k_u_w_wave', dmg: 40, cd: 5, range: 6, count: 3, radius: 1, delay: 1.2, strongest: true, ck: 'strike', stun: 1,
    desc: '가장 강한 몬스터 셋에 사형을 선고해 묶어 두고, 1.2초 뒤 백호의 검기로 둘레까지 벤다' },
  w_hogi: { fx: 'y_baram', fxHit: 'k_w_tiger' },
  // 도적 — 그림자의 검객: 등 뒤로 파고들고(검무), 던지고(암기), 숨는다(그림자).
  r_nuri: { buff: 'crit', crit: 0.3, desc: '누리의 힘을 빌려 잠시 치명타가 크게 잦아진다' },
  r_pajin: { up: 'r_venom' },
  r_venom: { evolved: true, fx: 'k_r_pajin', fxHit: 'k_r_drain', desc: '파진표창 8단 + 5차 승급. 독 묻은 표창이 몬스터 셋에 박혀 받는 피해를 늘린다' },
  r_muyoung: { kind: 'evade', hit: 10, count: 2, guard: 0.5, range: 4, fx2: 'k_r_blink', cd: 6, dmg: 0,
    desc: '그림자 없는 걸음으로 가까운 몬스터에게서 물러나며 잠시 몸을 피하고, 물러나며 둘을 벤다' },
  r_jiok: { kind: 'orbit', fx: 'k_r_jiok', fx2: 'k_u_r_backhit', hit: 14, cd: 13, duration: 6, n: 3, k: 0.45, radius: 1, ck: 'nova', dmg: 0, falloff: 0,
    desc: '지옥의 그림자 분신 셋을 불러 6초 동안 몸 둘레를 돌며 닿는 몬스터를 베게 한다' },
  r_hidden: { fx: 'k_u_r_backhit', fxCast: 'k_r_muyoung', desc: '모습을 감춘 채 바라보는 쪽 몬스터의 등 뒤로 날아들어 네 번 벤다' },
  r_shuriken: { fx: 'k_r_shadowstar', fxHit: 'k_r_formless', desc: '묵마의 십자 수리검이 몬스터 둘과 그 상하좌우 두 칸에서 터진다' },
  r_amsal: { fxCast: 'k_r_stealth', fxHit: 'k_u_r_backhit' },
  r_suhyo: { fxHit: 'k_r_dance' },
  r_pilgeom: { fxHit: 'k_u_r_backhit', fxAfter: 'k_r_formless' },
  r_chamgan: { fxHit: 'k_r_flysword' },
  r_hyeoldok: { fx2: 'y_hyeoldok' },
  r_tudo: { fx2: 'k_r_amsal', fxCast: 'k_r_gimun' },
  // 주술사 — 신수마법과 저주: 태우고(화염), 얼리고(빙뢰), 묶는다(주술).
  m_toema: { name: '마성제마술', fx: 'k_m_toema', fx2: 'k_m_cheonggi', kind: 'stack', count: 2, stacks: 3, per: 0.3, ck: 'spell', dmg: 13, cd: 2.2,
    desc: '마성을 물리치는 고리를 몬스터 둘에 겹겹이 씌운다. 셋이 쌓이면 고리가 터져 둘레까지 친다' },
  m_frost: { fx: 'k_u_m_ice', noBig: true, pattern: 'rain', fxDrop: 'k_u_m_ice', dropSize: 70, fxHit: 'h_hit_6', desc: '서리 바람이 화면을 쓸며 몬스터마다 얼음이 맺혀 치고 느리게 한다' },
  m_quake: { pattern: 'ring' },
  m_nodo: { pattern: 'pull', desc: '노한 물결의 소용돌이가 곁의 몬스터를 끌어들인 뒤 화면의 몬스터를 치고 잠시 멈춘다' },
  m_chaos: { pattern: 'mark', fxMark: 'k_m_chaos', desc: '혼돈의 혼을 화면의 몬스터에 씌우고, 잠시 뒤 한꺼번에 흔들어 멈추게 한다' },
  m_manpa: { pattern: 'sweep', desc: '만 갈래 독이 화면을 쓸고 지나가며 몬스터를 치고 느리게 하며 피해를 늘린다' },
  m_cross: { fxCast: 'k_u_m_seal', fxHit: 'k_x_m_ult_hit', fxAfter: 'k_m_quake' },
  m_coldveil: { name: '혼마염', promo: 5, req: 21, pattern: 'rain', fxDrop: 'k_m_jiokchak', dropSize: 60, curse: 4, slow: 0, stun: 0,
    desc: '혼을 태우는 보랏빛 마염이 화면의 몬스터마다 차례로 피어올라 태우고 받는 피해를 늘린다' },
  m_shift: { name: '마기순보', fxHit: 'k_u_m_bluefire', desc: '마기를 타고 바라보는 쪽 몬스터 너머로 순식간에 옮겨 가며 푸른 불꽃으로 친다' },
  m_instant: { fx: 'k_u_m_bluefire', fxAfter: 'k_m_magi' },
  m_jiokchak: { fxCast: 'k_m_magi', fxAfter: 'k_m_quake', ticks: 2, desc: '지옥의 흑염으로 대상을 불사르고, 흑염이 그 자리에 남아 둘레를 거듭 태우며 받는 피해를 늘린다' },
  m_seongryeo: { strongest: true, desc: '가장 강한 몬스터(보스를 먼저)에게 운석을 떨어뜨려 주위까지 피해를 준다' },
  m_chain: { fxHit: 'h_hit_light' },
  m_seonsim: { fx: 'k_m_curse', fx2: 'k_m_manpa' },
  // 도사 — 기원과 진법: 살리고(기원), 하늘의 벌로 치고(천벌), 진을 펼친다(진법).
  p_aegis: { aura: 6, auraR: 1, fxHit: 'k_u_p_sparkle', fxCast: 'k_u_p_seal', desc: '진을 펼쳐 잠시 받는 피해를 절반으로 줄이고, 진에 닿은 몬스터를 거듭 친다' },
  p_daeseon: { pattern: 'mark', fxMark: 'k_p_daeseon', frac: 0.3, /* (사용자 2026-11-24: 너무 큼 — 화면 그림 0.9 → 0.3) */ desc: '화면의 몬스터에 혼을 씌우고 잠시 뒤 한꺼번에 흔들어 치고 느리게 한다' },
  p_wave: { fxHit: 'k_u_p_swirl' },
  p_judge: { fxHit: 'h_hit_light', fxAfter: 'k_u_p_sparkle' },
  p_honma: { fx: 'k_u_p_swirl', fx2: 'k_p_jiroe' },
  p_saint: { fx: 'k_p_saint', fxAfter: 'k_u_p_sparkle' },
  p_seongi: { fx: 'k_u_p_bubble', fxCast: 'k_u_p_pillar_b' },
  p_cheonseon: { fxCast: 'k_u_p_seal', fxHit: 'k_u_p_pillar_o', hitScale: 0.6 },
  p_thunderbomb: { fxHit: 'k_p_noejeon', fxAfter: 'k_p_jiroe' },
  p_flash: { fxHit: 'k_u_p_sparkle' },
  p_geomok: { fxAfter: 'k_p_quake' },
  p_bonghwang: { fxCast: 'k_p_phoenix' },
  // 궁사 — 연의 명궁: 꿰뚫고(사격), 터뜨리고(마탄), 화살을 강화한다(궁술).
  p_toema: { kind: 'chain', count: 3, jump: 3, decay: 0.85, ck: 'spell', desc: '마를 물리치는 주문이 몬스터에서 몬스터로 셋까지 옮겨 붙는다' },
  a_cheong: { name: '투혈', fxCast: 'k_u_a_r3cast', desc: '피를 실은 화살이 아홉 칸을 꿰뚫는다. 꿰뚫을 때마다 12%씩 강해진다' },
  a_thunder: { kind: 'reset', buff: undefined, duration: 2, cd: 18, desc: '천기를 모아 다른 모든 기술의 재사용 대기를 거의 끝내고, 잠시 모든 기술이 빨리 돈다' },
  a_aim: { kind: 'mark', fx: 'k_a_aim', fx2: 'k_a_shot', count: 1, radius: 0, delay: 0.7, strongest: true, ck: 'spell', range: 8,
    desc: '가장 강한 몬스터를 0.7초 동안 조준한 뒤 강한 화살을 꽂는다' },
  a_firewall: { kind: 'zone', fx: 'k_a_firewall', radius: 1, duration: 3, tick: 0.5, k: 0.35, dot: 'burn', ck: 'strike', range: 6,
    desc: '몬스터가 가장 많은 곳에 불화살을 꽂아 3초 동안 타오르는 화염 장벽을 세운다' },
  a_air: { kind: 'barrage', fx: 'k_a_air', fx2: 'k_u_a_wind', fxCast: 'k_u_a_hawk', depth: 6, n: 5, k: 0.5, radius: 0, count: 3, range: 8, ck: 'spell',
    desc: '미리 장전한 화살 다섯 발을 조준 없이 부채꼴로 쏟아 낸다' },
  a_bless: { power: 0.8, crit: 0.25, desc: '활에 혼을 불어넣어 잠시 공격력이 오르고 치명타가 크게 잦아진다' },
  a_spiral: { fxHit: 'k_u_a_wind' },
  a_whirl: { fxHit: 'k_u_a_tornado' },
  a_storm: { kind: 'rain', fx: 'k_a_storm', fx2: 'k_u_a_tornado', radius: 3, drops: 9, dur: 2, k: 0.5, ck: 'strike', count: 1, hitAt: undefined, dmg: 30, cd: 6,
    desc: '하늘로 쏘아 올린 화살이 몬스터가 가장 많은 곳에 2초 동안 비처럼 쏟아진다' },
  a_chain: { fxHit: 'k_a_bomb' },
  a_chase: { fxCast: 'k_u_a_wind' },
  a_inferno: { fxCast: 'k_u_a_r5cast' },
  // 무사 — 창의 달인: 일렬로 꿰찌르고(창술), 휘두르고 내리꽂고(창격), 기를 돌린다(기공).
  l_union: { power: 0.8, alsoHaste: true, desc: '창과 혼이 하나가 되어 잠시 공격력이 오르고 모든 기술이 빨리 돈다' },
  l_thunder: { aura: 10, auraR: 1, fxHit: 'k_u_l_bolt', desc: '뇌신의 힘을 몸에 받아 잠시 모든 기술이 빨리 돌고, 곁의 몬스터에게 벼락이 튄다' },
  l_noegi: { fx: 'k_u_l_bolt' },
  l_noegichim: { fxHit: 'k_u_l_bolt' },
  l_revenge: { fx: 'k_u_l_avenge', fxCast: 'k_l_unity' },
  l_annihil: { fxHit: 'h_hit_fire' },
  l_javelin: { fxHit: 'k_u_l_bolt' },
  l_extinct2: { fxAfter: 'k_l_extinct' },
  l_formless: { fxHit: 'k_u_l_bolt' },
  // 격투가 — 맨주먹: 파고들어 두들기고(권법), 혈을 짚는다(점혈), 내공으로 버틴다(내공).
  mk_origin: { power: 0.6, aura: 12, auraR: 1, fxHit: 'k_u_mk_energy', desc: '권법의 근원에 닿아 잠시 공격력이 오르고, 곁의 몬스터를 기의 주먹이 거듭 친다' },
  mk_technique: { power: 0.5, crit: 0.2, desc: '권신의 기법을 깨쳐 잠시 공격력이 오르고 치명타가 잦아진다' },
  mk_whirl: { fx: 'k_mk_whirl' },
  mk_stack: { fx: 'k_u_mk_area' },
  mk_muhan: { fx: 'k_u_mk_bodyhit' },
  mk_body: { fxHit: 'k_u_mk_bodyhit' },
  mk_kyokushin: { fxHit: 'k_u_mk_bodyhit', fxAfter: 'k_u_mk_area' },
  mk_combo: { fxHit: 'k_u_mk_aventhit', hitScale: 0.7 },
  mk_point: { fxHit: 'k_u_mk_energy' },
  // 마도사 — 금기된 마력: 구슬과 광선(기공), 광폭기(광폭), 결계와 기원(금기).
  md_arrow: { kind: 'line', depth: 5, desc: '마력의 화살이 몬스터가 가장 많은 쪽 일렬 다섯 칸을 꿰뚫는다' },
  md_cross: { up: 'md_crossfrenzy' },
  md_crossfrenzy: { evolved: true, fxHit: 'k_u_md_storm', desc: '기공십자광선 8단 + 5차 승급. 광폭기를 실은 십자광선이 대상과 그 상하좌우를 불사른다' },
  md_resonance: { kind: 'chain', count: 4, jump: 3, decay: 0.85, ck: 'spell', fxHit: 'k_u_md_orb' },
  md_frenetic: { power: 0.9, drain: 0.08, fxCast: 'k_u_md_wing', desc: '광폭해져 잠시 공격력이 오르고, 입힌 피해의 일부로 체력을 되찾는다' },
  md_fice: { fx: 'k_md_orbice', fx2: 'k_x_md_orbice_shot' },
  md_stormfrenzy: { fxHit: 'k_u_md_storm' },
  md_storm: { fxHit: 'h_hit_light' },
  md_decay: { fxHit: 'k_u_md_decay' },

  // 천인 — 하늘의 힘으로 뛰어드는 술사: 하늘의 불·번개(천벌), 질주, 수호.
  cl_intrep: { power: 0.3, crit: 0.35, alsoShield: 3, desc: '깨달음을 얻어 잠시 치명타가 크게 잦아지고, 3초 동안 받는 피해가 절반이 된다' },
  cl_defense: { kind: 'shieldburst', hit: 30, cd: 14, duration: 4, radius: 2, stun: 0.6, fx2: 'k_cl_defense', buff: undefined,
    desc: '완전한 방어로 4초 동안 받는 피해가 절반이 되고, 방어가 풀릴 때 터져 둘레 두 칸을 치고 멈춘다' },
  cl_wedge: { fx: 'k_u_cl_soul2' },
  cl_shatter: { name: '신체강화' , desc: '몸을 단단히 강화하며 체력 12%를 바쳐 둘레 두 칸을 내리친다. 바친 체력이 클수록 피해가 커진다' },
  cl_bind: { pattern: 'mark', fxMark: 'k_u_cl_grayhit' },
  cl_gumiho: { kind: 'orbit', fx: 'k_cl_gumiho', fx2: 'k_u_cl_gumiho', hit: 26, duration: 6, n: 2, k: 0.5, radius: 1, ck: 'nova', dmg: 0,
    desc: '아홉 꼬리의 수호 구미호 둘이 6초 동안 몸 둘레를 돌며 닿는 몬스터를 휘감는다' },
  cl_crow: { kind: 'chain', count: 3, jump: 3, decay: 0.9, ck: 'spell', desc: '세 발 까마귀가 몬스터에서 몬스터로 날아다니며 셋을 쪼아 댄다' },
  cl_claw: { kind: 'hop', count: 3, stun: 0.3, ck: 'blink', desc: '용의 발톱으로 몬스터에서 몬스터로 옮겨 다니며 셋을 할퀸다' },
  cl_crowfire: { fxAfter: 'k_u_cl_pillar', afterScale: 0.5 },
  cl_ego: { fxCast: 'k_u_cl_soul', fxAfter: 'k_u_cl_soul2' },
  cl_snake: { fxHit: 'h_hit_tiger' },
  // 도깨비 — 방망이의 장사: 강한 놈부터 내리찍고(일격), 휘두르고(방망이), 도깨비불을 부린다.
  dk_flatten: { pattern: 'ring' },
  dk_maryu: { fx: 'k_dk_body' },
  dk_goldhit: { fxHit: 'k_u_dk_gold' },
  dk_nemesis: { fxAfter: 'k_dk_flatten', afterScale: 0.4 },
  dk_hamstring: { fxHit: 'k_dk_paddle', hitScale: 0.4 },
  // 차사 — 저승의 백도: 베고 파고들고(검술), 혼을 쏘고(영혼), 저승의 기운(저승).
  rp_eye: { power: 0.4, crit: 0.3, drain: 0.06, desc: '저승의 눈을 떠 잠시 치명타가 잦아지고, 입힌 피해의 일부로 체력을 되찾는다' },
  rp_convert: { fx: 'k_u_rp_ring' },
  rp_resonate: { fx: 'k_u_rp_reshit' },
  rp_chain: { fxCast: 'k_u_rp_redeem' },
  rp_burst: { fxHit: 'k_u_rp_reshit', fxAfter: 'k_u_rp_redeem', afterScale: 0.6 },
  rp_crush: { fxHit: 'k_rp_cut', hitScale: 0.5 },
};
for (const [id, o] of Object.entries(REWORK)) {
  const s = SKILLS[id];
  Object.assign(s, o);
  // a picture of its own now: not the old tinted or borrowed one
  if (o.fx) Object.assign(s, { fxs: null, tint: null, modern: null });
}
// The stages of the high tiers (5~9차): each a call, a hit and what stays, out of its class's own 연 strips.
const LAYERS = {
  w_tarok: { fxCast: 'k_w_chohon', fxAfter: 'k_w_tiger' }, w_blackdragon: { fxCast: 'k_u_w_wave', fxAfter: 'k_w_roar2', afterScale: 0.6 },
  w_sentence: { fxCast: 'k_w_will' }, w_hogi: { fxCast: 'k_w_ungong' },
  r_venom: { fxCast: 'k_r_stealth', fxAfter: 'g_poison_green', afterScale: 0.5 }, r_hidden: { fxHit: 'k_r_dance' },
  r_shuriken: { fxAfter: 'k_r_forget' }, r_chamgan: { fxAfter: 'k_u_r_backhit', afterScale: 0.6 }, r_hyeoldok: { fxCast: 'k_r_drain' },
  r_nuri: { fx: 'h_levelup_force' },
  m_coldveil: { fxHit: 'k_m_curse' }, m_chain: { fxCast: 'k_m_cheonggi' }, m_instant: { fxCast: 'k_m_sun' }, m_shift: { fxCast: 'k_m_magi' },
  m_seonsim: { fxCast: 'k_m_chaos' },
  p_honma: { fxCast: 'k_p_daeseon' }, p_flash: { fxCast: 'k_u_p_seal' }, p_saint: { fxCast: 'k_u_p_pillar_b' }, p_seongi: { fxHit: 'k_u_p_sparkle' },
  a_fetter: { fxHit: 'h_hit_attack', fxAfter: 'k_u_a_tornado', afterScale: 0.5 },
  mk_muhan: { fxCast: 'k_u_mk_energy' }, mk_point: { fxCast: 'k_mk_pointblue' }, mk_stack: { fxCast: 'k_u_mk_energy' },
  md_fice: { fxCast: 'k_u_md_orb' }, md_stormfrenzy: { fxCast: 'k_u_md_wing' }, md_flight: { fxCast: 'k_u_md_orb', fxHit: 'h_hit_light' },
  md_resonance: { fxCast: 'k_md_enhance' }, md_ffire: { fxCast: 'k_u_md_orb' },
  cl_gumiho: { fxCast: 'k_u_cl_soul' }, cl_snake: { fxCast: 'k_cl_blood' }, cl_defense: { fxCast: 'k_u_cl_speed' }, cl_wedge: { fxCast: 'k_u_cl_soul' },
  cl_shatter: { fxCast: 'k_u_cl_soul2' },
  dk_firebat: { fxHit: 'h_hit_fire' }, dk_wisp2: { fxCast: 'k_dk_wispexp' }, dk_goldhit: { fxCast: 'k_dk_strength' }, dk_maryu: { fxCast: 'k_dk_strength' },
  dk_nemesis: { fxCast: 'k_dk_strength' }, dk_wisp3: { fxCast: 'k_dk_wisp' },
  rp_chain: { fxHit: 'k_u_rp_reshit' },
};
for (const [id, o] of Object.entries(LAYERS)) Object.assign(SKILLS[id], o, o.fx ? { fxs: null, tint: null, modern: null } : {});
// 연's 5차·6차 previews lent to another class's card are taken back (the card has its own above).
for (const id of ['w_dragon', 'w_sentence', 'w_advance', 'w_swords', 'w_stone', 'w_blood', 'r_flamesword', 'r_hidden', 'r_shuriken', 'r_kill',
  'r_chainstar', 'r_bloodslash', 'r_venom', 'm_thunderball', 'm_frost', 'm_desert', 'm_twin', 'm_inferno', 'p_wargod', 'p_skyspirit',
  'p_bagua', 'p_bind', 'p_realm']) delete YEON_FX[id];

// ================================================================ 9차 스킬 개편
// Each class's 9차 is two or three techniques of distinct roles, out of the original 바람의나라's 9차 list
// (the 2026 9차 승급: xoxd.tistory.com 2662, its tooltips and captures) and what the class already had:
//   보조 공격 (kind 'echo': a buff under which follow-up blows of the class's own go out by themselves),
//   몸 주변 아우라 (kind 'aura9': held round the hero for a while: it strikes, wards, heals or reflects),
//   전체·광역 공격 (the class's area kinds: rain, wave, barrage, starburst, charge with a storm left behind),
//   강한 단일 공격 (kind 'smite': the strongest foe in reach — the boss first — struck very hard).
// Pictures: o_<id> are the original 9차 effects (tools/s9_fx.py: the official client's sprites, and its
// captures with the field taken out), k_<id> 연's own (yskill, s9yfx); icons: each 9차 skill's own from
// its tooltip (GEAR_DIR/s9fx/icons). The 9차 필살기 (ULT_TIERS' fourth band) is unchanged.
// The 9차 techniques the originals replace go down to 8차 (투도멸진, 선심단멸, 신체강화, 마력증폭, 반탄강기, 도깨비불 3성).
// 연's own classes, which the original has not, take the original's three classes it has and we have not:
// 무사 ← 살수, 격투가 ← 흑화랑, 도깨비 ← 영술사 (their 9차 names, tooltips and 1320 sprites).
// Where the original's skill was here before under its own id (호기어검 w_swords, 압도적진격 w_advance, 묵혈파광참
// r_bloodslash, 묵마수리검'쇄 r_chainstar, 회선격풍 m_gale, 서리파편 m_shards, 천신의기운 p_skyspirit, 폭렬천뢰탄,
// 허공람시 → 이기뇌멸시 a_air, 반탄강기), that id is it: no second copy. A 9차 drawing its line's picture
// (호기어검 비검술's swords, 묵마수리검'쇄 묵마십자수리검's star, 전도체 사슬벼락's bolt, 화살비폭격 폭류마탄시's arrows,
// 순보선풍 불가살이선풍's gale, 기공십자광선'쾌 기공십자광선's cross, 광폭기사출 광폭기대방출's shaft, 비사검 나선회륜's
// crescents) comes after that skill in its 계열 (pre): its growth, not a borrowed look.
const S9 = {
  // 전사 (9차 재작업: 원작 2662 장면 그대로 — scratchpad plan9/spec/warrior.md). 시전 3 + 패시브 1 + 필살기:
  //   호기어검 (IMG02: 15초 동안 11×11 안의 적 위로 푸른 대검이 연달아 내리꽂힌다; 쿨 25초),
  //   압도적진격 (IMG07: 바라보는 쪽 4칸 돌진, 불고리 벽이 길을 덮고 2초 기절; 쿨 5초),
  //   명천검파 = 패시브, 그림 없음 (2662에 장면이 없음: 검기 계열 기술 세 번째마다 한 번 더 — mcheon9),
  //   흑룡검풍 = 패시브 (설명창 [지속효과 마법]: 흑룡광참으로 공격 시 30% 확률로 8초 동안 주위를 도는 검풍 — w_blackdragon.wind9).
  // Pictures at the original's own size: o_w_* are drawn 0.62 game pixels a capture pixel (our hero's 47 over
  // the original hero's 76), never fitted to tiles.
  w_swords: { promo: 9, cls: 'warrior', req: 33, name: '호기어검', kind: 'echo', echo: 'drop', fx: 'o_w_hogisword', noCast: true, fxLoop: 'o_w_hogisign', loopSize: 1, loopY: -14,
    fx2: undefined, fxHit: undefined, shotSize: undefined, shots: undefined, power: undefined,
    hit: 100, cd: 25, duration: 15, every: 0.9, splash: 0.5, range: 5, buff: undefined, ck: 'spell', radius: 1, pre: 'w_bigeom', branch: 0,
    desc: '호기가 무형의 검이 되어 15초 동안 곁에 떠 있는다. 둘레 11×11칸 안의 몬스터를 찾아 거대한 푸른 검이 하늘에서 연달아 내리꽂혀 그 자리와 둘레 한 칸을 꿰뚫는다' },
  w_advance: { promo: 9, cls: 'warrior', req: 33, name: '압도적진격', kind: 'smite', fx: 'o_w_apdo', wall: [4, 2], front: undefined, size: undefined, dash: undefined,
    fxHit: undefined, hitScale: undefined, dmg: 70, cd: 5, range: 4, radius: 1, splash: undefined, stun: 2, push: undefined, ck: 'cleave', pre: 'w_sentence', branch: 2,
    desc: '바라보는 쪽으로 네 칸을 돌진하며 방패로 불고리 벽을 밀고 나간다. 지나는 길과 좌우 두 칸의 몬스터를 모두 치고 2초 동안 기절시킨다' },
  // 도적 (9차 재작업: 원작 2662 장면 그대로 — scratchpad plan9/spec/rogue.md). 시전 3 + 패시브 1 + 필살기:
  //   묵마수리검'쇄 (IMG13: 여덟 방향으로 푸른 쿠나이를 던져 3칸 남짓 밖에 꽂아 5초 동안 세우고, 그 고리 안을 거듭 분쇄,
  //     끝에 흰 섬광과 푸른 불꽃으로 터진다; 쿨 15초),
  //   묵혈파광참 (IMG11: 앞의 적에게 그림자를 보내 붉은 斬 인장, 이어 좌우로 갈라진 인장 둘; 방어도 감소; 쿨 15초),
  //   묵혈독바르기 (IMG17: 무기에 독을 바르고, 다음 공격 기술 5회가 친 적을 7초 동안 감염 — 받는 피해 +15%,
  //     쓰러질 때 둘레에 폭발; 감염 순간 맞은 적 위로 푸른 보라 불꽃; 쿨 10초),
  //   죽음의희열 = 패시브 (설명창 [지속효과 마법]: 적을 처치할 때마다 30% 확률로 수리검 계열 하나의 쿨타임 초기화 —
  //     jugeum9; IMG15에는 따로 그림이 없고 묵마수리검'쇄가 다시 나갈 뿐이라 그림 없음).
  // Pictures at the original's own size (o_r_*: 0.62 game pixels a capture pixel).
  r_mukdok: { promo: 9, cls: 'rogue', req: 33, name: '묵혈독바르기', kind: 'coat9', fx: 'o_r_mukdok', fxCast: undefined, fx2: undefined, fxHit: undefined,
    hit: 30, cd: 10, duration: 10, charges: 5, infect: 7, taken: 0.15, burst: 1.2, every: undefined, shots: undefined, range: 2, power: undefined, curse: undefined, buff: undefined,
    ck: 'buff', pre: 'r_budong', branch: 2,
    desc: '무기에 묵혈독을 바른다. 다음 공격 기술 다섯 번이 친 몬스터는 7초 동안 묵혈독에 감염되어 받는 피해가 15% 늘고, 감염된 채 쓰러지면 그 자리에 묵혈독 불꽃이 터져 불꽃이 덮는 몬스터(둘레 한 칸 남짓)를 친다' },
  r_chainstar: { promo: 9, cls: 'rogue', req: 33, name: "묵마수리검'쇄", kind: 'swae9', fx: 'o_r_swaestar', fxFly: 'o_r_swaefly', fxEnd: 'o_r_swaeend', fxCast: undefined, fx2: undefined,
    dmg: 60, cd: 15, n: 8, ring: 159, dur: 5, tick: 0.5, k: 0.4, shots: 3, shotLen: 1.8, endK: 0.8, reach: 3, radius: undefined, ck: 'nova', pre: 'r_shuriken', branch: 1,
    desc: '몸 주변 여덟 방향으로 수리검을 던져 지나는 길의 몬스터를 벤다. 세 칸 남짓 밖에 꽂힌 수리검 여덟은 5초 동안 그 자리에 머물며 가까운 몬스터를 향해 거듭 날아가 꿰뚫고, 끝에 흰 섬광과 함께 터진다' },
  r_bloodslash: { promo: 9, cls: 'rogue', req: 33, name: '묵혈파광참', kind: 'zan9', fx: 'o_r_zan', fx2: undefined, fxHit: undefined, dmg: 160, cd: 15, range: 4,
    side: 118, back: 95, half: 59, splash: 0.6, curse: 5, radius: undefined, dash: undefined, ck: 'blink', pre: 'r_chamgan', branch: 0,
    desc: '앞으로 네 칸 안의 몬스터에게 그림자 분신을 보내 붉은 斬 인장으로 몸속에 내상을 입히고(방어 약화), 닿은 그림자가 좌우로 갈라져 양옆(자신의 양옆 앞)에도 斬을 새긴다' },
  // 주술사 (9차 재작업: 원작 2662 장면 그대로 — scratchpad plan9/spec/mage.md). 시전 3 + 패시브 1 + 필살기:
  //   회선격풍 (IMG21: 대상 위에 큰 청록 회오리, 둘레 두 칸; 맞은 적 셋에 응축된 바람이 3초 동안 세 번 더 터짐;
  //     5초 안에 이어 쓰면 10%씩 강해짐; 2회 충전),
  //   서리파편 (IMG23: 앞으로 날아가는 서리 구슬, 끝에서 얼음 결정 밭이 3.5초 동안 거듭 친다),
  //   환영안개 (IMG29, PVP → 몬스터: 앞에 보라 환영 안개 5초 — 든 몬스터는 길을 잃고 느려지며 받는 피해가 는다),
  //   전도체 = 패시브 (설명창 [지속효과 마법]: 천뢰마옥쌍구·뇌격구를 쓸 때 50%로 10초 과전류 — 서리파편에 맞은 적에게
  //     몸에서 번개가 흐름; IMG25의 번개 그림).
  m_gale: { promo: 9, cls: 'mage', req: 33, name: '회선격풍', kind: 'gale9', fx: 'o_m_hoeseon', fxWind: 'o_m_hoeseonwind', fxCast: undefined, fxHit: undefined,
    dmg: 70, cd: 3, range: 7, half: [100, 64], winds: 3, windN: 3, windK: 0.25, stack: 0.1, stackMax: 5, radius: undefined, splash: undefined, linger: undefined, lingerK: undefined,
    count: undefined, hitAt: undefined, ck: 'strike', pre: 'm_chain', branch: 1,
    desc: '가장 강한 몬스터에게 회오리를 일으켜 그와 둘레 두 칸을 친다. 맞은 몬스터 셋에는 응축된 바람이 3초 동안 세 번 더 터지고, 5초 안에 이어 쓰면 피해가 10%씩 는다(최대 50%)' },
  m_shards: { promo: 9, cls: 'mage', req: 33, name: '서리파편', kind: 'shard9', fx: 'o_m_seori', fxShot: 'o_m_seorishot', fx2: undefined, fxHit: undefined, noLoop: undefined,
    dmg: 40, cd: 6, depth: 6, dur: 3.5, tick: 0.5, k: 0.3, half: [85, 105], slow: 2, range: 6, count: undefined, radius: undefined, drops: undefined, dropScale: undefined,
    ck: 'line', pre: 'm_cross', branch: 1,
    desc: '서리 파편을 앞으로 쏘아 여섯 칸까지 날려 보낸다. 몬스터에 닿거나 끝에 이르면 터져 3.5초 동안 그 자리에 얼음 결정이 거듭 솟아 든 몬스터를 치고 느리게 한다' },
  // 도사: 천신의기운 (아우라·회복), 선기전도 (광역, 그대로), 폭렬천뢰탄 (강한 일격)
  // 도사 (9차 재작업: 원작 2662 장면 그대로 — scratchpad plan9/spec/poet.md). 시전 3 + 패시브 1 + 필살기:
  //   폭렬천뢰탄 (IMG31: 전방으로 벼락 구체, 부딪힌 적 + 방전으로 둘레 둘), 천신의기운 (IMG33: 6초 매초 금빛 가시와 퍼지는 고리,
  //   자신·동료 회복 + 7×7 피해), 천선의영역 (IMG35: 시전 자리에 금빛 영역 10초, 안에 있는 동안 받는 피해 감소, 나가면 해제),
  //   치유의반향 = 패시브 (설명창 [지속효과 마법]: 체력이 가득하면 피해 30% 증가; 그림 없음).
  p_skyspirit: { promo: 9, cls: 'poet', req: 33, name: '천신의기운', kind: 'aura9', fx: 'o_p_cheonsin9', fxCast: undefined, fxHit: undefined, hit: 9, cd: 12, duration: 6, radius: 3, half: [114, 85], halfAt: 17,
    tick: 1, hot: 5, party: true, mana: 0.15, buff: 'shield', ck: 'heal', heal: 30, pre: 'p_saint', branch: 0, auraAlpha: 1,
    desc: '6초 동안 천신의 기운이 자신과 동료에게 깃들어 매초 최대 체력의 5%를 채우고, 둘레에 퍼지는 금빛 고리(가로 다섯 칸 남짓) 안의 몬스터를 거듭 친다' },
  p_zone9: { promo: 9, cls: 'poet', req: 33, name: '천선의영역', kind: 'zone9', fx: 'o_p_cheonseon9', cd: 20, duration: 10, radius: 3, reach: 90, feet: true, ward: 0.5, ck: 'buff', buff: 'shield', pre: 'p_cheonseon', branch: 2,
    desc: '시전한 자리에 천선의 영역을 10초 동안 펼친다. 영역 안에 있는 동안 받는 피해가 절반이 되고, 영역 밖으로 나가면 곧바로 사라진다' },
  p_thunderbomb: { kind: 'orb9', fx: 'o_p_cheonroe9', fxShot: undefined, fx2: undefined, fxHit: undefined, chainFx: 'o_p_cheonroe9', chainScale: 0.6, dmg: 110, cd: 4, range: 7, radius: 0, chain: 2, chainK: 0.5, hold: 1.25, shot: undefined,
    fxAfter: null, fxs: null, tint: null, modern: null, ck: 'spell',
    desc: '벼락의 힘을 담은 구체를 바라보는 방향의 가장 강한 몬스터에게 날려 크게 치고, 구체가 잠시 머물며 방전하여 곁의 몬스터 둘에게 번개가 옮겨 붙은 뒤 터진다' },
  // 궁사 (9차 재작업: 원작 2662 장면 그대로 — scratchpad plan9/spec/archer.md). 시전 3 + 패시브 1 + 필살기:
  //   이기뇌멸시 (IMG40: 가까운 적 다섯에 뇌전시가 하늘에서 내리꽂히고, 맞은 자리 둘레로 뇌기가 웅덩이처럼 퍼진다; 경직 2초; 쿨 10초),
  //   천궁난사 (IMG42: 1.25초 동안 앞의 적들에게 천궁의 불화살 — 맞은 적마다 큰 불꽃 폭발, 3×3; 쿨 2초 → 4초),
  //   응축뇌전시 (IMG44 앞부분: 거대한 뇌전시가 바라보는 쪽으로 8칸까지 날아가며 끌어당기고, 끝에서 푸른 진이 열려 둘레를 모아 터진다; 쿨 12초),
  //   화살비폭격 = 패시브 (설명창 [지속효과 마법]: 투염시·응축뇌전시·폭발사격을 쓸 때 앞에 화살비 폭격 — IMG44 뒷부분의 흰 화살비).
  // Pictures at the original's own size (o_a_*: 0.62 game pixels a capture pixel).
  a_air: { name: '이기뇌멸시', kind: 'igi9', fx: 'o_a_igibolt', fxPool: 'o_a_igipool', fx2: undefined, fxCast: undefined, fxHit: undefined,
    dmg: 60, cd: 10, range: 7, n: 5, k: undefined, poolK: 0.5, waves: 3, waveGap: 0.6, poolEnd: 4.2, poolTick: 0.8, stun: 2, radius: undefined, count: undefined, depth: undefined, ck: 'spell',
    desc: '뇌 기운을 담은 뇌전시 다섯 발을 가까운 몬스터 다섯에게 쏜다. 하늘에서 뇌전시가 세 번 거듭 내리꽂혀 폭발하고, 그 자리와 상하좌우 한 칸으로 퍼진 뇌기가 4초 남짓 바닥에 깔려 거듭 치며, 맞은 몬스터는 2초 동안 경직된다' },
  a_eungchuk: { promo: 9, cls: 'archer', req: 33, name: '응축뇌전시', kind: 'vortex', fx: 'o_a_eungbolt', fxEnd: 'o_a_eungvortex', fx2: undefined, fxHit: undefined, dmg: 60, cd: 12,
    depth: 8, dur: 0.6, k: 0.5, endBurst: 2.2, endR: 92, fxCast: undefined, ck: 'line', pre: 'a_chain', branch: 0,
    desc: '거대한 뇌 기운을 담은 뇌전시를 바라보는 쪽으로 쏜다. 뇌전시는 여덟 칸까지(위아래로는 화면 안까지) 날아가며 지나는 길의 몬스터를 끌어당기고, 끝에서 뇌기의 진이 열려 둘레의 몬스터를 모아 크게 폭발한다' },
  // 천인 (9차 재작업: 원작 2662 장면 그대로 — scratchpad plan9/spec/celestial.md). 시전 3 + 패시브 1 + 필살기:
  //   순보선풍 (IMG49: 바라보는 쪽 앞의 몬스터 무리로 순식간에 도약해 치고, 내려선 자리에 푸른 돌풍이 3초 동안 휘몰아친다;
  //     이동 기술이라 바라보는 쪽으로만; 내려서는 순간 받는 피해가 준다 — 설명창: 순간적으로 방어에 최적화),
  //   해일강타 (IMG51: 앞 여섯 칸·폭 세 칸에 해일을 일으켜 맞은 몬스터마다 얼음 기둥, 풍랑의표식(받는 피해 증가)을 남긴다),
  //   천신의권역 (IMG54: 시전한 자리에 푸른 권역 8초, 안에 있는 동안 받는 피해가 크게 준다 — 열 번 맞을 때까지 60%, 그다음 30%;
  //     권역은 피해를 주지 않는다),
  //   천공의공명 = 패시브, 그림 없음 (설명창 IMG52 [지속효과 마법]: 천기 기술을 쓰면 풍랑의표식이 공명해 표식 있는 몬스터에게
  //     뇌우가 내리치고, 맞은 수만큼 그 기술의 재사용 대기가 준다 — gong9).
  // Pictures at the original's own size (o_cl_*: 0.62 game pixels a capture pixel).
  cl_cheonsin: { promo: 9, cls: 'celestial', req: 33, name: '천신의권역', kind: 'zone9', fx: 'o_cl_cheonsin', fxCast: undefined, fxHit: undefined, hit: undefined, tick: undefined,
    cd: 20, duration: 8, reach: 90, stay: true, ward: 0.6, wardHits: [10, 0.6, 0.3], radius: undefined, buff: 'shield', ck: 'buff', pre: 'cl_defense', branch: 2,
    desc: '시전한 자리에 천신의 권역을 8초 동안 펼친다. 권역 안에 있는 동안 받는 피해가 크게 준다 (열 번 맞을 때까지 60%, 그다음 30%)' },
  cl_sunbo: { promo: 9, cls: 'celestial', req: 33, name: '순보선풍', kind: 'sunbo9', fx: 'o_cl_sunbo', fxCast: undefined, fx2: undefined, lingerFx: undefined, linger: undefined, lingerK: undefined,
    dmg: 60, cd: 6, range: 6, radius: undefined, half: [92, 67], tick: 0.5, k: 0.3, guard: 0.5, guardT: 1, ck: 'blink', pre: 'cl_storm', branch: 1,
    desc: '깃털보다 가볍게 바라보는 쪽 여섯 칸 안의 몬스터 무리로 순식간에 도약해 친다. 내려선 자리에 푸른 돌풍이 3초 동안 휘몰아쳐 든 몬스터를 거듭 휩쓸고, 내려서는 순간 1초 동안 받는 피해가 절반이 된다' },
  cl_haeil: { promo: 9, cls: 'celestial', req: 33, name: '해일강타', kind: 'haeil9', fx: 'o_cl_haeil', fxHit: 'o_cl_haeilhit', dmg: 90, cd: 5, depth: 6, width: 1, ways: undefined, pulses: undefined,
    curse: 4, mark: 8, ck: 'line', pre: 'cl_ego', branch: 0,
    desc: '바라보는 쪽으로 해일을 일으켜 여섯 칸, 폭 세 칸의 몬스터에게 얼음 기둥을 세워 크게 치고 풍랑의표식을 남긴다(받는 피해 증가). 해일이 그 길을 휩쓸고 지나간다' },
  // 마도사 (9차 재작업: 원작 2662 장면 그대로 — scratchpad plan9/spec/magus.md). 시전 3 + 패시브 1 + 필살기:
  //   기공십자광선'쾌 (IMG58 #2-98: 6초 동안 몸 둘레 거울에서 십자 네 방향으로 열광선이 거듭 — 다섯 칸, 폭 한 칸; 맞히면 광폭기 흡수:
  //     피해 20%; 쿨 8초. 같은 장면 #111-201은 광폭화 상태 전용인 광폭십자광선'쾌(폭 세 칸) — 우리 기술 아님),
  //   광폭기사출 (IMG62: 바라보는 쪽 앞의 몬스터 최대 여덟에게 광폭기 줄기, 닿은 자리에 분홍 폭발),
  //   공간전도 (IMG66, PVP → 몬스터: 광폭의 파장이 바라보는 쪽으로 다섯 칸 나아가며 진영을 흩뜨리고, 끝에서 둘레를 3초 기절),
  //   마력폭풍 = 패시브 (설명창 [지속효과 마법]: 마력파장·기공신장으로 칠 때 30% 확률로 대상 둘레에 마력의 벼락 — IMG60 #30-33의 벼락).
  // Pictures at the original's own size (o_md_*: 0.62 game pixels a capture pixel).
  md_crossq: { promo: 9, cls: 'magus', req: 33, name: "기공십자광선'쾌", kind: 'cross9', echo: undefined, fx: 'o_md_cross9', fxCast: undefined, fx2: undefined, fxHit: undefined,
    hit: 16, cd: 8, duration: 6, tick: 0.5, reach: 5, power: 0.2, buff: undefined, every: undefined, range: undefined, depth: undefined, ck: 'nova', pre: 'md_cross', branch: 0,
    desc: '6초 동안 몸 주변에 마력의 거울을 만들어 십자 네 방향으로 다섯 칸씩 열광선을 빠르게 거듭 쏜다. 광선이 몬스터에 닿으면 광폭기를 흡수해 그동안 피해가 20% 는다' },
  md_frenzyshot: { promo: 9, cls: 'magus', req: 33, name: '광폭기사출', kind: 'saechul9', fx: 'o_md_saechul', fxHit: undefined, dmg: 60, cd: 3.2, range: 5, count: 8,
    ck: 'spell', pre: 'md_bust', branch: 1,
    desc: '바라보는 쪽 앞의 몬스터 최대 여덟에게 광폭기를 쏘아 보낸다. 광폭기가 닿은 자리에서 분홍빛 기운이 터진다' },
  md_gongjeon: { promo: 9, cls: 'magus', req: 33, name: '공간전도', kind: 'gong9', fx: 'o_md_gongjeon', fxArc: 'o_md_gongarc', dmg: 50, cd: 18, depth: 5, dur: 0.45, k: 0.5,
    endR: 1.5, stun: 3, ck: 'line', pre: 'md_frenetic', branch: 2,
    desc: '바라보는 쪽으로 광폭의 파장을 다섯 칸 내보낸다. 파장은 지나는 길의 몬스터를 밀어내며 진영을 흩뜨리고, 끝에 이르러 둘레의 몬스터를 3초 동안 기절시킨다' },
  // 차사 (9차 재작업: 원작 2662 장면 그대로 — scratchpad plan9/spec/reaper.md). 시전 2 + 기본공격 + 패시브 1 + 필살기:
  //   절섬 (기본공격 rp_cut, IMG77: 9차부터 바라보는 쪽 앞 세 칸(초승달이 1.5칸 높이라 그 줄만)을 푸른 초승달로 베고 곧바로 한 번 더 — jeol9),
  //   비사검 (IMG79: 4초 동안 0.5초마다 둘레 세 칸 안의 몬스터 둘에게 살극의 기가 날아가 붉은 고리로 닫히며 그와 고리 안을 벤다),
  //   황천화 (IMG81: 둘레 7×7 곳곳에 명계의 꽃 열 송이가 피어 3.4초 — 꽃가루에 닿은 몬스터는 약해지고(받는 피해 증가), 자신은
  //     꽃 곁에서 체력·마력이 빠르게 찬다; 끝에 꽃마다 크게 피어 터져 둘레를 친다),
  //   영혼갈무리 = 패시브, 그림 없음 (설명창 IMG82 [지속효과 마법]: 몬스터를 쓰러뜨릴 때마다 혼력(마력)이 차고 멸살 → 분쇄섬의
  //     재사용 대기가 준다 — galmuri9).
  // Pictures at the original's own size (o_rp_*: 0.62 game pixels a capture pixel).
  rp_bisa: { promo: 9, cls: 'reaper', req: 33, name: '비사검', kind: 'bisa9', fx: 'o_rp_bisa', fxHit: undefined, hit: undefined, dmg: 30, cd: 10, duration: 4, every: 0.5,
    shots: 2, range: 3, reach: 40, radius: undefined, tick: undefined, slow: undefined, ck: 'nova', pre: 'rp_spiral', branch: 0,
    desc: '차사의 혼력을 담아 4초 동안 0.5초마다 둘레 세 칸 안의 몬스터 둘에게 살극의 기를 내뿜는다. 살극의 기는 붉은 고리로 닫히며 맞은 몬스터와 고리 안의 몬스터를 벤다' },
  rp_hwangcheon: { promo: 9, cls: 'reaper', req: 33, name: '황천화', kind: 'hwang9', fx: 'o_rp_lotus', fxBurst: 'o_rp_lotusburst', fxCast: undefined, fx2: undefined,
    dmg: 60, cd: 15, radius: 3, n: 10, dur: 3.4, touch: 40, tick: 0.5, k: 0.15, burstR: 46, burstAt: [8, 7], curse: 4, slow: 1, heal: 1.2, mana: 0.012, drops: undefined,
    dropScale: undefined, noLoop: undefined, ck: 'nova', pre: 'rp_chain', branch: 1,
    desc: '둘레 일곱 칸 곳곳에 명계의 꽃 황천화 열 송이를 피운다. 꽃가루에 닿은 몬스터는 능력이 크게 떨어지고(받는 피해 증가·느려짐) 조금씩 베이며, 차사는 꽃 곁에서 체력과 마력이 빠르게 찬다. 3.4초 뒤 꽃마다 크게 피어 터지며 둘레를 친다' },
  // 무사·격투가·도깨비 (원작 바람에 없는 연 직업): 9차는 원작의 살수·흑화랑·영술사 9차를 이어받는다. 이들의 연 9차였던
  // 반탄강기·도깨비불 3성은 8차로 (아래), 그 밖의 8차(무형투창·점혈:통·권법의기원·마류귀체)는 그대로.
  // 무사 ← 살수 9차 (9차 재작업: 원작 2662 장면 그대로 — scratchpad plan9/spec/lancer.md). 시전 4 + 필살기 (원작에 패시브 없음):
  //   극청룡참 (IMG86: 바라보는 쪽 앞을 푸른 초승달로 크게 벰 — 그린 초승달이 덮는 곳: 앞 82px, 뒤 34px, 옆 57px — cut),
  //   이계의침식 (IMG88: 바라보는 쪽 아홉 칸으로 이계의 기운 — 흰 폭발·빛기둥·검은 잔해 세 줄; 맞은 적은 침식·옆으로 밀쳐짐),
  //   차원개방 (IMG90: 몸에 차원을 열고(검은 구체) 15초 동안 이계의낫 파편(푸른 원반)이 곁의 몬스터를 벰),
  //   아공간전개 (IMG94, PVP → 몬스터: 선 자리에 청룡 문양 영역과 결정 울타리 8초 — 아래 l_agong).
  // Pictures at the original's own size (o_l_*: 0.62 game pixels a capture pixel). 1320의 추정 그림(옛 o_l_sickle·erosion·dimension)은 뺌.
  l_dimension: { promo: 9, cls: 'lancer', req: 33, name: '차원개방', kind: 'dim9', echo: undefined, fx: 'o_l_dimshard', fxCast: 'o_l_dimcast', fxLoop: undefined, loopSize: undefined,
    fxHit: undefined, hit: 15, cd: 25, duration: 15, every: 0.75, shots: 2, splash: undefined, range: 3, reach: [34, 24], power: undefined, buff: undefined, ck: 'nova', pre: 'l_union', branch: 2,
    desc: '이계의 차원을 몸에 연다. 15초 동안 열린 차원에서 이계의낫 파편이 생겨나 곁의 몬스터 둘에게 푸른 원반으로 거듭 날아들어 그 몬스터와 원반 안의 몬스터를 벤다' },
  l_erosion: { promo: 9, cls: 'lancer', req: 33, name: '이계의침식', kind: 'erode9', fx: 'o_l_ero', fxCast: undefined, trail: undefined, fxHit: undefined, dmg: 80, cd: 8, depth: 9,
    width: undefined, ways: undefined, pulses: undefined, side: 36, sideV: 26, step: 0.06, curse: 4, ck: 'line', pre: 'l_formless', branch: 1,
    desc: '바라보는 쪽으로 이계에서 불러낸 기운을 아홉 칸 쏘아 보낸다. 지나는 자리마다 빛기둥이 솟고 검은 잔해가 세 줄로 남으며, 맞은 몬스터는 침식되어(받는 피해 증가) 옆으로 밀쳐진다' },
  l_cheongryong: { promo: 9, cls: 'lancer', req: 33, name: '극청룡참', kind: 'cheong9', fx: 'o_l_cheong', fxShot: undefined, fxHit: undefined, dmg: 75, cd: 2.5, range: undefined,
    radius: undefined, splash: undefined, shot: undefined, again: undefined, depth: 2, half: 1, cut: [-34, 82, 57], ck: 'cleave', pre: 'l_annihil', branch: 0,
    desc: '청룡의 힘을 빌려 바라보는 쪽 앞을 푸른 초승달로 크게 베어 낸다. 초승달이 덮는 앞 한 칸, 폭 세 칸과 양옆의 몬스터가 모두 베인다' },
  // 격투가 ← 흑화랑 9차 (재작업: 원작 2662 장면 그대로 — scratchpad plan9/spec/monk.md). 시전 3 + 패시브 1 + 필살기:
  //   진'투귀살 (IMG96; 설명창 IMG95: 앞으로 마력의 화살 2발, 맞은 적 둘레로 유도 화살 — 앞 세 줄, 7칸): 바라보는 쪽으로만,
  //     원작의 거대한 화살 원뿔(o_mk_tugwi)이 두 번, 맞은 몬스터에게서 둘레로 유도 화살의 금빛 소용돌이(o_mk_tugwihit),
  //   연옥'만월 (IMG98; 설명창 IMG97: 5×5, 2초, 명중·회피 크게 상승, 우두머리 피해 100% 증가): 붉은 달(o_mk_yeonok, s9_stamps)이
  //     그 둥근 자리(반지름 94px, half)를 2초 동안 거듭 베고, 그동안 받는 피해 절반, 우두머리에게는 두 배,
  //   마궁폭사 (IMG100; 설명창 IMG99: 가장 가까운 적에게 3발씩, 5칸, 최대 24발): 몸 둘레 붉은 가시 원반(o_mk_magung) 속에서 가장
  //     가까운 몬스터 셋에게 붉은 화살(o_mk_magungshot)이 0.225초마다 3발씩 여덟 번 (원작 장면 2.0초),
  //   부조리 = 패시브, 그림 없음 (설명창 IMG101 [지속효과 마법]: 상태이상 공격을 받으면 잠시 보호막 — bujori9).
  // Pictures at the original's own size (o_mk_*: 0.62 game pixels a capture pixel).
  mk_magung: { promo: 9, cls: 'monk', req: 33, name: '마궁폭사', kind: 'magung9', echo: undefined, fx: 'o_mk_magungshot', fx2: undefined, fxCast: 'o_mk_magung', shotSize: undefined,
    fxHit: undefined, dmg: 70, cd: 9, every: 0.225, volleys: 8, per: 3, range: 5, hit: undefined, duration: undefined, shots: undefined, power: undefined, buff: undefined,
    ck: 'spell', pre: 'mk_origin', branch: 2,
    desc: '마력의 화살 스물넷을 한꺼번에 장전한다. 몸 둘레의 붉은 원반에서 0.2초 남짓마다 다섯 칸 안의 가장 가까운 몬스터 셋에게 화살이 한 발씩, 여덟 번 날아간다' },
  mk_yeonok: { promo: 9, cls: 'monk', req: 33, name: "연옥'만월", kind: 'aura9', fx: 'o_mk_yeonok', fxCast: undefined, fxHit: undefined, hit: 9, cd: 12, duration: 2, radius: 2, tick: 0.2,
    ward: 0.5, bossK: 2, half: [94, 94], auraSize: 0.8, auraAlpha: 1, ck: 'nova', pre: 'mk_stack', branch: 1,
    desc: '둘레를 장악하는 화려한 검무를 펼친다. 붉은 달이 2초 동안 그 둥근 자리 안의 몬스터를 쉴 새 없이 베고(우두머리에게는 두 배), 그동안 몸을 피해 받는 피해가 절반이 된다' },
  mk_tugwi: { promo: 9, cls: 'monk', req: 33, name: "진'투귀살", kind: 'tugwi9', fx: 'o_mk_tugwi', fxShot: undefined, fxHit: 'o_mk_tugwihit', dmg: 110, cd: 5,
    from: 2, depth: 4, half: 1, shots: 2, gap: 0.3, homeFrom: 3, chain: 3, chainR: 2, chainK: 0.45, range: undefined, radius: undefined, shot: undefined,
    ck: 'line', pre: 'mk_kyokushin', branch: 0,
    desc: '바라보는 쪽으로 마력의 거대한 화살을 두 발 잇달아 쏘아 화살 원뿔이 덮는 앞 둘째~넷째 칸, 폭 세 칸의 몬스터를 친다. 맞은 몬스터에게서 유도 화살이 튀어나가 둘레의 몬스터를 더 친다' },
  // 도깨비 ← 영술사 9차 (원작 2662 장면 그대로 — scratchpad plan9/spec/dokkaebi.md). 시전 3 + 패시브 1 + 필살기:
  //   화혼돌파 (IMG68, 이동공격: 바라보는 쪽으로만 여섯 칸 돌진, 지나온 길과 앞 두 칸 폭 세 칸을 친다; 푸른 혼불 휘두름 + 뒤로 흐르는 불꼬리 — hwahon9),
  //   천신의심판 (IMG71, 위치지정: 몬스터가 가장 많은 곳 둘레를 붉은 소용돌이로 끌어모은 뒤 천신의 주먹 = 분홍 빛기둥이 내리꽂힘 — smite own),
  //   장승영역 (IMG75, PVP → 몬스터 상대로: 시전 자리에 금빛 인장과 장승 고리 8초, 안의 몬스터는 장승에게 거듭 맞고 느려지며 자신은 안에서 받는 피해 감소 — jang9),
  //   불길한혼불 = 패시브, 그림 없음 (설명창 IMG69 [지속효과 마법]: 둘레의 몬스터에 혼불이 붙고, 불 기술로 치면 터져 둘레를 친다 — honbul9).
  // Pictures at the original's own size (o_dk_*: 0.62 game pixels a capture pixel).
  dk_hwahon: { promo: 9, cls: 'dokkaebi', req: 33, name: '화혼돌파', kind: 'hwahon9', fx: 'o_dk_hwahon', fxCast: undefined, fxHit: undefined, trail: undefined, trailStep: undefined,
    trailSize: undefined, dmg: 44, cd: 3, depth: 6, ahead: 2, half: 1, width: undefined, ways: undefined, pulses: undefined, dash: undefined, dot: 'burn', ck: 'line', pre: 'dk_firebat', branch: 2,
    desc: '대장군의 힘으로 바라보는 쪽으로 여섯 칸 돌진하며 지나온 길과 그 양옆, 앞 두 칸을 치고, 요괴혼의 푸른 불길이 태운다(화상)' },
  dk_simpan: { promo: 9, cls: 'dokkaebi', req: 33, name: '천신의심판', kind: 'smite', fx: 'o_dk_simpan', fxPull: undefined, fxHit: undefined, own: true, dmg: 105, cd: 7,
    range: 6, radius: 2, splash: 0.8, densest: true, pull: true, delay: 0.75, size: undefined, ck: 'strike', pre: 'dk_nemesis', branch: 0,
    desc: '몬스터가 가장 많은 곳의 둘레(5×5)를 붉은 소용돌이로 가운데에 끌어모은 뒤, 분노한 거대한 천신의 주먹이 빛기둥으로 내리꽂혀 짓이긴다' },
  // ---- 네 번째 9차 (모든 직업 4개: 보조 공격·몸 주변·광역·강한 일격 하나씩). 원작의 패시브는 켜는 기술로, PVP 기술은 몬스터 상대로.
  m_hwanyeong: { promo: 9, cls: 'mage', req: 33, name: '환영안개', kind: 'fog9', fx: 'o_m_hwanyeong', hit: 14, cd: 20, duration: 5, tick: 0.5, reach: [10, 214], side: 93,
    slow: 2, curse: 2, ck: 'strike', pre: 'm_seonsim', branch: 2,
    desc: '앞에 환영 안개를 5초 동안 흩뿌린다. 안개에 든 몬스터는 길을 잃고 느려지며 받는 피해가 늘고 거듭 피해를 입는다' },
  a_cheongung: { promo: 9, cls: 'archer', req: 33, name: '천궁난사', kind: 'cheon9', fx: 'o_a_cheongung', fxCast: undefined, fxHit: undefined, auraSize: undefined,
    dmg: 40, cd: 4, duration: 1.25, every: 0.25, range: 5, radius: 1, dot: 'burn', ck: 'strike', pre: 'a_firewall', branch: 1,
    desc: '1.25초 동안 앞쪽 다섯 칸 안의 몬스터들에게 천궁의 불화살을 난사한다. 화살이 닿은 곳마다 큰 불꽃이 터져 그 불꽃 안의 몬스터를 태운다(화상)' },
  // 절섬 (기본공격, 원작 2662 IMG77; 설명창 IMG76: 쿨 0.75초, 범위 앞 5×5, 사용 후 곧바로 한 번 더 — 두 번째는 같은 피해):
  // from the 9차 승급 (in 수련장 always) the cut goes only the way the hero faces, over the ground ahead its crescent sweeps (the hero's own row, three tiles deep: the crescent is 1.5 tiles tall — 이펙트=판정; shown 0.39 s as in the scene), under the original's
  // blue crescent (jeol9), and a second follows at once.
  rp_cut: { nine: { k: 1, at: 0.3 }, jeol9: { fx: 'o_rp_jeol', depth: 3, half: 0, max: 9, life: 0.39 },
    desc: '정면을 크게 벤다. 9차 승급부터는 원작 9차의 절섬처럼 바라보는 쪽 앞 세 칸을 푸른 초승달로 베고, 곧이어 한 번 더 벤다' },
  // 아공간전개 (원작 2662 IMG94; 설명창 IMG93, PVP → 몬스터): 선 자리에 아공간 영역 8초 (그림 = 영역, 약 다섯 칸 사방). 안에 있는 동안 받는 피해가
  // 20%에서 50%까지 점점 더 줄고(명중회피 점차 증가), 든 몬스터는 느려짐. 벗어나면 즉시 풀림. 그 자체로는 치지 않음.
  l_agong: { promo: 9, cls: 'lancer', req: 33, name: '아공간전개', kind: 'zone9', fx: 'o_l_agong', fxHit: undefined, hit: undefined, cd: 30, duration: 8, radius: 2, reach: 104, tick: undefined,
    ward: 0.35, wardRamp: [0.2, 0.5], atFeet: true, slowIn: 1, ck: 'buff', buff: 'shield', pre: 'l_reflect', branch: 2,
    desc: '자신의 자리에 청룡 문양의 아공간 영역을 8초 동안 펼친다. 영역 안에 있는 동안 받는 피해가 점점 더 줄고(20%→50%), 든 몬스터는 길을 잃고 느려진다. 영역을 벗어나면 즉시 풀린다' },
  dk_jangseung: { promo: 9, cls: 'dokkaebi', req: 33, name: '장승영역', kind: 'jang9', fx: 'o_dk_jangseal', fxPole: 'o_dk_jangpole', fxHit: undefined, hit: 12, cd: 20, duration: 8, radius: 2,
    tick: 0.5, ward: 0.5, slow: 1, auraAlpha: undefined, ck: 'buff', buff: 'shield', pre: 'dk_body', branch: 2,
    desc: '시전한 자리에 장승이 둘러싼 금빛 영역(5×5)을 8초 동안 편다. 영역 안에 있는 동안 밖의 공격은 반만 들어오고, 영역에 든 몬스터는 장승에게 거듭 맞으며 느려진다' },
};
for (const [id, o] of Object.entries(S9)) {
  const { pre, branch, ...rest } = o;
  const old = SKILLS[id];
  if (old && old.retired) {
    // merged away by 스킬 2차 개편 (the same picture or name as another): back as the original's 9차 itself,
    // its own name and picture; a saved slot of it is its own again
    delete SKILL_ALIAS[id];
    SKILLS[id] = { ...rest, cls: rest.cls || old.was, promo: 9, req: 33 };
    for (const b of BRANCHES[SKILLS[id].cls]) b.ids = b.ids.filter(x => x !== id);
  } else if (old) Object.assign(old, rest);
  else SKILLS[id] = rest;
  if (pre) SKILLS[id].pre = [pre, 3];
  // a held one (보조 공격, 아우라) quickens 3% a 단, as the area spells: it is not to be up for good
  if (['echo', 'aura9'].includes(SKILLS[id].kind)) SKILLS[id].aoe = true;
  if (branch !== undefined && !BRANCHES[SKILLS[id].cls][branch].ids.includes(id)) BRANCHES[SKILLS[id].cls][branch].ids.push(id);
}
// 1320 조각 (xoxd.tistory.com/1320: 공식 바람의나라 이펙트 그림만, 흰 바탕에서 떼어 냄 — tools/s9_stamps.py *1320). 사용자 결정
// 2026-11-23 ("1320중에 안사용한 이펙트가 있다면 짜치는 이미지를 대체해서 써", "고차 스킬로 다시 매핑해 9차 우선으로"): 아직 쓰이지
// 않은 그림을 지금 그림이 짜치는(흐림·무채색·정지 그림·모양이 이름과 다름) 고차 기술에 하나씩만. 크기는 각 kind의 기존 규칙
// (fxFit·fxSquare·fxIn·fxTiles: 보이는 범위 = 맞는 범위), AI(castAs)도 같은 그림. 'o_'로 시작해 boot의 k_ 덮어쓰기를 받지 않는다.
const PICS1320 = {
  md_gongjeon: { fx: 'o_md_gonghole', fxEnd: 'o_md_gongend' }, // #26 금 간 보라 고리와 검은 구멍: 나는 동안 0~11, 끝에서 18~30 터짐 (뒤의 호는 그대로)
  m_seonsim: { fx: 'o_m_seonsim', fxK: 0.75 }, // #01 검붉은 저주의 핏줄 (회색 점박이 해골 대신; 터짐 fx2는 그대로)
  // 맹독표창: 사용자가 준 원작 표창 GIF가 몬스터 셋에게 날아가 박힌다 (s9_stamps.py venomstar)
  r_venom: { fxShot: 'o_r_venomstar', shotTiles: 2 },
  // 봉황신법: 위를 보는 봉황이 날아가는 쪽으로 돌아 2.4칸 크기로 (game.js line def.flyUp; 사용자 2026-11-23)
  p_bonghwang: { flyUp: true, flyTiles: 6 }, // (사용자 2026-11-24: 너무 작다, 5배 — 처음 1.4칸 대비 약 4.3배, 화면 높이 안)
  // 필살검강: 근접기인데 다섯 칸을 날아가는 검기였다 (사용자 2026-11-23) → 앞쪽 역삼각형(아홉 칸)을 벤다, 뛰어들어
  r_pilgeom: { kind: 'cleave', radius: 0, max: 9, depth: undefined, fxAfter: null, noMain: true, desc: '검강을 실어 앞쪽 역삼각형(아홉 칸)의 몬스터를 단숨에 벤다' },
  l_javelin: { fx: 'o_l_javelin', fxShot: 'o_l_javelinshot', fxTurn: true, shotTiles: 3.4 }, // #11 청록 창끝 빛줄기: 날아가 꽂힘, 나는 쪽을 향해
  mk_stack: { fx: 'o_mk_stack' }, // #21 파란 기 구슬이 맺혀 튐 (흐린 파란 원판 대신)
  rp_chain: { fx: 'o_rp_chain' }, // #20 청록 사슬이 묶인 몬스터마다 몸 크기로
};
for (const [id, o] of Object.entries(PICS1320)) Object.assign(SKILLS[id], o, { fxs: null, tint: null, modern: null, yeon: true });
// 사용자 2026-11-23: 너무 크다 — 판정은 그대로, 그림만 (노도성황 화면의 0.9 → 0.5, 선기전도 11칸 → 5.5칸, 혼마염 불꽃 90 → 60px)
Object.assign(SKILLS.m_nodo, { frac: 0.5 });
// 사용자 2026-11-28 "주술사 기술이 유독 큼": 화면 기술의 그림이 화면보다 커서(지폭지술 17칸·혼돈 19칸·서리한파 21칸 — 화면 높이 8.6칸)
// 뭉개진 큰 덩어리로 화면을 덮었다. 판정은 그대로, 그림만 노도성황처럼 화면의 절반 크기로. 서리한파는 몬스터마다 맺히는
// 얼음(dropMax까지)으로 보이고, 화면 그림은 그보다 많을 때만.
Object.assign(SKILLS.m_quake, { frac: 0.5 });
Object.assign(SKILLS.m_chaos, { frac: 0.5 });
Object.assign(SKILLS.m_frost, { frac: 0.35, dropMax: 40 }); // (그 흰 눈구름은 작은 그림을 키운 것이라 뭉개진다: 얼음을 몬스터마다)
// 원거리 직업(천인 제외 마법 계열)은 돌진하지 않는다 (사용자 2026-11-24): 마기순보는 몸을 옮기지 않고 바라보는 쪽 몬스터를 푸른 불꽃으로 친다.
// (추격은 다시 돌진, 사용자 2026-11-24 — 대신 날아가는 화살 그림을 2.4칸으로 키움)
Object.assign(SKILLS.a_chase, { flyTiles: 2.4 });
Object.assign(SKILLS.m_shift, { kind: 'spell', range: 5, count: 1, desc: '마기를 실은 푸른 불꽃을 바라보는 쪽 몬스터에게 순식간에 꽂는다' });
// 무형검: 근접기인데 네 칸을 날아가는 검기였다 → 앞쪽 베기. 혼마염: 맞은 몬스터마다 크게 뜨던 저주 해골(k_m_curse)을 뺀다
Object.assign(SKILLS.r_formless, { kind: 'cleave', depth: 2, max: 4 });
Object.assign(SKILLS.m_coldveil, { fxHit: null, frac: 0.45 });
Object.assign(SKILLS.p_seongi, { fxK: 0.5 });
// 흑룡검풍: a passive in the original ([지속효과 마법]) — not a spell of the bar: 흑룡광참 brings it (wind9), and a saved
// slot of it is 흑룡광참.
Object.assign(SKILLS.w_hogi, { retired: true, was: 'warrior', cls: '-', pre: undefined, up: undefined, name: '흑룡검풍' });
SKILL_ALIAS.w_hogi = 'w_blackdragon';
// 명천검파: no scene of it in 2662 (IMG05 shows none) — a passive without a picture (사용자 결정): the 검기 skills' every
// third cast goes out once more at 60%, once in five seconds at most. A saved slot of it is 호기어검.
SKILLS.w_mcheon = { name: '명천검파', kind: 'passive', retired: true, was: 'warrior', cls: '-', promo: 9, req: 33,
  desc: '9차 패시브. 검기 계열 기술을 세 번 쓸 때마다 그 기술이 한 번 더 나간다 (60%, 5초에 한 번)' };
SKILL_ALIAS.w_mcheon = 'w_swords';
for (const id of BRANCHES.warrior[0].ids) if (SKILLS[id] && SKILLS[id].dmg && !SKILLS[id].retired) SKILLS[id].mcheon9 = { every: 3, k: 0.6, cd: 5, at: 0.3 };
SKILLS.w_swords.desc += '. 9차 패시브 명천검파: 검기 계열 기술을 세 번 쓸 때마다 그 기술이 한 번 더 나간다';
Object.assign(SKILLS.w_blackdragon, { wind9: { name: '흑룡검풍', fx: 'o_w_heukaura', chance: 0.3, duration: 8, tick: 0.5, hit: 12, reach: 1 },
  desc: SKILLS.w_blackdragon.desc + '. 9차 승급부터는 패시브 흑룡검풍: 벨 때 30% 확률로 흑적색 검풍이 몸을 감싸, 8초 동안 둘레 한 칸의 몬스터를 거듭 벤다' });
// 죽음의희열: a passive in the original ([지속효과 마법]: a kill brings, three times in ten, one of the 수리검 skills
// ready at once) — 2662 IMG15 shows no picture of its own (묵마수리검'쇄 thrown again), so none here. A saved slot of it
// is 묵마수리검'쇄. (In our game kills come thick: at most once in three seconds.)
SKILLS.r_jugeum = { name: '죽음의희열', kind: 'passive', retired: true, was: 'rogue', cls: '-', promo: 9, req: 33,
  desc: '9차 패시브. 몬스터를 쓰러뜨릴 때 30% 확률로 묵마십자수리검·묵마수리검\'쇄·그림자표창 중 하나의 재사용 대기가 끝난다 (3초에 한 번)' };
SKILL_ALIAS.r_jugeum = 'r_chainstar';
SKILLS.r_jugeum.proc9 = { chance: 0.3, ids: ['r_chainstar', 'r_shuriken', 'r_shadowstar'], cd: 3 };
SKILLS.r_chainstar.desc += '. 9차 패시브 죽음의희열: 몬스터를 쓰러뜨릴 때 30% 확률로 수리검 계열 기술 하나의 재사용 대기가 끝난다';
// 전도체: a passive in the original ([지속효과 마법]: 천뢰마옥쌍구 or 뇌격구 brings, one time in two, 10 s of 과전류, in which
// the current runs into those 서리파편 strikes) — its picture the bolts of 2662 IMG25. A saved slot of it is 서리파편.
SKILLS.m_jeondo = { name: '전도체', kind: 'passive', retired: true, was: 'mage', cls: '-', promo: 9, req: 33,
  desc: '9차 패시브. 천뢰마옥쌍구·뇌격구를 쓸 때 50% 확률로 10초 동안 과전류 상태가 된다. 과전류 동안 서리파편에 맞은 몬스터에게 몸에서 번개가 흘러 피해를 준다',
  proc9: { chance: 0.5, ids: ['m_twin', 'm_thunderball'], dur: 10, k: 0.5, fx: 'o_m_jeondo', reach: 200, every: 0.5 } };
SKILL_ALIAS.m_jeondo = 'm_shards';
SKILLS.m_shards.desc += '. 9차 패시브 전도체: 천뢰마옥쌍구·뇌격구를 쓰면 50% 확률로 10초 과전류 — 서리파편에 맞은 몬스터에게 번개가 흐른다';
// 화살비폭격: a passive in the original ([지속효과 마법]: 투염시, 응축뇌전시 or 폭발사격 brings a rain of arrows before the caster,
// sweeping all there) — its picture the white arrows and their dust of 2662 IMG44 after 응축뇌전시 (s9_stamps a_hwasalbi). Ours:
// 염시투사 (투염시), 응축뇌전시, 마탄 (폭발사격). A saved slot of it is 응축뇌전시.
SKILLS.a_hwasalbi = { name: '화살비폭격', kind: 'passive', retired: true, was: 'archer', cls: '-', promo: 9, req: 33,
  desc: '9차 패시브. 염시투사·응축뇌전시·마탄을 쓸 때 앞에 화살비가 쏟아져 그곳의 몬스터를 모두 친다',
  proc9: { ids: ['a_flame', 'a_eungchuk', 'a_bomb'], fx: 'o_a_hwasalbi', ahead: 2, scale: 1.3, half: [105, 65], k: 0.5, ticks: 4, cd: 1 } };
SKILL_ALIAS.a_hwasalbi = 'a_eungchuk';
SKILLS.a_eungchuk.desc += '. 9차 패시브 화살비폭격: 염시투사·응축뇌전시·마탄을 쓰면 앞에 화살비가 쏟아진다';
// 마력폭풍: a passive in the original ([지속효과 마법]: 마력파장 or 기공신장 striking brings, three times in ten, a bolt of 마력
// round the struck one) — its picture the blue bolt of 2662 IMG60 (frames 30-33). A saved slot of it is 공간전도.
SKILLS.md_mstorm = { name: '마력폭풍', kind: 'passive', retired: true, was: 'magus', cls: '-', promo: 9, req: 33,
  desc: '9차 패시브. 마력파장·기공신장을 쓸 때 30% 확률로 대상 둘레에 마력의 벼락이 내리친다',
  proc9: { chance: 0.3, ids: ['md_wave', 'md_storm', 'md_stormfrenzy'], fx: 'o_md_mstorm', n: 3, range: 7, k: 0.8, cd: 0.5 } };
SKILL_ALIAS.md_mstorm = 'md_gongjeon';
SKILLS.md_gongjeon.desc += '. 9차 패시브 마력폭풍: 마력파장·기공신장을 쓰면 30% 확률로 대상 둘레에 마력의 벼락이 내리친다';
// The 9차 that made way go down a 승급 (the 9차 is the original's now).
// 치유의반향: a passive in the original ([지속효과 마법]: at full health (healed past it) the damage is 30% more) — no picture.
// A saved slot of it is 천신의기운.
SKILLS.p_banhyang = { name: '치유의반향', kind: 'passive', retired: true, was: 'poet', cls: '-', promo: 9, req: 33,
  desc: '9차 패시브. 체력이 가득 차 있으면 주는 피해가 30% 늘어난다', full9: { at: 0.98, k: 0.3 } };
SKILL_ALIAS.p_banhyang = 'p_skyspirit';
SKILLS.p_skyspirit.desc += '. 9차 패시브 치유의반향: 체력이 가득하면 주는 피해가 30% 는다';
// 천공의공명: a passive in the original ([지속효과 마법], 설명창 IMG52; no scene of it in 2662): using a 천기 skill (회선풍·우레·백우
// there; here the 천인's whirlwinds and thunder — 불가살이선풍·불가살이장군폭풍·뇌격룡·순보선풍) sets the 풍랑의표식 that
// 해일강타 left ringing: a thunderbolt falls on every marked foe within reach, and that skill's wait shrinks by how many it
// found. No picture of its own: only the small light of the blow on each. A saved slot of it is 해일강타.
SKILLS.cl_gongmyeong = { name: '천공의공명', kind: 'passive', retired: true, was: 'celestial', cls: '-', promo: 9, req: 33,
  desc: '9차 패시브. 불가살이선풍·불가살이장군폭풍·뇌격룡·순보선풍을 쓰면 풍랑의표식이 공명해, 표식이 있는 몬스터마다 뇌우가 내리쳐 피해를 주고 그 수만큼 그 기술의 재사용 대기가 준다 (하나에 5%, 최대 40%)',
  gong9: { ids: ['cl_storm', 'cl_storm2', 'cl_thunder', 'cl_sunbo'], k: 0.5, reach: 20, max: 8, cut: 0.05, cutMax: 0.4, fx: 'h_hit_light' } };
SKILL_ALIAS.cl_gongmyeong = 'cl_haeil';
SKILLS.cl_haeil.desc += '. 9차 패시브 천공의공명: 선풍·뇌격 기술을 쓰면 풍랑의표식이 있는 몬스터에게 뇌우가 내리치고 그 기술이 빨리 돌아온다';
// 영혼갈무리: a passive in the original ([지속효과 마법], 설명창 IMG82; no scene of it in 2662): every foe the 차사 fells gives back
// 혼력 (0.2% of its most a foe; here 마력, 0.5% — this game's foes fall by the dozen and its 마력 is small) and brings 멸살 nearer
// by 0.125 s (멸살 is not in this game: 분쇄섬, the 차사's great cut, in its place). No picture of its own. A saved slot of it is
// 황천화.
SKILLS.rp_galmuri = { name: '영혼갈무리', kind: 'passive', retired: true, was: 'reaper', cls: '-', promo: 9, req: 33,
  desc: '9차 패시브. 몬스터를 쓰러뜨릴 때마다 마력이 최대치의 0.5%만큼 차고, 분쇄섬의 재사용 대기가 0.125초 준다',
  galmuri9: { mana: 0.005, ids: ['rp_crush'], cut: 0.125 } };
SKILL_ALIAS.rp_galmuri = 'rp_hwangcheon';
SKILLS.rp_hwangcheon.desc += '. 9차 패시브 영혼갈무리: 몬스터를 쓰러뜨릴 때마다 마력이 차고 분쇄섬이 빨리 돌아온다';
// 부조리: a passive in the original ([지속효과 마법], 설명창 IMG101; no scene of it in 2662): a status attack (마비·절대마비·수면·
// 기절·무장해제·회복불가·변이) on the 흑화랑 raises a barrier for a moment (보호막 20,000,000 for 5 s; again in 20 s). Here: a hard
// status (기절·마비·빙결·침묵·저주) or a blow of a boss, a lieutenant or a champion (the monsters that strike in their nature) raises a
// barrier of a quarter of the 격투가's life for 5 s, once in 20 s. No picture of its own. A saved slot of it is 마궁폭사.
SKILLS.mk_bujori = { name: '부조리', kind: 'passive', retired: true, was: 'monk', cls: '-', promo: 9, req: 33,
  desc: '9차 패시브. 기절·마비·빙결·침묵·저주에 걸리거나 우두머리·정예의 공격을 받으면 5초 동안 최대 체력의 25%만큼 피해를 막는 보호막이 씌워진다 (20초에 한 번)',
  bujori9: { kinds: ['stun', 'para', 'freeze', 'silence', 'curse'], share: 0.25, dur: 5, cd: 20 } };
SKILL_ALIAS.mk_bujori = 'mk_magung';
SKILLS.mk_magung.desc += '. 9차 패시브 부조리: 상태이상이나 우두머리·정예의 공격을 받으면 잠시 보호막이 씌워진다';
// 불길한혼불: a passive in the original ([지속효과 마법], 설명창 IMG69; no scene of it in 2662): an ill-omened soul fire clings to the
// foes round the 영술사, and striking one with a fire skill (화염쓸기·화염회격·화염정권·화염돌파·도깨비혈침·도깨비폭격·도리깨난타·
// 천신의심판 there; here the 도깨비's fire — 도깨비불·폭살·뇌격·쥐불놀이·도깨비불 1~3성·화혼돌파·천신의심판) makes it burst on the
// one it clings to and round it. No picture of its own (the small fire of a blow). A saved slot of it is 화혼돌파.
SKILLS.dk_honbul = { name: '불길한혼불', kind: 'passive', retired: true, was: 'dokkaebi', cls: '-', promo: 9, req: 33,
  desc: '9차 패시브. 둘레 세 칸의 몬스터 셋에게 불길한 혼불이 달라붙고, 도깨비불·폭살·뇌격·쥐불놀이·도깨비불 1~3성·화혼돌파·천신의심판을 쓰면 혼불이 붙은 몬스터(다섯 칸 안)마다 혼불이 터져 그와 둘레 한 칸에 그 기술 피해의 60%를 준다',
  honbul9: { ids: ['dk_wisp', 'dk_wispexp', 'dk_shock', 'dk_firebat', 'dk_wisp1', 'dk_wisp2', 'dk_wisp3', 'dk_hwahon', 'dk_simpan'], k: 0.6, reach: 5, cling: 3, n: 3, life: 10, fx: 'h_hit_fire' } };
SKILL_ALIAS.dk_honbul = 'dk_hwahon';
SKILLS.dk_hwahon.desc += '. 9차 패시브 불길한혼불: 둘레의 몬스터에 혼불이 붙고, 불 기술을 쓰면 터져 둘레를 친다';
for (const id of ['r_tudo', 'm_seonsim', 'cl_shatter', 'md_manafill', 'dk_wisp3', 'l_reflect', 'p_seongi']) Object.assign(SKILLS[id], { promo: 8, req: 30 });
export const S9_IDS = Object.keys(S9).concat();

// The lines (계열) without the merged ones; a spell after a merged one comes after the one it became.
for (const branches of Object.values(BRANCHES)) for (const b of branches) b.ids = b.ids.filter(id => !SKILLS[id].retired);
for (const s of Object.values(SKILLS)) {
  if (!s.pre) continue;
  let from = s.pre[0];
  while (from && SKILLS[from] && SKILLS[from].retired) from = SKILL_ALIAS[from];
  if (!from || from === s || !SKILLS[from] || SKILLS[from].cls !== s.cls) delete s.pre;
  else s.pre = [from, s.pre[1]];
}
for (const [id, s] of Object.entries(SKILLS)) if (s.pre && s.pre[0] === id) delete s.pre;

// 다수기 cadence: a spell that strikes many waits at least this long (s, at 1단), and its wait shrinks
// only 3% a 단 (skillStats: s.aoe); its blow grows with the wait (to the 0.75th power: a little less a
// second than before, more in each). Single blows are a little quicker, to fill the gaps.
const AOE_CD = { screen: 12, nova: 5, wave: 7, rain: 6, zone: 6.5, vortex: 5.5, totem: 9, barrage: 4.5, spin: 6, gust: 14, orbit: 12, trap: 7 };
function aoeFloor(s) {
  if (s.kind in AOE_CD) return AOE_CD[s.kind];
  if (s.kind === 'strike' && ((s.radius || 0) >= 2 || (s.count || 1) >= 3)) return 4;
  if (s.kind === 'strike' && (s.radius || 0) >= 1) return 3;
  if (s.kind === 'spell' && (s.count || 1) >= 3) return 3.2;
  if (['chain', 'mark', 'stack'].includes(s.kind) && (s.count || 1) >= 3) return 4;
  if (s.kind === 'cleave' && ((s.max || 0) >= 6 || (s.depth || 0) >= 3)) return 3.4;
  if (s.kind === 'line' && (s.depth || 0) >= 6) return 3.2;
  if (s.kind === 'spell4') return 3;
  return 0;
}
for (const s of Object.values(SKILLS)) {
  if (s.retired || ['ult', 'buff', 'heal', 'regen', 'cleanse', 'reset', 'evade', 'taunt', 'thorns', 'shieldburst'].includes(s.kind) || !s.cd) continue;
  const f = aoeFloor(s);
  if (f) {
    s.aoe = true;
    if (s.cd < f) {
      const k = Math.pow(f / s.cd, 0.75);
      if (s.dmg) s.dmg = Math.round(s.dmg * k * 10) / 10;
      if (s.hit) s.hit = Math.round(s.hit * k * 10) / 10;
      s.cd = f;
    }
  } else if ((s.dmg || 0) > 0 && s.cd >= 1 && ['spell', 'blink', 'strike', 'line', 'cleave', 'slash', 'flurry', 'lance', 'boomerang', 'charge', 'knock', 'hop'].includes(s.kind)) {
    s.cd = Math.round(s.cd * 0.9 * 100) / 100;
  }
}

// ---- 필살기의 길 (ULT_TIERS): four a class, by 승급 band (ULT_BANDS: 0~2차, 3~5차, 6~8차, 9차). Each by a
// name of the class's own (연 Skills_Player / 원작 list), its own way of striking (game.js ULT_MECH), and
// its own pictures in stages: cast (the call over the hero), main (the great picture), hit (on each
// struck), after (what stays a moment), drop/shot/burst where its way has them. k: how hard (×the
// class's blow). boss: the 보스용 필살기 of that band (five blows of that technique on the strongest foe).
// 필살기 단계 위엄 (2차 피드백, game.js ultGrand): open (the call over the hero, openW × the view's width),
// aura (held round the hero), echo / echo2 (over the field, echoN of them, echoW px), fin (9차's last burst);
// the *Cap fields bound how far a picture is blown up (its smooth drawing is what a slowed phone pays for).
// Each band must cover more of the screen, longer, than the one before (scratchpad ult3 probe.js).
export const ULT_BANDS = [0, 3, 6, 9];
const ult = (cls, id, name, o) => {
  if (!SKILLS[id]) SKILLS[id] = { cls, name, kind: 'ult', ultTier: true, desc: o.desc || '' };
  else Object.assign(SKILLS[id], { ultTier: true });
  return { id, ...o };
};
export const ULT_TIERS = {
  warrior: [
    ult('warrior', 'w_ult', '건곤대나이', { mech: 'cleaveWave', main: 'k_w_ult', mainSize: 260, hit: 'k_u_w_wave', boss: 'w_jinseom', k: 1 }),
    ult('warrior', 'w_blood', '혈겁만파', { mech: 'rain', main: 'k_w_blood', frac: 0.85, hit: 'h_hit_tiger', dropSize: 90, boss: 'w_roar3', k: 1.15, hpCost: 0.3 }),
    ult('warrior', 'w_charge', '돌격명령', { open: 'k_w_tarok', openW: 0.6, echoW: 200, echoCap: 2.5, echoN: 26, openCap: 2.5, aura: 'k_w_charge', echo: 'k_w_tarok', echo2: 'k_u_w_wave', mech: 'dash', cast: 'k_w_charge', castSize: 220, main: 'k_u_w_wave', mainSize: 170, hit: 'h_ml_burst', hitScale: 0.5, n: 9, boss: 'w_gwangya', k: 1.3, hpCost: 0.3,
      desc: '돌격을 명하며 몬스터에서 몬스터로 아홉 번 돌진해 베고, 마지막에 칼바람을 일으켜 화면의 나머지를 벤다' }),
    ult('warrior', 'w_myriad', '만검귀종', { cine9: 0.75, cutin: 'o_w_ult9', open: null, mech: 'vortex', main: 'k_w_myriad', mainScale: 1.2, burst: 'k_w_myriad', burstSize: 260, ring: 'k_w_fly', hit: 'k_w_fly', hold: 1.0, boss: 'w_blackdragon', k: 1.5, hpCost: 0.3 }),
  ],
  rogue: [
    ult('rogue', 'r_ult', '필살검무', { mech: 'dash', main: 'k_u_r_ult0', mainSize: 180, hit: 'k_u_r_backhit', n: 8, gap: 0.09, boss: 'r_dance', k: 1 }),
    ult('rogue', 'r_bunhon', '분혼경천', { echo: 'k_r_suhyo', aura: 'k_r_flysword', mech: 'mark', cast: 'k_r_bunhon', frac: 0.6, main: 'h_ml_cross', markScale: 0.6, hit: 'h_ml_spark', stun: 0.6, delay: 1.1, boss: 'r_flysword', k: 1.15 }),
    ult('rogue', 'r_ult2', "필살검무'첨", { echoCap: 2, echoW: 220, open: 'k_r_amsal', mech: 'sweep', main: 'k_r_ult2', mainSize: 240, hit: 'h_ml_cross', hitScale: 0.5, steps: 6, boss: 'r_amsal', k: 1.3,
      desc: '필살검무의 극의. 검기의 벽이 화면을 가로지르며 지나는 몬스터를 모두 벤다' }),
    ult('rogue', 'r_gale', '질풍난무', { cine9: 0.75, cutin: 'o_r_ult9', echoN: 28, openW: 0.6, echoCap: 2, finCap: 3, open: 'k_r_gale', mech: 'chain', main: 'new_r_storm', shot: 'h_ml_cross', markScale: 1.3, gap: 0.04, boss: 'r_pilgeom', k: 1.5 }),
  ],
  mage: [
    ult('mage', 'm_ult', '헬파이어', { mech: 'meteor', main: 'k_m_ult', mainSize: 220, hit: 'k_x_m_ult_hit', n: 5, shield: 5, boss: 'm_seongryeo', k: 1 }),
    ult('mage', 'm_hell2', "헬파이어'첨", { echoCap: 2.5, mech: 'cross', main: 'k_m_hell2', mainSize: 120, hit: 'h_hit_fire', len: 4, diag: true, shield: 5, boss: 'm_cheonggi', k: 1.15,
      desc: '헬파이어의 극의. 여덟 갈래로 뻗는 불기둥이 화면을 가르고, 남은 몬스터에게 불길이 번진다' }),
    ult('mage', 'm_fire3', '폭류유성', { mech: 'rain', main: 'k_m_fire3', frac: 0.95, drop: 'k_u_m_meteor', dropSize: 170, hit: 'h_hit_fire', span: 1.6, shield: 5, boss: 'm_jiokchak', k: 1.3 }),
    ult('mage', 'm_kalpa', '겁화', { cine9: 0.75, cutin: 'o_m_ult9', open: 'k_m_cross', echo: 'k_m_hyeongsang', fin: 'k_m_hyeongsang', mech: 'rings', main: 'new_raid_fire', mainSize: 240, hit: 'h_hit_fire', shield: 6, boss: 'm_cross', k: 1.5 }),
  ],
  poet: [
    ult('poet', 'p_ult', '태양의희원', { iconFx: '124', mech: 'sanctuary', cast: 'k_p_ult', main: 'k_u_p_pillar_o', hit: 'h_hit_light', guard: 3, boss: 'p_jiroe', k: 1 }),
    ult('poet', 'p_break', '귀염추혼소', { iconFx: '120', mech: 'mark', cast: 'new_p_break', frac: 0.8, main: '120', markScale: 1.3, hit: 'k_u_p_sparkle', delay: 1.0, heal: 0.3, boss: 'p_noejeon', k: 1.15 }),
    ult('poet', 'p_daejijin', '대지진', { mech: 'rings', main: 'k_p_daejijin', mainSize: 300, hit: 'k_p_quake', heal: 0.3, boss: 'p_geomok', k: 1.3 }),
    ult('poet', 'p_taiji', '태극팔괘진', { cine9: 0.75, cutin: 'o_p_ult9', echoN: 28, echoCap: 2.5, openW: 0.5, echoW: 200, aura: 'k_u_p_sparkle', mech: 'totem', main: 'k_p_taiji', mainScale: 1.2, drop: 'k_u_p_pillar_b', dropSize: 160, hit: 'h_hit_light', n: 4, life: 2.4, heal: 0.4, guard: 2, boss: 'p_bonghwang', k: 1.5 }),
  ],
  archer: [
    ult('archer', 'a_ult', '일환탄시', { mech: 'barrage', cast: 'k_a_ult', castSize: 200, shot: 'k_u_a_whip', shotScale: 2.4, hit: 'k_a_shot', n: 3, boss: 'a_aim', k: 1 }),
    ult('archer', 'a_allwhirl', '폭풍화우', { openCap: 2.5, echoW: 170, openW: 0.55, mech: 'vortex', main: 'k_a_allwhirl', burst: 'k_u_a_tornado', burstSize: 300, hit: 'h_hit_attack', hold: 1.2, boss: 'a_bomb', k: 1.15 }),
    ult('archer', 'a_eagle', '독수리소환', { open: 'k_a_eagle', openW: 0.8, openCap: 4.5, echoN: 20, echoW: 300, echoCap: 3.5, aura: 'k_a_eagle', auraW: 220, mech: 'totem', main: 'k_x_a_eagle_cast', mainScale: 4.6, lift: 90, cast: 'k_u_a_hawk', drop: 'k_a_eagle', dropSize: 150, hit: 'k_u_a_hawk', n: 5, life: 2.6, boss: 'a_breakair', k: 1.3 }),
    ult('archer', 'a_mansi', '만시창공', { cine9: 0.75, cutin: 'o_a_ult9', guard: 3, desc: '궁사의 날렵한 손놀림으로 하늘을 뒤덮는 무수한 화살비를 쏟아 화면의 모든 몬스터에게 매우 큰 피해를 주고, 잠시 어떤 공격도 받지 않는다', auraW: 360, echoN: 28, echoCap: 2.5, aura: 'k_a_tuhyeol4', echo2: 'k_a_chase', echo: 'k_a_blood5', mech: 'mark', main: 'k_u_a_r5cast', markScale: 1.2, hit: 'k_a_blood5', delay: 1.2, boss: 'a_chase', k: 1.5, hpCost: 0.15 }),
  ],
  lancer: [
    ult('lancer', 'l_ult', '백월난격', { mech: 'cross', cast: 'k_l_ult', castSize: 220, main: 'k_u_l_moonbeam', mainSize: 150, hit: 'h_ml_thrust', hitScale: 0.6, len: 4, diag: true, boss: 'l_meteor', k: 1 }),
    ult('lancer', 'l_genesis', '천지개벽', { mech: 'rain', main: 'k_l_genesis', frac: 0.75, drop: 'k_u_l_pillar', dropSize: 170, hit: 'k_u_l_bolt', boss: 'l_rush', k: 1.15 }),
    ult('lancer', 'l_dragon', '맹룡승천', { echoN: 22, echoCap: 2, open: 'k_l_annihil', echo: 'k_u_l_dragonhead', echoW: 220, aura: 'k_l_annihil', mech: 'meteor', main: 'k_l_dragon', mainSize: 330, hit: 'k_u_l_dragonhead', hitScale: 0.6, n: 5, gap: 0.25, boss: 'l_annihil', k: 1.3 }),
    ult('lancer', 'l_rage9', '청룡의격노', { cine9: 0.75, guard: 3, cutin: 'o_l_ult9', desc: '내면의 살기를 불러일으켜 화면의 모든 몬스터에게 매우 큰 피해를 주고, 잠시 어떤 공격도 받지 않는다 (원작 살수의 궁극)', openW: 0.65, openCap: 3, echoN: 30, echo2: 'k_l_spiral', aura: 'k_l_halfmoon', mech: 'sweep', main: 'k_l_moonfull', mainSize: 200, hit: 'h_ml_spark', steps: 7, boss: 'l_javelin', k: 1.5 }),
  ],
  monk: [
    ult('monk', 'mk_ult', '필살권무', { mech: 'dash', main: 'k_mk_ult', mainSize: 190, hit: 'k_u_mk_bodyhit', hitScale: 0.7, n: 8, boss: 'mk_sudden', k: 1 }),
    ult('monk', 'mk_buddha', '여래신장', { mech: 'rain', main: 'k_mk_buddha', frac: 0.9, drop: 'k_u_mk_palm', dropSize: 150, hit: 'k_mk_bung', boss: 'mk_uppercut', k: 1.15 }),
    ult('monk', 'mk_rupture', '천지파열', { echoN: 28, echo2: 'k_mk_quake', aura: 'k_mk_rupture', mech: 'rings', main: 'k_x_mk_rupture_cast', mainSize: 260, hit: 'k_x_mk_rupture_hit', after: 'k_mk_rupture', boss: 'mk_muhan', k: 1.3 }),
    ult('monk', 'mk_nakhwa', '낙화유영', { cine9: 0.75, cutin: 'o_mk_ult9', desc: '흑화랑의 고귀함과 냉혹함이 공존하는 경계에서 흩날리는 꽃잎의 소용돌이로 화면의 모든 몬스터에게 매우 큰 피해를 주고, 잠시 어떤 공격도 받지 않는다', guard: 3, openCap: 3.5, echoCap: 2, echoW: 240, fin: 'k_mk_aventhit', mech: 'totem', main: 'k_mk_advent', mainScale: 1.5, lift: 50, drop: 'k_u_mk_aventhit', dropSize: 180, hit: 'k_mk_aventhit', n: 5, life: 2.6, boss: 'mk_kyokushin', k: 1.5 }),
  ],
  magus: [
    ult('magus', 'md_ult', '광폭구회격', { mech: 'barrage', cast: 'k_md_ult', castSize: 220, shot: 'k_u_md_orb', hit: 'k_u_md_storm', n: 3, darken: 0.9, boss: 'md_arrow', k: 1 }),
    ult('magus', 'md_exfrenzy', '광폭멸천강', { mech: 'meteor', main: 'k_md_exfrenzy', mainSize: 240, hit: 'k_u_md_storm', after: 'k_u_md_decay', n: 5, darken: 1, boss: 'md_bust', k: 1.15 }),
    ult('magus', 'md_bloodbat', '혈마광폭열파', { echoW: 190, aura: 'k_md_sphere', echo2: 'k_u_md_storm', mech: 'sweep', main: 'k_md_bloodbat', mainSize: 200, hit: 'k_u_md_decay', steps: 6, darken: 1, boss: 'md_ffire', k: 1.3 }),
    ult('magus', 'md_bijeon', '비전방진', { cine9: 0.75, cutin: 'o_md_ult9', guard: 3, desc: '마도사의 신비로운 비술로 화면의 모든 적에게 극한의 피해를 입히고, 잠시 어떤 공격도 받지 않는다', echoN: 26, echoW: 200, open: 'k_md_wavefrenzy', fin: 'k_md_bust', mech: 'rings', cast: 'k_u_md_wing', main: 'k_md_wavefrenzy', mainSize: 280, hit: 'k_u_md_storm', darken: 1.1, boss: 'md_ray', k: 1.5 }),
  ],
  celestial: [
    ult('celestial', 'cl_ult', '전의상실', { mech: 'mark', cast: 'k_cl_ult', frac: 0.6, main: 'k_u_cl_loss', hit: 'k_u_cl_losshit', stun: 0.8, delay: 1.0, boss: 'cl_moment', k: 1 }),
    ult('celestial', 'cl_thunder', '뇌격룡', { auraW: 150, mech: 'chain', cast: 'k_u_cl_dragon', castStages: false, frac: 0.95, main: 'k_x_cl_thunder_2', markScale: 0.5, shot: 'h_hit_light', stun: 0.4, boss: 'cl_acumen', k: 1.15 }),
    ult('celestial', 'cl_tiger', '범아귀', { echoN: 18, echoCap: 1.8, aura: 'k_cl_claw', openW: 0.45, echo2: 'k_cl_slam', auraW: 220, echoW: 230, open: 'k_cl_tiger', mech: 'dash', cast: 'k_u_cl_speed', castSize: 150, main: 'k_cl_tiger', mainSize: 170, hit: 'h_hit_tiger', n: 8, boss: 'cl_ego', k: 1.3 }),
    ult('celestial', 'cl_cheonbyeon', '천변지이', { cine9: 0.75, cutin: 'o_cl_ult9', desc: '천인의 경이로운 힘으로 하늘과 땅의 거대한 이변을 일으켜 화면의 모든 몬스터에게 매우 큰 피해를 주고, 잠시 어떤 공격도 받지 않는다', echoN: 34, openCap: 4, echoCap: 2, aura: 'k_cl_bind', openW: 0.65, fin: 'k_cl_ego', mech: 'totem', main: 'k_cl_reindeer', mainScale: 3.2, lift: 70, hit: 'h_hit_tiger', n: 5, life: 2.6, boss: 'cl_shatter', k: 1.5 }),
  ],
  dokkaebi: [
    ult('dokkaebi', 'dk_ult', '금나와라,뚝딱', { mech: 'rain', cast: 'k_dk_ult', castSize: 200, drop: 'k_u_dk_gold', dropSize: 110, hit: 'k_dk_goldhit', boss: 'dk_punish', k: 1 }),
    ult('dokkaebi', 'dk_super', "일격필살'괴력난신", { mech: 'execute', main: 'k_dk_super', mainSize: 340, hit: 'h_ml_burst', hitScale: 0.5, n: 3, boss: 'dk_judgment', k: 1.15 }),
    ult('dokkaebi', 'dk_storm', '도깨비폭풍', { openW: 0.5, echoW: 220, mech: 'vortex', main: 'k_dk_storm', burst: 'k_dk_storm', burstSize: 320, hit: 'h_hit_fire', hold: 1.2, boss: 'dk_hamstring', k: 1.3 }),
    ult('dokkaebi', 'dk_akgwi', '악귀출몰', { cine9: 0.75, cutin: 'o_dk_ult9', guard: 3, desc: '흐트러진 혼을 불러모아 화면의 모든 몬스터에게 매우 큰 피해를 주고, 잠시 어떤 공격도 받지 않는다 (원작 영술사의 궁극)', aura: 'k_dk_judgment', mech: 'rings', main: 'k_dk_rage', mainSize: 300, hit: 'h_hit_fire', boss: 'dk_nemesis', k: 1.5 }),
  ],
  reaper: [
    ult('reaper', 'rp_ult', '차사강림', { mech: 'cleaveWave', main: 'k_rp_ult', mainSize: 260, hit: 'k_rp_cut', hitScale: 0.6, after: 'k_u_rp_ring', boss: 'rp_flash', k: 1 }),
    ult('reaper', 'rp_madness', '나선광륜', { echo2: 'k_rp_spiral', auraW: 320, echoCap: 2, aura: 'k_rp_asura', mech: 'rings', main: 'k_rp_madness', mainSize: 260, hit: 'h_ml_slash', boss: 'rp_asura', k: 1.15 }),
    ult('reaper', 'rp_deadly', '살극', { echo2: 'k_rp_wind', aura: 'k_rp_crush', auraW: 220, open: 'k_rp_arrow', openW: 0.5, echoW: 220, mech: 'mark', main: 'k_rp_deadly', markScale: 1.4, hit: 'h_ml_wind', hitScale: 0.4, delay: 1.2, boss: 'rp_arrow', k: 1.3 }),
    ult('reaper', 'rp_myeonggye', '명계의회랑', { cine9: 0.75, cutin: 'o_rp_ult9', desc: '생과 사를 오가는 순간과 마주한 공포로 화면의 모든 몬스터에게 매우 큰 피해를 주고, 잠시 어떤 공격도 받지 않는다', aura: 'k_x_rp_burst_cast', auraW: 260, echoN: 28, echoCap: 2.5, echoW: 200, fin: 'k_rp_gate', mech: 'vortex', main: 'k_rp_gate', cast: 'k_u_rp_redeem', burst: 'k_rp_gate', burstSize: 340, hit: 'h_ml_wind', hitScale: 0.4, hold: 1.3, boss: 'rp_burst', k: 1.5 }),
  ],
};

// 승급 효과: each 승급 makes the class a little stronger for good (피해 +4%, 체력 +8 a step).
export const PROMO_BONUS = { dmg: 0.04, hp: 8 };

export const PROMO_AT = ['rat', 'deer', 'haunt', 'goblin', 'yogoe', 'royal', 'musin', 'kirin', 'tagye'];
export const PROMOS = Object.fromEntries(CLASSES.map(c => c.id).map(c => [c, PROMO_AT.map(at => ({ at }))]));
// The 승급 titles of 바람의나라 연 (Strings Job_<n>_1..6), shown for its jobs' tiers; 7차~9차 keep the number.
export const PROMO_NAMES = { archer: ['명궁', '현궁', '진탄', '심안', '신궁', '천궁'], lancer: ['창객', '창제', '창황', '창성', '신창', '창극'], monk: ['권사', '권호', '권왕', '권제', '권신', '권극'], magus: ['마학사', '마현선', '마광사', '마진선', '마선사', '마천선'], celestial: ['천랑', '천무', '천군', '천위', '재천', '천신'], dokkaebi: ['귀명', '귀제', '귀황', '귀성', '신각', '귀극'], reaper: ['사자', '사명자', '사저', '천명사', '월직', '일직'] };

// Passive upgrades, named after the stats and spells of the game. item: icon (manifest items).
export const PASSIVES = {
  life: { name: '체력 단련', item: 'p_life', max: 5, desc: '최대 체력 +20' },
  power: { name: '힘', item: 'p_power', max: 5, desc: '모든 피해 +10%' },
  haste: { name: '지력', item: 'p_haste', max: 5, desc: '기술 재사용 대기 -8%' },
  speed: { name: '민첩', item: 'p_speed', max: 5, desc: '이동 속도 +8%' },
  area: { name: '공력', item: 'p_area', max: 5, desc: '마법이 닿는 거리와 범위가 늘어난다' },
  magnet: { name: '노획', item: 'magnet', max: 5, desc: '떨어진 돈과 물건을 더 멀리서 줍는다' },
  armor: { name: '무장', item: 'p_armor', max: 5, desc: '방어 +2 (받는 피해가 줄어듭니다)' },
  mana: { name: '공력증강', item: 'potion', max: 5, desc: '마력 회복 +25%' },
};

// The four 신수 of 신수마법: the site draws every element alike at each grade, so cards name it.
export const ELEMENTS = { fire: ['불', '#c8401a'], earth: ['땅', '#8a6a2a'], water: ['물', '#1a5ab0'], thunder: ['풍뢰', '#6a3ab0'] };

// Twelve slots on the HUD: three rows of four (a build saved with eight or fewer loads as it was).
export const MAX_SKILLS = 12;
export const MAX_PASSIVES = 6;
export const MAX_SKILL_LEVEL = 8;
export const MAX_PASSIVE_LEVEL = 5;

// Hunting grounds, in the order a new character works through them. monsters: image ids,
// or pages: hunting-ground page numbers from the image download. lv: the level range players
// hunted there. terrain: how the ground is drawn (game.js).
// bgm: the tune for the ground: official OST tracks from baram.nexon.com/MultiMedia/Music (see README).
// A boss or leader with was: it wore the old client's few-frame picture (was, the old id) and now
// walks, strikes and falls as a 연 unit (id y<unit>: its namesake in 연, or the nearest by name and
// kind; tools/yeon_grounds.json "bosses"). Its life still comes from the old picture's size.
export const STAGES = [
  { id: 'novice', bgm: 'nx_08_1_Buyeo', name: '왕초보사냥터', lv: '1~6', terrain: 'field', map: 'gungnae', at: [0.19, 0.8],
    monsters: ['1001', '1002', '1003', '1004'], mini: { id: '1002', name: '왕토끼', scale: 1.7 },
    boss: { id: '1003', name: '사슴왕', scale: 1.8 },
    intro: '다람쥐와 토끼가 뛰노는 첫 사냥터' },
  { id: 'rat', bgm: 'nx_13_Underground_prison', name: '쥐굴', lv: '6~16', terrain: 'cave', map: 'gungnae', at: [0.2, 0.535],
    monsters: ['1005', '1007', '1008', '1009', '1010', '1011', '1012', '1013'],
    mini: { id: '1015', name: '흡혈박쥐' }, boss: { id: 'y111021', was: '1014', name: '서생원', scale: 2.4 },
    intro: '쥐와 박쥐가 우글거리는 굴' },
  { id: 'snake', bgm: 'nx_14_Underground_prison2', name: '뱀굴', lv: '17~20', terrain: 'cave', map: 'gungnae', at: [0.25, 0.535],
    monsters: ['1016', '1018', '1019', '1020', '1021', '12016', '12017'],
    mini: { id: 'y111027', was: '12013', name: '구렁이', scale: 2.4 }, boss: { id: 'y111028', was: '12014', name: '왕구렁이', scale: 2.4 },
    intro: '쥐굴 끝자락과 이어진 뱀들의 소굴' },
  { id: 'deer', bgm: 'nx_12_Baekje_hanseong', name: '사슴굴', lv: '20~40', terrain: 'cave', map: 'gungnae', at: [0.68, 0.17],
    monsters: ['1028', '1029', '1030', '1031', '1003', '1004'], boss: { id: '1032', name: '광록지수', scale: 1.7 },
    intro: '청순록, 적순록, 흑광록, 백광록이 사는 굴' },
  { id: 'pig', bgm: 'nx_28_Barren_plateau', name: '돼지굴', lv: '20~50', terrain: 'cave', map: 'gungnae', at: [0.935, 0.595],
    monsters: ['12020', '12021', '12022', '12023'], mini: { id: 'y304630', was: '12025', name: '돼지 장수', scale: 1.7 },
    boss: { id: 'y111041', was: '12024', name: '홍돼지', scale: 2.4 }, intro: '산돼지와 숲돼지가 먼저 덤벼드는 굴' },
  { id: 'bear', bgm: 'nx_01_Mt_D2', name: '곰·호랑이굴', lv: '20~40', terrain: 'cave', map: 'gungnae', at: [0.935, 0.345],
    monsters: ['1022', '1023', '1027'], boss: { id: 'y111037', was: '1025', name: '진웅', scale: 1.8 },
    intro: '곰과 호랑이가 지키는 깊은 굴' },
  { id: 'fox', bgm: 'nx_21_Pray_for_family', name: '여우굴', lv: '30~45', terrain: 'cave', map: 'gungnae', at: [0.065, 0.79],
    monsters: ['1036', '1037', '1038', '1039'], mini: { id: 'y400800', was: '1041', name: '불구미호', scale: 1.4 },
    boss: { id: 'y400270', was: '1040', name: '구미호', scale: 1.2 }, intro: '꼬리 아홉 달린 여우가 숨어 사는 굴' },
  { id: 'haunt', bgm: 'bs_haunt', name: '흉가', lv: '99', terrain: 'house', map: 'gungnae', at: [0.125, 0.305], ease: 0.7,
    monsters: ['7010', '7012', '7006', '7009', '6066', '6067', '6068'], mini: { id: 'y305021', was: '7006', name: '수호불귀신', scale: 1.5 },
    boss: { id: 'y305022', was: '7007', name: '수호유령전사', scale: 2.4 }, intro: '원혼이 떠도는 버려진 집. 일반성의 마지막 사냥터' },
  { id: 'goblin', bgm: 'nx_22_Burning_the_angry', name: '도깨비굴', lv: '80~99', terrain: 'cave', map: 'gungnae', at: [0.18, 0.085],
    monsters: ['6021', '6022', '6023', '6024', '6025', '6026', '2028', '2029', '2030'], mini: { id: 'y303201', was: '2029', name: '적산소괴', scale: 1.3 },
    boss: { id: 'y303208', was: '8017', name: '도깨비대장', scale: 1.4 }, intro: '도깨비들이 방망이를 휘두르는 굴' },
  { id: 'bandit', bgm: 'bs_bandit', name: '산적굴', lv: '90~99', terrain: 'cave', map: 'gungnae', at: [0.03, 0.475],
    monsters: ['2002', '2003', '8055', '2005', '2006', '2007', '2008'], mini: { id: 'y310045', was: '8055', name: '선비대도독', scale: 2.0 },
    boss: { id: 'y610014', was: '8056', name: '선비대군장', scale: 1.5 }, intro: '도적질하는 산적 무리의 소굴' },
  { id: 'japan', bgm: 'bs_japan', name: '일본', lv: '99+', terrain: 'field2', map: 'world_1', at: [0.78, 0.48],
    monsters: ['6003', '6009', '6010', '6011', '6013', '6015', '6016', '6028', '6029', '6030', '6031', '6032', '6033', '6042',
      '6043', '6044', '6045', '6046', '6047', '6048', '6049', '6050', '6051', '6052', '6053', '6054', '6055', '6056',
      '6057', '6058', '6059', '6060', '6063', '6064', '6065', '6034', '6035'],
    mini: { id: 'y608012', was: '6059', name: '유성지', scale: 1.9 }, boss: { id: '6041', name: '에주겐', scale: 1.3 }, intro: '바다 건너 낯선 땅의 무사와 요괴들' },
  { id: 'sea', bgm: 'nx_03_Underwater', name: '바닷속', lv: '99+', terrain: 'sea', map: 'world_1', at: [0.85, 0.7],
    monsters: ['11028', '11015', '11016', '3025', '11004', '3023', '3016', '3022', '11018', '3020', '3019', '11010', '11002', '11003', '11022', '11001', '11023', '3021', '3015', '3018', '11008', '3028', '3024', '3026', '3027'],
    intro: '거대한 게와 오징어가 사는 바다 밑' },
  { id: 'island', bgm: 'bs_island', name: '환상의 섬', lv: '99+', terrain: 'island', map: 'world_4', at: [0.3, 0.55],
    monsters: ['5017', '5005', '5006', '5007', '5015', '5009', '5001', '5003', '5002', '5021', '5016', '5013', '5022', '5050', '5048', '5020', '5014', '5010', '5012', '5049', '5023', '5008', '5011'],
    intro: '원시 부족과 괴물이 사는 남쪽 섬' },
  { id: 'volcano', bgm: 'nx_26_Glowing_Ash', name: '환상의 섬 화산', lv: '99+', terrain: 'lava', map: 'world_4', at: [0.68, 0.18],
    pages: [1703, 1704, 1707], intro: '불의 정령이 들끓는 화산' },
  // Added grounds: each opens when its 'open' ground is conquered, and is as strong as 'level'
  // (the first fourteen are as strong as their place, 0 to 13).
  { id: 'rabbit', bgm: 'nx_09_Brand_new_life', name: '토끼굴', lv: '5~10', terrain: 'cave', map: 'gungnae', at: [0.47, 0.66],
    level: 1, open: 'novice', monsters: ['12065', '12066', '12068', '12069', '12070', '1002'], boss: { id: 'y304626', was: '12070', name: '토끼 대왕', scale: 2.3 },
    intro: '알록달록한 토끼들이 모여 사는 굴' },
  { id: 'bigsnake', bgm: 'nx_16_Coast_dungeon', name: '대뱀굴', lv: '18~25', terrain: 'cave', map: 'gungnae', at: [0.22, 0.56],
    level: 3, open: 'snake', monsters: ['12098', '12099', '12100', '12101', '12102', '12103', '12104', '12105', '12109'], boss: { id: 'y612006', was: '12108', name: '이무기', scale: 2.4 },
    intro: '뱀굴 아래로 이어진 큰 뱀들의 소굴' },
  { id: 'bearman', bgm: 'nx_34_Wind_of_land', name: '곰인굴', lv: '35~45', terrain: 'cave', map: 'gungnae', at: [0.9, 0.38],
    level: 6, open: 'bear', monsters: ['12047', '12048', '1022', '1023', '1027'], boss: { id: '12049', name: '곰인 족장', scale: 1.3 },
    intro: '곰·호랑이굴 깊은 곳, 사람처럼 서서 걷는 곰들' },
  { id: 'mantis', bgm: 'nx_29_Contaminated_meadow', name: '사마귀굴', lv: '50', terrain: 'cave', map: 'gungnae', at: [0.47, 0.26],
    level: 7, open: 'fox', pages: [308], boss: { id: 'y700050', was: '12038', name: '사마귀 장수', scale: 1.4 },
    intro: '사마귀 무사들이 지키는 굴' },
  { id: 'skull', bgm: 'nx_32_An_ancient_ghost', name: '해골굴', lv: '60', terrain: 'cave', map: 'gungnae', at: [0.68, 0.1],
    level: 8, open: 'haunt', monsters: ['6005', '6066', '6067', '6068', '3073'], boss: { id: 'y608013', was: '3070', name: '해골왕', scale: 1.6 },
    mini: { id: 'y314021', was: '3073', name: '저승사자', scale: 1.6 }, intro: '죽어서도 쉬지 못한 해골들이 떠도는 굴' },
  { id: 'steppe', bgm: 'bs_steppe', name: '북방대초원', lv: '70~80', terrain: 'field', map: 'world_1', at: [0.36, 0.1],
    level: 9, open: 'goblin', pages: [806, 807], boss: { id: 'y612002', was: '8042', name: '초원의 주인', scale: 1.9 },
    intro: '바람이 쉬지 않는 북쪽 끝의 초원. 낯선 짐승들이 무리 지어 다닌다' },
  { id: 'yogoe', bgm: 'nx_23_Burning_the_passion', name: '요괴굴', lv: '90~99', terrain: 'cave', map: 'world_1', at: [0.6, 0.58],
    level: 11, open: 'bandit', pages: [902, 904, 906, 907], boss: { id: 'y606005', was: '2031', name: '요괴왕', scale: 1.5 },
    intro: '불길 속에서 요괴들이 들끓는 굴' },
  { id: 'palace', bgm: 'bs_palace', name: '용궁', lv: '99+', terrain: 'sea', map: 'world_1', at: [0.88, 0.8],
    level: 12, open: 'sea', pages: [313], boss: { id: '12064', name: '용궁 장수', scale: 1.1 },
    intro: '바닷속 더 깊은 곳, 용과 수병들이 지키는 궁' },
  { id: 'royal', bgm: 'nx_07_The_great_Wall', name: '왕궁', lv: '99+', terrain: 'house', map: 'gungnae', at: [0.47, 0.47],
    level: 13, open: 'island', pages: [1102, 1103, 1104, 504], boss: { id: '10006', name: '왕궁의 요괴', scale: 1.2 },
    intro: '국내성 한가운데 왕궁. 밤이면 요괴와 반역 무사들이 나타난다' },
  // 대격변: today's client's lands beyond the old map, where the legendary sets' materials fall
  // (금린 in 중국, 순수의 강철 in 일본, 조화의 정수 under the sea, 거마족의 영혼석 in 타계).
  { id: 'hwagwa', v2: true, bgm: 'nx_05_China', name: '화과산', lv: '99+', terrain: 'field', map: 'world_1', at: [0.14, 0.36],
    level: 14, open: 'royal', monsters: ['12026', '12027', '12029', '12033', '12040', '12041', '12042'],
    mini: { id: 'y304632', was: '12030', name: '원숭이 장수', scale: 1.2 }, boss: { id: 'y615013', was: '12046', name: '우마왕', scale: 1.6 },
    intro: '중국 서쪽의 꽃과 열매의 산. 원숭이 무리와 돼지 장수들이 산을 지킨다' },
  { id: 'murim', v2: true, bgm: 'bs_shaolin', name: '무림 수련장', lv: '99+', terrain: 'house', map: 'world_1', at: [0.24, 0.62],
    level: 14, open: 'royal', monsters: ['9014', '9015', '9016', '9017', '9019', '9007', '9008', '9010'],
    mini: { id: 'y307376', was: '9011', name: '철권 사범', scale: 1.9 }, boss: { id: '9018', name: '무림 고수', scale: 1.4 },
    intro: '깊은 산사 아래 수련장. 승려와 무도가들이 손님을 시험한다' },
  { id: 'musin', v2: true, bgm: 'nx_25_Memory_of_sword', name: '무신의 탑', lv: '99+', terrain: 'house', map: 'world_1', at: [0.83, 0.38],
    level: 15, open: 'hwagwa', monsters: ['4001', '4002', '4021', '4022', '4031', '4032', '4003', '4004'],
    mini: { id: 'y608011', was: '4005', name: '낭인 검객', scale: 1.3 }, boss: { id: 'y600019', was: '4006', name: '무신', scale: 1.2 },
    intro: '일본 무사들이 칼을 겨루는 탑. 꼭대기에 무신이 산다' },
  { id: 'deepsea', v2: true, bgm: 'bs_octopus', name: '해저동굴', lv: '99+', terrain: 'sea', map: 'world_1', at: [0.74, 0.86],
    level: 15, open: 'palace', monsters: ['3019', '3020', '3022', '3023', '3025', '3016', '3015'],
    mini: { id: 'y610001', was: '3021', name: '인어 여왕', scale: 1.4 }, boss: { id: 'y609003', was: '3027', name: '대왕오징어', scale: 1.3 },
    intro: '용궁보다 깊은 바다 밑 동굴. 인어와 해파리, 거대한 오징어가 산다' },
  { id: 'kirin', v2: true, bgm: 'nx_20_Gold_water', name: '기린산', lv: '99+', terrain: 'field2', map: 'world_1', at: [0.12, 0.14],
    level: 16, open: 'musin', monsters: ['2019', '2020', '2021', '2022', '2023', '2032', '2033', '2034', '2035', '2036'],
    mini: { id: 'y304624', was: '2024', name: '청기린', scale: 1.1 }, boss: { id: 'y550051', was: '2037', name: '천마', scale: 1.2 },
    intro: '구름 위에 솟은 산. 기린과 날개 달린 짐승들이 하늘을 달린다' },
  { id: 'tagye', v2: true, bgm: 'nx_30_Fog_Zone', name: '타계 마령굴', lv: '99+', terrain: 'cave', map: 'world_1', at: [0.46, 0.3],
    level: 17, open: 'deepsea', monsters: ['3066', '3067', '3068', '3062', '3063', '3069', '3078', '3079'],
    mini: { id: '3075', name: '마령 장수', scale: 1.0 }, boss: { id: '3074', name: '고대마령', scale: 1.2 },
    intro: '이 세상 밖, 안개 너머의 굴. 거마족의 혼과 고대의 마령이 깨어 있다' },
  // 바람의나라 연's own hunting maps (tools/yeon_grounds.py, tools/yeon_grounds.json): each ground
  // walks on its 연 map's floor among its props (terrain y_<id>), spawns the units 연's map spawns
  // (y<unit id>: 연's own sprites, no old picture), its 연 field boss, and plays the map's music.
  // lv is 연's proper level for the map. v3: they come after the 대격변 places in the specials'
  // order (items.js), so no older special changes its option. big: the area a monster of the
  // crowd may have (연's big ones, werewolves and tree spirits, walk with the rest).
  { id: 'wolf', v3: true, bgm: 'bgm_00000112_48', name: '늑대인간의 굴', lv: '400', terrain: 'y_wolf', map: 'world_1', at: [0.87, 0.64],
    level: 10, open: 'japan', big: 9000, monsters: ['y308101', 'y308212', 'y308213', 'y308102', 'y308215', 'y308216'],
    mini: { id: 'y308217', name: '수화늑대인간(환귀)', scale: 1.1 }, boss: { id: 'y608018', name: '만월늑대인간', scale: 1.6 },
    intro: '표신궁 아래 용암 사이의 굴. 사람의 탈을 쓴 늑대인간들이 보름달을 기다린다' },
  { id: 'reef', v3: true, bgm: 'BGM_YongGung_ScreamReef_48', name: '암초지대', lv: '484', terrain: 'y_reef', map: 'world_1', at: [0.9, 0.79],
    level: 11, open: 'sea', monsters: ['y309053', 'y309054', 'y309055', 'y309056', 'y309057', 'y309058'],
    mini: { id: 'y609019', name: '타락술사', scale: 1.3 }, boss: { id: 'y609018', name: '저주의해골', scale: 1.4 },
    intro: '용궁 너머 배들이 부서진 암초. 물에 잠긴 망령 해골들이 칼과 창, 폭탄을 든다' },
  { id: 'wreck', v3: true, bgm: 'BGM_YongGung_Wreck_48', name: '난파선', lv: '496', terrain: 'y_wreck', map: 'world_1', at: [0.67, 0.92],
    level: 12, open: 'reef', monsters: ['y309059', 'y309060', 'y309061', 'y309062', 'y309063', 'y309064'],
    mini: { id: 'y609020', name: '원혼의암승', scale: 1.4 }, boss: { id: 'y609021', name: '원혼의비', scale: 2 },
    intro: '가라앉은 배의 갑판. 북방과 중원에서 온 원혼들이 아직 배를 지킨다' },
  { id: 'greatwall', v3: true, bgm: 'BGM_China_GreatWallMine_48', name: '장성 갱도', lv: '537~545', terrain: 'y_greatwall', map: 'world_1', at: [0.44, 0.23],
    level: 12, open: 'yogoe', monsters: ['y310030', 'y310031', 'y310032', 'y310033', 'y310034', 'y310035', 'y310036', 'y310037', 'y310038'],
    mini: { id: 'y610012', name: '분노의혼령', scale: 1.4 }, boss: { id: 'y610013', name: '장성의혼령', scale: 1.5 },
    intro: '만리장성 아래 무너진 갱도. 성을 쌓다 죽은 이들의 혼령이 떠돈다' },
  { id: 'qin', v3: true, bgm: 'BGM_China_MysteriousRoyalTombMine_48', name: '진시황릉', lv: '550~561', terrain: 'y_qin', map: 'world_1', at: [0.34, 0.41],
    level: 13, open: 'greatwall', monsters: ['y310018', 'y310019', 'y310020', 'y310021', 'y310022', 'y310023', 'y310024', 'y310025', 'y310027', 'y310028'],
    mini: { id: 'y610008', name: '토우귀호', scale: 1.3 }, boss: { id: 'y610007', name: '귀갑병', scale: 1.6 },
    intro: '장안 땅 밑 시황제의 무덤. 흙으로 빚은 병사와 짐승, 귀기 서린 갑주가 깨어난다' },
  { id: 'gogyun', v3: true, bgm: 'bgm_00000144_48', name: '고균도 열대림', lv: '565', terrain: 'y_gogyun', map: 'world_4', at: [0.55, 0.62],
    level: 12, open: 'island', monsters: ['y311001', 'y311002', 'y311003', 'y311004', 'y311005', 'y311006', 'y311007'],
    mini: { id: 'y611002', name: '고균도 진인랑', scale: 1.3 }, boss: { id: 'y611001', name: '고균도 저주의 추장', scale: 1.5 },
    intro: '환상의 섬 남쪽 고균도의 열대림. 저주받은 부족 전사와 걸어 다니는 인성초' },
  { id: 'spidercave', v3: true, bgm: 'bgm_00000154_48', name: '고균도 폐허동굴', lv: '565', terrain: 'y_spidercave', map: 'world_4', at: [0.4, 0.86],
    level: 13, open: 'gogyun', monsters: ['y311013', 'y311014', 'y311010', 'y311011', 'y311015', 'y311016'],
    mini: { id: 'y611005', name: '해변 철갑 거북', scale: 1.4 }, boss: { id: 'y611004', name: '고균도 진여왕지주', scale: 1.5 },
    intro: '무너진 신전 아래 동굴. 지주들이 거미줄을 치고 여왕을 지킨다' },
  { id: 'gareung', v3: true, bgm: 'bgm_00000145_48', name: '가릉도 유적', lv: '565', terrain: 'y_gareung', map: 'world_4', at: [0.2, 0.55],
    level: 14, open: 'spidercave', monsters: ['y311023', 'y311024', 'y311017', 'y311018', 'y311019', 'y311021', 'y311022'],
    mini: { id: 'y611007', name: '가릉도 진여왕지주', scale: 1.3 }, boss: { id: 'y611008', name: '가릉도 독사여왕', scale: 1.4 },
    intro: '이끼 낀 돌길의 옛 유적. 독사와 지주, 저주받은 부족이 함께 산다' },
  { id: 'pokyeom', v3: true, bgm: 'bgm_00000146_48', name: '폭염도 절벽', lv: '565', terrain: 'y_pokyeom', map: 'world_4', at: [0.5, 0.12],
    level: 15, open: 'gareung', monsters: ['y311029', 'y311030', 'y311031', 'y311032', 'y311033', 'y311034'],
    mini: { id: 'y611011', name: '폭염도 진인랑', scale: 1.3 }, boss: { id: 'y611012', name: '폭염도 독사여왕', scale: 1.4 },
    intro: '화산 곁 폭염도의 벼랑. 뜨거운 바위 위로 늑대 인랑과 독사가 몰려든다' },
  { id: 'baekdu', v3: true, bgm: 'bgm_00000156', name: '백두산 대각봉', lv: '625', terrain: 'y_baekdu', map: 'world_1', at: [0.8, 0.12],
    level: 14, open: 'royal', monsters: ['y312001', 'y312002', 'y312003', 'y312005', 'y312006', 'y312007', 'y312008', 'y312013', 'y312014', 'y312015', 'y312016'],
    mini: { id: 'y612004', name: '백두산 이리왕', scale: 1.7 }, boss: { id: 'y612001', name: '설담비', scale: 1.8 },
    intro: '백두산 기슭의 첫 봉우리. 담비와 노루, 이리 떼가 풀숲을 누빈다' },
  { id: 'baekdu2', v3: true, bgm: 'bgm_00000105_48', name: '백두산 대연지봉', lv: '625', terrain: 'y_baekdu2', map: 'world_1', at: [0.88, 0.22],
    level: 15, open: 'baekdu', big: 5600, monsters: ['y312009', 'y312010', 'y312011', 'y312012', 'y312017', 'y312018', 'y312019', 'y312020', 'y312021', 'y312022', 'y312023', 'y312024'],
    mini: { id: 'y612005', name: '백두 흑표범', scale: 1.6 }, boss: { id: 'y612003', name: '백두 요괴목', scale: 1.5 },
    intro: '눈 덮인 봉우리의 숲. 요괴 나무와 그루터기가 걷고, 표범과 살모사가 숨어 있다' },
  { id: 'baekdu3', v3: true, bgm: 'bgm_00000155', name: '백두산 망천후', lv: '625', terrain: 'y_baekdu3', map: 'world_1', at: [0.88, 0.32],
    level: 16, open: 'baekdu2', monsters: ['y312025', 'y312026', 'y312027', 'y312028', 'y312029', 'y312030', 'y312031', 'y312032', 'y312033', 'y312034', 'y312035'],
    mini: { id: 'y612007', name: '백두 요괴웅', scale: 1.5 }, boss: { id: 'y612008', name: '기룡', scale: 1.3 },
    intro: '천지를 내려다보는 눈의 봉우리. 곰과 올빼미, 원앙 요괴 위로 기룡이 내려온다' },
  { id: 'baekdu4', v3: true, bgm: 'bgm_00000124_48', name: '백두폭포동굴', lv: '650', terrain: 'y_baekdu4', map: 'world_1', at: [0.9, 0.42],
    level: 17, open: 'baekdu3', big: 5600, monsters: ['y312036', 'y312037', 'y312038', 'y312039', 'y312040', 'y312041', 'y312042', 'y312043', 'y312044'],
    mini: { id: 'y612013', name: '암흑룡인', scale: 1.3 }, boss: { id: 'y612012', name: '백두선인', scale: 1.4 },
    intro: '백두대간 폭포 뒤의 동굴. 날개 달린 역자룡과 요괴 수목 너머에 선인이 있다' },
  // 지옥 (연's own name for the region, Map_414001): its four hells on the 지옥 tab, past 타계.
  { id: 'hwatang', v3: true, bgm: 'bgm_00000128_48', name: '화탕지옥', lv: '710', terrain: 'y_hwatang', map: 'hell', at: [0.27, 0.45],
    level: 18, open: 'tagye', monsters: ['y314001', 'y314002', 'y314003'],
    mini: { id: 'y615010', name: '마면졸속', scale: 1.1 }, boss: { id: 'y615002', name: '지귀', scale: 1.4 },
    intro: '끓는 가마솥의 지옥. 화탕귀와 화탕염귀가 죄인을 끓이고, 불의 지귀가 지킨다' },
  { id: 'hanbing', v3: true, bgm: 'bgm_00000120', name: '한빙지옥', lv: '710', terrain: 'y_hanbing', map: 'hell', at: [0.63, 0.3],
    level: 19, open: 'hwatang', monsters: ['y314004', 'y314005', 'y314006'],
    mini: { id: 'y615013', name: '우두나찰', scale: 1.2 }, boss: { id: 'y615003', name: '그슨새', scale: 1.6 },
    intro: '얼음의 지옥. 한빙귀와 야광귀가 얼어붙은 죄인을 지킨다' },
  { id: 'geohae', v3: true, bgm: 'bgm_00000119_48', name: '거해지옥', lv: '710', terrain: 'y_geohae', map: 'hell', at: [0.3, 0.79],
    level: 20, open: 'hanbing', monsters: ['y314016', 'y314017', 'y314018'],
    mini: { id: 'y615016', name: '만인혈석사', scale: 1.6 }, boss: { id: 'y615007', name: '두억시니', scale: 1.4 },
    intro: '톱날 바위의 지옥. 거해귀와 독각귀, 그 위의 두억시니' },
  { id: 'cheolsang', v3: true, bgm: 'bgm_00000124_48', name: '철상지옥', lv: '710', terrain: 'y_cheolsang', map: 'hell', at: [0.74, 0.8],
    level: 21, open: 'geohae', monsters: ['y314019', 'y314020', 'y314021'],
    mini: { id: 'y615019', name: '어둑시니', scale: 1.5 }, boss: { id: 'y615008', name: '새우니', scale: 1.4 },
    intro: '쇠 평상의 지옥, 가장 깊은 곳. 철상귀와 생사귀 사이로 어둑시니가 스민다' },
  // 끝없는 지옥 (연's name for its endless hell), a descent after Diablo II's: four floors below
  // 철상지옥, hidden until 철상지옥 has been conquered three times (or ?abyss), each lit only by a
  // torch round the hero (game.js drawAbyss; abyss.light: the torch's reach, a share of the
  // screen). Their names and bosses' titles are homages to Diablo II; the pictures, monsters and
  // music are all 연's. Only here fall 마법·희귀·고유 weapons (items.js). Past the last floor's
  // boss, now and then, a way opens to a secret meadow of cows (the 비밀의 소 레벨).
  { id: 'abyss', v3: true, hidden: true, abyss: { light: 0.4 }, bgm: 'BGM_Raid_Hell_StoryField', name: '지하 묘지', lv: '???', terrain: 'y_abyss', map: 'hell', at: [0.5, 0.11],
    level: 23, open: 'cheolsang', monsters: ['y304170', 'y304101', 'y304104', 'y304107', 'y304100', 'y304103', 'y304106'],
    mini: { id: 'y304102', name: '무덤지기', scale: 1.4 }, boss: { id: 'y304105', name: '핏빛 백작', scale: 2 },
    intro: '끝없는 지옥 첫째 층. 선우의 무덤 밑, 저주받은 병사들이 횃불을 들고 묘지를 지킨다' },
  { id: 'zud', v3: true, bgm: 'bgm_00000137_64', name: '조드의 고원', lv: '780', terrain: 'y_zud', map: 'world_1', at: [0.3, 0.13],
    level: 18, open: 'tagye', big: 5600, monsters: ['y315010', 'y315011', 'y315012', 'y315001', 'y315002', 'y315003'],
    mini: { id: 'y616001', name: '고원 척후대장', scale: 1.3 }, boss: { id: 'y616004', name: '고원 기마대장', scale: 1.4 },
    intro: '북방대초원 너머 메마른 고원. 기마병과 척후병이 늑대와 수리를 몰고 달린다' },
  { id: 'zud2', v3: true, bgm: 'bgm_00000136_32', name: '조드의 고원 북쪽', lv: '780', terrain: 'y_zud2', map: 'world_1', at: [0.13, 0.2],
    level: 19, open: 'zud', monsters: ['y315007', 'y315008', 'y315009', 'y315004', 'y315005', 'y315006'],
    mini: { id: 'y616002', name: '고원 사수장', scale: 1.3 }, boss: { id: 'y616003', name: '고원 대주술사', scale: 1.5 },
    intro: '고원의 북쪽 끝. 주술사가 곰과 야크를 부리고, 사수병이 언덕에서 활을 겨눈다' },
  { id: 'sandolim', v3: true, bgm: 'BGM_Raid_UnderSky_1stBoss', name: '산돌림 협곡', lv: '820', terrain: 'y_sandolim', map: 'skybelow', at: [0.3, 0.76],
    level: 19, open: 'zud2', monsters: ['y315501', 'y315502', 'y315503'],
    mini: { id: 'y315502', name: '이형의 무법자', scale: 1.4 }, boss: { id: 'y616501', name: '유혹의 수목자', scale: 1.5 },
    intro: '하늘 아래 땅의 첫 협곡. 무법자와 산노인이 지나는 이를 막아선다' },
  { id: 'fallforest', v3: true, bgm: 'BGM_Raid_UnderSky_1stStoryField', name: '몰락의 숲', lv: '823', terrain: 'y_fallforest', map: 'skybelow', at: [0.47, 0.63],
    level: 19, open: 'sandolim', monsters: ['y315504', 'y315505', 'y315506'],
    mini: { id: 'y315506', name: '다복', scale: 1.3 }, boss: { id: 'y616502', name: '친절한 사리', scale: 1.5 },
    intro: '무너진 마을 곁의 숲. 장승과 인형이 걸어 다닌다' },
  { id: 'jagwi', v3: true, bgm: 'bgm_00000128_48', name: '자귀의 늪', lv: '826', terrain: 'y_jagwi', map: 'skybelow', at: [0.64, 0.74],
    level: 20, open: 'fallforest', monsters: ['y315507', 'y315508', 'y315509'],
    mini: { id: 'y315508', name: '자귀의 파수꾼', scale: 1.4 }, boss: { id: 'y616503', name: '품의 자귀', scale: 1.4 },
    intro: '검푸른 늪. 가리야와 독시가 물풀 사이에서 기어 나온다' },
  { id: 'oldaram', v3: true, bgm: 'bgm_00000166', name: '구아람', lv: '829', terrain: 'y_oldaram', map: 'skybelow', at: [0.72, 0.5],
    level: 20, open: 'jagwi', monsters: ['y315510', 'y315511', 'y315512'],
    mini: { id: 'y315511', name: '희생수', scale: 1.4 }, boss: { id: 'y616504', name: '광기의 섬망', scale: 1.4 },
    intro: '옛 아람의 들판. 지귀의 창병과 귀병이 문을 지킨다' },
  { id: 'haya', v3: true, bgm: 'BGM_Raid_China_1stField_48', name: '하야평원', lv: '832', terrain: 'y_haya', map: 'skybelow', at: [0.5, 0.42],
    level: 21, open: 'oldaram', monsters: ['y315513', 'y315514', 'y315515'],
    mini: { id: 'y315514', name: '하랑로', scale: 1.4 }, boss: { id: 'y616505', name: '처단하는 자', scale: 1.5 },
    intro: '바위가 흩어진 넓은 평원. 이리와 불의 짐승이 무리 지어 다닌다' },
  { id: 'lobi', v3: true, bgm: 'BGM_Raid_UnderSky_2ndStoryField', name: '로비해변', lv: '835', terrain: 'y_lobi', map: 'skybelow', at: [0.2, 0.4],
    level: 21, open: 'haya', big: 5600, monsters: ['y315516', 'y315517', 'y315518'],
    mini: { id: 'y315516', name: '파도뱀', scale: 1.2 }, boss: { id: 'y616506', name: '비명의 세암', scale: 1.5 },
    intro: '모래와 조개껍데기의 해변. 옛 선원과 바다해골이 파도뱀을 따라 올라온다' },
  { id: 'aram', v3: true, bgm: 'BGM_Raid_UnderSky_3rdStoryField', name: '아람 황무지', lv: '838', terrain: 'y_aram', map: 'skybelow', at: [0.38, 0.25],
    level: 22, open: 'lobi', big: 6100, monsters: ['y315519', 'y315520', 'y315521'],
    mini: { id: 'y315521', name: '멈추지 않는 자', scale: 1.1 }, boss: { id: 'y616507', name: '장막의 가뮈', scale: 1.5 },
    intro: '붉은 흙의 황무지. 의식 없는 자들이 멈추지 않고 걸어온다' },
  { id: 'ancient', v3: true, bgm: 'BGM_Raid_UnderSky_4thStoryField', name: '도성의 흔적', lv: '841', terrain: 'y_ancient', map: 'skybelow', at: [0.6, 0.2],
    level: 22, open: 'aram', monsters: ['y315522', 'y315523', 'y315524'],
    mini: { id: 'y315523', name: '도성 문지기', scale: 1.4 }, boss: { id: 'y616508', name: '종막의 묘귀', scale: 1.5 },
    intro: '하늘 아래 땅 끝의 옛 도성. 수호자와 문지기가 무너진 성을 지킨다' },
  // The abyss floors below 지하 묘지 (abyss, above), last here so no older special changes its option.
  { id: 'abyss2', v3: true, hidden: true, abyss: { light: 0.36 }, bgm: 'bgm_jail_1_32', name: '고통의 전당', lv: '???', terrain: 'y_abyss2', map: 'hell', at: [0.22, 0.22],
    level: 24, open: 'abyss', monsters: ['y303216', 'y303218', 'y303230', 'y303231', 'y303217', 'y303220', 'y303238'],
    mini: { id: 'y303233', name: '울부짖는 달걀귀신', scale: 1.6 }, boss: { id: 'y303229', name: '고통의 처녀', scale: 2.2 },
    intro: '둘째 층. 흉가의 뒤편이 끝없이 이어진 전당, 귀신과 독충이 우는 곳' },
  { id: 'abyss3', v3: true, hidden: true, abyss: { light: 0.32 }, bgm: 'BGM_Raid_Hell_2ndBoss', name: '혼돈의 성역', lv: '???', terrain: 'y_abyss3', map: 'hell', at: [0.52, 0.6],
    level: 25, open: 'abyss2', monsters: ['y314021', 'y314020', 'y314003', 'y314018', 'y615019'],
    mini: { id: 'y615020', name: '어둠의 사도', scale: 1.9 }, boss: { id: 'y615021', name: '공포의 군주', scale: 2.6 },
    intro: '셋째 층. 철상지옥 밑, 빛이 닿지 않는 성역. 어둠 그 자체가 다가온다' },
  { id: 'abyss4', v3: true, hidden: true, abyss: { light: 0.36 }, bgm: 'BGM_Raid_Hell_3rdBoss', name: '세계석 요새', lv: '???', terrain: 'y_abyss4', map: 'hell', at: [0.86, 0.52],
    level: 26, open: 'abyss3', monsters: ['y304028', 'y304027', 'y304029', 'y304136', 'y304032', 'y304031', 'y304033', 'y304034'],
    mini: { id: 'y604007', name: '세계석의 수호자', scale: 1.4 }, boss: { id: 'y615013', name: '파괴의 군주', scale: 2 },
    intro: '마지막 층. 시왕의 심판정 아래 요새, 망령의 장수들이 세계석을 지킨다' },
  { id: 'cow', v3: true, hidden: true, cow: true, abyss: { light: 0.55 }, bgm: 'bgm_00000002_48', name: '비밀의 소 레벨', lv: '음매', terrain: 'y_cow', map: 'hell', at: [0.86, 0.17],
    level: 26, open: 'abyss4', big: 5600, monsters: ['y111010', 'y304623', 'y315005', 'y315006'],
    mini: { id: 'y304623', name: '성난 코뿔소', scale: 1.3 }, boss: { id: 'y304635', name: '소 왕', scale: 1.8 },
    intro: '그런 곳은 없다. …정말로' },
];

// The clock of a hunting ground, as D2 Survivors' acts: the boss comes at 4:00 (shortened from D2 Survivors' 6:00 for tempo); a named
// leader (with followers) at 1:30 and 3:10; a pack of champions every minute.
export const BOSS_AT = 4 * 60;

// 레이드: 공격대 25명(탱커·힐러·딜러·서포터, 내 다른 직업들도 그 안에)이 거대한 보스 하나를 친다
// (war.js의 공대). 보스는 0:15에 나오며, 바닥에 붉게 예고한 칸을 내리친다(한 칸씩 걸어 피한다).
// 체력 70%, 40%에서 더 사나워지고, 7분에 광폭화, 8분 안에 못 잡으면 실패. 보상 등급은 역할별 기여로.
// open: 이 사냥터를 (아무 직업으로든) 정복하면 열린다. 보스 이름은 이 게임에서 붙인 것이다.
// patterns: 바닥 패턴(공통 cross·breath·rain·ring·meteor·plus와 보스 고유 패턴, game.js raidPattern).
// patterns1/patterns2: 2페이즈(70%)·3페이즈(40%)부터 더해지는 패턴. 3페이즈엔 고유 패턴 뒤에 공통 패턴이 이어지기도 한다.
export const RAIDS = [
  // A ladder, the low rungs open from the middle grounds: level sets the monsters, the boss's
  // life (5000 a level) and how hard its red tiles strike.
  { id: 'raid_boar', bgm: 'nx_24_Memory_of_battle', raid: true, title: '들판의 폭군',
    lines: {'enter': '꿀꿀… 내 들판을 짓밟는 놈들이 누구냐!', 'p1': '어디 한번 받아 봐라! 얘들아, 몰려나와라!', 'p2': '크르르… 엄니가 부러져도 물러서지 않는다!', 'summon': ['새끼들아, 저놈들 발을 물어라!', '들판의 형제들이여, 모여라!'], 'kill': ['하나 들이받았다! 다음은 누구냐!', '꿀꿀, 약하구나!'], 'killHealer': '풀 뜯는 놈부터 짓밟아 주마! 고쳐 주는 녀석은 끝이다!', 'low': '이 들판은… 내 것이었는데…', 'enrage': '더는 못 참는다! 모조리 들이받아 주마!', 'death': '꾸에에엑…! 들판을… 지켜라…'}, name: '멧돼지왕 레이드', lv: '파티', terrain: 'field', level: 2, open: 'snake',
    monsters: ['12020', '12021', '12022', '12023', '12024'], boss: { id: 'y308009', was: '6008', name: '멧돼지왕', scale: 1.2 },
    patterns: ['charge', 'cross', 'meteor'], patterns1: ['stampede'], fx: '20', intro: '들판을 짓밟는 거대한 멧돼지. 일직선으로 들이받는다' },
  { id: 'raid_tiger', bgm: 'nx_04_Winds_take2', raid: true, title: '산의 주인',
    lines: {'enter': '어흥… 이 산의 주인을 찾아온 겁 없는 것들이로구나.', 'p1': '산이 울린다. 내 새끼들아, 나와라!', 'p2': '발톱이 무디다고 얕보지 마라!', 'summon': ['곰이며 범이며, 모두 내려오너라!', '산의 짐승들아, 저들을 에워싸라!'], 'kill': ['산은 약한 자를 품지 않는다.', '한 놈 쓰러졌구나.'], 'killHealer': '상처를 핥아 주던 놈이 먼저 쓰러졌구나.', 'low': '제법이구나, 사람들…', 'enrage': '산군의 노여움을 받아라!', 'death': '산이… 고요해지는구나…'}, name: '산군 레이드', lv: '파티', terrain: 'cave', level: 3, open: 'deer',
    monsters: ['1022', '1023', '1027', '1036', '1037'], boss: { id: '1027', name: '산군', scale: 1.7 },
    patterns: ['pounce', 'claw', 'cross'], patterns1: ['ring'], fx: '20', intro: '산의 주인이라 불리는 호랑이. 사방을 할퀴며 달려든다' },
  { id: 'raid_goblin', bgm: 'bs_bango', raid: true, title: '방망이의 왕',
    lines: {'enter': '히히! 금 나와라 뚝딱, 손님 나와라 뚝딱!', 'p1': '얘들아, 방망이 들고 나와라! 놀이 시간이다!', 'p2': '내 방망이를 화나게 했겠다?!', 'summon': ['뚝딱! 도깨비 나와라!', '히히, 더 놀자! 얘들아!'], 'kill': ['히히, 하나 뚝딱!', '방망이 맛이 어떠냐!'], 'killHealer': '히히, 치료하는 놈부터 뚝딱!', 'low': '어, 어라? 이게 아닌데…', 'enrage': '뚝딱! 뚝딱! 다 부숴 버려라!', 'death': '내… 방망이… 돌려줘…'}, name: '도깨비대장 레이드', lv: '파티', terrain: 'cave', level: 5, open: 'fox',
    pages: [801, 802, 804], boss: { id: 'y303208', was: '8017', name: '도깨비대장', scale: 1.6 },
    patterns: ['quake', 'rain', 'plus'], patterns1: ['sparks'], fx: '96', intro: '도깨비들을 거느린 대장. 방망이를 휘두르면 땅이 솟는다' },
  { id: 'raid_hydra', bgm: 'nx_33_Dear_ancestor', raid: true, title: '세 머리의 재앙',
    lines: {'enter': '「셋이서 한 번에 먹어 주마.」「아니, 내가 먼저다!」「조용히들 해라.」', 'p1': '머리 하나가 다쳤다고 멈출 줄 아느냐!', 'p2': '세 머리가 모두 깨어났다. 불길이 마르지 않으리라!', 'summon': ['뱀들아, 비늘 아래에서 기어 나와라!', '굴의 뱀들아, 먹이다!'], 'kill': ['한 입 거리도 안 되는군.', '「내 거다!」「아니, 내 거다!」'], 'killHealer': '「치유하는 놈부터 먹어라.」「맛있군.」', 'low': '이럴 수가… 세 머리가… 모두…', 'enrage': '다 태워 버려라!', 'death': '용의… 시대가… 끝나는가…'}, name: '삼두룡 레이드', lv: '파티', terrain: 'cave', level: 7, open: 'haunt',
    monsters: ['1016', '1018', '1019', '1020', '1021', '12016', '12017', '12013'],
    boss: { id: 'y606011', was: '10014', name: '삼두룡', scale: 1.0 }, patterns: ['heads', 'cross', 'breath'], patterns1: ['heads3'], fx: '140',
    intro: '세 머리의 용이 깃든 굴. 머리마다 한 줄씩 불을 뿜는다' },
  { id: 'raid_sorcerer', bgm: 'nx_18_Mireuksa', raid: true, title: '혼을 부리는 자',
    lines: {'enter': '흐흐… 혼을 거두러 제 발로 왔구나.', 'p1': '일어나라, 원혼들아. 저들을 데려가라.', 'p2': '저주는 비처럼 내리고, 너희는 젖으리라.', 'summon': ['떠도는 혼들아, 내 부름에 답하라.', '흐흐, 혼은 얼마든지 있다.'], 'kill': ['그 혼, 잘 쓰마.', '하나 더 거두었다.'], 'killHealer': '기원을 올리던 그 혼, 특히 맛있겠구나.', 'low': '내 술법이… 흐트러진다…', 'enrage': '모든 혼이 내 것이다!', 'death': '흑… 혼들이… 나를…'}, name: '흑술사 레이드', lv: '파티', terrain: 'house', level: 9, open: 'goblin',
    pages: [312, 1001], boss: { id: '10003', name: '흑술사', scale: 1.3 }, patterns: ['hunt', 'rain', 'ring'], patterns1: ['safe'], fx: '120',
    intro: '흉가 깊은 곳에서 혼을 부리는 술사. 하늘에서 저주가 비처럼 떨어진다' },
  { id: 'raid_sea', bgm: 'nx_17_Sea_battle', raid: true, title: '깊은 바다의 왕',
    lines: {'enter': '바다를 더럽히는 뭍것들아, 물속에서 숨이나 쉬어 보거라.', 'p1': '파도야, 일어라! 수병들은 앞으로!', 'p2': '소용돌이에 휘말려 가라앉아라!', 'summon': ['수병들아, 창을 들어라!', '깊은 곳의 것들아, 올라오너라!'], 'kill': ['물거품이 되었구나.', '바다는 넓고, 너희는 작다.'], 'killHealer': '상처를 씻어 주던 자도 물거품이 되었다.', 'low': '바다가… 나를 떠나는가…', 'enrage': '온 바다가 너희를 삼키리라!', 'death': '깊은… 바다로… 돌아간다…'}, name: '해왕 레이드', lv: '파티', terrain: 'sea', level: 11, open: 'sea',
    pages: [701, 702, 703, 704, 705, 706, 707, 708], boss: { id: '3076', name: '해왕', scale: 1.2 },
    patterns: ['whirl', 'ring', 'breath'], patterns1: ['tide'], fx: '123', intro: '바닷속 깊은 곳의 큰 뱀. 물결이 소용돌이친다' },
  { id: 'raid_fire', bgm: 'nx_27_4beast_born_from_the_lava', raid: true, title: '천 년의 불',
    lines: {'enter': '…뜨겁지? 이 불은 화산이 천 년 품은 것이다.', 'p1': '불씨들아, 깨어나라!', 'p2': '용암이 끓어오른다. 녹아 버려라!', 'summon': ['불의 혼들아, 타올라라!', '화산이 너희를 부른다.'], 'kill': ['재가 되었구나.', '불은 가리지 않는다.'], 'killHealer': '치유의 빛도 불 앞에서는 꺼지는 법.', 'low': '불꽃이… 사그라든다…', 'enrage': '모든 것을 재로!', 'death': '다시… 타오를… 날까지…'}, name: '화령 레이드', lv: '파티', terrain: 'lava', level: 12, open: 'volcano',
    pages: [1703, 1704, 1707], boss: { id: 'y511013', was: '5026', name: '화령', scale: 1.2 }, patterns: ['pillars', 'meteor', 'plus'], patterns1: ['lava'], fx: '92',
    intro: '화산의 불이 모여 된 혼. 유성과 불기둥이 땅을 가른다' },
  // 대격변 raids: the legends of today's client, for the strongest records.
  { id: 'raid_wukong', v2: true, bgm: 'bs_sanshin', raid: true, title: '하늘과 같은 성인',
    lines: {'enter': '하하하! 하늘과 맞먹는 이 몸을 찾아오다니, 배짱 한번 좋구나!', 'p1': '털 한 가닥이면 내가 백이다! 나와라, 분신들아!', 'p2': '여의봉아, 커져라! 하늘까지 닿아라!', 'summon': ['원숭이들아, 산을 내려가라!', '팔계야, 오정아, 거들어라!'], 'kill': ['근두운 한 번이면 끝이지!', '하하, 머리띠도 없는 놈이 덤비긴!'], 'killHealer': '경 읊는 놈부터 혼내 주마! 스승님이 와도 소용없다!', 'low': '이 몸이… 오백 년 갇혔던 것보다 아프구나…', 'enrage': '칠십이 가지 변신을 모두 보여 주마!', 'death': '하늘이… 이번엔 너희 편이로구나…'},
    name: '제천대성 레이드', lv: '파티', terrain: 'field', level: 13, open: 'hwagwa',
    monsters: ['12026', '12027', '12029', '12033', '12039', '12040', '12041'], boss: { id: 'y617201', was: '12031', name: '제천대성', scale: 1.7 },
    patterns: ['staff', 'rain', 'cross'], patterns1: ['clones'], patterns2: ['cloud'], fx: '20', intro: '화과산의 원숭이 왕. 분신을 부르고 여의봉으로 땅을 친다' },
  { id: 'raid_musin', v2: true, bgm: 'nx_10_4way_battle', raid: true, title: '칼끝의 신',
    lines: {'enter': '…칼을 뽑아라. 말은 칼로 하는 것이다.', 'p1': '제자들이여, 칼을 들어라!', 'p2': '태염의 칼이 불을 머금는다.', 'summon': ['닌자들아, 그림자에서 나와라!', '낭인들이여, 이름을 걸고 베어라!'], 'kill': ['한 칼이면 족하다.', '칼끝이 무디구나.'], 'killHealer': '뒤에서 숨을 불어넣는 자부터 베었다.', 'low': '이 칼이… 밀리다니…', 'enrage': '무신의 칼, 이제 멈추지 않는다!', 'death': '좋은… 승부였다…'},
    name: '태염무신 레이드', lv: '파티', terrain: 'house', level: 14, open: 'musin',
    monsters: ['4001', '4002', '4021', '4022', '4031', '4032', '4005'], boss: { id: 'y600020', was: '4006', name: '태염무신', scale: 1.3 },
    patterns: ['xslash', 'cross', 'plus'], patterns1: ['iai'], patterns2: ['pillars'], fx: '92', intro: '무신의 탑 꼭대기의 검신. 십자로 베고 불기둥을 세운다' },
  { id: 'raid_brit', v2: true, bgm: 'nx_31_Sealed_Hwanse', raid: true, title: '타계의 마왕',
    lines: {'enter': '봉인이 풀렸다… 이 세상의 물과 숨을 모두 가두어 주마.', 'p1': '거마족이여, 깨어나라! 산 자들을 끌고 가라!', 'p2': '나는 브리트라. 가뭄이요, 막힌 강이다!', 'summon': ['마령들아, 안개 속에서 나와라!', '타계의 문이 열린다!'], 'kill': ['숨이 막히느냐? 그것이 나다.', '하나의 혼이 내 것이 되었다.'], 'killHealer': '생명을 나누는 자여, 네 숨부터 거두었다.', 'low': '또… 봉인되는 것인가…', 'enrage': '모든 물길을 끊어 주마! 타계로 떨어져라!', 'death': '봉인이… 다시… 닫힌다…'},
    name: '브리트라 레이드', lv: '파티', terrain: 'cave', level: 16, open: 'tagye',
    monsters: ['3066', '3067', '3068', '3069', '3078', '3079', '3062'], boss: { id: '10013', name: '브리트라', scale: 1.7 },
    patterns: ['seal', 'ring', 'meteor', 'breath'], patterns1: ['drought'], patterns2: ['sweep'], fx: '140', intro: '타계에 봉인되었던 마왕. 혼의 고리와 유성으로 모두를 짓누른다' },
  // 괴수 raids: the client's 괴수의상 (the dress room's beasts) as bosses, walking their four ways.
  { id: 'raid_varuna', v2: true, bgm: 'bs_shark', raid: true, title: '심해의 군주',
    lines: {'enter': '물결이 멈추었다… 바다의 율법을 어긴 자들이로구나.', 'p1': '바다의 아이들아, 저들을 감싸라!', 'p2': '조수가 뒤집힌다. 숨을 아껴 두어라.', 'summon': ['파도야, 저들을 삼켜라!', '심연의 것들이여, 올라오라!'], 'kill': ['물거품이 되어라.', '바다는 약한 것을 품지 않는다.'], 'killHealer': '물을 길어 나르던 자부터 가라앉혔다.', 'low': '썰물이… 오는구나…', 'enrage': '모든 물길이 나를 따른다! 쓸려 가라!', 'death': '바다로… 돌아가겠다…'},
    name: '바루나 레이드', lv: '파티', terrain: 'sea', level: 15, open: 'deepsea',
    monsters: ['3019', '3020', '3022', '3023', '3025', '3016'], boss: { id: '3027', name: '바루나', scale: 1.2, beast: 'varuna' },
    patterns: ['tide', 'ring', 'breath', 'rain'], patterns1: ['whirl'], patterns2: ['eye'], fx: '123', intro: '바다를 다스리는 괴수. 물의 고리와 숨결로 파티를 몰아친다' },
  { id: 'raid_agni', v2: true, bgm: 'bs_cheongui', raid: true, title: '불의 신',
    lines: {'enter': '하하하! 제물이 제 발로 걸어 들어왔구나!', 'p1': '불꽃의 자식들아, 춤을 춰라!', 'p2': '이제야 몸이 데워지는군!', 'summon': ['재 속에서 일어나라!', '불길아, 번져라!'], 'kill': ['잿더미가 되었구나!', '불길은 가리지 않는다!'], 'killHealer': '물 뿌리던 놈부터 태웠다!', 'low': '불씨가… 꺼지지 않는다…', 'enrage': '세상을 모두 태워 주마!', 'death': '불은… 다시… 타오른다…'},
    name: '아그니 레이드', lv: '파티', terrain: 'lava', level: 17, open: 'tagye',
    pages: [1703, 1704, 1707], boss: { id: '10013', name: '아그니', scale: 1.2, beast: 'agni' },
    patterns: ['pillars', 'meteor', 'plus', 'cross'], patterns1: ['lava'], patterns2: ['flare'], fx: '92', intro: '불을 다스리는 괴수. 유성과 불기둥이 쉬지 않고 떨어진다' },
  { id: 'raid_airavata', v2: true, bgm: 'bs_darkking', raid: true, title: '하늘을 받친 코끼리',
    lines: {'enter': '…하늘을 떠받치는 발 아래, 너희는 먼지와 같다.', 'p1': '구름의 짐승들아, 내려오라!', 'p2': '번개가 상아 끝에 맺힌다.', 'summon': ['하늘의 무리여, 모여라!', '구름을 가르고 내려오라!'], 'kill': ['짓밟혔구나.', '하늘은 무겁다.'], 'killHealer': '빛을 비추던 자를 먼저 밟았다.', 'low': '하늘이… 기우는구나…', 'enrage': '천둥과 함께 모두 짓밟아 주마!', 'death': '하늘이… 너희를… 인정하는구나…'},
    name: '아이라바타 레이드', lv: '파티', terrain: 'field2', level: 18, open: 'kirin',
    monsters: ['2019', '2020', '2021', '2032', '2033', '2034'], boss: { id: '2037', name: '아이라바타', scale: 1.2, beast: 'airavata' },
    patterns: ['trample', 'cross', 'rain', 'ring', 'meteor'], patterns1: ['thunder'], patterns2: ['stomp'], fx: '140', intro: '인드라를 태운 하늘 코끼리. 대격변의 마지막 레이드' },
  // Under the 끝없는 지옥 and over everything: 연's own raid bosses and maps (tools/yeon_grounds.json
  // "raids": their sheets y<unit>, terrains y_<raid>, music). v3: their specials come last (items.js),
  // and their sets are placed after the crafted looks (avatar.js LATE_RAIDS). after: a raid to win first.
  // 지하국대적: the last of 연's 지옥 raid (Units_RaidBoss 92240, its scythed many-headed demon), on
  // 연's 시왕의 심판정 map (kow_map_Reid_TheJudgeOfHell04) to its 지옥 raid's first boss music.
  // Its spoils: 회한옥'심 (악마 심판의낫), now and then the scythe itself.
  { id: 'raid_hell', v3: true, bgm: 'BGM_Raid_Hell_1stBoss', raid: true, title: '지하국의 대적',
    lines: {'enter': '…시왕의 심판도 나를 묶지 못했다. 산 것들이 제 발로 지하국에 내려오다니.', 'p1': '옥졸들아, 사슬을 풀어라! 철상의 망령들아, 일어나라!', 'p2': '머리 하나를 베었느냐? 지하국의 대적은 머리가 아홉이다.', 'summon': ['망령들아, 저들의 발목을 잡아라!', '철상지옥의 귀졸들아, 나와라!'], 'kill': ['네 죄의 무게만큼 떨어져라.', '하나 더, 지하국으로.'], 'killHealer': '살리는 손부터 거두었다. 이곳에 구원은 없다.', 'low': '회한이… 낫 끝에 맺히는구나…', 'enrage': '아홉 머리가 모두 깨어났다! 지옥의 문을 활짝 열어라!', 'death': '심판은… 끝나지… 않는다…'},
    name: '지하국대적 레이드', lv: '공대', terrain: 'y_raid_hell', level: 27, open: 'abyss4',
    monsters: ['y314019', 'y314020', 'y314021', 'y314001', 'y314002', 'y615019'], boss: { id: 'y92240', name: '지하국대적', scale: 1 },
    patterns: ['seal', 'xslash', 'meteor', 'ring'], patterns1: ['drought', 'pillars'], patterns2: ['sweep', 'lava'], fx: '140',
    intro: '끝없는 지옥 아래, 시왕의 심판정을 차지한 아홉 머리의 대적. 쌍낫으로 베고 지옥불을 쏟는다. 회한옥\'심을 떨어뜨린다' },
  // 선계의 백두선인: 연's 선계 (the immortals' realm over 백두산; Units_FieldBoss 912014, the white sage in
  // his halo) as the last raid of all, on 연's 천상계 (kow_map_cheonsanggyeo) to its own music. Opens
  // once the 지하국대적 has fallen. Its spoils: 선계의 기운, the 용무기 제십's 천상 각성 (a look only).
  { id: 'raid_heaven', v3: true, bgm: 'BGM_Raid_BaekDuSan_4thBoss', raid: true, title: '선계의 주인', after: 'raid_hell',
    lines: {'enter': '지옥 끝에서 여기까지 올라왔는가. 하늘은 그 발걸음을 보고 있었다.', 'p1': '선계의 수호자들이여, 구름을 걷어라.', 'p2': '하늘의 이치로 너희를 시험하겠다. 번개를 받아라.', 'summon': ['구름 위의 것들이여, 내려오라.', '선계의 문이 열린다.'], 'kill': ['하늘은 가벼운 자를 받지 않는다.', '구름 아래로 돌아가라.'], 'killHealer': '빛을 나누던 손이 먼저 내려앉았구나.', 'low': '이 늙은 몸이… 하늘을 떠받치기엔…', 'enrage': '선계의 모든 빛이여, 저들을 태워라!', 'death': '선계의 기운을… 그대들에게…'},
    name: '선계 레이드', lv: '공대', terrain: 'y_raid_heaven', level: 28, open: 'abyss4',
    monsters: ['y315519', 'y315520', 'y315521', 'y315522', 'y315523', 'y912015'], boss: { id: 'y912014', name: '선계의 백두선인', scale: 1.5 },
    patterns: ['rain', 'ring', 'cross', 'plus', 'eye'], patterns1: ['thunder', 'cloud'], patterns2: ['stomp', 'meteor'], fx: '140',
    intro: '백두산 위 선계의 주인. 하늘의 이치로 번개와 구름을 부린다. 가장 강한 레이드. 선계의 기운을 떨어뜨린다' },
];
// 괴력난신 (today's weekly co-op beast hunt): one 괴수 a week, in turn, its ★ cards for the
// collection (game.js). The week is counted from a fixed Monday, so it turns over on Mondays.
export const GWOE_BEASTS = [
  ['saryeong', '사령웅', '3074'], ['josajang', '조사장', '10013'], ['bihyeong', '비형랑', '4006'], ['heukhwa', '흑화랑', '3074'],
  ['ogutai', '오구타이', '10013'], ['kurakan', '쿠라칸', '12046'], ['garuda', '가루다', '2037'], ['ganesha', '가네샤', '2037'],
  ['dohwa', '도화랑', '3074'], ['sadaham', '사다함', '4006'], ['jinmyo', '진묘수', '12046'],
];
export function gwoeWeek(now = Date.now()) {
  return Math.floor((now - Date.UTC(2024, 0, 1)) / (7 * 864e5));
}
const [gKey, gName, gHit] = GWOE_BEASTS[gwoeWeek() % GWOE_BEASTS.length];
RAIDS.push({ id: 'raid_gwoe', v2: true, gwoe: true, bgm: 'bs_suhwa', raid: true, title: '이번 주의 괴수',
  lines: {'enter': '크르르… 신력을 탐하는 자들이 또 왔구나.', 'p1': '괴수의 피가 끓는다!', 'p2': '이제 진짜 모습을 보여 주마!', 'summon': ['따르는 것들아, 덮쳐라!', '괴수의 무리여!'], 'kill': ['약하다, 약해!', '하나 쓰러졌다!'], 'killHealer': '치유하던 자부터 먹어 치웠다!', 'low': '이 힘이… 빠져나간다…', 'enrage': '모조리 찢어 주마!', 'death': '내 신력을… 가져가라…'},
  name: `괴력난신 · ${gName}`, lv: '파티', terrain: 'cave', level: 14, open: 'royal',
  monsters: ['3066', '3067', '3068', '12026', '12039', '9014'], boss: { id: gHit, name: gName, scale: 1.2, beast: gKey },
  patterns: ['stomp', 'ring', 'cross', 'meteor'], patterns1: ['pounce'], patterns2: ['ward'], fx: '140',
  intro: `이번 주의 괴수 ${gName}. 쓰러뜨리면 ${gName}의 ★ 효과 카드를 얻는다(주 3번, 월요일에 바뀜)` });

// The ladder in order of strength, whatever order they were written in.
RAIDS.sort((a, b) => a.level - b.level);

// A raid is meant for three to four minutes (it was five to seven): five at most, its rage at four.
export const RAID_BOSS_AT = 15, RAID_LIMIT = 5 * 60;

/**
 * 레이드 역할 임무 (war.js raidTasks): in each of the boss's three phases (100~70%, 70~40%, 40~0%)
 * the hero has one clear task of its role, shown at the top of the screen with its time and a mark
 * on what it is about; from the second phase the boss's 「모여라」 / 「흩어져」 marks come between
 * them for everyone. A task done counts in the hero's contribution (obj) and spares the raid its
 * blow; one failed costs the raid (a healer struck, a raider fallen, the boss mended or a blast).
 */
export const RAID_TASKS = {
  tank: ['hold', 'berserk', 'hold'],
  healer: ['focus', 'cleanse', 'focus'],
  dps: ['totem', 'shield', 'totem'],
  support: ['guard', 'totem', 'guard'],
};
export const RAID_TASK_DEF = {
  hold: { name: '보스 붙잡기', how: '보스가 힐러에게 간다! 보스 곁 3칸에 2.5초 붙어 도발', sec: 7, obj: 9 },
  berserk: { name: '광전사 붙잡기', how: '광전사가 뒷줄 힐러에게 달려든다! 2칸 안에 붙어 2초', sec: 10, obj: 9 },
  focus: { name: '집중 치유', how: '표식이 붙은 공대원 곁(4칸)에 붙어 80%까지 살리기', sec: 9, obj: 9 },
  cleanse: { name: '정화', how: '저주받은 공대원 둘 — 곁(2칸)에 1초씩 서서 풀기', sec: 11, obj: 9 },
  totem: { name: '토템 부수기', how: '보스를 감싼 토템 셋을 부숴라 (그동안 보스 피해 60%)', sec: 15, obj: 10 },
  shield: { name: '보호막 깨기', how: '보스의 보호막! 딜을 몰아 깨면 보스가 휘청인다', sec: 12, obj: 10 },
  guard: { name: '광역기 대비', how: '큰 광역기가 온다! 공대원 4명 곁(3칸)에 서서 보호', sec: 8, obj: 8 },
  soak: { name: '모여라', how: '금빛 원 안에 넷이 함께 서서 받아내기 (나 포함)', sec: 7, obj: 5, all: true },
  spread: { name: '흩어져', how: '내게 폭탄 표식! 공대원에게서 3칸 떨어지기', sec: 6, obj: 5, all: true },
};

/**
 * 대항전 지휘 선택 (war.js warCommand): once a minute the hero chooses how its guild's squads fight
 * for the next minute; unchosen, the guild's own commander goes on as it was.
 */
export const WAR_COMMANDS = {
  charge: { name: '돌격', desc: '모든 분대가 적 목표로 (공격 +10%, 받는 피해 +10%)', dmg: 1.1, taken: 1.1 },
  hold: { name: '수비', desc: '분대 절반이 우리 목표를 지킨다 (받는 피해 −15%)', dmg: 1, taken: 0.85 },
  flank: { name: '우회', desc: '두 분대가 옆길로 돌아 기습 (기습 분대 공격 +20%)', dmg: 1, taken: 1, flankDmg: 1.2 },
  rally: { name: '집결', desc: '모든 분대가 나에게 모인다 (내 곁 5칸 공격 +8%·보호)', dmg: 1, taken: 1, nearDmg: 1.08 },
};
export const WAR_COMMAND_EVERY = 60, WAR_COMMAND_PICK = 12;
export const MINI_AT = [90, 190];
export const CHAMPIONS_AT = [60, 120, 180];

// Shared effects: hit spark, death puff, level-up, heal, shield and the ghost a dead hero becomes.
// Shared effects, by the site's numbers: level-up (봉황의기원), potion heal (바다의기원), 보호, 소환, and the
// outline figure (무영보법) for the ghost. No spark on plain hits: the client drew none.
// 150 is 봉황의기원 and 151 갑판원의걸음 in the site's list: neither belongs to a level-up or a
// ghost. A level-up shows no picture, as in the client (a message and a sound); 129 is 부활.
export const FX = { hit: null, death: null, levelup: null, revive: '129', heal: null, ghost: null, shield: '77', summon: '44' };

/**
 * A mending skill (a 기원 and its like): 누리·태양·신령·봉황·현자·생명·금기의 기원, the 희원, 운기·메밀묵섭취·
 * 저승의기원 (regen), 신성제마술 (a cleanse that heals), 권법의기원 (a 기원 by name, a buff). It is cast on
 * the caster or its allies only: never on a foe, never in a rotation of blows, never as the picture
 * or the sound of a blow (the 기본 공격, a shot, a 필살기).
 */
export function isMend(d) {
  if (!d || d.kind === 'ult') return false;
  return d.kind === 'heal' || d.kind === 'regen' || d.ck === 'heal' || (d.kind === 'cleanse' && !!d.heal) || /기원|희원/.test(d.name || '');
}
/** The 기원 pictures of the original site (누리의 기원's grades 3·4·64·32·10·79, 신령의기원 131, 태양 93,
 *  현자 146, 천공 111, 백호 130·133 …): the boot gives those skills 연's own pictures, but the old ones are
 *  still 기원 to the eye and never fly at, or burst on, a foe. */
export const MEND_FX = new Set(['3', '4', '64', '32', '10', '79', '93', '146', '131', '130', '133', '111', '78', '125', '138', '142']);

/** A skill's name at a level. */
export function skillName(id, level) {
  const s = SKILLS[id];
  return s.names ? s.names[Math.min(level, s.names.length) - 1] : s.name;
}

/** What a skill does at a level: base values grown by level and the hero's passives. */
/** How many tiles a spell's own area grows by at this 단 (see skillStats). */
function radiusGrow(s, level) {
  return s.kind === 'mark' || (s.count || 1) > 1 ? 0 : Math.floor(level / 8);
}

export function skillStats(id, level, p) {
  const s = SKILLS[id];
  const s0 = SKILLS[id];
  if (s0.evolved) level = 8;
  const l = level - 1;
  return {
    // A grown spell reaches as far as 8단 does, but strikes as a 5단 would: its own power is in
    // its shape (a triangle, the whole screen), not in a number grown four times over.
    // +15% a 단 (8단 is 2.7 times 1단).
    dmg: (s.dmg || 0) * Math.pow(1.15, s0.evolved ? 4 : l) * (1 + 0.1 * p.power),
    // A spell striking many (s.aoe, 스킬 2차 개편) quickens less with its 단 (3% a step, not 7%):
    // its weight is in the blow, not in its pace.
    cd: s.cd * Math.pow(s.aoe ? 0.97 : 0.93, l) * Math.pow(0.92, p.haste),
    // Tiles: reach grows by one every three levels, and with 공력.
    range: (s.range || 0) + Math.floor(l / 3) + Math.floor(p.area / 2),
    // Only a spell that already strikes an area grows it; a single blow stays single.
    // (one more tile only at 8단, and none for a spell that already lays several areas at once — 투도멸진's
    // marks, a rain of bursts: grown each at 4단 and 8단 they covered the screen, 사용자: 터무니없이 큼)
    radius: !s.radius ? 0 : s.radius + radiusGrow(s, level) + Math.floor(p.area / 3),
    count: (s.count || 1) + (level >= 4) + (level >= 7),
    duration: (s.duration || 0) * (1 + 0.1 * l),
    heal: (s.heal || 0) * (1 + 0.45 * l),
  };
}

/** What the next level brings, for the level-up choices. */
export function levelText(id, level) {
  const s = SKILLS[id];
  if (level === 1) return s.desc + (s.up ? ` (8단 + ${SKILLS[s.up].promo}차 승급 → ${SKILLS[s.up].name})` : '');
  if (s.kind === 'slash') {
    return ['', '피해 +15%', '후면 공격: 뒤 칸도 함께 벤다', '삼중공격: 세 번 연달아 벤다', '측면 공격: 양옆 칸도 함께 벤다',
      '사중공격: 네 번 연달아 벤다', '신검합일: 공격력 +30%', '오중공격: 다섯 번 연달아 벤다'][level - 1];
  }
  if (s.kind === 'heal') return '회복량 +45%, 재사용 -7%';
  if (s.buff === 'stealth') return '암습 피해 +0.25배, 재사용 -7%';
  if (s.kind === 'buff') return '지속 시간 +10%, 재사용 -7%';
  const parts = ['피해 +15%', s.aoe ? '재사용 -3%' : '재사용 -7%'];
  if ((level === 4 || level === 7) && s.kind !== 'cleave' && s.kind !== 'nova')
    parts.push(s.kind === 'summon' ? '소환 +1' : '대상 +1');
  if (s.range && (level - 1) % 3 === 0) parts.push('거리 +1칸');
  if (s.kind === 'cleave' && !s.depth && level % 4 === 0) parts.push('앞쪽 역삼각형이 한 줄 깊어진다');
  else if (s.shape === 'plus' && level === 8 && radiusGrow(s, 8)) parts.push('+자 팔이 한 칸 길어진다');
  else if (s.radius && level === 8 && radiusGrow(s, 8)) parts.push('범위 +1칸');
  return parts.join(', ');
}
