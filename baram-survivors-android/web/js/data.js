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
  w_talm: { promo: 4, cls: 'warrior', req: 18, name: '탈명사식\'염', kind: 'strike', fx: '139', dmg: 44, cd: 3.5, range: 7, radius: 1,
    count: 1, hitAt: 0.3, shape: 'plus', strongest: true, desc: '불의 탈명사식. 가장 강한 몬스터(보스를 먼저)와 그 상하좌우를 불사른다' },
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
    allies: ['3013', '3012', '1022', '1023'], beasts: [null, null, 'jinmyo', 'saryeong', 'heukhwa', 'kurakan', 'garuda', 'ganesha'],
    desc: '불여우와 맹수를 불러 함께 싸우게 한다. 3단부터는 괴수(진묘수·사령웅·흑화랑·쿠라칸·가루다·가네샤)를 부른다' },
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
  p_bagua: { promo: 7, cls: 'poet', req: 27, name: '천신팔괘진', kind: 'screen', fx: '134', modern: 'new_p_break', dmg: 30, cd: 6,
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
  r_shadowclone: { promo: 8, cls: 'rogue', req: 30, name: '그림자분신', kind: 'buff', buff: 'power', fx: '51', cd: 18, duration: 6, power: 1,
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
  m_gale: { promo: 9, cls: 'mage', req: 33, name: '회선격풍', kind: 'strike', fx: '148', dmg: 34, cd: 2.4, range: 7, radius: 2, count: 2,
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
  w_lion: { cls: 'warrior', req: 16, name: '사자후', kind: 'screen', fx: '12', dmg: 7, cd: 9, stun: 1.2, falloff: 0.05,
    desc: '사자처럼 울부짖어 화면의 몬스터를 잠시 얼어붙게 한다' },
  w_ungong: { promo: 4, cls: 'warrior', req: 18, name: '운공체식', kind: 'heal', fx: '138', heal: 26, cd: 15, mana: 0.5,
    desc: '기를 돌려 체력과 마력을 크게 되찾는다' },
  r_muyoung: { cls: 'rogue', req: 4, name: '무영보법', kind: 'blink', fx: '33', dmg: 8, cd: 1.1, range: 3, count: 1,
    desc: '그림자 없는 걸음으로 바라보는 쪽 세 칸 안의 몬스터에게 붙어 벤다' },
  r_nuri: { cls: 'rogue', req: 8, name: '누리의힘', kind: 'buff', buff: 'power', fx: '29', cd: 15, duration: 4, power: 0.5,
    desc: '누리의 힘을 빌려 잠시 공격력이 절반 오른다' },
  r_forget: { cls: 'rogue', req: 10, name: '망각', kind: 'strike', fx: '40', dmg: 4, cd: 5, range: 6, radius: 1, count: 1,
    hitAt: 0.2, stun: 1.5, desc: '몬스터와 그 주위가 싸우던 것을 잊고 잠시 멈춰 선다' },
  r_jiok: { promo: 3, cls: 'rogue', req: 14, name: '지옥무영', kind: 'screen', fx: '56', dmg: 15, cd: 5.5, falloff: 0.06,
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
  m_chaos: { cls: 'mage', req: 16, name: '혼돈', kind: 'screen', fx: '88', dmg: 8, cd: 8, stun: 1,
    desc: '혼돈에 빠뜨려 화면의 몬스터를 잠시 멈추게 한다' },
  m_manpa: { promo: 4, cls: 'mage', req: 18, name: '만파지독', kind: 'screen', fx: '85', dmg: 18, cd: 5.5, curse: 3, slow: 2,
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
};
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
};
const AWAKEN = { w_thunder: 'w_myriad', r_bloom: 'r_gale', m_inferno: 'm_kalpa', p_bagua: 'p_taiji' };
for (const [id, from] of Object.entries(PRE)) SKILLS[id].pre = [from, 3];
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
  w_blackdragon: ['141', c(350), 1.25], w_sentence: ['20', c(170), 1.2], w_dawn: ['21', c(15), 1.3],
  w_swords: ['22', c(185), 1.4], w_advance: ['121', c(45), 1.2],
  r_venom: ['37', c(110), 1.2], r_phantom: ['51', c(275), 1], r_shuriken: ['145', c(0), 0.9],
  r_hidden: ['144', c(260), 1], r_bloom: ['145', c(330), 1], r_kill: ['144', c(0), 1],
  r_flamesword: ['144', c(290), 1.2], r_shadowstar: ['37', c(270), 1.4], r_shadowclone: ['51', c(215), 1.2],
  r_bloodslash: ['145', c(350), 1.2], r_chainstar: ['145', c(240), 1.1],
  m_frost: ['68', c(195), 1.3], m_wisdom: ['115', c(280), 1], m_desert: ['148', c(40), 1],
  m_twin: ['89', c(275), 1.2], m_cross: ['147', c(200), 1], m_inferno: ['148', c(10), 1],
  m_thunderball: ['118', c(205), 1], m_shift: ['98', c(210), 1], m_coldveil: ['96', c(220), 1.2],
  m_gale: ['148', c(150), 1.1], m_shards: ['129', c(185), 1.2],
  p_judge: ['89', c(50), 1.2], p_wargod: ['132', c(0), 1], p_burst: ['131', c(45), 1.1],
  p_realm: ['13', c(120), 1.3], p_bagua: ['134', c(50), 1], p_dragongod: ['150', c(200), 1],
  p_flash: ['68', c(190), 1.2], p_bind: ['115', c(50), 1.2], p_warmth: ['125', c(205), 1],
  p_thunderbomb: ['129', c(30), 1.3], p_skyspirit: ['135', c(185), 1.1],
};
for (const [id, [fx, tint, k]] of Object.entries(LOOKS)) Object.assign(SKILLS[id], { fx, tint, fxk: k });

// 승급 효과: each 승급 makes the class a little stronger for good (피해 +4%, 체력 +8 a step).
export const PROMO_BONUS = { dmg: 0.04, hp: 8 };

export const PROMO_AT = ['rat', 'deer', 'haunt', 'goblin', 'yogoe', 'royal', 'musin', 'kirin', 'tagye'];
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
  { id: 'snake', bgm: 'nx_14_Underground_prison2', name: '뱀굴', lv: '17~20', terrain: 'cave', map: 'gungnae', at: [0.25, 0.535],
    monsters: ['1016', '1018', '1019', '1020', '1021', '12016', '12017'],
    mini: { id: '12013', name: '구렁이', scale: 1.4 }, boss: { id: '12014', name: '왕구렁이', scale: 2 },
    intro: '쥐굴 끝자락과 이어진 뱀들의 소굴' },
  { id: 'deer', bgm: 'nx_12_Baekje_hanseong', name: '사슴굴', lv: '20~40', terrain: 'cave', map: 'gungnae', at: [0.68, 0.17],
    monsters: ['1028', '1029', '1030', '1031', '1003', '1004'], boss: { id: '1032', name: '광록지수', scale: 1.7 },
    intro: '청순록, 적순록, 흑광록, 백광록이 사는 굴' },
  { id: 'pig', bgm: 'nx_28_Barren_plateau', name: '돼지굴', lv: '20~50', terrain: 'cave', map: 'gungnae', at: [0.935, 0.595],
    monsters: ['12020', '12021', '12022', '12023'], mini: { id: '12025', name: '돼지 장수' },
    boss: { id: '12024', name: '홍돼지', scale: 1.7 }, intro: '산돼지와 숲돼지가 먼저 덤벼드는 굴' },
  { id: 'bear', bgm: 'nx_01_Mt_D2', name: '곰·호랑이굴', lv: '20~40', terrain: 'cave', map: 'gungnae', at: [0.935, 0.345],
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
  { id: 'volcano', bgm: 'nx_26_Glowing_Ash', name: '환상의 섬 화산', lv: '99+', terrain: 'lava', map: 'world_4', at: [0.68, 0.18],
    pages: [1703, 1704, 1707], intro: '불의 정령이 들끓는 화산' },
  // Added grounds: each opens when its 'open' ground is conquered, and is as strong as 'level'
  // (the first fourteen are as strong as their place, 0 to 13).
  { id: 'rabbit', bgm: 'nx_09_Brand_new_life', name: '토끼굴', lv: '5~10', terrain: 'cave', map: 'gungnae', at: [0.47, 0.66],
    level: 1, open: 'novice', monsters: ['12065', '12066', '12068', '12069', '12070', '1002'], boss: { id: '12070', name: '토끼 대왕', scale: 2 },
    intro: '알록달록한 토끼들이 모여 사는 굴' },
  { id: 'bigsnake', bgm: 'nx_16_Coast_dungeon', name: '대뱀굴', lv: '18~25', terrain: 'cave', map: 'gungnae', at: [0.22, 0.56],
    level: 3, open: 'snake', pages: [317], boss: { id: '12108', name: '이무기', scale: 1.6 },
    intro: '뱀굴 아래로 이어진 큰 뱀들의 소굴' },
  { id: 'bearman', bgm: 'nx_34_Wind_of_land', name: '곰인굴', lv: '35~45', terrain: 'cave', map: 'gungnae', at: [0.9, 0.38],
    level: 6, open: 'bear', pages: [311], boss: { id: '12050', name: '곰인 족장', scale: 1.3 },
    intro: '곰·호랑이굴 깊은 곳, 사람처럼 서서 걷는 곰들' },
  { id: 'mantis', bgm: 'nx_29_Contaminated_meadow', name: '사마귀굴', lv: '50', terrain: 'cave', map: 'gungnae', at: [0.47, 0.26],
    level: 7, open: 'fox', pages: [308], boss: { id: '12038', name: '사마귀 장수', scale: 1.4 },
    intro: '사마귀 무사들이 지키는 굴' },
  { id: 'skull', bgm: 'nx_32_An_ancient_ghost', name: '해골굴', lv: '60', terrain: 'cave', map: 'gungnae', at: [0.68, 0.1],
    level: 8, open: 'haunt', monsters: ['6005', '6066', '6067', '6068', '3071', '3072', '3073'], boss: { id: '3070', name: '해골왕', scale: 1.1 },
    mini: { id: '3073', name: '저승사자', scale: 1.2 }, intro: '죽어서도 쉬지 못한 해골들이 떠도는 굴' },
  { id: 'steppe', bgm: 'nx_06_Plains_Xianbei', name: '북방대초원', lv: '70~80', terrain: 'field', map: 'world_1', at: [0.36, 0.1],
    level: 9, open: 'goblin', pages: [806, 807], boss: { id: '8042', name: '초원의 주인', scale: 1.2 },
    intro: '바람이 쉬지 않는 북쪽 끝의 초원. 낯선 짐승들이 무리 지어 다닌다' },
  { id: 'yogoe', bgm: 'nx_23_Burning_the_passion', name: '요괴굴', lv: '90~99', terrain: 'cave', map: 'world_1', at: [0.6, 0.58],
    level: 11, open: 'bandit', pages: [902, 904, 906, 907], boss: { id: '2031', name: '요괴왕', scale: 1.2 },
    intro: '불길 속에서 요괴들이 들끓는 굴' },
  { id: 'palace', bgm: 'nx_15_Ghyanmiseong_village', name: '용궁', lv: '99+', terrain: 'sea', map: 'world_1', at: [0.88, 0.8],
    level: 12, open: 'sea', pages: [313], boss: { id: '12064', name: '용궁 장수', scale: 1.1 },
    intro: '바닷속 더 깊은 곳, 용과 수병들이 지키는 궁' },
  { id: 'royal', bgm: 'nx_07_The_great_Wall', name: '왕궁', lv: '99+', terrain: 'house', map: 'gungnae', at: [0.47, 0.47],
    level: 13, open: 'island', pages: [1102, 1103, 1104, 504], boss: { id: '10006', name: '왕궁의 요괴', scale: 1.2 },
    intro: '국내성 한가운데 왕궁. 밤이면 요괴와 반역 무사들이 나타난다' },
  // 대격변: today's client's lands beyond the old map, where the legendary sets' materials fall
  // (금린 in 중국, 순수의 강철 in 일본, 조화의 정수 under the sea, 거마족의 영혼석 in 타계).
  { id: 'hwagwa', v2: true, bgm: 'nx_05_China', name: '화과산', lv: '99+', terrain: 'field', map: 'world_1', at: [0.14, 0.36],
    level: 14, open: 'royal', monsters: ['12026', '12027', '12029', '12033', '12039', '12040', '12041', '12042'],
    mini: { id: '12030', name: '원숭이 장수', scale: 1.1 }, boss: { id: '12046', name: '우마왕', scale: 1.3 },
    intro: '중국 서쪽의 꽃과 열매의 산. 원숭이 무리와 돼지 장수들이 산을 지킨다' },
  { id: 'murim', v2: true, bgm: 'nx_18_Mireuksa', name: '무림 수련장', lv: '99+', terrain: 'house', map: 'world_1', at: [0.24, 0.62],
    level: 14, open: 'royal', monsters: ['9014', '9015', '9016', '9017', '9019', '9007', '9008', '9010'],
    mini: { id: '9011', name: '철권 사범', scale: 1.1 }, boss: { id: '9018', name: '무림 고수', scale: 1.4 },
    intro: '깊은 산사 아래 수련장. 승려와 무도가들이 손님을 시험한다' },
  { id: 'musin', v2: true, bgm: 'nx_25_Memory_of_sword', name: '무신의 탑', lv: '99+', terrain: 'house', map: 'world_1', at: [0.83, 0.38],
    level: 15, open: 'hwagwa', monsters: ['4001', '4002', '4021', '4022', '4031', '4032', '4003', '4004'],
    mini: { id: '4005', name: '낭인 검객', scale: 1.1 }, boss: { id: '4006', name: '무신', scale: 1.3 },
    intro: '일본 무사들이 칼을 겨루는 탑. 꼭대기에 무신이 산다' },
  { id: 'deepsea', v2: true, bgm: 'nx_02_SEASIDE_TOWN', name: '해저동굴', lv: '99+', terrain: 'sea', map: 'world_1', at: [0.74, 0.86],
    level: 15, open: 'palace', monsters: ['3019', '3020', '3022', '3023', '3025', '3016', '3015'],
    mini: { id: '3021', name: '인어 여왕', scale: 1.0 }, boss: { id: '3027', name: '대왕오징어', scale: 1.2 },
    intro: '용궁보다 깊은 바다 밑 동굴. 인어와 해파리, 거대한 오징어가 산다' },
  { id: 'kirin', v2: true, bgm: 'nx_20_Gold_water', name: '기린산', lv: '99+', terrain: 'field2', map: 'world_1', at: [0.12, 0.14],
    level: 16, open: 'musin', monsters: ['2019', '2020', '2021', '2022', '2023', '2032', '2033', '2034', '2035', '2036'],
    mini: { id: '2024', name: '청기린', scale: 1.0 }, boss: { id: '2037', name: '천마', scale: 1.1 },
    intro: '구름 위에 솟은 산. 기린과 날개 달린 짐승들이 하늘을 달린다' },
  { id: 'tagye', v2: true, bgm: 'nx_30_Fog_Zone', name: '타계 마령굴', lv: '99+', terrain: 'cave', map: 'world_1', at: [0.46, 0.3],
    level: 17, open: 'deepsea', monsters: ['3066', '3067', '3068', '3062', '3063', '3069', '3078', '3079'],
    mini: { id: '3075', name: '마령 장수', scale: 1.0 }, boss: { id: '3074', name: '고대마령', scale: 1.2 },
    intro: '이 세상 밖, 안개 너머의 굴. 거마족의 혼과 고대의 마령이 깨어 있다' },
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
  { id: 'raid_tiger', bgm: 'nx_04_Winds_take2', raid: true, title: '산의 주인',
    lines: {'enter': '어흥… 이 산의 주인을 찾아온 겁 없는 것들이로구나.', 'p1': '산이 울린다. 내 새끼들아, 나와라!', 'p2': '발톱이 무디다고 얕보지 마라!', 'summon': ['곰이며 범이며, 모두 내려오너라!', '산의 짐승들아, 저들을 에워싸라!'], 'kill': ['산은 약한 자를 품지 않는다.', '한 놈 쓰러졌구나.'], 'killHealer': '상처를 핥아 주던 놈이 먼저 쓰러졌구나.', 'low': '제법이구나, 사람들…', 'enrage': '산군의 노여움을 받아라!', 'death': '산이… 고요해지는구나…'}, name: '산군 레이드', lv: '파티', terrain: 'cave', level: 3, open: 'deer',
    monsters: ['1022', '1023', '1027', '1036', '1037'], boss: { id: '1027', name: '산군', scale: 1.7 },
    patterns: ['cross', 'ring'], fx: '20', intro: '산의 주인이라 불리는 호랑이. 사방을 할퀴며 달려든다' },
  { id: 'raid_goblin', bgm: 'nx_22_Burning_the_angry', raid: true, title: '방망이의 왕',
    lines: {'enter': '히히! 금 나와라 뚝딱, 손님 나와라 뚝딱!', 'p1': '얘들아, 방망이 들고 나와라! 놀이 시간이다!', 'p2': '내 방망이를 화나게 했겠다?!', 'summon': ['뚝딱! 도깨비 나와라!', '히히, 더 놀자! 얘들아!'], 'kill': ['히히, 하나 뚝딱!', '방망이 맛이 어떠냐!'], 'killHealer': '히히, 치료하는 놈부터 뚝딱!', 'low': '어, 어라? 이게 아닌데…', 'enrage': '뚝딱! 뚝딱! 다 부숴 버려라!', 'death': '내… 방망이… 돌려줘…'}, name: '도깨비대장 레이드', lv: '파티', terrain: 'cave', level: 5, open: 'fox',
    pages: [801, 802, 804], boss: { id: '8017', name: '도깨비대장', scale: 1.1 },
    patterns: ['rain', 'plus'], fx: '96', intro: '도깨비들을 거느린 대장. 방망이를 휘두르면 땅이 솟는다' },
  { id: 'raid_hydra', bgm: 'nx_33_Dear_ancestor', raid: true, title: '세 머리의 재앙',
    lines: {'enter': '「셋이서 한 번에 먹어 주마.」「아니, 내가 먼저다!」「조용히들 해라.」', 'p1': '머리 하나가 다쳤다고 멈출 줄 아느냐!', 'p2': '세 머리가 모두 깨어났다. 불길이 마르지 않으리라!', 'summon': ['뱀들아, 비늘 아래에서 기어 나와라!', '굴의 뱀들아, 먹이다!'], 'kill': ['한 입 거리도 안 되는군.', '「내 거다!」「아니, 내 거다!」'], 'killHealer': '「치유하는 놈부터 먹어라.」「맛있군.」', 'low': '이럴 수가… 세 머리가… 모두…', 'enrage': '다 태워 버려라!', 'death': '용의… 시대가… 끝나는가…'}, name: '삼두룡 레이드', lv: '파티', terrain: 'cave', level: 7, open: 'haunt',
    monsters: ['1016', '1018', '1019', '1020', '1021', '12016', '12017', '12013'],
    boss: { id: '10014', name: '삼두룡', scale: 1 }, patterns: ['cross', 'breath'], fx: '140',
    intro: '세 머리의 용이 깃든 굴. 머리마다 한 줄씩 불을 뿜는다' },
  { id: 'raid_sorcerer', bgm: 'nx_32_An_ancient_ghost', raid: true, title: '혼을 부리는 자',
    lines: {'enter': '흐흐… 혼을 거두러 제 발로 왔구나.', 'p1': '일어나라, 원혼들아. 저들을 데려가라.', 'p2': '저주는 비처럼 내리고, 너희는 젖으리라.', 'summon': ['떠도는 혼들아, 내 부름에 답하라.', '흐흐, 혼은 얼마든지 있다.'], 'kill': ['그 혼, 잘 쓰마.', '하나 더 거두었다.'], 'killHealer': '기원을 올리던 그 혼, 특히 맛있겠구나.', 'low': '내 술법이… 흐트러진다…', 'enrage': '모든 혼이 내 것이다!', 'death': '흑… 혼들이… 나를…'}, name: '흑술사 레이드', lv: '파티', terrain: 'house', level: 9, open: 'goblin',
    pages: [312, 1001], boss: { id: '10003', name: '흑술사', scale: 1.3 }, patterns: ['rain', 'ring'], fx: '120',
    intro: '흉가 깊은 곳에서 혼을 부리는 술사. 하늘에서 저주가 비처럼 떨어진다' },
  { id: 'raid_sea', bgm: 'nx_17_Sea_battle', raid: true, title: '깊은 바다의 왕',
    lines: {'enter': '바다를 더럽히는 뭍것들아, 물속에서 숨이나 쉬어 보거라.', 'p1': '파도야, 일어라! 수병들은 앞으로!', 'p2': '소용돌이에 휘말려 가라앉아라!', 'summon': ['수병들아, 창을 들어라!', '깊은 곳의 것들아, 올라오너라!'], 'kill': ['물거품이 되었구나.', '바다는 넓고, 너희는 작다.'], 'killHealer': '상처를 씻어 주던 자도 물거품이 되었다.', 'low': '바다가… 나를 떠나는가…', 'enrage': '온 바다가 너희를 삼키리라!', 'death': '깊은… 바다로… 돌아간다…'}, name: '해왕 레이드', lv: '파티', terrain: 'sea', level: 11, open: 'sea',
    pages: [701, 702, 703, 704, 705, 706, 707, 708], boss: { id: '3076', name: '해왕', scale: 1.2 },
    patterns: ['ring', 'breath'], fx: '123', intro: '바닷속 깊은 곳의 큰 뱀. 물결이 소용돌이친다' },
  { id: 'raid_fire', bgm: 'nx_27_4beast_born_from_the_lava', raid: true, title: '천 년의 불',
    lines: {'enter': '…뜨겁지? 이 불은 화산이 천 년 품은 것이다.', 'p1': '불씨들아, 깨어나라!', 'p2': '용암이 끓어오른다. 녹아 버려라!', 'summon': ['불의 혼들아, 타올라라!', '화산이 너희를 부른다.'], 'kill': ['재가 되었구나.', '불은 가리지 않는다.'], 'killHealer': '치유의 빛도 불 앞에서는 꺼지는 법.', 'low': '불꽃이… 사그라든다…', 'enrage': '모든 것을 재로!', 'death': '다시… 타오를… 날까지…'}, name: '화령 레이드', lv: '파티', terrain: 'lava', level: 12, open: 'volcano',
    pages: [1703, 1704, 1707], boss: { id: '5026', name: '화령', scale: 1.4 }, patterns: ['meteor', 'plus'], fx: '92',
    intro: '화산의 불이 모여 된 혼. 유성과 불기둥이 땅을 가른다' },
  // 대격변 raids: the legends of today's client, for the strongest records.
  { id: 'raid_wukong', v2: true, bgm: 'nx_08_2_Goguryeo', raid: true, title: '하늘과 같은 성인',
    lines: {'enter': '하하하! 하늘과 맞먹는 이 몸을 찾아오다니, 배짱 한번 좋구나!', 'p1': '털 한 가닥이면 내가 백이다! 나와라, 분신들아!', 'p2': '여의봉아, 커져라! 하늘까지 닿아라!', 'summon': ['원숭이들아, 산을 내려가라!', '팔계야, 오정아, 거들어라!'], 'kill': ['근두운 한 번이면 끝이지!', '하하, 머리띠도 없는 놈이 덤비긴!'], 'killHealer': '경 읊는 놈부터 혼내 주마! 스승님이 와도 소용없다!', 'low': '이 몸이… 오백 년 갇혔던 것보다 아프구나…', 'enrage': '칠십이 가지 변신을 모두 보여 주마!', 'death': '하늘이… 이번엔 너희 편이로구나…'},
    name: '제천대성 레이드', lv: '파티', terrain: 'field', level: 13, open: 'hwagwa',
    monsters: ['12026', '12027', '12029', '12033', '12039', '12040', '12041'], boss: { id: '12031', name: '제천대성', scale: 1.8 },
    patterns: ['rain', 'cross'], fx: '20', intro: '화과산의 원숭이 왕. 분신을 부르고 여의봉으로 땅을 친다' },
  { id: 'raid_musin', v2: true, bgm: 'nx_10_4way_battle', raid: true, title: '칼끝의 신',
    lines: {'enter': '…칼을 뽑아라. 말은 칼로 하는 것이다.', 'p1': '제자들이여, 칼을 들어라!', 'p2': '태염의 칼이 불을 머금는다.', 'summon': ['닌자들아, 그림자에서 나와라!', '낭인들이여, 이름을 걸고 베어라!'], 'kill': ['한 칼이면 족하다.', '칼끝이 무디구나.'], 'killHealer': '뒤에서 숨을 불어넣는 자부터 베었다.', 'low': '이 칼이… 밀리다니…', 'enrage': '무신의 칼, 이제 멈추지 않는다!', 'death': '좋은… 승부였다…'},
    name: '태염무신 레이드', lv: '파티', terrain: 'house', level: 14, open: 'musin',
    monsters: ['4001', '4002', '4021', '4022', '4031', '4032', '4005'], boss: { id: '4006', name: '태염무신', scale: 1.7 },
    patterns: ['cross', 'plus'], fx: '92', intro: '무신의 탑 꼭대기의 검신. 십자로 베고 불기둥을 세운다' },
  { id: 'raid_brit', v2: true, bgm: 'nx_31_Sealed_Hwanse', raid: true, title: '타계의 마왕',
    lines: {'enter': '봉인이 풀렸다… 이 세상의 물과 숨을 모두 가두어 주마.', 'p1': '거마족이여, 깨어나라! 산 자들을 끌고 가라!', 'p2': '나는 브리트라. 가뭄이요, 막힌 강이다!', 'summon': ['마령들아, 안개 속에서 나와라!', '타계의 문이 열린다!'], 'kill': ['숨이 막히느냐? 그것이 나다.', '하나의 혼이 내 것이 되었다.'], 'killHealer': '생명을 나누는 자여, 네 숨부터 거두었다.', 'low': '또… 봉인되는 것인가…', 'enrage': '모든 물길을 끊어 주마! 타계로 떨어져라!', 'death': '봉인이… 다시… 닫힌다…'},
    name: '브리트라 레이드', lv: '파티', terrain: 'cave', level: 16, open: 'tagye',
    monsters: ['3066', '3067', '3068', '3069', '3078', '3079', '3062'], boss: { id: '10013', name: '브리트라', scale: 1.7 },
    patterns: ['ring', 'meteor', 'breath'], fx: '140', intro: '타계에 봉인되었던 마왕. 혼의 고리와 유성으로 모두를 짓누른다' },
  // 괴수 raids: the client's 괴수의상 (the dress room's beasts) as bosses, walking their four ways.
  { id: 'raid_varuna', v2: true, bgm: 'nx_17_Sea_battle', raid: true, title: '심해의 군주',
    lines: {'enter': '물결이 멈추었다… 바다의 율법을 어긴 자들이로구나.', 'p1': '바다의 아이들아, 저들을 감싸라!', 'p2': '조수가 뒤집힌다. 숨을 아껴 두어라.', 'summon': ['파도야, 저들을 삼켜라!', '심연의 것들이여, 올라오라!'], 'kill': ['물거품이 되어라.', '바다는 약한 것을 품지 않는다.'], 'killHealer': '물을 길어 나르던 자부터 가라앉혔다.', 'low': '썰물이… 오는구나…', 'enrage': '모든 물길이 나를 따른다! 쓸려 가라!', 'death': '바다로… 돌아가겠다…'},
    name: '바루나 레이드', lv: '파티', terrain: 'sea', level: 15, open: 'deepsea',
    monsters: ['3019', '3020', '3022', '3023', '3025', '3016'], boss: { id: '3027', name: '바루나', scale: 1.2, beast: 'varuna' },
    patterns: ['ring', 'breath', 'rain'], fx: '123', intro: '바다를 다스리는 괴수. 물의 고리와 숨결로 파티를 몰아친다' },
  { id: 'raid_agni', v2: true, bgm: 'nx_27_4beast_born_from_the_lava', raid: true, title: '불의 신',
    lines: {'enter': '하하하! 제물이 제 발로 걸어 들어왔구나!', 'p1': '불꽃의 자식들아, 춤을 춰라!', 'p2': '이제야 몸이 데워지는군!', 'summon': ['재 속에서 일어나라!', '불길아, 번져라!'], 'kill': ['잿더미가 되었구나!', '불길은 가리지 않는다!'], 'killHealer': '물 뿌리던 놈부터 태웠다!', 'low': '불씨가… 꺼지지 않는다…', 'enrage': '세상을 모두 태워 주마!', 'death': '불은… 다시… 타오른다…'},
    name: '아그니 레이드', lv: '파티', terrain: 'lava', level: 17, open: 'tagye',
    pages: [1703, 1704, 1707], boss: { id: '10013', name: '아그니', scale: 1.2, beast: 'agni' },
    patterns: ['meteor', 'plus', 'cross'], fx: '92', intro: '불을 다스리는 괴수. 유성과 불기둥이 쉬지 않고 떨어진다' },
  { id: 'raid_airavata', v2: true, bgm: 'nx_08_2_Goguryeo', raid: true, title: '하늘을 받친 코끼리',
    lines: {'enter': '…하늘을 떠받치는 발 아래, 너희는 먼지와 같다.', 'p1': '구름의 짐승들아, 내려오라!', 'p2': '번개가 상아 끝에 맺힌다.', 'summon': ['하늘의 무리여, 모여라!', '구름을 가르고 내려오라!'], 'kill': ['짓밟혔구나.', '하늘은 무겁다.'], 'killHealer': '빛을 비추던 자를 먼저 밟았다.', 'low': '하늘이… 기우는구나…', 'enrage': '천둥과 함께 모두 짓밟아 주마!', 'death': '하늘이… 너희를… 인정하는구나…'},
    name: '아이라바타 레이드', lv: '파티', terrain: 'field2', level: 18, open: 'kirin',
    monsters: ['2019', '2020', '2021', '2032', '2033', '2034'], boss: { id: '2037', name: '아이라바타', scale: 1.2, beast: 'airavata' },
    patterns: ['cross', 'rain', 'ring', 'meteor'], fx: '140', intro: '인드라를 태운 하늘 코끼리. 가장 강한 레이드' },
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
RAIDS.push({ id: 'raid_gwoe', v2: true, gwoe: true, bgm: 'nx_23_Burning_the_passion', raid: true, title: '이번 주의 괴수',
  lines: {'enter': '크르르… 신력을 탐하는 자들이 또 왔구나.', 'p1': '괴수의 피가 끓는다!', 'p2': '이제 진짜 모습을 보여 주마!', 'summon': ['따르는 것들아, 덮쳐라!', '괴수의 무리여!'], 'kill': ['약하다, 약해!', '하나 쓰러졌다!'], 'killHealer': '치유하던 자부터 먹어 치웠다!', 'low': '이 힘이… 빠져나간다…', 'enrage': '모조리 찢어 주마!', 'death': '내 신력을… 가져가라…'},
  name: `괴력난신 · ${gName}`, lv: '파티', terrain: 'cave', level: 14, open: 'royal',
  monsters: ['3066', '3067', '3068', '12026', '12039', '9014'], boss: { id: gHit, name: gName, scale: 1.2, beast: gKey },
  patterns: ['ring', 'cross', 'meteor'], fx: '140',
  intro: `이번 주의 괴수 ${gName}. 쓰러뜨리면 ${gName}의 ★ 효과 카드를 얻는다(주 3번, 월요일에 바뀜)` });

// The ladder in order of strength, whatever order they were written in.
RAIDS.sort((a, b) => a.level - b.level);

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
