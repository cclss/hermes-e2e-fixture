<!--
  ============================================================
  DESIGN SPEC — 가위바위보 (RPS Web Game)
  Grain-1 Output · 2026-06-10
  ============================================================
  $GENOSIS_SPEC_PATH 미설정 → 이 파일이 grain-2 코드 주석 헤더 참조 원본.
  Grain-2는 아래 결정사항을 HTML 파일 최상단 CSS 주석 블록으로 임베드한다.

  Audit: 신규 프로젝트, 대조 대상 없음. 기존 코드 스캔 불필요.
  ============================================================
-->

# Design Spec — 가위바위보 웹 게임

> **Grain-1 결정 문서.** 실제 HTML/CSS/JS 작성은 grain-2 이후.  
> GENOSIS_SPEC_PATH 미설정 환경이므로 이 파일이 grain-2의 유일한 디자인 참조원이다.

---

## Audit (2026-06-10) — Grain-1

**Grain-1: 기존 Spec ↔ grain-2 구현 코드 대조.**

### 일치
- `:root` CSS 커스텀 프로퍼티 전체 §8과 1:1 일치
- §4 정의된 10개 keyframe 모두 코드에 구현됨

### Orphan (코드에 있으나 §4 미등록) — 범위 안, 등록 완료
- `kf-ripple` — 버튼 클릭 리플 이펙트
- `kf-badge-pulse` — 불공정 배지 주기적 펄스
- `kf-progress-bar` — 카운트다운 프로그레스 바

### 부분 불일치 (작업 범위 안 — 교정 완료)
- `result-curse` 텍스트: 코드 `'🤖 치트 모드 발동!'` ≠ §5 `'😈 불공정 모드의 저주…'`
  → 코드를 §5 값으로 수정 + `EASTER_EGG_LABEL` 상수로 분리

### 신규 결정 (§3 언급, §4·코드 모두 미구현 → 구현 + §4 기록 완료)
- `kf-score-bump` — 결과 화면 점수 업데이트 시 bump 애니메이션

### 요약
- Orphans: 3 Keyframes (등록 완료)
- 전면 불일치: 0건
- 부분 불일치: 1건 → 교정 완료
- 신규 구현: 1건 (kf-score-bump)

---

## 1. 컬러 팔레트

### Token Group: color

**정의**: 이 프로젝트에서 사용되는 모든 색상 값. 배경, 서피스, 텍스트, 상태 강조색, 보더 포함.

#### Base Tokens

| Token | Value | 역할 |
|---|---|---|
| `color-bg` | `#09090f` | 페이지 최상위 배경 (거의 검정, 약한 남보라 틴트) |
| `color-surface` | `#13131f` | 카드·컨테이너 배경 |
| `color-surface-elevated` | `#1c1c2e` | 모달·선택된 요소 등 한 단계 올라온 서피스 |
| `color-border` | `#2e2e4a` | 기본 테두리 |
| `color-border-focus` | `#5a5a8a` | 포커스/호버 테두리 |
| `color-text-primary` | `#eeeeff` | 주요 텍스트 (흰색 계열, 약한 청보라 틴트) |
| `color-text-secondary` | `#9090b0` | 부제목·캡션 등 보조 텍스트 |
| `color-text-muted` | `#55557a` | 힌트·비활성 텍스트 |
| `color-neutral` | `#3a3a5c` | 중립 요소 배경 |
| `color-accent-win` | `#00ff87` | 승리 상태 강조색 (네온 그린) |
| `color-accent-lose` | `#ff2d55` | 패배 상태 강조색 (네온 레드/핑크) |
| `color-accent-draw` | `#ffd60a` | 무승부 상태 강조색 (골든 옐로우) |
| `color-accent-primary` | `#7c3aed` | 브랜드 주요 강조색 (딥 퍼플) |
| `color-accent-secondary` | `#06b6d4` | 브랜드 보조 강조색 (사이언) |
| `color-mode-fair` | `#00ff87` | 공정 모드 시그널 컬러 (= color-accent-win) |
| `color-mode-unfair` | `#ff2d55` | 불공정 모드 시그널 컬러 (= color-accent-lose) |

