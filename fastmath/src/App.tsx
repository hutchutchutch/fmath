import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { SessionProvider } from './context/SessionContext';
import { SSOProvider } from './providers/SSOProvider';
import { LoginPage } from './components/Auth/LoginPage';
import { SignupPage } from './components/Auth/SignupPage';
import { SSOCallback } from './components/Auth/SSOCallback';
import { TokenHandler } from './components/TokenHandler';
import { ProtectedRoute } from './components/Auth/ProtectedRoute';
import Dashboard from './components/Dashboard/Dashboard'
import { LearnPage } from './components/Learn/LearnPage';
import { PracticePage } from './components/Learn/PracticePage';
import { TimedPracticePage } from './components/Learn/TimedPracticePage';
import ProgressAssessmentPage from './components/ProgressAssessment/ProgressAssessment';
import { AdminPage } from './components/Admin/admin';
import { AdminDownloadsPage } from './components/Admin/AdminDownloads';
import RosteringPage from './components/Admin/Rostering';
import { CqpmDashboard } from './components/Admin/cqpm/CqpmDashboard';
import AccuracyPracticePage from './components/AccuracyPractice/AccuracyPracticePage';
import FluencyPracticePage from './components/FluencyPractice/FluencyPracticePage';
import CQPMBenchmarkPage from './components/CQPMBenchmark/CQPMBenchmark';
import { DocsPage } from './components/Docs/DocsPage';
import OnboardingAssessments from './components/OnboardingAssessments';
import { SentryUserTracker } from './components/SentryUserTracker';
// Import the progress queue service - this will initialize the queue on load
import './services/ProgressQueueService';

function App() {
    return (
        <Router>
            <SSOProvider>
                <AuthProvider>
                    <SentryUserTracker>
                        <SessionProvider>
                            <TokenHandler>
                            <Routes>
                                <Route path="/" element={
                                    <ProtectedRoute requireAuth={true}>
                                        <Dashboard />
                                    </ProtectedRoute>
                                } />
                                <Route path="/login" element={
                                    <ProtectedRoute requireAuth={false}>
                                        <LoginPage />
                                    </ProtectedRoute>
                                } />
                                <Route path="/signup" element={
                                    <ProtectedRoute requireAuth={false}>
                                        <SignupPage />
                                    </ProtectedRoute>
                                } />
                                <Route path="/auth/callback/cognito" element={<SSOCallback />} />
                                <Route path="/learn" element={
                                    <ProtectedRoute requireAuth={true}>
                                        <LearnPage />
                                    </ProtectedRoute>
                                } />
                                <Route path="/practice" element={
                                    <ProtectedRoute requireAuth={true}>
                                        <PracticePage />
                                    </ProtectedRoute>
                                } />
                                <Route path="/timedpractice" element={
                                    <ProtectedRoute requireAuth={true}>
                                        <TimedPracticePage />
                                    </ProtectedRoute>
                                } />
                                <Route path="/progress-assessment" element={
                                    <ProtectedRoute requireAuth={true}>
                                        <ProgressAssessmentPage />
                                    </ProtectedRoute>
                                } />
                                <Route path="/accuracy-practice" element={
                                    <ProtectedRoute requireAuth={true}>
                                        <AccuracyPracticePage />
                                    </ProtectedRoute>
                                } />
                                <Route path="/fluency-practice" element={
                                    <ProtectedRoute requireAuth={true}>
                                        <FluencyPracticePage />
                                    </ProtectedRoute>
                                } />
                                <Route path="/cqpm-benchmark" element={
                                    <ProtectedRoute requireAuth={true}>
                                        <CQPMBenchmarkPage />
                                    </ProtectedRoute>
                                } />
                                <Route path="/admin" element={
                                    <ProtectedRoute requireAuth={true}>
                                        <AdminPage />
                                    </ProtectedRoute>
                                } />
                                <Route path="/admin/downloads" element={
                                    <ProtectedRoute requireAuth={true}>
                                        <AdminDownloadsPage />
                                    </ProtectedRoute>
                                } />
                                <Route path="/admin/rostering" element={
                                    <ProtectedRoute requireAuth={true}>
                                        <RosteringPage />
                                    </ProtectedRoute>
                                } />
                                <Route path="/admin/cqpm-dashboard" element={
                                    <ProtectedRoute requireAuth={true}>
                                        <CqpmDashboard />
                                    </ProtectedRoute>
                                } />
                                <Route path="/docs" element={<DocsPage />} />
                                <Route path="/onboarding" element={
                                    <ProtectedRoute requireAuth={true}>
                                        <OnboardingAssessments />
                                    </ProtectedRoute>
                                } />
                            </Routes>
                        </TokenHandler>
                    </SessionProvider>
                </SentryUserTracker>
            </AuthProvider>
        </SSOProvider>
        </Router>
    );
}

export default App; 