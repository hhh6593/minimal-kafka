// 격 (格): an equipment's proc, as 바람의나라 has it — a magic the piece looses by itself, by
// chance, when its wearer strikes (a weapon) or is struck (an armour); and the 상태이상 that some
// of them, and the bosses, inflict.
//
// The chances, cooldowns and effects are 바람의나라 연's own (its Strings Buff_5005-5096 and
// 8000-8099: "타격 시 X% 확률, 재사용 대기 Ys"), taken at their middle 단계 where 연 has three;
// the pictures are the 격 prefabs of 연 (fx "g_<name>", tools/prepare_assets.py ygyeok). Where
// the PC original names a 격 (저주격, 용마제X격, 청린수폭) its rule is followed.
//
// A 격's damage is in "격 power": a multiple of the wearer's own blow at their level (see
// gyeokBase() in game.js), so it stays worth having at every stage, like the original's 직타
// that ignores armour.

export const STATUS = {
  // id: name, icon (hud/st_<icon>.png), colour of its numbers, what it does (game.js)
  poison: { name: '중독', icon: 'debuff_poison1', color: '#6ad04a', text: '초당 피해' },
  venom: { name: '맹독', icon: 'debuff_poison2', color: '#b05ae0', text: '강한 초당 피해' },
  bleed: { name: '출혈', icon: null, color: '#e02a2a', text: '초당 피해, 겹쳐 쌓임' },
  burn: { name: '화상', icon: null, color: '#ff8a2a', text: '초당 피해' },
  stun: { name: '기절', icon: 'icon_stun', text: '행동 불가' },
  para: { name: '마비', icon: 'icon_paralysis', text: '행동 불가' },
  freeze: { name: '빙결', icon: 'icon_freezen', text: '이동 불가' },
  curse: { name: '저주', icon: 'debuff_gumiho_01', text: '받는 피해 증가' },
  despair: { name: '절망', icon: 'debuff_dead_1', text: '주는 피해 감소' },
  silence: { name: '침묵', icon: 'icon_silence', text: '기술 봉인' },
  slow: { name: '둔화', icon: null, text: '이동 느려짐' },
  mark: { name: '주작의 불꽃', icon: null, text: '나에게 받는 피해 증가' },
};

