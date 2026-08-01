import { NavLink, Outlet } from 'react-router-dom'

const TABS = [
  { to: '/', label: '홈', icon: '🏠' },
  { to: '/practice', label: '연습', icon: '📈' },
  { to: '/history', label: '기록', icon: '📋' },
  { to: '/more', label: '더보기', icon: '⚙️' },
]

export default function App() {
  return (
    <div className="app">
      <main className="content">
        <Outlet />
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="icon">{t.icon}</span>
            <span>{t.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