### Token Group: gradient

**정의**: 두 색상 이상을 선형으로 연결하는 그라디언트 값. 배경·버튼·오버레이 강조에 사용.

| Token | Value | 역할 |
|---|---|---|
| `gradient-hero` | `linear-gradient(135deg, #7c3aed 0%, #06b6d4 100%)` | 시작 화면 히어로 영역 |
| `gradient-win` | `linear-gradient(135deg, #00ff87 0%, #06b6d4 100%)` | 승리 결과 오버레이 |
| `gradient-lose` | `linear-gradient(135deg, #ff2d55 0%, #ff6b6b 100%)` | 패배 결과 오버레이 |
| `gradient-draw` | `linear-gradient(135deg, #ffd60a 0%, #ff9500 100%)` | 무승부 결과 오버레이 |
| `gradient-cta` | `linear-gradient(135deg, #7c3aed 0%, #ff2d55 100%)` | CTA 버튼 (시작, 선택) |
| `gradient-choice-hover` | `linear-gradient(135deg, #1c1c2e 0%, #2e2e4a 100%)` | 선택지 버튼 호버 상태 |

---

## 2. 타이포그래피

### Token Group: typography

**정의**: 폰트 패밀리, 크기, 굵기, 행간 등 텍스트 속성 전체.

#### 폰트 스택

| Token | Value |
|---|---|
| `font-family-primary` | `'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` |

> **Google Fonts 로드**: `https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap`  
> 외부 이미지·아이콘 라이브러리 금지 조건에서 폰트 CDN은 허용 (스타일 범주).

#### 크기 스케일

| Token | Value | 사용처 |
|---|---|---|
| `text-size-display` | `3.5rem` | 게임 타이틀, 초대형 이모지 레이블 |
| `text-size-headline` | `2rem` | 섹션 헤더, 선택지 레이블 |
| `text-size-title` | `1.5rem` | 카운트다운 텍스트, 결과 헤더 |
| `text-size-body-lg` | `1.125rem` | 점수 표시, 버튼 라벨 |
| `text-size-body` | `1rem` | 일반 본문 |
| `text-size-sm` | `0.875rem` | 캡션, 힌트, 모드 배지 |
| `text-size-xs` | `0.75rem` | 마이크로 텍스트 |

#### 굵기

| Token | Value | 사용처 |
|---|---|---|
| `text-weight-black` | `900` | 타이틀, 카운트다운 단어 |
| `text-weight-bold` | `800` | 헤딩, 점수 숫자 |
| `text-weight-semibold` | `600` | 버튼 라벨, 배지 |
| `text-weight-normal` | `400` | 본문, 캡션 |

#### 행간

| Token | Value | 사용처 |
|---|---|---|
| `text-line-height-tight` | `1.1` | 디스플레이 텍스트 |
| `text-line-height-snug` | `1.3` | 헤딩 |
| `text-line-height-normal` | `1.5` | 본문 |

---

## 3. 화면 상태 (Screen States)

총 4개. 각 상태는 고유한 레이아웃·색상 신호·트랜지션 진입/퇴장을 가진다.

### `start` — 시작/모드 선택 화면

- **목적**: 게임 진입점. 브랜드 인상 형성 + 모드 선택.
- **구성 요소**:
  - 게임 타이틀 (`✊✌️🖐` + 텍스트)
  - 모드 선택기 (공정 / 불공정 2-way 토글 카드)
  - "게임 시작" CTA 버튼
  - 간략 규칙 설명 텍스트 (선택)
- **배경**: `gradient-hero` 오버레이 위 `color-bg`
- **진입 애니메이션**: 없음 (초기 로드)
- **퇴장 애니메이션**: `kf-screen-slide-up` (0.3s, `easing-accelerate`)

### `playing` — 패 선택 화면

