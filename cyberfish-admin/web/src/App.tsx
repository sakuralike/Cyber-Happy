import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './store/auth';
import { AppLayout } from './components/AppLayout';
import { RequireAuth, RequirePerm } from './components/Guards';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { AppVersionPage } from './pages/AppVersionPage';
import { ModelPage } from './pages/ModelPage';
import { MisreportPage } from './pages/MisreportPage';
import { AuditLogPage } from './pages/AuditLogPage';
import { AdminPage } from './pages/AdminPage';

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route
              path="/app-versions"
              element={
                <RequirePerm perm="appVersion:read">
                  <AppVersionPage />
                </RequirePerm>
              }
            />
            <Route
              path="/models"
              element={
                <RequirePerm perm="model:read">
                  <ModelPage />
                </RequirePerm>
              }
            />
            <Route
              path="/misreports"
              element={
                <RequirePerm perm="misreport:read">
                  <MisreportPage />
                </RequirePerm>
              }
            />
            <Route path="/audit-logs" element={<AuditLogPage />} />
            <Route
              path="/admins"
              element={
                <RequirePerm perm="admin:read">
                  <AdminPage />
                </RequirePerm>
              }
            />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}
