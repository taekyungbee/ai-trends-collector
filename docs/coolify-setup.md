# Coolify 설정 가이드

## 접속 정보

| 항목 | 값 |
|------|-----|
| 내부 URL | http://192.168.0.67:8000 |
| 외부 URL | http://211.200.27.68:8000 (포트포워딩 필요) |
| 버전 | 4.0.0-beta.462 |
| 데이터 경로 | /data/coolify |

---

## Step 1: 관리자 계정 생성

1. http://192.168.0.67:8000 접속
2. Register 클릭
3. 이메일, 비밀번호 입력
4. 계정 생성 완료

---

## Step 2: GitHub 연동

### GitHub App 생성 (추천)

1. Coolify → Settings → Git Providers
2. **GitHub App** 선택 → Create GitHub App
3. GitHub으로 리다이렉트 → 앱 생성 승인
4. 연동 완료

### 또는 Deploy Key 방식

1. Coolify → Settings → Git Providers
2. **Deploy Key** 선택
3. 생성된 SSH 공개키를 GitHub 저장소 Settings → Deploy keys에 추가

---

## Step 3: 프로젝트 생성

1. Coolify → **Projects** → New Project
2. 프로젝트 이름 입력 (예: `lazybee-apps`)
3. 환경(Environment) 생성 (예: `production`)

---

## Step 4: 앱 배포

### Node.js 앱 (ai-trends-collector, taskflow 등)

1. Project → Environment → **New Resource**
2. **Public Repository** 또는 **Private Repository (GitHub App)**
3. 저장소 URL 입력
4. 설정:
   - **Build Pack**: Nixpacks (자동 감지) 또는 Dockerfile
   - **Port**: 앱 포트 (예: 7001)
   - **Environment Variables**: 필요한 환경변수 추가

### 환경변수 예시 (ai-trends-collector)

```
DATABASE_URL=postgresql://...
GEMINI_API_KEY=...
NOTION_API_KEY=...
GMAIL_USER=...
GMAIL_APP_PASSWORD=...
```

---

## Step 5: 도메인 연결

### Cloudflare Tunnel 사용 시

1. 앱 설정 → Domains
2. 도메인 추가: `trends.lazybee.eu.org`
3. Cloudflare Tunnel config.yml에서 Coolify 앱 포트로 연결

### 직접 연결 시

1. 앱 설정 → Domains
2. 도메인 추가
3. Coolify가 자동으로 Let's Encrypt SSL 발급

---

## 기존 앱 마이그레이션 계획

| 앱 | 현재 | Coolify 이후 |
|----|------|-------------|
| ai-trends-collector | PM2 (port 7001) | Coolify Docker |
| taskflow-web | PM2 (port 10300) | Coolify Docker |
| taskflow-api | PM2 (port 4000) | Coolify Docker |

### 마이그레이션 순서

1. Coolify에 새 앱 배포
2. 테스트 확인
3. PM2 앱 중지
4. 포트/도메인 전환

---

## 관리 명령어

```bash
# Coolify 컨테이너 상태
docker ps | grep coolify

# Coolify 로그
docker logs coolify -f

# Coolify 재시작
cd /data/coolify/source && docker compose up -d --force-recreate

# Coolify 업데이트
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash
```

---

## 백업

중요 파일 백업 권장:
```bash
# 환경변수 파일
/data/coolify/source/.env

# 데이터베이스
/data/coolify/databases

# SSH 키
/data/coolify/ssh
```

---

## 트러블슈팅

### 접속 안 됨
```bash
# 컨테이너 상태 확인
docker ps | grep coolify

# 재시작
cd /data/coolify/source && docker compose restart
```

### 빌드 실패
- Coolify UI → Deployments → 로그 확인
- 환경변수 누락 확인
- Dockerfile/nixpacks 설정 확인

### 포트 충돌
- 기존 PM2 앱과 포트 겹치지 않게 설정
- 또는 PM2 앱 먼저 중지

---

## 현재 서버 구성

```
lazybee (192.168.0.67)
├── Coolify (port 8000) - 신규 설치
├── PM2
│   ├── ai-trends-collector (port 7001) → Coolify로 마이그레이션 예정
│   ├── taskflow-web (port 10300) → Coolify로 마이그레이션 예정
│   ├── taskflow-api (port 4000) → Coolify로 마이그레이션 예정
│   └── claude-code-ui
└── Docker
    └── Coolify containers (postgres, redis, etc.)
```
