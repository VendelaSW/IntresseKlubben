import { apiGet, apiPost } from '../services/api'

// Testlägets adresser i backend (backend/app/devtools/routes.py).

export function getDevAccounts() {
  return apiGet('/dev/accounts')
}

export function devLogin(username) {
  return apiPost('/dev/login', { username })
}

export function getDevScenarios() {
  return apiGet('/dev/scenarios')
}

export function runDevScenario(name) {
  return apiPost(`/dev/scenarios/${name}`)
}

export function resetDevData() {
  return apiPost('/dev/reset')
}
