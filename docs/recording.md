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

---

# Recording — grain-9 사운드 디자인 & 최종 폴리시

> Spec 확인: `$GENOSIS_SPEC_PATH`는 g9 시점에도 **미설정/빈 값**이라 참조할 기존 Spec
> 디렉터리가 없다. 따라서 사운드 트리거 규칙·톤·README 문서 구조의 새 결정을 g7·g8과
> 동일하게 본 문서에 recording.md 형식으로 이어 기록한다(경로가 생기면 이전/병합).

## 13. 오디오 아키텍처 (이벤트 구독 출력 레이어)

오디오는 **게임 규칙과 완전히 분리된 출력 레이어**다(`src/audio/`). 외부 오디오 파일
없이 Web Audio로 전부 실시간 합성한다(에셋 0개, g5 비주얼과 같은 "코드로 만든 미감").

- `synth.js` — `SynthEngine`: 저수준 프리미티브(`tone`/`noise`)와 신호 버스.
  경로 `osc/noise → 노트 게인 → sfxBus|musicBus → master → compressor → out`.
  - **지연 생성**: AudioContext는 첫 사용자 제스처(`pointerdown`/`keydown`) 이후에만
    생성·`resume()`(자동재생 정책). 미지원/헤드리스는 `supported=false`로 전 호출 no-op.
  - **마스터 컴프레서**로 동시 타격음 클리핑 방지, `exponentialRamp` 바닥값 `0.0001`.
- `sfx.js` — `SFX`: "어떤 소리인가"만 정의(언제 울릴지는 모름). A=440 평균율 반음 비율.
- `bgm.js` — `Bgm`: setInterval 룩어헤드(25ms, 0.1s 앞 예약) 스케줄러. rAF/탭 비활성과
  무관하게 박자가 흔들리지 않는다. `musicBus` 게인(0.42)으로 **SFX를 절대 덮지 않음**.
- `audio-director.js` — `AudioDirector`: 이벤트 **구독**과 음소거/단축키만 담당.

> 경계 준수: 오디오 레이어는 `engine.on(...)` 구독 + `versus.onTaunt`/`flow.onFlow`
> 훅만 사용한다. 게임 규칙·스코어·밸런스 로직은 일절 만지지 않는다.

## 14. 사운드 트리거 규칙 (이벤트 → SFX 바인딩)

기존 이벤트 표면을 그대로 구독한다. 단, 하드드롭은 락과 임팩트를 구분하기 위해
엔진에 **연결용 이벤트 하나만 추가**했다(규칙·상태·스코어 불변).

- 신규 이벤트 `EVENTS.HARD_DROP`(`'harddrop'`): `engine.hardDrop()`이 낙하 확정 직후·
  `_lock()` 직전에 방출. 어떤 상태도 바꾸지 않는 순수 알림(연출/사운드용). 사운드
  쪽에서만 구독하고, 뒤따르는 `LOCK` 클릭은 억제해 중복 타격음을 막는다.

| 트리거(이벤트/훅) | SFX | 보드 | 비고 |
|----|----|----|----|
| `MOVE`(가로) | `move` | 플레이어 | 레이트리밋 35ms(DAS 연타 정리) |
| `MOVE`(soft) | `soft` | 플레이어 | 레이트리밋 55ms |
| `ROTATE` | `rotate` | 플레이어 | |
| `HOLD` | `hold` | 플레이어 | |
| `HARD_DROP` | `hardDrop` | 플레이어 | 뒤따르는 `LOCK` 클릭은 **억제** |
| `LOCK`(자연 안착) | `lock` | 플레이어 | 하드드롭 직후면 생략 |
| `LINE_CLEAR` | `lineClear(count)` | 플레이어 | 줄 수↑ → 더 길고 화사, 4줄 저역 보강 |
| `COMBO` | `combo(combo+1)` | 플레이어 | **단계마다 음정 상승**(긴장 고조) |
| `LEVEL_UP` | `levelUp` | 플레이어 | |
| `GARBAGE` | `garbage(count)` | 플레이어 | 저역 충격(맞은 느낌) |
| `LINE_CLEAR`(2줄+) | `lineClear`(약하게) | AI | 상대 생존 신호, 절제 |
| `GARBAGE` | 가벼운 적중음 | AI | 내 공격이 꽂힌 통쾌함 |
| `versus.onTaunt` | `taunt` | — | 도발 성립(사람/AI 공용) |
| `flow.onFlow('count')` | `count` / `fight` | — | 3·2·1 / FIGHT! |
| `flow.onFlow('result')` | `ko` | — | 승패 확정 KO 스팅어 |
| `flow.onFlow('select')` · 토글 ON | `ui` | — | 난이도 선택·음소거 해제 확인음 |

