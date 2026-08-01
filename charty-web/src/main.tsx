import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Route, Routes } from 'react-router-dom'
import App from './App'
import Home from './pages/Home'
import Practice from './pages/Practice'
import Simulation from './pages/Simulation'
import Review from './pages/Review'
import History from './pages/History'
import More from './pages/More'
import './index.css'

// ponytail: HashRouter — 정적 호스팅(GitHub Pages 등)에서 서버 설정 없이 동작
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route element={<App />}>
          <Route path="/" element={<Home />} />
          <Route path="/practice" element={<Practice />} />
          <Route path="/sim" element={<Simulation />} />
          <Route path="/review" element={<Review />} />
          <Route path="/history" element={<History />} />
          <Route path="/more" element={<More />} />
        </Route>
      </Routes>
    </HashRouter>
  </StrictMode>,
)
