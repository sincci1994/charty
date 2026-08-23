import type { Metadata } from 'next'

export const metadata: Metadata = { title: '개인정보처리방침 — 차티' }

// 스토어 등록(Play·App Store) 필수 페이지 — 법적 문서라 앱 스타일과 무관하게 정적 텍스트로 유지
const h: React.CSSProperties = { fontSize: 15, fontWeight: 700, margin: '20px 0 6px' }

export default function Privacy() {
  return (
    <div style={{ padding: '24px 20px 40px', fontSize: 14, lineHeight: 1.7, maxWidth: 640, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>개인정보처리방침</h1>
      <p style={{ opacity: 0.6, fontSize: 13 }}>시행일: 2026-08-23</p>

      <p style={{ marginTop: 12 }}>
        차티(이하 &quot;서비스&quot;)는 과거 시세 데이터로 매매를 연습하는 모의투자 훈련 앱입니다.
        실제 금전 거래·투자 권유 기능이 없으며, 서비스 제공에 필요한 최소한의 개인정보만 처리합니다.
      </p>

      <h2 style={h}>1. 수집하는 개인정보</h2>
      <p>
        로그인하지 않아도 서비스를 이용할 수 있으며, 이 경우 개인정보를 수집하지 않습니다(연습 기록은 이용자의
        기기에만 저장). 구글 계정으로 로그인하면 다음 정보를 수집합니다.
      </p>
      <ul style={{ paddingLeft: 18, margin: '6px 0' }}>
        <li>구글 계정 이메일 주소와 표시 이름 (계정 식별)</li>
        <li>프로필 입력값 — 닉네임(필수), 연령대·투자 경험 등(선택)</li>
        <li>서비스 이용 기록 — 모의투자 연습 기록·설정 (기기 간 동기화 목적)</li>
      </ul>

      <h2 style={h}>2. 이용 목적</h2>
      <p>계정 식별, 여러 기기 간 연습 기록·설정 동기화, 서비스 개선. 그 외 목적으로 사용하지 않습니다.</p>

      <h2 style={h}>3. 보관 및 파기</h2>
      <p>
        수집한 정보는 회원 탈퇴 또는 삭제 요청 시 지체 없이 파기합니다. 앱 내 [더보기]의 데이터 삭제
        기능으로 서버에 저장된 기록을 직접 삭제할 수 있습니다.
      </p>

      <h2 style={h}>4. 처리 위탁</h2>
      <p>
        데이터 보관·인증 처리를 위해 Supabase(클라우드 데이터베이스·인증 서비스)에 처리를 위탁합니다.
        위탁받은 업체는 위탁 목적 외로 정보를 처리하지 않습니다.
      </p>

      <h2 style={h}>5. 제3자 제공</h2>
      <p>법령에 따른 요청을 제외하고 개인정보를 제3자에게 제공하지 않으며, 광고 목적의 추적을 하지 않습니다.</p>

      <h2 style={h}>6. 이용자의 권리</h2>
      <p>이용자는 언제든지 자신의 개인정보 열람·정정·삭제를 요청할 수 있습니다. 아래 문의처로 연락해 주세요.</p>

      <h2 style={h}>7. 문의처</h2>
      <p>
        운영자 이메일: <a href="mailto:sincci1994@gmail.com">sincci1994@gmail.com</a>
      </p>

      <p style={{ marginTop: 20, opacity: 0.6, fontSize: 13 }}>
        본 방침이 변경되는 경우 이 페이지를 통해 고지합니다.
      </p>
    </div>
  )
}