- **목적**: 사용자가 가위/바위/보 중 하나를 고름.
- **구성 요소**:
  - 점수 표시 (승 / 무 / 패 카운터)
  - 모드 배지 (상단 우측 고정)
  - 패 선택 버튼 3개 (`✌️ 가위` / `🤜 바위` / `🖐 보`)
  - "게임 종료" 텍스트 버튼
- **배경**: `color-bg` (솔리드)
- **진입 애니메이션**: `kf-reveal-bounce` (버튼들, 순차 0.1s stagger)
- **퇴장 애니메이션**: 선택한 버튼 scale-up → fade (0.2s)

### `countdown` — 카운트다운 화면

- **목적**: 긴장감 연출. 총 3 스텝: "가위!" → "바위!" → "보!"
- **구성 요소**:
  - 카운트다운 텍스트 (중앙 대형)
  - 사용자 선택 잠금 표시 (하단 소형)
- **배경**: `color-surface` (어둡게)
- **텍스트 색**: 각 스텝마다 `color-text-primary` → 마지막 "보!"는 `gradient-cta`
- **스텝 애니메이션**: `kf-countdown-pulse` — 스텝당 `duration-countdown-step` (600ms)
- **진입**: 직전 화면에서 즉시 전환 (페이드인 150ms)
- **퇴장**: "보!" 직후 즉시 result 화면으로 전환

### `result` — 결과 화면

- **목적**: 승패 공개 + 다음 라운드 유도.
- **구성 요소**:
  - 내 패 (대형 이모지 + 라벨)
  - VS 구분자
  - 컴퓨터 패 (대형 이모지 + 라벨, 리빌 타이밍 0.4s 딜레이)
  - 결과 배너 (WIN / LOSE / DRAW)
  - 점수 업데이트 애니메이션
  - "다음 라운드" 버튼 (2.5s 후 자동 활성 or 즉시 탭)
- **배경**: 결과에 따라 `gradient-win` / `gradient-lose` / `gradient-draw` 반투명 오버레이 (opacity 0.15)
- **WIN 애니메이션**: `kf-win-glow` (결과 배너에 네온 그린 박스섀도 펄스)
- **LOSE 애니메이션**: `kf-lose-shake` (결과 배너 수평 흔들림)
- **DRAW 애니메이션**: `kf-draw-spin` (결과 배너 1회 360° 회전)
- **진입**: `kf-reveal-bounce` — 양쪽 패 카드 순차 등장

---

## 4. 모션 토큰

### Token Group: transition

**정의**: UI 전환·애니메이션에 사용하는 시간(duration)과 이징(easing) 값.

#### Duration

| Token | Value | 사용처 |
|---|---|---|
| `duration-fast` | `150ms` | 호버 상태, 마이크로 인터랙션 |
| `duration-normal` | `300ms` | 기본 UI 전환 |
| `duration-slow` | `600ms` | 화면 간 전환 |
| `duration-countdown-step` | `600ms` | 카운트다운 스텝당 시간 (가위/바위/보) |
| `duration-reveal` | `500ms` | 결과 카드 등장 애니메이션 |
| `duration-result-hold` | `2500ms` | 결과 화면 자동 유지 시간 |

#### Easing

| Token | Value | 사용처 |
|---|---|---|
| `easing-standard` | `cubic-bezier(0.4, 0, 0.2, 1)` | 기본 전환 |
| `easing-bounce` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | 버튼 등장, 결과 카드 |
| `easing-decelerate` | `cubic-bezier(0.0, 0.0, 0.2, 1)` | 요소 진입 |
| `easing-accelerate` | `cubic-bezier(0.4, 0.0, 1, 1)` | 요소 퇴장 |

#### Keyframe 이름 (CSS @keyframes 정의 명세)

