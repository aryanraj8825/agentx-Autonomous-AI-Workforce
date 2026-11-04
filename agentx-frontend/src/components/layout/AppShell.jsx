import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ShieldQuestion } from 'lucide-react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import CommandPalette from './CommandPalette';
import { Toaster } from '../ui';
import { useApp, useDerived } from '../../store/AppStore';

export default function AppShell() {
  const { state, dismissToast } = useApp();
  const { awaiting } = useDerived();
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const loc = useLocation();

  useEffect(() => setDrawer(false), [loc.pathname]);
  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  return (
    <div className="min-h-screen bg-bg">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-ink">
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 z-40 hidden lg:block">
        <Sidebar />
      </aside>

      <AnimatePresence>
        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div className="absolute inset-0 bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawer(false)} />
            <motion.div className="absolute inset-y-0 left-0" initial={{ x: -260 }} animate={{ x: 0 }} exit={{ x: -260 }} transition={{ type: 'tween', duration: 0.2 }}>
              <Sidebar onNavigate={() => setDrawer(false)} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="lg:pl-60">
        <Topbar onMenu={() => setDrawer(true)} onSearch={() => setPalette(true)} />
        {awaiting.length > 0 && (
          <div className="border-b border-warn/30 bg-warn/10 px-4 py-2 text-[13px] lg:px-8">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-warn">
              <ShieldQuestion className="h-4 w-4" />
              <span className="font-medium">
                {awaiting.length === 1 ? '1 task is waiting for your approval' : `${awaiting.length} tasks are waiting for your approval`}
              </span>
              <Link to={`/tasks/${awaiting[0].id}`} className="font-semibold underline underline-offset-2">
                Review
              </Link>
            </div>
          </div>
        )}
        <main id="main" className="mx-auto w-full max-w-[1320px] px-4 py-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>

      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <Toaster toasts={state.toasts} onDismiss={dismissToast} />
    </div>
  );
}
