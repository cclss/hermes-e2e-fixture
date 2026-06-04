# Recording — grain-7 대전 메커니즘(가비지·콤보 공격·티배깅)

> Spec 확인: `$GENOSIS_SPEC_PATH` 환경변수가 **미설정/빈 값**이라 참조할 기존 Spec
> 디렉터리가 없었다. 따라서 도발/공격 카피·연출 톤에 대한 결정을 새로 내리고 본
> 문서에 recording.md 형식으로 기록한다. 이후 Spec 경로가 생기면 이 문서를 그쪽으로
> 옮기거나 병합한다.

## 1. 톤 & 보이스 (도발/공격 카피)

- **무드**: 네온 아케이드 사이버펑크. 짧고 강한 영문 대문자 캡션(아케이드 어셈블리
  느낌). 디자인 토큰의 `--font-display`(Orbitron) / `--font-label`(Rajdhani) 사용.
- **수위**: "도발적이되 과하지 않게." 비속어·인신공격 금지. 게임플레이 용어를 살린
  **가벼운 약올림** 위주. 도발은 맥락(상대가 KO 직전)에서만, 쿨다운으로 빈도 억제.
- **이중 화자**: 사람(플레이어)과 AI가 서로 도발 가능 → 카피를 화자별로 분리.

### 공격 콜아웃 (`ATTACK_CALLOUTS`)
| 키 | 카피 | 트리거 |
|----|------|--------|
| tetris | `TETRIS!` | 4줄 클리어 |
| tspin | `T-SPIN!` | T스핀(미니/정식) |
| b2b | `BACK-2-BACK!` | B2B 배수 적용 |
| perfectClear | `PERFECT!` | 퍼펙트(올)클리어 |
| (콤보) | `COMBO ×N` | 콤보 3연속+ (사람 친화 표기 N=엔진콤보+1), 다른 콜아웃보다 우선 |

### 플레이어 도발 (티배깅, `PLAYER_TAUNTS`)
`TOO EASY` · `SIT DOWN` · `GG?` · `STAY DOWN`

### AI 도발 (`AI_TAUNTS`, 기계적 위트)
`NICE TRY` · `IS THAT ALL?` · `BEEP BOOP ;)` · `COMPUTED.`

> 카피는 `src/versus/taunts.js` 한 곳에 모아 g8(승패 화면)·g9(사운드)·현지화에서
> 재사용하기 쉽게 했다.

## 2. 연출 톤 (g5 EffectsLayer API 재사용)

- **공격/콤보 콜아웃**: 보드 위 중앙에 잠깐 떠올라 솟아오르며 사라지는 플로팅 텍스트
  (`.battle-callout`, `--ease-arcade` 팝 애니메이션). 콤보는 핫 마젠타·크게, 일반 공격은
  하이라이트색.
- **가비지 수신**: 위험색 전면 플래시(줄 수 비례 강도) + 셰이크(1~4단) + 바닥에서 위로
  분사되는 위험색 스파크. "맞았다"는 타격감을 분명히.
- **도발(티배깅/AI 되받기)**: 피도발 보드에 핫 마젠타 플래시 + 셰이크 + 프레임 글로우
  서지(`fx-surge`) + 약올리는 스파크. **추가 압박은 소량(1줄)·예고로** 들어가 반격
  창을 남긴다("과하지 않게").
- **모션 최소화 선호**: 펄스/팝 애니메이션은 끄되 위협/콜아웃 가독성은 정적으로 유지.

## 3. 공정성 — 예고(텔레그래프) → 삽입 타이밍

- 클리어로 발생한 공격은 **먼저 내 수신 큐를 상쇄(counter)** 하고 잔여만 상대에게 전송.
- 전송분은 `TELEGRAPH_MS=900ms` 동안 **충전(예고)** — 보드 안쪽 가장자리 예고 바와
  중앙 공격 게이지로 보인다. **충전이 끝난(armed) 라인만**, 그것도 **라인을 못 지운
  드롭** 시점에 보드로 들어간다 → 받는 쪽에 항상 반격(상쇄) 기회가 열린다.