// on: 'hit' (the wearer strikes) or 'hurt' (the wearer is struck).
// dmg: 격 power; area: tiles around the struck (0 = the one); targets: up to n nearby.
// st: [status, seconds, strength]; self: a buff on the wearer [kind, seconds, amount].
export const GYEOK = {
  // 분노 격 (연 Buff 5027-5054): a pure blow, 15%, 20 s.
  yeomryeong: { name: '염령의 분노', on: 'hit', chance: 0.15, cd: 20, dmg: 3, fx: 'g_flame' },
  noeryeong: { name: '뇌령의 분노', on: 'hit', chance: 0.15, cd: 20, dmg: 3, fx: 'g_astra' },
  jiryeong: { name: '지령의 분노', on: 'hit', chance: 0.15, cd: 20, dmg: 3, fx: 'g_sola', st: ['poison', 5, 1] },
  turyeong: { name: '투령의 분노', on: 'hit', chance: 0.15, cd: 20, dmg: 3, fx: 'g_wind' },
  giryeong: { name: '기령의 분노', on: 'hit', chance: 0.15, cd: 20, dmg: 3, fx: 'g_forest' },
  bingryeong: { name: '빙령의 분노', on: 'hit', chance: 0.15, cd: 20, dmg: 3, fx: 'g_island_lancer', st: ['freeze', 1.5] },
  cheonbuyeon: { name: '천부연 격', on: 'hit', chance: 0.15, cd: 5, dmg: 1.5, fx: 'g_mountain' },
  gwimunsan: { name: '귀문진산격', on: 'hit', chance: 0.15, cd: 20, dmg: 3.5, fx: 'g_jinsan' },
  gwimunhon: { name: '귀문진혼격', on: 'hit', chance: 0.15, cd: 20, dmg: 3.5, fx: 'g_jinhon' },
  jiok: { name: "극'지옥격", on: 'hit', chance: 0.15, cd: 15, dmg: 3, targets: 4, fx: 'g_hell_weapon' },
  nakroe: { name: '낙뢰격', on: 'hit', chance: 0.1, cd: 25, dmg: 4, targets: 2, fx: 'g_harrzud', self: ['pierce', 3, 0.25] },
  // 상태이상 격 (연 Buff 5015-5025, 8000-8070).
  hwaryun: { name: '화륜옥쇄 격', on: 'hit', chance: 0.1, cd: 40, dmg: 5, area: 1, fx: 'g_china', st: ['para', 1] },
  saseong: { name: '사성격', on: 'hit', chance: 0.1, cd: 25, dmg: 2.5, fx: 'g_grade4', st: ['bleed', 5, 1] },
  hwasin: { name: '화신축융 격', on: 'hit', chance: 0.2, cd: 20, dmg: 4, area: 1, fx: 'g_god_of_fire', st: ['stun', 1.5] },
  ilwol: { name: '일월남매 격', on: 'hit', chance: 0.2, cd: 20, dmg: 3.5, area: 1, fx: 'g_sunmoon', st: ['curse', 5] },
  gwimunsang: { name: '귀문진상격', on: 'hit', chance: 0.2, cd: 20, dmg: 3.5, area: 1, fx: 'g_grab_ghost', st: ['despair', 6] },
  cheonja: { name: '천자의분노 격', on: 'hit', chance: 0.2, cd: 20, dmg: 3.5, area: 1, fx: 'g_anger_son', self: ['pierce', 5, 0.2] },
  // 기원 격: the blow that heals (연 8030 진청룡마령참 격: 체력·마력 50% 회복).
  maryeongcham: { name: '진청룡마령참 격', on: 'hit', chance: 0.2, cd: 20, dmg: 4, area: 1, fx: 'g_roaring_dragon', heal: 0.5 },
  // 주작선장's own (연 8080 주작비상 격): fire around and the wearer's party strengthened.
  jujakbisang: { name: '주작비상 격', on: 'hit', chance: 0.2, cd: 20, dmg: 4.5, area: 2, fx: 'g_zuzak_captain', st: ['burn', 4, 1.5], self: ['power', 6, 0.3], party: true },
  // The PC original's three common 격 (공식 지식인: 저주격 / 데미지격 / 노도성황격) and its
  // status 격 (연 skills 30701 저주, 30801 중독, 30901 마비, 31001 절망, 33101 혼마염, 3000271 흡혈).
  jeoju: { name: '저주격', on: 'hit', chance: 0.15, cd: 12, dmg: 1.5, fx: 'g_curse_zod', st: ['curse', 6] },
  jungdok: { name: '중독격', on: 'hit', chance: 0.2, cd: 8, dmg: 1, fx: 'g_poison_green', st: ['poison', 6, 1] },
  maengdok: { name: '맹독격', on: 'hit', chance: 0.2, cd: 10, dmg: 1.5, fx: 'g_poison_purple', st: ['venom', 6, 1] },
  mabi: { name: '마비격', on: 'hit', chance: 0.12, cd: 14, dmg: 1.5, fx: 'g_china', st: ['para', 1.5] },
  gijeol: { name: '기절격', on: 'hit', chance: 0.12, cd: 14, dmg: 2, fx: 'g_god_of_fire', st: ['stun', 1.2] },
  jeolmang: { name: '절망격', on: 'hit', chance: 0.15, cd: 14, dmg: 1.5, fx: 'g_grab_ghost', st: ['despair', 6] },
  honma: { name: '혼마격', on: 'hit', chance: 0.15, cd: 14, dmg: 2, fx: 'g_jinsan', st: ['curse', 5], st2: ['slow', 3] },
  hwasang: { name: '화상격', on: 'hit', chance: 0.18, cd: 10, dmg: 1.5, fx: 'g_flame', st: ['burn', 5, 1] },
  binggyeol: { name: '빙결격', on: 'hit', chance: 0.12, cd: 12, dmg: 1.5, fx: 'g_freeze_hit', st: ['freeze', 2] },
  heupyeol: { name: '흡혈격', on: 'hit', chance: 0.25, cd: 4, dmg: 1.5, fx: 'g_nura_bleed', drain: 0.6 },
  // 얼음칼의 냉기 (연 5005): 2%, the struck held in place 4 s.
  naenggi: { name: '얼음칼의 냉기', on: 'hit', chance: 0.02, cd: 0, dmg: 0, fx: 'g_freeze_hit', st: ['freeze', 4] },

  // 사신수 (연 5007-5014, and 진'청룡신검's 청린수폭).
  jujakbul: { name: '주작의 불꽃', on: 'hit', chance: 0.12, cd: 8, dmg: 2, fx: 'g_tf_zuzak', st: ['mark', 8, 0.3], st2: ['burn', 4, 1] },
  cheongsinsok: { name: '청룡의 신속', on: 'hit', chance: 0.12, cd: 10, dmg: 1.5, fx: 'g_tf_chungryong', self: ['speed', 5, 0.35] },
  baekmaeng: { name: '백호의 맹렬', on: 'hit', chance: 0.12, cd: 10, dmg: 4, area: 1, fx: 'g_tf_backho', self: ['power', 6, 0.2] },
  hyeoncheorong: { name: '현무의 철옹', on: 'hurt', chance: 0.25, cd: 10, dmg: 1, area: 1, fx: 'g_tf_hyunmu', st: ['stun', 2], self: ['ward', 4, 0.4] },
  cheongrin: { name: '청린수폭', on: 'hit', chance: 0.2, cd: 6, dmg: 3.5, area: 1, fx: 'g_tf_chungryong', st: ['curse', 5], st2: ['slow', 5], drain: 0.03 },

  // 갑옷의 반격 격 (a boss's armour): struck, it answers in the boss's own way.
  // (made per boss below: GYEOK['ban_' + status])
};