| Keyframe | 동작 설명 | 적용 대상 |
|---|---|---|
| `kf-countdown-pulse` | scale(1) → scale(1.4) → scale(1), 색상 플래시 | 카운트다운 텍스트 (스텝당 실행) |
| `kf-reveal-bounce` | translateY(40px) + opacity(0) → translateY(-6px) → translateY(0) + opacity(1) | 결과 패 카드, 게임 버튼 등장 |
| `kf-win-glow` | box-shadow 0 → 0 0 24px color-accent-win → 0 (반복) | WIN 결과 배너 |
| `kf-lose-shake` | translateX(0) → ±8px ×5회 → 0 | LOSE 결과 배너 |
| `kf-draw-spin` | rotate(0) → rotate(360deg) | DRAW 결과 배너 (1회) |
| `kf-float` | translateY(0) → translateY(-10px) → translateY(0) (반복, 3s) | 시작 화면 이모지 아이들 |
| `kf-neon-flicker` | opacity(1) → opacity(0.8) → opacity(1) (빠른 반복, 불규칙) | 타이틀 텍스트 (시작 화면) |
| `kf-screen-slide-up` | translateY(0) + opacity(1) → translateY(-20px) + opacity(0) | 화면 퇴장 |
| `kf-screen-enter` | translateY(20px) + opacity(0) → translateY(0) + opacity(1) | 화면 진입 |
| `kf-choice-select` | scale(1) → scale(0.9) → scale(1.1) → scale(1) | 패 선택 버튼 클릭 |
| `kf-score-bump` | scale(1) → scale(1.45) → scale(0.95) → scale(1), easing-bounce | 점수 카운터 증가 시 강조 (★ grain-1 신규 결정) |
| `kf-ripple` | scale(0) + opacity(0.6) → scale(2.5) + opacity(0) | 버튼 클릭 리플 이펙트 |
| `kf-badge-pulse` | box-shadow 저강도 ↔ 고강도 (반복, rgba 255,45,85) | 불공정 모드 배지 주기적 펄스 |
| `kf-progress-bar` | width 100% → 0% (선형, 1.8s) | 카운트다운 프로그레스 바 진행 |

---

## 5. 공정/불공정 모드 시각 구분

### 선택 단계 (start 화면)

