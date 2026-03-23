import { Link } from 'react-router-dom'
import { useEffect } from 'react'
import { ThemeToggle } from './ThemeToggle'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  useEffect(() => {
    // Check localStorage and apply dark class on mount
    const savedTheme = localStorage.getItem('noxdev-theme');
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-[var(--nox-bg)]">
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-[var(--nox-border)] bg-white dark:bg-[var(--nox-surface)]">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <span className="text-2xl">🦉</span>
              <span className="text-xl font-bold text-gray-900 dark:text-gray-100">noxdev</span>
            </div>
            <nav className="flex items-center space-x-6">
              <Link to="/" className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100">
                Overview
              </Link>
              <Link to="/projects" className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100">
                Projects
              </Link>
              <ThemeToggle />
            </nav>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 bg-gray-50 dark:bg-[var(--nox-bg)]">
        <div className="max-w-6xl mx-auto px-4 py-6">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-[var(--nox-border)] bg-gray-50 dark:bg-[var(--nox-surface)]">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
            noxdev — ship code while you sleep
          </p>
        </div>
      </footer>
    </div>
  )
}