// Armour of a boss: when struck, 20% to put its status on the attacker (and those beside).
for (const [st, sec] of [['poison', 5], ['venom', 5], ['bleed', 5], ['burn', 5], ['stun', 1.5], ['para', 1.2], ['freeze', 2], ['curse', 6], ['despair', 6]]) {
  GYEOK['ban_' + st] = { name: `${STATUS[st].name} 반격`, on: 'hurt', chance: 0.2, cd: 6, dmg: 1, area: 1,
    fx: GYEOK[{ poison: 'jungdok', venom: 'maengdok', bleed: 'saseong', burn: 'hwasang', stun: 'gijeol', para: 'mabi', freeze: 'binggyeol', curse: 'jeoju', despair: 'jeolmang' }[st]].fx,
    st: [st, sec, 1] };
}

/** One line for a 격, for the equipment window. */
export function gyeokText(id) {
  const g = GYEOK[id];
  if (!g) return '';
  const when = g.on === 'hurt' ? '맞을 때' : '타격 시';
  const bits = [];
  if (g.dmg) bits.push(g.area ? '주변 피해' : g.targets ? `${g.targets}명 피해` : '추가 피해');
  if (g.st) bits.push(STATUS[g.st[0]].name);
  if (g.st2) bits.push(STATUS[g.st2[0]].name);
  if (g.heal) bits.push(`체력·마력 ${g.heal * 100}% 회복`);
  if (g.drain) bits.push('흡혈');
  if (g.self) bits.push({ power: '공격 강화', speed: '이동 속도', pierce: '관통', ward: '받는 피해 감소' }[g.self[0]]);
  return `${g.name}: ${when} ${Math.round(g.chance * 100)}%${g.cd ? ` (재사용 ${g.cd}초)` : ''} · ${bits.join(' · ')}`;
}

