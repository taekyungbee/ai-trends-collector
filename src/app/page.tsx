export default function Home() {
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui" }}>
      <h1>AI Trends Collector</h1>
      <p>백엔드 API 서비스입니다. UI는 별도 블로그에서 제공됩니다.</p>
      
      <h2>API Endpoints</h2>
      <ul>
        <li><code>POST /api/trends/refresh</code> - RSS 수집</li>
        <li><code>POST /api/trends/summarize</code> - 영상 요약 생성</li>
        <li><code>POST /api/trends/send-email</code> - 요약 메일 발송</li>
        <li><code>POST /api/trends/sync-notion</code> - 노션 동기화</li>
        <li><code>POST /api/trends/daily</code> - 일일 전체 작업</li>
        <li><code>GET /api/channels</code> - 채널 목록</li>
      </ul>
    </main>
  );
}
