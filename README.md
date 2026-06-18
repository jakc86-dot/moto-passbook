# Moto Passbook

오토바이 정비 이력과 차계부를 기록하고, 중고 인계 시 정비 내역만 12자리 코드로 넘길 수 있는 Expo React Native 앱입니다. Android, iPhone, 웹 확인을 모두 지원합니다.

## 클릭 실행

Windows에서는 `Start Expo.cmd`를 더블클릭하면 Expo Web이 열립니다.

터미널에서 직접 실행하려면 아래 명령을 사용합니다.

```bash
npm install
npx expo start --web
```

## 빌드 전 점검

`Check App Build.cmd`를 더블클릭하면 아래 검사를 순서대로 실행합니다.

```bash
npm run typecheck
npm run export:android
npm run export:ios
```

이 검사는 Android/iOS용 JavaScript 번들이 만들어지는지 확인합니다. 실제 스토어 파일 생성은 EAS 클라우드 빌드를 사용합니다.

## Android Play Console용 AAB

Play Console 업로드용 파일은 Android App Bundle, 즉 `.aab`입니다.

### 방법 1: EAS 클라우드 빌드

1. `Build Android Store AAB.cmd`를 더블클릭합니다.
2. 처음 실행이면 Expo 계정 로그인을 진행합니다.
3. EAS가 Android 서명 키를 만들거나 기존 키를 선택하라고 물어보면 안내에 따라 진행합니다.
4. 빌드가 끝나면 Expo 대시보드에서 `.aab` 파일을 내려받습니다.
5. Play Console의 내부 테스트 또는 프로덕션 릴리스에 `.aab`를 업로드합니다.

테스트 APK가 먼저 필요하면 `Build Android APK.cmd`를 사용합니다. APK는 테스트 설치용이고, 신규 Play Console 등록은 AAB로 진행합니다.

EAS Submit으로 최신 Android 빌드를 Play Console에 바로 제출하려면 `Submit Android Play Console.cmd`를 사용합니다. Google Play 서비스 계정 연결 또는 Play Console 권한이 필요합니다.

### 방법 2: 로컬 Gradle AAB 빌드

Expo 클라우드 없이 이 PC에서 직접 `.aab`를 만들 수도 있습니다. 이 방식은 Android Studio 또는 JDK 17+와 Android SDK가 필요합니다.

1. Android Studio를 설치하고 SDK Manager에서 Android SDK Platform 35 이상과 Build-Tools를 설치합니다.
2. `Generate Android Upload Keystore.cmd`를 더블클릭해서 업로드 키를 만듭니다.
3. `Build Android Local AAB.cmd`를 더블클릭합니다.
4. 빌드 결과는 `android/app/build/outputs/bundle/release/app-release.aab`에 생성됩니다.

`android/app/keystores/upload-key.jks`와 `android/local-signing.properties`는 절대 공유하지 마세요. 이 키를 잃어버리면 같은 Play Console 앱의 업데이트가 막힐 수 있습니다.

현재 프로젝트는 기본적으로 Expo 관리형 빌드 기준입니다. 로컬 Gradle 빌드는 실행 시 `android/` 폴더를 생성합니다. 기존 Android prebuild 산출물은 `work/android-prebuild-backup-*`에 백업해두었습니다.

## iPhone 빌드

TestFlight/App Store용 빌드는 `Build iOS Store.cmd`를 사용합니다. Apple Developer 계정 로그인이 필요합니다.

iOS 시뮬레이터 테스트 빌드는 `Build iOS Simulator.cmd`를 사용합니다.

## 인계 코드 관리자 서버

사용자 로그인 없이 인계 코드를 쓰는 구조입니다. 앱에서 `APP_HANDOVER_API_URL`과 필요 시 `APP_HANDOVER_API_KEY`를 코드 상수로 설정하면 인계 메뉴가 관리자 서버를 사용합니다.

서버 API 계약:

```http
POST /handovers
Content-Type: application/json

{
  "code": "123456789012",
  "kind": "maintenance-handover",
  "createdAt": "2026-06-17T00:00:00.000Z",
  "expiresAt": "2026-07-17T00:00:00.000Z",
  "data": {
    "kind": "maintenance-handover",
    "bike": {},
    "bikes": [],
    "activeBikeId": "...",
    "currentOdometerKm": 25001,
    "maintenanceRecords": []
  }
}
```

```http
GET /handovers/{code}
```

응답은 `{ "code": "123456789012", "data": { ... } }` 형태를 권장합니다. 서버에는 바이크 제조사, 모델명, 연식, 현재 주행거리, 번호판, 차대번호 뒤 4자리, 정비 이력만 저장하고 주유 기록과 정비주기 설정은 저장하지 않습니다. 코드는 30일 만료와 조회 횟수 제한을 서버에서 처리하는 것을 권장합니다.

## 현재 출시 전 확인된 점

- Expo SDK 54, React Native 0.81 기반입니다.
- Android/iOS JavaScript 번들 export가 통과해야 빌드로 넘어갑니다.
- Android 앱 권한은 네트워크 접근 중심으로 정리했습니다.
- 인계 서버 주소와 API 키는 앱 화면에 노출하지 않고 코드/환경 설정으로 주입하는 구조로 이어가야 합니다.

## Play Console에서 추가로 준비할 것

- 앱 이름, 간단한 설명, 전체 설명
- 앱 아이콘, 스크린샷, 그래픽 이미지
- 개인정보처리방침 URL
- 데이터 보안 설문
- 콘텐츠 등급 설문
- 내부 테스트 트랙 또는 프로덕션 릴리스