// Each boss's status (research: S/gyeok/research.md §5) — what its specials carry and what its
// blows put on the hero. weapon: the weapon's 격; looks: the weapon picture per class, then the
// armour and the shield (names in avatar.js lines; a name a line lacks keeps the old pick).
export const SOURCE_GYEOK = {
  novice: { st: 'slow', weapon: 'turyeong', looks: ['목검', '비늘단도', '해룡의지팡이', '흑단부채', '남자갑옷', '나무방패'] },
  rat: { st: 'bleed', weapon: 'heupyeol', looks: ['철검', '가시철단도', '월광천봉', '대붓', '호위무사옷', '보라방패'] },
  snake: { st: 'poison', weapon: 'jungdok', looks: ['백화검', '가시철단도', '월광천봉', '대붓', '남자갑주', '사각방패'] },
  deer: { st: 'stun', weapon: 'gijeol', looks: ['철검', '철도', '원혼의낫', '백운장', '남자갑주', '사각방패'] },
  pig: { st: 'stun', weapon: 'gijeol', looks: ['환두대도', '철도', '일월대도', '백운장', '비늘남자갑주', '철방패'] },
  bear: { st: 'bleed', weapon: 'saseong', looks: ['환두대도', '진아광검', '일월대도', '하늘개비', '비늘남자갑주', '철방패'] },
  fox: { st: 'curse', weapon: 'jeoju', looks: ['칠지도', '도룡보도', '원혼의낫', '하늘개비', '자개망토옷', '거울방패'] },
  haunt: { st: 'despair', weapon: 'gwimunsang', looks: ['칠지도', '저주의단검', '원혼의낫', '자월초롱', '해골갑옷', '주술방패'] },
  goblin: { st: 'stun', weapon: 'gwimunsan', looks: ['도깨비방망이', '철도', '도깨비방망이', '검정깃발', '흑영협객도복', '문신방패'] },
  bandit: { st: 'bleed', weapon: 'saseong', looks: ['환두대도', '철도', '일월대도', '백운장', '무도가옷', '철방패'] },
  japan: { st: 'para', weapon: 'hwaryun', looks: ['칠지도', '진아광검', '현랑부', '하늘개비', '남자기모노', '월광방패'] },
  sea: { st: 'freeze', weapon: 'bingryeong', looks: ['청룡의검', '얼음칼', '해룡의지팡이', '하늘개비', '용왕의용포', '거문고'] },
  island: { st: 'poison', weapon: 'jiryeong', looks: ['칠지도', '도룡보도', '현랑부', '하늘개비', '원주민의옷', '대나무방패'] },
  volcano: { st: 'burn', weapon: 'yeomryeong', looks: ['주작의검', '횃불', '흑단화염장', '건곤권', '불의갑주', '일광방패'] },
  rabbit: { st: 'stun', weapon: 'gijeol', looks: ['백화검', '비늘단도', '월광천봉', '대붓', '남자갑주', '사각방패'] },
  bigsnake: { st: 'venom', weapon: 'maengdok', looks: ['청룡의검', '도룡보도', '해룡의지팡이', '탁조', '비늘남자갑주', '백룡현갑'] },
  bearman: { st: 'stun', weapon: 'hwasin', looks: ['참마도', '진아광검', '일월대도', '하늘개비', '궁중무사갑주', '천성대방패'] },
  mantis: { st: 'bleed', weapon: 'saseong', looks: ['칠지도', '진아광검', '현랑부', '하늘개비', '무도가옷', '월광방패'] },
  skull: { st: 'despair', weapon: 'gwimunhon', looks: ['참마도', '저주의단검', '심판의낫', '자월초롱', '해골갑옷', '주술방패'] },
  steppe: { st: 'bleed', weapon: 'giryeong', looks: ['환두대도', '진아광검', '일월대도', '백운장', '남자무사옷', '떡갈나무방패'] },
  yogoe: { st: 'curse', weapon: 'honma', looks: ['참마도', '저주의단검', '원혼의낫', '자월초롱', '자개망토옷', '주술방패'] },
  palace: { st: 'freeze', weapon: 'maryeongcham', looks: ['청룡의검', '도룡보도', '해룡의지팡이', '하늘개비', '용왕의용포', '백룡현갑'] },
  royal: { st: 'curse', weapon: 'cheonja', looks: ['참마도', '진아광검', '심판의낫', '자월초롱', '곤룡포', '천성대방패'] },
  hwagwa: { st: 'burn', weapon: 'hwasin', looks: ['삼첨도', '진아광검', '흑단화염장', '하늘개비', '장삼', '연등'] },
  murim: { st: 'para', weapon: 'turyeong', looks: ['일월대도', '진아광검', '일월대도', '백운장', '무도가옷', '월광방패'] },
  musin: { st: 'bleed', weapon: 'nakroe', looks: ['참마도', '비늘단도', '해룡의지팡이', '흑단부채', '남자기모노', '월광방패'] },
  deepsea: { st: 'freeze', weapon: 'bingryeong', looks: ['현무의검', '탁조', '얼음칼', '현무의검', '선녀의옷', '거문고'] },
  kirin: { st: 'para', weapon: 'noeryeong', looks: ['청룡의검', '진아광검', '일월대도', '하늘개비', '궁중무사갑주', '천성대방패'] },
  tagye: { st: 'despair', weapon: 'jiok', looks: ['참마도', '저주의단검', '심판의낫', '자월초롱', '황혼의갑주', '주술방패'] },
  raid_boar: { st: 'stun', weapon: 'hwasin' },
  raid_tiger: { st: 'bleed', weapon: 'baekmaeng' },
  raid_goblin: { st: 'stun', weapon: 'gwimunsan' },
  raid_hydra: { st: 'venom', weapon: 'hwaryun' },
  raid_sorcerer: { st: 'curse', weapon: 'jeoju' },
  raid_sea: { st: 'freeze', weapon: 'binggyeol' },
  raid_fire: { st: 'burn', weapon: 'jujakbul' },
  raid_wukong: { st: 'stun', weapon: 'cheonbuyeon' },
  raid_musin: { st: 'burn', weapon: 'yeomryeong' },
  raid_brit: { st: 'despair', weapon: 'jiok' },
  raid_gwoe: { st: 'despair', weapon: 'gwimunhon' },
  raid_varuna: { st: 'freeze', weapon: 'cheongrin' },
  raid_agni: { st: 'burn', weapon: 'hwasin' },
  raid_airavata: { st: 'para', weapon: 'nakroe' },
};