| | 공정 모드 | 불공정 모드 |
|---|---|---|
| **이모지 아이콘** | ⚖️ | 😈 |
| **레이블** | 공정 | 불공정 |
| **선택 테두리 색** | `color-mode-fair` (#00ff87) | `color-mode-unfair` (#ff2d55) |
| **선택 글로우** | `0 0 12px #00ff87` | `0 0 12px #ff2d55` |
| **설명 텍스트** | "컴퓨터가 무작위로 패를 냅니다" | "컴퓨터가 70% 확률로 이깁니다 😈" |
| **설명 텍스트 색** | `color-text-secondary` | `color-mode-unfair` |

### 게임 중 (playing / countdown / result 화면)

| | 공정 모드 | 불공정 모드 |
|---|---|---|
| **모드 배지** | `⚖️ 공정` (그린 배지) | `😈 불공정` (레드 배지, 미세 펄스) |
| **배지 위치** | 화면 상단 우측 고정 | 화면 상단 우측 고정 |
| **컴퓨터 영역 틴트** | 없음 | 반투명 레드 오버레이 (`rgba(255,45,85,0.07)`) |
| **결과 화면 추가 텍스트** | 없음 | LOSE 시 "😈 불공정 모드의 저주…" 표시 |

> **★ Grain-1 신규 결정 — EASTER_EGG_LABEL 상수 분리**  
> 결과 화면 불공정+패배 시 표시 문구 `"😈 불공정 모드의 저주…"` 는 JS 상수 `EASTER_EGG_LABEL`로 분리한다.  
> 불공정 모드 컴퓨터 카드 이모지도 패배 시 `😈`로 교체된다 (컴퓨터 실제 패 라벨은 유지).

---

## 6. 추가 토큰 그룹

### Token Group: spacing

**정의**: 여백, 간격, 패딩 등 공간 배분에 사용되는 값.

| Token | Value |
|---|---|
| `space-2xs` | `2px` |
| `space-xs` | `4px` |
| `space-sm` | `8px` |
| `space-md` | `16px` |
| `space-lg` | `24px` |
| `space-xl` | `40px` |
| `space-2xl` | `64px` |
| `space-3xl` | `96px` |

### Token Group: radius

**정의**: 모서리 둥글기 값.

| Token | Value | 사용처 |
|---|---|---|
| `radius-sm` | `8px` | 배지, 소형 요소 |
| `radius-md` | `16px` | 버튼, 카드 |
| `radius-lg` | `24px` | 패널, 모달 컨테이너 |
| `radius-xl` | `32px` | 대형 컨테이너 |
| `radius-pill` | `9999px` | 필/캡슐형 버튼 |

### Token Group: shadow

**정의**: 박스 섀도 값. 심도 표현 및 네온 글로우 효과 포함.

| Token | Value | 사용처 |
|---|---|---|
| `shadow-sm` | `0 2px 8px rgba(0,0,0,0.4)` | 카드 기본 심도 |
| `shadow-md` | `0 4px 20px rgba(0,0,0,0.6)` | 호버·포커스 심도 |
| `shadow-glow-win` | `0 0 20px rgba(0,255,135,0.5)` | 승리 글로우 |
| `shadow-glow-lose` | `0 0 20px rgba(255,45,85,0.5)` | 패배 글로우 |
| `shadow-glow-draw` | `0 0 20px rgba(255,214,10,0.5)` | 무승부 글로우 |
| `shadow-glow-primary` | `0 0 20px rgba(124,58,237,0.6)` | 브랜드 버튼 글로우 |
| `shadow-glow-fair` | `0 0 12px rgba(0,255,135,0.4)` | 공정 모드 선택 글로우 |
| `shadow-glow-unfair` | `0 0 12px rgba(255,45,85,0.4)` | 불공정 모드 선택 글로우 |

---

## 7. 컴포넌트 목록 (grain-2 구현 대상)

| Component | 역할 | 사용 Token Groups |
|---|---|---|
| `GameScreen` | 전체 화면 상태 컨테이너 (start/playing/countdown/result) | color, gradient, transition |
| `ModeSelector` | 공정/불공정 모드 선택 카드 2개 | color, typography, radius, shadow |
| `ChoiceButton` | 가위/바위/보 선택 버튼 (이모지 + 라벨) | color, typography, spacing, radius, shadow, transition |
| `CountdownDisplay` | 카운트다운 텍스트 중앙 표시 | color, typography, transition |
| `ResultCard` | 내 패 / 컴 패 표시 카드 | color, gradient, typography, radius, shadow, transition |
| `ScoreBoard` | 승/무/패 카운터 표시 | color, typography, spacing |
| `ModeBadge` | 게임 중 모드 표시 배지 | color, typography, radius, shadow |
| `CTAButton` | 시작/다음라운드 주요 액션 버튼 | color, gradient, typography, spacing, radius, shadow, transition |

---

## 8. CSS 커스텀 프로퍼티 — grain-2 직접 사용 블록

```css
/* ============================================================
   DESIGN TOKENS — 가위바위보 웹 게임
   Grain-1 결정 · 2026-06-10
   ============================================================ */
:root {
  /* ── COLOR ─────────────────────────────────────────────── */
  --color-bg:               #09090f;
  --color-surface:          #13131f;
  --color-surface-elevated: #1c1c2e;
  --color-border:           #2e2e4a;
  --color-border-focus:     #5a5a8a;
  --color-text-primary:     #eeeeff;
  --color-text-secondary:   #9090b0;
  --color-text-muted:       #55557a;
  --color-neutral:          #3a3a5c;
  --color-accent-win:       #00ff87;
  --color-accent-lose:      #ff2d55;
  --color-accent-draw:      #ffd60a;
  --color-accent-primary:   #7c3aed;
  --color-accent-secondary: #06b6d4;
  --color-mode-fair:        #00ff87;
  --color-mode-unfair:      #ff2d55;

  /* ── GRADIENT ───────────────────────────────────────────── */
  --gradient-hero:          linear-gradient(135deg, #7c3aed 0%, #06b6d4 100%);
  --gradient-win:           linear-gradient(135deg, #00ff87 0%, #06b6d4 100%);
  --gradient-lose:          linear-gradient(135deg, #ff2d55 0%, #ff6b6b 100%);
  --gradient-draw:          linear-gradient(135deg, #ffd60a 0%, #ff9500 100%);
  --gradient-cta:           linear-gradient(135deg, #7c3aed 0%, #ff2d55 100%);
  --gradient-choice-hover:  linear-gradient(135deg, #1c1c2e 0%, #2e2e4a 100%);

  /* ── TYPOGRAPHY ─────────────────────────────────────────── */
  --font-family-primary:     'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --text-size-display:       3.5rem;
  --text-size-headline:      2rem;
  --text-size-title:         1.5rem;
  --text-size-body-lg:       1.125rem;
  --text-size-body:          1rem;
  --text-size-sm:            0.875rem;
  --text-size-xs:            0.75rem;
  --text-weight-black:       900;
  --text-weight-bold:        800;
  --text-weight-semibold:    600;
  --text-weight-normal:      400;
  --text-line-height-tight:  1.1;
  --text-line-height-snug:   1.3;
  --text-line-height-normal: 1.5;

  /* ── SPACING ────────────────────────────────────────────── */
  --space-2xs: 2px;
  --space-xs:  4px;
  --space-sm:  8px;
  --space-md:  16px;
  --space-lg:  24px;
  --space-xl:  40px;
  --space-2xl: 64px;
  --space-3xl: 96px;

  /* ── RADIUS ─────────────────────────────────────────────── */
  --radius-sm:   8px;
  --radius-md:   16px;
  --radius-lg:   24px;
  --radius-xl:   32px;
  --radius-pill: 9999px;

  /* ── SHADOW ─────────────────────────────────────────────── */
  --shadow-sm:          0 2px 8px rgba(0, 0, 0, 0.4);
  --shadow-md:          0 4px 20px rgba(0, 0, 0, 0.6);
  --shadow-glow-win:    0 0 20px rgba(0, 255, 135, 0.5);
  --shadow-glow-lose:   0 0 20px rgba(255, 45, 85, 0.5);
  --shadow-glow-draw:   0 0 20px rgba(255, 214, 10, 0.5);
  --shadow-glow-primary:0 0 20px rgba(124, 58, 237, 0.6);
  --shadow-glow-fair:   0 0 12px rgba(0, 255, 135, 0.4);
  --shadow-glow-unfair: 0 0 12px rgba(255, 45, 85, 0.4);

  /* ── TRANSITION ─────────────────────────────────────────── */
  --duration-fast:           150ms;
  --duration-normal:         300ms;
  --duration-slow:           600ms;
  --duration-countdown-step: 600ms;
  --duration-reveal:         500ms;
  --duration-result-hold:    2500ms;
  --easing-standard:         cubic-bezier(0.4, 0, 0.2, 1);
  --easing-bounce:           cubic-bezier(0.34, 1.56, 0.64, 1);
  --easing-decelerate:       cubic-bezier(0.0, 0.0, 0.2, 1);
  --easing-accelerate:       cubic-bezier(0.4, 0.0, 1, 1);
}
```

---

## 9. 이모지 비주얼 매핑

외부 이미지·아이콘 라이브러리 없이 이모지 단독으로 모든 비주얼 표현.

| 개념 | 이모지 |
|---|---|
| 가위 | ✌️ |
| 바위 | 🤜 |
| 보 | 🖐 |
| 승리 | 🏆 |
| 패배 | 💀 |
| 무승부 | 🤝 |
| 공정 모드 | ⚖️ |
| 불공정 모드 | 😈 |
| 게임 타이틀 데코 | ✊ ✌️ 🖐 |
| 로딩/대기 | 🎲 |

---

*이 문서는 grain-2가 HTML 단일 파일을 작성할 때 최상단 주석 블록으로 임베드하고, 섹션 8의 CSS 커스텀 프로퍼티를 `:root`에 그대로 적용한다.*
