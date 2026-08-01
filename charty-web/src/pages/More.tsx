import { useStore } from '../store'

export default function More() {
  const resetAll = useStore((s) => s.resetAll)

  return (
    <div className="page">
      <h2>더보기</h2>
      <div className="card">
        <b>차티 웹 (베타)</b>
        <p className="dim small">
          과거 캔들을 하나씩 넘기며 매매 습관을 훈련하는 모의투자 앱입니다.
          모든 데이터는 이 브라우저에만 저장됩니다.
        </p>
      </div>
      <button
        className="danger-btn"
        onClick={() => {
          if (confirm('모든 기록과 자산을 초기화할까요? 되돌릴 수 없습니다.')) resetAll()
        }}
      >
        전체 데이터 초기화
      </button>
    </div>
  )
}