연결용 훅(규칙 비변경, 표시/오디오 전용)으로 추가한 것:
`versus.onTaunt({by,target,isAI})` · `MatchFlow.onFlow(type,payload)`
(`'state'`/`'count'`/`'result'`/`'select'`). 둘 다 미설정 시 무동작 — 기존 동작 불변.

## 15. BGM 정책

- 어두운 A 단조 펜타토닉 그루브(베이스 펄스 + 톱니 아르페지오 + 오프비트 하이햇 +
  다운비트 킥), ≈111 BPM. **플레이 중에만** 가동, 카운트다운/일시정지/결과/타이틀에서 정지.
- 첫 제스처 전에는 컨텍스트가 잠겨 있으므로, 잠금 해제 시 플레이 중이면 늦게 시작한다.

## 16. 음소거 토글 (즉시 동작 · 기억)

- 우상단 상시 노출 칩(`.sound-toggle`, `data-slot="mute"`) + 단축키 **M**.
- 마스터 게인을 `setTargetAtTime`으로 즉시 0↔볼륨 전환(클릭 노이즈 없이 부드럽게).
- 상태는 `localStorage('neonblitz.muted')`에 저장 → 새로고침에도 유지.
- 시각: 켜짐=네온 시안+글로우, 음소거=채도 down·위험 톤 테두리·`🔇`. 토큰만 소비.

## 17. 최종 밸런스 튜닝

- **DAS/ARR**(`keyboard-controller.js`, 감각값): 박진감을 위해 핸들링을 약간 더 날카롭게.
  `DAS 120→110` · `ARR 22→16` · `소프트드롭 28→24`(ms). 여전히 따라갈 수 있는 범위.
- **공격 테이블**(`attack-table.js`) / **난이도**(`difficulty.js`): 검토 결과 g6~g7에서
  이미 균형이 잡혀 있고, 단위 테스트가 정확한 수치를 고정(예: 더블→1·테트리스→4·
  T스핀싱글→2)하고 있어 **의도적으로 유지**했다. 변경 시 게임성 회귀 + 테스트 파손 위험.
- **60fps**: 오디오는 렌더 스레드 밖(Web Audio)에서 동작하고, SFX/BGM 노드는 짧게
  생성·자동 정지되어 rAF 루프에 추가 할당을 주지 않는다. 연타 이벤트는 레이트리밋으로
  노드 폭주를 막았다.

## 18. README 문서 구조 (톤/제목 위계)

루트 `README.md`를 픽스처 안내에서 **게임 문서로 교체**. 구조와 톤 결정:

- 제목 위계: `#` 제품명(NEON BLITZ) → `##` 큰 절(실행·조작법·대전 규칙·난이도·사운드·
  구조) → `###` 대전 규칙 하위(공격·콤보·예고/반격·도발). 한 단계씩만 내려가 일관 유지.
- 톤: **본문 한국어 설명 + 키/라벨은 게임과 동일한 영문 아케이드 표기**(g8 §8과 동일
  원칙 — 페이지 `lang="ko"`이나 UI 캡션은 영문 네온 아케이드 톤).
- 조작법·대전 규칙은 표 중심으로 한눈에. 공격 테이블은 `attack-table.js`/본 문서 §4의
  단일 출처와 수치를 일치.

## 19. 범위 밖 / 비목표

- 새 게임 기능 없음(사운드·연출 마감 + 밸런스 파라미터 조정 + 문서만).
- 멀티 트랙/사용자 볼륨 슬라이더·오디오 설정 화면은 비목표(음소거 토글로 충분).
