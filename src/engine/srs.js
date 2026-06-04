// ============================================================================
// srs.js — Super Rotation System 월킥 테이블 (표준)
//
// 캐노니컬 데이터는 Tetris 가이드라인 표기(y가 위로 +)로 보관한다.
// 엔진 좌표는 y가 아래로 + 이므로, 적용 시 y 성분 부호를 뒤집는다.
// (KICKS()가 변환을 끝낸 보드 좌표 오프셋을 돌려준다.)
//
// 상태 인덱스: 0=spawn, 1=R, 2=180, 3=L
// 전이 키: `${from}>${to}` (from,to ∈ 0..3, |from-to|=1 mod 4)
// 각 전이는 5개의 후보 오프셋 [x,y]를 순서대로 시도한다(첫 성공 채택).
// ============================================================================

// JLSTZ 공용 월킥 (가이드라인 y-up).
const JLSTZ_YUP = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};

// I 피스 전용 월킥 (가이드라인 y-up).
const I_YUP = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
};

// y-up → 보드 좌표(y-down) 변환: y 부호 반전. x는 그대로(둘 다 오른쪽 +).
function toBoardKicks(table) {
  const out = {};
  for (const key of Object.keys(table)) {
    out[key] = Object.freeze(
      table[key].map(([x, y]) => Object.freeze({ x, y: -y })),
    );
  }
  return Object.freeze(out);
}

const JLSTZ = toBoardKicks(JLSTZ_YUP);
const I = toBoardKicks(I_YUP);

/**
 * 주어진 피스 타입과 회전 전이에 대한 월킥 후보 오프셋(보드 좌표) 배열을 반환.
 * O 피스는 회전해도 형태가 동일하므로 단일 [0,0] 후보만 반환한다.
 *
 * @param {string} type  'I'|'O'|'T'|'S'|'Z'|'J'|'L'
 * @param {number} from  0..3
 * @param {number} to    0..3
 * @returns {{x:number,y:number}[]}
 */
export function getKicks(type, from, to) {
  if (type === 'O') return [{ x: 0, y: 0 }];
  const key = `${from}>${to}`;
  const table = type === 'I' ? I : JLSTZ;
  return table[key] || [{ x: 0, y: 0 }];
}

/**
 * SRS 월킥에서 "마지막 후보(인덱스 4)"는 T-스핀 미니→정식 승격에 쓰인다.
 * (가이드라인의 큰 오프셋 킥이 성공하면 미니라도 정식 T-스핀으로 인정.)
 * 사용된 킥 인덱스가 마지막(4)인지 판단하는 헬퍼.
 */
export function isLastKickIndex(type, from, to, kickIndex) {
  const kicks = getKicks(type, from, to);
  return kickIndex === kicks.length - 1 && kicks.length === 5;
}

export const KICK_TABLES = Object.freeze({ JLSTZ, I });
