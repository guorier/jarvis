# J.A.R.V.I.S. HUD (음성인식 없는 버전)

Electron으로 만든 데스크톱 자비스 화면입니다. 명령은 텍스트로 입력하고, AI 두뇌는 Google Gemini(무료 등급) 또는 Claude API(`claude-opus-5-5`, 유료) 중에서 고릅니다.

## 실행

가장 쉬운 방법: 폴더 안의 **`Jarvis-start.bat`** 을 더블클릭합니다. (처음 한 번은 패키지를 설치하느라 1~2분 걸립니다.)

터미널에서 실행하려면 이 폴더에서:

```powershell
npm install
npm start
```

> Electron 실행 파일이 내려받아지지 않았다면 `node node_modules/electron/install.js`를 한 번 실행하세요.

## 다른 PC에서 코드 수정하기

설치 파일로 설치한 자비스는 실행 전용이라 코드를 고칠 수 없습니다. 고치려면 원본(이 저장소)이 필요합니다.

1. 그 PC에 **Git**과 **Node.js**를 설치합니다.
2. 저장소를 받습니다: `git clone <저장소 주소> JARVIS`
3. 폴더에서 한 번 실행: `npm install`
4. 실행: `npm start` / 설치 파일 만들기: `npm run dist` (결과물은 `dist/`)
5. 고친 뒤 기록하고 올리기: `git add -A` → `git commit -m "변경 내용"` → `git push`
6. 다른 PC에서 최신 내용 받기: `git pull` (받은 뒤 `package.json`이 바뀌었으면 `npm install` 다시)

설정·API 키·할 일·일정은 저장소가 아니라 각 PC의 `%APPDATA%\jarvis-hud`에 따로 저장됩니다.

## 다른 PC에 설치하기

1. `dist\JARVIS-Setup-0.1.0.exe` 파일을 USB나 클라우드로 다른 PC에 옮깁니다.
2. 더블클릭해서 설치합니다. Node.js 같은 다른 프로그램은 필요 없습니다.
3. 서명되지 않은 개인용 프로그램이라 "Windows의 PC 보호" 창이 뜨면 **추가 정보 → 실행**을 누릅니다.
4. 설치가 끝나면 바탕화면과 시작 메뉴의 **JARVIS** 아이콘으로 실행합니다.

설정(API 키 포함), 할 일, 일정, 메모는 PC마다 따로 저장됩니다(`%APPDATA%\jarvis-hud\jarvis-data.json`). 설치 파일 안에는 API 키가 들어 있지 않으니, 새 PC에서는 키를 다시 입력하세요.

설치 파일을 다시 만들려면 이 폴더에서 `npm run dist`를 실행합니다.

## AI 비서 설정

기본 AI는 **Google Gemini(무료 등급)** 입니다. 설정에서 Claude(유료)로 바꿀 수 있습니다.

### Gemini 무료 키 받기

1. **aistudio.google.com** 에 Google 계정으로 로그인합니다.
2. 왼쪽 메뉴(또는 오른쪽 위)의 **Get API key** → **Create API key** 를 누릅니다.
3. 만들어진 키(`AIza...`로 시작)를 복사합니다. 카드 등록은 필요 없습니다.
4. 자비스 ⚙ 설정 → **AI 엔진**에서 "사용할 AI"를 **Google Gemini**로 두고, **Gemini API 키**에 붙여 넣은 뒤 **저장**합니다.

무료 등급은 분당·일일 사용량 제한이 있고, 무료 등급으로 보낸 내용은 Google이 서비스 개선에 사용할 수 있습니다. 모델 이름이 바뀌어 오류가 나면 설정의 **Gemini 모델** 칸을 AI Studio에 표시된 이름으로 바꾸세요.

- **자동 대체 모델:** 설정한 모델이 혼잡(503·504)하거나 한도(429)에 걸리면 `gemini-3.5-flash-lite` → `gemini-3.1-flash-lite` 순서로 자동 전환하고, 잘 되는 모델을 15분 동안 먼저 씁니다.
- **웹 검색:** 무료 등급은 Google 검색 기능 한도가 없어 막히는 경우가 많습니다. 그때는 Google 뉴스 기사 검색으로 대신 찾아 요약합니다(뉴스 기사 한정).

### Claude (유료)

