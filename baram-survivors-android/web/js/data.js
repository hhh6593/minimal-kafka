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
  { id: 'mage', name: '주술사', hero: '1003', hp: 110, mp: 120, speed: 68, armor: 1, start: 'm_fire', ult: 'm_ult',
    desc: '원거리 공격 주술사. 신수마법으로 적을 태우고 마비시킨다.' },
  { id: 'poet', name: '도사', hero: '1004', hp: 100, mp: 120, speed: 68, armor: 0, start: 'p_orb', ult: 'p_ult',
    revive: true, desc: '회복과 보조의 달인. 몬스터를 불러내고, 한 번은 스스로 부활한다.' },
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
  w_buff: { fxs: ['12', '12', '15', '15', '16', '16', '16', '16'], cls: 'warrior', req: 6, name: '백호령', kind: 'buff', buff: 'power', fx: '12',
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
  w_jin: { promo: 2, cls: 'warrior', req: 10, name: '진백호령', kind: 'buff', buff: 'power', fx: '21', cd: 16, duration: 5, power: 0.8,
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
  w_talm: { promo: 4, cls: 'warrior', req: 18, name: '탈명사식\'염', kind: 'strike', fx: '139', dmg: 30, cd: 3.5, range: 7, radius: 1,
    count: 1, hitAt: 0.3, shape: 'plus', desc: '불의 탈명사식. 먼 몬스터와 그 상하좌우를 불사른다' },
  w_ult: { cls: 'warrior', name: '건곤대나이', kind: 'ult', fx: '14', hpCost: 0.3,
    desc: '체력 30%와 마력을 모두 바쳐, 앞쪽 네 칸(폭 세 칸)의 적을 최대 체력에 비례한 일격으로 벤다' },

  // 도적 — 일반: 비영승보, 뇌진주(신수마법), 투명, 흡성대법, 분신, 필살검무
  r_blink: { cls: 'rogue', req: 1, name: '비영승보', kind: 'blink', fx: null, dmg: 12, cd: 1.2, range: 4, count: 1,
    desc: '바라보는 쪽 네 칸 안의 몬스터 등 뒤로 순식간에 옮겨 가며 벤다' },
  r_bolt: { elem: 'thunder', fxs: ['31', '31', '38', '38', '46', '46', '48', '89'], cls: 'rogue', req: 1, name: '뇌진주', kind: 'spell', fx: '31',
    dmg: 12, cd: 1.8, range: 6, count: 1, names: tier('뇌진주'), up: 'r_storm', desc: '신수마법. 몬스터에게 번개를 떨어뜨린다' },
  r_stealth: { cls: 'rogue', req: 6, name: '투명', kind: 'buff', buff: 'stealth', fx: '36', cd: 12, duration: 2.5,
    desc: '잠시 모습을 감춘다. 몬스터가 공격하지 못하고, 그동안 주는 피해가 3배가 된다' },
  r_drain: { cls: 'rogue', req: 6, name: '흡성대법', kind: 'spell', fx: '49', dmg: 16, cd: 2.8, range: 5, count: 1,
    drain: 0.3, weakest: true, desc: '체력이 낮은 몬스터의 기운을 빨아들여 체력을 회복한다' },
  r_clone: { cls: 'rogue', req: 12, name: '분신', kind: 'buff', buff: 'power', fx: '51', cd: 14, duration: 4, power: 1,
    desc: '분신을 만들어 잠시 공격력이 두 배가 된다' },
  // 1차 승급
  r_dance: { promo: 1, cls: 'rogue', req: 6, name: '백호검무', kind: 'blink', fx: '52', dmg: 8, cd: 1.6, range: 5, count: 3,
    desc: '바라보는 쪽의 몬스터에게 날아들어 세 번 벤다' },
  // 2차 승급
  r_flysword: { promo: 2, cls: 'rogue', req: 10, name: '이기어검', kind: 'blink', fx: '53', dmg: 13, cd: 1.8, range: 5, count: 2,
    curse: 2, desc: '바라보는 쪽 다섯 칸 안의 몬스터 뒤로 날아들어 두 번 베고 저주를 건다' },
  r_budong: { promo: 2, cls: 'rogue', req: 10, name: '부동력', kind: 'buff', buff: 'guard', fx: '54', cd: 18, duration: 1.5,
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
  m_fire: { elem: 'fire', fxs: ['31', '31', '38', '38', '46', '46', '48', '89'], cls: 'mage', req: 1, name: '화염주', kind: 'spell', fx: '31',
    dmg: 14, cd: 1.1, range: 7, count: 1, names: FIRE, up: 'm_fire3', desc: '신수마법. 가까운 몬스터를 불태운다' },
  m_ice: { elem: 'earth', fxs: ['31', '31', '38', '38', '46', '46', '48', '89'], cls: 'mage', req: 1, name: '백열주', kind: 'strike', fx: '31',
    dmg: 19, cd: 2.1, range: 7, radius: 0, count: 1, hitAt: 0.5, slow: 2, names: tier('백열주'), up: 'm_quake',
    desc: '신수마법. 백호의 땅 기운으로 몬스터를 치고 느리게 한다' },
  m_curse: { cls: 'mage', req: 6, name: '저주', kind: 'strike', fx: '84', dmg: 3, cd: 5, range: 7, radius: 1, count: 1,
    hitAt: 0.3, curse: 4, desc: '몬스터와 그 주위의 방어를 깎아 4초 동안 받는 피해가 40% 늘어난다' },
  m_fire4: { elem: 'fire', fxs: ['63', '63', '71', '71', '80', '80', '87', '90'], cls: 'mage', req: 1, name: '화염주첨', kind: 'spell4', fx: '63',
    dmg: 10, cd: 2.2, range: 5, names: FIRE.map(n => n + '첨'), desc: '상하좌우 네 줄에서 가장 가까운 몬스터를 한꺼번에 태운다(사정거리가 짧다)' },
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
    allies: ['3013', '3012', '1022', '1023'], desc: '불여우와 맹수를 불러 함께 싸우게 한다' },
  p_barrier: { cls: 'poet', req: 6, name: '차폐', kind: 'aura', fx: '108', dmg: 3, cd: 0.8,
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
  p_talm: { promo: 4, cls: 'poet', req: 18, name: '탈명사식\'풍', kind: 'strike', fx: '149', dmg: 22, cd: 3.5, range: 7, radius: 1,
    count: 2, hitAt: 0.3, shape: 'plus', desc: '바람의 탈명사식. 몬스터 둘과 그 상하좌우를 휩쓴다' },
  p_ult: { cls: 'poet', name: '태양의희원', kind: 'ult', fx: '124', guard: 3,
    desc: '마력을 모두 써서 체력을 가득 회복하고, 3초 동안 어떤 공격도 받지 않는다' },
};

// 승급: each class's own conquests, in order. 1차 쥐굴, 2차 사슴굴, 3차 흉가, 4차 도깨비굴.
export const PROMO_AT = ['rat', 'deer', 'haunt', 'goblin'];
export const PROMOS = Object.fromEntries(['warrior', 'rogue', 'mage', 'poet'].map(c => [c, PROMO_AT.map(at => ({ at }))]));

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

// The four 신수 of 신수마법: the site draws every element alike at each grade, so cards name it.
export const ELEMENTS = { fire: ['불', '#c8401a'], earth: ['땅', '#8a6a2a'], water: ['물', '#1a5ab0'], thunder: ['풍뢰', '#6a3ab0'] };

export const MAX_SKILLS = 6;
export const MAX_PASSIVES = 6;
export const MAX_SKILL_LEVEL = 8;
export const MAX_PASSIVE_LEVEL = 5;

// Hunting grounds, in the order a new character works through them. monsters: image ids,
// or pages: hunting-ground page numbers from the image download. lv: the level range players
// hunted there. terrain: how the ground is drawn (game.js).
// bgm: the tune for the ground: official OST tracks from baram.nexon.com/MultiMedia/Music (see README).
export const STAGES = [
  { id: 'novice', bgm: 'nx_08_1_Buyeo', name: '왕초보사냥터', lv: '1~6', terrain: 'field', map: 'gungnae', at: [0.19, 0.8],
    monsters: ['1001', '1002', '1003', '1004'], mini: { id: '1002', name: '왕토끼', scale: 1.7 },
    boss: { id: '1003', name: '사슴왕', scale: 1.8 },
    intro: '다람쥐와 토끼가 뛰노는 첫 사냥터' },
  { id: 'rat', bgm: 'nx_13_Underground_prison', name: '쥐굴', lv: '6~16', terrain: 'cave', map: 'gungnae', at: [0.2, 0.535],
    monsters: ['1005', '1007', '1008', '1009', '1010', '1011', '1012', '1013'],
    mini: { id: '1015', name: '흡혈박쥐' }, boss: { id: '1014', name: '서생원', scale: 1.8 },
    intro: '쥐와 박쥐가 우글거리는 굴' },
  { id: 'snake', bgm: 'nx_13_Underground_prison', name: '뱀굴', lv: '17~20', terrain: 'cave', map: 'gungnae', at: [0.25, 0.535],
    monsters: ['1016', '1018', '1019', '1020', '1021', '12016', '12017'],
    mini: { id: '12013', name: '구렁이', scale: 1.4 }, boss: { id: '12014', name: '왕구렁이', scale: 2 },
    intro: '쥐굴 끝자락과 이어진 뱀들의 소굴' },
  { id: 'deer', bgm: 'nx_24_Memory_of_battle', name: '사슴굴', lv: '20~40', terrain: 'cave', map: 'gungnae', at: [0.68, 0.17],
    monsters: ['1028', '1029', '1030', '1031', '1003', '1004'], boss: { id: '1032', name: '광록지수', scale: 1.7 },
    intro: '청순록, 적순록, 흑광록, 백광록이 사는 굴' },
  { id: 'pig', bgm: 'nx_24_Memory_of_battle', name: '돼지굴', lv: '20~50', terrain: 'cave', map: 'gungnae', at: [0.935, 0.595],
    monsters: ['12020', '12021', '12022', '12023'], mini: { id: '12025', name: '돼지 장수' },
    boss: { id: '12024', name: '홍돼지', scale: 1.7 }, intro: '산돼지와 숲돼지가 먼저 덤벼드는 굴' },
  { id: 'bear', bgm: 'nx_24_Memory_of_battle', name: '곰·호랑이굴', lv: '20~40', terrain: 'cave', map: 'gungnae', at: [0.935, 0.345],
    monsters: ['1022', '1023', '1027', '1036', '1037'], boss: { id: '1025', name: '진웅', scale: 1.6 },
    intro: '곰과 호랑이가 지키는 깊은 굴' },
  { id: 'fox', bgm: 'nx_21_Pray_for_family', name: '여우굴', lv: '30~45', terrain: 'cave', map: 'gungnae', at: [0.065, 0.79],
    monsters: ['3012', '3013', '12009', '12003'], mini: { id: '3013', name: '불구미호', scale: 1.6 },
    boss: { id: '12008', name: '구미호', scale: 1.6 }, intro: '꼬리 아홉 달린 여우가 숨어 사는 굴' },
  { id: 'haunt', bgm: 'bs_haunt', name: '흉가', lv: '99', terrain: 'house', map: 'gungnae', at: [0.125, 0.305],
    pages: [312, 1001], intro: '원혼이 떠도는 버려진 집. 일반성의 마지막 사냥터' },
  { id: 'goblin', bgm: 'nx_22_Burning_the_angry', name: '도깨비굴', lv: '80~99', terrain: 'cave', map: 'gungnae', at: [0.18, 0.085],
    pages: [801, 802, 804], intro: '도깨비들이 방망이를 휘두르는 굴' },
  { id: 'bandit', bgm: 'bs_bandit', name: '산적굴', lv: '90~99', terrain: 'cave', map: 'gungnae', at: [0.03, 0.475],
    pages: [808, 809, 810, 811], intro: '도적질하는 산적 무리의 소굴' },
  { id: 'japan', bgm: 'bs_japan', name: '일본', lv: '99+', terrain: 'field2', map: 'world_1', at: [0.78, 0.48],
    pages: [601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612], intro: '바다 건너 낯선 땅의 무사와 요괴들' },
  { id: 'sea', bgm: 'nx_03_Underwater', name: '바닷속', lv: '99+', terrain: 'sea', map: 'world_1', at: [0.85, 0.7],
    pages: [701, 702, 703, 704, 705, 706, 707, 708], intro: '거대한 게와 오징어가 사는 바다 밑' },
  { id: 'island', bgm: 'bs_island', name: '환상의 섬', lv: '99+', terrain: 'island', map: 'world_4', at: [0.3, 0.55],
    pages: [1401, 1403, 1405, 1407, 1409, 1604, 1606, 1607, 1608, 1609, 1610, 1611], intro: '원시 부족과 괴물이 사는 남쪽 섬' },
  { id: 'volcano', bgm: 'nx_27_4beast_born_from_the_lava', name: '환상의 섬 화산', lv: '99+', terrain: 'lava', map: 'world_4', at: [0.68, 0.18],
    pages: [1703, 1704, 1707], intro: '불의 정령이 들끓는 화산' },
  // Added grounds: each opens when its 'open' ground is conquered, and is as strong as 'level'
  // (the first fourteen are as strong as their place, 0 to 13).
  { id: 'rabbit', bgm: 'nx_08_1_Buyeo', name: '토끼굴', lv: '5~10', terrain: 'cave', map: 'gungnae', at: [0.47, 0.66],
    level: 1, open: 'novice', monsters: ['12065', '12066', '12068', '12069', '12070', '1002'], boss: { id: '12070', name: '토끼 대왕', scale: 2 },
    intro: '알록달록한 토끼들이 모여 사는 굴' },
  { id: 'bigsnake', bgm: 'nx_13_Underground_prison', name: '대뱀굴', lv: '18~25', terrain: 'cave', map: 'gungnae', at: [0.22, 0.56],
    level: 3, open: 'snake', pages: [317], boss: { id: '12108', name: '이무기', scale: 1.6 },
    intro: '뱀굴 아래로 이어진 큰 뱀들의 소굴' },
  { id: 'bearman', bgm: 'nx_24_Memory_of_battle', name: '곰인굴', lv: '35~45', terrain: 'cave', map: 'gungnae', at: [0.9, 0.38],
    level: 6, open: 'bear', pages: [311], boss: { id: '12050', name: '곰인 족장', scale: 1.3 },
    intro: '곰·호랑이굴 깊은 곳, 사람처럼 서서 걷는 곰들' },
  { id: 'mantis', bgm: 'nx_21_Pray_for_family', name: '사마귀굴', lv: '50', terrain: 'cave', map: 'gungnae', at: [0.47, 0.26],
    level: 7, open: 'fox', pages: [308], boss: { id: '12038', name: '사마귀 장수', scale: 1.4 },
    intro: '사마귀 무사들이 지키는 굴' },
  { id: 'skull', bgm: 'nx_32_An_ancient_ghost', name: '해골굴', lv: '60', terrain: 'cave', map: 'gungnae', at: [0.68, 0.1],
    level: 8, open: 'haunt', monsters: ['6005', '6066', '6067', '6068', '3071', '3072', '3073'], boss: { id: '3070', name: '해골왕', scale: 1.1 },
    mini: { id: '3073', name: '저승사자', scale: 1.2 }, intro: '죽어서도 쉬지 못한 해골들이 떠도는 굴' },
  { id: 'steppe', bgm: 'nx_04_Winds_take2', name: '북방대초원', lv: '70~80', terrain: 'field', map: 'world_1', at: [0.36, 0.1],
    level: 9, open: 'goblin', pages: [806, 807], boss: { id: '8042', name: '초원의 주인', scale: 1.2 },
    intro: '바람이 쉬지 않는 북쪽 끝의 초원. 낯선 짐승들이 무리 지어 다닌다' },
  { id: 'yogoe', bgm: 'nx_22_Burning_the_angry', name: '요괴굴', lv: '90~99', terrain: 'cave', map: 'world_1', at: [0.6, 0.58],
    level: 11, open: 'bandit', pages: [902, 904, 906, 907], boss: { id: '2031', name: '요괴왕', scale: 1.2 },
    intro: '불길 속에서 요괴들이 들끓는 굴' },
  { id: 'palace', bgm: 'nx_15_Ghyanmiseong_village', name: '용궁', lv: '99+', terrain: 'sea', map: 'world_1', at: [0.88, 0.8],
    level: 12, open: 'sea', pages: [313], boss: { id: '12064', name: '용궁 장수', scale: 1.1 },
    intro: '바닷속 더 깊은 곳, 용과 수병들이 지키는 궁' },
  { id: 'royal', bgm: 'nx_07_The_great_Wall', name: '왕궁', lv: '99+', terrain: 'house', map: 'gungnae', at: [0.47, 0.47],
    level: 13, open: 'island', pages: [1102, 1103, 1104, 504], boss: { id: '10006', name: '왕궁의 요괴', scale: 1.2 },
    intro: '국내성 한가운데 왕궁. 밤이면 요괴와 반역 무사들이 나타난다' },
];

// The clock of a hunting ground, as D2 Survivors' acts: the boss comes at 6:00; a named
// leader (with followers) at 2:15 and 4:45; a pack of champions every 90 seconds.
export const BOSS_AT = 6 * 60;

// 레이드: 키운 직업이 모두 모여 거대한 보스 하나를 친다. 고른 직업으로 들어가고, 나머지 직업은 각자의
// 최고 기록과 장비만큼 강한 동료로 처음부터 함께한다. 보스는 1:30에 나오며, 바닥에 붉게 예고한 칸을
// 내리친다(한 칸씩 걸어 피한다). 체력 2/3, 1/3에서 더 사나워지고, 8분 안에 못 잡으면 실패.
// open: 이 사냥터를 (아무 직업으로든) 정복하면 열린다. 보스 이름은 이 게임에서 붙인 것이다.
export const RAIDS = [
  // A ladder, the low rungs open from the middle grounds: level sets the monsters, the boss's
  // life (5000 a level) and how hard its red tiles strike.
  { id: 'raid_boar', bgm: 'nx_24_Memory_of_battle', raid: true, title: '들판의 폭군',
    lines: {'enter': '꿀꿀… 내 들판을 짓밟는 놈들이 누구냐!', 'p1': '어디 한번 받아 봐라! 얘들아, 몰려나와라!', 'p2': '크르르… 엄니가 부러져도 물러서지 않는다!', 'summon': ['새끼들아, 저놈들 발을 물어라!', '들판의 형제들이여, 모여라!'], 'kill': ['하나 들이받았다! 다음은 누구냐!', '꿀꿀, 약하구나!'], 'killHealer': '풀 뜯는 놈부터 짓밟아 주마! 고쳐 주는 녀석은 끝이다!', 'low': '이 들판은… 내 것이었는데…', 'enrage': '더는 못 참는다! 모조리 들이받아 주마!', 'death': '꾸에에엑…! 들판을… 지켜라…'}, name: '멧돼지왕 레이드', lv: '파티', terrain: 'field', level: 2, open: 'snake',
    monsters: ['12020', '12021', '12022', '12023', '12024'], boss: { id: '6008', name: '멧돼지왕', scale: 1.3 },
    patterns: ['cross', 'meteor'], fx: '20', intro: '들판을 짓밟는 거대한 멧돼지. 일직선으로 들이받는다' },
  { id: 'raid_tiger', bgm: 'nx_07_The_great_Wall', raid: true, title: '산의 주인',
    lines: {'enter': '어흥… 이 산의 주인을 찾아온 겁 없는 것들이로구나.', 'p1': '산이 울린다. 내 새끼들아, 나와라!', 'p2': '발톱이 무디다고 얕보지 마라!', 'summon': ['곰이며 범이며, 모두 내려오너라!', '산의 짐승들아, 저들을 에워싸라!'], 'kill': ['산은 약한 자를 품지 않는다.', '한 놈 쓰러졌구나.'], 'killHealer': '상처를 핥아 주던 놈이 먼저 쓰러졌구나.', 'low': '제법이구나, 사람들…', 'enrage': '산군의 노여움을 받아라!', 'death': '산이… 고요해지는구나…'}, name: '산군 레이드', lv: '파티', terrain: 'cave', level: 3, open: 'deer',
    monsters: ['1022', '1023', '1027', '1036', '1037'], boss: { id: '1027', name: '산군', scale: 1.7 },
    patterns: ['cross', 'ring'], fx: '20', intro: '산의 주인이라 불리는 호랑이. 사방을 할퀴며 달려든다' },
  { id: 'raid_goblin', bgm: 'nx_22_Burning_the_angry', raid: true, title: '방망이의 왕',
    lines: {'enter': '히히! 금 나와라 뚝딱, 손님 나와라 뚝딱!', 'p1': '얘들아, 방망이 들고 나와라! 놀이 시간이다!', 'p2': '내 방망이를 화나게 했겠다?!', 'summon': ['뚝딱! 도깨비 나와라!', '히히, 더 놀자! 얘들아!'], 'kill': ['히히, 하나 뚝딱!', '방망이 맛이 어떠냐!'], 'killHealer': '히히, 치료하는 놈부터 뚝딱!', 'low': '어, 어라? 이게 아닌데…', 'enrage': '뚝딱! 뚝딱! 다 부숴 버려라!', 'death': '내… 방망이… 돌려줘…'}, name: '도깨비대장 레이드', lv: '파티', terrain: 'cave', level: 5, open: 'fox',
    pages: [801, 802, 804], boss: { id: '8017', name: '도깨비대장', scale: 1.1 },
    patterns: ['rain', 'plus'], fx: '96', intro: '도깨비들을 거느린 대장. 방망이를 휘두르면 땅이 솟는다' },
  { id: 'raid_hydra', bgm: 'nx_31_Sealed_Hwanse', raid: true, title: '세 머리의 재앙',
    lines: {'enter': '「셋이서 한 번에 먹어 주마.」「아니, 내가 먼저다!」「조용히들 해라.」', 'p1': '머리 하나가 다쳤다고 멈출 줄 아느냐!', 'p2': '세 머리가 모두 깨어났다. 불길이 마르지 않으리라!', 'summon': ['뱀들아, 비늘 아래에서 기어 나와라!', '굴의 뱀들아, 먹이다!'], 'kill': ['한 입 거리도 안 되는군.', '「내 거다!」「아니, 내 거다!」'], 'killHealer': '「치유하는 놈부터 먹어라.」「맛있군.」', 'low': '이럴 수가… 세 머리가… 모두…', 'enrage': '다 태워 버려라!', 'death': '용의… 시대가… 끝나는가…'}, name: '삼두룡 레이드', lv: '파티', terrain: 'cave', level: 7, open: 'haunt',
    monsters: ['1016', '1018', '1019', '1020', '1021', '12016', '12017', '12013'],
    boss: { id: '10014', name: '삼두룡', scale: 1 }, patterns: ['cross', 'breath'], fx: '140',
    intro: '세 머리의 용이 깃든 굴. 머리마다 한 줄씩 불을 뿜는다' },
  { id: 'raid_sorcerer', bgm: 'nx_32_An_ancient_ghost', raid: true, title: '혼을 부리는 자',
    lines: {'enter': '흐흐… 혼을 거두러 제 발로 왔구나.', 'p1': '일어나라, 원혼들아. 저들을 데려가라.', 'p2': '저주는 비처럼 내리고, 너희는 젖으리라.', 'summon': ['떠도는 혼들아, 내 부름에 답하라.', '흐흐, 혼은 얼마든지 있다.'], 'kill': ['그 혼, 잘 쓰마.', '하나 더 거두었다.'], 'killHealer': '기원을 올리던 그 혼, 특히 맛있겠구나.', 'low': '내 술법이… 흐트러진다…', 'enrage': '모든 혼이 내 것이다!', 'death': '흑… 혼들이… 나를…'}, name: '흑술사 레이드', lv: '파티', terrain: 'house', level: 9, open: 'goblin',
    pages: [312, 1001], boss: { id: '10003', name: '흑술사', scale: 1.3 }, patterns: ['rain', 'ring'], fx: '120',
    intro: '흉가 깊은 곳에서 혼을 부리는 술사. 하늘에서 저주가 비처럼 떨어진다' },
  { id: 'raid_sea', bgm: 'nx_10_4way_battle', raid: true, title: '깊은 바다의 왕',
    lines: {'enter': '바다를 더럽히는 뭍것들아, 물속에서 숨이나 쉬어 보거라.', 'p1': '파도야, 일어라! 수병들은 앞으로!', 'p2': '소용돌이에 휘말려 가라앉아라!', 'summon': ['수병들아, 창을 들어라!', '깊은 곳의 것들아, 올라오너라!'], 'kill': ['물거품이 되었구나.', '바다는 넓고, 너희는 작다.'], 'killHealer': '상처를 씻어 주던 자도 물거품이 되었다.', 'low': '바다가… 나를 떠나는가…', 'enrage': '온 바다가 너희를 삼키리라!', 'death': '깊은… 바다로… 돌아간다…'}, name: '해왕 레이드', lv: '파티', terrain: 'sea', level: 11, open: 'sea',
    pages: [701, 702, 703, 704, 705, 706, 707, 708], boss: { id: '3076', name: '해왕', scale: 1.2 },
    patterns: ['ring', 'breath'], fx: '123', intro: '바닷속 깊은 곳의 큰 뱀. 물결이 소용돌이친다' },
  { id: 'raid_fire', bgm: 'nx_27_4beast_born_from_the_lava', raid: true, title: '천 년의 불',
    lines: {'enter': '…뜨겁지? 이 불은 화산이 천 년 품은 것이다.', 'p1': '불씨들아, 깨어나라!', 'p2': '용암이 끓어오른다. 녹아 버려라!', 'summon': ['불의 혼들아, 타올라라!', '화산이 너희를 부른다.'], 'kill': ['재가 되었구나.', '불은 가리지 않는다.'], 'killHealer': '치유의 빛도 불 앞에서는 꺼지는 법.', 'low': '불꽃이… 사그라든다…', 'enrage': '모든 것을 재로!', 'death': '다시… 타오를… 날까지…'}, name: '화령 레이드', lv: '파티', terrain: 'lava', level: 12, open: 'volcano',
    pages: [1703, 1704, 1707], boss: { id: '5026', name: '화령', scale: 1.4 }, patterns: ['meteor', 'plus'], fx: '92',
    intro: '화산의 불이 모여 된 혼. 유성과 불기둥이 땅을 가른다' },
];
export const RAID_BOSS_AT = 15, RAID_LIMIT = 8 * 60;
export const MINI_AT = [135, 285];
export const CHAMPIONS_AT = [90, 180, 270];

// Shared effects: hit spark, death puff, level-up, heal, shield and the ghost a dead hero becomes.
// Shared effects, by the site's numbers: level-up (봉황의기원), potion heal (바다의기원), 보호, 소환, and the
// outline figure (무영보법) for the ghost. No spark on plain hits: the client drew none.
// 150 is 봉황의기원 and 151 갑판원의걸음 in the site's list: neither belongs to a level-up or a
// ghost. A level-up shows no picture, as in the client (a message and a sound); 129 is 부활.
export const FX = { hit: null, death: null, levelup: null, revive: '129', heal: null, ghost: null, shield: '77', summon: '44' };

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
    // A grown spell reaches as far as 8단 does, but strikes as a 5단 would: its own power is in
    // its shape (a triangle, the whole screen), not in a number grown four times over.
    // +15% a 단 (8단 is 2.7 times 1단).
    dmg: (s.dmg || 0) * Math.pow(1.15, s0.evolved ? 4 : l) * (1 + 0.1 * p.power),
    cd: s.cd * Math.pow(0.93, l) * Math.pow(0.92, p.haste),
    // Tiles: reach grows by one every three levels, and with 공력.
    range: (s.range || 0) + Math.floor(l / 3) + Math.floor(p.area / 2),
    // Only a spell that already strikes an area grows it; a single blow stays single.
    radius: !s.radius ? 0 : s.radius + Math.floor(level / 4) + Math.floor(p.area / 3),
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
  if (s.kind === 'buff') return '지속 시간 +10%, 재사용 -7%';
  const parts = ['피해 +15%', '재사용 -7%'];
  if ((level === 4 || level === 7) && s.kind !== 'cleave' && s.kind !== 'nova')
    parts.push(s.kind === 'summon' ? '소환 +1' : '대상 +1');
  if (s.range && (level - 1) % 3 === 0) parts.push('거리 +1칸');
  if (s.kind === 'cleave' && !s.depth && level % 4 === 0) parts.push('앞쪽 역삼각형이 한 줄 깊어진다');
  else if (s.shape === 'plus' && level % 4 === 0) parts.push('+자 팔이 한 칸 길어진다');
  else if (s.radius && level % 4 === 0) parts.push('범위 +1칸');
  return parts.join(', ');
}