- 한 드롭 삽입 상한 `MAX_APPLY_PER_LOCK=8` (인스타킬 방지, 잔여는 다음 드롭으로 이월).

## 4. 공격 테이블 (단일 출처: `src/versus/attack-table.js`)

| 입력 | 전송 라인 |
|------|-----------|
| 싱글 / 더블 / 트리플 / 테트리스 | 0 / 1 / 2 / 4 |
| T스핀 싱글·더블·트리플(정식) | 2 / 4 / 6 |
| T스핀 미니 싱글·더블 | 1 / 2 |
| B2B 보너스 | +1 |
| 콤보(엔진값 인덱싱) | `[0,1,1,2,2,3,3,4,4,5]` (10연속+ 포화 5) |
| 퍼펙트 클리어 | +10 |

가비지 구멍: 같은 배치 내 직전 구멍을 `repeatProb=0.72`로 유지(읽히는 "깨끗한"
가비지), 나머지는 어긋나게(messy) → 결정적 RNG 주입 가능.

## 5. 튜닝 상수(감각값, 디자인 토큰 아님)

`TELEGRAPH_MS=900` · `MAX_APPLY_PER_LOCK=8` · `NEAR_KO_ROWS=5` ·
티배깅 감지 `TAUNT_WINDOW_MS=1200` / `TAUNT_TAPS=4` / `TAUNT_COOLDOWN_MS=2600` /
`TAUNT_EXTRA_LINES=1` · 콤보 콜아웃 임계 `COMBO_CALLOUT_MIN=3`.

## 6. 범위 밖(후속 grain)

- 최종 승패 화면 흐름 → g8.
- 사운드(공격/도발 효과음) → g9.

---

# Recording — grain-8 HUD·화면·게임 흐름

> Spec 확인: `$GENOSIS_SPEC_PATH`는 g8 시점에도 **미설정/빈 값**이라 참조할 기존 Spec
> 디렉터리가 없다. 따라서 화면 구조·UI 카피 톤의 새 결정을 g7과 동일하게 본
> 문서에 recording.md 형식으로 이어 기록한다(경로가 생기면 이 문서를 이전/병합).

## 7. 화면 구조 (전역 씬 흐름)

흐름은 단일 상태기로 묶는다(`src/game/match-flow.js`, `MatchFlow`):

`title → countdown → playing → (paused ↔ playing) → result → (rematch=countdown | menu=title)`

- **전역 씬 오버레이**(`.scene`, `index.html`의 `[data-slot="scene"]`)가 아레나 위에
  얹혀 시작/카운트다운/일시정지/결과를 표시한다. `playing`에서만 `hidden`.
- **경계 준수**: 게임 규칙/스코어/콤보/공격은 엔진(g3)·versus(g7)에만. MatchFlow는
  엔진 `TOPOUT`을 구독해 승패만 가리고, 표시(씬/HUD)와 흐름(freeze/unfreeze)만 한다.
  보드 정지는 `GameSession.setPaused`(엔진 pause 위임)로만 — 상태 변형 없음.
- **승패 판정**: 어느 보드든 `TOPOUT` → 첫 이벤트가 매치 종료(중복은 `_matchOver` 가드).
  플레이어 탑아웃=DEFEAT, AI 탑아웃=VICTORY. 패자 보드는 g5 `triggerKO`가, 승자
  보드는 `.fx-victory` 글로우 서지가 연출(둘 다 반투명 씬 뒤로 비친다).
- **카운트다운**은 `playing` 진입 전과 일시정지 **복귀** 시 모두 사용(즉시 복귀로 인한
  불공정 방지). 3·2·1·FIGHT! — 단계마다 새 요소를 넣어 팝 애니메이션을 리트리거.