설정의 "Claude 설정"을 펼쳐 Anthropic API 키를 넣고 "사용할 AI"를 Claude로 바꾸면 됩니다.

## 기능

| 영역 | 내용 |
|---|---|
| 중앙 | AI 채팅(스트리밍 응답), 슬래시 명령, 커맨드 팔레트(Ctrl+K), 코어 애니메이션 |
| 시스템 | CPU·RAM·GPU 게이지, 메모리, 배터리, 네트워크 속도 그래프, 디스크, 상위 프로세스 |
| 비서 | 시계·인사, 날씨(현재·시간대별·주간), 달력과 일정, 할 일과 리마인더 알림, 메모 |
| 정보 | 뉴스 헤드라인(키워드 필터), 원화 환율, 알림 센터 |
| 제어 | 앱/파일/URL 런처, 루틴(매크로), Home Assistant 스마트홈 제어, 웹 검색 요약 |
| 분위기 | 부팅 시퀀스, 시스템 로그 콘솔, 효과음, TTS 음성 응답(선택) |
| 로딩 연출 | 부팅 로그 → WELCOME BACK 상자 → 패널 테두리가 그려지며 HUD 조립, 엠블럼 링 그리기, 글자 해독 효과 (아무 키나 클릭으로 건너뛰기) |
| eDEX 스타일 | CPU·메모리·GPU·NPU 4칸 모니터(같은 구성: 사용률·흐르는 파형·통계 2개), 내 위치 핀이 꽂힌 점 지구본 (`renderer/hud-fx.js`) |

GPU·NPU 사용률은 Windows 성능 카운터("GPU Engine", "GPU Adapter Memory")를 백그라운드 PowerShell 하나로 읽습니다(`src/accel.js`). 연산 엔진만 있는 장치를 NPU로 봅니다. NPU가 없는 PC나 Windows가 아닌 환경에서는 N/A로 표시됩니다.

AI에게 "메모장 열어줘", "작업 모드 시작해", "내일 3시에 회의 잡아줘", "오늘 브리핑해줘", "요즘 반도체 뉴스 검색해서 요약해줘"처럼 말하면 도구를 써서 실제로 처리합니다.

### 슬래시 명령

`/메모`, `/할일`, `/일정 2026-11-20 14:00 회의`, `/실행 이름`, `/루틴 이름`, `/검색 질문`, `/날씨`, `/뉴스`, `/초기화`, `/도움말`

### 안전장치

- AI는 **설정에 등록된 런처와 루틴만** 실행할 수 있습니다. 임의 명령은 실행하지 않습니다.
- 스마트홈도 설정에 등록한 기기(entity_id)만 제어할 수 있습니다.

## 글꼴

- 본문·한글: **Pretendard** (`renderer/fonts`에 포함, 설치본에도 들어감, SIL OFL 1.1)
- HUD 영문 표제·숫자: Orbitron (인터넷 연결 시 Google Fonts에서 불러오고, 오프라인이면 Pretendard로 표시)

## 데이터 출처 (API 키 불필요)

- 날씨: Open-Meteo
- 뉴스: Google News RSS
- 환율: open.er-api.com

## 알려진 한계

- GPU 사용률은 NVIDIA 등 일부 그래픽카드에서만 나옵니다(AMD 내장 그래픽은 N/A).
- CPU 온도는 Windows에서 관리자 권한이나 별도 드라이버가 없으면 N/A로 나옵니다.
- 이메일 요약과 Google 캘린더 연동은 OAuth 설정이 필요해 아직 넣지 않았습니다. 지금 일정은 앱 안에만 저장됩니다.

## 파일 구조

```
main.js            Electron 메인 프로세스, IPC, 리마인더
preload.js         화면에 노출하는 API
src/store.js       JSON 저장소
src/system.js      시스템 모니터링
src/feeds.js       날씨·뉴스·환율
src/control.js     런처·루틴·Home Assistant
src/ai.js          AI 비서 도구 정의와 Claude 연결
src/gemini.js      Gemini 연결
build/icon.png     앱 아이콘 (scripts/make-icon.js로 생성)
renderer/          HUD 화면 (index.html, styles.css, util.js, widgets.js, chat.js, app.js)
```

## 개발용

- `JARVIS_DEBUG=1`: 화면 콘솔 로그를 터미널에 출력
- `JARVIS_SNAPSHOT=경로.png`: 시작 8초 뒤 화면 캡처 저장
