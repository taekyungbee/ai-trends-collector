# Cloudflare Tunnel 설정 가이드

> EU.org 도메인(`lazybee.eu.org`) 승인 후 진행

## 사전 준비

| 항목 | 값 |
|------|-----|
| 도메인 | `lazybee.eu.org` |
| Cloudflare 계정 | taekyungbee@gmail.com |
| 서버 | lazybee (192.168.0.67) |
| 네임서버 | meiling.ns.cloudflare.com, pablo.ns.cloudflare.com |

## 서비스 매핑 계획

| 서브도메인 | 로컬 서비스 | 포트 |
|-----------|------------|------|
| taskflow.lazybee.eu.org | TaskFlow Web | 10300 |
| trends.lazybee.eu.org | AI Trends Collector | 7001 |

---

## Step 1: 도메인 활성화 확인

1. https://dash.cloudflare.com 접속
2. `lazybee.eu.org` 클릭
3. Status가 **Active**인지 확인

> 승인 후 몇 분 ~ 몇 시간 내에 Active로 변경됨

---

## Step 2: cloudflared 설치 (서버)

```bash
ssh lazybee

# GPG 키 추가
curl -fsSL https://pkg.cloudflare.com/cloudflare-public-v2.gpg | sudo tee /usr/share/keyrings/cloudflare-public-v2.gpg >/dev/null

# APT 저장소 추가
echo "deb [signed-by=/usr/share/keyrings/cloudflare-public-v2.gpg] https://pkg.cloudflare.com/cloudflared any main" | sudo tee /etc/apt/sources.list.d/cloudflared.list

# 설치
sudo apt-get update
sudo apt-get install cloudflared

# 설치 확인
cloudflared --version
```

---

## Step 3: Cloudflare 인증

```bash
cloudflared tunnel login
```

- 브라우저 링크가 출력됨
- 링크 클릭 → Cloudflare 로그인 → `lazybee.eu.org` 선택
- 인증 완료 메시지 확인

인증서 저장 위치: `~/.cloudflared/cert.pem`

---

## Step 4: 터널 생성

```bash
# 터널 생성
cloudflared tunnel create lazybee

# 생성된 터널 확인
cloudflared tunnel list
```

출력 예시:
```
ID                                   NAME     CREATED
a1b2c3d4-e5f6-7890-abcd-ef1234567890 lazybee  2026-01-20T10:00:00Z
```

> **TUNNEL-UUID** (예: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`) 기억해두기

자격증명 파일 저장 위치: `~/.cloudflared/<TUNNEL-UUID>.json`

---

## Step 5: config.yml 작성

```bash
nano ~/.cloudflared/config.yml
```

아래 내용 입력 (TUNNEL-UUID를 실제 값으로 교체):

```yaml
tunnel: <TUNNEL-UUID>
credentials-file: /home/lazybee/.cloudflared/<TUNNEL-UUID>.json

ingress:
  # TaskFlow Web
  - hostname: taskflow.lazybee.eu.org
    service: http://localhost:10300
  
  # AI Trends Collector
  - hostname: trends.lazybee.eu.org
    service: http://localhost:7001
  
  # 기본 (매칭 안 되는 요청)
  - service: http_status:404
```

설정 검증:
```bash
cloudflared tunnel ingress validate
```

---

## Step 6: DNS 레코드 등록

```bash
# TaskFlow
cloudflared tunnel route dns lazybee taskflow.lazybee.eu.org

# AI Trends
cloudflared tunnel route dns lazybee trends.lazybee.eu.org
```

> Cloudflare DNS에 CNAME 레코드가 자동 생성됨

---

## Step 7: 터널 테스트 (수동 실행)

```bash
cloudflared tunnel run lazybee
```

브라우저에서 확인:
- https://taskflow.lazybee.eu.org
- https://trends.lazybee.eu.org

`Ctrl+C`로 종료

---

## Step 8: 시스템 서비스 등록

```bash
# 서비스 설치
sudo cloudflared service install

# 서비스 시작
sudo systemctl start cloudflared

# 부팅 시 자동 시작
sudo systemctl enable cloudflared

# 상태 확인
sudo systemctl status cloudflared
```

---

## 관리 명령어

```bash
# 서비스 상태
sudo systemctl status cloudflared

# 서비스 재시작
sudo systemctl restart cloudflared

# 로그 확인
sudo journalctl -u cloudflared -f

# 터널 목록
cloudflared tunnel list

# 터널 삭제 (필요시)
cloudflared tunnel delete lazybee
```

---

## 서브도메인 추가 방법

새 서비스 추가 시:

### 1. config.yml 수정

```yaml
ingress:
  - hostname: taskflow.lazybee.eu.org
    service: http://localhost:10300
  - hostname: trends.lazybee.eu.org
    service: http://localhost:7001
  # 새 서비스 추가
  - hostname: newapp.lazybee.eu.org
    service: http://localhost:3000
  - service: http_status:404
```

### 2. DNS 등록

```bash
cloudflared tunnel route dns lazybee newapp.lazybee.eu.org
```

### 3. 서비스 재시작

```bash
sudo systemctl restart cloudflared
```

---

## 트러블슈팅

### 502 Bad Gateway
- 로컬 서비스가 실행 중인지 확인
- `curl http://localhost:10300` 테스트

### 도메인 접속 안 됨
- Cloudflare DNS에 CNAME 레코드 있는지 확인
- `cloudflared tunnel route dns` 다시 실행

### 서비스 시작 실패
```bash
sudo journalctl -u cloudflared -n 50
```
로그 확인 후 config.yml 오류 수정

---

## 참고 링크

- [Cloudflare Tunnel 공식 문서](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
- [cloudflared GitHub](https://github.com/cloudflare/cloudflared)
- [EU.org 도메인 관리](https://nic.eu.org/)

---

## 현재 서버 상태 요약

```
lazybee (192.168.0.67)
├── PM2 프로세스
│   ├── ai-trends-collector (port 7001) → trends.lazybee.eu.org
│   ├── taskflow-web (port 10300) → taskflow.lazybee.eu.org
│   ├── taskflow-api (port 4000)
│   └── claude-code-ui
└── Cloudflare Tunnel (설정 예정)
```