- **HUD 보강**: 중앙 HUD에 SCORE/LEVEL/LINES 패널 추가(엔진 스냅샷 구독, 표시 전용).
  per-board 오버레이(g4의 PAUSED/GAME OVER)는 VS에서 `suppressOverlay`로 끄고 전역
  씬이 대신한다.

## 8. UI 카피 톤 (화면 텍스트)

g1~g7과 **일관**되게 "네온 아케이드" — 짧고 강한 영문 대문자 캡션을 화면 UI 전반에
유지한다(페이지 `lang="ko"`이나, 브랜드/HUD/콜아웃이 이미 영문 아케이드 톤이라 톤
일관성을 우선). 약올림/도발 카피는 g7 `taunts.js` 자산을 재사용.

| 화면 | 키 카피 |
|------|---------|
| 시작 | `NEON BLITZ` · `VS A.I. DUEL` · `SELECT RIVAL` · CTA `ENTER THE GRID` |
| 난이도 라벨 | `EASY`/`WARM-UP BOT` · `NORMAL`/`FAIR FIGHT` · `HARD`/`NO MERCY` |
| 카운트다운 | `3` `2` `1` `FIGHT!` |
| 일시정지 | `PAUSED` · `TAKE A BREATH` · `RESUME` · `QUIT TO MENU` |
| 결과 | `K.O.` · `VICTORY`/`DEFEAT` · 승 `RIVAL CIRCUITS FRIED` / 패 `THE MACHINE WINS THIS ROUND` · `REMATCH` · `MAIN MENU` |
| 조작 안내 | `MOVE ◀ ▶ · ROTATE ▲ / Z · SOFT ▼ · HARD ␣ · HOLD C · PAUSE P` |

> 난이도 키(easy/medium/hard)는 `ai/difficulty.js`와 일치시키고, 표시 라벨/플레이버만
> `match-flow.js`의 `DIFFICULTY_LABELS` 한 곳에 둔다(g9 사운드/현지화 재사용 대비).

## 9. 마이크로 인터랙션 / 모션 (토큰 소비)

- **버튼**: 호버/포커스 시 2px 리프트 + 글로우 강화(`--glow-2→3`), 액티브 시 살짝 눌림.
  포커스는 `--glow-focus` 링(키보드 접근성).
- **콤보 미터 펄스**: 콤보 진행 중(`combo>0`)에만 트랙이 핫 마젠타로 맥동
  (`.combo-meter__track.is-active`).
- **카운트다운**: `countdown-pop`(scale 0.4→1.12→1, 페이드 인 후 유지 — 단계 교체 시
  깜빡임 없음).
- **씬/카드**: `scene-fade` + `scene-pop`(아래에서 떠오름). 결과 카드는 승=시안/패=위험색
  테두리·글로우로 결과를 색으로도 구분.
- 모든 색/간격/타이포/모션 값은 `tokens.css` 토큰만 소비(하드코딩 금지). z-index·카드
  최대폭·clamp 크기 등 구조 기하값만 직접 기술(coding 정책의 "구현 설정값" 구분).
- `prefers-reduced-motion`: 팝/펄스/리프트 애니메이션은 끄되 화면·수치 가독성은 유지.

## 10. 키 위임 (입력 레이어 비수정)

P/Esc(일시정지)·Enter/R(재시작) 키는 g4 `KeyboardController`를 수정하지 않고, 플레이어
`GameSession`의 late-bind 훅(`onPauseKey`/`onRestartKey`)을 MatchFlow가 가로채 흐름
맥락에 맞게 처리한다(title/result에서 Enter=개시, playing↔paused에서 P=토글).

## 11. 튜닝 상수(감각값, 디자인 토큰 아님)

`COUNT_STEP_MS=760`(3·2·1 단계) · `FIGHT_HOLD_MS=540`(FIGHT! 유지) — AI 타이밍·DAS/ARR와
동일 분류(입력/연출 감각값, Spec 미기록).

## 12. 범위 밖(후속 grain)

- 사운드(시작/카운트다운/KO/버튼 효과음) → g9.
