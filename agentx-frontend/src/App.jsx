import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useApp } from './store/AppStore';
import AppShell from './components/layout/AppShell';
import Login from './pages/Login';
import Overview from './pages/Overview';
import NewTask from './pages/NewTask';
import TaskDetail from './pages/TaskDetail';
import AgentWorkspace from './pages/AgentWorkspace';
import WorkflowStudio from './pages/WorkflowStudio';
import TaskHistory from './pages/TaskHistory';
import Memory from './pages/Memory';
import Integrations from './pages/Integrations';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';

function Protected({ children }) {
  const { state } = useApp();
  const loc = useLocation();
  if (!state.user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <Protected>
            <AppShell />
          </Protected>
        }
      >
        <Route index element={<Overview />} />
        <Route path="new" element={<NewTask />} />
        <Route path="agents" element={<AgentWorkspace />} />
        <Route path="workflow" element={<WorkflowStudio />} />
        <Route path="tasks" element={<TaskHistory />} />
        <Route path="tasks/:id" element={<TaskDetail />} />
        <Route path="memory" element={<Memory />} />
        <Route path="integrations" element={<Integrations />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