// Today's crafted weapons, by the 연 격 their set carries: 중국전설 금린 → 화륜옥쇄 (its own
// China prefab), 일본전설 무신 → 사성격 (4th grade), 타계 고대마령 → 귀문진상, the old
// material crafts by their stuff.
export const CRAFT_GYEOK = {
  cr_fur_weapon: 'turyeong', cr_horn_weapon: 'gwimunsan', cr_bone_weapon: 'gwimunhon', cr_ember_weapon: 'yeomryeong',
  cr_gold_weapon: 'hwaryun', cr_gold_weapon2: 'hwaryun', cr_steel_weapon: 'saseong', cr_steel_weapon2: 'saseong',
  cr_maryeong_weapon: 'gwimunsang',
  cr_sinsu_cheong: 'cheongrin', cr_sinsu_jujak: 'jujakbisang', cr_sinsu_baekho: 'baekmaeng', cr_sinsu_hyeonmu: 'hyeoncheorong',
};

// 용무기: 용X제N격, a blow of fixed weight that the higher steps loose more often (the original's
// 용마제일격 2,500 … 제구격 250,000, chance rising with the number), and the class's core spell
// sooner at 제구 (−35%) and 제십 (−50%); the 주술사's 용랑 and the 도사's 용겸 also lay their 주
// (방어 약화 = 저주) with it.
export const DRAGON_CORE = { warrior: ['w_frenzy'], rogue: ['r_heaven'], mage: ['m_sammae'], poet: ['p_baekho', 'p_baekho2'] };
export function dragonGyeok(cls, step) {
  const head = { warrior: '용마', rogue: '용천', mage: '용랑', poet: '용겸', archer: '용섬', lancer: '용무', monk: '용비', magus: '용화' }[cls] || '용';
  const num = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구', '십'][step];
  return { name: `${head}제${num}격`, on: 'hit', chance: 0.04 + 0.02 * step, cd: 3, dmg: 1 + 0.6 * step,
    fx: step >= 7 ? 'g_pet_dragon' : 'g_hell_weapon', st: cls === 'mage' || cls === 'poet' ? ['curse', 4] : null,
    cdCut: step >= 10 ? 0.5 : step >= 9 ? 0.35 : 0 };
}

// The 용무기 at 제십 takes one 사신수 (연's 주작의/청룡의/백호의/현무의 용X제십검, items 1001119 …).
export const SINSU = {
  jujak: { name: '주작', gyeok: 'jujakbul', mat: 'sinsu_jujak' },
  cheong: { name: '청룡', gyeok: 'cheongsinsok', mat: 'sinsu_cheong' },
  baekho: { name: '백호', gyeok: 'baekmaeng', mat: 'sinsu_baekho' },
  hyeonmu: { name: '현무', gyeok: 'hyeoncheorong', mat: 'sinsu_hyeonmu' },
};
