import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import { AuthProvider } from './context/AuthContext'
import Contacts from './pages/Contacts'
import WhatsAppConnect from './pages/WhatsAppConnect'
import FlowBuilder from './pages/FlowBuilder'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import Templates from './pages/Templates'
import Broadcast from './pages/Broadcast'
import LiveChat from './pages/LiveChat'
import BotAgents from './pages/BotAgents'
import Settings from './pages/Settings'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,    // 5 min tak cache fresh rahega
      gcTime: 1000 * 60 * 10,      // 10 min tak memory mein rahega
      refetchOnWindowFocus: false,  // Window focus pe refetch nahi
      refetchOnMount: false,        // Baar baar mount pe refetch nahi
      retry: 1,                     // Sirf 1 baar retry
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/" element={<Layout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="whatsapp-connect" element={<WhatsAppConnect />} />
              <Route path="contacts" element={<Contacts />} />
              <Route path="flow-builder" element={<FlowBuilder />} />
              <Route path="templates" element={<Templates />} />
              <Route path="broadcast" element={<Broadcast />} />
              <Route path="live-chat" element={<LiveChat />} />
              <Route path="bot-agents" element={<BotAgents />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}


