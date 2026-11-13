import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
export default function Theme() {
 const [theme, setTheme] = useState(() => { try { return localStorage.getItem('careclaim-theme') === 'dark' ? 'dark' : 'light'; } catch { return 'light'; } });
 useEffect(() => {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#102139' : '#f5f8fd');
  try { localStorage.setItem('careclaim-theme', theme); } catch {}
 }, [theme]);
 return <button className="theme-toggle" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}{theme === 'dark' ? 'Light mode' : 'Dark mode'}</button>;
}
