import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { devLogin } from './api'

// Loggar in som ett testkonto utan lösenord och går till kartan (eller profilen, om kontot saknar en).
export function useDevLogin() {
  const { login } = useAuth()
  const navigate = useNavigate()
  return async function loginAs(username) {
    const { access_token, user } = await devLogin(username)
    login(access_token, user)
    navigate('/hem')
  }
}
