// ============================================================================
// ai/difficulty.js — 난이도 프리셋 (게임플레이 감각/AI 행동 설정값)
//
// grain 명세대로 난이도를 세 축으로 파라미터화한다:
//   - 생각속도: thinkMs ± thinkJitter (한 피스를 두기 전 반응/숙고 시간)
//   - 실수확률: mistakeProb (최적 대신 차선 배치를 고를 확률) + mistakePool
//   - 공격성:  aggression (테트리스 우물 선호 강도) + lookahead/beam(수읽기 깊이)
// moveMs는 회전·이동 한 스텝 사이 간격(손놀림 속도)이다.
//
// 이 값들은 사용자가 "난이도"로 체감하지만 시각 스타일(색/서체/간격/그림자)이
// 아니므로 디자인 토큰이 아니다 — DAS/ARR 입력 타이밍과 동일 분류(구현 설정값,
// Spec 미기록). 가중치는 heuristics.DEFAULT_WEIGHTS를 공유한다.
// ============================================================================

import { DEFAULT_WEIGHTS } from './heuristics.js';

/**
 * 난이도별 봇 행동 파라미터.
 *  thinkMs/thinkJitter : 새 피스 등장 후 첫 동작까지의 지연(평균±진폭).
 *  moveMs/moveJitter   : 회전/이동 한 스텝 간격(평균±진폭).
 *  mistakeProb         : 최적 배치 대신 차선을 고를 확률.
 *  mistakePool         : 실수 시 고를 차선 후보 풀 크기(상위 N개 중 무작위).
 *  lookahead/beam      : 다음 피스 수읽기 깊이/빔 너비(0이면 비활성).
 *  aggression          : 0..1, 테트리스 우물 선호 강도.
 */
export const DIFFICULTIES = Object.freeze({
  easy: Object.freeze({
    name: 'easy',
    thinkMs: 520,
    thinkJitter: 280,
    moveMs: 135,
    moveJitter: 70,
    mistakeProb: 0.4,
    mistakePool: 7,
    lookahead: 0,
    beam: 0,
    aggression: 0,
    weights: DEFAULT_WEIGHTS,
  }),
  medium: Object.freeze({
    name: 'medium',
    thinkMs: 300,
    thinkJitter: 170,
    moveMs: 72,
    moveJitter: 36,
    mistakeProb: 0.12,
    mistakePool: 4,
    lookahead: 0,
    beam: 0,
    aggression: 0.35,
    weights: DEFAULT_WEIGHTS,
  }),
  hard: Object.freeze({
    name: 'hard',
    thinkMs: 150,
    thinkJitter: 110,
    moveMs: 34,
    moveJitter: 18,
    mistakeProb: 0.02,
    mistakePool: 2,
    lookahead: 1,
    beam: 8,
    aggression: 0.85,
    weights: DEFAULT_WEIGHTS,
  }),
});

/** 난이도 이름 목록(낮음→높음). g8 선택 UI가 참조 가능. */
export const DIFFICULTY_ORDER = Object.freeze(['easy', 'medium', 'hard']);

/**
 * 난이도 입력을 정규화한다.
 * @param {string|object} d  프리셋 이름 또는 부분 오버라이드 객체
 * @returns {object} 완성된 난이도 설정
 */
export function resolveDifficulty(d) {
  if (typeof d === 'string') {
    return DIFFICULTIES[d] || DIFFICULTIES.medium;
  }
  if (d && typeof d === 'object') {
    const base = (d.name && DIFFICULTIES[d.name]) || DIFFICULTIES.medium;
    return { ...base, ...d };
  }
  return DIFFICULTIES.medium;
}
