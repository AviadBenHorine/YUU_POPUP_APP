import { Navigate } from 'react-router-dom'
import { useStore } from '../stores/useStore'
import type { Role } from '../types'

interface Props {
  allowedRoles: Role[]
  children: React.ReactNode
}

export default function ProtectedRoute({ allowedRoles, children }: Props) {
  const currentRole = useStore(s => s.currentRole)
  if (!currentRole) return <Navigate to="/login" replace />
  if (!allowedRoles.includes(currentRole)) return <Navigate to="/login" replace />
  return <>{children}</>
}
